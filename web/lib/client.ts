"use client";

import type { Application, ApplicationView, CreatedApplication, Journey, QueueRow } from "./types";

export class ApiError extends Error {
  status: number;
  field: string | null;
  constructor(message: string, status: number, field: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
  }
}

type Opts = { method?: "GET" | "POST"; body?: unknown; token?: string | null; form?: FormData };

/** All calls go to this origin. The proxy route reaches Supabase; the browser never does. */
async function call<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`/api/proxy/${path.replace(/^\/+/, "")}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(text.slice(0, 200) || res.statusText, res.status);
  }
  if (!res.ok) {
    const d = data as { error?: string; field?: string } | null;
    throw new ApiError(d?.error ?? res.statusText, res.status, d?.field ?? null);
  }
  return data as T;
}

// ── Customer scope ──────────────────────────────────────────────────────────
export const api = {
  createApplication: (journey: Journey) => call<CreatedApplication>("applications", { body: { journey } }),

  getApplication: (id: string, token: string) => call<ApplicationView>(`applications/${id}`, { token }),

  submitBlock: (id: string, block: string, token: string, body: Record<string, unknown>) =>
    call<{ ok: true; block: string; state: Application["state"] } & Record<string, unknown>>(
      `applications/${id}/blocks/${block}`,
      { token, body },
    ),

  sendOtp: (id: string, token: string, body: Record<string, unknown>) =>
    call<{ ok: true; sent_to: string; delivered_via: string }>("otp/send", { token, body: { application_id: id, ...body } }),

  verifyOtp: (id: string, token: string, body: Record<string, unknown>) =>
    call<Record<string, unknown>>("otp/verify", { token, body: { application_id: id, ...body } }),

  upload: (form: FormData, token: string) => call<Record<string, unknown>>("extract", { token, form }),
};

// ── Agent scope (cookie-authenticated; the shared token stays server-side) ───
export const agentApi = {
  session: async () => {
    const res = await fetch("/api/agent/session", { cache: "no-store" });
    return (await res.json()) as { agent: boolean };
  },

  login: async (password: string) => {
    const res = await fetch("/api/agent/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json()) as { agent?: boolean; error?: string };
    if (!res.ok) throw new ApiError(data.error ?? res.statusText, res.status);
    return data;
  },

  logout: async () => {
    await fetch("/api/agent/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
  },

  queue: () => call<{ applications: QueueRow[] }>("agent/applications"),

  application: (id: string) => call<ApplicationView>(`agent/applications/${id}`),

  review: (body: Record<string, unknown>) => call<Record<string, unknown>>("agent/review", { body }),
};

// ── Per-application customer session, kept in sessionStorage ────────────────
const KEY = "econtract.session";

export function saveSession(id: string, token: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id, token }));
  } catch {
    /* private mode / storage disabled */
  }
}

export function loadSession(): { id: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string; token?: string };
    return v.id && v.token ? { id: v.id, token: v.token } : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
