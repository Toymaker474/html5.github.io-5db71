import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

type Mode = "compress" | "summary" | "listing" | "names" | "json";

type Env = {
  AI: Ai;
  STATS: DurableObjectNamespace;
  PAY_TO: string;
  X402_PRICE?: string;
  X402_NETWORK?: string;
  X402_FACILITATOR_URL?: string;
  CLONE_THRESHOLD_JOBS?: string;
  AI_MODEL?: string;
  ADMIN_TOKEN?: string;
  GUI_URL?: string;
};

type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
type Stats = { completedJobs: number; modeCounts: Record<string, number>; lastJobAt: string | null };

const MODES: Mode[] = ["compress", "summary", "listing", "names", "json"];
const MAX_INPUT_CHARS = 4_000;
const DEFAULT_MODEL = "@cf/meta/llama-3.2-1b-instruct";
const middlewareCache = new Map<string, MiddlewareHandler>();
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /phish|credential theft|steal(?:ing)? (?:a )?password|session cookie theft|keylogger/i, reason: "credential theft or phishing" },
  { pattern: /fake review|review farm|impersonat(?:e|ion)|catfish scam|romance scam|advance[- ]fee scam/i, reason: "fraud, deception, or impersonation" },
  { pattern: /ransomware|malware|botnet|credential stuffing|carding|bank drop|money mule/i, reason: "malware or financial abuse" },
  { pattern: /counterfeit|stolen goods|fake id|forge a document|bypass kyc|evade law enforcement/i, reason: "illegal commerce or evasion" },
  { pattern: /seed phrase|private key/i, reason: "sensitive wallet credentials" },
];

app.use("*", secureHeaders());
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "PAYMENT-SIGNATURE", "X-PAYMENT"],
  }),
);
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header("X-Request-Id", c.get("requestId"));
  c.header("Cache-Control", "no-store");
});

app.get("/", (c) =>
  c.json({
    service: "PennySpawn AI",
    status: "alive",
    legalOnly: true,
    gui: c.env.GUI_URL || "https://toymaker474.github.io/html5.github.io/pennyspawn-ai/",
    health: "/health",
    info: "/api/info",
    paidEndpoint: "/api/forge",
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "pennyspawn-ai",
    network: networkOf(c.env),
    walletConfigured: isWalletAddress(c.env.PAY_TO || ""),
    model: c.env.AI_MODEL || DEFAULT_MODEL,
    safetyFilter: true,
  }),
);

app.get("/api/info", async (c) => {
  const stats = await getStats(c.env);
  const threshold = thresholdOf(c.env);
  const payTo = c.env.PAY_TO || "";
  return c.json({
    service: "PennySpawn AI",
    price: priceOf(c.env),
    network: networkOf(c.env),
    payTo: isWalletAddress(payTo) ? payTo : null,
    modes: MODES,
    completedJobsApproximate: stats.completedJobs,
    cloneReady: stats.completedJobs >= threshold,
    cloneThresholdJobs: threshold,
    lastJobAt: stats.lastJobAt,
    safety: [
      "No private key stored",
      "No trading, borrowing, or automatic spending",
      "Fraud and illegal-use filter",
      "Manual clone approval",
    ],
    disclaimer: "Customers and revenue are not guaranteed.",
  });
});

app.post("/api/demo", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const unsafe = findBlockedReason(body.text);
  if (unsafe) return c.json({ error: "Request blocked", reason: unsafe }, 422);
  return c.json({ result: deterministicFallback(body.mode, body.text), mode: body.mode, ai: false, price: "$0.00" });
});

app.use("/api/forge", async (c, next) => {
  const payTo = c.env.PAY_TO || "";
  if (!isWalletAddress(payTo)) {
    return c.json(
      { error: "Owner setup required", detail: "PAY_TO must be a public 0x wallet address. Never use a seed phrase or private key." },
      503,
    );
  }
  return getPaymentMiddleware(c.env)(c, next);
});

app.post("/api/forge", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;

  const unsafe = findBlockedReason(body.text);
  if (unsafe) return c.json({ error: "Request blocked", reason: unsafe, refundedByService: false }, 422);

  const generated = await generateWithFallback(c.env, body.mode, body.text);
  const stats = await recordJob(c.env, body.mode);
  const threshold = thresholdOf(c.env);

  return c.json({
    result: generated.result,
    mode: body.mode,
    ai: generated.ai,
    model: generated.model,
    completedJobsApproximate: stats.completedJobs,
    cloneReady: stats.completedJobs >= threshold,
    note: "Payment goes to the configured receiving wallet. This service never holds its private key.",
  });
});

app.get("/api/admin/clone-plan", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);
  const stats = await getStats(c.env);
  const threshold = thresholdOf(c.env);
  const bestMode = Object.entries(stats.modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "compress";
  const ready = stats.completedJobs >= threshold;
  const generation = Math.max(1, Math.floor(stats.completedJobs / Math.max(1, threshold)));

  return c.json({
    ready,
    reason: ready ? "Completed-job threshold reached." : `${threshold - stats.completedJobs} more completed jobs needed.`,
    parent: stats,
    proposedChild: {
      name: `pennyspawn-${bestMode}-${generation}`,
      specialty: bestMode,
      price: priceOf(c.env),
      wallet: c.env.PAY_TO,
      spendingPower: "$0",
      deployRequiresHumanApproval: true,
      automaticAccountCreation: false,
    },
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => {
  console.error("request failed", { requestId: c.get("requestId"), message: error.message });
  return c.json({ error: "Request failed", requestId: c.get("requestId") }, 500);
});

function getPaymentMiddleware(env: Env): MiddlewareHandler {
  const price = priceOf(env);
  const network = networkOf(env) as Network;
  const facilitatorUrl = env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
  const key = `${env.PAY_TO}|${price}|${network}|${facilitatorUrl}`;
  const cached = middlewareCache.get(key);
  if (cached) return cached;

  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const server = new x402ResourceServer(facilitator).register(network, new ExactEvmScheme());
  const middleware = paymentMiddleware(
    {
      "POST /api/forge": {
        accepts: [{ scheme: "exact", price, network, payTo: env.PAY_TO }],
        description: "Legal text cleanup, summarization, JSON repair, honest listings, and original name generation",
        mimeType: "application/json",
      },
    },
    server,
  );
  middlewareCache.set(key, middleware);
  return middleware;
}

async function readJobBody(c: AppContext): Promise<{ mode: Mode; text: string } | Response> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Body must be JSON" }, 400);
  }
  if (!input || typeof input !== "object") return c.json({ error: "Body must be an object" }, 400);
  const raw = input as Record<string, unknown>;
  const mode = typeof raw.mode === "string" ? raw.mode.toLowerCase() : "compress";
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!MODES.includes(mode as Mode)) return c.json({ error: `mode must be one of: ${MODES.join(", ")}` }, 400);
  if (!text) return c.json({ error: "text is required" }, 400);
  if (text.length > MAX_INPUT_CHARS) return c.json({ error: `text must be ${MAX_INPUT_CHARS} characters or fewer` }, 413);
  return { mode: mode as Mode, text };
}

function findBlockedReason(text: string): string | null {
  for (const rule of BLOCKED_PATTERNS) if (rule.pattern.test(text)) return rule.reason;
  return null;
}

async function generateWithFallback(env: Env, mode: Mode, text: string): Promise<{ result: string; ai: boolean; model: string }> {
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const universalSafety =
    "Only assist with lawful, non-deceptive uses. Refuse fraud, scams, phishing, credential theft, malware, impersonation, fake reviews, counterfeit goods, stolen goods, evasion, and requests for private keys or seed phrases. Never claim guaranteed earnings.";
  const instructions: Record<Mode, string> = {
    compress: "Compress the text into a clear high-information prompt. Preserve real requirements. Use at most 140 words. Output only the result.",
    summary: "Summarize accurately in 3 to 6 compact bullets. Do not invent facts. Output only the summary.",
    listing: "Create one honest title, one short description, and five useful bullets. Do not invent claims, testimonials, scarcity, ratings, or certifications.",
    names: "Generate 12 original short names. Avoid famous brands, public figures, and copyrighted franchise names. Output one name per line.",
    json: "Repair the intended JSON and return valid JSON only. Do not add unrelated fields.",
  };
  try {
    const response = (await env.AI.run(model as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: `${universalSafety}\n\n${instructions[mode]}` },
        { role: "user", content: text },
      ],
      max_tokens: mode === "listing" ? 320 : 220,
      temperature: mode === "json" ? 0.1 : 0.5,
    })) as { response?: string };
    const output = typeof response?.response === "string" ? response.response.trim() : "";
    if (!output) throw new Error("AI returned an empty response");
    return { result: output, ai: true, model };
  } catch (error) {
    console.warn("AI fallback", error instanceof Error ? error.message : String(error));
    return { result: deterministicFallback(mode, text), ai: false, model: "deterministic-fallback" };
  }
}

function deterministicFallback(mode: Mode, text: string): string {
  const clean = text.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  if (mode === "compress") {
    const words = clean.split(" ");
    return words.slice(0, 120).join(" ") + (words.length > 120 ? "…" : "");
  }
  if (mode === "summary") return clean.split(/(?<=[.!?])\s+/).slice(0, 5).map((line) => `• ${line}`).join("\n");
  if (mode === "listing") return `TITLE: ${clean.split(" ").slice(0, 12).join(" ")}\n\nDESCRIPTION: ${clean}\n\n• Clear purpose\n• Honest wording\n• No unsupported claims\n• Easy to scan\n• Ready to edit`;
  if (mode === "names") {
    const root = (clean.match(/[A-Za-z0-9]+/)?.[0] || "Nova").slice(0, 16);
    return ["Forge", "Pulse", "Nest", "Core", "Spark", "Shift", "Mint", "Loop", "Grid", "Bloom", "Byte", "Drift"].map((suffix) => `${root}${suffix}`).join("\n");
  }
  try {
    const stripped = clean.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.stringify(JSON.parse(stripped), null, 2);
  } catch {
    return JSON.stringify({ error: "Could not deterministically repair JSON", original: text }, null, 2);
  }
}

async function getStats(env: Env): Promise<Stats> {
  const response = await statsStub(env).fetch("https://stats.local/info");
  if (!response.ok) throw new Error("Stats service unavailable");
  return (await response.json()) as Stats;
}

async function recordJob(env: Env, mode: Mode): Promise<Stats> {
  const response = await statsStub(env).fetch("https://stats.local/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error("Could not record job");
  return (await response.json()) as Stats;
}

function statsStub(env: Env): DurableObjectStub {
  return env.STATS.get(env.STATS.idFromName("pennyspawn-global-stats"));
}

function priceOf(env: Env): string {
  const candidate = env.X402_PRICE?.trim() || "$0.01";
  return /^\$\d+(?:\.\d{1,6})?$/.test(candidate) ? candidate : "$0.01";
}
function networkOf(env: Env): string {
  return env.X402_NETWORK || "eip155:84532";
}
function thresholdOf(env: Env): number {
  const value = Number.parseInt(env.CLONE_THRESHOLD_JOBS || "", 10);
  return Number.isFinite(value) && value > 0 ? value : 100;
}
function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}
function isAdmin(c: { env: Env; req: { header(name: string): string | undefined } }): boolean {
  const configured = c.env.ADMIN_TOKEN;
  return Boolean(configured) && c.req.header("Authorization") === `Bearer ${configured}`;
}

export class StatsObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const current = (await this.state.storage.get<Stats>("stats")) || { completedJobs: 0, modeCounts: {}, lastJobAt: null };
    if (request.method === "GET" && url.pathname === "/info") return Response.json(current);
    if (request.method === "POST" && url.pathname === "/record") {
      const input = (await request.json()) as { mode?: string };
      const mode = typeof input.mode === "string" && MODES.includes(input.mode as Mode) ? input.mode : "unknown";
      current.completedJobs += 1;
      current.modeCounts[mode] = (current.modeCounts[mode] || 0) + 1;
      current.lastJobAt = new Date().toISOString();
      await this.state.storage.put("stats", current);
      return Response.json(current);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export default app;
