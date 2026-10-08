import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, BadgeCheck, Download, Eye, Lock, Network, Plus, Users, Pencil, Trash2, Printer } from "lucide-react";
import {
  Badge,
  Card,
  ConfirmModal,
  Donut,
  EmptyState,
  Field,
  FormGrid,
  KpiCard,
  Modal,
  PageHeader,
  ProgressBar,
  SortTh,
  StatusBadge,
  Tabs,
  sortRows,
  toast,
  toggleSort,
  usePager,
  NumInput,
  FileUploadButton,
  SecureImg,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { AsyncButton, useBusy, SearchBox, rowMatches, RowAction } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore } from "../../data/store";
import { DocumentPreviewCell, DocumentPreviewPanel } from "../../components/DocumentPreview";
import { useModuleSync } from "../../data/useModuleSync";
import { findUsages } from "../../utils/usages";
import type { StoreItem, CollectionKey } from "../../data/store";
import { activeEmployeeTrend, certifiedTrend, certExpireTrend, employeeTrend } from "../../data";
import { fmtTanggal, fmtRupiah, todayISO } from "../../utils/format";
import { QRCodeSVG } from "qrcode.react";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { AlertBannerView, flashPick, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { rowHighlightClass } from "../../components/rowHighlight";
import { getSetting } from "../../utils/settings";
import { useAuth } from "../../auth/auth";
import { exportExcel } from "../../utils/export";
import { pdfServerReady } from "../../services/pdfClient";
import { usePdfDoc } from "../../components/usePdfDoc";
import { SB_KOP } from "../../utils/sb";
import { useT } from "../../i18n/LanguageContext";
import { n_qc } from "../../i18n/n_qc";

const CERT_WINDOW = 90;
const TIPE_KARYAWAN = ["Tetap", "Kontrak", "Outsourcing", "Training"];
const JABATAN_OPTIONS = ["Operator", "Fitter", "Welder", "Painter", "Foreman", "Supervisor", "QC Inspector", "HSE Officer", "Admin", "Logistik", "Procurement", "Project Engineer", "Manager Proyek", "Lainnya"];
const PTKP_STATUS = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];
/* T6-SDM10: pendidikan selectable + status kawin + jenis kelamin. */
const PENDIDIKAN_OPTIONS = ["SD", "SMP", "SMA/SMK", "D1", "D2", "D3", "D4", "S1", "S2", "S3", "Lainnya"];
const KAWIN_OPTIONS = ["Belum Kawin", "Kawin", "Cerai"];
const JK_OPTIONS = ["Laki-laki", "Perempuan"];
/* T6-SDM8: surat kontrak baru + perpanjangan kontrak, di samping SP/Mutasi. */
const SURAT_JENIS = ["SP 1", "SP 2", "SP 3", "Mutasi", "Kontrak Kerja", "Perpanjangan Kontrak"];
const KONTRAK_JENIS: readonly string[] = ["Kontrak Kerja", "Perpanjangan Kontrak"];
const IMPORT_HEADERS = ["NIK", "Nama", "Jabatan", "Departemen", "Cabang", "Status", "Tanggal Gabung (YYYY-MM-DD)", "Tipe", "Gaji Pokok", "PTKP Status", "Tanggungan", "Kontrak Berakhir (YYYY-MM-DD)"];
const DEPT_OPTIONS = ["Direksi", "Proyek", "Produksi", "Quality", "Finance", "Procurement", "Support"];
const LEAVE_TYPES = ["Tahunan", "Sakit", "Izin", "Melahirkan", "Cuti Besar", "Unpaid"];

const SKILL_BY_DEPT: Record<string, string[]> = {
  Direksi: ["Kepemimpinan", "Strategi", "Keuangan"],
  Proyek: ["Perencanaan Proyek", "Koordinasi Lapangan", "Pelaporan"],
  Produksi: ["Pengelasan", "Fabrikasi", "Blasting & Coating"],
  Quality: ["Inspeksi Visual", "NDT", "Dokumentasi QC"],
  Finance: ["Akuntansi", "Penganggaran", "Perpajakan"],
  Procurement: ["Sourcing", "Negosiasi", "Kepabeanan"],
  Support: ["Administrasi", "K3", "Logistik"],
};

const DEPT_COLORS = ["#0b3a63", "#2e9ad4", "#0d9488", "#8b5cf6", "#f59e0b", "#f43f5e", "#64748b"];

interface EmpCert {
  name: string;
  expires: string;
}

/* StoreItem ber-index-signature sehingga tidak memenuhi constraint generik inBranch;
   intersection ini mempertahankan field sekaligus memuaskan constraint. */
type Branchable = StoreItem & { branch?: string };

function addYearsISO(iso: string, years = 2): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return todayISO();
  return `${Number(m[1]) + years}-${m[2]}-${m[3] ?? "01"}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

function defaultSkills(dept: string, role: string): string[] {
  const base = [...(SKILL_BY_DEPT[dept] ?? ["Administrasi", "K3"])];
  if (/manager|superintendent|foreman|direktur/i.test(role) && !base.includes("Manajemen Tim")) base.push("Manajemen Tim");
  return base;
}

function getSkills(e: StoreItem): string[] {
  if (Array.isArray(e.skills) && e.skills.length > 0) return e.skills.map((s) => String(s));
  return defaultSkills(String(e.dept ?? ""), String(e.role ?? ""));
}

function normCerts(e: StoreItem): EmpCert[] {
  const fallback = addYearsISO(String(e.join ?? todayISO()));
  const raw = e.certs;
  if (Array.isArray(raw)) {
    return raw.map((c) =>
      typeof c === "string"
        ? { name: c, expires: fallback }
        : { name: String(c.name ?? "Sertifikat"), expires: String(c.expires ?? fallback) },
    );
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((c) => ({ name: c.trim(), expires: fallback }))
      .filter((c) => c.name);
  }
  return [];
}

function empNik(e: StoreItem): string {
  const nik = String(e.username ?? "").trim();
  return nik || String(e.id);
}

function calcDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/* Daftar tanggal ISO (YYYY-MM-DD) dari from..to inklusif untuk sinkron cuti → absensi. */
function datesBetween(from: string, to: string): string[] {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return [];
  const out: string[] = [];
  for (let t = a; t <= b; t += 86400000) {
    const d = new Date(t);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/* Petakan tipe cuti ke status absensi agar rekap sinkron. */
function leaveToAttStatus(type: string): string {
  const t = String(type ?? "");
  if (t === "Sakit") return "Sakit";
  if (t === "Izin") return "Izin";
  return "Cuti";
}

/* Parse CSV sederhana: baris dipisah newline, kolom dipisah koma, petik ganda opsional. */
function parseCSV(text: string): string[][] {
  return String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (ch === "," && !quoted) {
          cells.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    });
}

const emptyEmpForm = () => ({
  nik: "",
  name: "",
  role: "",
  dept: "Produksi",
  branch: "Samarinda",
  status: "Aktif",
  join: "",
  tipe: "Tetap",
  basic: "",
  allowances: "",
  contractEnd: "",
  ptkpStatus: "TK/0",
  dependents: "0",
  /* T6-SDM9/10: foto + KTP/ijazah + pendidikan/kawin/jk. */
  photo: "",
  ktpUrl: "",
  ijazahUrl: "",
  pendidikan: "SMA/SMK",
  kawin: "Belum Kawin",
  jk: "Laki-laki",
});

/* Batch koleksi modul SDM untuk useModuleSync (pengganti resync penuh). */
const HR_COLS: CollectionKey[] = ["activities", "attendance", "branches", "employees", "leaves", "trainings", "letters"];

export default function HR() {
  const busy = useBusy();
  const { data, add, update, remove, log, branch, setBranch, inBranch } = useStore();
  const { locale } = useT();
  const S = n_qc[locale];
  /* Nama penyetuju dicatat di baris cuti, bukan diasumsikan: surat persetujuan
     ditandatangani atas nama orang tertentu, jadi "siapa" harus benar. */
  const { user } = useAuth();
  const modAlert = useModuleAlert("sdm");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  const pdfDoc = usePdfDoc();
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(HR_COLS);
  const [tab, setTab] = useState("Karyawan");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  /* ---------- filter karyawan ---------- */
  const [dept, setDept] = useState("Semua");
  const [q, setQ] = useState("");

  /* ---------- form karyawan ---------- */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEmpForm);
  const [contractSoonOnly, setContractSoonOnly] = useState(false);

  /* ---------- cuti ---------- */
  const [showLeave, setShowLeave] = useState(false);
  const [leaveEditId, setLeaveEditId] = useState<string | null>(null);
  /* true = mengoreksi cuti yang sudah disetujui (periode terkunci). */
  const [leaveFinalEdit, setLeaveFinalEdit] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", type: "Tahunan", from: todayISO(), to: todayISO(), note: "", fileUrl: "" });
  const [rejectTarget, setRejectTarget] = useState<StoreItem | null>(null);
  const [delLeave, setDelLeave] = useState<StoreItem | null>(null);

  /* ---------- mutasi ---------- */
  const [showMutasi, setShowMutasi] = useState(false);
  const [mutasiForm, setMutasiForm] = useState({ employeeId: "", dept: "Produksi", branch: "Samarinda", role: "", date: todayISO(), reason: "" });
  const [mutQ, setMutQ] = useState("");

  /* ---------- training ---------- */
  const [showTraining, setShowTraining] = useState(false);
  const [trainingForm, setTrainingForm] = useState({ title: "", date: todayISO(), provider: "", participants: [] as string[] });
  const [trainingEditId, setTrainingEditId] = useState<string | null>(null);
  const [delTraining, setDelTraining] = useState<StoreItem | null>(null);
  const [certTarget, setCertTarget] = useState<StoreItem | null>(null);
  const [certForm, setCertForm] = useState({ name: "", expires: todayISO(), no: "", issued: "", fileUrl: "" });

  /* ---------- surat ---------- */
  const [showSurat, setShowSurat] = useState(false);
  const [suratForm, setSuratForm] = useState({ employeeId: "", jenis: "SP 1", isi: "", tanggal: todayISO(), fileUrl: "", approvedBy: "", approvedAt: "", sourceType: "", sourceId: "", mulai: "", berakhir: "", gaji: "" });
  /* Arsip surat pindah dari useDraftState("isms.draft.hr.arsipSurat") ke
     koleksi `letters`. Alasan: draft localStorage hilang saat cache browser
     dibersihkan, tidak pernah sampai ke server (user lain tidak pernah
     melihat surat yang sama), dan tidak bisa di-audit. Seed ada di
     data/seeds.ts (seedLetters) supaya arsip awal tetap terlihat.
     Migrasi sekali jalan: draft lama yang belum ada di store di-import. */
  const arsipSurat = data.letters;
  const [suratEditId, setSuratEditId] = useState<string | null>(null);
  const [suratPreviewFor, setSuratPreviewFor] = useState<StoreItem | null>(null);
  /* H1c: preview surat cuti setelah approve HRD - terpisah dari suratHr
     archive supaya request PDF memakai kind suratCuti, bukan suratHr. */
  const [cutiPreviewId, setCutiPreviewId] = useState<string | null>(null);
  /* Pratinjau arsip dirender begitu modal dibuka, bukan setelah tombol ditekan:
     tujuannya pratinjau berarti "beri saya lihat suratnya", dan meminta klik
     tambahan sebelum melihat apa pun hanya satu langkah sia-sia. `usePdfDoc`
     menyusun ulang request kalau surat yang sama dibuka lagi, dan melepas
     Blob URL sebelumnya supaya tidak menumpuk di RAM. */
  useEffect(() => {
    const row = suratPreviewFor;
    if (row === null) return;
    if (!pdfServerReady()) return;
    /* C3: export PDF langsung download (`open = false`), tanpa modal preview.
       Client: "jangan menampilkan preview, langsung download saja". */
    void pdfDoc.request({ kind: "suratHr", id: String(row.id ?? ""), locale }, `Surat-${String(row.id ?? "")}.pdf`, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suratPreviewFor]);

  /* H1c: preview surat cuti (bukan unduh paksa) - modal memakai pdfDoc.state.url. */
  useEffect(() => {
    if (cutiPreviewId === null) return;
    if (!pdfServerReady()) return;
    void pdfDoc.request({ kind: "suratCuti", id: cutiPreviewId, locale }, `Surat-Cuti-${cutiPreviewId}.pdf`, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutiPreviewId]);
  const [delEmp, setDelEmp] = useState<StoreItem | null>(null);
  const [delSurat, setDelSurat] = useState<StoreItem | null>(null);
  const [lettersMigrated, setLettersMigrated] = useState(false);

  /* ---------- impor massal ---------- */
  const [importReport, setImportReport] = useState<{ ok: number; gagal: string[] } | null>(null);

  /* Migrasi arsip surat SEKALI JALAN: draft localStorage yang belum ada di
     koleksi `letters` di-import sebagai baris store asli. Tanpa ini, semua
     surat yang sudah dibuat user sebelumnya lenyap saat pindah ke store. */
  useEffect(() => {
    if (lettersMigrated) return;
    setLettersMigrated(true);
    let legacy: StoreItem[] = [];
    try {
      const raw = localStorage.getItem("isms.draft.hr.arsipSurat");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) legacy = parsed as StoreItem[];
    } catch {
      legacy = [];
    }
    if (legacy.length === 0) return;
    const known = new Set(arsipSurat.map((s) => String(s.id)));
    const fresh = legacy.filter((s) => String(s.id ?? "") !== "" && !known.has(String(s.id)));
    if (fresh.length === 0) return;
    void (async () => {
      let moved = 0;
      for (const entry of fresh) {
        try {
          await add(
            "letters",
            {
              ...entry,
              fileUrl: String(entry.fileUrl ?? ""),
              fileName: String(entry.fileName ?? ""),
              createdBy: "Anda",
              createdAt: String(entry.createdAt ?? entry.tanggal ?? ""),
            },
            { action: "memindahkan arsip surat ke arsip resmi", target: String(entry.id), module: "SDM" },
          );
          moved += 1;
        } catch {
          // Satu baris gagal tidak boleh menghentikan sisa impor.
        }
      }
      if (moved > 0) {
        toast(
          locale === "en"
            ? `${moved} letter(s) migrated from the old local archive`
            : `${moved} surat dimindahkan dari arsip lokal lama`,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersMigrated]);

  const branchCities = useMemo(() => data.branches.map((b) => String(b.city)), [data.branches]);
  const scopedEmployees = useMemo(() => inBranch(data.employees as Branchable[]), [data.employees, inBranch]);
  const jatahCuti = getSetting(data, "CUTI_JATAH", 12);
  const deptOptions = useMemo(
    () => ["Semua", ...Array.from(new Set(data.employees.map((e) => String(e.dept))))],
    [data.employees],
  );

  const leaveUsed = useMemo(() => {
    const m = new Map<string, number>();
    data.leaves
      .filter((l) => l.type === "Tahunan" && l.status === "Disetujui")
      .forEach((l) => m.set(String(l.employeeId), (m.get(String(l.employeeId)) ?? 0) + Number(l.days || 0)));
    return m;
  }, [data.leaves]);
  const saldoCuti = (empId: string) => jatahCuti - (leaveUsed.get(empId) ?? 0);

  const contractDays = (e: StoreItem): number | null => daysUntil(String(e.contractEnd ?? "") || null);

  const list = useMemo(
    () =>
      scopedEmployees.filter((e) => {
        const matchD = dept === "Semua" || e.dept === dept;
        const matchQ = rowMatches(e, q, ["name", "role", "dept", "branch", "status", "certs", "id"]) || empNik(e).toLowerCase().includes(q.trim().toLowerCase());
        const cd = daysUntil(String(e.contractEnd ?? "") || null);
        const matchC = !contractSoonOnly || (cd !== null && cd >= 0 && cd <= 30);
        return matchD && matchQ && matchC;
      }),
    [scopedEmployees, dept, q, contractSoonOnly],
  );
  const sortedEmps = useMemo(() => {
    /* T6-SDM1: "saat data diubah posisinya tetap, jika ditambahkan posisinya
       di bawah". Store `add()` menempatkan baris baru di AWAL array (prepend),
       sedangkan `update()` mempertahankan posisi. Tanpa sort (key null),
       sortRows() mengembalikan array apa adanya → edit tetap di tempat,
       tapi tambah muncul di ATAS. Urutkan default berdasarkan createdAt
       ascending supaya karyawan lama di atas dan yang baru di bawah;
       user masih bisa mengklik header kolom untuk sort lain. */
    const base = sort.key ? list : [...list].sort((a, b) => {
      const ca = createdAtOf(a) ?? "";
      const cb = createdAtOf(b) ?? "";
      return ca.localeCompare(cb);
    });
    return sortRows(base, sort, (row, k) => {
      const e = row as StoreItem;
      switch (k) {
        case "name": return String(e.name ?? "");
        case "nik": return empNik(e);
        case "role": return String(e.role ?? "");
        case "branch": return String(e.branch ?? "");
        case "contract": return String(e.contractEnd ?? "");
        case "saldo": return Number(saldoCuti(String(e.id)));
        case "status": return String(e.status ?? "");
        case "createdAt": return createdAtOf(e) ?? "";
        case "updatedAt": return lastTouchedAt(e) ?? "";
        default: return "";
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [list, sort]);
  const empPager = usePager(list.length);
  useEffect(() => {
    empPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, q, contractSoonOnly, branch, tab]);
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const leaveIdx = data.leaves.findIndex((l) => ids.includes(String(l.id)));
    if (leaveIdx >= 0) {
      if (tab === "Cuti & Izin") { flashPick(flash, ids, -1, () => {}, 100); return; }
      setTab("Cuti & Izin");
      window.setTimeout(() => flashPick(flash, ids, -1, () => {}, 100), 250);
      return;
    }
    const idx = sortedEmps.findIndex((r) => ids.includes(String(r.id)));
    if (idx >= 0) {
      if (tab === "Karyawan") { flashPick(flash, ids, idx, empPager.go, empPager.size); return; }
      setTab("Karyawan");
      window.setTimeout(() => flashPick(flash, ids, idx, empPager.go, empPager.size), 250);
      return;
    }
    flashPick(flash, ids, -1, () => {}, 100);
  };
  const pickNotif = (rowId: string) => pickNotifIds([rowId]);
  useDeepLinkTarget(deepParams.tab, deepParams.highlight, setTab, pickNotifIds);

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    scopedEmployees.forEach((e) => m.set(String(e.dept), (m.get(String(e.dept)) ?? 0) + 1));
    return Array.from(m.entries()).map(([name, value], i) => ({ name, value, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
  }, [scopedEmployees]);

  const expiring = useMemo(
    () =>
      data.employees
        .flatMap((e) =>
          normCerts(e).map((c) => ({
            emp: String(e.name),
            empId: String(e.id),
            name: c.name,
            expires: c.expires,
            days: daysUntil(c.expires),
          })),
        )
        .filter((c) => c.days !== null && (c.days as number) <= CERT_WINDOW)
        .sort((a, b) => (a.days as number) - (b.days as number)),
    [data.employees],
  );

  const certifiedCount = data.employees.filter((e) => normCerts(e).length > 0).length;
  const certifiedPct = data.employees.length > 0 ? Math.round((certifiedCount / data.employees.length) * 100) : 0;
  const activeCount = data.employees.filter((e) => e.status === "Aktif").length;

  /* ---------- KPI turnover & masa kerja ---------- */
  const nonaktifCount = data.employees.filter((e) => e.status !== "Aktif").length;
  const turnoverPct = data.employees.length > 0 ? (nonaktifCount / data.employees.length) * 100 : 0;
  const avgTenure = useMemo(() => {
    const now = new Date(todayISO() + "T00:00:00").getTime();
    const years = data.employees
      .map((e) => {
        const t = new Date(`${String(e.join ?? "")}T00:00:00`).getTime();
        if (Number.isNaN(t) || t > now) return null;
        return (now - t) / 31557600000;
      })
      .filter((v): v is number => v !== null);
    if (years.length === 0) return 0;
    return years.reduce((s, v) => s + v, 0) / years.length;
  }, [data.employees]);

  const topSkills = useMemo(() => {
    const freq = new Map<string, number>();
    data.employees.forEach((e) => {
      getSkills(e).forEach((s) => freq.set(s, (freq.get(s) ?? 0) + 1));
    });
    return Array.from(freq.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [data.employees]);

  const mutasiLog = useMemo(
    () =>
      data.activities
        .filter((a) => `${a.action} ${a.target}`.toLowerCase().includes("mutasi")),
    [data.activities],
  );

  const orgGroups = useMemo(() => {
    const m = new Map<string, StoreItem[]>();
    scopedEmployees.forEach((e) => {
      const k = String(e.dept || "Lainnya");
      m.set(k, [...(m.get(k) ?? []), e]);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopedEmployees]);

  /* ---------- simpan karyawan ---------- */
  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyEmpForm(), branch: branch === "SEMUA" ? "Samarinda" : branch });
    setShowForm(true);
  };

  const openEdit = (e: StoreItem) => {
    setEditingId(e.id);
    setForm({
      nik: empNik(e),
      name: String(e.name ?? ""),
      role: String(e.role ?? ""),
      dept: String(e.dept ?? "Produksi"),
      branch: String(e.branch ?? "Samarinda"),
      status: String(e.status ?? "Aktif"),
      join: String(e.join ?? ""),
      tipe: String(e.tipe ?? "Tetap"),
      basic: String(e.basic ?? ""),
      allowances: String(e.allowances ?? ""),
      contractEnd: String(e.contractEnd ?? ""),
      ptkpStatus: String(e.ptkpStatus ?? "TK/0"),
      dependents: String(e.dependents ?? 0),
      photo: String(e.photo ?? ""),
      ktpUrl: String(e.ktpUrl ?? ""),
      ijazahUrl: String(e.ijazahUrl ?? ""),
      pendidikan: String(e.pendidikan ?? "SMA/SMK"),
      kawin: String(e.kawin ?? "Belum Kawin"),
      jk: String(e.jk ?? "Laki-laki"),
    });
    setShowForm(true);
  };

  const saveEmployee = async () => {
    const nik = form.nik.trim();
    const name = form.name.trim();
    const role = form.role.trim();
    if (!name || !role) {
      toast(S.tNamaJabatan, "info");
      return;
    }
    if (!nik) {
      toast(S.tNikWajib, "info");
      return;
    }
    if (!/^\d{16}$/.test(nik)) {
      toast(S.tNik16, "info");
      return;
    }
    if (!form.join) {
      toast(S.tJoinWajib, "info");
      return;
    }
    if (form.join > todayISO()) {
      toast(S.tJoinFuture, "info");
      return;
    }
    if (!DEPT_OPTIONS.includes(form.dept)) {
      toast(S.tDeptInvalid, "info");
      return;
    }
    if (!branchCities.includes(form.branch)) {
      toast(S.tCabangInvalid, "info");
      return;
    }
    if ((form.tipe === "Kontrak" || form.tipe === "Outsourcing") && !form.contractEnd) {
      toast(S.tKontrakWajib, "info");
      return;
    }
    if (form.contractEnd && form.contractEnd < form.join) {
      toast(S.tKontrakJoin, "info");
      return;
    }
    const dupe = data.employees.some(
      (e) =>
        e.id !== editingId &&
        (String(e.name).toLowerCase() === name.toLowerCase() ||
          empNik(e).toLowerCase() === nik.toLowerCase()),
    );
    if (dupe) {
      toast(S.tDupe, "info");
      return;
    }
    const basic = Number(form.basic || 0);
    const allowances = Number(form.allowances || 0);
    if (Number.isNaN(basic) || basic < 0 || Number.isNaN(allowances) || allowances < 0) {
      toast(S.tGajiValid, "info");
      return;
    }
    const dependents = Math.min(3, Math.max(0, Number(form.dependents || 0)));
    if (!PTKP_STATUS.includes(form.ptkpStatus)) {
      toast(S.tPtkpInvalid, "info");
      return;
    }
    if (Number.isNaN(dependents)) {
      toast(S.tTangValid, "info");
      return;
    }
    const empPatch = {
      username: nik,
      name,
      role,
      dept: form.dept,
      branch: form.branch,
      status: form.status,
      join: form.join,
      tipe: form.tipe,
      basic,
      allowances,
      contractEnd: form.contractEnd || "",
      ptkpStatus: form.ptkpStatus,
      dependents,
      /* T6-SDM9/10 */
      photo: form.photo || undefined,
      ktpUrl: form.ktpUrl || undefined,
      ijazahUrl: form.ijazahUrl || undefined,
      pendidikan: form.pendidikan,
      kawin: form.kawin,
      jk: form.jk,
    };
    try {
    if (editingId) {
      await update("employees", editingId, empPatch);
      log("memperbarui data karyawan", editingId, "SDM");
      toast(S.tEmpUpdate.replace("{n}", editingId));
    } else {
      const created = await add(
        "employees",
        {
          username: nik,
          name,
          role,
          dept: form.dept,
          branch: form.branch,
          status: form.status,
          join: form.join,
          tipe: form.tipe,
          basic,
          allowances,
          contractEnd: form.contractEnd || "",
          ptkpStatus: form.ptkpStatus,
          dependents,
          skills: defaultSkills(form.dept, role),
          certs: [],
        },
        { action: "mendaftarkan karyawan", module: "SDM" },
      );
      toast(S.tEmpAdd.replace("{n}", created.id));
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyEmpForm());
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ---------- cuti ---------- */
  const leaveDays = calcDays(leaveForm.from, leaveForm.to);

  const saveLeave = async () => {
    if (!leaveForm.employeeId) {
      toast(S.tPilihKaryawan, "info");
      return;
    }
    if (leaveDays <= 0) {
      toast(S.tCutiRange, "info");
      return;
    }
    if (leaveForm.type === "Tahunan" && saldoCuti(leaveForm.employeeId) < leaveDays) {
      toast(S.tSaldoKurang, "info");
      return;
    }
    const overlap = data.leaves.some(
      (l) =>
        String(l.employeeId) === leaveForm.employeeId &&
        String(l.status) !== "Ditolak" &&
        String(l.from) <= leaveForm.to &&
        leaveForm.from <= String(l.to),
    );
    if (overlap) {
      toast(S.tOverlap, "info");
      return;
    }
    if (!leaveForm.note.trim() && (leaveForm.type === "Sakit" || leaveForm.type === "Unpaid")) {
      toast(S.tKetSakit, "info");
      return;
    }
    try {
    const created = await add(
      "leaves",
      {
        employeeId: leaveForm.employeeId,
        type: leaveForm.type,
        from: leaveForm.from,
        to: leaveForm.to,
        days: leaveDays,
        status: "Diajukan",
        note: leaveForm.note.trim(),
        ...(leaveForm.fileUrl.trim() ? { fileUrl: leaveForm.fileUrl.trim() } : {}),
      },
      { action: "mengajukan cuti", module: "SDM" },
    );
    toast(S.tLeaveOk.replace("{n}", created.id).replace("{a}", String(leaveDays)));
    setShowLeave(false);
    setLeaveForm({ employeeId: "", type: "Tahunan", from: todayISO(), to: todayISO(), note: "", fileUrl: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // Cuti 2 tingkat: Diajukan → Disetujui Atasan → Disetujui (final HRD).
  // Ubah cuti HANYA bila status Diajukan (guard di tombol).
  const openLeaveEdit = (l: StoreItem) => {
    setLeaveEditId(String(l.id));
    setLeaveForm({
      employeeId: String(l.employeeId ?? ""),
      type: String(l.type ?? "Tahunan"),
      from: String(l.from ?? todayISO()),
      to: String(l.to ?? todayISO()),
      note: String(l.note ?? ""),
      fileUrl: String(l.fileUrl ?? ""),
    });
    setShowLeave(true);
  };

  /**
   * Ubah cuti yang sudah DISETUJUI.
   *
   * Keberadaan jalur ini penting: tanpa itu, satu kesalahan admin (tanggal
   * salah, alasan keliru) pada cuti yang sudah final tidak bisa diperbaiki -
   * tombol Edit sengaja disembunyikan untuk status final karena biasanya cuti
   * yang sudah disetujui tidak boleh diubah.
   *
   * Yang dikunci di jalur ini: karyawan, periode, dan tipe - semuanya sudah
   * memengaruhi rekap absensi yang tersinkron otomatis saat persetujuan. Yang
   * boleh diubah: catatan dan lampiran, supaya data administratif tetap bisa
   * dikoreksi tanpa merusak rekap absensi.
   */
  const openLeaveEditFinal = (l: StoreItem) => {
    setLeaveFinalEdit(true);
    setLeaveEditId(String(l.id));
    setLeaveForm({
      employeeId: String(l.employeeId ?? ""),
      type: String(l.type ?? "Tahunan"),
      from: String(l.from ?? todayISO()),
      to: String(l.to ?? todayISO()),
      note: String(l.note ?? ""),
      fileUrl: String(l.fileUrl ?? ""),
    });
    setShowLeave(true);
  };

  const closeLeaveModal = () => {
    setShowLeave(false);
    setLeaveEditId(null);
    setLeaveFinalEdit(false);
    setLeaveForm({ employeeId: "", type: "Tahunan", from: todayISO(), to: todayISO(), note: "", fileUrl: "" });
  };

  const updateLeave = async () => {
    if (!leaveEditId) return;
    if (!leaveForm.employeeId) { toast(S.tPilihKaryawan, "info"); return; }
    if (leaveDays <= 0) { toast(S.tCutiRange, "info"); return; }
    if (leaveForm.type === "Tahunan" && saldoCuti(leaveForm.employeeId) < leaveDays) {
      toast(S.tSaldoKurang, "info");
      return;
    }
    const overlap = data.leaves.some(
      (l) =>
        String(l.id) !== leaveEditId &&
        String(l.employeeId) === leaveForm.employeeId &&
        String(l.status) !== "Ditolak" &&
        String(l.from) <= leaveForm.to &&
        leaveForm.from <= String(l.to),
    );
    if (overlap) { toast(S.tOverlap, "info"); return; }
    if (!leaveForm.note.trim() && (leaveForm.type === "Sakit" || leaveForm.type === "Unpaid")) {
      toast(S.tKetSakit, "info");
      return;
    }
    /* Cuti yang sudah disetujui: hanya catatan + lampiran yang boleh diubah. */
    if (leaveFinalEdit) {
      try {
        await update("leaves", leaveEditId, {
          note: leaveForm.note.trim(),
          fileUrl: leaveForm.fileUrl.trim(),
        });
        log("mengoreksi cuti disetujui", `${leaveEditId} - ${empNameOf(leaveForm.employeeId)}`, "SDM");
        toast(locale === "en" ? "Approved leave corrected" : "Cuti disetujui dikoreksi");
        closeLeaveModal();
      } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
      return;
    }
    try {
      await update("leaves", leaveEditId, {
        employeeId: leaveForm.employeeId,
        type: leaveForm.type,
        from: leaveForm.from,
        to: leaveForm.to,
        days: leaveDays,
        note: leaveForm.note.trim(),
        fileUrl: leaveForm.fileUrl.trim(),
      });
      log("mengubah cuti", `${leaveEditId} · ${leaveDays} hari`, "SDM");
      toast(S.tLeaveOk.replace("{n}", leaveEditId).replace("{a}", String(leaveDays)));
      closeLeaveModal();
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };
  const approveSupervisor = async (l: StoreItem) => {
    try {
    await update("leaves", l.id, { status: "Disetujui Atasan", supervisorApprovedBy: user?.name ?? "Atasan", supervisorApprovedAt: todayISO() });
    log("menyetujui cuti (atasan)", `${l.id} - ${empNameOf(l.employeeId)}`, "SDM");
    toast(S.tLeaveSup.replace("{n}", l.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const approveHrd = async (l: StoreItem) => {
    try {
    /* Nama & tanggal persetuJUAN disimpan di baris yang sama, bukan
       diasumsikan. Surat persetujuan cuti ditandatangani atas nama orang
       tertentu; tanpa dua field ini, PDF-nya selalu mencantumkan direksi
       walau yang menyetujui HRD. */
    await update("leaves", l.id, { status: "Disetujui", approvedBy: user?.name ?? "HRD", approvedAt: todayISO() });
    log("menyetujui cuti final (HRD)", `${l.id} - ${empNameOf(l.employeeId)}`, "SDM");
    /* Cuti final otomatis sinkron ke absensi: buat baris baru (status Cuti/
       Sakit/Izin) per tanggal bila belum ada, atau perbarui baris yang sudah
       ada agar rekap kehadiran sinkron. */
    try {
      const empId = String(l.employeeId ?? "");
      const emp = data.employees.find((e) => e.id === empId);
      const attStatus = leaveToAttStatus(String(l.type ?? ""));
      let synced = 0;
      for (const d of datesBetween(String(l.from ?? ""), String(l.to ?? ""))) {
        const existing = data.attendance.filter((a) => String(a.employeeId) === empId && String(a.date) === d);
        if (existing.length === 0) {
          await add(
            "attendance",
            {
              employeeId: empId,
              date: d,
              shift: "Pagi",
              status: attStatus,
              checkIn: "",
              checkOut: "",
              overtime: 0,
              otStatus: "",
              branch: String(emp?.branch ?? ""),
            },
            undefined,
          );
          synced += 1;
        } else {
          for (const a of existing) {
            await update("attendance", a.id, { status: attStatus, checkIn: "", checkOut: "", overtime: 0, otStatus: "" });
            synced += 1;
          }
        }
      }
      if (synced > 0) log("sinkron cuti ke absensi", `${l.id} → ${synced} baris ${attStatus}`, "SDM");
    } catch {
      /* sinkron best-effort - status cuti sudah tersimpan */
    }
    /* H1c: surat persetujuan cuti otomatis saat approve HRD.
       Preview di modal (tanpa paksa download); Unduh tetap tersedia.
       Archive letters idempoten via sourceType+sourceId. */
    try {
      const already = (data.letters ?? []).some(
        (r) => String(r.sourceType ?? "") === "cuti" && String(r.sourceId ?? "") === String(l.id),
      );
      if (!already) {
        await add("letters", {
          employeeId: String(l.employeeId ?? ""),
          nama: empNameOf(String(l.employeeId ?? "")),
          jenis: "Persetujuan Cuti",
          tanggal: todayISO(),
          isi: `${String(l.type ?? "Cuti")} · ${String(l.from ?? "")} → ${String(l.to ?? "")} · ${String(l.days ?? "")} hari`,
          sourceType: "cuti",
          sourceId: String(l.id),
          approvedBy: user?.name ?? "HRD",
          approvedAt: todayISO(),
          status: "Terbit",
        }, { action: "surat persetujuan cuti terbit otomatis", target: String(l.id), module: "SDM" });
      }
      /* Preview modal tanpa paksa download (open=false), tombol Unduh di modal. */
      if (pdfServerReady()) {
        void pdfDoc.request({ kind: "suratCuti", id: String(l.id), locale }, `Surat-Cuti-${String(l.id)}.pdf`, false);
      }
      setCutiPreviewId(String(l.id));
    } catch {
      /* best-effort: approval sudah tersimpan */
    }
    toast(S.tLeaveHrd.replace("{n}", l.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const empNameOf = (id: string) => data.employees.find((e) => e.id === id)?.name ?? id;

  /* ---------- mutasi ---------- */
  const saveMutasi = async () => {
    const emp = data.employees.find((e) => e.id === mutasiForm.employeeId);
    if (!emp) {
      toast(S.tPilihKaryawan, "info");
      return;
    }
    if (!mutasiForm.role.trim()) {
      toast(S.tJabatanBaru, "info");
      return;
    }
    if (!mutasiForm.date) {
      toast(S.tTglMutasi, "info");
      return;
    }
    if (!mutasiForm.reason.trim()) {
      toast(S.tAlasanMutasi, "info");
      return;
    }
    if (!DEPT_OPTIONS.includes(mutasiForm.dept)) {
      toast(S.tDeptTujuan, "info");
      return;
    }
    const from = `${emp.dept}/${emp.branch}/${emp.role}`;
    const to = `${mutasiForm.dept}/${mutasiForm.branch}/${mutasiForm.role.trim()}`;
    try {
    await update("employees", emp.id, { dept: mutasiForm.dept, branch: mutasiForm.branch, role: mutasiForm.role.trim() });
    log(`mutasi ${from} → ${to} per ${mutasiForm.date}${mutasiForm.reason.trim() ? ` · ${mutasiForm.reason.trim()}` : ""}`, emp.id, "SDM");
    toast(S.tMutasiOk.replace("{n}", emp.id));
    setShowMutasi(false);
    setMutasiForm({ employeeId: "", dept: "Produksi", branch: "Samarinda", role: "", date: todayISO(), reason: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ---------- training ---------- */
  const toggleParticipant = (id: string) => {
    setTrainingForm((f) => ({
      ...f,
      participants: f.participants.includes(id) ? f.participants.filter((p) => p !== id) : [...f.participants, id],
    }));
  };

  /* ==== TRAINING: form create + edit ==== */
  const closeTrainingModal = () => {
    setShowTraining(false);
    setTrainingEditId(null);
    setTrainingForm({ title: "", date: todayISO(), provider: "", participants: [] });
  };

  const saveTraining = async () => {
    if (!trainingForm.title.trim()) {
      toast(S.tJudulTrain, "info");
      return;
    }
    if (!trainingForm.date) {
      toast(S.tTglTrain, "info");
      return;
    }
    if (trainingForm.participants.length === 0) {
      toast(S.tPesertaMin, "info");
      return;
    }
    try {
    const created = await add(
      "trainings",
      {
        title: trainingForm.title.trim(),
        date: trainingForm.date,
        participants: trainingForm.participants,
        provider: trainingForm.provider.trim() || "-",
        status: "Terjadwal",
      },
      { action: "menjadwalkan training", module: "SDM" },
    );
    toast(S.tTrainOk.replace("{n}", created.id));
    closeTrainingModal();
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

const finishTraining = async (t: StoreItem) => {
    try {
    await update("trainings", t.id, { status: "Selesai" });
    log("menyelesaikan training", `${t.id} - ${t.title}`, "SDM");
    toast(S.tTrainSelesai.replace("{n}", t.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ==== UBAH / HAPUS TRAINING ====
     Tabel training punya tombol Selesaikan & Terapkan saja. Training yang
     salah judul/tanggal/peserta tidak bisa dikoreksi tanpa menghapus dan
     membuat ulang - dan karena sertifikat sudah bisa diterbitkan dari
     training Selesai, menghapus training yang sudah jadi Selesai berarti
     sertifikat yang sudah terbit kehilangan jejaknya. */
  const openTrainingEdit = (t: StoreItem) => {
    setTrainingEditId(String(t.id));
    setTrainingForm({
      title: String(t.title ?? ""),
      date: String(t.date ?? todayISO()),
      provider: String(t.provider ?? ""),
      participants: Array.isArray(t.participants) ? (t.participants as string[]).map(String) : [],
    });
    setShowTraining(true);
  };

  const saveTrainingEdit = async () => {
    if (!trainingEditId) return;
    if (!trainingForm.title.trim()) { toast(S.tJudulTrain, "info"); return; }
    if (!trainingForm.date) { toast(S.tTglTrain, "info"); return; }
    if (trainingForm.participants.length === 0) { toast(S.tPesertaMin, "info"); return; }
    try {
      await update("trainings", trainingEditId, {
        title: trainingForm.title.trim(),
        date: trainingForm.date,
        participants: trainingForm.participants,
        provider: trainingForm.provider.trim() || "-",
      });
      log("mengubah training", `${trainingEditId} - ${trainingForm.title.trim()}`, "SDM");
      toast(S.tTrainOk.replace("{n}", trainingEditId));
      closeTrainingModal();
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelTraining = async () => {
    if (!delTraining) return;
    try {
      await remove("trainings", String(delTraining.id));
      log("menghapus training", `${delTraining.id} - ${delTraining.title ?? ""}`, "SDM");
      toast(
        locale === "en"
          ? `Training ${delTraining.id} deleted`
          : `Training ${delTraining.id} dihapus`,
      );
      setDelTraining(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };


  const applyCert = async () => {
    if (!certTarget) return;
    if (!certForm.name.trim() || !certForm.expires) {
      toast(S.tCertWajib, "info");
      return;
    }
    const ids = (certTarget.participants ?? []) as string[];
    for (const empId of ids) {
      try {
      const emp = data.employees.find((e) => e.id === empId);
      if (!emp) continue;
      const next = [...normCerts(emp), {
        name: certForm.name.trim(),
        expires: certForm.expires,
        ...(certForm.no.trim() ? { no: certForm.no.trim() } : {}),
        ...(certForm.issued ? { issued: certForm.issued } : {}),
        ...(certForm.fileUrl.trim() ? { fileUrl: certForm.fileUrl.trim() } : {}),
      }];
      await update("employees", empId, { certs: next });
      } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
    }
    log("menerapkan sertifikat training", `${certTarget.id} · ${certForm.name.trim()} → ${ids.length} peserta`, "SDM");
    toast(S.tCertOk.replace("{n}", String(ids.length)));
    setCertTarget(null);
    setCertForm({ name: "", expires: todayISO(), no: "", issued: "", fileUrl: "" });
  };

  /* ---------- surat peringatan / mutasi ---------- */
  /* Nomor resmi SRT-YYYYMMDD-NNN: urut per tanggal, anti-tabrakan bila arsip dihapus. */
  const nextSuratId = (tanggal: string): string => {
    const head = `SRT-${tanggal.replace(/-/g, "")}-`;
    let max = 0;
    for (const s of arsipSurat) {
      const m = String(s.id ?? "").match(new RegExp(`^${head}(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    let id = `${head}${String(max + 1).padStart(3, "0")}`;
    let bump = 1;
    while (arsipSurat.some((s) => String(s.id) === id)) {
      bump += 1;
      id = `${head}${String(max + bump).padStart(3, "0")}`;
    }
    return id;
  };

  const suratEmp = data.employees.find((e) => e.id === suratForm.employeeId);
  /** Nomor yang akan dipakai saat disimpan. Dipakai BERSAMA oleh preview dan
   *  saveSurat supaya keduanya tidak pernah berbeda - versi lama memanggil
   *  nextSuratId() di dalam suratPreview sehingga nomor yang tampil saat preview
   *  tidak sama dengan nomor yang benar-benar terbit saat disimpan. */
  const suratNomor = nextSuratId(suratForm.tanggal || todayISO());

  /** Teks surat. SATU fungsi dipakai untuk preview di form, pratinjau arsip,
   *  dan pratinjau teks - sebelumnya teks disusun ulang di tiga tempat
   *  terpisah sehingga prone to drift. */
  const suratText = (row: {
    id?: unknown; jenis?: unknown; tanggal?: unknown; isi?: unknown;
    nama?: unknown; nik?: unknown; role?: unknown; dept?: unknown; branch?: unknown;
    mulai?: unknown; berakhir?: unknown; gaji?: unknown;
  }): string => {
    const jenis = String(row.jenis ?? "");
    const isKontrak = KONTRAK_JENIS.includes(jenis);
    const lines = [
      `SURAT ${jenis.toUpperCase()}`,
      /* T6-SDM8: kop lengkap untuk surat kontrak (bukan sekadar nama PT). */
      SB_KOP.name,
      SB_KOP.line1,
      SB_KOP.hq,
      SB_KOP.addr1,
      "",
      `Nomor: ${String(row.id ?? "-")}`,
      `Tanggal: ${fmtTanggal(String(row.tanggal ?? ""))}`,
      "",
      `Kepada Yth. ${String(row.nama ?? "-")}${row.nik ? ` (${String(row.nik)})` : ""}`,
    ];
    if (row.role || row.dept || row.branch) {
      lines.push(`Jabatan: ${String(row.role ?? "-")} · Departemen: ${String(row.dept ?? "-")} · Cabang: ${String(row.branch ?? "-")}`);
    }
    if (isKontrak) {
      const mulai = String(row.mulai ?? "");
      const berakhir = String(row.berakhir ?? "");
      const gaji = Number(row.gaji || 0);
      lines.push(
        "",
        jenis === "Kontrak Kerja"
          ? "Dengan ini menyatakan bahwa kami menunjuk Saudara/i tersebut di atas sebagai karyawan dengan ketentuan sebagai berikut:"
          : "Dengan ini kami memberitahukan perpanjangan masa kerja Saudara/i tersebut di atas dengan ketentuan sebagai berikut:",
        "",
        `1. Masa kerja : ${mulai ? fmtTanggal(mulai) : "-"} s.d. ${berakhir ? fmtTanggal(berakhir) : "-"}`,
        `2. Jabatan    : ${String(row.role ?? "-")}`,
        `3. Tempat kerja: ${String(row.branch ?? "-")} - PT Syukur Bersaudara`,
        gaji > 0 ? `4. Gaji pokok : ${fmtRupiah(gaji)} / bulan` : "4. Gaji pokok : mengikuti perusahaan",
        "",
        "Demikian surat ini dibuat untuk dipergunakan sebagaimana mestinya.",
        "",
        `Samarinda, ${fmtTanggal(String(row.tanggal ?? ""))}`,
        `Penanggung Jawab,`,
        `H. Syarif Sarapping`,
      );
      return lines.join("\n");
    }
    lines.push("", String(row.isi ?? "").trim() || (locale === "en" ? "(Letter body not written yet)" : "(Isi surat belum ditulis)"));
    return lines.join("\n");
  };

  const suratPreview = suratEmp
    ? suratText({
      id: suratNomor,
      jenis: suratForm.jenis,
      tanggal: suratForm.tanggal,
      isi: suratForm.isi,
      nama: suratEmp.name,
      nik: empNik(suratEmp),
      role: suratEmp.role,
      dept: suratEmp.dept,
      branch: suratEmp.branch,
      /* T6-SDM8: data kontrak dari form/karyawan untuk preview surat kontrak. */
      mulai: suratForm.mulai || String(suratEmp.join ?? ""),
      berakhir: suratForm.berakhir || String(suratEmp.contractEnd ?? ""),
      gaji: suratForm.gaji || String(suratEmp.basic ?? ""),
    })
    : "";

  /** Buka form UBAH surat yang sudah tersimpan. */
  const openSuratEdit = (s: StoreItem) => {
    setSuratEditId(String(s.id));
    setSuratForm({
      employeeId: String(s.employeeId ?? ""),
      jenis: String(s.jenis ?? "SP 1"),
      isi: String(s.isi ?? ""),
      tanggal: String(s.tanggal ?? todayISO()),
      fileUrl: String(s.fileUrl ?? ""),
      approvedBy: String(s.approvedBy ?? ""),
      approvedAt: String(s.approvedAt ?? ""),
      sourceType: String(s.sourceType ?? ""),
      sourceId: String(s.sourceId ?? ""),
      mulai: String(s.mulai ?? ""),
      berakhir: String(s.berakhir ?? ""),
      gaji: String(s.gaji ?? ""),
    });
    setShowSurat(true);
  };

  /* Surat teguran dibuat server dari baris `letters` - isi, tanggal, dan
     nama penyetuju dibaca dari arsip, bukan dari state form yang bisa sudah
     berubah. Surat tanpa isi yang sudah disetujui berarti keputusan yang tidak
     pernah ditandatangani. */
  const printSuratPdf = async (): Promise<void> => {
    if (!suratEmp) { toast(S.tPilihKaryawan, "info"); return; }
    if (!suratForm.isi.trim()) { toast(S.tIsiSurat, "info"); return; }
    if (!pdfServerReady()) { toast(S.tPdfServerBelum, "info"); return; }
    /* Surat yang belum disimpan tidak bisa dicetak: server membaca dari
       arsip, dan isinya harus sama persis dengan yang disimpan. */
    if (!suratEditId) { toast(S.tIsiSurat, "info"); return; }
    const done = await pdfDoc.request({ kind: "suratHr", id: suratEditId, locale }, `surat-${suratEditId}`, false);
    if (done) toast(S.tSuratPdfOk.replace("{n}", suratEditId));
  };

  /* Surat persetujuan cuti: dokumen resmi yang dibawa karyawan. Tidak ada
     mesin lokal untuk ini - dokumen ini lahir bersama rewrite PDF, jadi satu-
     satunya jalur yang benar adalah server yang merakitnya dari baris cuti. */
  const printSuratCuti = async (l: StoreItem): Promise<void> => {
    if (!pdfServerReady()) { toast(S.tPdfServerBelum, "info"); return; }
    const okDone = await pdfDoc.request({ kind: "suratCuti", id: String(l.id), locale }, `Surat-${l.id}`, false);
    if (okDone) toast(S.tSuratPdfOk.replace("{n}", `SPC/${String(l.id)}`));
  };

  const saveSurat = async () => {
    if (!suratEmp) {
      toast(S.tPilihKaryawan, "info");
      return;
    }
    if (!suratForm.isi.trim()) {
      toast(S.tIsiSurat, "info");
      return;
    }
    if (!suratForm.tanggal) {
      toast(S.tTglSurat, "info");
      return;
    }
    const url = suratForm.fileUrl.trim();
    /* Field persetujuan. Ditambahkan karena SP1/SP2/SP3 tanpa nama dan
       tanggal persetujuan tidak sah, dan arsip surat tidak bisa dibuka
       ulang untuk membuktikan siapa yang menyetujuinya. Disimpan di record
       yang sama supaya travels bersama suratnya, bukan di tempat lain. */
    const patch = {
      employeeId: suratEmp.id,
      nama: String(suratEmp.name),
      jenis: suratForm.jenis,
      tanggal: suratForm.tanggal,
      isi: suratForm.isi.trim(),
      fileUrl: url,
      fileName: url !== "" ? `surat-${suratEditId ?? suratNomor}.pdf` : "",
      approvedBy: suratForm.approvedBy.trim(),
      approvedAt: suratForm.approvedAt,
      /* Asal dokumen, supaya surat yang lahir dari(hasil cuti yang
         belum disetujui, atau mutasi) bisa ditelusuri balik ke
         baris asalnya tanpa menebak dari isi teks. */
      sourceType: suratForm.sourceType,
      sourceId: suratForm.sourceId,
      branch: String(suratEmp.branch ?? branch),
      /* T6-SDM8: data kontrak ikut tersimpan di record surat. */
      ...(KONTRAK_JENIS.includes(suratForm.jenis)
        ? { mulai: suratForm.mulai, berakhir: suratForm.berakhir, gaji: Number(suratForm.gaji || 0) }
        : {}),
    };
    try {
      if (suratEditId) {
        /* Ubah: id & nomor TIDAK berubah. Surat sudah terbit dengan nomor
           resmi; mengacaknya sendiri membuat arsip dan rujukan (BAST,
           kontrak) tidak cocok. */
        await update("letters", suratEditId, patch);
        log("mengubah surat", `${suratEditId} · ${patch.jenis} → ${patch.nama}`, "SDM");
        toast(locale === "en" ? `Letter ${suratEditId} updated` : `Surat ${suratEditId} diperbarui`);
        setSuratEditId(null);
      } else {
        await add(
          "letters",
          { id: suratNomor, ...patch, createdBy: "Anda", createdAt: `${todayISO()} ${new Date().toTimeString().slice(0, 5)}` },
          { action: "membuat surat", target: `${suratNomor} · ${patch.jenis} → ${patch.nama}`, module: "SDM" },
        );
        toast(S.tSuratOk.replace("{n}", suratNomor));
      }
      setShowSurat(false);
      setSuratForm({ employeeId: "", jenis: "SP 1", isi: "", tanggal: todayISO(), fileUrl: "", approvedBy: "", approvedAt: "", sourceType: "", sourceId: "", mulai: "", berakhir: "", gaji: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const exportArsipSurat = () => {
    if (arsipSurat.length === 0) {
      toast(S.tArsipKosong, "info");
      return;
    }
    /* Kolom fileUrl ikut diekspor - versi lama membuangnya, sehingga arsip
       Excel tidak bisa ditelusuri balik ke dokumennya. */
    const head = ["ID", "Karyawan", "Jenis", "Tanggal", "Isi", "Lampiran"];
    const body = arsipSurat.map((s) => [s.id, s.nama, s.jenis, fmtTanggal(String(s.tanggal)), s.isi, s.fileUrl ?? ""]);
    void exportExcel([head, ...body], "arsip-surat-sdm", "Arsip Surat");
    toast(S.tArsipUnduh);
  };

  /* ---------- impor massal via CSV ---------- */
  const downloadTemplate = () => {
    void exportExcel([IMPORT_HEADERS], "template-impor-karyawan", "Template");
    toast(S.tTemplate);
  };

  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const rows = parseCSV(String(reader.result ?? ""));
        if (rows.length < 2) {
          toast(S.tFileKosong, "info");
          return;
        }
        const gagal: string[] = [];
        const seenNik = new Set(data.employees.map((e) => empNik(e).toLowerCase()));
        const seenName = new Set(data.employees.map((e) => String(e.name).toLowerCase()));
        let ok = 0;
        for (const [idx, cells] of rows.slice(1).entries()) {
        const line = idx + 2;
        const [nikRaw, nama, jabatan, deptRaw, branchRaw, statusRaw, joinRaw, tipeRaw, basicRaw, ptkpRaw, tangRaw, kontrakRaw] = [
          ...cells,
          ...Array(Math.max(0, 12 - cells.length)).fill(""),
        ];
        const nik = String(nikRaw ?? "").trim();
        const name = String(nama ?? "").trim();
        const role = String(jabatan ?? "").trim();
        if (!nik || !name || !role) {
          gagal.push(S.rowWajib.replace("{n}", String(line)));
          continue;
        }
        /* Validasi SAMA dengan form: NIK 16 digit angka. */
        if (!/^\d{16}$/.test(nik)) {
          gagal.push(`Baris ${line}: NIK harus 16 digit angka`);
          continue;
        }
        /* Duplikat nama ATAU NIK (form menolak keduanya), termasuk dalam file. */
        if (seenNik.has(nik.toLowerCase()) || seenName.has(name.toLowerCase())) {
          gagal.push(S.rowDupe.replace("{n}", String(line)).replace("{a}", `${nik} / ${name}`));
          continue;
        }
        /* Departemen & cabang harus masuk whitelist (seperti form). */
        const deptV = String(deptRaw || "Produksi").trim() || "Produksi";
        if (!DEPT_OPTIONS.includes(deptV)) {
          gagal.push(`Baris ${line}: departemen "${deptV}" tidak dikenal (${DEPT_OPTIONS.join(", ")})`);
          continue;
        }
        const branchV = String(branchRaw || "Samarinda").trim() || "Samarinda";
        if (!branchCities.includes(branchV)) {
          gagal.push(`Baris ${line}: cabang "${branchV}" tidak dikenal (${branchCities.join(", ")})`);
          continue;
        }
        const joinV = String(joinRaw ?? "").trim();
        if (!joinV || Number.isNaN(new Date(`${joinV}T00:00:00`).getTime())) {
          gagal.push(S.rowJoin.replace("{n}", String(line)));
          continue;
        }
        /* Tanggal gabung tidak boleh future (seperti form). */
        if (joinV > todayISO()) {
          gagal.push(`Baris ${line}: tanggal gabung tidak boleh di masa depan`);
          continue;
        }
        /* Tipe karyawan whitelist + kontrak wajib untuk Kontrak/Outsourcing. */
        const tipeV = String(tipeRaw || "Tetap").trim() || "Tetap";
        if (!TIPE_KARYAWAN.includes(tipeV)) {
          gagal.push(`Baris ${line}: tipe "${tipeV}" tidak dikenal (${TIPE_KARYAWAN.join(", ")})`);
          continue;
        }
        const kontrakV = String(kontrakRaw ?? "").trim();
        if ((tipeV === "Kontrak" || tipeV === "Outsourcing") && !kontrakV) {
          gagal.push(`Baris ${line}: kontrak berakhir wajib untuk tipe ${tipeV}`);
          continue;
        }
        if (kontrakV && kontrakV < joinV) {
          gagal.push(`Baris ${line}: kontrak berakhir tidak boleh sebelum tanggal gabung`);
          continue;
        }
        const basic = Number(basicRaw || 0);
        if (Number.isNaN(basic) || basic < 0) {
          gagal.push(S.rowBasic.replace("{n}", String(line)));
          continue;
        }
        const tang = Math.min(3, Math.max(0, Number(tangRaw || 0)));
        if (Number.isNaN(tang)) {
          gagal.push(S.rowTang.replace("{n}", String(line)));
          continue;
        }
        const ptkp = String(ptkpRaw || "TK/0").trim();
        if (!PTKP_STATUS.includes(ptkp)) {
          gagal.push(S.rowPtkp.replace("{n}", String(line)).replace("{a}", PTKP_STATUS.join(", ")));
          continue;
        }
        seenNik.add(nik.toLowerCase());
        seenName.add(name.toLowerCase());
        try {
          await add(
            "employees",
            {
              username: nik,
              name,
              role,
              dept: deptV,
              branch: branchV,
              status: String(statusRaw || "Aktif").trim() || "Aktif",
              join: joinV,
              tipe: tipeV,
              basic,
              allowances: 0,
              contractEnd: kontrakV,
              ptkpStatus: ptkp,
              dependents: tang,
              skills: defaultSkills(deptV, role),
              certs: [],
            },
            undefined,
          );
          ok += 1;
        } catch (e) {
          gagal.push(S.rowFail.replace("{n}", String(line)).replace("{a}", e instanceof Error ? e.message : "gagal disimpan"));
        }
        }
        setImportReport({ ok, gagal });
        log("impor karyawan", `${ok} berhasil · ${gagal.length} gagal`, "SDM");
        toast(S.tImporOk.replace("{a}", String(ok)).replace("{b}", String(gagal.length)));
      })();
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <PageHeader
        title={S.hrTitle}
        subtitle={S.hrSub}
        icon={<Users className="h-5 w-5" />}
        actions={
          tab === "Karyawan" ? (
            <button className="btn-primary-gradient" onClick={openAdd}>
              <Plus className="h-4 w-4" /> {S.btnTambahKaryawan}
            </button>
          ) : tab === "Cuti & Izin" ? (
            <button className="btn-primary-gradient" onClick={() => { setLeaveEditId(null); setLeaveForm({ employeeId: "", type: "Tahunan", from: todayISO(), to: todayISO(), note: "", fileUrl: "" }); setShowLeave(true); }}>
              <Plus className="h-4 w-4" /> {S.btnAjukanCuti}
            </button>
          ) : tab === "Mutasi" ? (
            <button className="btn-primary-gradient" onClick={() => setShowMutasi(true)}>
              <Plus className="h-4 w-4" /> {S.btnCatatMutasi}
            </button>
          ) : tab === "Training" ? (
            <button className="btn-primary-gradient" onClick={() => setShowTraining(true)}>
              <Plus className="h-4 w-4" /> {S.btnJadwalkanTraining}
            </button>
          ) : (
            <button className="btn-primary-gradient" onClick={() => setShowSurat(true)}>
              <Plus className="h-4 w-4" /> {S.btnBuatSurat}
            </button>
          )
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} dismiss={modAlert.dismiss} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiTotal} value={String(data.employees.length)} icon={<Users className="h-5 w-5" />} chip="navy" spark={employeeTrend.map((d) => ({ name: d.month, v: d.count }))} hint={S.hintSesi} />
        <KpiCard label={S.kpiCertExpire} value={String(expiring.length)} delta={S.deltaCert.replace("{n}", String(CERT_WINDOW))} deltaDirection="down" icon={<Award className="h-5 w-5" />} chip="rose" spark={certExpireTrend} />
        <KpiCard label={S.kpiAktif} value={String(activeCount)} delta={S.deltaAktif.replace("{n}", String(data.employees.length))} deltaDirection="up" icon={<BadgeCheck className="h-5 w-5" />} chip="teal" spark={activeEmployeeTrend} />
        <KpiCard label={S.kpiBersertifikat} value={`${String(certifiedPct)}%`} icon={<BadgeCheck className="h-5 w-5" />} chip="violet" hint={S.hintCert} spark={certifiedTrend} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label={S.kpiTurnover} value={`${turnoverPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} hint={S.hintTurnover.replace("{a}", String(nonaktifCount)).replace("{b}", String(data.employees.length))} chip="rose" />
        <KpiCard label={S.kpiTenure} value={S.thnN.replace("{n}", avgTenure.toLocaleString("id-ID", { maximumFractionDigits: 1 }))} hint={S.hintTenure} chip="navy" />
      </div>

      <div className="mt-4 card">
        {/* T6-SDM7: tab Mutasi & Org Chart dihapus dari UI (notes2).
            Data tetap di store bila nanti dipakai lagi. */}
        <Tabs tabs={["Karyawan", "Cuti & Izin", "Training", "Surat & Impor"]} active={tab} onChange={setTab} labels={{ Karyawan: S.tabKaryawan, "Cuti & Izin": S.tabCuti, Training: S.tabTraining, "Surat & Impor": S.tabSurat }} />
        <div className="p-4">
          {tab === "Karyawan" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchBox
                  value={q}
                  onChange={setQ}
                  placeholder={S.searchHrPh}
                  ariaLabel={S.searchHrAria}
                  className="min-w-52 flex-1 sm:max-w-xs"
                />
                <FilterPopover
                  activeCount={[dept !== "Semua", branch !== "SEMUA", contractSoonOnly].filter(Boolean).length}
                  initial={{ dept, branch, kontrak: contractSoonOnly ? "1" : "0" }}
                  onReset={() => { setQ(""); setDept("Semua"); setBranch("SEMUA"); setContractSoonOnly(false); }}
                  onApply={(d) => { setDept(d.dept); setBranch(d.branch); setContractSoonOnly(d.kontrak === "1"); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.fDept}>
                        <select className="input w-full" value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })} aria-label={S.ariaFilterDept}>
                          {deptOptions.map((d) => (
                            <option key={d} value={d}>{d === "Semua" ? "Semua Dept" : d}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={S.fCabang}>
                        <select className="input w-full" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} aria-label={S.ariaFilterCabang}>
                          <option value="SEMUA">Semua Cabang</option>
                          {branchCities.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-steel-600">
                        <input type="checkbox" checked={draft.kontrak === "1"} onChange={(e) => setDraft({ ...draft, kontrak: e.target.checked ? "1" : "0" })} />
                        {S.chkKontrak}
                      </label>
                    </div>
                  )}
                </FilterPopover>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <div className="overflow-x-auto p-2">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr>
                          <SortTh label={S.thKaryawan} sortKey="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.thNik} sortKey="nik" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.thJabatan} sortKey="role" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.fCabang} sortKey="branch" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.thKontrak} sortKey="contract" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.thSaldo} sortKey="saldo" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.dlStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          {/* T6-SDM4: kolom "Dibuat" dihapus; hanya "Terakhir diupdate". */}
                          <SortTh label={locale === "en" ? "Last updated" : "Terakhir diupdate"} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <th className="th">{S.thAksi}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {empPager.slice(sortedEmps).map((e) => (
                          <tr key={e.id} className="hover:bg-surface">
                            <td className="td">
                              <div className="flex items-center gap-2.5">
                                <SecureImg src={e.photo} alt={String(e.name)} name={String(e.name)} className="h-8 w-8 shrink-0 rounded-full object-cover text-[10px]" />
                                <div className="min-w-0">
                                  <p className="font-medium text-navy-900">{e.name}</p>
                                  <p className="text-xs text-steel-500 font-mono">{e.id} · {e.dept}</p>
                                </div>
                              </div>
                            </td>
                            <td className="td font-mono text-steel-600" title="NIK = username login karyawan">{empNik(e)}</td>
                            <td className="td text-steel-600 max-w-[160px] truncate" title={String(e.role)}>{e.role}</td>
                            <td className="td"><Badge tone="gray">{e.branch ?? "-"}</Badge></td>
                            <td className="td">
                              {e.contractEnd ? (
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-steel-600">{fmtTanggal(String(e.contractEnd))}</span>
                                  {(() => {
                                    const cd = contractDays(e);
                                    if (cd === null) return null;
                                    if (cd < 0) return <Badge tone="red">Lewat</Badge>;
                                    if (cd <= 30) return <Badge tone="amber">H-{cd}</Badge>;
                                    return null;
                                  })()}
                                </div>
                              ) : (
                                <span className="text-xs text-steel-400">-</span>
                              )}
                            </td>
                            <td className="td font-semibold text-navy-900">{S.daysN.replace("{n}", String(saldoCuti(e.id)))}</td>
                            <td className="td"><StatusBadge status={String(e.status)} /></td>
                            <td className="td text-xs text-steel-600">{lastTouchedAt(e) !== null ? fmtTanggal(lastTouchedAt(e)) : <span className="text-steel-400">-</span>}</td>
                            <td className="td">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <Link to={`/sdm/karyawan/${e.id}`} className="relative inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-ocean-600 transition-colors hover:bg-steel-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400 focus-visible:ring-offset-1 after:absolute after:-inset-1.5 after:content-['']" title={S.btnDetail} aria-label={`${S.btnDetail} ${String(e.name ?? e.id)}`}><Eye className="h-4 w-4" aria-hidden="true" /></Link>
                                <RowAction icon={Pencil} tone="neutral" label={S.btnEdit} ariaLabel={`${S.btnEdit} ${String(e.name ?? e.id)}`} onClick={() => openEdit(e)} />
                                <RowAction icon={Trash2} tone="danger" label={S.btnHapus} ariaLabel={`${S.btnHapus} ${String(e.name ?? e.id)}`} onClick={() => setDelEmp(e)} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {list.length === 0 && <EmptyState title={S.emptyEmpT} subtitle={S.emptyEmpS} />}
                    {empPager.bar}
                  </div>
                </Card>

                <div className="space-y-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-navy-700" />
                      <h3 className="text-sm font-semibold text-navy-900">{S.komposisi}</h3>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <Donut data={deptCounts.map(({ name, value }) => ({ name, value }))} colors={deptCounts.map((d) => d.color)} size={140} thickness={20} centerValue={String(scopedEmployees.length)} centerLabel={S.centerKaryawan} />
                      <div className="flex-1 space-y-1.5">
                        {deptCounts.map((d) => (
                          <div key={d.name} className="flex items-center gap-2 text-sm">
                            <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                            <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
                            <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                  <Card className="p-5">
                    <h3 className="mb-3 text-sm font-semibold text-navy-900">{S.skillMatrix}</h3>
                    <div className="space-y-3">
                      {topSkills.map((s) => (
                        <div key={s.name}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="truncate text-steel-600" title={s.name}>{s.name}</span>
                            <span className="font-semibold text-navy-900">{S.orangN.replace("{n}", String(s.count))}</span>
                          </div>
                          <ProgressBar value={data.employees.length > 0 ? (s.count / data.employees.length) * 100 : 0} tone="ocean" />
                        </div>
                      ))}
                      {topSkills.length === 0 && <p className="text-xs text-steel-400">{S.emptySkill}</p>}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {tab === "Cuti & Izin" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr>
                    <SortTh label={S.thId} sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={S.thKaryawan} sortKey="emp" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={S.thTipe} sortKey="type" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={S.thPeriode} sortKey="period" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={S.thHari} sortKey="days" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={S.thSaldoSisa} sortKey="saldo" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={S.dlStatus} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label={locale === "en" ? "Attachment" : "Lampiran"} sortKey="lampiran" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <th className="th">{S.thAksi}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(data.leaves, sort2, (row, k) => {
                    const l = row as StoreItem;
                    switch (k) {
                      case "id": return String(l.id ?? "");
                      case "emp": return String(empNameOf(String(l.employeeId ?? "")));
                      case "type": return String(l.type ?? "");
                      case "period": return String(l.from ?? "");
                      case "days": return Number(l.days ?? 0);
                      case "saldo": return String(l.type) === "Tahunan" ? Number(saldoCuti(String(l.employeeId ?? ""))) : Number(-1);
                      case "status": return String(l.status ?? "");
                      case "lampiran": return String(l.fileUrl ?? "");
                      default: return "";
                    }
                  }).map((l) => (
                    <tr key={l.id} id={notifRowId(String(l.id))} className={rowHighlightClass({ id: String(l.id), flash, notified: notified.has(String(l.id)), base: "hover:bg-surface" })}>
                      <td className="td font-mono text-steel-600">{l.id}</td>
                      <td className="td text-navy-900">{empNameOf(String(l.employeeId))}</td>
                      <td className="td"><Badge tone="gray">{l.type}</Badge></td>
                      <td className="td text-steel-600">{fmtTanggal(l.from)} → {fmtTanggal(l.to)}</td>
                      <td className="td font-semibold">{S.daysN.replace("{n}", String(l.days))}</td>
                      <td className="td text-steel-600">{l.type === "Tahunan" ? S.daysN.replace("{n}", String(saldoCuti(String(l.employeeId)))) : "-"}</td>
                      <td className="td"><StatusBadge status={String(l.status)} /></td>
                      <td className="td">
                        {/* Lampiran terbuka sejak pengajuan DIAJUKAN, bukan
                            hanya setelah Disetujui. Dengan kunci lama, HR
                            yang sedang menilai cuti tidak bisa melihat surat
                            dokter/bukti sakit tanpa harus ask atasan -
                            justru di saat paling butuh melihatnya. Yang
                            masih terkunci adalah pengajuan yang DITOLAK:
                            tidak ada yang perlu ditinjau lagi. Ini gate
                            status, bukan gate hak akses - siapa yang boleh
                            membuka modul HR tetap urusan peran. */}

                        {(() => {
                          const url = String(l.fileUrl ?? "");
                          const rejected = String(l.status ?? "") === "Ditolak";
                          if (url === "") {
                            return <span className="text-xs text-steel-400">-</span>;
                          }
                          if (rejected) {
                            return (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-steel-400"
                                title={locale === "en"
                                  ? "Attachment is closed because the request was rejected."
                                  : "Lampiran ditutup karena pengajuan ditolak."}
                              >
                                <Lock className="h-3 w-3" />
                                {locale === "en" ? "Closed" : "Tertutup"}
                              </span>
                            );
                          }
                          return (
                            <DocumentPreviewCell
                              doc={{
                                title: `${empNameOf(String(l.employeeId))} · ${String(l.type)} · ${String(l.id)}`,
                                subtitle: `${fmtTanggal(String(l.from))} → ${fmtTanggal(String(l.to))} · ${String(l.note ?? "")}`,
                                fileUrl: url,
                                fileName: `lampiran-${String(l.id)}`,
                              }}
                            />
                          );
                        })()}
                      </td>
                      <td className="td">
                        {l.status === "Diajukan" ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => approveSupervisor(l)}>{S.btnSetujuiAtasan}</button>
                            {/* T6-SDM6: QR pengajuan - dipindai HR untuk verifikasi mandiri karyawan. */}
                            <span className="inline-block" title={`CUTI:${String(l.id)}:${String(l.employeeId ?? "")}`}>
                              <QRCodeSVG value={`CUTI:${String(l.id)}:${String(data.employees.find((e) => e.id === l.employeeId)?.username ?? l.employeeId ?? "")}`} size={40} level="L" />
                            </span>
                            <RowAction icon={Pencil} tone="neutral" label={S.btnEdit} ariaLabel={`${S.btnEdit} ${String(l.id)}`} onClick={() => openLeaveEdit(l)} />
                            <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setRejectTarget(l)}>{S.btnTolak}</button>
                            <RowAction icon={Trash2} tone="danger" label={S.btnHapus} ariaLabel={`${S.btnHapus} ${String(l.id)}`} onClick={() => setDelLeave(l)} />
                          </div>
                        ) : l.status === "Disetujui Atasan" ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => approveHrd(l)}>{S.btnSetujuiHrd}</button>
                            <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setRejectTarget(l)}>{S.btnTolak}</button>
                          </div>
                        ) : String(l.status ?? "") === "Disetujui" ? (
                          /* Edit/Hapus tetap ada setelah disetujui supaya data
                             yang salah tidak terkunci permanen._edit ini
                             membuka jalur koreksi: periode terkunci, catatan
                             dan lampiran bebas. */
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {/* Surat persetujuan hanya sah setelah pengajuan
                                disetujui - dicetak lebih awal hanya menghasilkan
                                kertas tanpa dasar. */}
                            <RowAction
                              icon={Printer}
                              tone="neutral"
                              label={locale === "en" ? "Print the approval letter issued to the employee" : "Cetak surat persetujuan untuk karyawan"}
                              ariaLabel={`${locale === "en" ? "Approval letter" : "Surat persetujuan"} ${String(l.id)}`}
                              onClick={() => void printSuratCuti(l)}
                            />
                            <RowAction
                              icon={Pencil}
                              tone="neutral"
                              label={locale === "en" ? "Correct note / attachment (period is locked)" : "Koreksi catatan / lampiran (periode terkunci)"}
                              ariaLabel={`${S.btnEdit} ${String(l.id)}`}
                              onClick={() => openLeaveEditFinal(l)}
                            />
                            <RowAction icon={Trash2} tone="danger" label={S.btnHapus} ariaLabel={`${S.btnHapus} ${String(l.id)}`} onClick={() => setDelLeave(l)} />
                          </div>
                        ) : (
                          <span className="text-xs text-steel-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.leaves.length === 0 && <EmptyState title={S.emptyCutiT} subtitle={S.emptyCutiS} />}
            </div>
          )}

          {tab === "Mutasi" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">{S.mutasiTerakhir}</h3>
                <SearchBox
                  value={mutQ}
                  onChange={setMutQ}
                  placeholder={S.cardSearchPh}
                  ariaLabel={S.cardSearchPh}
                  className="mt-3 w-full"
                />
                <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-1">
                  {mutasiLog.filter((a) => rowMatches(a, mutQ, ["action", "target", "time"])).map((a) => (
                    <div key={a.id} className="rounded-lg bg-surface p-2.5 text-sm">
                      <p className="font-medium text-navy-900">{a.action}</p>
                      <p className="text-xs text-steel-500">{a.target} · {a.time}</p>
                    </div>
                  ))}
                  {mutasiLog.length === 0 && <p className="text-xs text-steel-400">{S.emptyMutasi}</p>}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">{S.perCabang}</h3>
                <div className="mt-3 space-y-2">
                  {branchCities.map((c) => (
                    <div key={c} className="flex items-center justify-between text-sm">
                      <span className="text-steel-600">{c}</span>
                      <span className="font-semibold text-navy-900">{S.orangN.replace("{n}", String(data.employees.filter((e) => e.branch === c).length))}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-secondary mt-4 text-xs" onClick={() => setShowMutasi(true)}>{S.btnMutasiBaru}</button>
              </Card>
            </div>
          )}

          {tab === "Org Chart" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orgGroups.map(([deptName, members]) => {
                const head = members.find((m) => /manager/i.test(String(m.role))) ?? members[0];
                const rest = members.filter((m) => m.id !== head?.id);
                return (
                  <Card key={deptName} className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-navy-900">{deptName}</h3>
                      <Badge tone="navy">{S.orangN.replace("{n}", String(members.length))}</Badge>
                    </div>
                    {head && (
                      <div className="mt-3 rounded-xl border border-navy-200 bg-navy-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">{S.orgKepala}</p>
                        <p className="mt-0.5 font-semibold text-navy-900">{head.name}</p>
                        <p className="text-xs text-steel-500">{head.role} · {head.branch}</p>
                      </div>
                    )}
                    <div className="mt-2 space-y-1.5">
                      {rest.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 text-sm">
                          <span className="truncate text-steel-700" title={`${m.name} · ${m.role}`}>{m.name}</span>
                          <span className="ml-2 shrink-0 text-xs text-steel-400">{m.role}</span>
                        </div>
                      ))}
                      {rest.length === 0 && <p className="text-xs text-steel-400">{S.orgHanya}</p>}
                    </div>
                  </Card>
                );
              })}
              {orgGroups.length === 0 && <EmptyState title={S.emptyOrgT} subtitle={S.emptyOrgS} />}
            </div>
          )}

          {tab === "Training" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr>
                    <SortTh label={S.thId} sortKey="id" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label={S.thJudul} sortKey="title" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label={S.thTanggal} sortKey="date" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label={S.thProvider} sortKey="provider" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label={S.thPeserta} sortKey="participants" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label={S.dlStatus} sortKey="status" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <th className="th">{S.thAksi}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(data.trainings, sort3, (row, k) => {
                    const t = row as StoreItem;
                    switch (k) {
                      case "id": return String(t.id ?? "");
                      case "title": return String(t.title ?? "");
                      case "date": return String(t.date ?? "");
                      case "provider": return String(t.provider ?? "");
                      case "participants": return Number(((t.participants ?? []) as unknown[]).length);
                      case "status": return String(t.status ?? "");
                      default: return "";
                    }
                  }).map((t) => {
                    const parts = ((t.participants ?? []) as string[]).map((id) => empNameOf(id));
                    return (
                      <tr key={t.id} className="hover:bg-surface">
                        <td className="td font-mono text-steel-600">{t.id}</td>
                        <td className="td font-medium text-navy-900">{t.title}</td>
                        <td className="td text-steel-600">{fmtTanggal(t.date)}</td>
                        <td className="td text-steel-600">{t.provider}</td>
                        <td className="td text-steel-600 max-w-[220px] truncate" title={parts.join(", ")}>{S.pesertaN.replace("{a}", String(parts.length)).replace("{b}", parts.join(", "))}</td>
                        <td className="td"><StatusBadge status={String(t.status)} /></td>
                        <td className="td">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {String(t.status) !== "Selesai" && (
                              <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => finishTraining(t)}>{S.btnSelesai}</button>
                            )}
                            {String(t.status) === "Selesai" && (
                              <button className="text-sm font-semibold text-ocean-600 hover:underline" onClick={() => setCertTarget(t)}>{S.btnTerapkan}</button>
                            )}
                            <RowAction
                              icon={Pencil}
                              tone="neutral"
                              label={S.btnEdit}
                              ariaLabel={`${S.btnEdit} ${String(t.id)}`}
                              onClick={() => openTrainingEdit(t)}
                            />
                            <RowAction icon={Trash2} tone="danger" label={S.btnHapus} ariaLabel={`${S.btnHapus} ${String(t.id)}`} onClick={() => setDelTraining(t)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.trainings.length === 0 && <EmptyState title={S.emptyTrainT} subtitle={S.emptyTrainS} />}
            </div>
          )}

          {tab === "Surat & Impor" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.arsipT}</h3>
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary text-xs" onClick={exportArsipSurat}>{S.btnExport}</button>
                    <button className="btn-primary text-xs" onClick={() => { setSuratEditId(null); setSuratForm({ employeeId: "", jenis: "SP 1", isi: "", tanggal: todayISO(), fileUrl: "", approvedBy: "", approvedAt: "", sourceType: "", sourceId: "", mulai: "", berakhir: "", gaji: "" }); setShowSurat(true); }}>{S.btnBuatSurat}</button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-steel-500">
                  {locale === "en"
                    ? `${arsipSurat.length} letter(s) in the shared archive. Each row can be previewed, edited and deleted.`
                    : `${arsipSurat.length} surat di arsip bersama. Setiap baris bisa dipratinjau, diubah, dan dihapus.`}
                </p>
                <div className="mt-3 space-y-2.5">
                  {arsipSurat.map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface p-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-navy-900">{s.jenis} · {s.nama}</p>
                        <p className="font-mono text-xs text-steel-500">{s.id} · {fmtTanggal(String(s.tanggal))}</p>
                        <p className="text-[11px] text-steel-400">
                          {s.fileUrl
                            ? (locale === "en" ? "scan attached" : "pindai terlampir")
                            : (locale === "en" ? "no scan - text only" : "tanpa pindai - teks saja")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button className="text-xs font-semibold text-ocean-600 underline" onClick={() => setSuratPreviewFor(s)}>
                          {locale === "en" ? "Preview" : "Pratinjau"}
                        </button>
                        <button
                          className="text-xs font-semibold text-navy-700 underline"
                          onClick={() => openSuratEdit(s)}
                          title={locale === "en" ? "Edit this letter" : "Ubah surat ini"}
                        >
                          {S.btnEdit}
                        </button>
                        <button className="text-xs font-semibold text-rose-600 underline" onClick={() => setDelSurat(s)}>
                          {S.btnHapus}
                        </button>
                      </div>
                    </div>
                  ))}
                  {arsipSurat.length === 0 && <p className="text-xs text-steel-400">{S.emptyArsip}</p>}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">{S.imporT}</h3>
                <p className="mt-1 text-xs text-steel-500">
                  {S.imporDesc}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="btn-secondary text-xs" onClick={downloadTemplate}>{S.btnTemplate}</button>
                  <label className="btn-primary cursor-pointer text-xs">
                    {S.btnImpor}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void busy.run("importCSV", () => importCSV(f));
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {importReport && (
                  <div className="mt-3 rounded-xl bg-surface p-3 text-sm">
                    <p className="font-semibold text-navy-900">{S.imporHasil.replace("{a}", String(importReport.ok)).replace("{b}", String(importReport.gagal.length))}</p>
                    {importReport.gagal.length > 0 && (
                      <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs text-rose-600">
                        {importReport.gagal.map((g) => <li key={g}>{g}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ---------- modal karyawan ---------- */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? S.mEmpTEdit : S.btnTambahKaryawan}
        subtitle={S.mEmpS}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>{S.btnBatal}</button>
            <AsyncButton className="btn-primary" onAction={saveEmployee}>{S.btnSimpan}</AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fNik} hint="NIK = username login karyawan (16 digit angka, dipakai untuk masuk aplikasi)."><input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={16} value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/[^0-9]/g, "").slice(0, 16) })} placeholder={S.phNik} /></Field>
            <Field label={S.fNama}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={S.phNamaHr} /></Field>
            <Field label={S.thJabatan}>
              {/* T6-SDM10: jabatan berupa pilihan (dropdown), bukan teks bebas. */}
              <select className="input" value={JABATAN_OPTIONS.includes(form.role) ? form.role : "Lainnya"} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {JABATAN_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={S.fDept}>
              <select className="input" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })}>
                {DEPT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label={S.fCabang}>
              <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.dlStatus}>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Aktif</option>
                <option>Nonaktif</option>
                <option>Cuti</option>
              </select>
            </Field>
            <Field label={S.fJoin}><input type="date" className="input" value={form.join} onChange={(e) => setForm({ ...form, join: e.target.value })} /></Field>
            <Field label={S.fTipeKaryawan}>
              <select className="input" value={form.tipe} onChange={(e) => setForm({ ...form, tipe: e.target.value })}>
                {TIPE_KARYAWAN.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.fBasic}><NumInput min="0" className="input" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} placeholder={S.phBasic} /></Field>
            <Field label={S.fAllow}><NumInput min="0" className="input" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} placeholder={S.phAllow} /></Field>
            <Field label={S.fContractEnd}><input type="date" className="input" value={form.contractEnd} onChange={(e) => setForm({ ...form, contractEnd: e.target.value })} /></Field>
            <Field label={S.fPtkp}>
              <select className="input" value={form.ptkpStatus} onChange={(e) => setForm({ ...form, ptkpStatus: e.target.value })}>
                {PTKP_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={S.fTanggungan}>
              <select className="input" value={form.dependents} onChange={(e) => setForm({ ...form, dependents: e.target.value })}>
                {["0", "1", "2", "3"].map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            {/* T6-SDM10: pendidikan selectable, status kawin, jenis kelamin. */}
            <Field label={locale === "en" ? "Education" : "Pendidikan"}>
              <select className="input" value={form.pendidikan} onChange={(e) => setForm({ ...form, pendidikan: e.target.value })}>
                {PENDIDIKAN_OPTIONS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Marital status" : "Status kawin"}>
              <select className="input" value={form.kawin} onChange={(e) => setForm({ ...form, kawin: e.target.value })}>
                {KAWIN_OPTIONS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Gender" : "Jenis kelamin"}>
              <select className="input" value={form.jk} onChange={(e) => setForm({ ...form, jk: e.target.value })}>
                {JK_OPTIONS.map((j) => <option key={j}>{j}</option>)}
              </select>
            </Field>
          </FormGrid>
          {/* T6-SDM9: foto profil + unggah KTP & ijazah. */}
          <FormGrid>
            <Field label={locale === "en" ? "Profile photo" : "Foto profil"}>
              <div className="flex items-center gap-2">
                {form.photo ? <SecureImg src={form.photo} alt="Foto" name={form.name || "Karyawan"} className="h-10 w-10 rounded-full object-cover" /> : null}
                <FileUploadButton accept=".png,.jpg,.jpeg" label={locale === "en" ? "Upload photo" : "Unggah foto"} onUploaded={(url) => setForm({ ...form, photo: url })} />
              </div>
            </Field>
            <Field label={locale === "en" ? "KTP" : "KTP"}>
              <div className="flex items-center gap-2">
                {form.ktpUrl ? <a className="text-xs font-semibold text-ocean-600 hover:underline" href={form.ktpUrl} target="_blank" rel="noreferrer">KTP ✓</a> : null}
                <FileUploadButton accept=".png,.jpg,.jpeg,.pdf" label={locale === "en" ? "Upload KTP" : "Unggah KTP"} onUploaded={(url) => setForm({ ...form, ktpUrl: url })} />
              </div>
            </Field>
            <Field label={locale === "en" ? "Diploma" : "Ijazah"}>
              <div className="flex items-center gap-2">
                {form.ijazahUrl ? <a className="text-xs font-semibold text-ocean-600 hover:underline" href={form.ijazahUrl} target="_blank" rel="noreferrer">Ijazah ✓</a> : null}
                <FileUploadButton accept=".png,.jpg,.jpeg,.pdf" label={locale === "en" ? "Upload diploma" : "Unggah ijazah"} onUploaded={(url) => setForm({ ...form, ijazahUrl: url })} />
              </div>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* ---------- modal cuti ---------- */}
      <Modal
        open={showLeave}
        onClose={closeLeaveModal}
        title={leaveFinalEdit
          ? (locale === "en" ? `Correct approved leave - ${leaveEditId}` : `Koreksi Cuti Disetujui - ${leaveEditId}`)
          : leaveEditId ? `${S.btnEdit} ${leaveEditId}` : S.mLeaveT}
        subtitle={leaveFinalEdit
          ? (locale === "en"
            ? "Period, type and employee are locked (attendance was already synced). Note and attachment stay editable."
            : "Periode, tipe, dan karyawan terkunci (absensi sudah tersinkron). Catatan dan lampiran tetap bisa diubah.")
          : S.mLeaveS.replace("{n}", String(jatahCuti))}
        footer={
          <>
            <button className="btn-secondary" onClick={closeLeaveModal}>{S.btnBatal}</button>
            {leaveEditId ? (
              <button className="btn-primary" onClick={updateLeave}>{S.btnSimpan}</button>
            ) : (
              <button className="btn-primary" onClick={saveLeave}>{S.btnSimpanPengajuan}</button>
            )}
          </>
        }
      >
        <div className="space-y-3">
          <Field label={S.fKaryawan}>
            <select
              className="input"
              value={leaveForm.employeeId}
              disabled={leaveFinalEdit}
              onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}
            >
              <option value="">{S.optPilih}</option>
              {scopedEmployees.map((e) => (
                <option key={e.id} value={e.id}>{S.optSisa.replace("{a}", String(e.name)).replace("{n}", String(saldoCuti(e.id)))}</option>
              ))}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.thTipe}>
              <select
                className="input"
                value={leaveForm.type}
                disabled={leaveFinalEdit}
                onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
              >
                {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.fDurasi}><input className="input" value={S.daysN.replace("{n}", String(leaveDays))} disabled /></Field>
            <Field label={S.fDari}>
              <input
                type="date"
                className="input"
                value={leaveForm.from}
                disabled={leaveFinalEdit}
                onChange={(e) => setLeaveForm({ ...leaveForm, from: e.target.value })}
              />
            </Field>
            <Field label={S.fSampai}>
              <input
                type="date"
                className="input"
                value={leaveForm.to}
                disabled={leaveFinalEdit}
                onChange={(e) => setLeaveForm({ ...leaveForm, to: e.target.value })}
              />
            </Field>
          </FormGrid>
          <Field label={S.fKet}><input className="input" value={leaveForm.note} onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })} placeholder={S.phKeperluan} /></Field>
          <Field
            label={locale === "en" ? "Attachment URL (e.g. doctor note)" : "URL lampiran (mis. surat dokter)"}
            hint={locale === "en"
              ? "Preview shows here as soon as the attachment is uploaded, and stays open unless the request is rejected."
              : "Pratinjau langsung muncul begitu lampiran diunggah, dan tetap terbuka kecuali pengajuan ditolak."}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input className="input flex-1 font-mono" value={leaveForm.fileUrl} onChange={(e) => setLeaveForm({ ...leaveForm, fileUrl: e.target.value })} placeholder="https://…" />
              <FileUploadButton label={locale === "en" ? "Upload" : "Unggah"} onUploaded={(url) => setLeaveForm((f) => ({ ...f, fileUrl: url }))} />
            </div>
          </Field>
          {/* Preview di dalam form: HR bisa memastikan berkas yang diunggah benar
              SEBELUM menutup modal. Ketentuan ini tidak bergantung status -
              pratinjau terbuka begitu ada fileUrl, termasuk saat pengajuan
              masih Diajukan. Yang mengunci hanya status Ditolak (lihat sel
              lampiran di tabel). */}
          {leaveForm.fileUrl.trim() !== "" && (
            <div className="rounded-xl border border-steel-200 bg-steel-50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
                <Eye className="h-3.5 w-3.5" />
                {locale === "en" ? "Attachment preview" : "Pratinjau Lampiran"}
              </p>
              <DocumentPreviewPanel
                doc={{
                  title: `${empNameOf(leaveForm.employeeId)} · ${leaveForm.type}`,
                  subtitle: leaveFinalEdit
                    ? (locale === "en" ? "Approved leave - correction" : "Cuti disetujui - koreksi")
                    : (locale === "en" ? "Visible in the table after approval" : "Tampil di tabel setelah disetujui"),
                  fileUrl: leaveForm.fileUrl.trim(),
                  fileName: `lampiran-${leaveEditId ?? "draft"}`,
                }}
              />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={rejectTarget !== null}
        title={S.cmTolakT}
        desc={S.cmTolakD.replace("{n}", rejectTarget?.id ?? "")}
        confirmLabel={S.cmTolakC}
        danger
        onCancel={() => setRejectTarget(null)}
        onConfirm={async () => {
          if (rejectTarget) {
            try {
            await update("leaves", rejectTarget.id, { status: "Ditolak" });
            log("menolak cuti", rejectTarget.id, "SDM");
            toast(S.tTolak.replace("{n}", rejectTarget.id));
            } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          }
          setRejectTarget(null);
        }}
      />

      <ConfirmModal
        open={delLeave !== null}
        title={delLeave ? (locale === "en" ? `Delete leave ${delLeave.id}?` : `Hapus cuti ${delLeave.id}?`) : ""}
        desc={delLeave ? (locale === "en" ? `Leave ${delLeave.id} (Diajukan) will be permanently deleted.` : `Cuti ${delLeave.id} (Diajukan) akan dihapus permanen.`) : ""}
        confirmLabel={S.btnHapus}
        danger
        onCancel={() => setDelLeave(null)}
        onConfirm={async () => {
          if (!delLeave) return;
          if (String(delLeave.status) !== "Diajukan") { toast(locale === "en" ? "Only Diajukan can be deleted" : "Hanya status Diajukan yang bisa dihapus", "info"); setDelLeave(null); return; }
          try {
            await remove("leaves", String(delLeave.id));
            log("menghapus cuti", String(delLeave.id), "SDM");
            toast(locale === "en" ? `Leave ${delLeave.id} deleted` : `Cuti ${delLeave.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelLeave(null);
        }}
      />

      {/* ---------- modal mutasi ---------- */}
      <Modal
        open={showMutasi}
        onClose={() => setShowMutasi(false)}
        title={S.mMutT}
        subtitle={S.mMutS}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowMutasi(false)}>{S.btnBatal}</button>
            <button className="btn-primary" onClick={saveMutasi}>{S.btnSimpanMutasi}</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={S.fKaryawan}>
            <select className="input" value={mutasiForm.employeeId} onChange={(e) => setMutasiForm({ ...mutasiForm, employeeId: e.target.value })}>
              <option value="">{S.optPilih}</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>{S.optMutasi.replace("{a}", String(e.name)).replace("{b}", String(e.dept)).replace("{c}", String(e.branch)).replace("{d}", String(e.role))}</option>
              ))}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.fDeptBaru}>
              <select className="input" value={mutasiForm.dept} onChange={(e) => setMutasiForm({ ...mutasiForm, dept: e.target.value })}>
                {DEPT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label={S.fCabangBaru}>
              <select className="input" value={mutasiForm.branch} onChange={(e) => setMutasiForm({ ...mutasiForm, branch: e.target.value })}>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.fJabatanBaru}><input className="input" value={mutasiForm.role} onChange={(e) => setMutasiForm({ ...mutasiForm, role: e.target.value })} placeholder={S.phForeman} /></Field>
            <Field label={S.fTglMutasi}><input type="date" className="input" value={mutasiForm.date} onChange={(e) => setMutasiForm({ ...mutasiForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.fAlasan}><input className="input" value={mutasiForm.reason} onChange={(e) => setMutasiForm({ ...mutasiForm, reason: e.target.value })} placeholder={S.phAlasanMut} /></Field>
        </div>
      </Modal>

      {/* ---------- modal training ---------- */}
      <Modal
        open={showTraining}
        onClose={closeTrainingModal}
        title={trainingEditId ? `${S.btnEdit} ${trainingEditId}` : S.mTrainT}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={closeTrainingModal}>{S.btnBatal}</button>
            <button className="btn-primary" onClick={trainingEditId ? saveTrainingEdit : saveTraining}>{S.btnSimpanJadwal}</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fJudul}><input className="input" value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder={S.phTrain} /></Field>
            <Field label={S.thTanggal}><input type="date" className="input" value={trainingForm.date} onChange={(e) => setTrainingForm({ ...trainingForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.fProvider}><input className="input" value={trainingForm.provider} onChange={(e) => setTrainingForm({ ...trainingForm, provider: e.target.value })} placeholder={S.phProvider} /></Field>
          <Field label={S.fPesertaN.replace("{n}", String(trainingForm.participants.length))}>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-steel-200 p-2.5">
              {scopedEmployees.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm text-steel-700">
                  <input type="checkbox" checked={trainingForm.participants.includes(e.id)} onChange={() => toggleParticipant(e.id)} />
                  {e.name} · {e.role}
                </label>
              ))}
              {scopedEmployees.length === 0 && <p className="text-xs text-steel-400">{S.emptyCabang}</p>}
            </div>
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={delTraining !== null}
        title={delTraining
          ? (locale === "en" ? `Delete training ${delTraining.id}?` : `Hapus training ${delTraining.id}?`)
          : ""}
        desc={delTraining
          ? (String(delTraining.status) === "Selesai"
            ? (locale === "en"
              ? `"${String(delTraining.title)}" is already completed. Certificates issued from it stay on the employee record, but this training record will be gone.`
              : `"${String(delTraining.title)}" sudah selesai. Sertifikat yang sudah terbit tetap tersimpan di data karyawan, tetapi record training ini akan hilang.`)
            : (locale === "en"
              ? `"${String(delTraining.title)}" will be permanently deleted.`
              : `"${String(delTraining.title)}" akan dihapus permanen.`))
          : ""}
        confirmLabel={S.btnHapus}
        danger
        onCancel={() => setDelTraining(null)}
        onConfirm={confirmDelTraining}
      />

      <Modal
        open={certTarget !== null}
        onClose={() => setCertTarget(null)}
        title={S.mCertT}
        subtitle={certTarget ? S.mCertS.replace("{a}", certTarget.id).replace("{n}", String((certTarget.participants as string[]).length)) : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCertTarget(null)}>{S.btnBatal}</button>
            <button className="btn-primary" onClick={applyCert}>{S.btnTerapkan}</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={S.fNamaCert}><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder={S.phCert} /></Field>
          <Field label={S.fBerlaku}><input type="date" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* ---------- modal surat ---------- */}
      <Modal
        open={showSurat}
        onClose={() => setShowSurat(false)}
        title={suratEditId
          ? (locale === "en" ? `Edit letter - ${suratEditId}` : `Ubah Surat - ${suratEditId}`)
          : S.mSuratT}
        subtitle={suratEditId
          ? (locale === "en" ? "Letter number stays the same once issued." : "Nomor surat tetap sama setelah diterbitkan.")
          : S.mSuratS}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setShowSurat(false); setSuratEditId(null); }}>{S.btnBatal}</button>
            <button className="btn-primary" onClick={saveSurat}>
              {suratEditId ? S.btnSimpan : S.btnArsip}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fKaryawan}>
              <select className="input" value={suratForm.employeeId} onChange={(e) => setSuratForm({ ...suratForm, employeeId: e.target.value })}>
                <option value="">{S.optPilih}</option>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {e.role}</option>
                ))}
              </select>
            </Field>
            <Field label={S.fJenisSurat}>
              <select className="input" value={suratForm.jenis} onChange={(e) => {
                const jenis = e.target.value;
                const emp = data.employees.find((x) => x.id === suratForm.employeeId);
                /* T6-SDM8: pilih kontrak → isi otomatis dari data karyawan. */
                if (KONTRAK_JENIS.includes(jenis) && emp) {
                  setSuratForm({
                    ...suratForm,
                    jenis,
                    mulai: suratForm.mulai || String(emp.join ?? todayISO()),
                    berakhir: suratForm.berakhir || String(emp.contractEnd ?? ""),
                    gaji: suratForm.gaji || String(emp.basic ?? ""),
                    isi: suratForm.isi || (jenis === "Kontrak Kerja"
                      ? "Bersama ini kami menunjuk Saudara/i sebagai karyawan PT Syukur Bersaudara sesuai ketentuan yang tercantum pada surat ini."
                      : "Dengan ini kami memperpanjang masa kerja Saudara/i sebagai karyawan PT Syukur Bersaudara sesuai ketentuan surat ini."),
                  });
                } else {
                  setSuratForm({ ...suratForm, jenis });
                }
              }}>
                {SURAT_JENIS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={S.thTanggal}><input type="date" className="input" value={suratForm.tanggal} onChange={(e) => setSuratForm({ ...suratForm, tanggal: e.target.value })} /></Field>
          </FormGrid>
          {/* T6-SDM8: field kontrak (muncul hanya untuk jenis kontrak). */}
          {KONTRAK_JENIS.includes(suratForm.jenis) && (
            <FormGrid>
              <Field label={locale === "en" ? "Start date" : "Mulai kerja"}>
                <input type="date" className="input" value={suratForm.mulai} onChange={(e) => setSuratForm({ ...suratForm, mulai: e.target.value })} />
              </Field>
              <Field label={locale === "en" ? "End date" : "Berakhir"}>
                <input type="date" className="input" value={suratForm.berakhir} onChange={(e) => setSuratForm({ ...suratForm, berakhir: e.target.value })} />
              </Field>
              <Field label={locale === "en" ? "Base salary (Rp)" : "Gaji pokok (Rp)"}>
                <NumInput min="0" className="input" value={suratForm.gaji} onChange={(e) => setSuratForm({ ...suratForm, gaji: e.target.value })} />
              </Field>
            </FormGrid>
          )}
          <Field label={S.fIsi}><textarea className="input" rows={4} value={suratForm.isi} onChange={(e) => setSuratForm({ ...suratForm, isi: e.target.value })} placeholder={S.phSurat} /></Field>
<Field label={locale === "en" ? "Scan / attachment (optional)" : "Pindai / Lampiran (opsional)"} hint={locale === "en" ? "PDF or image, shown side-by-side with the text" : "PDF atau gambar, tampil berdampingan dengan teks"}>
            {/* Dulu hanya input URL tanpa tombol Unggah - padahal modul lain
                (cuti) sudah punya FileUploadButton, jadi scanner/HP jadi satu
               -satunya cara melampirkan pindai. */}
            <div className="flex flex-wrap items-center gap-2">
              <input className="input flex-1 font-mono" value={suratForm.fileUrl} onChange={(e) => setSuratForm({ ...suratForm, fileUrl: e.target.value })} placeholder="https://…" />
              <FileUploadButton label={locale === "en" ? "Upload" : "Unggah"} onUploaded={(url) => setSuratForm((f) => ({ ...f, fileUrl: url }))} />
            </div>
          </Field>
          {/* Persetujuan. Wajib diisi karena blok ini ikut tercetak di PDF
              dan tanpa nama penyetuju surat peringatan tidak sah. */}
          <FormGrid>
            <Field label={S.fDisetujuiOleh} hint={S.hDisetujuiOleh}>
              <input className="input" value={suratForm.approvedBy} onChange={(e) => setSuratForm({ ...suratForm, approvedBy: e.target.value })} placeholder={SB_KOP.director} />
            </Field>
            <Field label={S.fDisetujuiPada}>
              <input type="date" className="input font-mono" value={suratForm.approvedAt} onChange={(e) => setSuratForm({ ...suratForm, approvedAt: e.target.value })} aria-label={S.fDisetujuiPada} />
            </Field>
          </FormGrid>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={printSuratPdf} disabled={!suratEmp || !suratForm.isi.trim() || !suratEditId}>
              {S.btnSuratPdf}
            </button>
            <span className="text-[11px] text-steel-400">{suratEditId ? S.hSuratPdf : S.hSuratPdfBelumSimpan}</span>
          </div>
          {suratPreview && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-steel-500">{S.lblPratinjau}</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-navy-900">{suratPreview}</pre>
            </div>
          )}
          {/* Preview pindai langsung di form lewat DocumentPreviewPanel
              (JWT-aware) - <img src> mentah akan 401 untuk file ber-JWT. */}
          {suratForm.fileUrl.trim() !== "" && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-steel-500">
                {locale === "en" ? "Scan preview" : "Pratinjau Pindai"}
              </p>
              <DocumentPreviewPanel
                doc={{
                  title: `${suratForm.jenis} · ${suratEmp?.name ?? ""}`,
                  subtitle: suratEditId ?? suratNomor,
                  fileUrl: suratForm.fileUrl.trim(),
                  fileName: `surat-${suratEditId ?? suratNomor}`,
                }}
              />
            </div>
          )}
        </div>
      </Modal>

{/* ---------- modal pratinjau isi surat di arsip ----------
          Pratinjau sekarang PDF yang dirakit server dari baris `letters`,
          sama dengan yang akan dicetak/didownload. Sebelumnya teksnya
          disusun ulang di browser memakai `suratText()` - jalur kedua yang
          bisa BERBEDA dari factory server, jadi yang tampil di layar bukan
          tentu yang keluar dari printer.

          Preview di form (baris 2204) tetap teks dan itu memang benar:
          suratnya belum punya baris di DB, jadi factory server tidak punya
          apa pun untuk dirakit. */}
      <Modal
        open={suratPreviewFor !== null}
        onClose={() => { setSuratPreviewFor(null); pdfDoc.close(); }}
        wide
        title={suratPreviewFor ? String(suratPreviewFor.jenis) : ""}
        subtitle={suratPreviewFor ? `${String(suratPreviewFor.id)} - ${String(suratPreviewFor.nama)}` : ""}
      >
        {suratPreviewFor && (
          <div className="space-y-3">
            {!pdfServerReady() && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {locale === "en"
                  ? "Official PDF needs the server - connect the backend first."
                  : "PDF resmi perlu server aktif - hubungkan backend dulu."}
              </div>
            )}
            {pdfServerReady() && (
              <>
                {pdfDoc.state.busy && (
                  <p className="text-sm text-steel-500">
                    {locale === "en" ? "Preparing PDF..." : "Menyiapkan PDF..."}
                  </p>
                )}
                {pdfDoc.state.error !== "" && (
                  <p className="text-sm text-rose-600">{pdfDoc.state.error}</p>
                )}
                {pdfDoc.state.url !== "" && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn-secondary" onClick={() => pdfDoc.download(`Surat-${String(suratPreviewFor.id)}.pdf`)}>
                        <Download className="h-4 w-4" />
                        {locale === "en" ? "Download PDF" : "Unduh PDF"}
                      </button>
                      {/* `state.url` adalah object URL dari Blob, bukan URL backend - jadi
                          window.open biasa aman. openFileUrl() yang membawa
                          JWT tidak diperlukan di sini (dan memang akan
                          salah: ia mengambildari URL backend). */}
                      <button className="btn-secondary" onClick={() => window.open(pdfDoc.state.url, "_blank", "noopener,noreferrer")}>
                        {locale === "en" ? "Open in new tab" : "Buka di tab baru"}
                      </button>
                    </div>
                    <iframe
                      title={`Surat ${String(suratPreviewFor.id)}`}
                      src={pdfDoc.state.url}
                      className="h-[36rem] w-full rounded-xl border border-steel-200"
                    />
                  </>
                )}
              </>
            )}
            {suratPreviewFor.fileUrl ? (
              /* DocumentPreviewPanel, BUKAN <iframe>/<img> mentah: file di
                 backend dilindungi JWT, jadi src="/files/..." akan 401 dan
                 tampil blank. Panel ini ambil lewat fetchFileBlob yang
                 mengirim header Authorization, sekaligus menyediakan tombol
                 Unduh. */
              <div>
                <p className="mb-1 text-[11px] font-semibold text-steel-500">
                  {locale === "en" ? "Attached scan" : "Pindai terlampir"}
                </p>
                <DocumentPreviewPanel
                  doc={{
                    title: `Lampiran ${String(suratPreviewFor.id)}`,
                    subtitle: String(suratPreviewFor.nama ?? ""),
                    fileUrl: String(suratPreviewFor.fileUrl),
                    fileName: String(suratPreviewFor.fileName ?? `surat-${String(suratPreviewFor.id)}`),
                  }}
                />
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* H1c: preview surat persetujuan cuti - tanpa paksa download, Unduh tetap ada. */}
      <Modal
        open={cutiPreviewId !== null}
        onClose={() => { setCutiPreviewId(null); pdfDoc.close(); }}
        title={locale === "en" ? "Leave approval letter" : "Surat persetujuan cuti"}
        subtitle={cutiPreviewId ?? undefined}
        footer={<>
          <button className="btn-secondary" onClick={() => { setCutiPreviewId(null); pdfDoc.close(); }}>{locale === "en" ? "Close" : "Tutup"}</button>
          {pdfDoc.state.url !== "" && (
            <button className="btn-primary" onClick={() => pdfDoc.download(`Surat-Cuti-${cutiPreviewId ?? ""}.pdf`)}>
              <Download className="h-4 w-4" /> {locale === "en" ? "Download PDF" : "Unduh PDF"}
            </button>
          )}
        </>}
      >
        <div className="space-y-3">
          {!pdfServerReady() && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {locale === "en" ? "Official PDF needs the server - connect the backend first." : "PDF resmi perlu server aktif - hubungkan backend dulu."}
            </div>
          )}
          {pdfServerReady() && pdfDoc.state.busy && (
            <p className="text-sm text-steel-500">{locale === "en" ? "Preparing PDF..." : "Menyiapkan PDF..."}</p>
          )}
          {pdfServerReady() && pdfDoc.state.error !== "" && (
            <p className="text-sm text-rose-600">{pdfDoc.state.error}</p>
          )}
          {pdfDoc.state.url !== "" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-secondary" onClick={() => window.open(pdfDoc.state.url, "_blank", "noopener,noreferrer")}>
                  {locale === "en" ? "Open in new tab" : "Buka di tab baru"}
                </button>
              </div>
              <iframe
                title={`Surat Cuti ${cutiPreviewId ?? ""}`}
                src={pdfDoc.state.url}
                className="h-[36rem] w-full rounded-xl border border-steel-200"
              />
            </>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={delEmp !== null}
        title={delEmp ? (locale === "en" ? `Delete employee ${delEmp.name}?` : `Hapus karyawan ${delEmp.name}?`) : ""}
        desc={(() => {
          if (!delEmp) return "";
          const used = findUsages(data, "employees", String(delEmp.id));
          const base = locale === "en"
            ? `Employee ${delEmp.name} (${delEmp.id}) will be permanently deleted.`
            : `Karyawan ${delEmp.name} (${delEmp.id}) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Used in: ${used.join(", ")}. Deletion blocked.` : `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delEmp && findUsages(data, "employees", String(delEmp.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : S.btnHapus}
        danger
        confirmDisabled={delEmp ? findUsages(data, "employees", String(delEmp.id)).length > 0 : false}
        onCancel={() => setDelEmp(null)}
        onConfirm={async () => {
          if (!delEmp) return;
          const usedBy = findUsages(data, "employees", String(delEmp.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - used in: ${usedBy.join(", ")}` : `Hapus diblokir - dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("employees", String(delEmp.id));
            log("menghapus karyawan", `${delEmp.id} · ${delEmp.name}`, "SDM");
            toast(locale === "en" ? `Employee ${delEmp.id} deleted` : `Karyawan ${delEmp.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelEmp(null);
        }}
      />
      <ConfirmModal
        open={delSurat !== null}
        title={delSurat ? (locale === "en" ? `Delete letter ${delSurat.id}?` : `Hapus arsip surat ${delSurat.id}?`) : ""}
        desc={delSurat
          ? (locale === "en"
            ? `${delSurat.jenis} for ${delSurat.nama} will be removed from the archive.`
            : `${delSurat.jenis} untuk ${delSurat.nama} akan dihapus dari arsip.`)
          : ""}
        confirmLabel={S.btnHapus}
        danger
        onCancel={() => setDelSurat(null)}
        onConfirm={async () => {
          if (!delSurat) return;
          try {
            await remove("letters", String(delSurat.id));
            log("menghapus arsip surat", String(delSurat.id), "SDM");
            toast(locale === "en" ? `Letter ${delSurat.id} deleted` : `Arsip surat ${delSurat.id} dihapus`);
            setDelSurat(null);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
        }}
      />
    </div>
  );
}
