import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Card, PageHeader, Field, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { fmtJumlah } from "../../utils/format";

export default function Settings() {
  const { data, update, log, backendMode, backendError, resync } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [setupToken, setSetupToken] = useState("");
  const [seeding, setSeeding] = useState(false);

  const importSeed = async () => {
    if (!isBackendConfigured()) { toast("Backend belum dikonfigurasi (VITE_API_URL kosong)", "info"); return; }
    if (!setupToken.trim()) { toast("Isi token setup backend dulu", "info"); return; }
    setSeeding(true);
    try {
      const r = await apiFetch<{ inserted: number; skipped: number }>("/api/admin/seed", {
        method: "POST",
        headers: { "x-setup-token": setupToken.trim() },
      });
      toast(`Seed backend: ${r.inserted} baru, ${r.skipped} sudah ada`);
      await resync().catch(() => undefined);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal mengimpor seed", "info");
    } finally {
      setSeeding(false);
    }
  };

  const groups = [...new Set((data.settings ?? []).map((s) => String(s.group ?? "Lainnya")))]

  const saveToggle = async (id: string, key: string, on: boolean) => {
    await update("settings", id, { value: on ? 1 : 0 });
    log("mengubah konstanta", `${key} → ${on ? 1 : 0}`, "Pengaturan");
    toast(`${key} ${on ? "ditampilkan" : "disembunyikan"}`);
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  };

  const isToggleKey = (key: string): boolean => key === "SHOW_3D_PROJECT" || key === "SHOW_3D_VESSEL";;

  const save = async (id: string, key: string) => {
    const raw = drafts[id];
    if (raw === undefined || raw.trim() === "") return;
    const v = Number(raw);
    const isWhatif = key.startsWith("WHATIF_");
    const min = isWhatif ? -20 : 0;
    const max = isWhatif ? 50 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(v) || v < min || v > max) { toast(isWhatif ? "Nilai What-if harus −20 s.d. 50" : "Nilai harus angka 0 atau lebih", "info"); return; }
    await update("settings", id, { value: v });
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
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${backendMode === "remote" && !backendError ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-600"}`}>
            {backendMode === "remote" && !backendError ? "Backend: tersambung" : "Backend: mode lokal"}
          </span>
          {backendError && <span className="text-[11px] text-steel-400">{backendError}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <input
              className="input w-44"
              type="password"
              placeholder="Token setup backend"
              aria-label="Token setup backend"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
            />
            <button className="btn-secondary text-xs" disabled={seeding} onClick={() => void importSeed()}>
              {seeding ? "Mengimpor…" : "Impor seed awal ke backend"}
            </button>
          </span>
        </div>
      </Card>
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
