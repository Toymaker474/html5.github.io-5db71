# NEXUS FLUX

A reusable, phone-first scientific game and simulation framework for WebGPU and WebAssembly with deterministic CPU safety paths.

## Current stack

### Ten tools

1. Deterministic seeded RNG
2. WebGPU capability profiler
3. Fail-closed WGSL linter and shader diagnostics
4. GPU resource and memory-budget planner
5. Dependency-aware frame graph
6. Adaptive mobile resolution controller
7. Runtime frame profiler
8. Rewindable branch-safe state recorder
9. Deterministic parameter search
10. AI-readable contract inspector

### Scientific libraries

- Flux Math
- Flux Fields
- Flux WebGPU and Renderer
- Flux N-Body deterministic 3D gravity reference library
- Guarded WebAssembly linear-memory arena and N-body bridge
- Native imported-memory `f64` kick and drift kernels
- Hybrid velocity-Verlet controller using native WASM kick–drift–kick stages with JavaScript reference gravity

The hybrid controller is intentionally truthful: pairwise gravity is not native WebAssembly yet, and no phone-speed improvement is claimed until measured on the target device.

### Visual engines

- **VORTEX** — WebGPU compute particles in a time-varying Taylor–Green flow field with touch circulation.
- **TERRA** — rainfall, water transport, sediment capacity, erosion, deposition, evaporation, moisture, normals and terrain/water lighting.

Both visual engines have reduced CPU implementations so an unavailable or failed GPU path can remain interactive rather than blank.

## Latest verified WASM increment

`NBodyHybridWasmIntegrator` composes the existing native kernels into a bounded velocity-Verlet step:

1. native WASM half-kick;
2. native WASM full drift;
3. JavaScript reference pairwise-gravity evaluation;
4. native WASM half-kick.

It preserves the existing `Float64Array` state and imported `WebAssembly.Memory` ABI, supports 1–10,000 iterations per call, rejects invalid timesteps and incompatible systems, and exposes an AI-readable contract that explicitly marks pairwise gravity as JavaScript.

GitHub Actions run `31110173105` passed on implementation head `5396ff8e02a020218719a3d2ca1baec02524bd6c`:

- 21 tests passed and 0 failed;
- the hybrid result matched the JavaScript velocity-Verlet reference exactly after 25 steps;
- final acceleration state also matched exactly;
- invalid timestep, iteration count, and system-size requests were rejected;
- native kick/drift, WebAssembly memory, N-body conservation, shader, syntax, and Safari recovery tests remained green.

## Safari target-device repair

A physical iPhone report showed Safari exposing WebGPU, claiming the display canvas, then failing later during GPU engine setup. The original recovery code attempted to request a 2D context from the same WebGPU-claimed canvas. Safari returned `null`, and TERRA crashed while creating its CPU image surface.

The repaired runtime now:

- treats GPU startup as an atomic operation;
- destroys a partially initialized GPU context;
- replaces a WebGPU-claimed canvas before CPU recovery;
- binds input to the replacement canvas;
- preserves the original GPU failure reason;
- displays `CPU SAFE` when recovery is active;
- reports explicit WebGPU canvas acquisition/configuration errors.

The regression suite includes a Safari-style 390×844 claimed-canvas recovery test. This is automated proof of the recovery path, not a claim that the repaired build has already passed on Tyler's physical iPhone.

## Safety and truth

- Draft branch only
- Unmerged
- No automatic merge
- No paid APIs
- No claim that pairwise gravity is native WASM
- No phone performance claim without target-device measurements
- No claim of physical iPhone success after the latest Safari repair until retested on that device
