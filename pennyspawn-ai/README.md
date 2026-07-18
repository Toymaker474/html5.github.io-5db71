# 🧬 PennySpawn Agent Swarm

PennySpawn is an honest, open-source starter for a **$0.01 USDC text microservice** with seven controlled software-agent roles:

- **Shield** blocks obvious scams, phishing, fraud, malware, theft, evasion, fake reviews, impersonation, counterfeit/stolen-goods work, and wallet-secret requests.
- **Scout** routes each task.
- **Flash** performs deterministic low-latency work without model inference.
- **Forge** uses Cloudflare Workers AI for higher-quality work.
- **Judge** validates output format and basic honesty constraints.
- **Ledger** records completed jobs and an estimated gross total; it never holds a private key.
- **Spawn** proposes a specialized child after the threshold; it cannot deploy itself.

## Important truth

`$0.01` means **one cent**. `0.01 cent` would be `$0.0001`.

Warm deterministic code may sometimes execute internally near one millisecond, but a real paid request also requires mobile-network transit, internet routing, wallet signing, and payment settlement. **End-to-end one-millisecond payment cannot be guaranteed.**

This code can accept payments after owner configuration. It cannot create money from nothing and cannot guarantee customers, traffic, revenue, income, or profit.

## Free-tier architecture

| Part | Service | Purpose |
|---|---|---|
| GUI | GitHub Pages | iPhone dashboard, free local demo, agent trace |
| API | Cloudflare Workers | Hono API and x402 middleware |
| Fast route | Deterministic agent path | Low-latency transformations without model inference |
| Quality route | Cloudflare Workers AI | Higher-quality AI transformation |
| Stats | SQLite Durable Object | Job, route, mode, and gross-estimate counters |
| Payment | x402 / USDC | Pay-per-request challenge and settlement |

Free tiers have usage limits. The project does not promise unlimited free hosting or inference.

## Routes

```text
GET  /
GET  /health
GET  /api/info
GET  /api/agents
POST /api/demo
POST /api/demo/swarm
POST /api/instant            # x402 protected, deterministic fast path
POST /api/forge              # x402 protected, Workers AI quality path
GET  /api/admin/clone-plan   # Bearer ADMIN_TOKEN
```

Request body:

```json
{
  "mode": "compress",
  "text": "your text"
}
```

Modes: `compress`, `summary`, `listing`, `names`, `json`.

Responses report `internalProcessingMs` separately from network and payment time. The number must not be marketed as end-to-end latency.

## iPhone deployment

1. Open the repository in Safari.
2. Open **Settings → Secrets and variables → Actions**.
3. Add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `ADMIN_TOKEN`
4. Add repository variable:
   - `PAY_TO` = your **public** Base-compatible `0x...` receiving address.
5. Open **Actions → Deploy PennySpawn Worker → Run workflow**.
6. Select `testnet` first.

Never add a seed phrase, recovery phrase, private key, password, or wallet signing credential to GitHub or the web dashboard.

## Clone behavior

A clone is only a configuration proposal based on the most-used mode and route. It has:

- `$0` spending power;
- no wallet-creation authority;
- no trading or borrowing authority;
- no account-creation authority;
- mandatory human deployment approval.

## Mainnet

Mainnet is intentionally manual. Test the payment challenge and result delivery on Base Sepolia first. Real cryptocurrency may involve fees, taxes, reporting requirements, and platform rules.

## Local development

```bash
cd pennyspawn-ai/worker
npm install
npm run check
npm run dev
```

## License

MIT. See `LICENSE`.
