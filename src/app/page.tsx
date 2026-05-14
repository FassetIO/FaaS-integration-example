"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { canonicalizeWallets } from "@/lib/wallet-hash";

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

type RequestRecord = {
  method: string;
  url: string;
  body: JsonValue;
};

async function safeJson(response: Response) {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return null;
  }
}

async function apiFetch<T = JsonValue>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const parsed = await safeJson(response);
  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as { message?: string }).message)
        : "Request failed";
    throw new Error(message);
  }
  return parsed as T;
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

  const [requestLog, setRequestLog] = useState<RequestRecord | null>(null);
  const [responseLog, setResponseLog] = useState<JsonValue | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [webhookPolling, setWebhookPolling] = useState(false);

  function trackedFetch<T = JsonValue>(path: string, init?: RequestInit): Promise<T> {
    let parsedBody: JsonValue = null;
    if (init?.body && typeof init.body === "string") {
      try {
        parsedBody = JSON.parse(init.body) as JsonValue;
      } catch {
        parsedBody = init.body as JsonValue;
      }
    }
    setRequestLog({
      method: (init?.method ?? "GET").toUpperCase(),
      url: path,
      body: parsedBody,
    });
    return apiFetch<T>(path, init);
  }

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

      // SECURITY: do not remove this origin check. The embed token and wallet
      // hash are sent to event.source via postMessage below; without this guard
      // any iframe on the page could read them by posting a forged WIDGET_READY.
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
      try {
        metadata = JSON.parse(metadataJson) as Record<string, JsonValue>;
      } catch {
        setError("Invalid JSON in metadata field");
        return;
      }
    }

    await runRequest(() =>
      trackedFetch("/api/fasset/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIdFromPartner, metadata }),
      }),
    );
  }

  async function loadPartnerUsers() {
    const body = await runRequest(() => trackedFetch("/api/fasset/users?page=1&pageSize=50"));

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

    const body = await runRequest(() =>
      trackedFetch(`/api/fasset/wallets?partnerUserId=${encodeURIComponent(selectedPartnerUserId)}`),
    );

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

    const body = await runRequest(() =>
      trackedFetch(
        `/api/fasset/transactions?userId=${encodeURIComponent(selectedPartnerUserId)}&page=1&pageSize=20`,
      ),
    );

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

    const body = await runRequest(() =>
      trackedFetch("/api/fasset/widget-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerUserId: selectedPartnerUserId, theme: widgetTheme }),
      }),
    );

    const session =
      typeof body === "object" && body && "data" in body
        ? (body.data as WidgetSession)
        : null;

    setWidgetSession(session);
    setEventLog((logs) => ["Widget session generated", ...logs].slice(0, 15));
  }

  async function loadWebhooks() {
    try {
      const parsed = await trackedFetch("/api/fasset/webhooks");

      const loaded =
        typeof parsed === "object" && parsed && "data" in parsed && Array.isArray(parsed.data)
          ? (parsed.data as WebhookEvent[])
          : [];

      setWebhooks(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load webhooks: ${message}`);
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

      const parsed = await trackedFetch("/api/fasset/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
      });

      await loadWebhooks();
      return parsed;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-100 text-cyan-700">
              <span className="text-base font-bold">F</span>
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-slate-900 sm:text-base">
                Fasset Integration Example
              </h1>
              <p className="text-xs text-slate-500">
                Reference dashboard for the Fasset API and embeddable widget
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            Sandbox
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Step
            number={1}
            title="Provision a Partner User"
            subtitle="Create a partner user, then fetch and select one to drive the rest of the flow."
          >
            <form className="space-y-3" onSubmit={createUser}>
              <Field label="userIdFromPartner">
                <input
                  className={inputClass}
                  value={userIdFromPartner}
                  onChange={(event) => setUserIdFromPartner(event.target.value)}
                  required
                />
              </Field>
              <Field label="metadata JSON">
                <textarea
                  className={`${inputClass} h-28 font-mono text-xs`}
                  value={metadataJson}
                  onChange={(event) => setMetadataJson(event.target.value)}
                />
              </Field>
              <button type="submit" className={primaryButtonClass} disabled={loading}>
                Create User
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Existing users
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={loadPartnerUsers} className={primaryButtonClass} disabled={loading}>
                  Fetch Users
                </button>
                <select
                  className={`${inputClass} min-w-[260px]`}
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
                <p className="mt-3 text-xs text-slate-500">
                  Selected: <span className="font-medium text-slate-900">{selectedUser.userIdFromPartner}</span>
                </p>
              ) : null}
            </div>
          </Step>

          <Step
            number={2}
            title="Inspect User Data"
            subtitle="Pull the selected user's wallets and recent transactions."
          >
            <div className="flex flex-wrap gap-3">
              <button onClick={loadWallets} className={primaryButtonClass} disabled={loading}>
                Get Wallets
              </button>
              <button onClick={loadTransactions} className={primaryButtonClass} disabled={loading}>
                Get Transactions
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Wallets ({wallets.length})
                </p>
                <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-xs">
                  {wallets.length === 0 ? (
                    <li className="text-slate-400">No wallets loaded yet.</li>
                  ) : null}
                  {wallets.map((wallet) => (
                    <li key={wallet.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-slate-900">
                        {wallet.name} <span className="text-slate-500">on {wallet.chain}</span>
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{wallet.address}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Transactions ({transactions.length})
                </p>
                <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-xs">
                  {transactions.length === 0 ? (
                    <li className="text-slate-400">No transactions loaded yet.</li>
                  ) : null}
                  {transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <p className="flex items-center justify-between">
                        <span className="text-slate-900">
                          {transaction.amount} {transaction.currency}
                        </span>
                        <StatusPill status={transaction.status} />
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-600">
                        {transaction.transactionHash}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Step>

          <Step
            number={3}
            title="Generate a Widget Session"
            subtitle="Returns a one-time embed token and the wallet hash sent to the widget."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Field label="Theme" inline>
                <select
                  className={inputClass}
                  value={widgetTheme}
                  onChange={(event) => setWidgetTheme(event.target.value as "light" | "dark")}
                >
                  <option value="dark">dark</option>
                  <option value="light">light</option>
                </select>
              </Field>
              <button onClick={createWidgetSession} className={primaryButtonClass} disabled={loading}>
                Generate Token + Wallet Hash
              </button>
            </div>

            {widgetSession ? (
              <dl className="mt-5 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
                <KeyValue label="Widget URL" value={widgetSession.widgetUrl} />
                <div className="flex items-baseline gap-3">
                  <dt className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Canonical JSON
                  </dt>
                  <dd className="break-all text-slate-900 font-mono text-[11px]">
                    <div className="overflow-x-auto whitespace-nowrap max-w-full">{canonicalizeWallets(widgetSession.wallets || [])}</div>
                  </dd>
                </div>
                <KeyValue label="Wallet Hash" value={widgetSession.walletHash} mono />
                <KeyValue label="Wallet Count" value={String(widgetSession.wallets.length)} />
              </dl>
            ) : null}
          </Step>

          <Step
            number={4}
            title="Embed the Widget"
            subtitle="Iframe loads the widget, exchanges WIDGET_READY / WIDGET_CONFIG, and renders."
          >
            {!widgetSession ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Generate a widget session in step 3 to render the iframe.
              </p>
            ) : (
              <div className="space-y-4">
                <iframe
                  ref={iframeRef}
                  title="Fasset Widget"
                  src={widgetSession.widgetUrl}
                  width="100%"
                  height="600"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  allow="clipboard-write"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    postMessage event log
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {eventLog.length === 0 ? (
                      <li className="text-slate-400">No events yet.</li>
                    ) : null}
                    {eventLog.map((entry, index) => (
                      <li
                        key={`${entry}-${index}`}
                        className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[11px]"
                      >
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Step>

          <Step
            number={5}
            title="Receive Webhooks"
            subtitle="Inspect deliveries to /api/fasset/webhooks. Use ngrok to forward real Fasset webhooks."
            headerExtra={
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={webhookPolling}
                  onChange={(e) => setWebhookPolling(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-cyan-600 focus:ring-cyan-500"
                />
                Auto-poll
              </label>
            }
          >
            <div className="flex flex-wrap gap-3">
              <button onClick={loadWebhooks} className={primaryButtonClass} disabled={loading}>
                Refresh
              </button>
              <button onClick={simulateWebhook} className={secondaryButtonClass} disabled={loading}>
                Send Test Webhook
              </button>
            </div>

            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Received ({webhooks.length})
              </p>
              <ul className="mt-2 max-h-72 space-y-2 overflow-auto text-xs">
                {webhooks.length === 0 ? (
                  <li className="text-slate-400">No webhooks received yet.</li>
                ) : (
                  webhooks.map((webhook) => {
                    const headerSummary = Object.keys(webhook.headers).slice(0, 3).join(", ");
                    const bodyStr = JSON.stringify(webhook.body);
                    const truncated =
                      bodyStr.length > 200 ? bodyStr.substring(0, 200) + "…" : bodyStr;

                    return (
                      <li
                        key={webhook.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <p className="text-slate-900">
                          {new Date(webhook.receivedAt).toLocaleString()}
                        </p>
                        <p className="mt-1 text-slate-500">Headers: {headerSummary}</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-600">
                          {truncated}
                        </p>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </Step>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Error</p>
              <p className="mt-2 break-words text-sm text-rose-900">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-3 text-xs font-medium text-rose-700 underline hover:text-rose-900"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Latest request
              </p>
              {loading ? (
                <span className="flex items-center gap-1.5 text-xs text-cyan-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
                  Sending
                </span>
              ) : null}
            </div>
            {requestLog ? (
              <div className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MethodPill method={requestLog.method} />
                  <code className="break-all text-xs text-slate-700">{requestLog.url}</code>
                </div>
                {requestLog.body !== null && requestLog.body !== undefined ? (
                  <pre className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
                    {typeof requestLog.body === "string"
                      ? requestLog.body
                      : JSON.stringify(requestLog.body, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-slate-400">No request yet.</p>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Latest response
              </p>
            </div>
            <pre className="max-h-[480px] overflow-auto p-4 text-[11px] leading-relaxed text-slate-700">
              {responseLog ? JSON.stringify(responseLog, null, 2) : "No response yet."}
            </pre>
          </div>
        </aside>
      </main>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";

const primaryButtonClass =
  "rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

const secondaryButtonClass =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

const eyebrowClass =
  "text-[11px] font-medium uppercase tracking-wider text-slate-500";

function Step({
  number,
  title,
  subtitle,
  headerExtra,
  children,
}: {
  number: number;
  title: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-cyan-200 bg-cyan-50 text-xs font-semibold text-cyan-700">
            {number}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {headerExtra}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <span>{label}</span>
        {children}
      </label>
    );
  }
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function KeyValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className={`break-all text-slate-900 ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "COMPLETED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "FAILED"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${tone}`}>
      {status}
    </span>
  );
}

function MethodPill({ method }: { method: string }) {
  const tone =
    method === "GET"
      ? "border-cyan-200 bg-cyan-50 text-cyan-700"
      : method === "POST"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : method === "DELETE"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider ${tone}`}>
      {method}
    </span>
  );
}
