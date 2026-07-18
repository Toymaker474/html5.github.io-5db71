# PennySpawn Forge v7

PennySpawn Forge is an iPhone-first GitHub Pages PWA that combines:

- visitor-side open-source AI tools;
- WebGPU acceleration with quantized WASM/CPU fallback;
- device-local owner profiles;
- watch-only Base USDC and Bitcoin telemetry;
- real public-wallet receipt detection;
- a lawful local strategy agent;
- an AdSense-ready adapter with visitor opt-in;
- public sponsor and crypto-tip buttons.

## Base RPC — easiest free setup

Open **Settings → Base RPC connection → Auto-pick fastest**.

PennySpawn tests both official Base endpoints and selects the healthiest one:

- Standard: `https://mainnet.base.org`
- Flashblocks: `https://mainnet-preconf.base.org`

These endpoints are free and require no account or API key. Base documents them as rate-limited and not intended for heavy production traffic. The control center includes a live chain-ID check, block-height check, latency result, copy button, and automatic recovery between the two free endpoints.

Use **Custom provider** only when you need a higher request allowance from a service such as Coinbase Developer Platform, Alchemy, QuickNode, or another Base-compatible HTTPS RPC provider.

Never paste a wallet seed phrase, private key, exchange password, or signing credential into an RPC field.

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
