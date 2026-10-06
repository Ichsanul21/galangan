import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, FileDown } from "lucide-react";
import {
  Badge,
  Card,
  PageHeader,
  ProgressBar,
  StatusBadge,
  toast,
  SearchBox,
  rowMatches,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_prj } from "../../i18n/n_prj";
import { fmtBulan, fmtMiliar, fmtRupiah, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";
import { TAHAP, tahapOf, isOverdue } from "./Projects";
import { canonPrioritas } from "../../utils/scope";

const prioritasTone: Record<string, "gray" | "blue" | "amber" | "red"> = {
  Rendah: "gray",
  Sedang: "blue",
  Tinggi: "amber",
};

interface AttentionItem {
  group: string;
  title: string;
  desc: string;
  pid: string;
}

function endInDays(end: string): number | null {
  return endInDaysShared(end, todayISO());
}

import { delayDaysOf as delayDaysShared, endInDays as endInDaysShared } from "../../utils/projectDelay";

export default function Monitoring() {
  const { locale } = useT();
  const S = n_prj[locale];
  const { data, wbsFor, inBranch } = useStore();
  const groupLbl: Record<string, string> = { Terlambat: S.attLate, "Over-budget": S.attOver, "NCR Critical": S.attNcr, "CO Diajukan": S.attCo, "Milestone dekat": S.attMile };
  const projects = data.projects;
  const [branchFilter, setBranchFilter] = useState("Semua");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"Semua" | "Perhatian">("Semua");
  /* Scrollbar horizontal atas + bawah: mirror tersinkron dua arah dengan
     scroll kolom kanban - tetap terjangkau saat daftar kolom panjang. */
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const barScrollRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const syncScroll = (src: HTMLDivElement | null, ...dsts: (HTMLDivElement | null)[]) => {
    if (!src || syncingRef.current) return;
    syncingRef.current = true;
    for (const dst of dsts) {
      if (dst) dst.scrollLeft = src.scrollLeft;
    }
    requestAnimationFrame(() => { syncingRef.current = false; });
  };
  const scrollKanbanBy = (dx: number) => {
    topScrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  };
  const kanbanWidth = TAHAP.length * 272;

  /* Hanya SATU scrollbar kustom yang tampil pada satu waktu.
     Area kanban punya dua: bar atas (sticky top-14) dan bar bawah (sticky
     bottom-0). Kalau keduanya dibiarkan, keduanya terlihat bersamaan saat
     area kanban lebih tinggi dari viewport - ditambah scrollbar native
     container kolom jadi tiga scrollbar untuk satu aksi yang sama.

     Yang menentukan adalah bar BAWAH: dia "muncul"/nempel justru ketika
     area kanban masih melanjut ke bawah viewport. Selama itu terjadi bar
     bawah dipakai; setelah area kanban sudah muat seluruhnya (tidak ada
     yang perlu digulir ke bawah) bar bawah tidak berguna, jadi bar atas
     yang dipakai. Dua-duanya saling meniadakan, hasilnya tepat satu.
     Versi sebelumnya memakai kebalikan dari ini (r.top <= 56) sehingga
     bar yang muncul justru kebalik dari yang diharapkan. */
  const kanbanWrapRef = useRef<HTMLDivElement | null>(null);
  const [bottomBarOn, setBottomBarOn] = useState(true);
  useEffect(() => {
    const wrap = kanbanWrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const r = wrap.getBoundingClientRect();
      // melanjut ke bawah viewport 1px = bar bawah berfungsi
      setBottomBarOn(r.bottom > window.innerHeight + 1);
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const branchCities = data.branches.length > 0
    ? data.branches.map((b) => String(b.city))
    : [...new Set(projects.map((p) => String(p.branch)))];

  const filtered = inBranch(projects).filter((p) => {
    const matchBranch = branchFilter === "Semua" || p.branch === branchFilter;
    const matchQ = rowMatches(p as unknown as Record<string, unknown>, q, ["vessel", "id", "client", "status", "type", "manager"]);
    return matchBranch && matchQ;
  });

  const openNcr = (pid: string): StoreItem[] =>
    data.ncr.filter((n) => n.project === pid && n.status !== "Tertutup");
  const diajukanCo = (pid: string): StoreItem[] =>
    data.changeOrders.filter((c) => c.project === pid && c.status === "Diajukan");

  const attention: AttentionItem[] = [];
  /* Terlambat dihitung LOKAL dari tanggal selesai + progres.
     Versi lama hanya membaca p.status === "Terlambat", dan flag itu hanya
     di-set oleh useEffect di halaman Proyek/Detail Proyek. Jadi Monitoring
     (halaman yang justru dipakai untuk memantau) buta terhadap keterlambatan
     sampai user kebetulan membuka halaman lain. */
  const isLate = (p: StoreItem): boolean => p.status === "Terlambat" || isOverdue(p, todayISO());
  for (const p of filtered) {
    if (isLate(p)) {
      attention.push({ group: "Terlambat", title: `${p.id} · ${p.vessel}`, desc: S.monLateDesc.replace("{n}", String(p.progress)), pid: p.id });
    }
    if (Number(p.actual) > Number(p.budget)) {
      attention.push({ group: "Over-budget", title: `${p.id} · ${p.vessel}`, desc: S.monOverDesc.replace("{a}", fmtRupiah(Number(p.actual))).replace("{b}", fmtRupiah(Number(p.budget))), pid: p.id });
    }
    const critical = openNcr(p.id).filter((n) => n.severity === "Critical");
    for (const n of critical) {
      attention.push({ group: "NCR Critical", title: `${n.id} · ${p.vessel}`, desc: String(n.issue ?? "NCR critical terbuka"), pid: p.id });
    }
    for (const c of diajukanCo(p.id)) {
      attention.push({ group: "CO Diajukan", title: `${c.id} · ${p.vessel}`, desc: `${String(c.title)} (${fmtRupiah(Number(c.impact))})`, pid: p.id });
    }
    // Hanya WBS nyata - template fallback tidak boleh jadi perhatian.
    if (!data.wbsByProject?.[p.id]?.length) continue;
    for (const w of wbsFor(p.id)) {
      const d = endInDays(w.end);
      if (Number(w.progress) === 0 && d !== null && d >= 0 && d < 30) {
        attention.push({ group: "Milestone dekat", title: `${p.id} · ${w.task}`, desc: S.monMileDesc.replace("{a}", fmtBulan(w.end)), pid: p.id });
      }
    }
  }

  const attentionPids = new Set(attention.map((a) => a.pid));
  const pipeline = mode === "Semua" ? filtered : filtered.filter((p) => attentionPids.has(p.id));

  const delayDaysOf = (p: StoreItem): number | null =>
    delayDaysShared(p.end, todayISO(), isLate(p));

  const exportRekap = () => {
    const rows: unknown[][] = [
      ["Kode", "Kapal", "Tipe", "Cabang", "Tahap", "Prioritas", "Status", "Progres %", "Budget (Rp)", "Actual (Rp)", "NCR Terbuka", "CO Diajukan"],
      ...filtered.map((p) => [
        p.id, p.vessel, p.type, p.branch, tahapOf(p), p.prioritas ?? "Sedang", p.status,
        Number(p.progress || 0), Number(p.budget || 0), Number(p.actual || 0),
        openNcr(p.id).length, diajukanCo(p.id).length,
      ]),
    ];
    void exportExcel(rows, "monitoring-proyek", "Monitoring").then(() => toast(S.monToastExport)).catch(() => toast(S.saveFail, "info"));
  };

  return (
    <div>
      <PageHeader
        title={S.monTitle}
        subtitle={S.monSubtitle}
        icon={<Activity className="h-5 w-5" />}
        actions={<button className="btn-secondary" onClick={exportRekap}><FileDown className="h-4 w-4" /> {S.exportExcelBtn}</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={S.searchProjectPh}
          ariaLabel={S.searchProjectAria}
          className="w-full sm:w-64"
        />
        <select className="input w-auto py-1.5 text-sm" aria-label={S.prjFilterCabangAria} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="Semua">{S.prjAllCabang}</option>
          {branchCities.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex gap-1" role="group" aria-label={S.monModeAria}>
          {(["Semua", "Perhatian"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
              }`}
            >
              {m === "Semua" ? S.filterAll : S.monModeAtt}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-steel-500">{S.monCount.replace("{a}", String(pipeline.length)).replace("{b}", String(attentionPids.size))}</p>
      </div>

      <Card className="mb-4 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> {S.monAttTitle.replace("{n}", String(attention.length))}
        </h3>
        {attention.length === 0 && <p className="text-sm text-steel-400">{S.monAttEmpty}</p>}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {attention.map((a, i) => (
            <Link
              key={`${a.group}-${a.title}-${i}`}
              to={`/proyek/${a.pid}`}
              className="flex items-center gap-3 rounded-xl border border-steel-100 p-2.5 text-sm transition-colors hover:border-ocean-400 hover:bg-surface"
            >
              <Badge tone={a.group === "NCR Critical" || a.group === "Terlambat" || a.group === "Over-budget" ? "red" : "amber"}>{groupLbl[a.group] ?? a.group}</Badge>
              <div className="min-w-0">
                <p className="truncate font-medium text-navy-900">{a.title}</p>
                <p className="truncate text-xs text-steel-500">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <div ref={kanbanWrapRef}>
      <div className="mb-2 flex items-center gap-2">
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => scrollKanbanBy(-320)} aria-label={locale === "en" ? "Scroll kanban left" : "Geser kanban ke kiri"}>&larr;</button>
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => scrollKanbanBy(320)} aria-label={locale === "en" ? "Scroll kanban right" : "Geser kanban ke kanan"}>&rarr;</button>
        <span className="text-[11px] text-steel-400">{locale === "en" ? "Scroll kanban horizontally" : "Geser kanban ke samping"}</span>
      </div>
      {/* Bar atas: tampil HANYA saat bar bawah tidak berfungsi. */}
      {!bottomBarOn && (
      <div
        ref={topBarRef}
        onScroll={() => syncScroll(topBarRef.current, topScrollRef.current, barScrollRef.current)}
        /* top-14 z-30: sebelumnya top-0 z-10 sehingga scrollbar ini tertutup
           header aplikasi (sticky top-0 z-20 h-14) saat halaman di-scroll. */
        className="sticky top-14 z-30 overflow-x-auto rounded-lg border border-steel-200 bg-white"
        style={{ height: 14 }}
        aria-hidden="true"
      >
        <div style={{ width: kanbanWidth, height: 1 }} />
      </div>
      )}
      {/* hide-native-bar: scrollbar bawaan container kolom disembunyikan
          supaya tidak jadi baris ketiga; scrolling tetap jalan lewat roda,
          swipe, tombol, dan bar kustom. */}
      <div ref={topScrollRef} onScroll={() => syncScroll(topScrollRef.current, topBarRef.current, barScrollRef.current)} className="hide-native-bar flex gap-4 overflow-x-auto pb-2">
        {TAHAP.map((t) => {
          const cols = pipeline.filter((p) => tahapOf(p) === t);
          return (
            <div key={t} className="w-64 shrink-0 rounded-2xl border border-steel-200 bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-900">{t}</p>
                <Badge tone="navy">{cols.length}</Badge>
              </div>
              <div className="space-y-2">
                {cols.map((p) => {
                  const pct = Number(p.budget) > 0 ? (Number(p.actual) / Number(p.budget)) * 100 : 0;
                  const delay = delayDaysOf(p);
                  return (
                    <Link
                      key={p.id}
                      to={`/proyek/${p.id}`}
                      className="block rounded-xl border border-steel-200 bg-white p-3 transition-colors hover:border-ocean-400"
                    >
                      <p className="font-mono text-xs text-steel-500">{p.id}</p>
                      <p className="truncate text-sm font-semibold text-navy-900">{p.vessel}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={prioritasTone[canonPrioritas(p.prioritas)] ?? "blue"}>{canonPrioritas(p.prioritas)}</Badge>
                        <StatusBadge status={p.status} />
                      </div>
                      {delay !== null && (
                        <p className={`mt-1.5 text-[11px] font-semibold ${delay > 0 ? "text-rose-600" : "text-amber-600"}`}>
                          {delay > 0 ? S.monDelayDays.replace("{n}", String(delay)) : S.monDelayCheck}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar value={Number(p.progress || 0)} className="flex-1" tone={p.status === "Terlambat" ? "red" : "navy"} />
                        <span className="text-xs font-medium text-steel-600">{p.progress}%</span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-steel-500">{fmtMiliar(Number(p.actual))} / {fmtMiliar(Number(p.budget))}</p>
                      <ProgressBar value={pct} tone={pct > 100 ? "red" : "ocean"} />
                      <p className="mt-1.5 text-[11px] text-steel-500">{S.monNcrOpen}<span className={`font-semibold ${openNcr(p.id).length > 0 ? "text-rose-600" : "text-steel-500"}`}>{openNcr(p.id).length}{openNcr(p.id).some((n) => n.severity === "Critical") ? S.monCritSuffix : ""}</span></p>
                    </Link>
                  );
                })}
                {cols.length === 0 && <p className="py-4 text-center text-xs text-steel-400">{S.monEmptyStage}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {/* Bar bawah: tampil HANYA saat area kanban masih melanjut ke bawah. */}
      {bottomBarOn && (
      <div
        ref={barScrollRef}
        onScroll={() => syncScroll(barScrollRef.current, topBarRef.current, topScrollRef.current)}
        className="overflow-x-auto rounded-lg border border-steel-200 bg-white"
        style={{ position: "sticky", bottom: 0, height: 14 }}
        aria-hidden="true"
      >
        <div style={{ width: kanbanWidth, height: 1 }} />
      </div>
      )}
      </div>
    </div>
  );
}
