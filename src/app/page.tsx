"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type Order = {
  id: string;
  externalOrderRef: string;
  fiatAmount: string;
  fiatCurrency: string;
  paidSoFar: string;
  status: string;
  expiresAt?: string | null;
  remarks?: string | null;
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
  body: string | null;
  response?: JsonValue;
};

async function safeJson(response: Response) {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return null;
  }
}

function extractRequestRecords(path: string, init?: RequestInit, response?: JsonValue): RequestRecord[] {
  const fallback: RequestRecord = {
    method: (init?.method ?? "GET").toUpperCase(),
    url: path,
    body: typeof init?.body === "string" ? init.body : null,
    response,
  };

  return [fallback];
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
  const [widgetTheme, setWidgetTheme] = useState<"light" | "dark">("light");

  function genHex(len: number) {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(len / 2)));
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
    } catch {
      // fallback
      return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    }
  }

  const [orderExternalRef, setOrderExternalRef] = useState(() => genHex(12));
  const [orderFiatAmount, setOrderFiatAmount] = useState("50");
  const [orderFiatCurrency, setOrderFiatCurrency] = useState("USD");
  const [orderRemarks, setOrderRemarks] = useState("");
  const [orderExpiresAt, setOrderExpiresAt] = useState("");
  const [orderLookupMode, setOrderLookupMode] = useState<"orderId" | "externalOrderRef">("externalOrderRef");
  const [orderLookupValue, setOrderLookupValue] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [iframeKey, setIframeKey] = useState<string | null>(null);

  const [requestLog, setRequestLog] = useState<RequestRecord[] | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [webhookPolling, setWebhookPolling] = useState(false);

  const selectClass = `${inputClass} appearance-none pr-14`;
  const selectStyle = {
    backgroundImage:
      "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%221.5%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M6 8l4 4 4-4%22/%3E%3C/svg%3E')",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.95rem center",
    backgroundSize: "0.75rem 0.75rem",
  } as const;

  const trackedFetch = useCallback(async <T = JsonValue>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, init);
    const parsed = await safeJson(response);

    if (!response.ok) {
      const message =
        typeof parsed === "object" && parsed && "message" in parsed
          ? String((parsed as { message?: string }).message)
          : "Request failed";
      throw new Error(message);
    }

    // Try to read metadata from the x-fasset-meta header. If present, use it
    // to populate the latest request(s). Otherwise fall back to a synthetic
    // record based on the proxy path and init.
    const metaHeader = response.headers.get("x-fasset-meta");
    if (metaHeader) {
      try {
        const meta = JSON.parse(metaHeader) as unknown;
        if (meta && typeof meta === "object") {
          if (Array.isArray((meta as any).requests)) {
            setRequestLog((meta as any).requests as RequestRecord[]);
          } else if ((meta as any).request) {
            setRequestLog([((meta as any).request as RequestRecord)]);
          } else {
            setRequestLog(extractRequestRecords(path, init, parsed));
          }
        } else {
          setRequestLog(extractRequestRecords(path, init, parsed));
        }
      } catch {
        setRequestLog(extractRequestRecords(path, init, parsed));
      }
    } else {
      setRequestLog(extractRequestRecords(path, init, parsed));
    }

    return parsed as T;
  }, []);

  const selectedUser = useMemo(
    () => partnerUsers.find((user) => user.id === selectedPartnerUserId) || null,
    [partnerUsers, selectedPartnerUserId],
  );

  function parseOrderFromResponse(responseBody: JsonValue): Order | null {
    if (typeof responseBody !== "object" || !responseBody || !("data" in responseBody)) {
      return null;
    }

    const data = (responseBody as { data?: JsonValue }).data;
    if (typeof data !== "object" || !data) {
      return null;
    }

    if ("id" in data && "externalOrderRef" in data) {
      return data as Order;
    }

    if ("order" in data && typeof (data as { order?: unknown }).order === "object") {
      return (data as { order: Order }).order;
    }

    return null;
  }

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

  async function loadWidgetSession(orderId?: string) {
    if (!selectedPartnerUserId) {
      setError("Select a partner user first");
      return;
    }

    const body = await runRequest(() =>
      trackedFetch("/api/fasset/widget-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerUserId: selectedPartnerUserId,
          theme: widgetTheme,
          ...(orderId ? { orderId } : {}),
        }),
      }),
    );

    const session =
      typeof body === "object" && body && "data" in body
        ? (body.data as WidgetSession)
        : null;

    setIframeKey(`${session?.token ?? orderId ?? "legacy"}-${Date.now()}`);
    setWidgetSession(session);
    setEventLog((logs) => [orderId ? "Widget session generated for selected order" : "Widget session generated without order", ...logs].slice(0, 15));
  }

  async function createOrder() {
    if (!selectedPartnerUserId) {
      setError("Select a partner user first");
      return;
    }

    const orderBody = {
      partnerUserId: selectedPartnerUserId,
      externalOrderRef: orderExternalRef,
      fiatAmount: orderFiatAmount,
      fiatCurrency: orderFiatCurrency,
      remarks: orderRemarks || undefined,
      expiresAt: orderExpiresAt || undefined,
    };

    const orderResp = await runRequest(() =>
      trackedFetch("/api/fasset/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderBody),
      }),
    );

    const orderData = parseOrderFromResponse(orderResp as JsonValue);

    if (!orderData) {
      setError("Failed to create order");
      return;
    }

    setSelectedOrder(orderData);
  }

  async function fetchOrder() {
    if (!selectedPartnerUserId) {
      setError("Select a partner user first");
      return;
    }

    if (!orderLookupValue.trim()) {
      setError(`Enter ${orderLookupMode === "orderId" ? "an orderId" : "an externalOrderRef"}`);
      return;
    }

    const query =
      orderLookupMode === "orderId"
        ? `orderId=${encodeURIComponent(orderLookupValue.trim())}`
        : `externalOrderRef=${encodeURIComponent(orderLookupValue.trim())}`;

    const orderResp = await runRequest(() => trackedFetch(`/api/fasset/orders?${query}`));
    const orderData = parseOrderFromResponse(orderResp as JsonValue);

    if (!orderData) {
      setError("Failed to fetch order");
      return;
    }

    setSelectedOrder(orderData);
  }

  async function loadSelectedOrderWidget() {
    if (!selectedOrder) {
      setError("Select or fetch an order first");
      return;
    }

    await loadWidgetSession(selectedOrder.id);
  }

  const loadWebhooks = useCallback(async () => {
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
  }, [trackedFetch]);

  useEffect(() => {
    if (!webhookPolling) return;

    void Promise.resolve().then(loadWebhooks);
    const interval = setInterval(loadWebhooks, 3000);
    return () => clearInterval(interval);
  }, [webhookPolling, loadWebhooks]);

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
                  className={`${selectClass} min-w-[260px]`}
                  style={selectStyle}
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
            title="Load the Widget"
            subtitle="Create or fetch an order first, then load the widget with or without that order."
          >
            <div className="space-y-5">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">Widget theme</p>
                    <p className="text-xs text-slate-500">Applies to any widget session you load from this step.</p>
                  </div>
                  <Field label="Theme" inline>
                    <select
                      className={selectClass}
                      style={selectStyle}
                      value={widgetTheme}
                      onChange={(event) => setWidgetTheme(event.target.value as "light" | "dark")}
                    >
                      <option value="light">light</option>
                      <option value="dark">dark</option>
                    </select>
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Load widget without an order</p>
                    <p className="text-xs text-slate-500">Open the widget directly using the current theme.</p>
                  </div>
                </div>
                <div className="mt-3">
                  <button onClick={() => void loadWidgetSession()} className={primaryButtonClass} disabled={loading}>
                    Load Widget
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">Create order</p>
                <p className="text-xs text-slate-500">Create an order first. You can load the widget with it afterward.</p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input
                    className={inputClass}
                    value={orderExternalRef}
                    onChange={(e) => setOrderExternalRef(e.target.value)}
                    placeholder="externalOrderRef"
                  />
                  <input
                    className={inputClass}
                    value={orderFiatAmount}
                    onChange={(e) => setOrderFiatAmount(e.target.value)}
                    placeholder="fiatAmount"
                  />
                  <input
                    className={inputClass}
                    value={orderFiatCurrency}
                    onChange={(e) => setOrderFiatCurrency(e.target.value)}
                    placeholder="fiatCurrency"
                  />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    className={inputClass}
                    value={orderRemarks}
                    onChange={(e) => setOrderRemarks(e.target.value)}
                    placeholder="remarks (optional)"
                  />
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={orderExpiresAt}
                    onChange={(e) => setOrderExpiresAt(e.target.value)}
                    placeholder="expiresAt (optional)"
                  />
                </div>

                <div className="mt-3">
                  <button onClick={() => void createOrder()} className={secondaryButtonClass} disabled={loading}>
                    Create Order
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">Fetch and select an order</p>
                <p className="text-xs text-slate-500">Fetch by orderId or externalOrderRef, then use it to load the widget.</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className={selectClass}
                    style={selectStyle}
                    value={orderLookupMode}
                    onChange={(e) => setOrderLookupMode(e.target.value as "orderId" | "externalOrderRef")}
                  >
                    <option value="orderId">orderId</option>
                    <option value="externalOrderRef">externalOrderRef</option>
                  </select>
                  <input
                    className={`${inputClass} min-w-[260px] flex-1`}
                    value={orderLookupValue}
                    onChange={(e) => setOrderLookupValue(e.target.value)}
                    placeholder={orderLookupMode === "orderId" ? "Enter orderId" : "Enter externalOrderRef"}
                  />
                  <button onClick={() => void fetchOrder()} className={secondaryButtonClass} disabled={loading}>
                    Fetch Order
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Selected order</p>
                    <p className="text-xs text-slate-500">This order will be used when loading the widget.</p>
                  </div>
                </div>

                {selectedOrder ? (
                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <KeyValue label="Order ID" value={selectedOrder.id} mono />
                    <KeyValue label="External Ref" value={selectedOrder.externalOrderRef} mono />
                    <KeyValue label="Fiat Amount" value={`${selectedOrder.fiatAmount} ${selectedOrder.fiatCurrency}`} />
                    <KeyValue label="Status" value={selectedOrder.status} />
                    <KeyValue label="Paid So Far" value={selectedOrder.paidSoFar} />
                    <KeyValue label="Expires At" value={selectedOrder.expiresAt ?? "-"} />
                  </dl>
                ) : (
                  <p className="mt-4 text-xs text-slate-400">No order selected yet.</p>
                )}

                <div className="mt-4">
                  <button onClick={() => void loadSelectedOrderWidget()} className={primaryButtonClass} disabled={loading || !selectedOrder}>
                    Load Widget With Selected Order
                  </button>
                </div>
              </section>

              {widgetSession ? (
              <dl className="mt-5 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
                <KeyValue label="Widget URL" value={widgetSession.widgetUrl} />
                {selectedOrder ? <KeyValue label="Selected Order" value={`${selectedOrder.id} (${selectedOrder.status})`} mono /> : null}
                <div className="flex items-baseline gap-3">
                  <dt className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Canonical JSON
                  </dt>
                  <dd className="min-w-0 flex-1 text-slate-900 font-mono text-[11px]">
                    <div className="w-full overflow-x-auto whitespace-nowrap">{canonicalizeWallets(widgetSession.wallets || [])}</div>
                  </dd>
                </div>
                <KeyValue label="Wallet Hash" value={widgetSession.walletHash} mono />
                <KeyValue label="Wallet Count" value={String(widgetSession.wallets.length)} />
              </dl>
              ) : null}
            </div>
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
                  key={iframeKey ?? widgetSession.widgetUrl}
                  ref={iframeRef}
                  title="Fasset Widget"
                  src={widgetSession.widgetUrl}
                  width={450}
                  height="600"
                  className="w-[450px] max-w-full rounded-xl border border-slate-200 bg-slate-50"
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
              <div className="space-y-3 px-4 py-3">
                {requestLog.map((record, index) => (
                  <div
                    key={`${record.url}-${index}`}
                    className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <MethodPill method={record.method} />
                      <div className="min-w-0 flex-1">
                        <div className="w-full max-w-full overflow-x-auto">
                          <code className="block whitespace-nowrap pr-2 text-xs text-slate-700">{record.url}</code>
                        </div>
                      </div>
                    </div>
                    {record.body ? (
                      (() => {
                        let bodyToShow = record.body;
                        if (record.method === "POST") {
                          try {
                            const parsed = JSON.parse(record.body);
                            bodyToShow = JSON.stringify(parsed, null, 2);
                          } catch {
                            // keep original body if it's not valid JSON
                          }
                        }

                        return (
                          <pre className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700">
                            {bodyToShow}
                          </pre>
                        );
                      })()
                    ) : null}
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Response
                      </p>
                      <pre className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700">
                        {record.response ? JSON.stringify(record.response, null, 2) : "No response yet."}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-slate-400">No request yet.</p>
            )}
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
