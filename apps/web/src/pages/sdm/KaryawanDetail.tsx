import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, User } from "lucide-react";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtBulan, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";

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
  const { data, add, update, log } = useStore();
  const [tab, setTab] = useState("Absensi");
  const [skillInput, setSkillInput] = useState("");
  const [showCert, setShowCert] = useState(false);
  const [certForm, setCertForm] = useState({ name: "", expires: todayISO().slice(0, 7) });
  const [showDoc, setShowDoc] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", type: "Kontrak", status: "Berlaku" });

  const emp = useMemo(() => data.employees.find((e) => e.id === id), [data.employees, id]);

  const attendance30 = useMemo(() => {
    if (!emp) return [];
    return data.attendance
      .filter((a) => a.employeeId === emp.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 30);
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
    return data.documents.filter((d) => d.owner === emp.name);
  }, [data.documents, emp]);

  if (!emp) {
    return (
      <div>
        <Link to="/sdm" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Kembali ke SDM
        </Link>
        <EmptyState title="Karyawan tidak ditemukan" subtitle="ID tidak cocok dengan data sesi berjalan." />
      </div>
    );
  }

  const certs = normCerts(emp);
  const skills = getSkills(emp);

  const saveSkill = () => {
    const extra = skillInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (extra.length === 0) {
      toast("Isi minimal satu skill", "info");
      return;
    }
    const lower = new Set(skills.map((s) => s.toLowerCase()));
    const merged = [...skills];
    for (const s of extra) {
      if (!lower.has(s.toLowerCase())) { merged.push(s); lower.add(s.toLowerCase()); }
    }
    update("employees", emp.id, { skills: merged });
    log("memperbarui skill karyawan", emp.id, "SDM");
    setSkillInput("");
    toast("Skill karyawan diperbarui");
  };

  const delSkill = (name: string) => {
    update("employees", emp.id, { skills: skills.filter((s) => s !== name) });
    log("menghapus skill karyawan", `${emp.id} · ${name}`, "SDM");
    toast(`Skill ${name} dihapus`, "info");
  };

  const delCert = (name: string) => {
    update("employees", emp.id, { certs: certs.filter((c) => c.name !== name) });
    log("menghapus sertifikat karyawan", `${emp.id} · ${name}`, "SDM");
    toast(`Sertifikat ${name} dihapus`, "info");
  };

  const saveCert = () => {
    if (!certForm.name.trim() || !certForm.expires) {
      toast("Nama sertifikat & berlaku hingga wajib diisi", "info");
      return;
    }
    const next = [...certs, { name: certForm.name.trim(), expires: certForm.expires }];
    update("employees", emp.id, { certs: next });
    log("menambah sertifikat karyawan", emp.id, "SDM");
    setCertForm({ name: "", expires: todayISO().slice(0, 7) });
    setShowCert(false);
    toast("Sertifikat ditambahkan");
  };

  const saveDoc = () => {
    if (!docForm.title.trim()) {
      toast("Judul dokumen wajib diisi", "info");
      return;
    }
    const created = add(
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
      },
      { action: "menambah dokumen karyawan", module: "SDM" },
    );
    toast(`Dokumen ${created.id} ditambahkan`);
    setShowDoc(false);
    setDocForm({ title: "", type: "Kontrak", status: "Berlaku" });
  };

  return (
    <div>
      <Link to="/sdm" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke SDM
      </Link>
      <PageHeader
        title={String(emp.name)}
        subtitle={`${emp.id} · NIK ${String(emp.username ?? emp.id)} · ${emp.role} · ${emp.dept} · ${emp.branch}`}
        icon={<User className="h-5 w-5" />}
        actions={<StatusBadge status={String(emp.status)} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-900">Profil & Kontrak</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">Jabatan</dt><dd className="font-medium text-navy-900">{String(emp.role)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Departemen</dt><dd className="font-medium">{String(emp.dept)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Cabang</dt><dd className="font-medium">{String(emp.branch ?? "-")}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Tipe</dt><dd><Badge tone="gray">{String(emp.tipe ?? "-")}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Bergabung</dt><dd className="font-medium">{fmtTanggal(String(emp.join))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Akhir kontrak</dt><dd className="font-medium">{emp.contractEnd ? fmtTanggal(String(emp.contractEnd)) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">PTKP</dt><dd className="font-medium">{String(emp.ptkpStatus ?? "-")} · {Number(emp.dependents ?? 0)} tanggungan</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Gaji pokok</dt><dd className="font-medium">{fmtRupiah(Number(emp.basic || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Tunjangan</dt><dd className="font-medium">{fmtRupiah(Number(emp.allowances || 0))}</dd></div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-900">Skill</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-navy-50 border border-navy-100 px-2.5 py-1 text-xs font-medium text-navy-800">
                {s}
                <button className="text-steel-400 hover:text-rose-600" aria-label={`Hapus skill ${s}`} onClick={() => delSkill(s)}>×</button>
              </span>
            ))}
            {skills.length === 0 && <span className="text-xs text-steel-400">Belum ada skill tercatat.</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input flex-1" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Tambah skill, pisahkan koma" />
            <button className="btn-secondary whitespace-nowrap text-xs" onClick={saveSkill}>Tambah</button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900">Sertifikat</h3>
            <button className="btn-secondary text-xs" onClick={() => setShowCert(true)}><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-3 space-y-2">
            {certs.map((c) => {
              const left = daysUntil(c.expires);
              return (
                <div key={c.name} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2.5 text-sm">
                  <div>
                    <p className="font-medium text-navy-900">{c.name}</p>
                    <p className="text-xs text-steel-500">Berlaku hingga {fmtTanggal(c.expires)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {left !== null && (
                      <Badge tone={left < 0 ? "red" : left <= 30 ? "red" : left <= 90 ? "amber" : "green"}>
                        {left < 0 ? `Lewat ${Math.abs(left)} hari` : `Sisa ${left} hari`}
                      </Badge>
                    )}
                    <button className="text-xs text-steel-400 hover:text-rose-600" aria-label={`Hapus sertifikat ${c.name}`} onClick={() => delCert(c.name)}>Hapus</button>
                  </div>
                </div>
              );
            })}
            {certs.length === 0 && <span className="text-xs text-steel-400">Belum ada sertifikat tercatat.</span>}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900">Dokumen ({docs.length})</h3>
          <button className="btn-secondary text-xs" onClick={() => setShowDoc(true)}><Plus className="h-3.5 w-3.5" /> Tambah</button>
        </div>
        {docs.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface sticky top-0 z-10">
                <tr><th className="th">ID</th><th className="th">Judul</th><th className="th">Tipe</th><th className="th">Status</th><th className="th">Diperbarui</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-surface">
                    <td className="td font-mono text-steel-600">{d.id}</td>
                    <td className="td font-medium text-navy-900">{d.title}</td>
                    <td className="td"><Badge tone="gray">{d.type}</Badge></td>
                    <td className="td"><StatusBadge status={String(d.status)} /></td>
                    <td className="td text-steel-600">{fmtTanggal(String(d.updated))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-steel-400">Belum ada dokumen untuk karyawan ini.</p>
        )}
      </Card>

      <div className="mt-4 card">
        <Tabs tabs={["Absensi", "Payroll", "Cuti"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Absensi" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr><th className="th">Tanggal</th><th className="th">Shift</th><th className="th">Status</th><th className="th">Jam</th><th className="th">Lembur</th><th className="th">Ket.</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {attendance30.map((a) => (
                    <tr key={a.id} className="hover:bg-surface">
                      <td className="td text-steel-600">{fmtTanggal(String(a.date))}</td>
                      <td className="td"><Badge tone="gray">{String(a.shift)}</Badge></td>
                      <td className="td"><StatusBadge status={String(a.status)} /></td>
                      <td className="td text-steel-600">{a.checkIn && a.checkOut ? `${a.checkIn}–${a.checkOut}` : "—"}</td>
                      <td className="td text-steel-600">{Number(a.overtime || 0)} jam</td>
                      <td className="td">{a.status === "Hadir" && String(a.checkIn) > "08:00" ? <Badge tone="red">Telat</Badge> : <span className="text-xs text-steel-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {attendance30.length === 0 && <EmptyState title="Belum ada riwayat absensi" subtitle="Catat lewat halaman Absensi." />}
            </div>
          )}
          {tab === "Payroll" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr><th className="th">Periode</th><th className="th">Pokok</th><th className="th">Tunjangan</th><th className="th">Lembur</th><th className="th">Net</th><th className="th">Status</th><th className="th">Dibayar</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {payrollRows.map((p) => (
                    <tr key={p.id} className="hover:bg-surface">
                      <td className="td font-medium text-navy-900">{fmtBulan(String(p.period))}</td>
                      <td className="td text-steel-600">{fmtRupiah(Number(p.basic || 0))}</td>
                      <td className="td text-steel-600">{fmtRupiah(Number(p.allowances || 0))}</td>
                      <td className="td text-steel-600">{fmtRupiah(Number(p.overtimePay || 0))}</td>
                      <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                      <td className="td"><StatusBadge status={String(p.status)} /></td>
                      <td className="td text-steel-600">{p.paidAt ? fmtTanggal(String(p.paidAt)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payrollRows.length === 0 && <EmptyState title="Belum ada riwayat payroll" subtitle="Generate lewat halaman Payroll." />}
            </div>
          )}
          {tab === "Cuti" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr><th className="th">ID</th><th className="th">Tipe</th><th className="th">Periode</th><th className="th">Hari</th><th className="th">Status</th><th className="th">Catatan</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {leaveRows.map((l) => (
                    <tr key={l.id} className="hover:bg-surface">
                      <td className="td font-mono text-steel-600">{l.id}</td>
                      <td className="td"><Badge tone="gray">{String(l.type)}</Badge></td>
                      <td className="td text-steel-600">{fmtTanggal(String(l.from))} → {fmtTanggal(String(l.to))}</td>
                      <td className="td font-semibold">{Number(l.days || 0)} hari</td>
                      <td className="td"><StatusBadge status={String(l.status)} /></td>
                      <td className="td text-steel-600">{String(l.note || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leaveRows.length === 0 && <EmptyState title="Belum ada riwayat cuti" subtitle="Ajukan lewat halaman SDM." />}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showCert}
        onClose={() => setShowCert(false)}
        title="Tambah Sertifikat"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowCert(false)}>Batal</button>
            <button className="btn-primary" onClick={saveCert}>Simpan</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nama sertifikat"><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="cth: NDT Level II" /></Field>
          <Field label="Berlaku hingga"><input type="month" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={showDoc}
        onClose={() => setShowDoc(false)}
        title="Tambah Dokumen"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowDoc(false)}>Batal</button>
            <button className="btn-primary" onClick={saveDoc}>Simpan</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Judul dokumen"><input className="input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} placeholder="cth: PKWT 2026" /></Field>
          <FormGrid>
            <Field label="Tipe">
              <select className="input" value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })}>
                <option>Kontrak</option>
                <option>Sertifikat</option>
                <option>Identitas</option>
                <option>Lainnya</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}>
                <option>Berlaku</option>
                <option>Draft</option>
                <option>Kedaluwarsa</option>
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>
    </div>
  );
}
