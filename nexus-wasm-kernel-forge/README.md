# NEXUS WASM KERNEL FORGE — Generation One

A browser-native WebAssembly development laboratory for building reusable compute kernels.

This is not a template generator. It compiles editable WebAssembly Text (`.wat`) into a real `.wasm` binary inside the browser, validates the binary with the browser's WebAssembly engine, rejects unauthorized imports, instantiates the module, benchmarks it, visualizes its output, and exports the resulting module plus an AI-readable contract.

## Generation One flagship kernel

The included kernel is a reusable 2D cellular-world engine:

- toroidal neighbor evaluation in WebAssembly;
- configurable birth and survival bitmasks;
- Conway, HighLife, Seeds, Day & Night, and custom rules;
- live touch painting;
- deterministic seeding;
- WASM-versus-JavaScript benchmark;
- automatic rule discovery that searches candidate rule masks for active, structured worlds;
- `.wasm`, `.wat`, state, and tool-contract export.

## Security boundary

Generation One rejects modules that:

- fail WABT or browser validation;
- declare any imports;
- do not export `memory` and `step`;
- exceed the source or binary size budget;
- instantiate more than the allowed memory budget.

Unknown capabilities block execution instead of being silently accepted.

## Open-source foundation

- WABT.js 1.0.39 — Apache-2.0, dependency-free browser WAT→WASM compiler.
- WebAssembly JavaScript API — browser-native validation, module inspection, instantiation, memory, imports, and exports.
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