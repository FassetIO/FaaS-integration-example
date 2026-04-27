"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type PartnerUser = {
  id: string;
  userIdFromPartner: string;
  createdAt: string;
  metadata?: Record<string, JsonValue>;
};

type Wallet = {
  id: string;
  name: string;
  fireblocksId: string;
  address: string;
  chain: string;
  totalBalance: string;
  availableBalance: string;
};

type WidgetSession = {
  token: string;
  walletHash: string;
  widgetUrl: string;
  wallets: Wallet[];
};

type TransactionItem = {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  chain: string;
  transactionHash: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type WebhookEvent = {
  id: string;
  receivedAt: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

async function safeJson(response: Response) {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return null;
  }
}

export default function Home() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [userIdFromPartner, setUserIdFromPartner] = useState("demo_user_001");
  const [metadataJson, setMetadataJson] = useState(
    JSON.stringify(
      {
        name: "Jane Doe",
        email: "jane@example.com",
      },
      null,
      2,
    ),
  );

  const [partnerUsers, setPartnerUsers] = useState<PartnerUser[]>([]);
  const [selectedPartnerUserId, setSelectedPartnerUserId] = useState("");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  const [widgetSession, setWidgetSession] = useState<WidgetSession | null>(null);
  const [widgetTheme, setWidgetTheme] = useState<"light" | "dark">("dark");

  const [responseLog, setResponseLog] = useState<JsonValue | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [webhookPolling, setWebhookPolling] = useState(false);

  const selectedUser = useMemo(
    () => partnerUsers.find((user) => user.id === selectedPartnerUserId) || null,
    [partnerUsers, selectedPartnerUserId],
  );

  useEffect(() => {
    if (!widgetSession?.widgetUrl) {
      return;
    }

    const session = widgetSession;

    function onMessage(event: MessageEvent) {
      let origin: string;

      try {
        origin = new URL(session.widgetUrl).origin;
      } catch {
        setEventLog((logs) => ["Invalid widget URL", ...logs].slice(0, 15));
        return;
      }

      if (event.origin !== origin) {
        return;
      }

      const messageType =
        typeof event.data === "object" && event.data
          ? (event.data as { type?: string }).type
          : undefined;

      setEventLog((logs) => [
        `Received message: ${messageType ?? "unknown"}`,
        ...logs,
      ].slice(0, 15));

      if (messageType !== "WIDGET_READY") {
        return;
      }

      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "WIDGET_CONFIG",
          token: session.token,
          walletHash: session.walletHash,
          theme: widgetTheme,
        },
        session.widgetUrl,
      );

      setEventLog((logs) => ["Sent WIDGET_CONFIG payload", ...logs].slice(0, 15));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [widgetSession, widgetTheme]);

  async function runRequest<T>(task: () => Promise<T>) {
    setLoading(true);
    setError(null);
    try {
      const result = await task();
      setResponseLog(result as JsonValue);
      return result;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown error";
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let metadata: Record<string, JsonValue> | undefined;
    if (metadataJson.trim()) {
      metadata = JSON.parse(metadataJson) as Record<string, JsonValue>;
    }

    await runRequest(async () => {
      const response = await fetch("/api/poc/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIdFromPartner, metadata }),
      });

      const body = await safeJson(response);
      if (!response.ok) {
        const message =
          typeof body === "object" && body && "message" in body
            ? String((body as { message?: string }).message)
            : "Request failed";
        throw new Error(message);
      }
      return body;
    });
  }

  async function loadPartnerUsers() {
    const body = await runRequest(async () => {
      const response = await fetch("/api/poc/users?limit=50&offset=0", {
        method: "GET",
      });
      const parsed = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: string }).message)
            : "Request failed",
        );
      }
      return parsed;
    });

    const users =
      typeof body === "object" &&
      body &&
      "data" in body &&
      typeof body.data === "object" &&
      body.data &&
      "partnerUsers" in body.data &&
      Array.isArray(body.data.partnerUsers)
        ? (body.data.partnerUsers as PartnerUser[])
        : [];

    setPartnerUsers(users);
    if (users.length > 0 && !selectedPartnerUserId) {
      setSelectedPartnerUserId(users[0].id);
    }
  }

  async function loadWallets() {
    if (!selectedPartnerUserId) {
      setError("Select a partner user first");
      return;
    }

    const body = await runRequest(async () => {
      const response = await fetch(
        `/api/poc/wallets?partnerUserId=${encodeURIComponent(selectedPartnerUserId)}`,
      );
      const parsed = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: string }).message)
            : "Request failed",
        );
      }
      return parsed;
    });

    const loadedWallets =
      typeof body === "object" &&
      body &&
      "data" in body &&
      typeof body.data === "object" &&
      body.data &&
      "wallets" in body.data &&
      Array.isArray(body.data.wallets)
        ? (body.data.wallets as Wallet[])
        : [];

    setWallets(loadedWallets);
  }

  async function loadTransactions() {
    if (!selectedPartnerUserId) {
      setError("Select a partner user first");
      return;
    }

    const body = await runRequest(async () => {
      const response = await fetch(
        `/api/poc/transactions?userId=${encodeURIComponent(selectedPartnerUserId)}&limit=20&offset=0`,
      );
      const parsed = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: string }).message)
            : "Request failed",
        );
      }
      return parsed;
    });

    const loadedTransactions =
      typeof body === "object" &&
      body &&
      "data" in body &&
      typeof body.data === "object" &&
      body.data &&
      "data" in body.data &&
      Array.isArray(body.data.data)
        ? (body.data.data as TransactionItem[])
        : [];

    setTransactions(loadedTransactions);
  }

  async function createWidgetSession() {
    if (!selectedPartnerUserId) {
      setError("Select a partner user first");
      return;
    }

    const body = await runRequest(async () => {
      const response = await fetch("/api/poc/widget-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerUserId: selectedPartnerUserId, theme: widgetTheme }),
      });
      const parsed = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: string }).message)
            : "Request failed",
        );
      }
      return parsed;
    });

    const session =
      typeof body === "object" && body && "data" in body
        ? (body.data as WidgetSession)
        : null;

    setWidgetSession(session);
    setEventLog((logs) => ["Widget session generated", ...logs].slice(0, 15));
  }

  async function loadWebhooks() {
    try {
      const response = await fetch("/api/poc/webhooks");
      const parsed = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: string }).message)
            : "Request failed",
        );
      }

      const loaded =
        typeof parsed === "object" && parsed && "data" in parsed && Array.isArray(parsed.data)
          ? (parsed.data as WebhookEvent[])
          : [];

      setWebhooks(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to load webhooks:", message);
    }
  }

  useEffect(() => {
    if (!webhookPolling) return;

    loadWebhooks();
    const interval = setInterval(loadWebhooks, 3000);
    return () => clearInterval(interval);
  }, [webhookPolling]);

  async function simulateWebhook() {
    await runRequest(async () => {
      const samplePayload = {
        eventType: "test_webhook",
        timestamp: new Date().toISOString(),
        data: {
          userId: selectedPartnerUserId || "test_user",
          action: "test_simulation",
        },
      };

      const response = await fetch("/api/poc/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
      });

      const parsed = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          typeof parsed === "object" && parsed && "message" in parsed
            ? String((parsed as { message?: string }).message)
            : "Request failed",
        );
      }

      await loadWebhooks();
      return parsed;
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <header className="rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-800 via-slate-900 to-cyan-950 p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Integration POC</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Fasset Widget + API Validation Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Use this page to create users, fetch wallets/transactions, generate a one-time widget session,
            and validate postMessage integration end-to-end.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold">1. Create Partner User</h2>
            <form className="mt-4 space-y-3" onSubmit={createUser}>
              <div>
                <label className="mb-1 block text-sm text-slate-300">userIdFromPartner</label>
                <input
                  className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
                  value={userIdFromPartner}
                  onChange={(event) => setUserIdFromPartner(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300">metadata JSON</label>
                <textarea
                  className="h-28 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-xs"
                  value={metadataJson}
                  onChange={(event) => setMetadataJson(event.target.value)}
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                disabled={loading}
              >
                Create User
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold">2. Load Partner Users</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
                onClick={loadPartnerUsers}
                disabled={loading}
              >
                Fetch Users
              </button>
              <select
                className="min-w-[260px] rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
                value={selectedPartnerUserId}
                onChange={(event) => setSelectedPartnerUserId(event.target.value)}
              >
                <option value="">Select partner user</option>
                {partnerUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.userIdFromPartner} ({user.id})
                  </option>
                ))}
              </select>
            </div>
            {selectedUser ? (
              <p className="mt-3 text-xs text-slate-300">Selected: {selectedUser.userIdFromPartner}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">6. Webhooks</h2>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={webhookPolling}
                onChange={(e) => setWebhookPolling(e.target.checked)}
                className="rounded"
              />
              Auto-poll
            </label>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
              onClick={loadWebhooks}
              disabled={loading}
            >
              Refresh Webhooks
            </button>
            <button
              className="rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:opacity-50"
              onClick={simulateWebhook}
              disabled={loading}
            >
              Simulate Webhook
            </button>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-200">Received Webhooks ({webhooks.length})</h3>
            <ul className="mt-2 max-h-64 space-y-2 overflow-auto">
              {webhooks.length === 0 ? (
                <li className="text-xs text-slate-400">No webhooks received yet.</li>
              ) : (
                webhooks.map((webhook) => {
                  const headerSummary = Object.keys(webhook.headers).slice(0, 3).join(", ");
                  const bodyStr = JSON.stringify(webhook.body);
                  const truncated = bodyStr.length > 200 ? bodyStr.substring(0, 200) + "..." : bodyStr;

                  return (
                    <li key={webhook.id} className="rounded border border-slate-700 bg-slate-950 p-3 text-xs">
                      <p className="text-slate-300">
                        <span className="font-semibold">{new Date(webhook.receivedAt).toLocaleString()}</span>
                      </p>
                      <p className="mt-1 text-slate-400">Headers: {headerSummary}</p>
                      <p className="mt-1 break-all text-slate-400">Body: {truncated}</p>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold">3. Wallets & Transactions</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                onClick={loadWallets}
                disabled={loading}
              >
                Get Wallets
              </button>
              <button
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                onClick={loadTransactions}
                disabled={loading}
              >
                Get Transactions
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Wallets ({wallets.length})</h3>
                <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-xs">
                  {wallets.map((wallet) => (
                    <li key={wallet.id} className="rounded border border-slate-700 bg-slate-950 p-2">
                      <p>{wallet.name} on {wallet.chain}</p>
                      <p className="mt-1 text-slate-400">{wallet.address}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-200">Transactions ({transactions.length})</h3>
                <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-xs">
                  {transactions.map((transaction) => (
                    <li key={transaction.id} className="rounded border border-slate-700 bg-slate-950 p-2">
                      <p>
                        {transaction.amount} {transaction.currency} - {transaction.status}
                      </p>
                      <p className="mt-1 text-slate-400">{transaction.transactionHash}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold">4. Generate Widget Session</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
                value={widgetTheme}
                onChange={(event) => setWidgetTheme(event.target.value as "light" | "dark")}
              >
                <option value="dark">dark</option>
                <option value="light">light</option>
              </select>
              <button
                className="rounded-md bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-400 disabled:opacity-50"
                onClick={createWidgetSession}
                disabled={loading}
              >
                Generate Token + Wallet Hash
              </button>
            </div>

            {widgetSession ? (
              <div className="mt-4 rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
                <p>Widget URL: {widgetSession.widgetUrl}</p>
                <p className="mt-1 break-all">Wallet Hash: {widgetSession.walletHash}</p>
                <p className="mt-1">Wallet Count: {widgetSession.wallets.length}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold">5. Embedded Widget</h2>
          {!widgetSession ? (
            <p className="mt-3 text-sm text-slate-300">Generate a widget session first to render iframe.</p>
          ) : (
            <div className="mt-4 space-y-3">
              <iframe
                ref={iframeRef}
                title="Fasset Widget"
                src={widgetSession.widgetUrl}
                width="100%"
                height="600"
                className="w-full rounded-xl border border-slate-600 bg-slate-950"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                allow="clipboard-write"
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Widget Event Log</h3>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  {eventLog.length === 0 ? <li>No events yet.</li> : null}
                  {eventLog.map((entry, index) => (
                    <li key={`${entry}-${index}`} className="rounded border border-slate-700 bg-slate-950 px-2 py-1">
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-rose-900 bg-rose-950/30 p-5">
            <h2 className="text-xl font-semibold text-rose-200">Errors</h2>
            <p className="mt-3 min-h-10 text-sm text-rose-300">{error || "No errors"}</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold">Latest API Response</h2>
            <pre className="mt-3 max-h-72 overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
              {JSON.stringify(responseLog, null, 2)}
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}
