// Banner notifikasi modul (tanpa badge sidebar, tanpa read-state).
// Banner murni ikut KONDISI data: muncul selama kondisi ada.
// Klik item banner → lompat ke baris + kedip sesaat via useNotifFlash.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../data/store";
import { useT } from "../i18n/LanguageContext";
import { loadModSeen, notifyModSeen, saveModSeen } from "../utils/notifRead";
import { fmtTanggal } from "../utils/format";
import {
  buildModuleAlertItemsFor,
  countByLevel,
  groupByLevel,
  sortByLevel,
  type AlertLevel,
  type ModuleAlertKey,
  type ModuleAlertItem,
} from "../utils/moduleAlerts";

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

/**
 * Pilih satu ATAU sekumpulan baris dari hasil resolve deep-link modul.
 *
 * Setiap modul punya resolve-nya sendiri (tab mana, filter mana yang harus
 * dibuka lebih dulu), tapi pemilihannya selalu dua kasus yang sama: satu id
 * dari banner modul, atau daftar id dari kartu Dashboard yang menghitung
 * kelompok. Cabang itu pernah ditulis ulang di CRM, Finance, dan QCSafety -
 * tiga salinan yang bisa berbeda secara tidak sengaja. Dipusatkan di sini
 * supaya modul yang ditambahkan berikutnya cukup memanggil satu fungsi.
 */
export function flashPick(
  flash: Pick<ReturnType<typeof useNotifFlash>, "pick" | "pickMany">,
  ids: string[],
  index: number,
  goToPage: (p: number) => void,
  size: number,
): void {
  const list = ids.filter((id) => String(id) !== "");
  if (list.length === 0) return;
  if (list.length > 1) flash.pickMany(list, index, goToPage, size);
  else flash.pick(list[0] as string, index, goToPage, size);
}

const PREVIEW_N = 5;
const RENDER_CAP = 200;

/** Isi `{n}`/`{kritis}` pada kunci kamus. */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Umur alert dalam hari. `since` sudah divalidasi di `normalizeItems`, jadi
 * di sini tidak mungkin NaN - tapi tetap dijaga, karena "NaN hari" lebih buruk
 * daripada tidak menampilkan umur sama sekali.
 */
function ageDays(since: string | undefined): number | null {
  if (!since) return null;
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

const LEVEL_STYLE: Record<AlertLevel, { bar: string; chip: string; dot: string; head: string; labelKey: "levelKritis" | "levelPerhatian" | "levelInfo" }> = {
  kritis: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", dot: "bg-rose-500", head: "text-rose-900", labelKey: "levelKritis" },
  perhatian: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-900", dot: "bg-amber-500", head: "text-amber-900", labelKey: "levelPerhatian" },
  info: { bar: "bg-ocean-400", chip: "bg-ocean-50 text-ocean-800", dot: "bg-ocean-400", head: "text-ocean-800", labelKey: "levelInfo" },
};

export function AlertBannerView({ items, onPick }: { items: ModuleAlertItem[]; onPick?: (rowId: string) => void }) {
  const { t } = useT();
  const [min, setMin] = useState(false);
  /* Buka/tutup per level, bukan satu sakelar global: tiga group dengan jumlah
     berbeda shouldn't ikut buka-tutup bersama - membuka `info` yang panjang
     sambileto menutup `kritis` yang pendek. */
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => groupByLevel(items, PREVIEW_N), [items]);
  const counts = useMemo(() => countByLevel(items), [items]);
  const worst = groups[0];

  if (items.length === 0) return null;

  const tone = worst === undefined ? LEVEL_STYLE.info : LEVEL_STYLE[worst.level];

  return (
    /* Garis aksen kiri tipis + latar netral. Versi lama memakai fill amber
       penuh untuk semua alert termasuk info, jadi merah dan kuning sama
       saja - alert yang tidak berarti kehilangan warnanya. */
    <div className="mb-4 overflow-hidden rounded-xl border border-steel-200 bg-white">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${tone.bar}`} aria-hidden="true" />
        <Bell className={`mt-1 h-4 w-4 shrink-0 ${tone.dot}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">
            {fill(t.notif.summaryCounts, counts)}
          </p>
          <p className="text-[11px] text-steel-500">{t.notif.jumpHint}</p>
          {!min && (
            <div className="mt-2 space-y-2">
              {groups.map((g) => {
                const st = LEVEL_STYLE[g.level];
                const isOpen = openLevels[g.level] === true;
                return (
                  <div key={g.level} className="rounded-lg border border-steel-100">
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${st.chip}`}>
                        {t.notif[st.labelKey]}
                      </span>
                      <span className="text-[11px] text-steel-500">
                        {g.total} · {t.notif.title.toLowerCase()}
                      </span>
                      {g.hidden > 0 && (
                        <button
                          className="ml-auto text-[11px] font-semibold text-ocean-600 hover:underline"
                          onClick={() => setOpenLevels((prev) => ({ ...prev, [g.level]: true }))}
                        >
                          {fill(t.notif.moreHidden, { n: g.hidden })}
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1 px-2.5 pb-2">
                      {(isOpen ? sortByLevel(items.filter((i) => i.level === g.level)).slice(0, RENDER_CAP) : g.items).map((a) => (
                        <AlertRow key={a.id} item={a} style={st} onPick={onPick} />
                      ))}
                    </ul>
                    {isOpen && (
                      <div className="px-2.5 pb-2">
                        <button
                          className="text-[11px] font-semibold text-ocean-600 hover:underline"
                          onClick={() => setOpenLevels((prev) => ({ ...prev, [g.level]: false }))}
                        >
                          {t.notif.showLess}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length > RENDER_CAP && (
                <p className="text-[11px] text-steel-500">
                  {fill(t.notif.cappedNote ?? `Menampilkan ${RENDER_CAP} pertama - saring tabel untuk sisanya.`, { n: RENDER_CAP })}
                </p>
              )}
            </div>
          )}
        </div>
        <button
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-steel-600 hover:bg-steel-100"
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

/** Baris meta kecil: dampak + umur + tenggat. Tidak ada isinya, tidak tampil. */
function AlertMeta({ item }: { item: ModuleAlertItem }) {
  const { t } = useT();
  const days = ageDays(item.since);
  const bits: string[] = [];
  if (item.impact !== undefined) bits.push(`${t.notif.impactLabel}: ${item.impact}`);
  if (days !== null) bits.push(fill(t.notif.sinceDays, { n: days }));
  if (item.due !== undefined) bits.push(`${t.notif.dueLabel}: ${fmtTanggal(item.due)}`);
  if (bits.length === 0) return null;
  return <span className="block truncate text-[11px] text-steel-400">{bits.join(" · ")}</span>;
}

function AlertRow({
  item,
  style,
  onPick,
}: {
  item: ModuleAlertItem;
  style: (typeof LEVEL_STYLE)[AlertLevel];
  onPick?: (rowId: string) => void;
}) {
  return (
    <li className="flex items-start gap-1.5 text-xs" title={item.detail || item.label}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="min-w-0">
        {onPick ? (
          <button className={`block truncate text-left font-medium hover:underline ${style.head}`} onClick={() => onPick(item.rowId)}>
            {item.label}
          </button>
        ) : (
          <span className={`block truncate font-medium ${style.head}`}>{item.label}</span>
        )}
        {item.detail && <span className="block truncate text-steel-500">{item.detail}</span>}
        <AlertMeta item={item} />
      </span>
    </li>
  );
}

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
