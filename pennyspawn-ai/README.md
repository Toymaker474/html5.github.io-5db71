# 🧬 PennySpawn Q-Arena — Public Dashboard

This folder contains the **public iPhone-friendly spectator arena and owner dashboard only**. The active agent/Worker source belongs in a separate **private GitHub repository**.

## Survival design

- Paid service price: **$0.01 USDC** per settled request.
- Quarter floor: **$0.05**. Ending a quarter below this floor terminates the demo generation.
- One-hour starting target: **$0.50 gross**.
- Four 15-minute quarter targets: 13¢, 13¢, 12¢, and 12¢.
- Fitness starts at `0.25` and evolves by `×2.5`.
- Reaching a quarter target creates one logical offspring record.
- Missing the full hourly target terminates the generation and activates a mutated replacement.
- Offspring receive **$0 spending authority** and cannot deploy themselves.

The $0.50 value is a target, not a promise. The software cannot guarantee traffic, customers, settlement, revenue, or profit.

## Public experience

- Owner login screen plus spectator access.
- Animated non-gory survival arena using abstract energy beams and particles.
- Watcher AI narration and agent thought feed.
- Quarter and hourly revenue meters.
- Termination archive and offspring tree.
- Local demo controls.
- Live private-Worker status connection.
- Email-report button that opens a prefilled message in the iPhone Mail app.

The login on a public static website is only a **local display lock**. It is not secure authentication and must never protect real wallet, deployment, or administrative operations. Real owner actions must be enforced by the private Worker using server-side secrets.

The supplied dashboard password is stored only as a SHA-256 digest, not readable plaintext. A determined person can still bypass any client-side login because the page itself is public. Do not reuse this password on GitHub, email, banking, wallets, or any other account.

## Public files

- `index.html` — dashboard, login, arena, reports, and controls.
- `q.css` — mobile visual system.
- `q.js` — local simulation, hashed display login, canvas effects, and Worker-status connection.

Demo buttons simulate jobs locally. They do not create revenue, charge customers, or contact a wallet.

## Email reports

The static dashboard can:

1. save an email address in the browser;
2. generate the current earnings report;
3. open a prefilled email in the iPhone Mail app;
4. copy the report.

It cannot silently send automatic hourly email without a private backend email credential. Never place an email-provider password or API key in this public repository.

## Private source setup

1. Download the private engine ZIP supplied in the ChatGPT conversation.
2. Create `pennyspawn-private-engine` on GitHub and select **Private**.
3. Open a Codespace, upload the ZIP, and follow its `README.md`.
4. Deploy to Base Sepolia testnet first.
5. Add only a public `0x...` receiving address. Never add a seed phrase or private key.

## Important history note

An earlier prototype Worker was previously committed to this public repository. Removing files from the current branch does not erase old Git commit history. For complete source confidentiality, make this repository private or replace it with a fresh public GUI-only repository after the private engine repository is created.
