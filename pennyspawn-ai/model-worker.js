import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_MAP = {
  lite: {
    id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    label: 'SmolLM2-135M-Instruct',
    maxTokens: 120
  },
  deep: {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen2.5-0.5B-Instruct',
    maxTokens: 150
  }
};

const CATEGORIES = [
  'repair broken JSON for developers',
  'compress long prompts into clear prompts',
  'write accurate accessibility alt text',
  'clean honest product listing copy',
  'summarize user-provided notes',
  'generate original game names and short descriptions',
  'format text into structured checklists',
  'classify user-provided feedback into useful categories',
  'prepare simple HTML5 prototype planning documents'
];

let generator = null;
let ranker = null;
let device = 'wasm';
let loading = null;
let activeChoice = 'lite';

function progressMessage(file, loaded, total) {
  const percent = total ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0;
  postMessage({ type: 'progress', file: String(file || 'model'), percent });
}

async function loadPipelineWithFallback(task, model) {
  const progress_callback = value => {
    if (value?.status === 'progress') progressMessage(value.file, value.loaded, value.total);
    if (value?.status === 'ready') postMessage({ type: 'progress', file: value.file || model, percent: 100 });
  };
  const attempts = [];
  if (self.navigator?.gpu) attempts.push({ device: 'webgpu', dtype: 'q4' });
  attempts.push({ device: 'wasm', dtype: 'q4' }, { device: 'wasm', dtype: 'q8' });
  let lastError;
  for (const options of attempts) {
    try {
      const pipe = await pipeline(task, model, { ...options, progress_callback });
      device = options.device;
      return pipe;
    } catch (error) {
      lastError = error;
      postMessage({ type: 'notice', message: `${model} ${options.device} fallback: ${error?.message || error}` });
    }
  }
  throw lastError || new Error(`Unable to load ${model}`);
}

async function init(choice = 'lite') {
  const normalized = MODEL_MAP[choice] ? choice : 'lite';
  if (generator && activeChoice === normalized) return;
  if (loading) return loading;
  activeChoice = normalized;
  const selected = MODEL_MAP[activeChoice];
  loading = (async () => {
    postMessage({ type: 'status', status: 'loading', model: selected.label });
    generator = await loadPipelineWithFallback('text-generation', selected.id);
    postMessage({ type: 'status', status: 'generator-ready', device, model: selected.label });
    try {
      ranker = await loadPipelineWithFallback('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      postMessage({ type: 'status', status: 'ready', device, model: `${selected.label} + MiniLM` });
    } catch (error) {
      ranker = null;
      postMessage({ type: 'status', status: 'ready', device, model: selected.label, warning: error?.message || String(error) });
    }
  })().finally(() => { loading = null; });
  return loading;
}

function dot(a, b) {
  let score = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) score += a[i] * b[i];
  return score;
}

async function chooseCategory(skills) {
  if (!ranker || !skills?.trim()) return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  try {
    const goal = await ranker(skills, { pooling: 'mean', normalize: true });
    const choices = await ranker(CATEGORIES, { pooling: 'mean', normalize: true });
    const goalData = Array.from(goal.data || []);
    const flat = Array.from(choices.data || []);
    const dim = goalData.length;
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < CATEGORIES.length; i++) {
      const score = dot(goalData, flat.slice(i * dim, (i + 1) * dim));
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return CATEGORIES[best];
  } catch {
    return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  }
}

function cleanOutput(value) {
  return String(value || '')
    .replace(/<\|.*?\|>/g, '')
    .replace(/^assistant\s*:?/i, '')
    .trim()
    .slice(0, 1400);
}

async function plan(payload) {
  await init(payload?.model || activeChoice);
  const selected = MODEL_MAP[activeChoice];
  const category = await chooseCategory(payload.skills || '');
  const result = await generator([
    {
      role: 'system',
      content: 'You are PennySpawn, an on-device planning assistant. Propose only lawful, honest, non-deceptive work. Never propose spam, fake reviews, phishing, malware, credential theft, impersonation, stolen or counterfeit goods, harassment, evasion, gambling, trading, guaranteed income, or unauthorized access. You cannot act on websites, contact people, spend money, sign transactions, hold private keys, or promise customers. Output exactly three short lines beginning STRATEGY:, NEXT ACTION:, and WHY:.'
    },
    {
      role: 'user',
      content: `Create the next small lawful microservice plan. Preferred category: ${category}. User skills: ${payload.skills || 'not provided'}. Previous strategy: ${payload.previous || 'none'}. Confirmed cycle receipts converted to USD: $${Number(payload.earned || 0).toFixed(6)}. The next action must be something the human can manually review before publishing.`
    }
  ], {
    max_new_tokens: selected.maxTokens,
    temperature: activeChoice === 'deep' ? 0.48 : 0.58,
    top_p: 0.9,
    do_sample: true,
    repetition_penalty: 1.08
  });

  const generated = result?.[0]?.generated_text;
  const text = Array.isArray(generated) ? generated.at(-1)?.content : generated;
  postMessage({ type: 'plan', text: cleanOutput(text), category, device, model: selected.label });
}

self.onmessage = async event => {
  const { type, payload } = event.data || {};
  try {
    if (type === 'init') await init(payload?.model || 'lite');
    if (type === 'plan') await plan(payload || {});
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
