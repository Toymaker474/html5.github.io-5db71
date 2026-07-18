# PennySpawn Forge v6

PennySpawn Forge is an iPhone-first GitHub Pages PWA that combines:

- visitor-side open-source AI tools;
- WebGPU acceleration with quantized WASM/CPU fallback;
- device-local owner profiles;
- watch-only Base USDC and Bitcoin telemetry;
- real public-wallet receipt detection;
- a lawful local strategy agent;
- an AdSense-ready adapter with visitor opt-in;
- public sponsor and crypto-tip buttons.

## Monetization setup

Edit `monetization-config.js` and add only public identifiers:

- AdSense publisher ID and approved ad-unit slot IDs;
- public Base USDC receiving address;
- public Bitcoin receiving address;
- sponsor inquiry URL.

Never place seed phrases, private keys, exchange passwords, wallet signing credentials, or OAuth tokens in this repository.

AdSense will not show ads until the site is added to the publisher account, reviewed, approved, and the correct code/IDs are present. The app does not estimate or fabricate ad earnings.

## Compute model

Visitors perform inference on their own device through Transformers.js:

- `HuggingFaceTB/SmolLM2-135M-Instruct` in Lite mode;
- `onnx-community/Qwen2.5-0.5B-Instruct` in Deep mode;
- WebGPU `q4` first when supported;
- WASM `q4`/`q8` fallback.

## Static-site limits

GitHub Pages cannot securely store secrets, process custodial payments, run permanent background agents, or guarantee visitors and income. PennySpawn therefore uses public wallet telemetry, local inference, approved advertising scripts, and human-reviewed actions.
