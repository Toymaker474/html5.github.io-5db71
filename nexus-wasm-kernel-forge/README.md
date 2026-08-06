# NEXUS WASM KERNEL FORGE — Generation One

A browser-native WebAssembly scientific development laboratory for building reusable compute kernels, simulation languages, renderers, and AI-friendly tools.

This is not a template generator. It compiles editable WebAssembly Text (`.wat`) into a real `.wasm` binary inside the browser, validates the binary with the browser's WebAssembly engine, rejects unauthorized imports, instantiates the module, benchmarks it, visualizes its output, and exports the resulting module plus an AI-readable contract.

## Generation One flagship: VORTEX/1

VORTEX/1 is a strict new simulation language controlling a phone-first incompressible-fluid engine. The real WebAssembly kernel implements:

- semi-Lagrangian advection;
- divergence measurement;
- iterative pressure projection;
- pressure-gradient subtraction;
- curl and vorticity confinement;
- three-channel dye transport;
- touch force and dye splats;
- velocity/dye decay;
- kinetic-energy measurement;
- bounded linear memory utilities.

The JavaScript engine layer adds:

- WASM memory layout and ping-pong fields;
- snapshots and deterministic restoration;
- whirlpool seeding;
- scientific metrics and benchmarks;
- WebGL2 HDR-style visualization;
- exportable `.wasm`, state, and AI kernel contracts;
- deterministic evolutionary tuning of pressure, vorticity, decay, and time step under a frame-time budget.

Earlier cellular-world source remains as a secondary reusable experimental kernel, not the flagship.

## VORTEX/1 example

```text
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
```

Unknown keys, duplicated settings, unsupported engines, and out-of-range scientific parameters block compilation.

## Security boundary

Generation One rejects modules that:

- fail WABT or browser validation;
- declare any imports;
- omit required fluid exports;
- exceed source or binary budgets;
- instantiate beyond the memory budget.

Unknown capabilities block execution instead of being silently accepted.

## Open-source foundation

- WABT.js 1.0.39 — Apache-2.0, dependency-free browser WAT→WASM compiler.
- WebAssembly JavaScript API — browser-native validation, module inspection, instantiation, memory, imports, and exports.
- WebGL2 — standards-based phone renderer.
- Playwright 1.62.0 — Apache-2.0 automated browser verification.

No paid API, subscription, cloud model, remote server, or user installation is required.

## Verification

```bash
cd nexus-wasm-kernel-forge
npm install
npm test
npm run test:browser
```

The draft remains unmerged until human approval.