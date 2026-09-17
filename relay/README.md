# TDE Relay

Cloudflare Worker + Durable Object room that lets any browser control desktop TDE.

## Local

```bash
cd relay
npm install
npm run dev
```

Then in TDE: Settings → Remote Control → Relay URL `http://127.0.0.1:8787` → Start pairing.

## Deploy (Workers Free)

```bash
cd relay
npm install
npx wrangler login
npm run deploy
```

Paste the printed `*.workers.dev` URL into the desktop Remote Web card.
