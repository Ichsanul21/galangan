// Seam backend: seluruh akses HTTP backend lewat sini.
// Selama backend belum ada, VITE_API_URL dikosongkan dan apiFetch
// melempar ApiNotConfigured — halaman tetap memakai adapter lokal (store.tsx).
//
// Kontrak backend (services/api):
// - Envelope sukses: { ok: true, data: T } → apiFetch mengembalikan `data`.
// - Envelope gagal:  { ok: false, error: { message, code? } } → apiFetch melempar ApiError.
// - Auth: POST /api/auth/login { username, password } → { token, user }.
// - CRUD /api/<table>: list/get/post/patch/delete (format baris backend,
//   lihat services/repositories.ts).
// - JWT dikirim sebagai `Authorization: Bearer <token>` bila ada.

export class ApiNotConfigured extends Error {
  constructor() {
    super("Backend belum dikonfigurasi (VITE_API_URL kosong). Memakai adapter lokal.");
    this.name = "ApiNotConfigured";
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  retryAfterSec?: number;
  constructor(status: number, message: string, code?: string, data?: unknown, retryAfterSec?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
    this.retryAfterSec = retryAfterSec;
  }
}

/* ============ TOKEN STORE (sessionStorage) ============ */

const JWT_KEY = "isms.jwt";

function safeStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function setJwt(token: string): void {
  try {
    safeStorage()?.setItem(JWT_KEY, token);
  } catch {
    /* storage tak tersedia — abaikan */
  }
}

export function getJwt(): string | null {
  try {
    return safeStorage()?.getItem(JWT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function clearJwt(): void {
  try {
    safeStorage()?.removeItem(JWT_KEY);
  } catch {
    /* abaikan */
  }
}

/* ============ FETCH + ENVELOPE ============ */

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function isBackendConfigured(): boolean {
  return BASE.length > 0;
}

interface OkEnvelope<T> {
  ok: true;
  data: T;
}

interface FailEnvelope {
  ok: false;
  error: { message: string; code?: string } | string;
  data?: unknown;
}

function envelopeCode(v: unknown): string | undefined {
  if (!isEnvelope(v) || v.ok) return undefined;
  const err = (v as FailEnvelope).error;
  if (err && typeof err === "object" && typeof err.code === "string") return err.code;
  return undefined;
}

function envelopeData(v: unknown): unknown {
  if (!isEnvelope(v) || v.ok) return undefined;
  return (v as FailEnvelope).data;
}

function isEnvelope(v: unknown): v is OkEnvelope<unknown> | FailEnvelope {
  return typeof v === "object" && v !== null && "ok" in v;
}

function envelopeMessage(v: unknown): string | null {
  if (!isEnvelope(v) || v.ok) return null;
  const err = (v as FailEnvelope).error;
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string") return err.message;
  return null;
}

function notifyAuthExpired(): void {
  clearJwt();
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("isms:auth-expired"));
    }
  } catch {
    /* abaikan */
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isBackendConfigured()) throw new ApiNotConfigured();
  const jwt = getJwt();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, `Backend tak terjangkau (${path}). Periksa koneksi atau VITE_API_URL.`);
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 401) notifyAuthExpired();
    const retryAfter = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      res.status,
      envelopeMessage(json) ?? (text || `HTTP ${res.status} untuk ${path}`),
      envelopeCode(json),
      envelopeData(json),
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  if (isEnvelope(json)) {
    if ((json as OkEnvelope<T>).ok) return (json as OkEnvelope<T>).data;
    throw new ApiError(res.status, envelopeMessage(json) ?? `Backend error untuk ${path}`);
  }
  return json as T;
}
