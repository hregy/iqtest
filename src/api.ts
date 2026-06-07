import type {
  StartResponse,
  AnswerResponse,
  Integrity,
  ScoreRow,
  Voucher,
  AdminScore,
  AdminQuestion,
} from "./types";

const TOKEN_KEY = "iq_admin_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, opts: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const t = getToken();
    if (t) headers.set("Authorization", `Bearer ${t}`);
  }
  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data as T;
}

const J = (body: unknown) => JSON.stringify(body);

export const api = {
  getConfig: () => req<{ testLength: number; questionSeconds: number }>("/api/config"),

  startTest: (name: string, voucher: string) =>
    req<StartResponse>("/api/test/start", { method: "POST", body: J({ name, voucher }) }),

  // Tell the server the question is now displayed -> it (re)starts the clock.
  ready: (attemptToken: string, nonce: string) =>
    req<{ ok: boolean }>("/api/test/ready", {
      method: "POST",
      body: J({ attemptToken, nonce }),
    }).catch(() => ({ ok: false })),

  answer: (
    attemptToken: string,
    nonce: string,
    selectedIndex: number | null,
    renderDelayMs: number,
    integrity: Integrity
  ) =>
    req<AnswerResponse>("/api/test/answer", {
      method: "POST",
      body: J({ attemptToken, nonce, selectedIndex, renderDelayMs, integrity }),
    }),

  scoreboard: () => req<ScoreRow[]>("/api/scoreboard"),

  admin: {
    login: (password: string) =>
      req<{ token: string }>("/api/admin/login", { method: "POST", body: J({ password }) }),
    me: () => req<{ ok: boolean; adminVoucher: string }>("/api/admin/me", {}, true),

    vouchers: () => req<Voucher[]>("/api/admin/vouchers", {}, true),
    createVouchers: (count: number, type: string, prefix: string, expiresAt: string | null) =>
      req<{ created: string[] }>(
        "/api/admin/vouchers",
        { method: "POST", body: J({ count, type, prefix, expiresAt }) },
        true
      ),
    resetVoucher: (code: string) =>
      req(`/api/admin/vouchers/${encodeURIComponent(code)}/reset`, { method: "POST" }, true),
    deleteVoucher: (code: string) =>
      req(`/api/admin/vouchers/${encodeURIComponent(code)}`, { method: "DELETE" }, true),

    scores: () => req<AdminScore[]>("/api/admin/scores", {}, true),
    patchScore: (id: number, patch: Partial<AdminScore>) =>
      req(`/api/admin/scores/${id}`, { method: "PATCH", body: J(patch) }, true),
    deleteScore: (id: number) => req(`/api/admin/scores/${id}`, { method: "DELETE" }, true),
    clearScores: () => req("/api/admin/scores", { method: "DELETE" }, true),

    questions: () => req<AdminQuestion[]>("/api/admin/questions", {}, true),
    createQuestion: (form: FormData) =>
      req<{ ok: boolean; id: number }>("/api/admin/questions", { method: "POST", body: form }, true),
    patchQuestion: (id: number, patch: Record<string, unknown>) =>
      req(`/api/admin/questions/${id}`, { method: "PATCH", body: J(patch) }, true),
    deleteQuestion: (id: number) => req(`/api/admin/questions/${id}`, { method: "DELETE" }, true),

    getSettings: () => req<Record<string, string>>("/api/admin/settings", {}, true),
    putSettings: (s: Record<string, string | number>) =>
      req("/api/admin/settings", { method: "PUT", body: J(s) }, true),
  },
};
