import { NBodyWasmBridge } from './wasm-memory.js';
import { NBodyKickWasmKernel, NBodyDriftWasmKernel } from './wasm-kernels.js';

export class NBodyHybridWasmIntegrator {
  static async create(system, options = {}) {
    if (!system || !Number.isInteger(system.count)) throw new Error('NBODY_WASM_INTEGRATOR_INVALID_SYSTEM');
    const bridge = new NBodyWasmBridge(system.count, options);
    const kick = await NBodyKickWasmKernel.create(bridge.arena);
    const drift = await NBodyDriftWasmKernel.create(bridge.arena);
    return new NBodyHybridWasmIntegrator({ count: system.count, bridge, kick, drift });
  }

  constructor({ count, bridge, kick, drift }) {
    this.count = count;
    this.bridge = bridge;
    this.kickKernel = kick;
    this.driftKernel = drift;
  }

  assertCompatible(system) {
    if (!system || system.count !== this.count || !(system.position instanceof Float64Array) || !(system.velocity instanceof Float64Array) || !(system.acceleration instanceof Float64Array) || typeof system.computeAccelerations !== 'function') {
      throw new Error('NBODY_WASM_INTEGRATOR_INCOMPATIBLE_SYSTEM');
    }
  }

  step(system, dt, iterations = 1) {
    this.assertCompatible(system);
    if (!(dt > 0) || !Number.isFinite(dt)) throw new Error('NBODY_WASM_INTEGRATOR_INVALID_DT');
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) throw new Error('NBODY_WASM_INTEGRATOR_INVALID_ITERATIONS');

    system.computeAccelerations();
    this.bridge.push(system);
    const halfDt = dt * 0.5;
    const scalarCount = this.count * 3;

    for (let iteration = 0; iteration < iterations; iteration++) {
      this.kickKernel.kick(halfDt, scalarCount);
      this.driftKernel.drift(dt, scalarCount);

      system.position.set(this.bridge.arena.view('position'));
      system.velocity.set(this.bridge.arena.view('velocity'));
      system.computeAccelerations();
      this.bridge.arena.view('acceleration').set(system.acceleration);

      this.kickKernel.kick(halfDt, scalarCount);
      system.velocity.set(this.bridge.arena.view('velocity'));
      system.time += dt;
    }

    system.acceleration.set(this.bridge.arena.view('acceleration'));
    return system;
  }

  contract() {
    return {
      schema: 'nexus.flux.nbody-hybrid-wasm-integrator.v1',
      algorithm: 'velocity-verlet',
      scalar: 'f64',
      nativeStages: ['kick', 'drift', 'kick'],
      forceEvaluation: 'javascript-reference',
      nativePairwiseGravity: false,
      deterministic: true,
      count: this.count,
      memory: this.bridge.arena.contract(),
    };
  }
}
