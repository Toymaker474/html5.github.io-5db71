# NEXUS Product Forge — Generation One

A real browser-based toolsmith that turns one idea into runnable source files.

## Generation One contract

The user provides one product idea. The Forge automatically:

1. classifies it as a web app, scientific simulation, 2D game, or browser AI model;
2. translates it into the small AI-friendly **LUMEN/1** project language;
3. compiles the specification into real HTML, CSS, JavaScript, tests, and metadata;
4. validates required files and rejects incomplete builds;
5. runs the generated project in an isolated browser preview;
6. calculates SHA-256 evidence for every generated file;
7. exports the complete project as a ZIP.

No terminal, package installation, paid API, cloud model, subscription, or user setup is required.

## Honest scope

Generation One is deterministic scaffolding, not a general intelligence model. It creates complete small browser projects from verified templates. Later generations will add tool discovery, research-paper ingestion, WebGPU/WASM engines, repository creation, local model selection, automated repair, and multi-agent build/test/verifier roles.

## LUMEN/1

```text
world "Creature Lab"
kind simulation
goal "Evolving creatures compete for energy"
target mobile-web
feature evolution
feature particles
quality balanced
```

LUMEN is intentionally compact, deterministic, human-readable, and AI-readable. Unknown keys fail closed instead of being silently ignored.

## Local verification

```bash
cd nexus-product-forge
npm test
```

## Open-source dependency

The Forge UI loads `fflate` 0.8.3 (MIT) only for ZIP packaging. Generated projects are dependency-free Generation-One browser projects.