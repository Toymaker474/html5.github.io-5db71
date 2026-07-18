# 🧬 PennySpawn Local — GitHub Pages PWA

PennySpawn Local is a static, iPhone-first web app that runs a compact open model in the browser and monitors a **public Base USDC wallet**. It has no Cloudflare Worker, no private backend, no wallet signing authority, and no simulated earnings.

## What is real

- Base USDC balance is read through Ethereum JSON-RPC using `eth_call` against the official USDC contract.
- Incoming balance changes are counted only after the RPC reports them.
- The balance animation updates every frame but interpolates only between confirmed values.
- SmolLM2-135M-Instruct and MiniLM-L6 download to the browser through Transformers.js.
- Registration and login are local to the current device using PBKDF2 password hashing.

## What is not possible on GitHub Pages

GitHub Pages is static hosting. It cannot safely run a secret commercial backend, send autonomous transactions, store private wallet credentials, guarantee customers, or keep JavaScript running after iOS suspends the app.

The agent therefore:

1. observes public wallet balance changes;
2. proposes lawful microservice strategies locally;
3. asks the human to review and perform the next action;
4. retires a strategy after a zero-receipt cycle;
5. creates an offspring plan after a positive confirmed receipt.

“Death” means retiring a local strategy record. It does not harm a person, destroy funds, delete a wallet, or create uncontrolled copies.

## Open models

- `HuggingFaceTB/SmolLM2-135M-Instruct` — Apache-2.0 text-generation model.
- `Xenova/all-MiniLM-L6-v2` — local embedding/ranking model.
- `@huggingface/transformers` — browser inference through ONNX Runtime, WebGPU when available and WASM fallback.

Model files are fetched from Hugging Face on first use and may be cached by the browser. The first download can be large and iOS may evict cached files later.

## Base wallet telemetry

- Network: Base Mainnet, chain ID 8453.
- Default RPC: `https://mainnet.base.org`.
- USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Poll interval: 3 seconds to reduce pressure on the public rate-limited RPC.

Only enter a public `0x...` receiving address. Never enter a seed phrase, recovery phrase, or private key.

## Safety boundary

The local planner blocks or refuses plans involving scams, fraud, phishing, malware, credential theft, impersonation, fake reviews, counterfeit or stolen goods, evasion, spam campaigns, private wallet credentials, or guaranteed-profit claims.

## Files

- `index.html` — interface and local account forms.
- `q.css` — iOS-style responsive visual system.
- `q.js` — account storage, wallet polling, cycles, charts, and arena.
- `model-worker.js` — on-device model loading and planning.
- `app.webmanifest`, `sw.js`, `icon.svg` — installable PWA shell.
