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

/* Deskripsi awam per konstanta: dampak (dipakai di mana) + contoh.
   Kunci = settings.key. Fallback generik bila key baru belum terdaftar. */
interface ConstInfo { dampak: string; contoh: string; impact: string; example: string }
const CONST_INFO: Record<string, ConstInfo> = {
  PPN_RATE: { dampak: "Pajak % yang ditambahkan ke hutang-belanja & laporan.", contoh: "cth: belanja Rp 100 jt → PPN Rp 12 jt.", impact: "Tax % added to payables & reports.", example: "e.g. Rp 100 M spend → Rp 12 M VAT." },
  PPN_INVOICE_RATE: { dampak: "Pajak invoice jasa+material; DPP dihitung TOTAL×11/12.", contoh: "cth: invoice Rp 120 jt → DPP Rp 110 jt.", impact: "Service+material invoice tax; DPP = TOTAL×11/12.", example: "e.g. Rp 120 M invoice → Rp 110 M DPP." },
  PPH_JASA_RATE: { dampak: "Potongan % dari nilai jasa pada invoice.", contoh: "cth: jasa Rp 50 jt → potong Rp 1 jt.", impact: "Withholding % on service value in invoices.", example: "e.g. Rp 50 M service → Rp 1 M cut." },
  PPH_SUBKON_DEFAULT: { dampak: "Potongan default tiap pembayaran subkontraktor (0.5/2).", contoh: "cth: 0.5 = setengah persen.", impact: "Default cut on each subcontractor payment (0.5/2).", example: "e.g. 0.5 = half a percent." },
  PPH23_RATE: { dampak: "Pajak jasa % pada laporan & hutang.", contoh: "cth: jasa Rp 10 jt → PPh Rp 200 rb.", impact: "Service tax % in reports & payables.", example: "e.g. Rp 10 M service → Rp 200 K tax." },
  PPH21_T1_RATE: { dampak: "Tarif lapis 1 pajak gaji karyawan.", contoh: "cth: 5 untuk 5%.", impact: "Tier-1 employee income tax rate.", example: "e.g. 5 means 5%." },
  PPH21_T1_MAX: { dampak: "Batas atas penghasilan kena tarif lapis 1 (Rp/thn).", contoh: "cth: 60000000 = Rp 60 jt.", impact: "Upper limit for tier-1 rate (Rp/year).", example: "e.g. 60000000 = Rp 60 M." },
  PPH21_T2_RATE: { dampak: "Tarif lapis 2 pajak gaji karyawan.", contoh: "cth: 15 untuk 15%.", impact: "Tier-2 employee income tax rate.", example: "e.g. 15 means 15%." },
  PPH21_T2_MAX: { dampak: "Batas atas penghasilan kena tarif lapis 2 (Rp/thn).", contoh: "cth: 250000000 = Rp 250 jt.", impact: "Upper limit for tier-2 rate (Rp/year).", example: "e.g. 250000000 = Rp 250 M." },
  PPH21_T3_RATE: { dampak: "Tarif lapis 3 pajak gaji karyawan.", contoh: "cth: 25 untuk 25%.", impact: "Tier-3 employee income tax rate.", example: "e.g. 25 means 25%." },
  PPH21_T3_MAX: { dampak: "Batas atas penghasilan kena tarif lapis 3 (Rp/thn).", contoh: "cth: 500000000 = Rp 500 jt.", impact: "Upper limit for tier-3 rate (Rp/year).", example: "e.g. 500000000 = Rp 500 M." },
  PPH21_T4_RATE: { dampak: "Tarif lapis tertinggi pajak gaji karyawan.", contoh: "cth: 30 untuk 30%.", impact: "Top-tier employee income tax rate.", example: "e.g. 30 means 30%." },
  PTKP_TK0: { dampak: "Penghasilan tidak kena pajak TK/0 (Rp/thn).", contoh: "cth: 54000000 = Rp 54 jt.", impact: "Tax-free income TK/0 (Rp/year).", example: "e.g. 54000000 = Rp 54 M." },
  PTKP_K0: { dampak: "Penghasilan tidak kena pajak K/0 (Rp/thn).", contoh: "cth: 58500000 = Rp 58,5 jt.", impact: "Tax-free income K/0 (Rp/year).", example: "e.g. 58500000 = Rp 58.5 M." },
  PTKP_TANGGUNGAN: { dampak: "Tambahan tidak kena pajak per tanggungan, maks 3 (Rp/thn).", contoh: "cth: 4500000 × 2 anak.", impact: "Extra tax-free amount per dependent, max 3 (Rp/year).", example: "e.g. 4500000 × 2 children." },
  BPJS_KES_KAR: { dampak: "Potongan BPJS Kesehatan dari gaji karyawan (%).", contoh: "cth: 1 untuk 1%.", impact: "Health insurance cut from salary (%).", example: "e.g. 1 means 1%." },
  BPJS_KES_PER: { dampak: "Iuran BPJS Kesehatan ditanggung perusahaan (%).", contoh: "cth: 4 untuk 4%.", impact: "Health insurance paid by company (%).", example: "e.g. 4 means 4%." },
  BPJS_TK_KAR: { dampak: "Potongan BPJS JHT dari gaji karyawan (%).", contoh: "cth: 2 untuk 2%.", impact: "Pension cut from salary (%).", example: "e.g. 2 means 2%." },
  OVERTIME_DIV: { dampak: "Pembagi upah untuk tarif lembur per jam.", contoh: "cth: gaji ÷ 173 = tarif/jam.", impact: "Wage divisor for hourly overtime rate.", example: "e.g. salary ÷ 173 = hourly rate." },
  PO_KECIL_LIMIT: { dampak: "PO di bawah nilai ini ikut alur PO Kecil (Rp).", contoh: "cth: 50000000 = Rp 50 jt.", impact: "POs below this use the small-PO flow (Rp).", example: "e.g. 50000000 = Rp 50 M." },
  APPROVE_INVOICE: { dampak: "Invoice di atas nilai ini wajib disetujui Direktur (Rp).", contoh: "cth: 5000000 = Rp 5 jt.", impact: "Invoices above this need Director approval (Rp).", example: "e.g. 5000000 = Rp 5 M." },
  APPROVE_TERMIN: { dampak: "Termin di atas nilai ini wajib disetujui Direktur (Rp).", contoh: "cth: 2000000 = Rp 2 jt.", impact: "Progress claims above this need Director approval (Rp).", example: "e.g. 2000000 = Rp 2 M." },
  APPROVE_PO: { dampak: "PO di atas nilai ini wajib disetujui Direktur (Rp).", contoh: "cth: 1000000 = Rp 1 jt.", impact: "POs above this need Director approval (Rp).", example: "e.g. 1000000 = Rp 1 M." },
  ALERT_BUDGET_PCT: { dampak: "Peringatan saat serapan budget melewati % ini.", contoh: "cth: 80 = waspada di 80%.", impact: "Warning when budget absorption passes this %.", example: "e.g. 80 = warn at 80%." },
  ALERT_OVERRUN_PCT: { dampak: "Peringatan saat biaya melewati budget lebih dari % ini.", contoh: "cth: 10 = waspada di +10%.", impact: "Warning when cost exceeds budget by this %.", example: "e.g. 10 = warn at +10%." },
  ALERT_CERT_DAYS: { dampak: "Sertifikat kapal diingatkan H- sekian hari.", contoh: "cth: 90 = ingat 90 hari sebelum mati.", impact: "Vessel certificates reminded this many days ahead.", example: "e.g. 90 = remind 90 days before expiry." },
  ALERT_CERT_60: { dampak: "Batas kuning peringatan sertifikat (hari).", contoh: "cth: 60 = kuning di H-60.", impact: "Yellow certificate warning threshold (days).", example: "e.g. 60 = yellow at 60 days out." },
  ALERT_CERT_30: { dampak: "Batas merah peringatan sertifikat (hari).", contoh: "cth: 30 = merah di H-30.", impact: "Red certificate warning threshold (days).", example: "e.g. 30 = red at 30 days out." },
  ALERT_MILESTONE_DAYS: { dampak: "Milestone WBS diingatkan H- sekian hari.", contoh: "cth: 7 = ingat seminggu sebelum.", impact: "WBS milestones reminded this many days ahead.", example: "e.g. 7 = remind a week ahead." },
  ALERT_CP_DAYS: { dampak: "Toleransi keterlambatan jalur kritis (hari).", contoh: "cth: 3 = waspada bila telat > 3 hari.", impact: "Critical-path delay tolerance (days).", example: "e.g. 3 = warn if late > 3 days." },
  CUTI_JATAH: { dampak: "Jatah cuti tahunan tiap karyawan (hari).", contoh: "cth: 12 = 12 hari/tahun.", impact: "Annual leave quota per employee (days).", example: "e.g. 12 = 12 days/year." },
  WHATIF_GROWTH: { dampak: "Simulasi pertumbuhan pasar di Analytics, menggeser forecast (%).", contoh: "cth: 10 = forecast naik ~10%.", impact: "Market-growth simulation in Analytics, shifts forecast (%).", example: "e.g. 10 = forecast up ~10%." },
  WHATIF_COST: { dampak: "Simulasi kenaikan biaya, menekan margin (%).", contoh: "cth: 5 = margin turun ~1,5 poin.", impact: "Cost simulation, squeezes margin (%).", example: "e.g. 5 = margin down ~1.5 pts." },
  WHATIF_PROG: { dampak: "Simulasi percepatan progres, menggeser forecast (%).", contoh: "cth: -10 s.d. 50.", impact: "Progress simulation, shifts forecast (%).", example: "e.g. -10 to 50." },
  SHOW_3D_PROJECT: { dampak: "Tampilkan/sembunyikan 3D Viewer di modul Proyek (0/1).", contoh: "cth: 1 = tampil.", impact: "Show/hide the 3D viewer in Projects (0/1).", example: "e.g. 1 = show." },
  SHOW_3D_VESSEL: { dampak: "Tampilkan/sembunyikan 3D Viewer di modul Kapal (0/1).", contoh: "cth: 1 = tampil.", impact: "Show/hide the 3D viewer in Vessels (0/1).", example: "e.g. 1 = show." },
};

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
        <h3 className="text-sm font-semibold text-navy-900">{S.adminOps}</h3>
        <p className="mb-3 text-xs text-steel-500">{S.adminOpsSub}</p>
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
      <div className="mb-3">
        <h2 className="text-base font-bold text-navy-900">{S.bizConsts}</h2>
        <p className="text-xs text-steel-500">{S.bizConstsSub}</p>
      </div>
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
                <p className="mt-1 text-[11px] leading-relaxed text-steel-500">
                  {(() => {
                    const info = CONST_INFO[String(s.key)];
                    if (!info) return locale === "en" ? "Business constant used by app formulas." : "Konstanta bisnis yang dipakai rumus aplikasi.";
                    return locale === "en" ? `${info.impact} ${info.example}` : `${info.dampak} ${info.contoh}`;
                  })()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
