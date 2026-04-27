import crypto from "node:crypto";

export type FassetWallet = {
  id: string;
  name: string;
  fireblocksId: string;
  address: string;
  chain: string;
  totalBalance?: string;
  availableBalance?: string;
};

type CanonicalWallet = {
  address: string;
  chain: string;
  fireblocksId: string;
  id: string;
  name: string;
};

export function canonicalizeWallets(wallets: FassetWallet[]): string {
  const sorted = [...wallets].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
  );

  const normalized: CanonicalWallet[] = sorted.map((wallet) => ({
    address: wallet.address,
    chain: wallet.chain,
    fireblocksId: wallet.fireblocksId,
    id: wallet.id,
    name: wallet.name,
  }));

  return JSON.stringify(normalized);
}

export function computeWalletHash(wallets: FassetWallet[], hashKey: string): string {
  return crypto
    .createHmac("sha256", hashKey)
    .update(canonicalizeWallets(wallets), "utf8")
    .digest("hex");
}
