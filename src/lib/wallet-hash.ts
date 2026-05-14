import crypto from "node:crypto";

/**
 * Wallet hash protocol
 * --------------------
 * The Fasset widget verifies that the partner's backend "owns" the wallet list
 * it embeds by checking an HMAC-SHA256 hash that the partner computes server-side
 * using their wallet hash key. The hash MUST be byte-exact across implementations,
 * so partners reimplementing this in another language (Python, Go, Java, etc.)
 * must follow these rules precisely:
 *
 *   1. Field whitelist: include ONLY `address`, `chain`, `id`, `name`.
 *      Drop every other field returned by Fasset (`totalBalance`,
 *      `availableBalance`, etc.) — including extra fields will change the hash.
 *
 *   2. Field order inside each object: alphabetical — `address`, `chain`, `id`, `name`.
 *      JSON serialization preserves insertion order, so this order is part of the
 *      protocol, not a stylistic choice.
 *
 *   3. Sort the wallet list by `id` ascending, using natural/numeric collation
 *      (so `"2"` sorts before `"10"`, not after). In JS this is
 *      `localeCompare(b, undefined, { numeric: true })`. In other languages, sort
 *      by the integer value of the id when all ids parse as integers; otherwise
 *      apply a natural-sort algorithm.
 *
 *   4. Serialize as compact JSON: no whitespace, no trailing newline, double-quoted
 *      strings, UTF-8 encoded. This is `JSON.stringify(value)` with no spacing
 *      argument in JavaScript.
 *
 *   5. Compute HMAC-SHA256 over the UTF-8 bytes of the canonical string using the
 *      partner's `FASSET_WALLET_HASH_KEY` as the secret. Output the digest as
 *      lowercase hexadecimal (no `0x` prefix, 64 characters).
 *
 * Worked example
 * --------------
 * Given the input wallets:
 *
 *   [
 *    {
 *      "id": "0a672240-66fc-45c7-95b3-ab3ea39469e7",
 *      "name": "ETH",
 *      "address": "0x3Af23011B5438CD75FE1dcA85A5C2006b4666584",
 *      "chain": "SEPOLIA",
 *      "totalBalance": "0.000000000126882",
 *      "availableBalance": "0.000000000126882"
 *    },
 *    {
 *      "id": "72cfa64e-699f-45f0-8302-a415a7ca27ab",
 *      "name": "BTC",
 *      "address": "tb1qj62qxhq9gjehu6v879562c7ypj3pfvv85gf5cu",
 *      "chain": "BTC",
 *      "totalBalance": "0",
 *      "availableBalance": "0"
 *    },
 *    {
 *      "id": "de0a589b-8f84-4ea2-a8de-21bad60ec39e",
 *      "name": "USDT",
 *      "address": "TFLtKgmT1DgYjjxyk3x3c2AX8smQDfpkbn",
 *      "chain": "TRON",
 *      "totalBalance": "0",
 *      "availableBalance": "0"
 *    },
 *    {
 *      "id": "f5e3cdc3-a4a3-4d87-897e-0bc034fdeb64",
 *      "name": "USDC",
 *      "address": "0x3Af23011B5438CD75FE1dcA85A5C2006b4666584",
 *      "chain": "SEPOLIA",
 *      "totalBalance": "0",
 *      "availableBalance": "0"
 *    },
 *    {
 *      "id": "f9c11d16-6d0c-489b-8d3b-2673d69534b2",
 *      "name": "SOL",
 *      "address": "Cs57acHT9CzTaw2aAb4TEgv3qeR4znsWXGpn2wWkEf1H",
 *      "chain": "SOL",
 *      "totalBalance": "0",
 *      "availableBalance": "0"
 *    }
 *  ]
 *
 * The canonical string (after whitelist, field-ordering, natural sort, and compact
 * JSON serialization) is exactly:
 *
 *   [{"address":"0x3Af23011B5438CD75FE1dcA85A5C2006b4666584","chain":"SEPOLIA","id":"0a672240-66fc-45c7-95b3-ab3ea39469e7","name":"ETH"},{"address":"tb1qj62qxhq9gjehu6v879562c7ypj3pfvv85gf5cu","chain":"BTC","id":"72cfa64e-699f-45f0-8302-a415a7ca27ab","name":"BTC"},{"address":"TFLtKgmT1DgYjjxyk3x3c2AX8smQDfpkbn","chain":"TRON","id":"de0a589b-8f84-4ea2-a8de-21bad60ec39e","name":"USDT"},{"address":"0x3Af23011B5438CD75FE1dcA85A5C2006b4666584","chain":"SEPOLIA","id":"f5e3cdc3-a4a3-4d87-897e-0bc034fdeb64","name":"USDC"},{"address":"Cs57acHT9CzTaw2aAb4TEgv3qeR4znsWXGpn2wWkEf1H","chain":"SOL","id":"f9c11d16-6d0c-489b-8d3b-2673d69534b2","name":"SOL"}]
 *
 * With wallet hash key:
 *
 *   577b3307505fae0e62c6538bab1296d6bfc7fe2feea1e1ff9731ca8f8caa5c68
 *
 * The expected HMAC-SHA256 hex digest is:
 *
 *   56014d82a4f541938e55890ded2303c6d89371a0948a2144ce4b942b4ae7a614
 *
 * Use this fixture to validate any port of the algorithm before going live.
 */

export type FassetWallet = {
  id: string;
  name: string;
  address: string;
  chain: string;
  totalBalance?: string;
  availableBalance?: string;
};

type CanonicalWallet = {
  address: string;
  chain: string;
  id: string;
  name: string;
};

/**
 * Produce the canonical string representation of the wallet list that gets fed
 * into HMAC-SHA256. Exposed separately so partners can debug mismatches by
 * comparing the canonical string before hashing.
 */
export function canonicalizeWallets(wallets: FassetWallet[]): string {
  const sorted = [...wallets].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined),
  );

  const normalized: CanonicalWallet[] = sorted.map((wallet) => ({
    address: wallet.address,
    chain: wallet.chain,
    id: wallet.id,
    name: wallet.name,
  }));

  return JSON.stringify(normalized);
}

/**
 * Compute the wallet hash that the widget expects in the `WIDGET_CONFIG` message.
 * See the protocol description at the top of this file for the byte-exact rules
 * partners must follow when reimplementing this in another language.
 */
export function computeWalletHash(wallets: FassetWallet[], hashKey: string): string {
  return crypto
    .createHmac("sha256", hashKey)
    .update(canonicalizeWallets(wallets), "utf8")
    .digest("hex");
}
