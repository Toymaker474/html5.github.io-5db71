# NEXUS FLUX

A reusable, phone-first scientific game and simulation framework for WebGPU with a deterministic CPU safety backend.

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

### Visual engines

- **VORTEX** — WebGPU compute particles in a time-varying Taylor–Green flow field with touch circulation.
- **TERRA** — rainfall, water transport, sediment capacity, erosion, deposition, evaporation, moisture, normals and terrain/water lighting.

Both visual engines have reduced CPU implementations so an unavailable or failed GPU path can remain interactive rather than blank.

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

## Verification

Current branch head at the repair deployment: `829a1ec0e282d934d61b4454155cfdaa18ccff96`

GitHub Actions run `31097354413`:

- 13 tests passed;
- 0 tests failed;
- Safari claimed-canvas recovery passed;
- all JavaScript modules passed syntax validation;
- all WGSL modules passed fail-closed linting.

The hosted AppDeploy update passed 4/4 black-box tests with zero frontend and network errors.

## Safety and truth

- Draft branch only
- Unmerged
- No automatic merge
- No paid APIs
- No claim of physical iPhone success after the latest repair until retested on that device
