import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Loader2 } from "lucide-react";
import { Card, PageHeader, Field, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_roles } from "../../i18n/n_roles";
import { useAuth } from "../../auth/auth";
import { canWriteSettings } from "../../auth/auth";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { fmtJumlah } from "../../utils/format";

export default function Settings() {
  const { locale } = useT();
  const S = n_roles[locale];
  const { data, update, log, backendMode, backendError, resync } = useStore();
  const { user } = useAuth();
  // Tulis settings ditolak BE (403) kecuali direktur/developer - kunci di UI
  // agar toast "disimpan" tidak berbohong.
  const canWrite = backendMode !== "remote" || canWriteSettings(user?.role);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [setupToken, setSetupToken] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedSecs, setSeedSecs] = useState(0);

  // Timer jujur: endpoint one-shot tanpa progress event, jadi tampilkan
  // spinner + detik berjalan (BUKAN persen palsu).
  useEffect(() => {
    if (!seeding) return;
    setSeedSecs(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setSeedSecs(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [seeding]);

  const importSeed = async () => {
    if (!isBackendConfigured()) { toast(S.noBackend, "info"); return; }
    if (!setupToken.trim()) { toast(S.needToken, "info"); return; }
    setSeeding(true);
    try {
      const r = await apiFetch<{ inserted: number; skipped: number }>("/api/admin/seed", {
        method: "POST",
        headers: { "x-setup-token": setupToken.trim() },
      });
      toast(S.seedDone.replace("{a}", String(r.inserted)).replace("{b}", String(r.skipped)));
      await resync().catch(() => undefined);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.seedFail, "info");
    } finally {
      setSeeding(false);
    }
  };

  const groups = [...new Set((data.settings ?? []).map((s) => String(s.group ?? S.otherGroup)))]

  const saveToggle = async (id: string, key: string, on: boolean) => {
    if (!canWrite) { toast(S.noWriteConst, "info"); return; }
    try {
    await update("settings", id, { value: on ? 1 : 0 });
    log("mengubah konstanta", `${key} → ${on ? 1 : 0}`, "Pengaturan");
    toast((on ? S.shownKey : S.hiddenKey).replace("{n}", key));
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const isToggleKey = (key: string): boolean => key === "SHOW_3D_PROJECT" || key === "SHOW_3D_VESSEL";;

  const save = async (id: string, key: string) => {
    if (!canWrite) { toast(S.noWriteConst, "info"); return; }
    const raw = drafts[id];
    if (raw === undefined || raw.trim() === "") return;
    const v = Number(raw);
    const isWhatif = key.startsWith("WHATIF_");
    const min = isWhatif ? -20 : 0;
    const max = isWhatif ? 50 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(v) || v < min || v > max) { toast(isWhatif ? S.whatifRange : S.minZero, "info"); return; }
    try {
    await update("settings", id, { value: v });
    log("mengubah konstanta", `${key} → ${v}`, "Pengaturan");
    toast(S.savedKey.replace("{n}", key));
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  return (
    <div>
      <PageHeader
        title={S.setTitle}
        subtitle={S.setSubtitle}
        icon={<SettingsIcon className="h-5 w-5" />}
      />
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${backendMode === "remote" && !backendError ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-600"}`}>
            {backendMode === "remote" && !backendError ? S.backendConnected : S.backendLocal}
          </span>
          {!canWrite && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              {S.readOnlyRole}
            </span>
          )}
          {backendError && <span className="text-[11px] text-steel-400">{backendError}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <input
              className="input w-44"
              type="password"
              placeholder={S.tokenPh}
              aria-label={S.tokenPh}
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
            />
            <button className="btn-secondary text-xs" disabled={seeding} onClick={() => void importSeed()}>
              {seeding ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {S.importing}… {seedSecs}{locale === "en" ? "s" : " dtk"}
                </span>
              ) : (
                S.importSeedBtn
              )}
            </button>
          </span>
        </div>
      </Card>
      {groups.map((g) => (
        <Card key={g} className="mb-4 p-4">
          <h3 className="mb-3 text-sm font-semibold text-navy-900">{g}</h3>
          {g === "Pajak" && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {S.taxNote}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data.settings ?? []).filter((s) => String(s.group ?? S.otherGroup) === g).map((s) => (
              <div key={s.id} className="rounded-xl border border-steel-100 p-3">
                {isToggleKey(String(s.key)) ? (
                  <Field label={String(s.label ?? s.key)} hint={S.toggle3dHint}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Number(s.value) === 1}
                      disabled={!canWrite}
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
                    <button className="btn-secondary shrink-0 text-xs" disabled={!canWrite} onClick={() => save(s.id, String(s.key))}>{S.save}</button>
                  </div>
                </Field>
                )}
                <p className="mt-1 font-mono text-[11px] text-steel-400">{String(s.key)} · {S.activeState}: {fmtJumlah(Number(s.value))}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
