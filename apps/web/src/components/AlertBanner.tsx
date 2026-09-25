// Banner + highlight notifikasi modul (terintegrasi badge sidebar).
// Pola pakai per halaman:
//   const ma = useModuleAlert("inventori");
//   {ma.active && <AlertBannerView items={ma.items} onClose={ma.dismiss} />}
//   <tr id={notifRowId(i.id)} className={ma.highlight.has(String(i.id)) ? "notif-hl" : ""}>
// Highlight berbasis KONDISI (tetap tampil walau badge sudah 0 karena dibaca
// saat modul dibuka). Class .notif-hl didefinisikan di index.css.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell } from "lucide-react";
import { useStore } from "../data/store";
import { loadNotifRead, saveNotifRead } from "../utils/notifRead";
import { buildModuleAlertItems, type ModuleAlertKey, type ModuleAlertItem } from "../utils/moduleAlerts";

export function notifRowId(id: string): string {
  return `notifrow-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function useModuleAlert(key: ModuleAlertKey): {
  active: boolean;
  items: ModuleAlertItem[];
  highlight: Set<string>;
  dismiss: () => void;
} {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const active = params.get("alert") === key;
  const [tick, setTick] = useState(0);
  const items = useMemo(() => buildModuleAlertItems(data)[key], [data, key]);
  const highlight = useMemo(() => new Set(items.map((a) => a.rowId)), [items]);

  // Dibuka via badge → tandai dibaca (badge hilang), highlight tetap.
  useEffect(() => {
    if (!active) return;
    const read = loadNotifRead();
    let changed = false;
    for (const a of items) {
      if (!read.has(a.id)) {
        read.add(a.id);
        changed = true;
      }
    }
    if (changed) {
      saveNotifRead(read);
      setTick((t) => t + 1);
    }
    void tick;
    const t = window.setTimeout(() => {
      const first = items[0];
      if (!first) return;
      document.getElementById(notifRowId(first.rowId))?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const dismiss = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("alert");
        return next;
      },
      { replace: true },
    );
  };

  return { active, items, highlight, dismiss };
}

export function AlertBannerView({ items, onClose }: { items: ModuleAlertItem[]; onClose: () => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {items.length} notifikasi{items.length > 1 ? "" : ""} — baris terkait disorot di bawah
          </p>
          <ul className="mt-1 space-y-0.5">
            {items.slice(0, 8).map((a) => (
              <li key={a.id} className="truncate text-xs text-amber-800" title={a.detail || a.label}>
                • {a.label}
              </li>
            ))}
          </ul>
          {items.length > 8 && (
            <p className="mt-0.5 text-xs text-amber-600">+ {items.length - 8} lainnya (gulir ke baris bersorot)</p>
          )}
          <p className="mt-1 text-[11px] text-amber-600">
            Badge sidebar sudah dibersihkan — sorotan tetap tampil sampai kondisinya selesai.
          </p>
        </div>
        <button
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          onClick={onClose}
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
