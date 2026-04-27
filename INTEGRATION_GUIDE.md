# Fasset Integration POC Guide

## What This POC Covers

This webapp validates the following in a single manual-testing dashboard:

- Create partner user (`POST /partners/create-user`)
- Get partner users (`GET /partners/get-partner-users`)
- Get partner user wallets (`GET /partners/get-partner-user-wallets`)
- Get partner user transactions (`GET /transactions/get-partner-user-transactions`)
- Generate embed token (`POST /partners/embed-token`)
- Compute wallet hash (HMAC-SHA256)
- Embed and configure widget via iframe + `postMessage`
- Receive and inspect webhooks in the dashboard

## Project Structure

- `src/lib/fasset.ts`: typed Fasset API client and config.
- `src/lib/wallet-hash.ts`: canonicalization + HMAC wallet hash logic.
- `src/app/api/poc/users/route.ts`: user create/list proxy.
- `src/app/api/poc/wallets/route.ts`: wallets proxy.
- `src/app/api/poc/transactions/route.ts`: transactions proxy.
- `src/app/api/poc/widget-session/route.ts`: token + wallet hash session endpoint.
- `src/app/api/poc/webhooks/route.ts`: webhook receiver and webhook list endpoint.
- `src/lib/webhooks-store.ts`: local file-backed webhook store used by the dashboard.
- `src/app/page.tsx`: manual testing dashboard + embedded widget.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and fill values:

```bash
cp .env.example .env.local
```

Required variables:

- `FASSET_API_KEY`: partner API key from dashboard.
- `FASSET_WALLET_HASH_KEY`: wallet hash secret key from dashboard.
- `FASSET_API_BASE_URL`: defaults to dev URL.
- `FASSET_WIDGET_URL`: defaults to `https://sb-connect.fasset.tech`.

3. Run app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## How Widget Session Works

`POST /api/poc/widget-session` does this server-side:

1. Generates one-time embed token from Fasset.
2. Fetches user wallets from Fasset.
3. Canonicalizes wallets and computes wallet hash using HMAC-SHA256.
4. Returns `{ token, walletHash, widgetUrl, wallets }`.

The frontend:

1. Loads iframe with `widgetUrl`.
2. Waits for `WIDGET_READY` from widget origin.
3. Sends `WIDGET_CONFIG` with `token`, `walletHash`, and `theme`.

## Manual Validation Flow

1. Create a user in the "Create Partner User" section.
2. Fetch users and select one partner user.
3. Fetch wallets and transactions.
4. Generate widget session.
5. Confirm event log shows:
   - `Received message: WIDGET_READY`
   - `Sent WIDGET_CONFIG payload`
6. Validate widget renders and displays user wallets.
7. Send a webhook to `/api/poc/webhooks` and confirm it appears in the Webhooks panel.

## Webhook Monitoring

The dashboard now includes a Webhooks section that polls the local webhook store and shows received payloads.

### Local Webhook Receiver

The app exposes a webhook endpoint at:

```bash
/api/poc/webhooks
```

Use this endpoint as the target for your ngrok URL, for example:

```bash
https://your-ngrok-subdomain.ngrok.app/api/poc/webhooks
```

### ngrok Setup

1. Start the local app on port 3000.
2. Start ngrok:

```bash
ngrok http 3000
```

3. Copy the HTTPS forwarding URL from ngrok.
4. Configure Fasset webhooks to point to the ngrok URL plus `/api/poc/webhooks`.
5. Open the dashboard and use the Webhooks panel to verify incoming deliveries.

### What the Dashboard Shows

- Received time
- Request headers summary
- Raw webhook body preview
- Auto-poll option for live monitoring
- Manual webhook simulation for local testing

## Notes

- API keys and wallet hash keys are never exposed to client code.
- Error responses from Fasset are forwarded with original status codes where available.
- Embed tokens are one-time use and short-lived; generate a new session per load.
- Webhooks are stored locally in `data/webhooks.json` for this POC.
