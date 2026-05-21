# Fasset as a Service — API Reference

> **Scope.** This is the authoritative Fasset API reference (endpoints, widget
> integration, webhooks, currency/chain catalogue, transaction lifecycle).
> It is **not** documentation for this example repo — for that, see
> [README.md](README.md) and [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).
>
> Confirm against the version your Fasset onboarding contact provides; APIs
> evolve and this file is a snapshot at time of publishing.

## Overview

Fasset as a Service (FaaS) provides a REST API for integrating cryptocurrency wallet management into partner applications.

**API Base URL:** `https://dev-faas.fasset.tech/faas-service/api/v1`

**Current Version:** v1.0

All requests and responses use JSON. All timestamps are ISO 8601 (UTC).

---

## Integration Modes

FaaS supports two complementary flows. A partner can use one or both, and a single user can move between them.

### Wallet-only flow

The partner provisions wallets for a user; the widget displays deposit addresses and QR codes; on-chain deposits are forwarded as `transaction.updated` webhooks. There is no notion of a payable target — the partner sees raw deposits.

### Payment-order flow

The partner creates an **order** ("user X owes $50") server-side, mints an embed token bound to that order, and embeds the widget. The widget shows the fiat target, quotes the crypto-equivalent at a live rate, and tracks deposits against the target. As the order fills, expires, or is replaced, the partner receives `order.updated` webhooks.

Order-flow is opt-in and additive — wallet-only behavior is unchanged. Exactly one webhook is delivered per deposit; the `event` field inside `data` discriminates between `transaction.updated` and `order.updated`.

---

## User Identifiers

Two distinct identifiers are used throughout the API:

| Identifier | Owned By | Format | Description |
|------------|----------|--------|-------------|
| `userIdFromPartner` | Partner | String, max 64 chars | The ID assigned by the partner in their own system. Provided when calling `POST /partners/create-user`. |
| `partnerUserId` | Fasset | UUID | The internal ID assigned by Fasset. Returned as the `id` field from `GET /partners/get-partner-users`. |

These are **not interchangeable**. Each endpoint specifies which one to use.

---

## Authentication

FaaS uses **API Key authentication** for server-to-server requests, **Embed Tokens** & **Wallet Hash** for client-side widget integration.

### API Key

Include the API key in the `X-API-KEY` header on all requests:

```
X-API-KEY: your_api_key_here
```

**To obtain an API Key:**
1. Log in to the Fasset Partner Dashboard at <https://dev-faas-fe.fasset.tech> using the credentials provided by your Fasset contact person.
2. Navigate to **Settings → API Keys**.
3. Generate a new API key.
4. Store it securely — it is shown only once.

> Never expose the API key in client-side code or public repositories.

### Wallet Hash Secret Key

Widget integration requires a **Wallet Hash Secret Key**, used server-side to compute an HMAC-SHA256 digest over the user's wallet list. The widget verifies this digest on load to ensure the wallet data has not been tampered with by the client.

**To obtain the Wallet Hash Secret Key:**
1. Log in to the Fasset Partner Dashboard at <https://dev-faas-fe.fasset.tech> using the credentials provided by your Fasset contact person.
2. Click on the **Generate Secret Key** button.
3. Copy and store the key securely — **it is shown only once and cannot be retrieved again**.
4. If the key is lost or compromised, generate a new one. This invalidates the previous key and any widget sessions relying on it.

Each partner has exactly one active Wallet Hash Secret at a time. See [Compute Wallet Hash](#step-2-compute-wallet-hash) for usage.

> Treat the Wallet Hash Secret Key with the same care as the API key. Keep it server-side only.

### Whitelisted Widget Domains

Before loading the Fasset Connect widget in production, add every parent-page origin that will embed it to your partner allowlist. The widget enforces origin whitelisting and rejects requests from unregistered origins.

**To whitelist a widget domain:**
1. Log in to the Fasset Partner Dashboard at <https://dev-faas-fe.fasset.tech> using the credentials provided by your Fasset contact person.
2. Navigate to **Developers -> Domains**.
3. Add the origin that will host the widget, including scheme, host, and port if applicable, for example `https://app.partner.com` or `http://localhost:3000`.
4. Repeat for each environment that embeds the widget, such as development, staging, and production.

> Whitelist exact origins, not URL paths. For example, use `https://app.partner.com`, not `https://app.partner.com/dashboard`.

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
| `userIdFromPartner` | string | Yes | Unique identifier for the user in the partner's system. Max 64 characters. |
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
| `page` | number | No | Page number, 1-indexed (default: 1) |
| `pageSize` | number | No | Number of users per page (default: 20) |

**Example**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/partners/get-partner-users?page=1&pageSize=20" \
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
    "page": 1,
    "pageSize": 20
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
| `page` | number | Current page number (1-indexed) |
| `pageSize` | number | Number of items per page |

---

### 3. Get Partner User Transactions

Returns transactions for a specific partner user.

**Endpoint:** `GET /transactions/get-partner-user-transactions`

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |
| `page` | number | No | Page number, 1-indexed (default: 1) |
| `pageSize` | number | No | Number of transactions per page (default: 20) |
| `fromDate` | string | No | Start date filter (ISO 8601, `YYYY-MM-DD`) |
| `toDate` | string | No | End date filter (ISO 8601, `YYYY-MM-DD`) |

**Example**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/transactions/get-partner-user-transactions?userId=09dc741e-f1dd-42a0-a681-af41fafc1dd8&page=1&pageSize=10&fromDate=2026-01-01&toDate=2026-01-31" \
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
    "page": 1,
    "pageSize": 10
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
| `page` | number | Current page number (1-indexed) |
| `pageSize` | number | Number of items per page |

**Endpoint-specific errors**

| Status | Message |
|--------|---------|
| 400 | `Invalid date format. Use ISO 8601 format (YYYY-MM-DD)` |

---

### 4. Generate Embed Token

Generates a JWT used to load the Fasset Connect widget. Optionally binds the token to a specific order for the payment-order flow.

**Endpoint:** `POST /partners/embed-token`

**Request Body**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partnerUserId` | string | Yes | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |
| `orderId` | string | No | An order UUID created via [`POST /orders`](#1-create-or-resume-order). When present, the widget bootstraps in payment-order mode and reads this order. Omit for the wallet-only flow. |
| `theme` | string | No | Widget theme: `light` or `dark` |

**Example — wallet-only**

```bash
curl -X POST https://dev-faas.fasset.tech/faas-service/api/v1/partners/embed-token \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key_here" \
  -d '{
    "partnerUserId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "theme": "dark"
  }'
```

**Example — bound to an order**

```bash
curl -X POST https://dev-faas.fasset.tech/faas-service/api/v1/partners/embed-token \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key_here" \
  -d '{
    "partnerUserId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "orderId": "7a1d6b8e-1c2f-4a9e-9b7d-9c8a1f2e3b4d",
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
- **Expiration:** 30 minutes from generation.
- **Multi-use within window:** A single token can be re-sent to the widget on reload as long as it has not expired. There is no nonce invalidation today.
- **Order binding (when `orderId` supplied):** The token is scoped to that order. Pass the `orderId` returned by [`POST /orders`](#1-create-or-resume-order).
- **Scope:** Mint server-side only. Never call this endpoint from client code.

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

## Payment Orders

The order endpoints power the payment-order flow. Skip this section if you only need wallet-only widgets.

### Order lifecycle

```
NOT_PAID ──deposit────► PARTIALLY_PAID ──deposit────► PAID
   │                          │
   └── expiresAt passed ──────┴── EXPIRED
   └── new order ─────────────── SUPERSEDED
```

- `NOT_PAID` — open, no funds applied yet.
- `PARTIALLY_PAID` — open, at least one deposit applied but target not yet met.
- `PAID` — target met. Terminal.
- `EXPIRED` — `expiresAt` passed before the order was fully paid. Only applies to orders that were created with an `expiresAt`. Terminal.
- `SUPERSEDED` — a newer order replaced this one for the same user. Terminal.
- `CANCELLED` — reserved for future partner-driven cancellation. Terminal.

`PAID`, `EXPIRED`, `SUPERSEDED`, and `CANCELLED` are terminal — orders never leave a terminal state.

Orders have no expiry by default — they stay open until paid, superseded, or cancelled. Partners can opt into an expiry by passing `expiresAt` at creation.

### 1. Create or Resume Order

Creates a new payment order for a user, or returns the existing open order if `externalOrderRef` matches. Idempotent.

**Endpoint:** `POST /orders`

**Request Body**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `partnerUserId` | string | Yes | Internal `partnerUserId` (UUID) |
| `externalOrderRef` | string | Yes | Partner-supplied reference (e.g. invoice number). Unique per `(partner, externalOrderRef)`. Drives idempotency. |
| `fiatAmount` | string | Yes | Decimal string. The fiat target the user must pay. |
| `fiatCurrency` | string | Yes | Fiat currency. `USD` is supported today. |
| `expiresAt` | string | No | ISO 8601 with timezone. Must be a future timestamp. Omit for an order that never auto-expires. |
| `remarks` | string | No | Free-text memo (≤ 500 chars). Echoed in order reads and `order.updated` webhooks. |

**Idempotency rules**

| Existing state for `partnerUserId` | Behavior |
|---|---|
| No open order | New order created |
| Open order, same `externalOrderRef` | Existing order returned unchanged |
| Open order, different `externalOrderRef`, `paidSoFar = 0` | Old order flipped to `SUPERSEDED`, new one created |
| Open order, different `externalOrderRef`, `paidSoFar > 0` | **409 Conflict.** A partial payment cannot be silently discarded — either resume with the original `externalOrderRef`, or wait for the order to be paid / to expire. |
| Open order whose `expiresAt` has passed | Old order flipped to `EXPIRED`, new one created |

**Example**

```bash
curl -X POST https://dev-faas.fasset.tech/faas-service/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key_here" \
  -d '{
    "partnerUserId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "externalOrderRef": "INV-001",
    "fiatAmount": "50",
    "fiatCurrency": "USD",
    "remarks": "May subscription"
  }'
```

**Response (201 Created)**

```json
{
  "data": {
    "id": "7a1d6b8e-1c2f-4a9e-9b7d-9c8a1f2e3b4d",
    "externalOrderRef": "INV-001",
    "fiatAmount": "50",
    "fiatCurrency": "USD",
    "paidSoFar": "0",
    "status": "NOT_PAID",
    "expiresAt": "2026-05-22T07:00:00.000Z",
    "remarks": "May subscription"
  },
  "meta": {}
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Our internal order UUID. Pass to `POST /partners/embed-token` as `orderId`. |
| `externalOrderRef` | string | Echo of the partner-supplied reference |
| `fiatAmount` | string | Target as decimal string |
| `fiatCurrency` | string | Fiat currency code |
| `paidSoFar` | string | Cumulative fiat applied across all completed deposits |
| `status` | string | Order status — see [Order lifecycle](#order-lifecycle) |
| `expiresAt` | string \| null | ISO 8601 if the partner set one; `null` means the order never auto-expires. |
| `remarks` | string \| null | Partner memo, if provided |

**Endpoint-specific errors**

| Status | Message |
|--------|---------|
| 400 | `expiresAt must be a future timestamp` |
| 400 | Validation failures on required fields |
| 409 | `User has an open order ({externalOrderRef}) with a partial payment...` — sent when the user has a `PARTIALLY_PAID` order and the partner tries to create a different one. |

---

### 2. Get Order

Lookup a single order by either Fasset's `orderId` or the partner's `externalOrderRef`. Exactly one is required. Scoped to the calling partner — cross-partner reads return 404.

**Endpoint:** `GET /orders`

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | One of | Fasset's order UUID |
| `externalOrderRef` | string | One of | Partner-supplied reference |

**Example — by orderId**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/orders?orderId=7a1d6b8e-1c2f-4a9e-9b7d-9c8a1f2e3b4d" \
  -H "X-API-KEY: your_api_key_here"
```

**Example — by externalOrderRef**

```bash
curl -X GET "https://dev-faas.fasset.tech/faas-service/api/v1/orders?externalOrderRef=INV-001" \
  -H "X-API-KEY: your_api_key_here"
```

**Response (200 OK)** — same shape as `POST /orders` response.

**Endpoint-specific errors**

| Status | Message |
|--------|---------|
| 400 | `Provide exactly one of orderId or externalOrderRef` |
| 404 | `Order not found` (also returned for cross-partner reads) |

---

## Widget Integration

The Fasset Connect widget is embedded via an iframe. It displays the user's wallets, deposit addresses, and QR codes.

Before integrating the widget, make sure the page origin that embeds the iframe is added in the Partner Dashboard under **Developers -> Domains**. See [Whitelisted Widget Domains](#whitelisted-widget-domains).

### Integration Flow

#### Step 1: Generate Embed Token

Call `POST /partners/embed-token` server-side. Pass `orderId` if you want the widget bound to a specific order; omit it for the wallet-only flow. See [Generate Embed Token](#4-generate-embed-token) for the full contract.

#### Step 2: Compute Wallet Hash

The widget verifies that the wallet list rendered to the user matches exactly what the partner's backend fetched. Compute this hash server-side using the Wallet Hash Secret Key:

1. Call `GET /partners/get-partner-user-wallets` to fetch the user's current wallets.
2. Canonicalize the wallets array (algorithm below).
3. Compute `walletHash = HMAC-SHA256(canonicalString, hashKey)` as a lowercase hex digest.

The hash MUST be byte-exact across implementations, so partners reimplementing this in another language (Python, Go, Java, etc.) need to follow these rules precisely.

**Algorithm**

1. **Whitelist fields.** For each wallet, keep only `address`, `chain`, `id`, and `name`. Drop everything else (`totalBalance`, `availableBalance`, etc.) — extra fields will change the hash. `totalBalance` and `availableBalance` in particular change with every deposit/withdrawal and would cause spurious mismatches.
2. **Order fields alphabetically inside each object**: `address`, `chain`, `id`, `name`. JSON serialization preserves insertion order, so this ordering is part of the protocol.
3. **Sort wallets by id ascending in lexicographic (string) order.** In JavaScript: localeCompare with default options, e.g. String(a.id).localeCompare(String(b.id)). Do not use numeric or “natural” sort unless the server does; byte-for-byte, the sorted order must match the server.
4. **Serialize as compact JSON**: no whitespace, no trailing newline, double-quoted strings, UTF-8 encoded. (`JSON.stringify(value)` with no spacing argument in JS.)
5. **HMAC-SHA256** over the UTF-8 bytes of the canonical string, keyed with the Wallet Hash Secret Key. Output as **lowercase hex** (no `0x` prefix, 64 characters).

**Worked example**

Use this fixture to validate any port of the algorithm before going live.

Input wallets:

```json
[
  { "id": "2", "name": "ETH Wallet", "address": "0xabc0000000000000000000000000000000000002", "chain": "ETH", "totalBalance": "1.5", "availableBalance": "1.5"   },
  { "id": "10", "name": "USDC Wallet", "address": "0xabc0000000000000000000000000000000000010", "chain": "POLYGON", "totalBalance": "250.0", "availableBalance": "200.0" },
  { "id": "1", "name": "BTC Wallet", "address": "bc1qexampleexampleexampleexampleexampleexample", "chain": "BTC", "totalBalance": "0.05", "availableBalance": "0.05"  }
]
```
Wallet hash key: `example_hash_key_do_not_use_in_production`

Canonical string (the exact bytes fed into HMAC-SHA256):

```
[{"address":"bc1qexampleexampleexampleexampleexampleexample","chain":"BTC","id":"1","name":"BTC Wallet"},{"address":"0xabc0000000000000000000000000000000000002","chain":"ETH","id":"2","name":"ETH Wallet"},{"address":"0xabc0000000000000000000000000000000000010","chain":"POLYGON","id":"10","name":"USDC Wallet"}]
```

Expected HMAC-SHA256 (hex): `05724e8e98364c0301156e6c51237b549a56d4d71badd391b377df4edf11cd12`

If your port produces a different digest, compare the canonical string first — mismatches almost always come from extra fields, wrong field order, missing natural sort, or non-compact JSON (e.g. `JSON.stringify(value, null, 2)`).

**Reference implementation (Node.js)**

```javascript
const crypto = require('crypto');

function canonicalizeWallets(wallets) {
  const sorted = [...wallets].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
  const normalized = sorted.map((w) => ({
    address: w.address,
    chain: w.chain,
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

```python
import hmac
import hashlib
import json

def wallet_hash(wallets, hash_key):
    # Sort purely lexicographically by converting id to string
    sorted_wallets = sorted(
        wallets,
        key=lambda w: str(w["id"])
    )
    
    normalized = [
        {"address": w["address"], "chain": w["chain"], "id": w["id"], "name": w["name"]}
        for w in sorted_wallets
    ]
    
    # separators=(",", ":") ensures no whitespace, matching JS JSON.stringify
    canonical = json.dumps(normalized, separators=(",", ":"), ensure_ascii=False)
    
    return hmac.new(
        hash_key.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
```

```go
import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

type Wallet struct {
	Address string `json:"address"`
	Chain   string `json:"chain"`
	ID      string `json:"id"`
	Name    string `json:"name"`
}

func WalletHash(wallets []Wallet, hashKey string) (string, error) {
	// Sort purely by string comparison to match localeCompare
	sort.SliceStable(wallets, func(i, j int) bool {
		return wallets[i].ID < wallets[j].ID
	})

	// json.Marshal in Go produces compact output (no spaces) by default
	canonical, err := json.Marshal(wallets)
	if err != nil {
		return "", err
	}

	mac := hmac.New(sha256.New, []byte(hashKey))
	mac.Write(canonical)
	return hex.EncodeToString(mac.Sum(nil)), nil
}
```

In Go the struct field order (with JSON tags) defines serialization order, so the `Wallet` struct above is already alphabetical. Strip any non-whitelist fields before calling.

> Keep the hash key on the backend. Never expose it in client-side code.

#### Step 3: Embed the Widget

Load the widget in an iframe, then pass authentication via `postMessage`.

**Widget URL**

```
https://dev-sb-connect.fasset.tech
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
    widgetUrl: 'https://dev-sb-connect.fasset.tech',
  });
});
```

---

## Webhooks

Fasset delivers webhook notifications to the partner's configured endpoint as transactions and orders change state.

### Configuration

1. Log in to the FaaS Dashboard.
2. Navigate to **Developer → Webhooks**.
3. Enter the HTTPS webhook URL and save.

The webhook endpoint must:
- Accept `POST` requests over HTTPS.
- Respond with `200 OK` within 10 seconds.
- Be publicly accessible.

### Event discrimination

**Exactly one webhook is delivered per deposit.** The payload's `data.event` field tells you which kind it is.

| Deposit kind | `data.event` value |
|---|---|
| Applied to an open order (became `PARTIALLY_PAID` or `PAID`) | `order.updated` |
| Landed on an order whose TTL just passed | `order.updated` (status `EXPIRED`) |
| Wrong asset for the order / no open order / order already terminal / sub-cent dust | `transaction.updated` |

Branch on `data.event` to route the payload. Wallet-only partners will only ever see `transaction.updated` and can ignore the field.

### Event: `transaction.updated`

Fired for on-chain deposits that are not order-linked. This is the only event emitted in the wallet-only flow.

**Payload**

```json
{
  "data": {
    "event": "transaction.updated",
    "userId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "transactionHash": "0xadf77fgg745399fd9df7b70x8d7",
    "status": "COMPLETED",
    "amount": "100",
    "currency": "USDT",
    "chain": "ETH",
    "timestamp": "2026-01-19T10:35:00.000Z"
  }
}
```

**Fields**

| Field | Type | Description |
|-------|------|-------------|
| `data.event` | string | Always `transaction.updated` |
| `data.userId` | string | Internal `partnerUserId` (UUID) — see [User Identifiers](#user-identifiers) |
| `data.transactionHash` | string | Blockchain transaction hash |
| `data.status` | string | New transaction status: `PENDING`, `COMPLETED`, `FAILED` |
| `data.amount` | string | Raw crypto amount received |
| `data.currency` | string | Token/currency identifier |
| `data.chain` | string | Blockchain network identifier |
| `data.timestamp` | string | ISO 8601 emission timestamp |

### Event: `order.updated`

Fired when a deposit advances or terminates a payment order. Only emitted in the payment-order flow.

**Payload**

```json
{
  "data": {
    "event": "order.updated",
    "userId": "09dc741e-f1dd-42a0-a681-af41fafc1dd8",
    "orderId": "7a1d6b8e-1c2f-4a9e-9b7d-9c8a1f2e3b4d",
    "externalOrderRef": "INV-001",
    "status": "PARTIALLY_PAID",
    "fiatAmount": "50",
    "fiatCurrency": "USD",
    "paidSoFar": "20",
    "remarks": "May subscription",
    "lastTransaction": {
      "transactionHash": "0xadf77fgg745399fd9df7b70x8d7",
      "cryptoAmountReceived": "20.10",
      "cryptoCurrency": "USDC",
      "chain": "ETH",
      "fiatAmountApplied": "20"
    },
    "timestamp": "2026-01-19T10:35:00.000Z"
  }
}
```

**Fields**

| Field | Type | Description |
|-------|------|-------------|
| `data.event` | string | Always `order.updated` |
| `data.userId` | string | Internal `partnerUserId` (UUID) |
| `data.orderId` | string | Fasset's order UUID |
| `data.externalOrderRef` | string | Partner-supplied reference from `POST /orders` |
| `data.status` | string | Order status — `PARTIALLY_PAID`, `PAID`, or `EXPIRED` (the three transitions a deposit can drive) |
| `data.fiatAmount` | string | Order's fiat target |
| `data.fiatCurrency` | string | Fiat currency |
| `data.paidSoFar` | string | Cumulative fiat applied after this deposit |
| `data.remarks` | string \| null | Partner memo passed at order creation |
| `data.lastTransaction.transactionHash` | string | Blockchain hash of the deposit that triggered this event |
| `data.lastTransaction.cryptoAmountReceived` | string | Raw on-chain amount |
| `data.lastTransaction.cryptoCurrency` | string | E.g. `USDC` |
| `data.lastTransaction.chain` | string | E.g. `ETH`, `SEPOLIA` |
| `data.lastTransaction.fiatAmountApplied` | string | Fiat counted toward the order. Capped at the order's remaining balance (overpayment is recorded raw in `cryptoAmountReceived` but never inflates `fiatAmountApplied`). Absent when `status === 'EXPIRED'` (order died at deposit time — the deposit becomes free money). |
| `data.timestamp` | string | ISO 8601 emission timestamp |

**Migrating from the pre-order webhook:** if you previously processed `transaction.updated` for every deposit, switch on `data.event`. Order-linked deposits no longer fire `transaction.updated` — only `order.updated` is sent. The on-chain hash is still available, nested under `lastTransaction`.

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

| Token | Chains Supported |
|-------|-----------------|
| USDT | Ethereum (ERC20), Tron (TRC20) |
| USDC | Ethereum (ERC20), Sepolia Testnet |
| ETH | Ethereum, Sepolia Testnet |
| TRX | Tron |

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

- **Mint a fresh embed token per widget session.** Tokens are valid for 30 minutes and may be re-sent to the widget on reload within that window, but do not persist them beyond the session.
- **Branch on `data.event` when handling webhooks.** Partners using the payment-order flow MUST distinguish `order.updated` from `transaction.updated`; wallet-only partners can ignore the field.
- **Use `data.transactionHash` (or `data.lastTransaction.transactionHash` for `order.updated`) as the idempotency key.** The same hash will never produce two distinct webhooks of the same event type, but retries on delivery failure can re-deliver.
- **Treat orders as the source of truth for fiat amounts.** Raw on-chain amounts in `data.lastTransaction.cryptoAmountReceived` may include overpayment; `fiatAmountApplied` is what was actually counted against the order.
- **Keep the Wallet Hash Secret Key server-side.** Never ship it to the browser or include it in client builds.
- **Recompute the wallet hash on every widget load.** Wallets can change between sessions; a stale hash will cause the widget to fail verification.
- **Back off on `429` responses** using exponential backoff before retrying.

---

**Last Updated:** May 21, 2026
