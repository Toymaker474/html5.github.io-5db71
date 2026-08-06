// SPDX-License-Identifier: MIT

const ALLOWED_KEYS = new Set(['world', 'kind', 'goal', 'target', 'feature', 'quality']);
const KINDS = new Set(['app', 'simulation', 'game', 'ai']);
const TARGETS = new Set(['mobile-web', 'desktop-web', 'universal-web']);
const QUALITIES = new Set(['fast', 'balanced', 'high']);

function cleanQuoted(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function slugify(value) {
  return String(value || 'nexus-project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'nexus-project';
}

export function classifyIdea(idea) {
  const text = String(idea || '').toLowerCase();
  if (/\b(ai|model|neural|classifier|train|machine learning|agent brain)\b/.test(text)) return 'ai';
  if (/\b(game|player|enemy|combat|platformer|roguelike|shooter|score)\b/.test(text)) return 'game';
  if (/\b(sim|simulation|physics|particle|evolution|ecosystem|chemistry|climate|biology|gravity)\b/.test(text)) return 'simulation';
  return 'app';
}

export function naturalToLumen(idea, options = {}) {
  const original = String(idea || '').trim();
  if (!original) throw new Error('An idea is required.');
  const title = options.title || original.split(/[.!?]/)[0].trim().slice(0, 54) || 'NEXUS Project';
  const kind = options.kind || classifyIdea(original);
  const features = new Set();
  const featureRules = [
    ['touch', /\b(touch|mobile|iphone|phone)\b/i],
    ['particles', /\b(particle|fluid|sand|dust|spark)\b/i],
    ['evolution', /\b(evolution|genetic|creature|ecosystem|life)\b/i],
    ['physics', /\b(physics|gravity|collision|force|spring)\b/i],
    ['local-ai', /\b(ai|model|neural|classifier|training)\b/i],
    ['offline', /\b(offline|local)\b/i],
  ];
  for (const [name, pattern] of featureRules) if (pattern.test(original)) features.add(name);
  if (!features.size) features.add(kind === 'app' ? 'storage' : kind);

  return [
    `world "${title.replaceAll('"', "'")}"`,
    `kind ${kind}`,
    `goal "${original.replaceAll('"', "'")}"`,
    'target universal-web',
    ...[...features].map(feature => `feature ${feature}`),
    'quality balanced',
  ].join('\n');
}

export function parseLumen(source) {
  const spec = { features: [] };
  const errors = [];
  const lines = String(source || '').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const split = line.search(/\s/);
    const key = split === -1 ? line : line.slice(0, split);
    const value = split === -1 ? '' : cleanQuoted(line.slice(split + 1));
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Line ${index + 1}: unknown key '${key}'.`);
      return;
    }
    if (!value) {
      errors.push(`Line ${index + 1}: '${key}' needs a value.`);
      return;
    }
    if (key === 'feature') spec.features.push(slugify(value));
    else spec[key] = value;
  });

  if (!spec.world) errors.push('Missing required world name.');
  if (!KINDS.has(spec.kind)) errors.push(`Kind must be one of: ${[...KINDS].join(', ')}.`);
  if (!spec.goal) errors.push('Missing required goal.');
  if (!TARGETS.has(spec.target)) errors.push(`Target must be one of: ${[...TARGETS].join(', ')}.`);
  if (!QUALITIES.has(spec.quality)) errors.push(`Quality must be one of: ${[...QUALITIES].join(', ')}.`);
  spec.features = [...new Set(spec.features)];

  if (errors.length) {
    const error = new Error(errors.join('\n'));
    error.code = 'LUMEN_INVALID';
    error.details = errors;
    throw error;
  }

  return Object.freeze({
    schema: 'nexus.lumen.project.v1',
    world: spec.world,
    slug: slugify(spec.world),
    kind: spec.kind,
    goal: spec.goal,
    target: spec.target,
    features: Object.freeze(spec.features),
    quality: spec.quality,
  });
}
