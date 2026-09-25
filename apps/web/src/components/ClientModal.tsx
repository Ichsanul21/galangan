// Modal tambah klien (dipakai form proyek + halaman CRM) — field & validasi
// satu pintu agar konsisten.
import { useState } from "react";
import { Field, Modal, toast } from "./ui";
import { useStore } from "../data/store";

export default function ClientModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { add } = useStore();
  const [form, setForm] = useState({
    name: "",
    fleet: "1",
    rating: "80",
    klasifikasi: "Regular",
    creditLimit: "",
    paymentTerms: "NET 30",
    branch: "",
  });  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) {
      toast("Nama klien wajib diisi", "info");
      return;
    }
    const num = (v: unknown): number => Number(v) || 0;
    try {
      const created = await add(
        "clients",
        {
          name: form.name.trim(),
          fleet: num(form.fleet) || 1,
          rating: num(form.rating) || 80,
          since: new Date().getFullYear(),
          klasifikasi: form.klasifikasi,
          creditLimit: num(form.creditLimit),
          paymentTerms: form.paymentTerms,
          currency: "IDR",
          ...(form.branch ? { branch: form.branch } : {}),
          survei: [],
        },
        { action: "mendaftarkan klien", module: "CRM" },
      );
      toast(`Klien ${created.id} ditambahkan`);
      onSaved(form.name.trim());
      onClose();
      setForm({ name: "", fleet: "1", rating: "80", klasifikasi: "Regular", creditLimit: "", paymentTerms: "NET 30", branch: "" });
    } catch {
      toast("Klien gagal disimpan — periksa kembali isian", "info");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah Klien"
      subtitle="Klasifikasi, credit limit IDR, dan payment terms"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" onClick={save}>
            Simpan
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Nama klien">
          <input className="input" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="cth: PT Bahari Baru" />
        </Field>
        <Field label="Jumlah armada">
          <input type="number" min={0} className="input" value={form.fleet} onChange={(e) => setF("fleet", e.target.value)} />
        </Field>
        <Field label="Rating (%)">
          <input type="number" max={100} className="input" value={form.rating} onChange={(e) => setF("rating", e.target.value)} />
        </Field>
        <Field label="Klasifikasi">
          <select className="input" value={form.klasifikasi} onChange={(e) => setF("klasifikasi", e.target.value)}>
            {["VIP", "Regular", "New", "Inactive"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Cabang (opsional)">
          <input className="input" value={form.branch} onChange={(e) => setF("branch", e.target.value)} placeholder="Samarinda" />
        </Field>
        <Field label="Credit limit (Rp, IDR)">
          <input type="number" min={0} className="input" value={form.creditLimit} onChange={(e) => setF("creditLimit", e.target.value)} />
        </Field>
        <Field label="Payment terms">
          <select className="input" value={form.paymentTerms} onChange={(e) => setF("paymentTerms", e.target.value)}>
            {["NET 14", "NET 30", "NET 45", "NET 60", "Termin"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
