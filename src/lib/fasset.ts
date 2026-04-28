import type { FassetWallet } from "@/lib/wallet-hash";

const DEFAULT_BASE_URL = "https://dev-faas.fasset.tech/faas-service/api/v1";
const DEFAULT_WIDGET_URL = "https://dev-sb-connect.fasset.tech";

type FassetApiError = {
  statusCode?: number;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
};

export class FassetRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "FassetRequestError";
    this.statusCode = statusCode;
  }
}

type FassetEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

export type CreateUserInput = {
  userIdFromPartner: string;
  metadata?: Record<string, unknown>;
};

export type PartnerUser = {
  id: string;
  userIdFromPartner: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type TransactionItem = {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  chain: string;
  transactionHash: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  updatedAt: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getFassetConfig() {
  return {
    baseUrl: process.env.FASSET_API_BASE_URL || DEFAULT_BASE_URL,
    apiKey: getRequiredEnv("FASSET_API_KEY"),
    walletHashKey: getRequiredEnv("FASSET_WALLET_HASH_KEY"),
    widgetUrl: process.env.FASSET_WIDGET_URL || DEFAULT_WIDGET_URL,
  };
}

async function parseError(response: Response): Promise<{ message: string; statusCode: number }> {
  try {
    const body = (await response.json()) as FassetApiError;
    return {
      message: body.message || `Fasset request failed with status ${response.status}`,
      statusCode: body.statusCode ?? response.status,
    };
  } catch {
    return {
      message: `Fasset request failed with status ${response.status}`,
      statusCode: response.status,
    };
  }
}

async function requestFasset<T>(path: string, init?: RequestInit): Promise<FassetEnvelope<T>> {
  const { baseUrl, apiKey } = getFassetConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const parsed = await parseError(response);
    throw new FassetRequestError(parsed.message, parsed.statusCode);
  }

  return (await response.json()) as FassetEnvelope<T>;
}

export async function createPartnerUser(input: CreateUserInput) {
  return requestFasset<{ partnerUserId: string; userIdFromPartner: string; metadata?: Record<string, unknown> }>(
    "/partners/create-user",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getPartnerUsers(limit = 20, offset = 0) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return requestFasset<{ partnerUsers: PartnerUser[]; total: number; limit: number; offset: number }>(
    `/partners/get-partner-users?${params.toString()}`,
  );
}

export async function generateEmbedToken(partnerUserId: string, theme: "light" | "dark" = "dark") {
  return requestFasset<{ token: string }>("/partners/embed-token", {
    method: "POST",
    body: JSON.stringify({ partnerUserId, theme }),
  });
}

export async function getPartnerUserWallets(partnerUserId: string) {
  const params = new URLSearchParams({ partnerUserId });
  return requestFasset<{ partnerUserId: string; wallets: FassetWallet[] }>(
    `/partners/get-partner-user-wallets?${params.toString()}`,
  );
}

export async function getPartnerUserTransactions(options: {
  userId: string;
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
}) {
  const params = new URLSearchParams({
    userId: options.userId,
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0),
  });

  if (options.fromDate) {
    params.set("fromDate", options.fromDate);
  }
  if (options.toDate) {
    params.set("toDate", options.toDate);
  }

  return requestFasset<{ data: TransactionItem[]; total: number; limit: number; offset: number }>(
    `/transactions/get-partner-user-transactions?${params.toString()}`,
  );
}
