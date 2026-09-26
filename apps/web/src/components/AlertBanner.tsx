// Banner + highlight notifikasi modul (tanpa badge sidebar, tanpa read-state).
// Banner + highlight murni ikut KONDISI data: muncul selama kondisi ada,
// hilang saat kondisi selesai. Pola pakai per halaman:
//   const ma = useModuleAlert("inventori");
//   {ma.active && <AlertBannerView items={ma.items} onPick={ma.scrollTo} />}
//   <tr id={notifRowId(i.id)} className={ma.highlight.has(String(i.id)) ? "notif-hl" : ""}>
// Class .notif-hl didefinisikan di index.css.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../data/store";
import { useT } from "../i18n/LanguageContext";
import { buildModuleAlertItemsFor, type ModuleAlertKey, type ModuleAlertItem } from "../utils/moduleAlerts";

export function notifRowId(id: string): string {
  return `notifrow-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

const PREVIEW_N = 10;
const RENDER_CAP = 200;

export function useModuleAlert(key: ModuleAlertKey): {
  active: boolean;
  items: ModuleAlertItem[];
  highlight: Set<string>;
  scrollTo: (rowId: string) => void;
} {
  const { data } = useStore();
  const [params] = useSearchParams();
  const active = params.get("alert") === key;
  // Hanya hitung 1 modul (murah) — bukan 13 modul sekaligus.
  const items = useMemo(() => (active ? buildModuleAlertItemsFor(data, key) : []), [data, key, active]);
  const highlight = useMemo(() => new Set(items.map((a) => a.rowId)), [items]);

  const scrollTo = (rowId: string) => {
    document.getElementById(notifRowId(rowId))?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return { active, items, highlight, scrollTo };
}

export function AlertBannerView({ items, onPick }: { items: ModuleAlertItem[]; onPick?: (rowId: string) => void }) {
  const { t } = useT();
  const [min, setMin] = useState(false);
  const [expand, setExpand] = useState(false);
  if (items.length === 0) return null;
  const shown = expand ? items.slice(0, RENDER_CAP) : items.slice(0, PREVIEW_N);
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {items.length} {t.notif.title.toLowerCase()} — {t.notif.jumpHint}
          </p>
          {!min && (
            <>
              <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto pr-1">
                {shown.map((a) => (
                  <li key={a.id} className="flex items-start gap-1.5 text-xs" title={a.detail || a.label}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="min-w-0">
                      {onPick ? (
                        <button className="block truncate text-left font-medium text-amber-900 hover:underline" onClick={() => onPick(a.rowId)}>
                          {a.label}
                        </button>
                      ) : (
                        <span className="block truncate font-medium text-amber-900">{a.label}</span>
                      )}
                      {a.detail && <span className="block truncate text-amber-700">{a.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {items.length > PREVIEW_N && (
                <button
                  className="mt-1 text-xs font-semibold text-amber-700 hover:underline"
                  onClick={() => setExpand((v) => !v)}
                >
                  {expand ? t.notif.showLess : `${t.notif.showAll} (${items.length})`}
                </button>
              )}
              {expand && items.length > RENDER_CAP && (
                <p className="mt-0.5 text-xs text-amber-600">
                  {t.notif.cappedNote ?? `Menampilkan ${RENDER_CAP} pertama — saring tabel untuk sisanya.`}
                </p>
              )}
              <p className="mt-1 text-[11px] text-amber-600">
                {t.notif.persistsNote}
              </p>
            </>
          )}
        </div>
        <button
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          onClick={() => setMin((v) => !v)}
          aria-expanded={!min}
        >
          {min ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          {min ? t.common.show : t.notif.minimize}
        </button>
      </div>
    </div>
  );
}
