import { promises as fs } from "fs";
import { join } from "path";

export type WebhookEvent = {
  id: string;
  receivedAt: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

const getStorePath = () => join(process.cwd(), "data", "webhooks.json");

async function ensureDir() {
  const dataDir = join(process.cwd(), "data");
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (_) {
    // ignore
  }
}

function generateId(): string {
  return `webhook_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function appendWebhook(event: Omit<WebhookEvent, "id">): Promise<WebhookEvent> {
  await ensureDir();
  const storePath = getStorePath();
  let webhooks: WebhookEvent[] = [];

  try {
    const content = await fs.readFile(storePath, "utf-8");
    webhooks = JSON.parse(content) as WebhookEvent[];
  } catch {
    webhooks = [];
  }

  const webhook: WebhookEvent = { id: generateId(), ...event };
  webhooks.push(webhook);
  await fs.writeFile(storePath, JSON.stringify(webhooks, null, 2), "utf-8");
  return webhook;
}

export async function getWebhooks(): Promise<WebhookEvent[]> {
  await ensureDir();
  const storePath = getStorePath();
  try {
    const content = await fs.readFile(storePath, "utf-8");
    return JSON.parse(content) as WebhookEvent[];
  } catch {
    return [];
  }
}
