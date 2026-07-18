# 🧬 PennySpawn AI

PennySpawn is an honest, open-source starter for a **$0.01 USDC text microservice**. It includes:

- an iPhone-friendly static web dashboard hosted by GitHub Pages;
- a Cloudflare Worker using Workers AI;
- x402 payment protection for `POST /api/forge`;
- persistent completed-job statistics using a SQLite-backed Durable Object;
- a manual clone proposal after a configurable number of completed jobs;
- hard blocks for obvious phishing, fraud, malware, impersonation, fake reviews, counterfeit sales, stolen goods, evasion, and wallet-secret requests.

## Important truth

This code can accept payments after you configure it. It **cannot guarantee customers, traffic, income, or profit**. A clone is only a proposed second service configuration. It does not spread itself, create accounts, or spend money.

## Free-tier architecture

| Part | Service | Purpose |
|---|---|---|
| GUI | GitHub Pages | Static dashboard and local free tools |
| API | Cloudflare Workers | Hono API and x402 middleware |
| AI | Cloudflare Workers AI | Small hosted open-weight model |
| Stats | SQLite Durable Object | Persistent job counter |
| Payment | x402 / USDC | Pay-per-request challenge and settlement |

Free tiers have usage limits. Requests fail after free limits instead of silently guaranteeing unlimited service.

## Routes

```text
GET  /
GET  /health
GET  /api/info
POST /api/demo
POST /api/forge              # x402 protected
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

## iPhone deployment

The repository already contains a manual GitHub Actions workflow.

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

Never add a seed phrase or private key anywhere in this repository.

## Mainnet

Mainnet is intentionally not automatic. Test first. The deploy workflow switches to Base mainnet only when you manually select `mainnet`. Real cryptocurrency and possible tax/reporting obligations are involved.

## Local development

```bash
cd pennyspawn-ai/worker
npm ci
npm run check
npm run dev
```

## License

MIT. See `LICENSE`.
