# Fasset as a Service - API Documentation

## Overview

Fasset as a Service (FaaS) provides a REST API for integrating cryptocurrency wallet management into partner applications.

**Base URL:** `https://dev-faas.fasset.tech/faas-service/api/v1`

**Current Version:** v1.0

All requests and responses use JSON. All timestamps are ISO 8601 (UTC).

---

## User Identifiers

Two distinct identifiers are used throughout the API:

| Identifier | Owned By | Format | Description |
|------------|----------|--------|-------------|
| `userIdFromPartner` | Partner | Any string | The ID assigned by the partner in their own system. Provided when calling `POST /partners/create-user`. |
| `partnerUserId` | Fasset | UUID | The internal ID assigned by Fasset. Returned as the `id` field from `GET /partners/get-partner-users`. |

These are **not interchangeable**. Each endpoint specifies which one to use.

---

## Authentication

FaaS uses **API Key authentication** for server-to-server requests and **Embed Tokens** for client-side widget integration.

### API Key

Include the API key in the `X-API-KEY` header on all requests:

```
X-API-KEY: your_api_key_here
```

**To obtain an API Key:**
1. Log in to the Fasset Partner Dashboard.
2. Navigate to **Settings → API Keys**.
3. Generate a new API key.
4. Store it securely — it is shown only once.

> Never expose the API key in client-side code or public repositories.

### Wallet Hash Secret Key

Widget integration requires a **Wallet Hash Secret Key**, used server-side to compute an HMAC-SHA256 digest over the user's wallet list. The widget verifies this digest on load to ensure the wallet data has not been tampered with by the client.

**To obtain the Wallet Hash Secret Key:**
1. Log in to the Fasset Partner Dashboard.
2. Navigate to **Settings → API Keys**.
3. Click **Generate Wallet Hash Secret**.
4. Copy and store the key securely — **it is shown only once and cannot be retrieved again**.
5. If the key is lost or compromised, generate a new one. This invalidates the previous key and any widget sessions relying on it.

Each partner has exactly one active Wallet Hash Secret at a time. See [Compute Wallet Hash](#step-2-compute-wallet-hash) for usage.

> Treat the Wallet Hash Secret Key with the same care as the API key. Keep it server-side only.

---

## Rate Limits

All requests are rate-limited **per API key**:

| Scope | Limit |
|-------|-------|
| Per API key | **500 requests per minute** |

Exceeding the limit returns `429 Too Many Requests`. Use exponential backoff on `429` responses.

---

## Error Handling

All errors follow this structure:

```json
{
  "statusCode": 400,
  "message": "Description of what went wrong",
  "error": "BadRequest",
  "details": {
    "field": "userIdFromPartner",
    "issue": "Field is required"
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request — invalid parameters |
| 401 | Unauthorized — invalid or missing `X-API-KEY` / embed token |
| 403 | Forbidden — partner or user account disabled |
| 404 | Not Found |
| 409 | Conflict — resource already exists |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Common Errors

These errors may be returned by **any authenticated endpoint** and are not repeated per-endpoint below:

| Status | Message | When |
|--------|---------|------|
| 401 | `Invalid X-API-KEY` | Missing or invalid API key |
| 401 | `Embed token has expired` | Widget-only, token TTL exceeded |
| 403 | `Partner account is disabled` | Partner account disabled |
| 403 | `User account is disabled` | Target user disabled |
| 429 | `Rate limit exceeded. Try again in a few seconds.` | Rate limit hit |

Endpoint sections below document only the **endpoint-specific** errors (e.g., 400 validation, 404 not-found, 409 conflict).

---

## Partner User Management

### 1. Create Partner User

Creates a new user under the partner organization.

**Endpoint:** `POST /partners/create-user`

**Request Body**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userIdFromPartner` | string | Yes | Unique identifier for the user in the partner's system |
| `metadata` | object | No | Additional user information (name, email, etc.) |

**Example**

```bash
curl -X POST https://dev-faas.fasset.tech/faas-service/api/v1/partners/create-user \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key_here" \
  -d '{
    "userIdFromPartner": "user_12345",
    "metadata": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+971501234567"
    }
  }'
```

**Response (201 Created)**

```json
{
  "data": {
    "partnerUserId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "userIdFromPartner": "user_12345",
    "metadata": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+971501234567"
    },
    "isAccountDisabled": false,
    "createdAt": "2026-01-19T10:30:00.000Z"
  },
  "meta": {}
}
```

**Endpoint-specific errors**

| Status | Message |
|--------|---------|
| 409 | `Partner user with this ID already exists` |

---

### 2. Get Partner Users

Returns all users under the partner account.

**Endpoint:** `GET /partners/get-partner-users`

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of users to return (default: 20) |
| `offset` | number | No | Number of users to skip (default: 0) |

**Example**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/partners/get-partner-users?limit=20&offset=0" \
  -H "X-API-KEY: your_api_key_here"
```

**Response (200 OK)**

```json
{
  "data": {
    "partnerUsers": [
      {
        "id": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
        "userIdFromPartner": "user_12345",
        "createdAt": "2025-09-01T04:01:07.804Z",
        "metadata": {
          "name": "John Doe",
          "email": "john.doe@example.com",
          "phone": "+971501234567"
        }
      }
    ],
    "total": 128,
    "limit": 20,
    "offset": 0
  },
  "meta": {}
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `partnerUsers[].id` | string | Internal `partnerUserId` (UUID). Used by other endpoints. |
| `partnerUsers[].userIdFromPartner` | string | The ID provided by the partner when the user was created |
| `partnerUsers[].createdAt` | string | ISO 8601 creation timestamp |
| `partnerUsers[].metadata` | object | Custom metadata associated with the user |
| `total` | number | Total number of partner users |
| `limit` | number | Limit applied to this response |
| `offset` | number | Offset applied to this response |

---

### 3. Get Partner User Transactions

Returns transactions for a specific partner user.

**Endpoint:** `GET /transactions/get-partner-user-transactions`

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |
| `limit` | number | No | Number of transactions to return (default: 20) |
| `offset` | number | No | Number of transactions to skip (default: 0) |
| `fromDate` | string | No | Start date filter (ISO 8601, `YYYY-MM-DD`) |
| `toDate` | string | No | End date filter (ISO 8601, `YYYY-MM-DD`) |

**Example**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/transactions/get-partner-user-transactions?userId=09dc741e-f1dd-42a0-a681-af41fafc1dd8&limit=10&offset=0&fromDate=2026-01-01&toDate=2026-01-31" \
  -H "X-API-KEY: your_api_key_here"
```

**Response (200 OK)**

```json
{
  "data": {
    "data": [
      {
        "id": "750e8400-e29b-41d4-a716-446655440020",
        "userId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
        "amount": "100.50",
        "currency": "USDT",
        "chain": "ETH",
        "transactionHash": "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
        "status": "COMPLETED",
        "createdAt": "2026-01-15T10:30:00.000Z",
        "updatedAt": "2026-01-15T10:35:00.000Z"
      }
    ],
    "total": 45,
    "limit": 10,
    "offset": 0
  },
  "meta": {}
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `data[].id` | string | Unique transaction identifier |
| `data[].userId` | string | Internal `partnerUserId` (UUID) of the user |
| `data[].amount` | string | Transaction amount |
| `data[].currency` | string | Token/currency symbol (e.g., `USDT`, `ETH`) |
| `data[].chain` | string | Blockchain network (e.g., `ETH`, `TRON`) |
| `data[].transactionHash` | string | Blockchain transaction hash |
| `data[].status` | string | Transaction status: `PENDING`, `COMPLETED`, or `FAILED` |
| `data[].createdAt` | string | ISO 8601 creation timestamp |
| `data[].updatedAt` | string | ISO 8601 last-update timestamp |
| `total` | number | Total number of matching transactions |
| `limit` | number | Limit applied to this response |
| `offset` | number | Offset applied to this response |

**Endpoint-specific errors**

| Status | Message |
|--------|---------|
| 400 | `Invalid date format. Use ISO 8601 format (YYYY-MM-DD)` |

---

### 4. Generate Embed Token

Generates a one-time JWT used to load the Fasset Connect widget.

**Endpoint:** `POST /partners/embed-token`

**Request Body**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partnerUserId` | string | Yes | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |
| `theme` | string | No | Widget theme: `light` or `dark` |

**Example**

```bash
curl -X POST https://dev-faas.fasset.tech/faas-service/api/v1/partners/embed-token \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key_here" \
  -d '{
    "partnerUserId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "theme": "dark"
  }'
```

**Response (200 OK)**

```json
{
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "meta": {}
}
```

**Token properties**
- **Expiration:** 5 minutes from generation.
- **One-time use:** Invalidated after first use. Generate a fresh token every time the widget is loaded — **do not cache or reuse embed tokens**.
- **Scope:** Generate server-side only. Never call this endpoint from client code.

---

### 5. Get Partner User Wallets

Returns cryptocurrency wallets for a partner user, filtered by the assets enabled for the partner account.

**Endpoint:** `GET /partners/get-partner-user-wallets`

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partnerUserId` | string | Yes | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |

**Example**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/partners/get-partner-user-wallets?partnerUserId=09dc741e-f1dd-42a0-a681-af41fafc1dd8" \
  -H "X-API-KEY: your_api_key_here"
```

**Response (200 OK)**

```json
{
  "data": {
    "partnerUserId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "wallets": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "USDT",
        "fireblocksId": "fireblocks-vault-123",
        "address": "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
        "chain": "ETH",
        "totalBalance": "250.50",
        "availableBalance": "250.50"
      }
    ]
  },
  "meta": {}
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `partnerUserId` | string | The `partnerUserId` whose wallets are returned |
| `wallets[].id` | string | Unique wallet identifier |
| `wallets[].name` | string | Token/currency symbol |
| `wallets[].fireblocksId` | string | Internal Fireblocks vault identifier |
| `wallets[].address` | string | Blockchain deposit address |
| `wallets[].chain` | string | Blockchain network identifier |
| `wallets[].totalBalance` | string | Total balance |
| `wallets[].availableBalance` | string | Available (spendable) balance |

> This response feeds into the wallet hash computation. See [Compute Wallet Hash](#step-2-compute-wallet-hash).

**Endpoint-specific errors**

| Status | Message |
|--------|---------|
| 400 | `partnerUserId query parameter is required` |
| 404 | `Partner user not found` |

---

## Widget Integration

The Fasset Connect widget is embedded via an iframe. It displays the user's wallets, deposit addresses, and QR codes.

### Integration Flow

#### Step 1: Generate Embed Token

Call `POST /partners/embed-token` server-side. See [Generate Embed Token](#4-generate-embed-token) for the full contract.

#### Step 2: Compute Wallet Hash

The widget verifies that the wallet list rendered to the user matches exactly what the partner's backend fetched. Compute this hash server-side using the Wallet Hash Secret Key:

1. Call `GET /partners/get-partner-user-wallets` to fetch the user's current wallets.
2. Canonicalize the wallets array (see below).
3. Compute `walletHash = HMAC-SHA256(canonicalString, hashKey)` as a lowercase hex digest.

**Canonicalization algorithm**

1. Sort the wallets array ascending by `id` (numeric-aware string compare).
2. For each wallet, keep **only** these fields, in this exact key order: `address`, `chain`, `fireblocksId`, `id`, `name`.
3. Omit `totalBalance` and `availableBalance` — they change with every deposit/withdrawal and would cause spurious mismatches.
4. `JSON.stringify` the resulting array with default (no-space) formatting.

**Reference implementation (Node.js)**

```javascript
const crypto = require('crypto');

function canonicalizeWallets(wallets) {
  const sorted = [...wallets].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );
  const normalized = sorted.map((w) => ({
    address: w.address,
    chain: w.chain,
    fireblocksId: w.fireblocksId,
    id: w.id,
    name: w.name,
  }));
  return JSON.stringify(normalized);
}

function computeWalletHash(wallets, hashKey) {
  return crypto
    .createHmac('sha256', hashKey)
    .update(canonicalizeWallets(wallets), 'utf8')
    .digest('hex');
}
```

> Keep the hash key on the backend. Never expose it in client-side code.

#### Step 3: Embed the Widget

Load the widget in an iframe, then pass authentication via `postMessage`.

**Widget URL**

```
https://sb-connect.fasset.tech
```

**`WIDGET_CONFIG` payload (sent via `postMessage`)**

| Field | Required | Values | Description |
|-------|----------|--------|-------------|
| `type` | Yes | `WIDGET_CONFIG` | Message type identifier |
| `token` | Yes | JWT string | Embed token from Step 1 |
| `walletHash` | Yes | hex string | HMAC-SHA256 digest from Step 2 |
| `theme` | No | `light`, `dark` | Widget theme (default: `light`) |

### React Integration

Your frontend should call your backend endpoint (which returns `token`, `walletHash`, and `widgetUrl`), wait for `WIDGET_READY`, then send `WIDGET_CONFIG`.

```tsx
import { useEffect, useRef, useState } from 'react';

export function FassetWidget({ partnerUserId }: { partnerUserId: string }) {
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const [walletHash, setWalletHash] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    async function init() {
      const res = await fetch('/api/fasset/widget-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerUserId, theme: 'dark' }),
      });
      const data = await res.json();
      setWidgetUrl(data.widgetUrl);
      setWidgetToken(data.token);
      setWalletHash(data.walletHash);
    }
    init();
  }, [partnerUserId]);

  useEffect(() => {
    if (!widgetUrl || !widgetToken || !walletHash) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== new URL(widgetUrl).origin) return;
      if (event.data?.type !== 'WIDGET_READY') return;

      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'WIDGET_CONFIG',
          token: widgetToken,
          walletHash,
          theme: 'dark',
        },
        widgetUrl
      );
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [widgetUrl, widgetToken, walletHash]);

  if (!widgetUrl) return <div>Loading widget...</div>;

  return (
    <iframe
      ref={iframeRef}
      title="Fasset Widget"
      src={widgetUrl}
      width="100%"
      height="600"
      style={{ border: 'none', borderRadius: '8px' }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      allow="clipboard-write"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
```

### Plain HTML Integration

```html
<div id="loading-state">Loading widget...</div>
<iframe
  id="fasset-widget"
  title="Fasset Widget"
  width="100%"
  height="600"
  style="border:none;border-radius:8px;display:none;"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  allow="clipboard-write"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>

<script>
  const iframe = document.getElementById('fasset-widget');
  const loadingState = document.getElementById('loading-state');

  async function loadFassetWidget(partnerUserId) {
    const res = await fetch('/api/fasset/widget-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerUserId, theme: 'dark' }),
    });

    const data = await res.json();
    const widgetToken = data.token;
    const walletHash = data.walletHash;
    const widgetUrl = data.widgetUrl;

    iframe.src = widgetUrl;

    window.addEventListener('message', function(event) {
      if (!widgetUrl) return;

      // Security: only accept messages from the widget origin
      try {
        if (event.origin !== new URL(widgetUrl).origin) return;
      } catch (_) {
        return;
      }

      if (event.data?.type !== 'WIDGET_READY') return;

      // Show iframe, hide spinner
      loadingState.style.display = 'none';
      iframe.style.display = 'block';

      // Send authentication config to the widget
      iframe.contentWindow.postMessage(
        {
          type: 'WIDGET_CONFIG',
          token: widgetToken,
          walletHash: walletHash,
          theme: 'dark',
        },
        widgetUrl
      );
    });
  }

  loadFassetWidget('09dc741e-f1dd-42a0-a681-af41fafc1dd8');
</script>
```

### Backend Reference (Server-Side Session Endpoint)

Expose a backend endpoint that returns `token` and `walletHash` to your frontend:

```javascript
const BASE = 'https://dev-faas.fasset.tech/faas-service/api/v1';

app.post('/api/fasset/widget-session', async (req, res) => {
  const { partnerUserId, theme = 'dark' } = req.body;
  const apiKey = process.env.FASSET_API_KEY;
  const hashKey = process.env.FASSET_WALLET_HASH_KEY;

  const [tokenResp, walletsResp] = await Promise.all([
    fetch(`${BASE}/partners/embed-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ partnerUserId, theme }),
    }).then((r) => r.json()),
    fetch(`${BASE}/partners/get-partner-user-wallets?partnerUserId=${partnerUserId}`, {
      headers: { 'X-API-KEY': apiKey },
    }).then((r) => r.json()),
  ]);

  const walletHash = computeWalletHash(walletsResp.data.wallets, hashKey);
  res.json({
    token: tokenResp.data.token,
    walletHash,
    widgetUrl: 'https://sb-connect.fasset.tech',
  });
});
```

---

## Webhooks

Fasset delivers webhook notifications to the partner's configured endpoint when transaction status changes.

### Configuration

1. Log in to the FaaS Dashboard.
2. Navigate to **Developer → Webhooks**.
3. Enter the HTTPS webhook URL and save.

The webhook endpoint must:
- Accept `POST` requests over HTTPS.
- Respond with `200 OK` within 10 seconds.
- Be publicly accessible.

### Event: `transaction.updated`

Triggered when a transaction status changes.

**Payload**

```json
{
  "data": {
    "userId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "transactionHash": "0xadf77fgg745399fd9df7b70x8d7",
    "status": "COMPLETED",
    "amount": "100",
    "currency": "USDT-ETH",
    "chain": "ETH",
    "timestamp": "2026-01-19T10:35:00.000Z"
  }
}
```

**Fields**

| Field | Type | Description |
|-------|------|-------------|
| `data` | object | Webhook payload container |
| `data.userId` | string | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |
| `data.transactionHash` | string | Blockchain transaction hash |
| `data.status` | string | New transaction status |
| `data.amount` | string | Transaction amount |
| `data.currency` | string | Token/currency identifier |
| `data.chain` | string | Blockchain network identifier |
| `data.timestamp` | string | ISO 8601 emission timestamp |

### Retries

Fasset retries failed deliveries (non-2xx responses or timeouts):

- Retry 1: after about 1 minute
- Retry 2: after about 5 minutes
- Retry 3: after about 25 minutes
- Retry 4: after about 2 hours
- Retry 5: after up to 8 hours

Implement idempotency using `data.transactionHash` to safely handle duplicate deliveries.

### Implementation Example

```javascript
app.post('/api/fasset-webhook', express.json(), async (req, res) => {
  res.status(200).json({ received: true });

  const { data } = req.body;
  if (!data?.transactionHash) return;

  const existing = await db.webhookEvents.findUnique({
    where: { transactionHash: data.transactionHash },
  });
  if (existing) return;

  await db.$transaction([
    db.webhookEvents.create({
      data: { transactionHash: data.transactionHash, processedAt: new Date() },
    }),
    db.transactions.update({
      where: { transactionHash: data.transactionHash },
      data: { status: data.status },
    }),
  ]);
});
```

---

## Supported Currencies & Blockchains

### Fiat Currencies

| Currency | Code |
|----------|------|
| US Dollar | USD |

### Cryptocurrencies

| Token | Chains Supported | Asset ID Examples |
|-------|-----------------|-------------------|
| USDT | Ethereum (ERC20), Tron (TRC20) | `USDT_ERC20`, `TRX_USDT_S2UZ` |
| USDC | Ethereum (ERC20), Sepolia Testnet | `USDC_ETH_TEST5_0GER` |
| ETH | Ethereum, Sepolia Testnet | `ETH_TEST5` |
| TRX | Tron | `TRX_TEST` |

### Chain Identifiers

| Chain | Identifier | Network Type |
|-------|-----------|--------------|
| Ethereum Mainnet | `ETH` | Mainnet |
| Tron Mainnet | `TRON` | Mainnet |
| Sepolia Testnet | `SEPOLIA` | Testnet |

---

## Transaction Status Flow

### Status Lifecycle

```
PENDING → COMPLETED
        → FAILED
```

### Status Descriptions

| Status | Description | Is Final |
|--------|-------------|----------|
| PENDING | Transaction is in progress (submitted/queued/screening/confirming). | No |
| COMPLETED | Transaction successfully completed. | Yes |
| FAILED | Transaction failed and will not complete. | Yes |

---

## Best Practices

Fasset-specific guidance:

- **Do not cache embed tokens.** They are one-time use and expire after 5 minutes. Always generate a fresh token per widget load.
- **Keep the Wallet Hash Secret Key server-side.** Never ship it to the browser or include it in client builds.
- **Recompute the wallet hash on every widget load.** Wallets can change between sessions; a stale hash will cause the widget to fail verification.
- **Use `data.transactionHash` as the idempotency key** when processing `transaction.updated` webhooks.
- **Back off on `429` responses** using exponential backoff before retrying.

### Sandbox

```
Base URL (Sandbox): https://sandbox.fasset.com/faas-service/api/v1
```

---

**Last Updated:** April 21, 2026
