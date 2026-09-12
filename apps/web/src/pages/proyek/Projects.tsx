import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, Anchor, Wallet, TrendingUp, Clock } from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Badge,
  KpiCard,
  Modal,
  Field,
  FormGrid,
  toast,
} from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtMiliar, sparkRevenue } from "../../data";

const filters = ["Semua", "New Build", "Repair", "Retrofit"];

const emptyForm = {
  vessel: "",
  type: "New Build",
  client: "",
  branch: "Samarinda",
  start: "2026-08-01",
  end: "2026-12-31",
  budget: "10000000000",
  manager: "",
  scope: "",
  status: "Dalam Proses",
};

export default function Projects() {
  const { data, add } = useStore();
  const projects = data.projects;
  const [filter, setFilter] = useState("Semua");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const list = projects.filter((p) => {
    const matchType = filter === "Semua" || p.type === filter;
    const matchQ = `${p.vessel} ${p.id} ${p.client}`.toLowerCase().includes(q.toLowerCase());
    return matchType && matchQ;
  });

  const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const inProgress = projects.filter((p) => p.status !== "Selesai").length;
  const delayed = projects.filter((p) => p.status === "Terlambat").length;
  const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + Number(p.progress || 0), 0) / projects.length) : 0;

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.vessel.trim() || !form.client.trim()) { toast("Nama kapal & klien wajib diisi", "info"); return; }
    const budget = Number(form.budget) || 0;
    const vesselExists = data.vessels.some((v) => v.name.toLowerCase() === form.vessel.trim().toLowerCase());
    const created: StoreItem = add(
      "projects",
      {
        vessel: form.vessel.trim(),
        type: form.type,
        client: form.client,
        status: form.status,
        branch: form.branch,
        start: form.start,
        end: form.end,
        progress: 0,
        budget,
        actual: 0,
        manager: form.manager || "Belum ditentukan",
        scope: form.scope.split(",").map((s) => s.trim()).filter(Boolean),
      },
      { action: "membuat proyek", module: "Proyek" }
    );
    if (!vesselExists) {
      add("vessels", {
        name: form.vessel.trim(),
        imo: "IMO -",
        type: "Tugboat",
        class: "BKI",
        flag: "Indonesia",
        built: 2026,
        owner: form.client,
        loa: 0, beam: 0, draft: 0, bollard: 0,
        status: form.type === "New Build" ? "Dalam Pembangunan" : "Dalam Docking",
        certificates: [],
        history: [{ date: form.start, event: "Proyek dibuat", type: "Kontrak" }],
      }, { action: "mendaftarkan kapal", target: form.vessel.trim(), module: "Kapal" });
    }
    toast(`Proyek ${created.id} dibuat & terhubung ke kapal`);
    setForm(emptyForm);
    setShowAdd(false);
  };

  return (
    <div>
      <PageHeader
        title="Manajemen Proyek"
        subtitle="New Build, Repair & Maintenance, Retrofit"
        icon={<Anchor className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Proyek Baru</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Proyek" value={String(projects.length)} hint="Seluruh portofolio" icon={<Anchor className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
        <KpiCard label="Sedang Berjalan" value={String(inProgress)} delta={`${delayed} terlambat`} deltaDirection="down" icon={<Clock className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Nilai Kontrak" value={fmtMiliar(totalBudget)} delta="Portofolio total" deltaDirection="up" icon={<Wallet className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Rata-rata Progres" value={`${avgProgress}%`} delta="Penyelesaian umum" deltaDirection="flat" icon={<TrendingUp className="h-5 w-5" />} chip="violet" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input
            className="input pl-9 w-64"
            placeholder="Cari kapal / kode proyek..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="btn-secondary ml-auto">
          <Filter className="h-4 w-4" /> Filter
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="th">Proyek</th>
                <th className="th">Klien</th>
                <th className="th">Jenis</th>
                <th className="th">Status</th>
                <th className="th">Progres</th>
                <th className="th">Anggaran</th>
                <th className="th">Realisasi</th>
                <th className="th">PM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-surface transition-colors">
                  <td className="td">
                    <Link to={`/proyek/${p.id}`} className="block hover:text-ocean-600">
                      <p className="font-semibold text-navy-900">{p.vessel}</p>
                      <p className="text-xs text-steel-500 font-mono">{p.id}</p>
                    </Link>
                  </td>
                  <td className="td text-steel-600">{p.client}</td>
                  <td className="td">
                    <Badge tone={p.type === "New Build" ? "navy" : p.type === "Repair" ? "cyan" : "violet"}>
                      {p.type}
                    </Badge>
                  </td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.progress} className="w-20" tone={p.status === "Terlambat" ? "red" : "navy"} />
                      <span className="text-xs font-medium text-steel-600">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="td font-medium text-navy-900">{fmtMiliar(p.budget)}</td>
                  <td className="td text-steel-600">{fmtMiliar(p.actual)}</td>
                  <td className="td text-steel-600">{p.manager}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada proyek yang cocok.</p>}
        </div>
      </Card>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Proyek Baru"
        subtitle="Kapal baru otomatis terdaftar di Rekam Jejak Kapal"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button>
            <button className="btn-primary" onClick={save}>Simpan Proyek</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama kapal">
              <input className="input" list="vessel-list" placeholder="cth: TB Samudra Jaya 08" value={form.vessel} onChange={(e) => setF("vessel", e.target.value)} />
              <datalist id="vessel-list">
                {data.vessels.map((v) => <option key={v.id} value={v.name} />)}
              </datalist>
            </Field>
            <Field label="Klien">
              <select className="input" value={form.client} onChange={(e) => setF("client", e.target.value)}>
                <option value="">Pilih klien…</option>
                {data.clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Jenis proyek">
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                <option>New Build</option>
                <option>Repair</option>
                <option>Retrofit</option>
              </select>
            </Field>
            <Field label="Status awal">
              <select className="input" value={form.status} onChange={(e) => setF("status", e.target.value)}>
                <option>Dalam Proses</option>
                <option>Sedang Berjalan</option>
                <option>Tertunda</option>
              </select>
            </Field>
            <Field label="Cabang">
              <select className="input" value={form.branch} onChange={(e) => setF("branch", e.target.value)}>
                <option>Samarinda</option>
              </select>
            </Field>
            <Field label="Project manager">
              <select className="input" value={form.manager} onChange={(e) => setF("manager", e.target.value)}>
                <option value="">Pilih PM…</option>
                {data.employees.filter((e) => e.dept === "Proyek" || e.role.includes("Manager")).map((e) => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Mulai"><input type="date" className="input" value={form.start} onChange={(e) => setF("start", e.target.value)} /></Field>
            <Field label="Selesai (rencana)"><input type="date" className="input" value={form.end} onChange={(e) => setF("end", e.target.value)} /></Field>
          </FormGrid>
          <Field label="Nilai kontrak (Rp)">
            <input type="number" className="input" min={0} value={form.budget} onChange={(e) => setF("budget", e.target.value)} />
          </Field>
          <Field label="Ruang lingkup (pisahkan koma)" hint="cth: Desain, Fabrikasi Baja, Sea Trial">
            <input className="input" value={form.scope} onChange={(e) => setF("scope", e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
