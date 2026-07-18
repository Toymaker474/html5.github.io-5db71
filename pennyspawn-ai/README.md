# 🧬 PennySpawn Q-Engine — Public Dashboard

This folder now contains the **public iPhone-friendly dashboard only**. The active agent/Worker source is packaged separately for a new **private GitHub repository**.

## Quarter-cycle design

- One-hour starting target: **$0.50 gross**.
- Four 15-minute cycles.
- Exact quarter goals: 13¢, 13¢, 12¢, and 12¢.
- Paid service price: **$0.01 USDC** per settled x402 request.
- Fitness starts at `0.25` and evolves by `×2.5`.
- Successful quarter: preserve the useful strategy and create one logical offspring record.
- Failed quarter: mark that strategy dead and activate a mutated replacement.
- Successful hour: multiply the next hourly target by `2.5`.
- Offspring receive **$0 spending authority** and cannot deploy themselves.

The $0.50 target is an objective, not a promise. The software cannot guarantee traffic, customers, payments, or profit.

## Public files

- `index.html` — dashboard structure.
- `q.css` — mobile visual system.
- `q.js` — local demo and live Worker-status connection.

The demo buttons simulate jobs locally. They do not create revenue or contact a wallet.

## Private source setup

1. Download the private engine ZIP supplied in the ChatGPT conversation.
2. Create `pennyspawn-private-engine` on GitHub and select **Private**.
3. Open a Codespace, upload the ZIP, and follow its `README.md`.
4. Deploy to Base Sepolia testnet first.
5. Add only a public `0x...` receiving address. Never add a seed phrase or private key.

## Important history note

An earlier prototype Worker was previously committed to this public repository. Removing files from the current branch does not erase old Git commit history. For complete source confidentiality, make this repository private or replace it with a fresh public GUI-only repository after the private engine repository is created.
