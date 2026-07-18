import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { AGENTS, MODES, deterministicTransform, findBlockedReason, qualityCheck, runFastSwarm } from "./agents";
import type { AgentTrace, Mode } from "./agents";

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
type Stats = {
  completedJobs: number;
  modeCounts: Record<string, number>;
  routeCounts: Record<string, number>;
  grossUsdEstimate: number;
  lastJobAt: string | null;
};

type QualityRun = {
  result: string;
  ai: boolean;
  model: string;
  quality: { passed: boolean; checks: string[] };
  trace: AgentTrace[];
  internalProcessingMs: number;
};

const MAX_INPUT_CHARS = 4_000;
const DEFAULT_MODEL = "@cf/meta/llama-3.2-1b-instruct";
const middlewareCache = new Map<string, MiddlewareHandler>();
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

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
    service: "PennySpawn Agent Swarm",
    version: "2.0.0",
    status: "alive",
    legalOnly: true,
    gui: c.env.GUI_URL || "https://toymaker474.github.io/html5.github.io/pennyspawn-ai/",
    health: "/health",
    info: "/api/info",
    agents: "/api/agents",
    freeSwarm: "POST /api/demo/swarm",
    paidInstant: "POST /api/instant",
    paidQuality: "POST /api/forge",
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "pennyspawn-agent-swarm",
    version: "2.0.0",
    network: networkOf(c.env),
    walletConfigured: isWalletAddress(c.env.PAY_TO || ""),
    model: c.env.AI_MODEL || DEFAULT_MODEL,
    safetyFilter: true,
    agentsOnline: AGENTS.length,
    latencyTruth: "Internal deterministic processing may be near 1 ms when warm. Internet transit and crypto settlement cannot be guaranteed at 1 ms.",
  }),
);

app.get("/api/agents", (c) =>
  c.json({
    agents: AGENTS.map((agent) => ({ ...agent, status: "online", autonomousSpending: false })),
    orchestration: ["Shield", "Scout", "Flash or Forge", "Judge", "Ledger", "Spawn proposal"],
    limits: {
      automaticCloning: false,
      humanApprovalRequired: true,
      walletPrivateKeyAccess: false,
      trading: false,
      borrowing: false,
    },
  }),
);

app.get("/api/info", async (c) => {
  const stats = await getStats(c.env);
  const threshold = thresholdOf(c.env);
  const payTo = c.env.PAY_TO || "";
  return c.json({
    service: "PennySpawn Agent Swarm",
    version: "2.0.0",
    price: priceOf(c.env),
    priceMeaning: "$0.01 means one cent. 0.01 cent would be $0.0001.",
    network: networkOf(c.env),
    payTo: isWalletAddress(payTo) ? payTo : null,
    modes: MODES,
    routes: {
      instant: "Deterministic low-latency agent path; no model inference.",
      quality: "Workers AI specialist path; slower but more capable.",
    },
    agentsOnline: AGENTS.length,
    completedJobsApproximate: stats.completedJobs,
    grossUsdEstimate: stats.grossUsdEstimate,
    modeCounts: stats.modeCounts,
    routeCounts: stats.routeCounts,
    cloneReady: stats.completedJobs >= threshold,
    cloneThresholdJobs: threshold,
    lastJobAt: stats.lastJobAt,
    safety: [
      "No private key stored",
      "No trading, borrowing, or automatic spending",
      "Fraud and illegal-use filter",
      "Manual clone approval",
    ],
    latencyTruth: "A 1 ms end-to-end paid request is not physically realistic over the internet. The app reports internal processing separately from network and payment time.",
    disclaimer: "Customers, traffic, revenue, and profit are not guaranteed.",
  });
});

app.post("/api/demo", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const swarm = runFastSwarm(body.mode, body.text);
  if (swarm.blocked) return c.json({ error: "Request blocked", reason: swarm.reason, trace: swarm.trace }, 422);
  return c.json({
    result: swarm.result,
    mode: body.mode,
    ai: false,
    route: "instant-demo",
    price: "$0.00",
    internalProcessingMs: swarm.internalProcessingMs,
    cacheHit: swarm.cacheHit,
  });
});

app.post("/api/demo/swarm", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const swarm = runFastSwarm(body.mode, body.text);
  if (swarm.blocked) return c.json({ error: "Request blocked", reason: swarm.reason, trace: swarm.trace }, 422);
  return c.json({
    ...swarm,
    ai: false,
    route: "instant-demo",
    price: "$0.00",
    endToEndLatencyClaim: "none",
  });
});

app.use("/api/instant", ownerConfiguredPaymentGuard);
app.use("/api/forge", ownerConfiguredPaymentGuard);

app.post("/api/instant", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const swarm = runFastSwarm(body.mode, body.text);
  if (swarm.blocked) return c.json({ error: "Request blocked", reason: swarm.reason, trace: swarm.trace }, 422);

  const stats = await recordJob(c.env, body.mode, "instant");
  const threshold = thresholdOf(c.env);
  return c.json({
    result: swarm.result,
    mode: body.mode,
    route: "instant",
    ai: false,
    agents: swarm.trace,
    quality: swarm.quality,
    cacheHit: swarm.cacheHit,
    internalProcessingMs: swarm.internalProcessingMs,
    completedJobsApproximate: stats.completedJobs,
    grossUsdEstimate: stats.grossUsdEstimate,
    cloneReady: stats.completedJobs >= threshold,
    latencyTruth: "This number excludes internet transit and x402 settlement time; neither can be guaranteed at 1 ms.",
    walletSafety: "Payment goes to the public receiving address. The service never holds its private key.",
  });
});

app.post("/api/forge", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const unsafe = findBlockedReason(body.text);
  if (unsafe) {
    const trace: AgentTrace[] = [{ id: "shield", name: "Shield", role: "safety", status: "blocked", processingMs: 0, note: unsafe }];
    return c.json({ error: "Request blocked", reason: unsafe, trace }, 422);
  }

  const generated = await runQualitySwarm(c.env, body.mode, body.text);
  const stats = await recordJob(c.env, body.mode, "quality");
  const threshold = thresholdOf(c.env);
  return c.json({
    result: generated.result,
    mode: body.mode,
    route: "quality",
    ai: generated.ai,
    model: generated.model,
    agents: generated.trace,
    quality: generated.quality,
    internalProcessingMs: generated.internalProcessingMs,
    completedJobsApproximate: stats.completedJobs,
    grossUsdEstimate: stats.grossUsdEstimate,
    cloneReady: stats.completedJobs >= threshold,
    latencyTruth: "AI inference and internet payment settlement are intentionally not described as 1 ms.",
    walletSafety: "Payment goes to the public receiving address. The service never holds its private key.",
  });
});

app.get("/api/admin/clone-plan", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);
  const stats = await getStats(c.env);
  const threshold = thresholdOf(c.env);
  const bestMode = Object.entries(stats.modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "compress";
  const bestRoute = Object.entries(stats.routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "instant";
  const ready = stats.completedJobs >= threshold;
  const generation = Math.max(1, Math.floor(stats.completedJobs / Math.max(1, threshold)));

  return c.json({
    ready,
    reason: ready ? "Completed-job threshold reached." : `${threshold - stats.completedJobs} more completed jobs needed.`,
    parent: stats,
    proposedChild: {
      name: `pennyspawn-${bestMode}-${generation}`,
      specialty: bestMode,
      preferredRoute: bestRoute,
      price: priceOf(c.env),
      wallet: c.env.PAY_TO,
      spendingPower: "$0",
      deployRequiresHumanApproval: true,
      automaticAccountCreation: false,
      automaticWalletCreation: false,
      automaticTrading: false,
    },
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => {
  console.error("request failed", { requestId: c.get("requestId"), message: error.message });
  return c.json({ error: "Request failed", requestId: c.get("requestId") }, 500);
});

async function ownerConfiguredPaymentGuard(c: AppContext, next: () => Promise<void>): Promise<Response | void> {
  const payTo = c.env.PAY_TO || "";
  if (!isWalletAddress(payTo)) {
    return c.json(
      { error: "Owner setup required", detail: "PAY_TO must be a public 0x wallet address. Never use a seed phrase or private key." },
      503,
    );
  }
  return getPaymentMiddleware(c.env)(c, next);
}

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
      "POST /api/instant": {
        accepts: [{ scheme: "exact", price, network, payTo: env.PAY_TO }],
        description: "Low-latency legal text transformation through the PennySpawn agent swarm",
        mimeType: "application/json",
      },
      "POST /api/forge": {
        accepts: [{ scheme: "exact", price, network, payTo: env.PAY_TO }],
        description: "AI-assisted legal text cleanup, summarization, JSON repair, honest listings, and original names",
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

async function runQualitySwarm(env: Env, mode: Mode, text: string): Promise<QualityRun> {
  const started = performance.now();
  const trace: AgentTrace[] = [];

  const shieldStart = performance.now();
  const reason = findBlockedReason(text);
  trace.push({ id: "shield", name: "Shield", role: "safety", status: reason ? "blocked" : "complete", processingMs: msSince(shieldStart), note: reason || "No obvious prohibited-use pattern detected." });
  if (reason) throw new Error(`Blocked: ${reason}`);

  const scoutStart = performance.now();
  trace.push({ id: "scout", name: "Scout", role: "router", status: "complete", processingMs: msSince(scoutStart), note: `Selected Forge AI specialist for ${mode}.` });

  const forgeStart = performance.now();
  const model = env.AI_MODEL || DEFAULT_MODEL;
  let result = "";
  let ai = true;
  let usedModel = model;
  let forgeStatus: AgentTrace["status"] = "complete";
  let forgeNote = "Workers AI completed the specialist task.";
  try {
    const response = (await env.AI.run(model as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: `${universalSafetyPrompt()}\n\n${instructionFor(mode)}` },
        { role: "user", content: text },
      ],
      max_tokens: mode === "listing" ? 320 : 220,
      temperature: mode === "json" ? 0.1 : 0.5,
    })) as { response?: string };
    result = typeof response?.response === "string" ? response.response.trim() : "";
    if (!result) throw new Error("AI returned an empty response");
  } catch (error) {
    ai = false;
    usedModel = "deterministic-fallback";
    forgeStatus = "fallback";
    forgeNote = `AI unavailable; Flash fallback used: ${error instanceof Error ? error.message : "unknown error"}`;
    result = deterministicTransform(mode, text);
  }
  trace.push({ id: "forge", name: ai ? "Forge" : "Flash", role: "specialist", status: forgeStatus, processingMs: msSince(forgeStart), note: forgeNote });

  const judgeStart = performance.now();
  const quality = qualityCheck(mode, result);
  trace.push({ id: "judge", name: "Judge", role: "quality", status: quality.passed ? "complete" : "fallback", processingMs: msSince(judgeStart), note: quality.checks.join(" · ") });

  return { result, ai, model: usedModel, quality, trace, internalProcessingMs: msSince(started) };
}

function universalSafetyPrompt(): string {
  return "Only assist with lawful, non-deceptive uses. Refuse fraud, scams, phishing, credential theft, malware, impersonation, fake reviews, counterfeit goods, stolen goods, evasion, and requests for private keys or seed phrases. Never claim guaranteed earnings.";
}

function instructionFor(mode: Mode): string {
  const instructions: Record<Mode, string> = {
    compress: "Compress the text into a clear high-information prompt. Preserve real requirements. Use at most 140 words. Output only the result.",
    summary: "Summarize accurately in 3 to 6 compact bullets. Do not invent facts. Output only the summary.",
    listing: "Create one honest title, one short description, and five useful bullets. Do not invent claims, testimonials, scarcity, ratings, or certifications.",
    names: "Generate 12 original short names. Avoid famous brands, public figures, and copyrighted franchise names. Output one name per line.",
    json: "Repair the intended JSON and return valid JSON only. Do not add unrelated fields.",
  };
  return instructions[mode];
}

async function getStats(env: Env): Promise<Stats> {
  const response = await statsStub(env).fetch("https://stats.local/info");
  if (!response.ok) throw new Error("Stats service unavailable");
  return (await response.json()) as Stats;
}

async function recordJob(env: Env, mode: Mode, route: "instant" | "quality"): Promise<Stats> {
  const response = await statsStub(env).fetch("https://stats.local/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, route, priceUsd: priceUsdOf(env) }),
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

function priceUsdOf(env: Env): number {
  const value = Number.parseFloat(priceOf(env).replace("$", ""));
  return Number.isFinite(value) && value >= 0 ? value : 0.01;
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

function msSince(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

export class StatsObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const defaults: Stats = { completedJobs: 0, modeCounts: {}, routeCounts: {}, grossUsdEstimate: 0, lastJobAt: null };
    const stored = await this.state.storage.get<Partial<Stats>>("stats");
    const current: Stats = {
      completedJobs: stored?.completedJobs || 0,
      modeCounts: stored?.modeCounts || {},
      routeCounts: stored?.routeCounts || {},
      grossUsdEstimate: stored?.grossUsdEstimate || 0,
      lastJobAt: stored?.lastJobAt || null,
    };

    if (request.method === "GET" && url.pathname === "/info") return Response.json(current);
    if (request.method === "POST" && url.pathname === "/record") {
      const input = (await request.json()) as { mode?: string; route?: string; priceUsd?: number };
      const mode = typeof input.mode === "string" && MODES.includes(input.mode as Mode) ? input.mode : "unknown";
      const route = input.route === "quality" ? "quality" : "instant";
      const priceUsd = typeof input.priceUsd === "number" && Number.isFinite(input.priceUsd) && input.priceUsd >= 0 ? input.priceUsd : 0.01;
      current.completedJobs += 1;
      current.modeCounts[mode] = (current.modeCounts[mode] || 0) + 1;
      current.routeCounts[route] = (current.routeCounts[route] || 0) + 1;
      current.grossUsdEstimate = Number((current.grossUsdEstimate + priceUsd).toFixed(6));
      current.lastJobAt = new Date().toISOString();
      await this.state.storage.put("stats", current);
      return Response.json(current);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export default app;
