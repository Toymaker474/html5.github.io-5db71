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

type Route = "instant" | "quality";
type Strategy = "speed" | "balanced" | "quality" | "niche";

type Env = {
  AI: Ai;
  STATS: DurableObjectNamespace;
  PAY_TO: string;
  X402_PRICE?: string;
  X402_NETWORK?: string;
  X402_FACILITATOR_URL?: string;
  AI_MODEL?: string;
  ADMIN_TOKEN?: string;
  GUI_URL?: string;
  GENERATION_STALL_HOURS?: string;
  GENERATION_COLD_START_HOURS?: string;
  GENERATION_MAX_AGE_HOURS?: string;
  GENERATION_TARGET_GROSS_USD?: string;
};

type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

type Genome = {
  id: string;
  strategy: Strategy;
  preferredMode: Mode;
  routePolicy: "instant-first" | "quality-first" | "adaptive";
  temperature: number;
  maxTokens: number;
  mutation: number;
};

type Generation = {
  number: number;
  status: "active";
  bornAt: string;
  lastPaidAt: string | null;
  jobs: number;
  grossUsdEstimate: number;
  genome: Genome;
};

type RetiredGeneration = Omit<Generation, "status"> & {
  status: "retired";
  retiredAt: string;
  retirementReason: string;
};

type EngineState = {
  completedJobs: number;
  modeCounts: Record<string, number>;
  routeCounts: Record<string, number>;
  grossUsdEstimate: number;
  lastJobAt: string | null;
  activeGeneration: Generation;
  history: RetiredGeneration[];
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
    service: "PennySpawn Evolution Engine",
    version: "3.0.0",
    status: "alive",
    legalOnly: true,
    price: priceOf(c.env),
    priceMeaning: "0.01 cent = $0.0001",
    gui: c.env.GUI_URL || "https://toymaker474.github.io/html5.github.io/pennyspawn-ai/",
    routes: {
      earn: "POST /api/earn",
      instant: "POST /api/instant",
      quality: "POST /api/forge",
      evolution: "GET /api/evolution",
      wallet: "GET /api/wallet",
    },
  }),
);

app.get("/health", async (c) => {
  const state = await getState(c.env);
  return c.json({
    ok: true,
    service: "pennyspawn-evolution-engine",
    version: "3.0.0",
    network: networkOf(c.env),
    walletConfigured: isWalletAddress(c.env.PAY_TO || ""),
    model: c.env.AI_MODEL || DEFAULT_MODEL,
    safetyFilter: true,
    agentsOnline: AGENTS.length,
    generation: state.activeGeneration.number,
    genome: state.activeGeneration.genome,
  });
});

app.get("/api/agents", (c) =>
  c.json({
    agents: AGENTS.map((agent) => ({ ...agent, status: "online", autonomousSpending: false })),
    orchestration: ["Shield", "Scout", "Flash or Forge", "Judge", "Wallet", "Ledger", "Darwin", "Reaper", "Seed"],
    limits: {
      externalSelfReplication: false,
      accountCreation: false,
      walletPrivateKeyAccess: false,
      trading: false,
      borrowing: false,
      outgoingPayments: false,
    },
  }),
);

app.get("/api/catalog", (c) =>
  c.json({
    price: priceOf(c.env),
    priceDisplay: "0.01¢ per fulfilled paid request",
    products: [
      { mode: "compress", name: "Prompt Nano-Compress", description: "Turn long instructions into a compact high-information prompt." },
      { mode: "summary", name: "Micro Summary", description: "Create a short factual bullet summary." },
      { mode: "listing", name: "Honest Listing", description: "Produce a clear listing without fake ratings or unsupported claims." },
      { mode: "names", name: "Name Forge", description: "Generate original short project or product names." },
      { mode: "json", name: "JSON Medic", description: "Repair common JSON formatting mistakes." },
    ],
    buyerRequired: true,
    earningsGuaranteed: false,
  }),
);

app.get("/api/info", async (c) => {
  const state = await getState(c.env);
  const payTo = c.env.PAY_TO || "";
  return c.json({
    service: "PennySpawn Evolution Engine",
    version: "3.0.0",
    price: priceOf(c.env),
    priceUsd: priceUsdOf(c.env),
    priceMeaning: "0.01 cent equals $0.0001, not $0.01.",
    network: networkOf(c.env),
    payTo: isWalletAddress(payTo) ? payTo : null,
    receiveOnlyWallet: true,
    modes: MODES,
    completedJobsApproximate: state.completedJobs,
    grossUsdEstimate: state.grossUsdEstimate,
    modeCounts: state.modeCounts,
    routeCounts: state.routeCounts,
    lastJobAt: state.lastJobAt,
    activeGeneration: state.activeGeneration,
    retiredGenerations: state.history.length,
    disclaimer: "This system can sell a service but cannot create demand or guarantee customers, revenue, or profit.",
  });
});

app.get("/api/wallet", async (c) => {
  const state = await getState(c.env);
  const address = c.env.PAY_TO || "";
  return c.json({
    configured: isWalletAddress(address),
    address: isWalletAddress(address) ? address : null,
    network: networkOf(c.env),
    asset: "USDC-compatible x402 settlement",
    receiveOnly: true,
    signingKeyStored: false,
    canSpend: false,
    canTrade: false,
    grossUsdEstimateFromFulfilledJobs: state.grossUsdEstimate,
    balanceSource: "Job ledger estimate, not an on-chain wallet balance query.",
  });
});

app.get("/api/evolution", async (c) => {
  const state = await getState(c.env);
  const now = Date.now();
  const active = state.activeGeneration;
  const reference = active.lastPaidAt || active.bornAt;
  const idleHours = hoursBetween(reference, new Date(now).toISOString());
  return c.json({
    active,
    history: state.history.slice(-10).reverse(),
    policy: policyOf(c.env),
    idleHours: round3(idleHours),
    nextCronCheck: "hourly",
    semantics: "Kill means retire the current strategy genome and start a new in-place generation. The Worker, wallet address, and infrastructure are not deleted or duplicated.",
  });
});

app.post("/api/demo", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const swarm = runFastSwarm(body.mode, body.text);
  if (swarm.blocked) return c.json({ error: "Request blocked", reason: swarm.reason, trace: swarm.trace }, 422);
  return c.json({ ...swarm, ai: false, route: "instant-demo", price: "$0.00" });
});

for (const path of ["/api/earn", "/api/instant", "/api/forge"] as const) {
  app.use(path, preflightSafety);
  app.use(path, ownerConfiguredPaymentGuard);
}

app.post("/api/earn", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const state = await getState(c.env);
  const genome = state.activeGeneration.genome;
  const route = chooseRoute(genome, body.mode, body.text);
  const output = route === "quality" ? await runQualitySwarm(c.env, body.mode, body.text, genome) : runInstant(body.mode, body.text);
  const recorded = await recordJob(c.env, body.mode, route);
  return c.json(buildPaidResponse(c.env, body.mode, route, output, recorded));
});

app.post("/api/instant", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const output = runInstant(body.mode, body.text);
  const recorded = await recordJob(c.env, body.mode, "instant");
  return c.json(buildPaidResponse(c.env, body.mode, "instant", output, recorded));
});

app.post("/api/forge", async (c) => {
  const body = await readJobBody(c);
  if (body instanceof Response) return body;
  const state = await getState(c.env);
  const output = await runQualitySwarm(c.env, body.mode, body.text, state.activeGeneration.genome);
  const recorded = await recordJob(c.env, body.mode, "quality");
  return c.json(buildPaidResponse(c.env, body.mode, "quality", output, recorded));
});

app.post("/api/admin/evolve", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);
  let reason = "Manual owner-requested evolution";
  try {
    const body = (await c.req.json()) as { reason?: string };
    if (typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim().slice(0, 160);
  } catch {
    // Body is optional.
  }
  const result = await evaluateEvolution(c.env, true, reason);
  return c.json(result);
});

app.post("/api/admin/evaluate", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "Unauthorized" }, 401);
  return c.json(await evaluateEvolution(c.env, false, "Manual policy evaluation"));
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => {
  console.error("request failed", { requestId: c.get("requestId"), message: error.message });
  return c.json({ error: "Request failed", requestId: c.get("requestId") }, 500);
});

async function preflightSafety(c: AppContext, next: () => Promise<void>): Promise<Response | void> {
  let input: unknown;
  try {
    input = await c.req.raw.clone().json();
  } catch {
    return c.json({ error: "Body must be JSON" }, 400);
  }
  if (!input || typeof input !== "object") return c.json({ error: "Body must be an object" }, 400);
  const raw = input as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  const mode = typeof raw.mode === "string" ? raw.mode.toLowerCase() : "compress";
  if (!MODES.includes(mode as Mode)) return c.json({ error: `mode must be one of: ${MODES.join(", ")}` }, 400);
  if (!text) return c.json({ error: "text is required" }, 400);
  if (text.length > MAX_INPUT_CHARS) return c.json({ error: `text must be ${MAX_INPUT_CHARS} characters or fewer` }, 413);
  const reason = findBlockedReason(text);
  if (reason) return c.json({ error: "Request blocked before payment", reason }, 422);
  return next();
}

async function ownerConfiguredPaymentGuard(c: AppContext, next: () => Promise<void>): Promise<Response | void> {
  const payTo = c.env.PAY_TO || "";
  if (!isWalletAddress(payTo)) {
    return c.json({ error: "Owner setup required", detail: "PAY_TO must be a public 0x wallet address. Never use a seed phrase or private key." }, 503);
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
  const accepts = [{ scheme: "exact" as const, price, network, payTo: env.PAY_TO }];
  const middleware = paymentMiddleware(
    {
      "POST /api/earn": { accepts, description: "Evolution-selected legal AI microservice", mimeType: "application/json" },
      "POST /api/instant": { accepts, description: "Deterministic legal text microservice", mimeType: "application/json" },
      "POST /api/forge": { accepts, description: "AI-assisted legal text microservice", mimeType: "application/json" },
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

function runInstant(mode: Mode, text: string): QualityRun {
  const swarm = runFastSwarm(mode, text);
  if (swarm.blocked) throw new Error(`Blocked: ${swarm.reason}`);
  return {
    result: swarm.result,
    ai: false,
    model: "deterministic-flash",
    quality: swarm.quality,
    trace: swarm.trace,
    internalProcessingMs: swarm.internalProcessingMs,
  };
}

async function runQualitySwarm(env: Env, mode: Mode, text: string, genome: Genome): Promise<QualityRun> {
  const started = performance.now();
  const trace: AgentTrace[] = [];
  const reason = findBlockedReason(text);
  trace.push({ id: "shield", name: "Shield", role: "safety", status: reason ? "blocked" : "complete", processingMs: 0, note: reason || "No obvious prohibited-use pattern detected." });
  if (reason) throw new Error(`Blocked: ${reason}`);

  trace.push({ id: "scout", name: "Scout", role: "router", status: "complete", processingMs: 0, note: `Generation ${genome.id} selected Forge for ${mode}.` });
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
        { role: "system", content: `${universalSafetyPrompt()}\n\nActive genome: ${JSON.stringify(genome)}\n\n${instructionFor(mode)}` },
        { role: "user", content: text },
      ],
      max_tokens: genome.maxTokens,
      temperature: mode === "json" ? 0.1 : genome.temperature,
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
  const quality = qualityCheck(mode, result);
  trace.push({ id: "judge", name: "Judge", role: "quality", status: quality.passed ? "complete" : "fallback", processingMs: 0, note: quality.checks.join(" · ") });
  return { result, ai, model: usedModel, quality, trace, internalProcessingMs: msSince(started) };
}

function buildPaidResponse(env: Env, mode: Mode, route: Route, output: QualityRun, state: EngineState): Record<string, unknown> {
  return {
    result: output.result,
    mode,
    route,
    ai: output.ai,
    model: output.model,
    agents: output.trace,
    quality: output.quality,
    internalProcessingMs: output.internalProcessingMs,
    paidPrice: priceOf(env),
    completedJobsApproximate: state.completedJobs,
    grossUsdEstimate: state.grossUsdEstimate,
    generation: state.activeGeneration.number,
    genome: state.activeGeneration.genome,
    wallet: { address: env.PAY_TO, receiveOnly: true, privateKeyStored: false },
    truth: "A fulfilled paid request records estimated gross receipts. It does not prove profit, demand, or on-chain wallet balance.",
  };
}

function chooseRoute(genome: Genome, mode: Mode, text: string): Route {
  if (genome.routePolicy === "instant-first") return "instant";
  if (genome.routePolicy === "quality-first") return "quality";
  if (genome.strategy === "niche") return mode === genome.preferredMode ? "quality" : "instant";
  return text.length > 700 || mode === "listing" ? "quality" : "instant";
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

async function getState(env: Env): Promise<EngineState> {
  const response = await statsStub(env).fetch("https://stats.local/info");
  if (!response.ok) throw new Error("Evolution ledger unavailable");
  return (await response.json()) as EngineState;
}

async function recordJob(env: Env, mode: Mode, route: Route): Promise<EngineState> {
  const response = await statsStub(env).fetch("https://stats.local/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, route, priceUsd: priceUsdOf(env) }),
  });
  if (!response.ok) throw new Error("Could not record job");
  return (await response.json()) as EngineState;
}

async function evaluateEvolution(env: Env, force: boolean, reason: string): Promise<Record<string, unknown>> {
  const response = await statsStub(env).fetch("https://stats.local/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force, reason, policy: policyOf(env) }),
  });
  if (!response.ok) throw new Error("Could not evaluate generation");
  return (await response.json()) as Record<string, unknown>;
}

function statsStub(env: Env): DurableObjectStub {
  return env.STATS.get(env.STATS.idFromName("pennyspawn-global-stats"));
}

function policyOf(env: Env) {
  return {
    stallHours: positiveNumber(env.GENERATION_STALL_HOURS, 24),
    coldStartHours: positiveNumber(env.GENERATION_COLD_START_HOURS, 72),
    maxAgeHours: positiveNumber(env.GENERATION_MAX_AGE_HOURS, 168),
    targetGrossUsd: nonNegativeNumber(env.GENERATION_TARGET_GROSS_USD, 0.001),
  };
}

function priceOf(env: Env): string {
  const candidate = env.X402_PRICE?.trim() || "$0.0001";
  return /^\$\d+(?:\.\d{1,6})?$/.test(candidate) ? candidate : "$0.0001";
}

function priceUsdOf(env: Env): number {
  const value = Number.parseFloat(priceOf(env).replace("$", ""));
  return Number.isFinite(value) && value >= 0 ? value : 0.0001;
}

function networkOf(env: Env): string {
  return env.X402_NETWORK || "eip155:84532";
}

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isAdmin(c: { env: Env; req: { header(name: string): string | undefined } }): boolean {
  const configured = c.env.ADMIN_TOKEN;
  return Boolean(configured) && c.req.header("Authorization") === `Bearer ${configured}`;
}

function msSince(start: number): number {
  return round3(performance.now() - start);
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function hoursBetween(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
}

function newGenome(generation: number, modeCounts: Record<string, number>, previous?: Genome): Genome {
  const bestMode = (Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || previous?.preferredMode || "compress") as Mode;
  const profiles: Array<Omit<Genome, "id" | "mutation" | "preferredMode">> = [
    { strategy: "speed", routePolicy: "instant-first", temperature: 0.2, maxTokens: 160 },
    { strategy: "balanced", routePolicy: "adaptive", temperature: 0.4, maxTokens: 220 },
    { strategy: "quality", routePolicy: "quality-first", temperature: 0.55, maxTokens: 320 },
    { strategy: "niche", routePolicy: "adaptive", temperature: 0.35, maxTokens: 240 },
  ];
  const profile = profiles[(generation - 1) % profiles.length];
  return {
    id: `GEN-${String(generation).padStart(4, "0")}`,
    ...profile,
    preferredMode: bestMode,
    mutation: previous ? previous.mutation + 1 : 0,
  };
}

function initialState(now = new Date().toISOString()): EngineState {
  return {
    completedJobs: 0,
    modeCounts: {},
    routeCounts: {},
    grossUsdEstimate: 0,
    lastJobAt: null,
    activeGeneration: {
      number: 1,
      status: "active",
      bornAt: now,
      lastPaidAt: null,
      jobs: 0,
      grossUsdEstimate: 0,
      genome: newGenome(1, {}),
    },
    history: [],
  };
}

function normalizeState(value: unknown): EngineState {
  const now = new Date().toISOString();
  if (!value || typeof value !== "object") return initialState(now);
  const raw = value as Partial<EngineState> & { activeGeneration?: Partial<Generation> };
  const base = initialState(now);
  const completedJobs = typeof raw.completedJobs === "number" ? raw.completedJobs : 0;
  const modeCounts = raw.modeCounts && typeof raw.modeCounts === "object" ? raw.modeCounts : {};
  const routeCounts = raw.routeCounts && typeof raw.routeCounts === "object" ? raw.routeCounts : {};
  const grossUsdEstimate = typeof raw.grossUsdEstimate === "number" ? raw.grossUsdEstimate : 0;
  const lastJobAt = typeof raw.lastJobAt === "string" ? raw.lastJobAt : null;
  if (!raw.activeGeneration || typeof raw.activeGeneration !== "object") {
    return {
      ...base,
      completedJobs,
      modeCounts,
      routeCounts,
      grossUsdEstimate,
      lastJobAt,
    };
  }
  const number = typeof raw.activeGeneration.number === "number" && raw.activeGeneration.number > 0 ? raw.activeGeneration.number : 1;
  return {
    completedJobs,
    modeCounts,
    routeCounts,
    grossUsdEstimate,
    lastJobAt,
    activeGeneration: {
      number,
      status: "active",
      bornAt: typeof raw.activeGeneration.bornAt === "string" ? raw.activeGeneration.bornAt : now,
      lastPaidAt: typeof raw.activeGeneration.lastPaidAt === "string" ? raw.activeGeneration.lastPaidAt : null,
      jobs: typeof raw.activeGeneration.jobs === "number" ? raw.activeGeneration.jobs : 0,
      grossUsdEstimate: typeof raw.activeGeneration.grossUsdEstimate === "number" ? raw.activeGeneration.grossUsdEstimate : 0,
      genome: raw.activeGeneration.genome && typeof raw.activeGeneration.genome === "object" ? (raw.activeGeneration.genome as Genome) : newGenome(number, modeCounts),
    },
    history: Array.isArray(raw.history) ? raw.history.slice(-20) : [],
  };
}

export class StatsObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const current = normalizeState(await this.state.storage.get<unknown>("stats"));

    if (request.method === "GET" && url.pathname === "/info") return Response.json(current);

    if (request.method === "POST" && url.pathname === "/record") {
      const input = (await request.json()) as { mode?: string; route?: string; priceUsd?: number };
      const mode = typeof input.mode === "string" && MODES.includes(input.mode as Mode) ? input.mode : "unknown";
      const route: Route = input.route === "quality" ? "quality" : "instant";
      const priceUsd = typeof input.priceUsd === "number" && Number.isFinite(input.priceUsd) && input.priceUsd >= 0 ? input.priceUsd : 0.0001;
      const now = new Date().toISOString();
      current.completedJobs += 1;
      current.modeCounts[mode] = (current.modeCounts[mode] || 0) + 1;
      current.routeCounts[route] = (current.routeCounts[route] || 0) + 1;
      current.grossUsdEstimate = Number((current.grossUsdEstimate + priceUsd).toFixed(6));
      current.lastJobAt = now;
      current.activeGeneration.jobs += 1;
      current.activeGeneration.grossUsdEstimate = Number((current.activeGeneration.grossUsdEstimate + priceUsd).toFixed(6));
      current.activeGeneration.lastPaidAt = now;
      await this.state.storage.put("stats", current);
      return Response.json(current);
    }

    if (request.method === "POST" && url.pathname === "/evaluate") {
      const input = (await request.json()) as {
        force?: boolean;
        reason?: string;
        policy?: { stallHours?: number; coldStartHours?: number; maxAgeHours?: number; targetGrossUsd?: number };
      };
      const now = new Date().toISOString();
      const active = current.activeGeneration;
      const policy = {
        stallHours: input.policy?.stallHours ?? 24,
        coldStartHours: input.policy?.coldStartHours ?? 72,
        maxAgeHours: input.policy?.maxAgeHours ?? 168,
        targetGrossUsd: input.policy?.targetGrossUsd ?? 0.001,
      };
      const ageHours = hoursBetween(active.bornAt, now);
      const idleHours = hoursBetween(active.lastPaidAt || active.bornAt, now);
      const coldStartFailure = active.jobs === 0 && ageHours >= policy.coldStartHours;
      const stalledAfterSales = active.jobs > 0 && idleHours >= policy.stallHours;
      const agedUnderTarget = ageHours >= policy.maxAgeHours && active.grossUsdEstimate < policy.targetGrossUsd;
      const shouldRetire = Boolean(input.force) || coldStartFailure || stalledAfterSales || agedUnderTarget;

      if (!shouldRetire) {
        return Response.json({ evolved: false, active, ageHours: round3(ageHours), idleHours: round3(idleHours), policy });
      }

      const retirementReason = input.force
        ? input.reason || "Manual owner-requested evolution"
        : coldStartFailure
          ? `No paid jobs during ${policy.coldStartHours}-hour cold-start window`
          : stalledAfterSales
            ? `No paid jobs for ${policy.stallHours} hours`
            : `Generation remained below $${policy.targetGrossUsd} gross after ${policy.maxAgeHours} hours`;

      const retired: RetiredGeneration = {
        ...active,
        status: "retired",
        retiredAt: now,
        retirementReason,
      };
      current.history = [...current.history, retired].slice(-20);
      const nextNumber = active.number + 1;
      current.activeGeneration = {
        number: nextNumber,
        status: "active",
        bornAt: now,
        lastPaidAt: null,
        jobs: 0,
        grossUsdEstimate: 0,
        genome: newGenome(nextNumber, current.modeCounts, active.genome),
      };
      await this.state.storage.put("stats", current);
      return Response.json({ evolved: true, retired, active: current.activeGeneration, policy });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(evaluateEvolution(env, false, "Hourly scheduled evaluation").then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
