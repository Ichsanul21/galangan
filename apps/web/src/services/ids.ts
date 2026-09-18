// ID stabil siap-database: prefix terbaca + UUID (tanpa tabrakan antar tab/user,
// tidak seperti Date.now().toString(36) yang bisa kembar bila diklik cepat).

export function newId(prefix = "X"): string {
  try {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  } catch {
    return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
  }
}
