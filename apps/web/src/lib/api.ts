import type {
  MarketDetail,
  MonitorHealth,
  NotificationPreferences,
  PaperTrade,
  PerformanceStats,
  ScanConfig,
  ScannerRow,
  Signal,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error ?? `Request to ${path} failed with ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<MonitorHealth>("/health"),

  markets: (eligibleOnly = true) => request<ScannerRow[]>(`/markets?eligibleOnly=${eligibleOnly}`),
  marketDetail: (id: string) => request<MarketDetail>(`/markets/${id}`),
  setMarketClassification: (id: string, classification: string) =>
    request(`/markets/${id}/classification`, { method: "PATCH", body: JSON.stringify({ classification }) }),

  signals: (bucket?: "new" | "active" | "completed") => request<Signal[]>(`/signals${bucket ? `?bucket=${bucket}` : ""}`),
  topSignals: (limit = 10) => request<Signal[]>(`/signals/top?limit=${limit}`),
  signal: (id: string) => request<Signal>(`/signals/${id}`),

  config: () => request<ScanConfig>("/config"),
  updateConfig: (patch: Partial<ScanConfig>) => request<ScanConfig>("/config", { method: "PUT", body: JSON.stringify(patch) }),

  notificationPreferences: () => request<NotificationPreferences>("/notification-preferences"),
  updateNotificationPreferences: (patch: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>("/notification-preferences", { method: "PUT", body: JSON.stringify(patch) }),

  vapidPublicKey: () => request<{ publicKey: string }>("/push/vapid-public-key"),
  subscribePush: (subscription: PushSubscriptionJSON) => request("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint: string) => request("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),

  paperTrades: () => request<PaperTrade[]>("/paper-trades"),
  openPaperTrade: (signalId: string, positionSizeUsd: number) =>
    request<PaperTrade>("/paper-trades", { method: "POST", body: JSON.stringify({ signalId, positionSizeUsd }) }),
  closePaperTrade: (id: string, exitPrice?: number) =>
    request<PaperTrade>(`/paper-trades/${id}/close`, { method: "POST", body: JSON.stringify(exitPrice ? { exitPrice } : {}) }),

  performance: () => request<PerformanceStats>("/performance"),
};
