# Commercial setup

GitHub Pages automatically runs PennySpawn in preview mode. Ads and invoice payment requests remain disabled there.

## Free commercial deployment

1. Use the **Deploy commercial app** link in the interface.
2. Connect this GitHub repository to Netlify.
3. Keep the publish directory as `pennyspawn-ai` (already defined in `netlify.toml`).
4. Add a custom domain when ready.

## Ads

1. Apply to Google AdSense using the commercial domain.
2. Wait for approval.
3. Add the public publisher and slot IDs to `monetization-config.js`.
4. Copy the exact AdSense `ads.txt` line into `pennyspawn-ai/ads.txt`.
5. Never click your own ads, use bots, auto-refresh ads, traffic exchanges, or pay people cash/crypto to view them.

## Public receiving addresses

Add only public Base USDC and Bitcoin receiving addresses to `monetization-config.js` or the local Settings screen. Never add seed phrases, recovery phrases, or private keys.

## Accounts

The included signup is device-local. Cross-device email accounts require enabling Netlify Identity separately.
