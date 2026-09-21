import { useMemo, useState } from "react";
import { Download, Wallet } from "lucide-react";
import {
  EmptyState,
  Field,
  FormGrid,
  KpiCard,
  Modal,
  PageHeader,
  StatusBadge,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtBulan, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";

const NEXT_STATUS: Record<string, string> = {
  Draft: "Dihitung",
  Dihitung: "Disetujui",
  Disetujui: "Dibayar",
};

/* StoreItem ber-index-signature sehingga tidak memenuhi constraint generik inBranch;
   intersection ini mempertahankan field sekaligus memuaskan constraint. */
type Branchable = StoreItem & { branch?: string };

function calcOvertimePay(basic: number, records: StoreItem[]): number {
  if (basic <= 0) return 0;
  const rate = basic / 173;
  let total = 0;
  records.forEach((a) => {
    const h = Number(a.overtime || 0);
    if (h <= 0) return;
    total += rate * (Math.min(h, 2) * 1.5 + Math.min(Math.max(h - 2, 0), 2) * 2 + Math.max(h - 4, 0) * 3);
  });
  return Math.round(total);
}

function calcComponents(basic: number, allowances: number, overtimePay: number, deductions: number) {
  const bruto = basic + allowances + overtimePay;
  const pph21 = Math.max(0, Math.round(0.05 * (bruto - 4500000)));
  const bpjsKes = Math.round(basic * 0.01);
  const bpjsTk = Math.round(basic * 0.02);
  const net = bruto - deductions - pph21 - bpjsKes - bpjsTk;
  return { bruto, pph21, bpjsKes, bpjsTk, net };
}

export default function Payroll() {
  const { data, add, update, log, inBranch } = useStore();
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [editTarget, setEditTarget] = useState<StoreItem | null>(null);
  const [editForm, setEditForm] = useState({ basic: "", allowances: "", overtimePay: "", deductions: "" });
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  const [slipTarget, setSlipTarget] = useState<StoreItem | null>(null);

  const activeEmps = useMemo(
    () => inBranch(data.employees as Branchable[]).filter((e) => e.status === "Aktif"),
    [data.employees, inBranch],
  );

  const rows = useMemo(
    () => data.payroll.filter((p) => p.period === period).sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId))),
    [data.payroll, period],
  );

  const empNameOf = (id: string): string => data.employees.find((e) => e.id === id)?.name ?? id;

  const totals = useMemo(() => {
    const bruto = rows.reduce((s, p) => s + Number(p.basic || 0) + Number(p.allowances || 0) + Number(p.overtimePay || 0), 0);
    const net = rows.reduce((s, p) => s + Number(p.net || 0), 0);
    const pph21 = rows.reduce((s, p) => s + Number(p.pph21 || 0), 0);
    const bpjs = rows.reduce((s, p) => s + Number(p.bpjsKes || 0) + Number(p.bpjsTk || 0), 0);
    return { bruto, net, pph21, bpjs };
  }, [rows]);

  const generate = () => {
    const existing = new Set(rows.map((p) => String(p.employeeId)));
    const fresh = activeEmps.filter((e) => !existing.has(e.id));
    if (fresh.length === 0) {
      toast("Semua karyawan aktif sudah punya draft periode ini", "info");
      return;
    }
    fresh.forEach((e) => {
      const basic = Number(e.basic || 0);
      const allowances = Number(e.allowances || 0);
      const recs = data.attendance.filter(
        (a) => a.employeeId === e.id && String(a.date).startsWith(period) && a.status === "Hadir",
      );
      const overtimePay = calcOvertimePay(basic, recs);
      const c = calcComponents(basic, allowances, overtimePay, 0);
      add(
        "payroll",
        {
          employeeId: e.id,
          period,
          basic,
          allowances,
          overtimePay,
          deductions: 0,
          pph21: c.pph21,
          bpjsKes: c.bpjsKes,
          bpjsTk: c.bpjsTk,
          net: c.net,
          status: "Draft",
          paidAt: "",
        },
        undefined,
      );
    });
    log("generate payroll", `${period} · ${fresh.length} draft`, "Payroll");
    toast(`${fresh.length} draft payroll ${fmtBulan(period)} dibuat`);
  };

  const advance = (p: StoreItem) => {
    const next = NEXT_STATUS[String(p.status)];
    if (!next) return;
    if (next === "Dibayar") {
      setPayTarget(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      return;
    }
    update("payroll", p.id, { status: next });
    log("memproses payroll", `${p.id} → ${next}`, "Payroll");
    toast(`${p.id} → ${next}`);
  };

  const openEdit = (p: StoreItem) => {
    setEditTarget(p);
    setEditForm({
      basic: String(p.basic ?? 0),
      allowances: String(p.allowances ?? 0),
      overtimePay: String(p.overtimePay ?? 0),
      deductions: String(p.deductions ?? 0),
    });
  };

  const saveEdit = () => {
    if (!editTarget) return;
    const basic = Number(editForm.basic);
    const allowances = Number(editForm.allowances);
    const overtimePay = Number(editForm.overtimePay);
    const deductions = Number(editForm.deductions);
    if ([basic, allowances, overtimePay, deductions].some((n) => Number.isNaN(n) || n < 0)) {
      toast("Komponen gaji harus angka valid", "info");
      return;
    }
    const c = calcComponents(basic, allowances, overtimePay, deductions);
    update("payroll", editTarget.id, { basic, allowances, overtimePay, deductions, ...c });
    toast(`${editTarget.id} diperbarui — net ${fmtRupiah(c.net)}`);
    setEditTarget(null);
  };

  const confirmPay = () => {
    if (!payTarget) return;
    if (!proof.date) {
      toast("Tanggal bayar wajib diisi", "info");
      return;
    }
    if (!proof.ref.trim()) {
      toast("No. referensi wajib diisi", "info");
      return;
    }
    update("payroll", payTarget.id, {
      status: "Dibayar",
      paidAt: proof.date,
      paidMethod: proof.method,
      paidRef: proof.ref.trim(),
    });
    log("membayar payroll", `${payTarget.id} via ${proof.method} ${proof.ref.trim()}`, "Payroll");
    toast(`${payTarget.id} dibayar — bukti tersimpan`);
    setPayTarget(null);
  };

  const exportRekap = () => {
    const head = ["ID", "Karyawan", "Periode", "Pokok", "Tunjangan", "Lembur", "Potongan", "PPh21", "BPJS Kes", "BPJS TK", "Net", "Status"];
    const body = rows.map((p) => [
      p.id,
      empNameOf(String(p.employeeId)),
      p.period,
      Number(p.basic || 0),
      Number(p.allowances || 0),
      Number(p.overtimePay || 0),
      Number(p.deductions || 0),
      Number(p.pph21 || 0),
      Number(p.bpjsKes || 0),
      Number(p.bpjsTk || 0),
      Number(p.net || 0),
      p.status,
    ]);
    void exportExcel([head, ...body], `rekap-payroll-${period}`, "Rekap");
    toast("Rekap payroll diunduh");
  };

  const exportSlip = (p: StoreItem) => {
    const head = ["Komponen", "Nilai"];
    const body = [
      ["ID", p.id],
      ["Karyawan", empNameOf(String(p.employeeId))],
      ["Periode", fmtBulan(String(p.period))],
      ["Gaji pokok", fmtRupiah(Number(p.basic || 0))],
      ["Tunjangan", fmtRupiah(Number(p.allowances || 0))],
      ["Upah lembur", fmtRupiah(Number(p.overtimePay || 0))],
      ["Potongan", fmtRupiah(Number(p.deductions || 0))],
      ["PPh 21", fmtRupiah(Number(p.pph21 || 0))],
      ["BPJS Kesehatan", fmtRupiah(Number(p.bpjsKes || 0))],
      ["BPJS Ketenagakerjaan", fmtRupiah(Number(p.bpjsTk || 0))],
      ["Gaji bersih", fmtRupiah(Number(p.net || 0))],
      ["Status", String(p.status)],
    ];
    void exportExcel([head, ...body], `slip-${p.id}`, "Slip");
    toast(`Slip ${p.id} diunduh`);
  };

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Asumsi: PPh21 = 5% x (bruto - Rp 4.500.000), min 0, bruto s.d. Rp 60 jt/bln · BPJS Kes 1% + TK 2% dari gaji pokok"
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-secondary" onClick={exportRekap}>
              <Download className="h-4 w-4" /> Export Rekap
            </button>
            <button className="btn-primary-gradient" onClick={generate}>Generate {fmtBulan(period)}</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Bruto" value={fmtRupiah(totals.bruto)} hint={`Periode ${fmtBulan(period)}`} chip="navy" />
        <KpiCard label="Total Net" value={fmtRupiah(totals.net)} hint={`${rows.length} slip`} chip="teal" />
        <KpiCard label="Total PPh21" value={fmtRupiah(totals.pph21)} hint="Progresif sederhana 5%" chip="amber" />
        <KpiCard label="Total BPJS" value={fmtRupiah(totals.bpjs)} hint="Kes 1% + TK 2%" chip="violet" />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-steel-200 p-4">
          <label className="flex items-center gap-2 text-sm text-steel-600">
            Periode
            <input type="month" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </label>
          <span className="text-xs text-steel-400">
            Lembur dari absensi bulan berjalan · tarif = pokok/173 · jam 1–2: 1,5x · jam 3–4: 2x · jam 5+: 3x
          </span>
        </div>
        <div className="overflow-x-auto p-2">
          <table className="w-full">
            <thead className="bg-surface sticky top-0 z-10">
              <tr>
                <th className="th">ID</th>
                <th className="th">Karyawan</th>
                <th className="th">Pokok</th>
                <th className="th">Tunjangan</th>
                <th className="th">Lembur</th>
                <th className="th">PPh21</th>
                <th className="th">BPJS</th>
                <th className="th">Net</th>
                <th className="th">Status</th>
                <th className="th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-surface">
                  <td className="td font-mono text-steel-600">{p.id}</td>
                  <td className="td font-medium text-navy-900">{empNameOf(String(p.employeeId))}</td>
                  <td className="td text-steel-600">{fmtRupiah(Number(p.basic || 0))}</td>
                  <td className="td text-steel-600">{fmtRupiah(Number(p.allowances || 0))}</td>
                  <td className="td text-steel-600">{fmtRupiah(Number(p.overtimePay || 0))}</td>
                  <td className="td text-steel-600">{fmtRupiah(Number(p.pph21 || 0))}</td>
                  <td className="td text-steel-600">{fmtRupiah(Number(p.bpjsKes || 0) + Number(p.bpjsTk || 0))}</td>
                  <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                  <td className="td"><StatusBadge status={String(p.status)} /></td>
                  <td className="td">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {p.status === "Draft" && (
                        <button className="text-sm font-semibold text-ocean-600 hover:underline" onClick={() => openEdit(p)}>Edit</button>
                      )}
                      {NEXT_STATUS[String(p.status)] && (
                        <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => advance(p)}>
                          {String(p.status) === "Disetujui" ? "Bayar" : `→ ${NEXT_STATUS[String(p.status)]}`}
                        </button>
                      )}
                      <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => setSlipTarget(p)}>Slip</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title={`Belum ada payroll ${fmtBulan(period)}`} subtitle="Klik Generate untuk membuat draft dari data karyawan & absensi." />}
        </div>
      </div>

      {/* ---------- modal edit draft ---------- */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit Komponen (Draft)"
        subtitle={editTarget ? `${editTarget.id} · PPh21 & BPJS dihitung ulang otomatis` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditTarget(null)}>Batal</button>
            <button className="btn-primary" onClick={saveEdit}>Simpan</button>
          </>
        }
      >
        <FormGrid>
          <Field label="Gaji pokok (Rp)"><input type="number" min="0" className="input" value={editForm.basic} onChange={(e) => setEditForm({ ...editForm, basic: e.target.value })} /></Field>
          <Field label="Tunjangan (Rp)"><input type="number" min="0" className="input" value={editForm.allowances} onChange={(e) => setEditForm({ ...editForm, allowances: e.target.value })} /></Field>
          <Field label="Upah lembur (Rp)"><input type="number" min="0" className="input" value={editForm.overtimePay} onChange={(e) => setEditForm({ ...editForm, overtimePay: e.target.value })} /></Field>
          <Field label="Potongan manual (Rp)"><input type="number" min="0" className="input" value={editForm.deductions} onChange={(e) => setEditForm({ ...editForm, deductions: e.target.value })} /></Field>
        </FormGrid>
      </Modal>

      {/* ---------- modal bayar ---------- */}
      <Modal
        open={payTarget !== null}
        onClose={() => setPayTarget(null)}
        title="Bukti Pembayaran"
        subtitle={payTarget ? `${payTarget.id} · net ${fmtRupiah(Number(payTarget.net || 0))}` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPayTarget(null)}>Batal</button>
            <button className="btn-primary" onClick={confirmPay}>Konfirmasi Bayar</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" className="input" value={proof.date} onChange={(e) => setProof({ ...proof, date: e.target.value })} /></Field>
            <Field label="Metode">
              <select className="input" value={proof.method} onChange={(e) => setProof({ ...proof, method: e.target.value })}>
                <option>Transfer</option>
                <option>Tunai</option>
                <option>Giro</option>
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi"><input className="input" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} placeholder="cth: TRF-202608-001" /></Field>
        </div>
      </Modal>

      {/* ---------- modal slip ---------- */}
      <Modal
        open={slipTarget !== null}
        onClose={() => setSlipTarget(null)}
        title="Slip Gaji"
        subtitle={slipTarget ? `${slipTarget.id} · ${empNameOf(String(slipTarget.employeeId))} · ${fmtBulan(String(slipTarget.period))}` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSlipTarget(null)}>Tutup</button>
            <button className="btn-primary" onClick={() => slipTarget && exportSlip(slipTarget)}>
              <Download className="h-4 w-4" /> Unduh Slip
            </button>
          </>
        }
      >
        {slipTarget && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">Gaji pokok</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.basic || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Tunjangan</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.allowances || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Upah lembur</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.overtimePay || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Potongan manual</dt><dd className="font-medium">−{fmtRupiah(Number(slipTarget.deductions || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">PPh 21 (5% x (bruto − 4,5 jt))</dt><dd className="font-medium">−{fmtRupiah(Number(slipTarget.pph21 || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">BPJS Kesehatan (1%)</dt><dd className="font-medium">−{fmtRupiah(Number(slipTarget.bpjsKes || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">BPJS Ketenagakerjaan (2%)</dt><dd className="font-medium">−{fmtRupiah(Number(slipTarget.bpjsTk || 0))}</dd></div>
            <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">Gaji bersih</dt><dd className="font-bold text-navy-900">{fmtRupiah(Number(slipTarget.net || 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={String(slipTarget.status)} /></dd></div>
            {slipTarget.paidAt && <div className="flex justify-between"><dt className="text-steel-500">Dibayar</dt><dd className="font-medium">{fmtTanggal(slipTarget.paidAt)}</dd></div>}
          </dl>
        )}
      </Modal>
    </div>
  );
}
