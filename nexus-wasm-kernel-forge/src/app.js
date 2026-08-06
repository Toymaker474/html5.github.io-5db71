// SPDX-License-Identifier: MIT
import { FLUID_WAT, REQUIRED_FLUID_EXPORTS } from './fluid-kernel.js';
import { DEFAULT_VORTEX_SOURCE, parseVortex, resolveGrid, configToHuman } from './vortex-language.js';
import { compileWat, createKernelContract, downloadBinary } from './wasm-compiler.js';
import { WasmFluidEngine } from './fluid-engine.js';
import { FluidRenderer } from './renderer.js';
import { tuneFluid } from './nexus-ai.js';

const ui = Object.fromEntries([
  'fluid','status','fps','stepMs','grid','energy','kernelHash','vortex','pause','clear','benchmark','tune',
  'exportWasm','exportContract','exportState','openCompiler','compilerPanel','closeCompiler','vortexSource',
  'watSource','compile','resetSource','compilerOutput','reportPanel','closeReport','report',
].map(id => [id, document.getElementById(id)]));

let compilation = null;
let contract = null;
let engine = null;
let renderer = null;
let config = null;
let running = true;
let animationId = 0;
let lastFrame = performance.now();
let smoothedFps = 60;
let metricsCountdown = 0;
let pointer = null;
let hue = 0;
let rebuildToken = 0;

function setStatus(mode, text) {
  ui.status.className = `status ${mode}`;
  ui.status.textContent = text;
}

function errorPayload(error) {
  return {
    code: error?.code ?? 'NEXUS_RUNTIME_ERROR',
    message: error?.message ?? String(error),
    details: error?.details ?? [],
  };
}

function downloadJson(value, filename) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function hslToRgb(h, s = 0.95, l = 0.62) {
  const k = n => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 1.65, f(8) * 1.65, f(4) * 1.65];
}

function patchVortexSource(best) {
  let source = ui.vortexSource.value;
  const replacements = {
    pressure: best.pressureIterations,
    vorticity: best.vorticity.toFixed(3),
    decay: best.decay.toFixed(6),
    timestep: best.timestep.toFixed(4),
  };
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`^${key}\\s+.*$`, 'm');
    source = pattern.test(source) ? source.replace(pattern, `${key} ${value}`) : `${source.trim()}\n${key} ${value}\n`;
  }
  ui.vortexSource.value = source;
}

async function rebuild() {
  const token = ++rebuildToken;
  setStatus('compiling', 'COMPILING');
  running = false;
  ui.pause.textContent = '▶ Run';
  ui.compilerOutput.textContent = 'Parsing VORTEX/1…';
  try {
    const nextConfig = parseVortex(ui.vortexSource.value);
    const dimension = resolveGrid(nextConfig, {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
      deviceMemory: navigator.deviceMemory ?? 4,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 4,
    });
    ui.compilerOutput.textContent = `Compiling ${dimension}×${dimension} fluid kernel…`;
    const nextCompilation = await compileWat({
      source: ui.watSource.value,
      filename: 'nexus-fluid2d.wat',
      requiredExports: REQUIRED_FLUID_EXPORTS,
    });
    if (token !== rebuildToken) return;
    const nextEngine = new WasmFluidEngine(nextCompilation, { ...nextConfig, width: dimension, height: dimension });
    const nextRenderer = new FluidRenderer(ui.fluid, dimension, dimension, nextConfig.palette);
    const nextContract = createKernelContract(nextCompilation, {
      id: 'nexus-vortex-fluid2d',
      version: '0.1.0',
      purpose: 'Phone-first incompressible fluid simulation and reusable scientific compute kernel',
    });

    compilation = nextCompilation;
    engine = nextEngine;
    renderer = nextRenderer;
    config = nextConfig;
    contract = nextContract;
    engine.seedWhirlpool();
    running = true;
    ui.pause.textContent = 'Ⅱ Pause';
    setStatus('ready', 'WASM READY');
    ui.compilerOutput.textContent = JSON.stringify({
      config: configToHuman(nextConfig),
      resolvedGrid: dimension,
      wasmBytes: nextCompilation.byteLength,
      wasmSha256: nextCompilation.sha256,
      imports: nextCompilation.imports,
      exports: nextCompilation.exports,
      initialMemoryBytes: nextCompilation.instance.exports.memory.buffer.byteLength,
    }, null, 2);
    ui.compilerPanel.hidden = true;
  } catch (error) {
    console.error(error);
    setStatus('fail', 'BLOCKED');
    ui.compilerOutput.textContent = JSON.stringify(errorPayload(error), null, 2);
    ui.compilerPanel.hidden = false;
  }
}

function updateMetrics(metrics) {
  ui.fps.textContent = smoothedFps.toFixed(0);
  ui.stepMs.textContent = `${metrics.stepMilliseconds.toFixed(2)} ms`;
  ui.grid.textContent = metrics.grid;
  ui.energy.textContent = Number(metrics.kineticEnergy).toExponential(2);
  ui.kernelHash.textContent = compilation ? compilation.sha256.slice(0, 9) : '—';
}

function frame(now) {
  const delta = Math.max(1, now - lastFrame);
  lastFrame = now;
  smoothedFps = smoothedFps * 0.9 + (1000 / delta) * 0.1;
  if (running && engine && renderer) {
    const metrics = engine.step();
    renderer.render(engine.view('red'), engine.view('green'), engine.view('blue'), now);
    metricsCountdown -= 1;
    if (metricsCountdown <= 0) {
      updateMetrics(metrics);
      metricsCountdown = 8;
    }
  }
  animationId = requestAnimationFrame(frame);
}

function normalizedPoint(event) {
  const rect = ui.fluid.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
    time: performance.now(),
  };
}

function inject(event, first = false) {
  if (!engine) return;
  const next = normalizedPoint(event);
  const previous = pointer ?? next;
  const elapsed = Math.max(8, next.time - previous.time);
  const scale = engine.width * 0.055 * (16.67 / elapsed);
  const forceX = first ? 0 : (next.x - previous.x) * scale;
  const forceY = first ? 0 : (next.y - previous.y) * scale;
  hue = (hue + 0.009 + Math.hypot(forceX, forceY) * 0.002) % 1;
  engine.splat({ x: next.x, y: next.y, forceX, forceY, radius: config.radius, color: hslToRgb(hue) });
  pointer = next;
}

ui.fluid.addEventListener('pointerdown', event => {
  ui.fluid.setPointerCapture(event.pointerId);
  pointer = null;
  inject(event, true);
});
ui.fluid.addEventListener('pointermove', event => {
  if (!ui.fluid.hasPointerCapture(event.pointerId)) return;
  inject(event, false);
});
ui.fluid.addEventListener('pointerup', event => {
  if (ui.fluid.hasPointerCapture(event.pointerId)) ui.fluid.releasePointerCapture(event.pointerId);
  pointer = null;
});
ui.fluid.addEventListener('pointercancel', () => { pointer = null; });

ui.vortex.addEventListener('click', () => engine?.seedWhirlpool({ turns: 28, strength: 5.6 }));
ui.clear.addEventListener('click', () => engine?.clear());
ui.pause.addEventListener('click', () => {
  running = !running;
  ui.pause.textContent = running ? 'Ⅱ Pause' : '▶ Run';
  setStatus(running ? 'ready' : 'paused', running ? 'WASM READY' : 'PAUSED');
});
ui.benchmark.addEventListener('click', async () => {
  if (!engine) return;
  const wasRunning = running;
  running = false;
  setStatus('compiling', 'BENCHMARK');
  try {
    const result = await engine.benchmark(12);
    ui.report.textContent = JSON.stringify({ kernel: compilation.sha256, result }, null, 2);
    ui.reportPanel.hidden = false;
  } finally {
    running = wasRunning;
    setStatus(running ? 'ready' : 'paused', running ? 'WASM READY' : 'PAUSED');
  }
});
ui.tune.addEventListener('click', async () => {
  if (!engine) return;
  const wasRunning = running;
  running = false;
  setStatus('compiling', 'AI SEARCH');
  try {
    const report = await tuneFluid(engine, {
      targetMilliseconds: Math.max(12, 900 / Math.max(30, smoothedFps)),
      onProgress: progress => {
        ui.reportPanel.hidden = false;
        ui.report.textContent = JSON.stringify({
          state: 'searching',
          generation: progress.generation + 1,
          candidate: progress.index + 1,
          population: progress.population,
          bestSoFar: progress.best,
        }, null, 2);
      },
    });
    patchVortexSource(report.best.genome);
    ui.report.textContent = JSON.stringify(report, null, 2);
    engine.seedWhirlpool({ turns: 18, strength: 4.2 });
  } catch (error) {
    ui.report.textContent = JSON.stringify(errorPayload(error), null, 2);
  } finally {
    running = wasRunning;
    setStatus(running ? 'ready' : 'paused', running ? 'WASM READY' : 'PAUSED');
  }
});

ui.exportWasm.addEventListener('click', () => compilation && downloadBinary(compilation.bytes, `nexus-vortex-${compilation.sha256.slice(0, 12)}.wasm`));
ui.exportContract.addEventListener('click', () => contract && downloadJson(contract, 'nexus-vortex-kernel-contract.json'));
ui.exportState.addEventListener('click', () => engine && downloadJson(engine.exportState(), 'nexus-vortex-fluid-state.json'));
ui.openCompiler.addEventListener('click', () => { ui.compilerPanel.hidden = false; });
ui.closeCompiler.addEventListener('click', () => { ui.compilerPanel.hidden = true; });
ui.closeReport.addEventListener('click', () => { ui.reportPanel.hidden = true; });
ui.compile.addEventListener('click', rebuild);
ui.resetSource.addEventListener('click', () => {
  ui.vortexSource.value = DEFAULT_VORTEX_SOURCE;
  ui.watSource.value = FLUID_WAT;
  ui.compilerOutput.textContent = 'Verified Generation One sources restored. Press Compile and restart.';
});

ui.vortexSource.value = DEFAULT_VORTEX_SOURCE;
ui.watSource.value = FLUID_WAT;
addEventListener('resize', () => renderer?.resize());
rebuild();
cancelAnimationFrame(animationId);
animationId = requestAnimationFrame(frame);
