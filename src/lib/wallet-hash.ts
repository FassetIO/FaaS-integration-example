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
 *      Drop every other field returned by Fasset (`fireblocksId`, `totalBalance`,
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
 *     { id: "2",  name: "ETH Wallet",  fireblocksId: "fb_002", address: "0xabc0000000000000000000000000000000000002", chain: "ETH",     totalBalance: "1.5",   availableBalance: "1.5"   },
 *     { id: "10", name: "USDC Wallet", fireblocksId: "fb_010", address: "0xabc0000000000000000000000000000000000010", chain: "POLYGON", totalBalance: "250.0", availableBalance: "200.0" },
 *     { id: "1",  name: "BTC Wallet",  fireblocksId: "fb_001", address: "bc1qexampleexampleexampleexampleexampleexample",  chain: "BTC",     totalBalance: "0.05",  availableBalance: "0.05"  },
 *   ]
 *
 * The canonical string (after whitelist, field-ordering, natural sort, and compact
 * JSON serialization) is exactly:
 *
 *   [{"address":"bc1qexampleexampleexampleexampleexampleexample","chain":"BTC","id":"1","name":"BTC Wallet"},{"address":"0xabc0000000000000000000000000000000000002","chain":"ETH","id":"2","name":"ETH Wallet"},{"address":"0xabc0000000000000000000000000000000000010","chain":"POLYGON","id":"10","name":"USDC Wallet"}]
 *
 * With wallet hash key:
 *
 *   example_hash_key_do_not_use_in_production
 *
 * The expected HMAC-SHA256 hex digest is:
 *
 *   05724e8e98364c0301156e6c51237b549a56d4d71badd391b377df4edf11cd12
 *
 * Use this fixture to validate any port of the algorithm before going live.
 */

export type FassetWallet = {
  id: string;
  name: string;
  fireblocksId?: string;
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
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
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
