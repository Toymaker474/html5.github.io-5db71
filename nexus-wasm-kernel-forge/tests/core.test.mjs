import test from 'node:test';
import assert from 'node:assert/strict';
import wabtFactory from 'wabt';
import { FLUID_WAT, REQUIRED_FLUID_EXPORTS } from '../src/fluid-kernel.js';
import { DEFAULT_VORTEX_SOURCE, parseVortex, resolveGrid } from '../src/vortex-language.js';
import { compileWat } from '../src/wasm-compiler.js';
import { WasmFluidEngine } from '../src/fluid-engine.js';
import { EvolutionSearch } from '../src/nexus-ai.js';

let compilation;

test('VORTEX/1 parses a strict scientific configuration', () => {
  const config = parseVortex(DEFAULT_VORTEX_SOURCE);
  assert.equal(config.schema, 'nexus.vortex.config.v1');
  assert.equal(config.engine, 'fluid2d');
  assert.equal(config.pressureIterations, 16);
  assert.equal(resolveGrid(config, { width: 430, height: 932, devicePixelRatio: 3, deviceMemory: 8, hardwareConcurrency: 8 }), 224);
});

test('VORTEX/1 blocks unknown, duplicate, and unsafe values', () => {
  assert.throws(() => parseVortex('engine fluid2d\ngrid auto\nmagic yes'), error => error.code === 'VORTEX_INVALID' && /unknown VORTEX key/.test(error.message));
  assert.throws(() => parseVortex('engine fluid2d\ngrid 128\ngrid 160'), error => error.code === 'VORTEX_INVALID' && /duplicated/.test(error.message));
  assert.throws(() => parseVortex('engine fluid2d\ngrid 128\npressure 500'), error => error.code === 'VORTEX_INVALID' && /pressure/.test(error.message));
});

test('WAT compiles to a browser-valid import-free WASM module with every required export', async () => {
  compilation = await compileWat({ source: FLUID_WAT, filename: 'fluid.wat', requiredExports: REQUIRED_FLUID_EXPORTS, wabtFactory });
  assert.ok(compilation.byteLength > 1000);
  assert.equal(compilation.imports.length, 0);
  assert.match(compilation.sha256, /^[a-f0-9]{64}$/);
  const names = new Set(compilation.exports.map(item => item.name));
  for (const name of REQUIRED_FLUID_EXPORTS) assert.ok(names.has(name), `missing ${name}`);
});

test('WASM fluid engine produces finite motion, dye structure, snapshots, and deterministic restoration', async () => {
  compilation ??= await compileWat({ source: FLUID_WAT, filename: 'fluid.wat', requiredExports: REQUIRED_FLUID_EXPORTS, wabtFactory });
  const engine = new WasmFluidEngine(compilation, { width: 64, height: 64, pressureIterations: 12, vorticity: 18, timestep: 0.62 });
  engine.seedWhirlpool({ turns: 14, strength: 3.8, radius: 0.25 });
  const start = engine.metrics();
  assert.ok(start.kineticEnergy > 0);
  assert.ok(start.sampledDyeMass > 0);
  const snapshot = engine.snapshot();
  for (let index = 0; index < 5; index += 1) engine.step();
  const evolved = engine.metrics();
  assert.ok(Number.isFinite(evolved.kineticEnergy));
  assert.ok(Number.isFinite(evolved.sampledColorGradient));
  assert.ok(evolved.frame === 5);
  assert.notDeepEqual(Array.from(engine.view('red').slice(0, 128)), Array.from(snapshot.fields.red.slice(0, 128)));
  engine.restore(snapshot);
  assert.equal(engine.frame, snapshot.frame);
  assert.deepEqual(Array.from(engine.view('red').slice(0, 256)), Array.from(snapshot.fields.red.slice(0, 256)));
});

test('generic NEXUS evolutionary search converges on a measurable objective', async () => {
  const search = new EvolutionSearch({
    seed: 12345,
    population: 8,
    generations: 4,
    elite: 2,
    genes: { x: { minimum: -5, maximum: 5 }, y: { minimum: -5, maximum: 5 } },
  });
  const report = await search.run(async genome => ({
    score: -((genome.x - 1.25) ** 2 + (genome.y + 0.75) ** 2),
    metrics: { distance: Math.hypot(genome.x - 1.25, genome.y + 0.75) },
  }));
  assert.equal(report.schema, 'nexus.ai.evolution-report.v1');
  assert.equal(report.modelClaim, false);
  assert.ok(report.best.metrics.distance < 2.5);
});
