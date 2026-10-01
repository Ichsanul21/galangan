/* Shim globals browser untuk render SSR di Node.
 *
 * StoreProvider membaca localStorage saat inisialisasi, dan framer-motion
 * (dipakai AppShell/Dashboard) menempelkan listener ke window/document.
 * Tanpa shim ini probe gagal dengan ReferenceError yang bukan bug aplikasi.
 *
 * Sengaja tidak memakai jsdom: menambah dependency besar untuk probe yang
 * hanya perlu surface browser yang dipakai kode ini.
 */
const store = new Map<string, string>();

const memoryStorage: Storage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

const noop = () => {};
const listenerSet = new Set<() => void>();
const eventTarget = () => ({
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: () => true,
  getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
});

const G = globalThis as unknown as Record<string, unknown>;
/* navigator di Node 22 read-only, jadi harus defineProperty bukan assignment. */
const define = (key: string, value: unknown): void => {
  try {
    Object.defineProperty(G, key, { value, configurable: true, writable: true });
  } catch {
    /* global immutable di runtime ini - abaikan */
  }
};

define("localStorage", memoryStorage);
define("sessionStorage", memoryStorage);
define("navigator", G.navigator ?? { userAgent: "node", language: "id-ID" });
define("matchMedia", () => ({
  matches: false,
  addEventListener: (_t: string, fn: () => void) => void listenerSet.add(fn),
  removeEventListener: (_t: string, fn: () => void) => void listenerSet.delete(fn),
}));
define("requestAnimationFrame", (cb: (t: number) => void) => setTimeout(() => cb(0), 0));
define("cancelAnimationFrame", (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
define("addEventListener", noop);
define("removeEventListener", noop);
define("dispatchEvent", () => true);
define("ResizeObserver", class {
  observe() {} unobserve() {} disconnect() {}
});
define("IntersectionObserver", class {
  observe() {} unobserve() {} disconnect() {}
});

if (typeof G.window === "undefined") {
  define("window", G);
}
define("self", G.window);
define("document", {
  ...eventTarget(),
  documentElement: eventTarget(),
  body: eventTarget(),
  visibilityState: "visible",
  hidden: false,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
  createTextNode: () => ({}),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
});

export const browserShimsReady = true;