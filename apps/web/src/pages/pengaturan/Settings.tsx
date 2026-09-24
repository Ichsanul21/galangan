import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Card, PageHeader, Field, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { fmtJumlah } from "../../utils/format";

export default function Settings() {
  const { data, update, log } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const groups = [...new Set((data.settings ?? []).map((s) => String(s.group ?? "Lainnya")))]

  const saveToggle = (id: string, key: string, on: boolean) => {
    update("settings", id, { value: on ? 1 : 0 });
    log("mengubah konstanta", `${key} → ${on ? 1 : 0}`, "Pengaturan");
    toast(`${key} ${on ? "ditampilkan" : "disembunyikan"}`);
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  };

  const isToggleKey = (key: string): boolean => key === "SHOW_3D_PROJECT" || key === "SHOW_3D_VESSEL";;

  const save = (id: string, key: string) => {
    const raw = drafts[id];
    if (raw === undefined || raw.trim() === "") return;
    const v = Number(raw);
    const isWhatif = key.startsWith("WHATIF_");
    const min = isWhatif ? -20 : 0;
    const max = isWhatif ? 50 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(v) || v < min || v > max) { toast(isWhatif ? "Nilai What-if harus −20 s.d. 50" : "Nilai harus angka 0 atau lebih", "info"); return; }
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
                {isToggleKey(String(s.key)) ? (
                  <Field label={String(s.label ?? s.key)} hint="Matikan untuk menyembunyikan modul 3D Viewer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Number(s.value) === 1}
                      onClick={() => saveToggle(String(s.id), String(s.key), Number(s.value) !== 1)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${Number(s.value) === 1 ? "bg-ocean-500" : "bg-steel-200"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${Number(s.value) === 1 ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </Field>
                ) : (
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
                )}
                <p className="mt-1 font-mono text-[11px] text-steel-400">{String(s.key)} · aktif: {fmtJumlah(Number(s.value))}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
