# 🧬 PennySpawn Q-Arena — Live Public PWA

This folder contains the **public iPhone-friendly spectator arena and owner dashboard only**. The active agent and payment Worker must remain in a separate **private GitHub repository**.

## Live-only behavior

- No fake earnings.
- No local “paid job” button.
- No simulated revenue.
- The dashboard stays offline until a private Worker responds at `/api/public/status`.
- Every displayed dollar must come from the Worker’s settled x402 ledger.
- A failed Worker lifecycle transition triggers the non-gory termination animation.

## Survival target

The default objective is one settled one-cent job per second:

```text
$0.01 × 1 job/second
= $0.60 per minute
= $6.00 per 10-minute cycle
= $36.00 per hour
```

This is a target, not guaranteed income. Software cannot create customers or promise profit.

## Owner settings

The public control room can call private Worker endpoints with a session-only bearer token:

```text
POST /api/admin/settings
POST /api/admin/evaluate
POST /api/admin/email-report
```

Supported settings:

- cycle duration from 2 to 60 minutes;
- target cents per second;
- model policy: `auto`, `instant`, `fast`, or `smart`;
- verified report sender and destination.

The admin token is not stored by the page. Never use a wallet seed phrase or private key as an admin token.

## Open-model router

The intended private Worker uses three routes:

1. **Instant deterministic code** for JSON cleanup, validation, formatting, and basic compression.
2. **GLM-4.7-Flash** for fast open-model language work.
3. **Gemma 4** for higher-quality open-model work.

Using instant code for simple tasks is essential because a free model quota cannot realistically process one large-model request every second.

## iPhone PWA

The dashboard includes:

- `app.webmanifest`;
- `sw.js` for shell caching;
- safe-area and full-screen mobile styling;
- an install action for Add to Home Screen;
- a shareable spectator URL using `?worker=https://...`.

## Login warning

The username/password gate on a public static page is only a display lock. Real security must be enforced by the private Worker through `ADMIN_TOKEN` and server-side authorization.

## Source privacy warning

Older commits in this repository may still contain prototype Worker code. Deleting files from the latest branch does not erase Git history. Keep the production Worker in a fresh private repository.
