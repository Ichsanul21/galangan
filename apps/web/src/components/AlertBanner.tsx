// Banner notifikasi modul (tanpa badge sidebar, tanpa read-state).
// Banner murni ikut KONDISI data: muncul selama kondisi ada, DAN selama
// pengguna belum menutupnya untuk sesi ini (utils/bannerDismiss).
// Klik item banner → lompat ke baris + kedip sesaat via useNotifFlash.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ChevronDown, ChevronUp, X } from "lucide-react";
import { useStore } from "../data/store";
import { useT } from "../i18n/LanguageContext";
import { loadModSeen, notifyModSeen, saveModSeen } from "../utils/notifRead";
import {
  BANNER_DISMISS_KEY,
  dismissLevel as dismissLevelPure,
  dismissedFor,
  parseDismissed,
  restoreAll as restoreAllPure,
  restoreLevel as restoreLevelPure,
  serializeDismissed,
  visibleItems,
  type DismissMap,
} from "../utils/bannerDismiss";
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

const RENDER_CAP = 200;

/** Isi `{n}`/`{kritis}` pada kunci kamus. */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** sessionStorage bisa menolak: mode privat, atau iframe tanpa storage. */
function readDismissMap(): DismissMap {
  try {
    return parseDismissed(window.sessionStorage.getItem(BANNER_DISMISS_KEY));
  } catch {
    return {};
  }
}

function writeDismissMap(map: DismissMap): void {
  try {
    window.sessionStorage.setItem(BANNER_DISMISS_KEY, serializeDismissed(map));
  } catch {
    /* abaikan: banner tetap tampil, hanya tidak bisa ditutup */
  }
}

/** Kendali tutup-banner yang dipegang komponen banner. */
export interface BannerDismiss {
  key: string;
  dismissed: readonly AlertLevel[];
  dismiss: (level: AlertLevel) => void;
  restore: (level: AlertLevel) => void;
  restoreEvery: () => void;
}

/**
 * useState + sessionStorage: state mengikuti render sekarang, storage hilang
 * saat tab ditutup. Sifat "hanya sesi ini" itu disengaja - lihat
 * utils/bannerDismiss.
 */
export function useBannerDismiss(moduleKey: string): BannerDismiss {
  const [map, setMap] = useState<DismissMap>(() => readDismissMap());

  /* Tab lain dalam sesi yang sama ikut berubah: user bisa membuka Finance di
     dua tab, menutup banner di satu, dan tab satunya harus ikut bersih. */
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== null && e.key !== BANNER_DISMISS_KEY) return;
      setMap(readDismissMap());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: (prev: DismissMap) => DismissMap): void => {
    setMap((prev) => {
      const applied = next(prev);
      writeDismissMap(applied);
      return applied;
    });
  }, []);

  return {
    key: moduleKey,
    dismissed: dismissedFor(map, moduleKey),
    dismiss: useCallback(
      (level: AlertLevel) => update((prev) => dismissLevelPure(prev, moduleKey, level)),
      [moduleKey, update],
    ),
    restore: useCallback(
      (level: AlertLevel) => update((prev) => restoreLevelPure(prev, moduleKey, level)),
      [moduleKey, update],
    ),
    restoreEvery: useCallback(
      () => update((prev) => restoreAllPure(prev, moduleKey)),
      [moduleKey, update],
    ),
  };
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

/* `icon` dan `dot` sengaja dipisah. `dot` dipakai di elemen yang punya
   background (titik bulat, garis aksen kiri); `icon` dipakai di glyph SVG yang
   transparan. Dulunya keduanya memakai kelas yang sama, jadi lonceng rose
   tampil sebagai kotak merah solid di belakang ikon, bukan ikon merah. */
const LEVEL_STYLE: Record<AlertLevel, { bar: string; chip: string; dot: string; icon: string; head: string; labelKey: "levelKritis" | "levelPerhatian" | "levelInfo" }> = {
  kritis: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", dot: "bg-rose-500", icon: "text-rose-500", head: "text-rose-900", labelKey: "levelKritis" },
  perhatian: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-900", dot: "bg-amber-500", icon: "text-amber-500", head: "text-amber-900", labelKey: "levelPerhatian" },
  info: { bar: "bg-ocean-400", chip: "bg-ocean-50 text-ocean-800", dot: "bg-ocean-400", icon: "text-ocean-500", head: "text-ocean-800", labelKey: "levelInfo" },
};

export function AlertBannerView({
  items,
  onPick,
  dismiss,
}: {
  items: ModuleAlertItem[];
  onPick?: (rowId: string) => void;
  dismiss?: BannerDismiss;
}) {
  const { t } = useT();
  const [min, setMin] = useState(false);
  /* Buka/tutup per level, bukan satu sakelar global: tiga group dengan jumlah
     berbeda tidak ikut buka-tutup bersama - membuka `info` yang panjang
     sambil tetap menutup `kritis` yang pendek. */
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});

  const dismissed = dismiss === undefined ? [] : [...dismiss.dismissed];
  /* Level yang ditutup dihitung dari `items` (kondisi nyata), bukan dari
     tampilan: kalau kondisinya sudah selesai, tidak ada yang perlu
     "dibuka kembali". */
  const shown = useMemo(() => visibleItems(items, dismissed), [items, dismissed.join(",")]);
  const hidden = items.length - shown.length;

  /* Cap bawaan groupByLevel (5 item) tidak lagi dipakai di sini: tiap
     kategori tertutup sampai diklik, jadi yang dirender sudah daftar penuh.
     Cap utilitarian tetap ada karena alert-probe mengujinya langsung. */
  const groups = useMemo(() => groupByLevel(shown, shown.length), [shown]);
  const counts = useMemo(() => countByLevel(shown), [shown]);
  const worst = groups[0];

  if (items.length === 0) return null;

  /* Semua level ditutup: banner tetap dirender sebagai baris tipis satu
     tombol "tampilkan lagi". Kalau `return null` di sini, pengguna yang
     tanpa sengaja menutup tidak punya jalan kembali selain reload. */
  if (shown.length === 0 && dismiss !== undefined) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-steel-200 bg-white px-4 py-2">
        <Bell className="h-4 w-4 shrink-0 text-steel-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs text-steel-500">
          {fill(t.notif.dismissedNote, { n: hidden })}
        </p>
        <button
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ocean-600 hover:bg-steel-100"
          onClick={dismiss.restoreEvery}
        >
          {t.notif.restoreAll}
        </button>
      </div>
    );
  }

  const tone = worst === undefined ? LEVEL_STYLE.info : LEVEL_STYLE[worst.level];

  return (
    /* Garis aksen kiri tipis + latar netral. Versi lama memakai fill amber
       penuh untuk semua alert termasuk info, jadi merah dan kuning sama
       saja - alert yang tidak berarti kehilangan warnanya. */
    <div className="mb-4 overflow-hidden rounded-xl border border-steel-200 bg-white">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${tone.bar}`} aria-hidden="true" />
        <Bell className={`mt-1 h-4 w-4 shrink-0 ${tone.icon}`} aria-hidden="true" />
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
                    {/* Baris kategori = satu tombol penuh. Tertutup sampai
                        diklik: chip + jumlah saja yang terlihat, tanpa daftar
                        item. Dulunya `<ul>` selalu dirender dengan 5 item
                        pertama, jadi "buka" hanya menukar pratinjau dengan
                        daftar penuh - kelihatan selalu terbuka. */}
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-steel-50"
                        aria-expanded={isOpen}
                        onClick={() => setOpenLevels((prev) => ({ ...prev, [g.level]: !prev[g.level] }))}
                      >
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${st.chip}`}>
                          {t.notif[st.labelKey]}
                        </span>
                        <span className="min-w-0 truncate text-[11px] text-steel-500">
                          {g.total} · {t.notif.title.toLowerCase()}
                        </span>
                        <ChevronDown
                          className={`ml-auto h-3.5 w-3.5 shrink-0 text-steel-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                      {dismiss !== undefined && (
                        <button
                          type="button"
                          className="shrink-0 rounded p-0.5 text-steel-400 hover:bg-steel-100 hover:text-steel-700"
                          aria-label={fill(t.notif.dismissLevel, { level: t.notif[st.labelKey] })}
                          title={fill(t.notif.dismissLevel, { level: t.notif[st.labelKey] })}
                          onClick={() => dismiss.dismiss(g.level)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <div className="px-2.5 pb-2">
                        <ul className="space-y-1">
                          {sortByLevel(shown.filter((i) => i.level === g.level)).slice(0, RENDER_CAP).map((a) => (
                            <AlertRow key={a.id} item={a} style={st} onPick={onPick} />
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-semibold text-ocean-600 hover:underline"
                          onClick={() => setOpenLevels((prev) => ({ ...prev, [g.level]: false }))}
                        >
                          {t.notif.showLess}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {shown.length > RENDER_CAP && (
                <p className="text-[11px] text-steel-500">
                  {fill(t.notif.cappedNote ?? `Menampilkan ${RENDER_CAP} pertama - saring tabel untuk sisanya.`, { n: RENDER_CAP })}
                </p>
              )}
              {dismiss !== undefined && hidden > 0 && (
                <p className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-steel-500">
                  <span>{fill(t.notif.dismissedNote, { n: hidden })}</span>
                  {dismissed.map((lvl) => (
                    <button
                      key={lvl}
                      className="font-semibold text-ocean-600 hover:underline"
                      onClick={() => dismiss.restore(lvl)}
                    >
                      {fill(t.notif.restoreLevel, { level: t.notif[LEVEL_STYLE[lvl].labelKey] })}
                    </button>
                  ))}
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
  dismiss: BannerDismiss;
} {
  const { data } = useStore();
  const [params] = useSearchParams();
  const active = params.get("alert") === key;
  // Hanya hitung 1 modul (murah) - bukan 13 modul sekaligus.
  const items = useMemo(() => buildModuleAlertItemsFor(data, key), [data, key]);
  const dismiss = useBannerDismiss(key);

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

  return { active, items, dismiss };
}
