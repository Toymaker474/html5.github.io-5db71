export type Mode = "compress" | "summary" | "listing" | "names" | "json";

export type AgentTrace = {
  id: string;
  name: string;
  role: string;
  status: "complete" | "blocked" | "fallback";
  processingMs: number;
  note: string;
};

export type SwarmResult = {
  result: string;
  mode: Mode;
  blocked: boolean;
  reason: string | null;
  quality: { passed: boolean; checks: string[] };
  trace: AgentTrace[];
  internalProcessingMs: number;
  cacheHit: boolean;
};

export const MODES: Mode[] = ["compress", "summary", "listing", "names", "json"];

export const AGENTS = [
  { id: "shield", name: "Shield", emoji: "🛡️", role: "Blocks obvious scams, fraud, malware, theft, evasion, and wallet-secret requests.", spendingPower: "$0" },
  { id: "scout", name: "Scout", emoji: "🧭", role: "Routes each request to the smallest suitable specialist.", spendingPower: "$0" },
  { id: "flash", name: "Flash", emoji: "⚡", role: "Runs deterministic low-latency transformations without model inference.", spendingPower: "$0" },
  { id: "forge", name: "Forge", emoji: "🧠", role: "Uses Workers AI for higher-quality text work when quality mode is selected.", spendingPower: "$0" },
  { id: "judge", name: "Judge", emoji: "✅", role: "Checks non-empty output, JSON validity, unsupported claims, and basic format.", spendingPower: "$0" },
  { id: "ledger", name: "Ledger", emoji: "🪙", role: "Records completed jobs and reads public payment configuration; it never holds a key.", spendingPower: "$0" },
  { id: "spawn", name: "Spawn", emoji: "🧬", role: "Proposes a specialized child configuration after the threshold; humans must deploy it.", spendingPower: "$0" },
] as const;

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /phish|credential theft|steal(?:ing)? (?:a )?password|session cookie theft|keylogger/i, reason: "credential theft or phishing" },
  { pattern: /fake review|review farm|impersonat(?:e|ion)|catfish scam|romance scam|advance[- ]fee scam/i, reason: "fraud, deception, or impersonation" },
  { pattern: /ransomware|malware|botnet|credential stuffing|carding|bank drop|money mule/i, reason: "malware or financial abuse" },
  { pattern: /counterfeit|stolen goods|fake id|forge a document|bypass kyc|evade law enforcement/i, reason: "illegal commerce or evasion" },
  { pattern: /seed phrase|private key|recovery phrase/i, reason: "sensitive wallet credentials" },
];

const cache = new Map<string, Omit<SwarmResult, "cacheHit" | "internalProcessingMs" | "trace">>();
const MAX_CACHE_ENTRIES = 96;

export function findBlockedReason(text: string): string | null {
  for (const rule of BLOCKED_PATTERNS) if (rule.pattern.test(text)) return rule.reason;
  return null;
}

export function runFastSwarm(mode: Mode, text: string): SwarmResult {
  const started = performance.now();
  const trace: AgentTrace[] = [];

  const safetyStart = performance.now();
  const reason = findBlockedReason(text);
  trace.push({
    id: "shield",
    name: "Shield",
    role: "safety",
    status: reason ? "blocked" : "complete",
    processingMs: elapsed(safetyStart),
    note: reason || "No obvious prohibited-use pattern detected.",
  });
  if (reason) {
    return {
      result: "",
      mode,
      blocked: true,
      reason,
      quality: { passed: false, checks: ["Safety check failed"] },
      trace,
      internalProcessingMs: elapsed(started),
      cacheHit: false,
    };
  }

  const scoutStart = performance.now();
  const normalized = text.trim().slice(0, 4_000);
  const key = `${mode}:${fastHash(normalized)}`;
  trace.push({ id: "scout", name: "Scout", role: "router", status: "complete", processingMs: elapsed(scoutStart), note: `Routed to ${mode} specialist.` });

  const cached = cache.get(key);
  if (cached) {
    trace.push({ id: "flash", name: "Flash", role: "cache", status: "complete", processingMs: 0, note: "Exact request served from warm memory cache." });
    trace.push({ id: "judge", name: "Judge", role: "quality", status: "complete", processingMs: 0, note: "Previously validated result." });
    return { ...cached, trace, internalProcessingMs: elapsed(started), cacheHit: true };
  }

  const flashStart = performance.now();
  const result = deterministicTransform(mode, normalized);
  trace.push({ id: "flash", name: "Flash", role: "specialist", status: "complete", processingMs: elapsed(flashStart), note: "Deterministic transform completed without model inference." });

  const judgeStart = performance.now();
  const quality = qualityCheck(mode, result);
  trace.push({
    id: "judge",
    name: "Judge",
    role: "quality",
    status: quality.passed ? "complete" : "fallback",
    processingMs: elapsed(judgeStart),
    note: quality.checks.join(" · "),
  });

  const stored = { result, mode, blocked: false, reason: null, quality };
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, stored);
  return { ...stored, trace, internalProcessingMs: elapsed(started), cacheHit: false };
}

export function deterministicTransform(mode: Mode, text: string): string {
  const clean = text.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  if (mode === "compress") {
    const words = clean.split(" ");
    return words.slice(0, 120).join(" ") + (words.length > 120 ? "…" : "");
  }
  if (mode === "summary") {
    const lines = clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);
    return (lines.length ? lines : [clean]).map((line) => `• ${line}`).join("\n");
  }
  if (mode === "listing") {
    return `TITLE: ${clean.split(" ").slice(0, 12).join(" ")}\n\nDESCRIPTION: ${clean}\n\n• Clear purpose\n• Honest wording\n• No unsupported claims\n• Easy to scan\n• Ready to edit`;
  }
  if (mode === "names") {
    const root = (clean.match(/[A-Za-z0-9]+/)?.[0] || "Nova").slice(0, 16);
    return ["Forge", "Pulse", "Nest", "Core", "Spark", "Shift", "Mint", "Loop", "Grid", "Bloom", "Byte", "Drift"].map((suffix) => `${root}${suffix}`).join("\n");
  }
  try {
    const stripped = clean.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.stringify(JSON.parse(stripped), null, 2);
  } catch {
    const repaired = clean
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.stringify(JSON.parse(repaired), null, 2);
    } catch {
      return JSON.stringify({ error: "Could not safely repair JSON", original: text }, null, 2);
    }
  }
}

export function qualityCheck(mode: Mode, result: string): { passed: boolean; checks: string[] } {
  const checks: string[] = [];
  const nonEmpty = result.trim().length > 0;
  checks.push(nonEmpty ? "output present" : "empty output");
  let formatValid = true;
  if (mode === "json") {
    try {
      JSON.parse(result);
      checks.push("valid JSON");
    } catch {
      formatValid = false;
      checks.push("invalid JSON");
    }
  } else {
    checks.push("format accepted");
  }
  const noGuarantee = !/guaranteed (?:profit|income|return|customers)/i.test(result);
  checks.push(noGuarantee ? "no guaranteed-income claim" : "guaranteed-income claim detected");
  return { passed: nonEmpty && formatValid && noGuarantee, checks };
}

function fastHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}
