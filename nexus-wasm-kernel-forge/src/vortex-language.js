// SPDX-License-Identifier: MIT

const GRID_VALUES = new Set(['auto', '96', '128', '160', '192', '224', '256']);
const PALETTES = new Set(['abyss', 'plasma', 'aurora', 'mineral']);
const QUALITIES = new Set(['mobile', 'balanced', 'high', 'adaptive']);
const BOUNDARIES = new Set(['clamp']);
const ALLOWED = new Set([
  'engine', 'grid', 'timestep', 'pressure', 'vorticity', 'decay',
  'radius', 'palette', 'quality', 'boundary', 'seed', 'substeps',
]);

export const DEFAULT_VORTEX_SOURCE = `# NEXUS VORTEX/1 — strict scientific simulation language
engine fluid2d
grid auto
timestep 0.72
pressure 16
vorticity 24
decay 0.996
radius 0.055
palette abyss
quality adaptive
boundary clamp
seed 1313167445
substeps 1
`;

function numberInRange(key, raw, minimum, maximum, integer = false) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${key} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function parseVortex(source) {
  const values = new Map();
  const errors = [];
  String(source).split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const split = line.search(/\s/);
    const key = split < 0 ? line : line.slice(0, split);
    const value = split < 0 ? '' : line.slice(split + 1).trim();
    if (!ALLOWED.has(key)) {
      errors.push(`Line ${index + 1}: unknown VORTEX key '${key}'.`);
      return;
    }
    if (!value) {
      errors.push(`Line ${index + 1}: '${key}' requires a value.`);
      return;
    }
    if (values.has(key)) {
      errors.push(`Line ${index + 1}: '${key}' is duplicated.`);
      return;
    }
    values.set(key, value);
  });

  try {
    if (values.get('engine') !== 'fluid2d') throw new Error("engine must be 'fluid2d' in Generation One.");
    const grid = values.get('grid') ?? 'auto';
    if (!GRID_VALUES.has(grid)) throw new Error(`grid must be one of ${[...GRID_VALUES].join(', ')}.`);
    const palette = values.get('palette') ?? 'abyss';
    if (!PALETTES.has(palette)) throw new Error(`palette must be one of ${[...PALETTES].join(', ')}.`);
    const quality = values.get('quality') ?? 'adaptive';
    if (!QUALITIES.has(quality)) throw new Error(`quality must be one of ${[...QUALITIES].join(', ')}.`);
    const boundary = values.get('boundary') ?? 'clamp';
    if (!BOUNDARIES.has(boundary)) throw new Error(`boundary must be ${[...BOUNDARIES].join(', ')}.`);

    const result = {
      schema: 'nexus.vortex.config.v1',
      engine: 'fluid2d',
      grid,
      timestep: numberInRange('timestep', values.get('timestep') ?? 0.72, 0.05, 2),
      pressureIterations: numberInRange('pressure', values.get('pressure') ?? 16, 4, 40, true),
      vorticity: numberInRange('vorticity', values.get('vorticity') ?? 24, 0, 80),
      decay: numberInRange('decay', values.get('decay') ?? 0.996, 0.9, 1),
      radius: numberInRange('radius', values.get('radius') ?? 0.055, 0.005, 0.25),
      palette,
      quality,
      boundary,
      seed: numberInRange('seed', values.get('seed') ?? 1313167445, 1, 0xffffffff, true) >>> 0,
      substeps: numberInRange('substeps', values.get('substeps') ?? 1, 1, 3, true),
    };
    if (errors.length) throw new Error(errors.join('\n'));
    return Object.freeze(result);
  } catch (error) {
    errors.push(error.message);
  }

  const error = new Error(errors.join('\n'));
  error.code = 'VORTEX_INVALID';
  error.details = errors;
  throw error;
}

export function resolveGrid(config, environment = {}) {
  if (config.grid !== 'auto') return Number(config.grid);
  const width = Number(environment.width ?? 390);
  const height = Number(environment.height ?? 844);
  const dpr = Math.min(Number(environment.devicePixelRatio ?? 2), 3);
  const memory = Number(environment.deviceMemory ?? 4);
  const cores = Number(environment.hardwareConcurrency ?? 4);
  const shortest = Math.min(width, height) * dpr;

  if (config.quality === 'mobile') return 96;
  if (config.quality === 'high' && memory >= 6 && cores >= 6) return shortest > 1100 ? 256 : 224;
  if (memory <= 3 || cores <= 4) return 128;
  if (shortest > 1000 && memory >= 6) return 224;
  if (shortest > 700) return 192;
  return 160;
}

export function configToHuman(config) {
  return `${config.engine} · ${config.grid} grid · ${config.pressureIterations} pressure iterations · vorticity ${config.vorticity}`;
}
