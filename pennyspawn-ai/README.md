# 🧬 PennySpawn Evolution Engine

PennySpawn is an open-source experiment that sells tiny lawful text jobs through x402 and evolves its **strategy configuration** when a generation stops earning.

The default paid price is:

```text
0.01 cent = $0.0001
```

This is not the same as `$0.01`, which is one full cent.

## What the agents do

- **Shield** rejects obvious fraud, phishing, malware, theft, evasion, fake-review work, impersonation, counterfeit/stolen-goods work, and wallet-secret requests.
- **Scout** selects the smallest useful route.
- **Flash** runs deterministic low-latency transformations.
- **Forge** uses Cloudflare Workers AI for higher-quality work.
- **Judge** checks output presence, JSON validity, and unsupported income claims.
- **Wallet** exposes only the configured public receiving address.
- **Ledger** counts fulfilled paid jobs and estimates gross receipts.
- **Darwin** mutates strategy, specialty, token budget, temperature, and route policy.
- **Reaper** retires a stalled generation.
- **Seed** activates the next generation inside the same Worker.

Every agent has `$0` spending authority. The Worker stores no seed phrase or private key.

## Evolution lifecycle

The Worker runs an hourly scheduled evaluation:

```text
paid request arrives
→ fulfill the requested microservice
→ record estimated gross receipts
→ keep the generation alive while sales continue
→ retire it after the configured stall window
→ mutate the genome
→ start the next in-place generation
```

Default retirement rules:

- zero paid jobs for 72 hours after birth;
- no new paid job for 24 hours after a previous sale;
- below `$0.001` generation gross after 168 hours;
- or an authenticated owner forces evolution.

“Kill” means **retire the current strategy record**. It does not delete the Worker, destroy a wallet, create a new account, or deploy uncontrolled copies.

## Paid routes

```text
POST /api/earn      # active genome selects instant or quality
POST /api/instant   # deterministic path
POST /api/forge     # Workers AI path
```

Request body:

```json
{
  "mode": "compress",
  "text": "your text"
}
```

Available modes:

```text
compress
summary
listing
names
json
```

Requests are validated and safety-checked before the payment middleware. A compatible x402 buyer must still discover the endpoint and pay it. Customers, demand, revenue, and profit are never guaranteed.

## Public status routes

```text
GET /health
GET /api/info
GET /api/agents
GET /api/catalog
GET /api/wallet
GET /api/evolution
POST /api/demo
```

`/api/wallet` reports the public receive-only address and a job-ledger gross estimate. It does not query or claim the actual on-chain balance.

## Owner routes

```text
POST /api/admin/evaluate
POST /api/admin/evolve
Authorization: Bearer ADMIN_TOKEN
```

The admin token must remain a GitHub/Cloudflare secret and must never be entered into the public web dashboard.

## iPhone deployment

1. Open the repository in Safari.
2. Open **Settings → Secrets and variables → Actions**.
3. Add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `ADMIN_TOKEN`
4. Add repository variable:
   - `PAY_TO` = your public Base-compatible `0x...` receiving address.
5. Open **Actions → Deploy PennySpawn Worker → Run workflow**.
6. Select `testnet` first.
7. Test the payment challenge, result delivery, wallet address, and evolution status.

Never commit or paste a seed phrase, recovery phrase, private key, password, or wallet signing credential.

## Mainnet warning

Mainnet is manual. Real cryptocurrency may involve taxes, reporting duties, fees, platform rules, and loss risk. The receive-only architecture reduces risk but does not remove it.

## Local checks

```bash
cd pennyspawn-ai/worker
npm install
npm run check
npx wrangler deploy --dry-run
```

## License

MIT. See `LICENSE`.
