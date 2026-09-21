import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Card, PageHeader, Field, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { fmtJumlah } from "../../utils/format";

export default function Settings() {
  const { data, update, log } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const groups = [...new Set((data.settings ?? []).map((s) => String(s.group ?? "Lainnya")))];

  const save = (id: string, key: string) => {
    const raw = drafts[id];
    if (raw === undefined || raw.trim() === "") return;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) { toast("Nilai harus angka 0 atau lebih", "info"); return; }
    update("settings", id, { value: v });
    log("mengubah konstanta", `${key} → ${v}`, "Pengaturan");
    toast(`${key} disimpan`);
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  };

  return (
    <div>
      <PageHeader
        title="Pengaturan"
        subtitle="Konstanta bisnis terpusat — semua rumus membaca dari sini"
        icon={<SettingsIcon className="h-5 w-5" />}
      />
      {groups.map((g) => (
        <Card key={g} className="mb-4 p-4">
          <h3 className="mb-3 text-sm font-semibold text-navy-900">{g}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data.settings ?? []).filter((s) => String(s.group ?? "Lainnya") === g).map((s) => (
              <div key={s.id} className="rounded-xl border border-steel-100 p-3">
                <Field label={String(s.label ?? s.key)}>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      className="input"
                      value={drafts[s.id] ?? String(s.value)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    />
                    <button className="btn-secondary shrink-0 text-xs" onClick={() => save(s.id, String(s.key))}>Simpan</button>
                  </div>
                </Field>
                <p className="mt-1 font-mono text-[11px] text-steel-400">{String(s.key)} · aktif: {fmtJumlah(Number(s.value))}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
