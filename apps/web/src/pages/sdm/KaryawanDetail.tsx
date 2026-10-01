import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Search, User } from "lucide-react";
import {
  Badge,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  FormGrid,
  Modal,
  PageHeader,
  SortTh,
  StatusBadge,
  Tabs,
  sortRows,
  toast,
  toggleSort,
  SecureImg,
  FileUploadButton,
  AsyncButton,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { DocumentPreviewCell, DocumentPreviewModal } from "../../components/DocumentPreview";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { fmtBulan, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { useT } from "../../i18n/LanguageContext";
import { n_qc } from "../../i18n/n_qc";

/* Akun login yang tertaut ke karyawan ini (baca /api/users, best-effort:
   non-direktur dapat 403 → tampil "-"). */
function AkunLogin({ employeeId }: { employeeId: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!isBackendConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{ users: { username: string; employeeId?: string | null; isActive: boolean }[] } | { username: string; employeeId?: string | null; isActive: boolean }[]>("/api/users");
        const list = Array.isArray(res) ? res : (res.users ?? []);
        const hit = list.find((u) => String(u.employeeId ?? "") === employeeId);
        if (!cancelled) setLabel(hit ? `${hit.username}${hit.isActive ? "" : " (nonaktif)"}` : "-");
      } catch {
        if (!cancelled) setLabel("-");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);
  if (!isBackendConfigured()) return <>-</>;
  return <>{label ?? "…"}</>;
}

interface EmpCert {
  name: string;
  expires: string;
}

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

function getSkills(e: StoreItem): string[] {
  if (Array.isArray(e.skills) && e.skills.length > 0) return e.skills.map((s) => String(s));
  return [];
}

/** Total tunjangan: dukung number (lama) maupun array [{label,amount}] (Payroll). */
function sumAllowances(a: unknown): number {
  if (Array.isArray(a)) return a.reduce((s: number, l: unknown) => s + (Number((l as { amount?: unknown })?.amount ?? l) || 0), 0);
  return Number(a || 0);
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

export default function KaryawanDetail() {
  const { id } = useParams();
  const { data, add, update, remove, log } = useStore();
  const { locale } = useT();
  const S = n_qc[locale];
  const [tab, setTab] = useState("Absensi");
  const [skillInput, setSkillInput] = useState("");
  const [showCert, setShowCert] = useState(false);
  const [certForm, setCertForm] = useState({ name: "", expires: todayISO() });
  const [showDoc, setShowDoc] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", type: "Kontrak", status: "Berlaku", fileUrl: "" });
  const [docPreview, setDocPreview] = useState<StoreItem | null>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  const [sort4, setSort4] = useState<SortState>({ key: null, dir: "asc" });
  const [attQ, setAttQ] = useState("");

  /* ---- Ubah / hapus untuk 3 tabel store-record di halaman ini ----
     Semuanya read-only sebelumnya: dokumen, absensi, cuti. Payroll tetap
     read-only karena modul Payroll yang menghitung PPh21/BPJS-nya.
     Aturannya mengikuti invariants yang sudah ada di modul asalnya:
     - absensi: OT yang sudah disetujui tidak boleh diubah (nilainya sudah
       masuk hitungan lembur payroll),
     - cuti: "Disetujui" mengunci karyawan/periode/tipe (sudah disinkron
       ke baris absensi) tapi note + lampiran tetap boleh dikoreksi. */
  const [docEdit, setDocEdit] = useState<StoreItem | null>(null);
  const [attEdit, setAttEdit] = useState<StoreItem | null>(null);
  const [attForm, setAttForm] = useState({ date: "", shift: "Pagi", status: "Hadir", checkIn: "", checkOut: "", overtime: "0" });
  const [leaveEdit, setLeaveEdit] = useState<StoreItem | null>(null);
  const [leaveForm, setLeaveForm] = useState({ type: "", from: "", to: "", days: "", note: "", fileUrl: "" });
  const [delRow, setDelRow] = useState<{ kind: "documents" | "attendance" | "leaves"; row: StoreItem } | null>(null);

  const emp = useMemo(() => data.employees.find((e) => e.id === id), [data.employees, id]);

  const attendanceAll = useMemo(() => {
    if (!emp) return [];
    return data.attendance
      .filter((a) => a.employeeId === emp.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data.attendance, emp]);

  const payrollRows = useMemo(() => {
    if (!emp) return [];
    return data.payroll
      .filter((p) => p.employeeId === emp.id)
      .sort((a, b) => String(b.period).localeCompare(String(a.period)));
  }, [data.payroll, emp]);

  const leaveRows = useMemo(() => {
    if (!emp) return [];
    return data.leaves
      .filter((l) => l.employeeId === emp.id)
      .sort((a, b) => String(b.from).localeCompare(String(a.from)));
  }, [data.leaves, emp]);

  const docs = useMemo(() => {
    if (!emp) return [];
    return data.documents.filter((d) => sameName(d.owner, emp.name));
  }, [data.documents, emp]);

  if (!emp) {
    return (
      <div>
        <Link to="/sdm" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> {S.btnKembali}
        </Link>
        <EmptyState title={S.emptyNotFoundT} subtitle={S.emptyNotFoundS} />
      </div>
    );
  }

  const certs = normCerts(emp);
  const skills = getSkills(emp);

  const saveSkill = async () => {
    const extra = skillInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (extra.length === 0) {
      toast(S.tSkillIsi, "info");
      return;
    }
    const lower = new Set(skills.map((s) => s.toLowerCase()));
    const merged = [...skills];
    for (const s of extra) {
      if (!lower.has(s.toLowerCase())) { merged.push(s); lower.add(s.toLowerCase()); }
    }
    try {
    await update("employees", emp.id, { skills: merged });
    log("memperbarui skill karyawan", emp.id, "SDM");
    setSkillInput("");
    toast(S.tSkillOk);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const delSkill = async (name: string) => {
    try {
    await update("employees", emp.id, { skills: skills.filter((s) => s !== name) });
    log("menghapus skill karyawan", `${emp.id} · ${name}`, "SDM");
    toast(S.tSkillDel.replace("{n}", name), "info");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const delCert = async (name: string) => {
    try {
    await update("employees", emp.id, { certs: certs.filter((c) => c.name !== name) });
    log("menghapus sertifikat karyawan", `${emp.id} · ${name}`, "SDM");
    toast(S.tCertDel.replace("{n}", name), "info");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveCert = async () => {
    if (!certForm.name.trim() || !certForm.expires) {
      toast(S.tCertWajib, "info");
      return;
    }
    const next = [...certs, { name: certForm.name.trim(), expires: certForm.expires }];
    try {
    await update("employees", emp.id, { certs: next });
    log("menambah sertifikat karyawan", emp.id, "SDM");
    setCertForm({ name: "", expires: todayISO() });
    setShowCert(false);
    toast(S.tCertAdd);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveDoc = async () => {
    if (!docForm.title.trim()) {
      toast(S.tDocJudul, "info");
      return;
    }
    try {
    const created = await add(
      "documents",
      {
        title: docForm.title.trim(),
        type: docForm.type,
        project: "-",
        vessel: "-",
        version: "v1.0",
        status: docForm.status,
        updated: todayISO(),
        owner: emp.name,
        ...(docForm.fileUrl.trim() ? { fileUrl: docForm.fileUrl.trim() } : {}),
      },
      { action: "menambah dokumen karyawan", module: "SDM" },
    );
    toast(S.tDocOk.replace("{n}", created.id));
    setShowDoc(false);
    setDocForm({ title: "", type: "Kontrak", status: "Berlaku", fileUrl: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ================= UBAH / HAPUS: DOKUMEN ================= */
  const openDocEdit = (d: StoreItem) => {
    setDocEdit(d);
    setShowDoc(true);
    setDocForm({
      title: String(d.title ?? ""),
      type: String(d.type ?? "Kontrak"),
      status: String(d.status ?? "Berlaku"),
      fileUrl: String(d.fileUrl ?? ""),
    });
  };

  const saveDocEdit = async () => {
    if (!docEdit) return;
    if (!docForm.title.trim()) { toast(S.tDocJudul, "info"); return; }
    try {
      await update("documents", String(docEdit.id), {
        title: docForm.title.trim(),
        type: docForm.type,
        status: docForm.status,
        updated: todayISO(),
        /* File dikosongkan berarti berkas dilepas. Samakan dengan add():
         spreading fileUrl:"" akan menyisakan berkas lama. */
        fileUrl: docForm.fileUrl.trim(),
      });
      log("mengubah dokumen karyawan", `${String(docEdit.id)} - ${docForm.title.trim()}`, "SDM");
      toast(locale === "en" ? `Document ${String(docEdit.id)} updated` : `Dokumen ${String(docEdit.id)} diperbarui`);
      setShowDoc(false);
      setDocEdit(null);
      setDocForm({ title: "", type: "Kontrak", status: "Berlaku", fileUrl: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ================= UBAH / HAPUS: ABSENSI ================= */
  const attOtApproved = (a: StoreItem): boolean => Number(a.overtime || 0) > 0 && String(a.otStatus ?? "") === "Disetujui";

  const openAttEdit = (a: StoreItem) => {
    if (attOtApproved(a)) {
      toast(
        locale === "en"
          ? `Overtime on ${fmtTanggal(String(a.date))} is already approved and feeds payroll - void it there first.`
          : `Lembur pada ${fmtTanggal(String(a.date))} sudah disetujui dan sudah masuk hitungan payroll - batalkan di modul lembur dulu.`,
        "info",
      );
      return;
    }
    setAttEdit(a);
    setAttForm({
      date: String(a.date ?? todayISO()),
      shift: String(a.shift ?? "Pagi"),
      status: String(a.status ?? "Hadir"),
      checkIn: String(a.checkIn ?? ""),
      checkOut: String(a.checkOut ?? ""),
      overtime: String(Number(a.overtime || 0)),
    });
  };

  const saveAttEdit = async () => {
    if (!attEdit) return;
    if (!attForm.date) { toast(locale === "en" ? "Date required" : "Tanggal wajib diisi", "info"); return; }
    const hadir = attForm.status === "Hadir";
    if (hadir && (!attForm.checkIn || !attForm.checkOut)) {
      toast(locale === "en" ? "Check-in and check-out are required when present" : "Jam masuk dan keluar wajib diisi saat status Hadir", "info");
      return;
    }
    const ot = hadir ? Number(attForm.overtime || 0) : 0;
    if (hadir && (Number.isNaN(ot) || ot < 0 || ot > 8)) {
      toast(locale === "en" ? "Overtime must be between 0 and 8 hours" : "Lembur harus antara 0 dan 8 jam", "info");
      return;
    }
    try {
      await update("attendance", String(attEdit.id), {
        date: attForm.date,
        shift: attForm.shift,
        status: attForm.status,
        checkIn: hadir ? attForm.checkIn : "",
        checkOut: hadir ? attForm.checkOut : "",
        overtime: ot,
        /* OT yang tadinya belum disetujui tetap belum disetujui setelah
           koreksi - jangan mewarisi "Disetujui" ke angka jam yang baru. */
        otStatus: ot > 0 ? String(attEdit.otStatus ?? "") || "Diajukan" : "",
      });
      log("mengubah absensi", `${String(attForm.date)} shift ${attForm.shift} - ${String(emp.name)}`, "SDM");
      toast(locale === "en" ? "Attendance updated" : "Absensi diperbarui");
      setAttEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Payroll sengaja TIDAK diedit dari sini. Modul Payroll menghitung ulang
     PPh21 dan BPJS lewat buildComponents() dari dasar gaji + tunjangan +
     lembur, jadi mengedit slip di sini hanya menghasilkan slip yang
     tidak konsisten dengan mesin payroll. Tab ini jadi read-only. */

  /* ================= UBAH / HAPUS: CUTI ================= */
  const openLeaveEdit = (l: StoreItem) => {
    setLeaveEdit(l);
    setLeaveForm({
      type: String(l.type ?? ""),
      from: String(l.from ?? ""),
      to: String(l.to ?? ""),
      days: String(Number(l.days || 0)),
      note: String(l.note ?? ""),
      fileUrl: String(l.fileUrl ?? ""),
    });
  };

  const saveLeaveEdit = async () => {
    if (!leaveEdit) return;
    const approved = String(leaveEdit.status ?? "") === "Disetujui";
    try {
      /* Cuti yang sudah Disetujui TIDAK boleh mengubah periode/tipe/hari:
         HR.tsx sudah menyinkronkan baris absensi dari keputusan itu, jadi
         mengedit tanggal di sini akan meninggalkan absensi yang tidak
         cocok dengan cuti. Note + lampiran tetap boleh dikoreksi -
         itu memang koreksi yang diizinkan HR. */
      const payload = approved
        ? { note: leaveForm.note.trim(), fileUrl: leaveForm.fileUrl.trim() }
        : {
            type: leaveForm.type,
            from: leaveForm.from,
            to: leaveForm.to,
            days: Number(leaveForm.days || 0),
            note: leaveForm.note.trim(),
            fileUrl: leaveForm.fileUrl.trim(),
          };
      await update("leaves", String(leaveEdit.id), payload);
      log("mengubah cuti", `${String(leaveEdit.id)}${approved ? " (koreksi catatan)" : ""}`, "SDM");
      toast(approved
        ? (locale === "en" ? "Note and attachment updated" : "Catatan dan lampiran diperbarui")
        : (locale === "en" ? `Leave ${String(leaveEdit.id)} updated` : `Cuti ${String(leaveEdit.id)} diperbarui`));
      setLeaveEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ================= HAPUS (semua 4 tabel) ================= */
  const confirmDelRow = async () => {
    if (!delRow) return;
    const { kind, row } = delRow;
    const id = String(row.id);
    try {
      if (kind === "attendance" && attOtApproved(row)) {
        toast(
          locale === "en"
            ? `Attendance ${id} carries approved overtime - it cannot be deleted.`
            : `Absensi ${id} memuat lembur yang sudah disetujui - tidak bisa dihapus.`,
          "info",
        );
        setDelRow(null);
        return;
      }
      if (kind === "leaves" && String(row.status ?? "") === "Disetujui") {
        toast(
          locale === "en"
            ? `Leave ${id} is approved and already synced to attendance - reject it in SDM first.`
            : `Cuti ${id} sudah disetujui dan sudah disinkron ke absensi - tolak di SDM dulu.`,
          "info",
        );
        setDelRow(null);
        return;
      }
      await remove(kind, id);
      log("menghapus", `${kind} ${id} - ${String(emp.name)}`, "SDM");
      toast(locale === "en" ? `${id} deleted` : `${id} dihapus`);
      setDelRow(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Deskripsi konfirmasi hapus - menyebut konsekuensi yang berbeda
     per tabel supaya tidak ada tebakan. */
  const delRowDesc = (): string => {
    if (!delRow) return "";
    const { kind, row } = delRow;
    const id = String(row.id);
    if (kind === "attendance") {
      return locale === "en"
        ? "This record feeds the monthly attendance recap and, if it carries overtime, the payroll slip."
        : "Record ini masuk rekap absensi bulanan dan, bila punya lembur, jadi dasar slip payroll.";
    }
    if (kind === "leaves") {
      return locale === "en"
        ? "The leave balance returns and the synced attendance rows are left as they are - reject the leave in SDM instead."
        : "Saldo cuti akan kembali dan baris absensi hasil sinkron tidak ikut berubah - lebih baik tolak cuti di SDM.";
    }
    if (kind === "documents") {
      return locale === "en"
        ? "The file link is removed from this employee profile."
        : "Tautan berkas dilepas dari profil karyawan ini.";
    }
    return id;
  };

  return (
    <div>
      <Link to="/sdm" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> {S.btnKembali}
      </Link>
      <PageHeader
        title={String(emp.name)}
        subtitle={`${emp.id} · NIK ${String(emp.username ?? emp.id)} · ${emp.role} · ${emp.dept} · ${emp.branch}`}
        icon={<User className="h-5 w-5" />}
        actions={<StatusBadge status={String(emp.status)} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <SecureImg src={emp.photo} alt={String(emp.name)} name={String(emp.name)} className="h-14 w-14 shrink-0 rounded-full object-cover text-base" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-navy-900">{String(emp.name)}</h3>
              <p className="text-xs text-steel-500">{String(emp.role)} · {String(emp.id)}</p>
            </div>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-navy-900">{S.cardProfil}</h3>
          <dl className="dl-div mt-3 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">{S.thJabatan}</dt><dd className="font-medium text-navy-900">{String(emp.role)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.fDept}</dt><dd className="font-medium">{String(emp.dept)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.fCabang}</dt><dd className="font-medium">{String(emp.branch ?? "-")}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.dlTipe}</dt><dd><Badge tone="gray">{String(emp.tipe ?? "-")}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.dlJoin}</dt><dd className="font-medium">{fmtTanggal(String(emp.join))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.fContractEnd}</dt><dd className="font-medium">{emp.contractEnd ? fmtTanggal(String(emp.contractEnd)) : "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.dlPtkp}</dt><dd className="font-medium">{String(emp.ptkpStatus ?? "-")} · {S.tanggunganN.replace("{n}", String(Number(emp.dependents ?? 0)))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.dlBasic}</dt><dd className="font-medium">{fmtRupiah(Number(emp.basic || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.fAllow}</dt><dd className="font-medium">{fmtRupiah(sumAllowances(emp.allowances))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.dlAkun}</dt><dd className="font-medium"><AkunLogin employeeId={String(emp.id)} /></dd></div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-900">{S.cardSkill}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-navy-50 border border-navy-100 px-2.5 py-1 text-xs font-medium text-navy-800">
                {s}
                <button className="text-steel-400 hover:text-rose-600" aria-label={S.ariaHapusSkill.replace("{n}", s)} onClick={() => delSkill(s)}>×</button>
              </span>
            ))}
            {skills.length === 0 && <span className="text-xs text-steel-400">{S.emptySkill}</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input flex-1" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder={S.phSkill} />
            <AsyncButton className="btn-secondary whitespace-nowrap text-xs" onAction={saveSkill}>{S.btnTambah}</AsyncButton>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900">{S.cardCert}</h3>
            <button className="btn-secondary text-xs" onClick={() => setShowCert(true)} aria-label={S.cardCert}><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-3 space-y-2">
            {certs.map((c) => {
              const left = daysUntil(c.expires);
              return (
                <div key={c.name} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2.5 text-sm">
                  <div>
                    <p className="font-medium text-navy-900">{c.name}</p>
                    <p className="text-xs text-steel-500">{S.berlakuHingga.replace("{n}", fmtTanggal(c.expires))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {left !== null && (
                      <Badge tone={left < 0 ? "red" : left <= 30 ? "red" : left <= 90 ? "amber" : "green"}>
                        {left < 0 ? S.badgeLewat.replace("{n}", String(Math.abs(left))) : S.badgeSisaN.replace("{n}", String(left))}
                      </Badge>
                    )}
                    <button className="text-xs text-steel-400 hover:text-rose-600" aria-label={S.ariaHapusCert.replace("{n}", c.name)} onClick={() => delCert(c.name)}>{S.btnHapus}</button>
                  </div>
                </div>
              );
            })}
            {certs.length === 0 && <span className="text-xs text-steel-400">{S.emptyCert2}</span>}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900">{S.dokT.replace("{n}", String(docs.length))}</h3>
            <button className="btn-secondary text-xs" onClick={() => setShowDoc(true)}><Plus className="h-3.5 w-3.5" /> {S.btnTambah}</button>
        </div>
        {docs.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface sticky top-0 z-10">
                <tr><SortTh label={S.thId} sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thJudul} sortKey="title" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thTipe} sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.dlStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thUpdated} sortKey="updated" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={locale === "en" ? "File" : "Berkas"} sortKey="file" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{locale === "en" ? "Actions" : "Aksi"}</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {sortRows(docs, sort, (row, k) => {
                  const d = row as StoreItem;
                  switch (k) {
                    case "id": return String(d.id ?? "");
                    case "title": return String(d.title ?? "");
                    case "type": return String(d.type ?? "");
                    case "status": return String(d.status ?? "");
                    case "updated": return String(d.updated ?? "");
                    case "file": return String(d.fileUrl ?? "");
                    default: return "";
                  }
                }).map((d) => (
                  <tr key={d.id} className="hover:bg-surface">
                    <td className="td font-mono text-steel-600">{d.id}</td>
                    <td className="td font-medium text-navy-900">{d.title}</td>
                    <td className="td"><Badge tone="gray">{d.type}</Badge></td>
                    <td className="td"><StatusBadge status={String(d.status)} /></td>
                    <td className="td text-steel-600">{fmtTanggal(String(d.updated))}</td>
                    <td className="td">
                      {d.fileUrl ? (
                        <button className="text-xs font-semibold text-ocean-600 underline" onClick={() => setDocPreview(d)}>
                          {locale === "en" ? "Preview" : "Pratinjau"}
                        </button>
                      ) : (
                        <span className="text-xs text-steel-400">-</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        <button className="btn-secondary text-xs" onClick={() => openDocEdit(d)} aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${String(d.id)}`}>
                          {locale === "en" ? "Edit" : "Ubah"}
                        </button>
                        <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRow({ kind: "documents", row: d })} aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${String(d.id)}`}>
                          {locale === "en" ? "Delete" : "Hapus"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-steel-400">{S.emptyDok}</p>
        )}
      </Card>

      <div className="mt-4 card">
        <Tabs tabs={["Absensi", "Payroll", "Cuti"]} active={tab} onChange={setTab} labels={{ Absensi: S.tabAbsensi, Payroll: S.tabPayroll, Cuti: S.tabCuti2 }} />
        <div className="p-4">
          {tab === "Absensi" && (
            <div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                <input className="input pl-9 w-full" placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} value={attQ} onChange={(e) => setAttQ(e.target.value)} />
              </div>
              <div className="max-h-96 overflow-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr><SortTh label={S.thTanggal} sortKey="date" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thShift} sortKey="shift" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.dlStatus} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thJam} sortKey="jam" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thLembur} sortKey="lembur" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thKet} sortKey="ket" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">{locale === "en" ? "Actions" : "Aksi"}</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(attendanceAll.filter((a) => {
                    const needle = attQ.trim().toLowerCase();
                    if (!needle) return true;
                    return `${a.date ?? ""} ${a.shift ?? ""} ${a.status ?? ""} ${a.checkIn ?? ""} ${a.checkOut ?? ""}`.toLowerCase().includes(needle);
                  }), sort2, (row, k) => {
                    const a = row as StoreItem;
                    switch (k) {
                      case "date": return String(a.date ?? "");
                      case "shift": return String(a.shift ?? "");
                      case "status": return String(a.status ?? "");
                      case "jam": return String(a.checkIn ?? "") + "-" + String(a.checkOut ?? "");
                      case "lembur": return Number(a.overtime ?? 0);
                      case "ket": return String(a.status) === "Hadir" && String(a.checkIn ?? "") > "08:00" ? "Telat" : "";
                      default: return "";
                    }
                  }).map((a) => (
                    <tr key={a.id} className="hover:bg-surface">
                      <td className="td text-steel-600">{fmtTanggal(String(a.date))}</td>
                      <td className="td"><Badge tone="gray">{String(a.shift)}</Badge></td>
                      <td className="td"><StatusBadge status={String(a.status)} /></td>
                      <td className="td text-steel-600">{a.checkIn && a.checkOut ? `${a.checkIn}-${a.checkOut}` : "-"}</td>
                      <td className="td text-steel-600">{S.jamN.replace("{n}", String(Number(a.overtime || 0)))}</td>
                      <td className="td">{a.status === "Hadir" && String(a.checkIn) > "08:00" ? <Badge tone="red">Telat</Badge> : <span className="text-xs text-steel-400">-</span>}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1.5">
                          {attOtApproved(a) ? (
                            <span className="text-xs text-steel-400" title={locale === "en" ? "Overtime approved" : "Lembur sudah disetujui"}>
                              {locale === "en" ? "Locked" : "Terkunci"}
                            </span>
                          ) : (
                            <>
                              <button className="btn-secondary text-xs" onClick={() => openAttEdit(a)} aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${String(a.id)}`}>
                                {locale === "en" ? "Edit" : "Ubah"}
                              </button>
                              <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRow({ kind: "attendance", row: a })} aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${String(a.id)}`}>
                                {locale === "en" ? "Delete" : "Hapus"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {attendanceAll.length === 0 && <EmptyState title={S.emptyAbsenT} subtitle={S.emptyAbsenS} />}
              </div>
            </div>
          )}
          {tab === "Payroll" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr><SortTh label={S.thPeriode} sortKey="period" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thPokok} sortKey="basic" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thTunjangan} sortKey="allow" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thLembur} sortKey="overtime" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thNet} sortKey="net" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.dlStatus} sortKey="status" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thDibayar} sortKey="paid" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(payrollRows, sort3, (row, k) => {
                    const p = row as StoreItem;
                    switch (k) {
                      case "period": return String(p.period ?? "");
                      case "basic": return Number(p.basic ?? 0);
                      case "allow": return Array.isArray(p.allowances)
                        ? Number((p.allowances as unknown[]).reduce((s: number, l: unknown) => s + (Number((l as { amount?: unknown })?.amount ?? (l as unknown)) || 0), 0))
                        : Number(p.allowances ?? 0);
                      case "overtime": return Number(p.overtimePay ?? 0);
                      case "net": return Number(p.net ?? 0);
                      case "status": return String(p.status ?? "");
                      case "paid": return String(p.paidAt ?? "");
                      default: return "";
                    }
                  }).map((p) => (
                    <tr key={p.id} className="hover:bg-surface">
                      <td className="td font-medium text-navy-900">{fmtBulan(String(p.period))}</td>
                      <td className="td text-steel-600">{fmtRupiah(Number(p.basic || 0))}</td>
                      <td className="td text-steel-600">{fmtRupiah(sumAllowances(p.allowances))}</td>
                      <td className="td text-steel-600">{fmtRupiah(Number(p.overtimePay || 0))}</td>
                      <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                      <td className="td"><StatusBadge status={String(p.status)} /></td>
                      <td className="td text-steel-600">{p.paidAt ? fmtTanggal(String(p.paidAt)) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payrollRows.length === 0 && <EmptyState title={S.emptyPayrollT} subtitle={S.emptyPayrollS} />}
            </div>
          )}
          {tab === "Cuti" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr><SortTh label={S.thId} sortKey="id" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thTipe} sortKey="type" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thPeriode} sortKey="period" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thHari} sortKey="days" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.dlStatus} sortKey="status" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thCatatan} sortKey="note" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={locale === "en" ? "Attachment" : "Lampiran"} sortKey="file" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><th className="th">{locale === "en" ? "Actions" : "Aksi"}</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(leaveRows, sort4, (row, k) => {
                    const l = row as StoreItem;
                    switch (k) {
                      case "id": return String(l.id ?? "");
                      case "type": return String(l.type ?? "");
                      case "period": return String(l.from ?? "");
                      case "days": return Number(l.days ?? 0);
                      case "status": return String(l.status ?? "");
                      case "note": return String(l.note ?? "");
                      case "file": return String(l.fileUrl ?? "");
                      default: return "";
                    }
                  }).map((l) => (
                    <tr key={l.id} className="hover:bg-surface">
                      <td className="td font-mono text-steel-600">{l.id}</td>
                      <td className="td"><Badge tone="gray">{String(l.type)}</Badge></td>
                      <td className="td text-steel-600">{fmtTanggal(String(l.from))} → {fmtTanggal(String(l.to))}</td>
                      <td className="td font-semibold">{S.daysN.replace("{n}", String(Number(l.days || 0)))}</td>
                      <td className="td"><StatusBadge status={String(l.status)} /></td>
                      <td className="td text-steel-600">{String(l.note || "-")}</td>
                      <td className="td">
                        {String(l.status) === "Disetujui" ? (
                          <DocumentPreviewCell
                            doc={l.fileUrl ? {
                              title: `${String(l.type)} · ${String(l.id)}`,
                              fileUrl: String(l.fileUrl),
                            } : null}
                          />
                        ) : (
                          <span className="text-xs text-steel-400">-</span>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1.5">
                          <button className="btn-secondary text-xs" onClick={() => openLeaveEdit(l)} aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${String(l.id)}`}>
                            {locale === "en" ? "Edit" : "Ubah"}
                          </button>
                          {String(l.status) === "Disetujui" ? (
                            <span className="text-xs text-steel-400" title={locale === "en"
                              ? "Approved leave: only note and attachment can change. Reject it in SDM to delete."
                              : "Cuti disetujui: hanya catatan & lampiran yang bisa berubah. Tolak di SDM untuk menghapus."}>
                              {locale === "en" ? "Locked" : "Terkunci"}
                            </span>
                          ) : (
                            <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRow({ kind: "leaves", row: l })} aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${String(l.id)}`}>
                              {locale === "en" ? "Delete" : "Hapus"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leaveRows.length === 0 && <EmptyState title={S.emptyLeaveT} subtitle={S.emptyLeaveS} />}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showCert}
        onClose={() => setShowCert(false)}
        title={S.mAddCertT}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowCert(false)}>{S.btnBatal}</button>
            <AsyncButton className="btn-primary" onAction={saveCert}>{S.btnSimpan}</AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={S.fNamaCert}><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder={S.phNdt} /></Field>
          <Field label={S.fBerlaku}><input type="date" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={showDoc}
        onClose={() => { setShowDoc(false); setDocEdit(null); }}
        title={docEdit ? `${locale === "en" ? "Edit" : "Ubah"} ${String(docEdit.id)}` : S.mAddDocT}
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setShowDoc(false); setDocEdit(null); }}>{S.btnBatal}</button>
            <AsyncButton className="btn-primary" onAction={docEdit ? saveDocEdit : saveDoc}>{S.btnSimpan}</AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={S.fJudulDok}><input className="input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} placeholder={S.phDok} /></Field>
          <FormGrid>
            <Field label={S.thTipe}>
              <select className="input" value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })}>
                <option>Kontrak</option>
                <option>Sertifikat</option>
                <option>Identitas</option>
                <option>Lainnya</option>
              </select>
            </Field>
            <Field label={S.dlStatus}>
              <select className="input" value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}>
                <option>Berlaku</option>
                <option>Draft</option>
                <option>Kedaluwarsa</option>
              </select>
            </Field>
          </FormGrid>
          <Field label={locale === "en" ? "File URL" : "URL berkas"}>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input flex-1 font-mono" value={docForm.fileUrl} onChange={(e) => setDocForm({ ...docForm, fileUrl: e.target.value })} placeholder="https://…" />
              <FileUploadButton label={locale === "en" ? "Upload" : "Unggah"} onUploaded={(url) => setDocForm((f) => ({ ...f, fileUrl: url }))} />
            </div>
          </Field>
        </div>
      </Modal>

<DocumentPreviewModal
        doc={docPreview?.fileUrl ? {
          title: String(docPreview.title),
          fileUrl: String(docPreview.fileUrl),
          subtitle: `${String(docPreview.id)} - ${String(docPreview.type)}`,
        } : null}
        onClose={() => setDocPreview(null)}
      />

      {/* ===== Ubah absensi ===== */}
      <Modal
        open={attEdit !== null}
        onClose={() => setAttEdit(null)}
        title={locale === "en" ? "Edit attendance" : "Ubah absensi"}
        subtitle={attEdit ? `${fmtTanggal(String(attEdit.date))} - ${String(emp.name)}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setAttEdit(null)}>{S.btnBatal}</button><AsyncButton className="btn-primary" onAction={saveAttEdit}>{S.btnSimpan}</AsyncButton></>}
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thTanggal}><input type="date" className="input" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} /></Field>
            <Field label={S.thShift}>
              <select className="input" value={attForm.shift} onChange={(e) => setAttForm({ ...attForm, shift: e.target.value })}>
                <option>Pagi</option>
                <option>Siang</option>
                <option>Malam</option>
              </select>
            </Field>
            <Field label={S.dlStatus}>
              <select className="input" value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value })}>
                <option>Hadir</option>
                <option>Izin</option>
                <option>Sakit</option>
                <option>Alpha</option>
                <option>Cuti</option>
              </select>
            </Field>
            <Field label={locale === "en" ? "Overtime (hours)" : "Lembur (jam)"}>
              <input type="number" min={0} max={8} step={0.5} className="input" value={attForm.overtime} onChange={(e) => setAttForm({ ...attForm, overtime: e.target.value })} />
            </Field>
            <Field label={locale === "en" ? "Check in" : "Jam masuk"}>
              <input type="time" className="input" value={attForm.checkIn} disabled={attForm.status !== "Hadir"} onChange={(e) => setAttForm({ ...attForm, checkIn: e.target.value })} />
            </Field>
            <Field label={locale === "en" ? "Check out" : "Jam keluar"}>
              <input type="time" className="input" value={attForm.checkOut} disabled={attForm.status !== "Hadir"} onChange={(e) => setAttForm({ ...attForm, checkOut: e.target.value })} />
            </Field>
          </FormGrid>
          <p className="text-xs text-steel-500">{locale === "en"
            ? "Changing the hours sends the overtime back to unapproved so it must be re-approved."
            : "Mengubah jam membuat lembur kembali belum disetujui sehingga harus disetujui ulang."}</p>
        </div>
      </Modal>

      {/* Ubah cuti */}
      <Modal
        open={leaveEdit !== null}
        onClose={() => setLeaveEdit(null)}
        title={locale === "en" ? "Edit leave" : "Ubah cuti"}
        subtitle={leaveEdit ? String(leaveEdit.id) : ""}
        footer={<><button className="btn-secondary" onClick={() => setLeaveEdit(null)}>{S.btnBatal}</button><AsyncButton className="btn-primary" onAction={saveLeaveEdit}>{S.btnSimpan}</AsyncButton></>}
      >
        {(() => {
          const approved = String(leaveEdit?.status ?? "") === "Disetujui";
          return (
            <div className="space-y-3">
              {approved && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {locale === "en"
                    ? "This leave is approved and already synced to attendance rows. Only the note and attachment can be corrected here - reject the leave in SDM to change the period."
                    : "Cuti ini sudah disetujui dan sudah disinkron ke baris absensi. Hanya catatan dan lampiran yang bisa dikoreksi di sini - tolak cuti di SDM untuk mengubah periode."}
                </p>
              )}
              <FormGrid>
                <Field label={S.thTipe} hint={approved ? (locale === "en" ? "Locked" : "Terkunci") : undefined}>
                  <select className="input" value={leaveForm.type} disabled={approved} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}>
                    <option>Tahunan</option>
                    <option>Sakit</option>
                    <option>Izin</option>
                    <option>Cuti Mellon</option>
                    <option>Pengantin</option>
                  </select>
                </Field>
                <Field label={locale === "en" ? "Days" : "Jumlah hari"} hint={approved ? (locale === "en" ? "Locked" : "Terkunci") : undefined}>
                  <input type="number" min={0} className="input" value={leaveForm.days} disabled={approved} onChange={(e) => setLeaveForm({ ...leaveForm, days: e.target.value })} />
                </Field>
                <Field label={locale === "en" ? "From" : "Mulai"} hint={approved ? (locale === "en" ? "Locked" : "Terkunci") : undefined}>
                  <input type="date" className="input" value={leaveForm.from} disabled={approved} onChange={(e) => setLeaveForm({ ...leaveForm, from: e.target.value })} />
                </Field>
                <Field label={locale === "en" ? "To" : "Selesai"} hint={approved ? (locale === "en" ? "Locked" : "Terkunci") : undefined}>
                  <input type="date" className="input" value={leaveForm.to} disabled={approved} onChange={(e) => setLeaveForm({ ...leaveForm, to: e.target.value })} />
                </Field>
              </FormGrid>
              <Field label={S.thCatatan}><input className="input" value={leaveForm.note} onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })} /></Field>
              <Field label={locale === "en" ? "Attachment URL" : "URL lampiran"}>
                <div className="flex flex-wrap items-center gap-2">
                  <input className="input flex-1 font-mono" value={leaveForm.fileUrl} onChange={(e) => setLeaveForm({ ...leaveForm, fileUrl: e.target.value })} placeholder="https://." />
                  <FileUploadButton label={locale === "en" ? "Upload" : "Unggah"} onUploaded={(url) => setLeaveForm((f) => ({ ...f, fileUrl: url }))} />
                </div>
              </Field>
            </div>
          );
        })()}
      </Modal>

      {/* ===== Konfirmasi hapus (4 tabel) ===== */}
      <ConfirmModal
        open={delRow !== null}
        title={delRow ? `${locale === "en" ? "Delete" : "Hapus"} ${String(delRow.row.id)}?` : ""}
        desc={delRowDesc()}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelRow(null)}
        onConfirm={confirmDelRow}
      />
    </div>
  );
}
