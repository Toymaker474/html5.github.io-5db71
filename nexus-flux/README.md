# NEXUS FLUX

Phone-first WebGPU scientific world framework targeting iPhone 16 Pro Max and modern browsers.

## Ten tools
1. Deterministic RNG
2. Capability profiler
3. WGSL linter and compiler diagnostics
4. Resource planner and memory budget
5. Frame graph
6. Adaptive quality controller
7. Frame profiler
8. Rewindable state recorder
9. Deterministic parameter search
10. AI-readable contract inspector

## Scientific libraries
- Flux Math: deterministic noise, interpolation and scientific vector fields.
- Flux Fields: scalar grids, sampling, gradients, Laplacians and ping-pong state.
- Flux WebGPU + Renderer: device setup, buffers, pipeline validation, resizing, blending and CPU surfaces.
- Flux N-Body: deterministic 3D gravity with symmetric pair forces, velocity-Verlet integration, energy/momentum diagnostics, snapshots and a structure-of-arrays memory contract designed for a future WebAssembly backend.

## Two visual engines
- VORTEX: WebGPU compute particles moving through a time-varying Taylor-Green incompressible flow field with touch circulation.
- TERRA: paired GPU state textures for rainfall, surface-water transport, sediment capacity, erosion, deposition, evaporation and terrain lighting.

Both visual engines include reduced CPU canvas implementations. Missing or failed WebGPU initialization must fall back rather than produce a blank page.

## Verification

```bash
cd nexus-flux
npm test
```

The regression suite checks deterministic behavior, phone grid limits, all four WGSL modules, memory budgets, frame ordering, field mathematics, adaptive quality, rewind state, parameter search, AI-readable engine contracts, deterministic N-body snapshots, WASM-ready memory layout, momentum conservation and bounded orbital-energy drift.
