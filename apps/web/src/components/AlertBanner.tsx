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
import { useT } from "../i18n/LanguageContext";
import { buildModuleAlertItems, type ModuleAlertKey, type ModuleAlertItem } from "../utils/moduleAlerts";

export function notifRowId(id: string): string {
  return `notifrow-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function useModuleAlert(key: ModuleAlertKey): {
  active: boolean;
  items: ModuleAlertItem[];
  highlight: Set<string>;
  dismiss: () => void;
  scrollTo: (rowId: string) => void;
} {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const active = params.get("alert") === key;
  const [tick, setTick] = useState(0);
  const items = useMemo(() => buildModuleAlertItems(data)[key], [data, key]);
  const highlight = useMemo(() => new Set(items.map((a) => a.rowId)), [items]);

  // Dibuka via badge → tandai dibaca (badge hilang), halaman tetap di ATAS.
  // Highlight + banner yang menjelaskan; scroll hanya saat item banner diklik.
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
    window.scrollTo({ top: 0 });
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

  const scrollTo = (rowId: string) => {
    document.getElementById(notifRowId(rowId))?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return { active, items, highlight, dismiss, scrollTo };
}

export function AlertBannerView({ items, onClose, onPick }: { items: ModuleAlertItem[]; onClose: () => void; onPick?: (rowId: string) => void }) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {items.length} {t.notif.title.toLowerCase()} — {t.notif.jumpHint}
          </p>
          <ul className="mt-1 space-y-0.5">
            {items.slice(0, 8).map((a) => (
              <li key={a.id} className="truncate text-xs text-amber-800" title={a.detail || a.label}>
                {onPick ? (
                  <button className="truncate hover:underline" onClick={() => onPick(a.rowId)}>
                    • {a.label}
                  </button>
                ) : (
                  <>• {a.label}</>
                )}
              </li>
            ))}
          </ul>
          {items.length > 8 && (
            <p className="mt-0.5 text-xs text-amber-600">+ {items.length - 8} {t.common.more}</p>
          )}
          <p className="mt-1 text-[11px] text-amber-600">
            {t.notif.persistsNote}
          </p>
        </div>
        <button
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          onClick={onClose}
        >
          {t.common.close}
        </button>
      </div>
    </div>
  );
}
