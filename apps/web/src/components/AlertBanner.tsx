// Banner notifikasi modul (tanpa badge sidebar, tanpa read-state).
// Banner murni ikut KONDISI data: muncul selama kondisi ada.
// Klik item banner → lompat ke baris + kedip sesaat via useNotifFlash.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../data/store";
import { useT } from "../i18n/LanguageContext";
import { loadModSeen, notifyModSeen, saveModSeen } from "../utils/notifRead";
import { buildModuleAlertItemsFor, type ModuleAlertKey, type ModuleAlertItem } from "../utils/moduleAlerts";

export function notifRowId(id: string): string {
  return `notifrow-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Kedip sesaat saat item banner diklik (pengganti highlight permanen).
 * pick(rowId, index, goToPage, size): index = posisi di list terurut halaman
 * (<0 bila tak ada pager); goToPage melompat ke halaman target dulu.
 *
 * pickMany melakukan hal yang sama untuk SEKELOMPOK baris: dipakai kartu
 * Dashboard bernama "NCR Terbuka" / "Piutang Tertagih" / "Kontrak Menang".
 * Semula kartu itu hanya meneruskan satu id, sehingga dari lima NCR terbuka
 * yang pengguna lihat hanya satu yang berkedip - padahal angka di kartu sudah
 * menghitung semuanya. Sekarang semua id dalam kelompok itu ikut flashing,
 * dan halaman tujuan tidak perlu tahu mana yang "utama".
 *
 * `flashIds` sengaja terpisah dari `flashId`: penanda kelompok memakai kelas
 * CSS berbeda (.notif-flash-all) supaya jelas bedanya "kelompok baris ini yang
 * saya maksud" dari "satu baris ini yang saya klik".
 */
export function useNotifFlash(): {
  flashId: string | null;
  flashIds: ReadonlySet<string>;
  pick: (rowId: string, index: number, goToPage: (p: number) => void, size: number) => void;
  pickMany: (rowIds: string[], index: number, goToPage: (p: number) => void, size: number) => void;
} {
  const [flashId, setFlashId] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const timers = useRef<number[]>([]);
  useEffect(() => () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const clearTimers = (): void => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  /** Ambil elemen baris pertama yang benar-benar ada di DOM. */
  const firstPresent = (ids: string[]): HTMLElement | null => {
    for (const id of ids) {
      const el = document.getElementById(notifRowId(id));
      if (el) return el;
    }
    return null;
  };

  const pick = useCallback((rowId: string, index: number, goToPage: (p: number) => void, size: number) => {
    clearTimers();
    setFlashId(null);
    setFlashIds(new Set<string>());
    if (index >= 0) {
      goToPage(Math.floor(index / Math.max(1, size)) + 1);
    }
    timers.current.push(window.setTimeout(() => {
      document.getElementById(notifRowId(rowId))?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlashId(rowId);
    }, index >= 0 ? 200 : 0));
    timers.current.push(window.setTimeout(() => {
      setFlashId((cur) => (cur === rowId ? null : cur));
    }, 2600));
  }, []);

  const pickMany = useCallback((rowIds: string[], index: number, goToPage: (p: number) => void, size: number) => {
    const ids = [...new Set(rowIds.map((id) => String(id)).filter((id) => id !== ""))];
    if (ids.length === 0) return;
    clearTimers();
    setFlashId(null);
    setFlashIds(new Set<string>());
    if (index >= 0) {
      goToPage(Math.floor(index / Math.max(1, size)) + 1);
    }
    /* Scroll ke baris PERTAMA yang benar-benar ada: setelah pindah tab atau
       berubah filter tidak semua id ikut tampil, dan melompat ke id yang tidak
       ada membuat scrollIntoView diam-diam tidak terjadi. */
    timers.current.push(window.setTimeout(() => {
      firstPresent(ids)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlashIds(new Set(ids));
    }, index >= 0 ? 200 : 0));
    timers.current.push(window.setTimeout(() => {
      setFlashIds(new Set<string>());
    }, 3200));
  }, []);

  return { flashId, flashIds, pick, pickMany };
}

const PREVIEW_N = 5;
const RENDER_CAP = 200;

export function useModuleAlert(key: ModuleAlertKey): {
  active: boolean;
  items: ModuleAlertItem[];
} {
  const { data } = useStore();
  const [params] = useSearchParams();
  const active = params.get("alert") === key;
  // Hanya hitung 1 modul (murah) - bukan 13 modul sekaligus.
  const items = useMemo(() => buildModuleAlertItemsFor(data, key), [data, key]);

  // Badge sidebar "tampil sekali": modul dibuka (jalur mana pun) → id kondisi
  // saat ini dicatat sebagai seen (model timpa), badge modul itu nol.
  // Banner tetap ikut kondisi, tidak ikut seen.
  useEffect(() => {
    const ids = items.map((a) => a.id);
    const prev = loadModSeen()[key] ?? [];
    if (prev.length !== ids.length || ids.some((id, i) => prev[i] !== id)) {
      saveModSeen(key, ids);
      notifyModSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, items]);

  return { active, items };
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
            {items.length} {t.notif.title.toLowerCase()} - {t.notif.jumpHint}
          </p>
          {!min && (
            <>
              {/* `w-full` SENGAJA TIDAK dipakai di sini. Daftar ini memakai
                  .scroll-flush supaya scrollbarnya menempel di ujung kanan card,
                  dan margin-right negatif hanya berlaku bila width-nya auto;
                  `w-full` mengunci width sehingga scrollbar terdorong ke dalam
                  padding card. Padding dalam daftar (pr-3) tetap menjaga jarak
                  teks ke scrollbar. */}
              <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto scroll-flush pr-3" style={{ scrollbarGutter: "stable" }}>
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
                  {t.notif.cappedNote ?? `Menampilkan ${RENDER_CAP} pertama - saring tabel untuk sisanya.`}
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
