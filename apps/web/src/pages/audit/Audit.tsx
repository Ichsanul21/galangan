import { useMemo, useState } from "react";
import { Download, History } from "lucide-react";
import { Badge, Card, EmptyState, Field, KpiCard, PageHeader, SortTh, toggleSort, sortRows, toast } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import { exportExcel } from "../../utils/export";

/** Ambil YYYY-MM-DD dari string waktu bila bisa diparse; abaikan "baru saja" dan teks relatif. */
function toISODateOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s === "-" || s.toLowerCase() === "baru saja") return null;
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export default function Audit() {
  const { data } = useStore();
  const [q, setQ] = useState("");
  const [modul, setModul] = useState("SEMUA");
  const [tanggal, setTanggal] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const a of data.activities ?? []) {
      if (a.module) set.add(String(a.module));
    }
    return [...set].sort();
  }, [data.activities]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data.activities ?? []).filter((a) => {
      if (modul !== "SEMUA" && String(a.module ?? "") !== modul) return false;
      if (tanggal) {
        const iso = toISODateOrNull(a.time);
        if (iso !== tanggal) return false;
      }
      if (!query) return true;
      const hay = `${a.actor ?? ""} ${a.action ?? ""} ${a.target ?? ""} ${a.module ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [data.activities, q, modul, tanggal]);

  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const a of data.activities ?? []) {
      if (a.actor) set.add(String(a.actor));
    }
    return set.size;
  }, [data.activities]);

  const doExport = () => {
    const head = ["Waktu", "Aktor", "Aksi", "Target", "Modul"];
    const body = rows.map((a) => [
      String(a.time ?? "-"),
      String(a.actor ?? "-"),
      String(a.action ?? "-"),
      String(a.target ?? "-"),
      String(a.module ?? "-"),
    ]);
    void exportExcel([head, ...body], "jejak-audit", "Audit").then(() =>
      toast("Jejak audit diekspor ke Excel")
    );
  };

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        subtitle="Jejak audit append-only dan read-only — disimpan permanen, 10 tahun versi backend"
        icon={<History className="h-5 w-5" />}
        actions={
          <button className="btn-secondary text-xs" onClick={doExport}>
            <Download className="h-4 w-4" /> Export Excel
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total Jejak" value={String((data.activities ?? []).length)} hint="Seluruh aktivitas tercatat" chip="navy" icon={<History className="h-5 w-5" />} />
        <KpiCard label="Hasil Filter" value={String(rows.length)} hint="Sesuai pencarian saat ini" chip="teal" icon={<History className="h-5 w-5" />} />
        <KpiCard label="Aktor Unik" value={String(actors)} hint="Pengguna tercatat" chip="violet" icon={<History className="h-5 w-5" />} />
      </div>

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Cari teks">
            <input
              className="input"
              placeholder="Aktor, aksi, atau target…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="Modul">
            <select className="input" value={modul} onChange={(e) => setModul(e.target.value)}>
              <option value="SEMUA">Semua Modul</option>
              {modules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Tanggal" hint="Hanya baris bertanggal yang bisa diparse; 'baru saja' diabaikan">
            <input
              type="date"
              className="input"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-steel-100 text-left text-xs uppercase tracking-wide text-steel-400">
                <SortTh label="Waktu" sortKey="waktu" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Aktor" sortKey="aktor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Aksi" sortKey="aksi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Target" sortKey="target" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Modul" sortKey="modul" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {sortRows(rows, sort, (a, key) =>
                key === "waktu" ? String(a.time ?? "") : key === "aktor" ? String(a.actor ?? "") : key === "aksi" ? String(a.action ?? "") : key === "target" ? String(a.target ?? "") : String(a.module ?? "")
              ).map((a) => (
                <tr key={String(a.id)} className="hover:bg-surface">
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-steel-500">{String(a.time ?? "-")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-navy-900">{String(a.actor ?? "-")}</td>
                  <td className="px-3 py-2.5 text-steel-700">{String(a.action ?? "-")}</td>
                  <td className="px-3 py-2.5 font-medium text-navy-800">{String(a.target ?? "-")}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone="navy">{String(a.module ?? "-")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="Tidak ada jejak yang cocok"
              subtitle="Ubah kata kunci, modul, atau tanggal filter."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
