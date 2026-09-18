// Seam backend: seluruh akses HTTP backend lewat sini.
// Selama backend belum ada, VITE_API_URL dikosongkan dan apiFetch
// melempar ApiNotConfigured — halaman tetap memakai adapter lokal (store.tsx).

export class ApiNotConfigured extends Error {
  constructor() {
    super("Backend belum dikonfigurasi (VITE_API_URL kosong). Memakai adapter lokal.");
    this.name = "ApiNotConfigured";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function isBackendConfigured(): boolean {
  return BASE.length > 0;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isBackendConfigured()) throw new ApiNotConfigured();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `HTTP ${res.status} untuk ${path}`);
  }
  return (await res.json()) as T;
}
