import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Anchor, Lock, User, AlertCircle, ArrowRight, ShieldCheck, Database, MousePointerClick } from "lucide-react";
import { useAuth, demoUsers } from "../auth/auth";
import { toast } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = login(username, password);
    if (err) {
      setError(err);
      setShake((s) => s + 1);
      return;
    }
    toast("Selamat datang kembali!");
    navigate(from, { replace: true });
  };

  const quickLogin = (u: string) => {
    const err = login(u, "demo123");
    if (!err) {
      toast("Masuk sebagai akun demo");
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Panel kiri — branding */}
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-navy-900 p-10 text-white lg:flex">
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-ocean-500/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <Anchor className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight">ISMS Galangan</p>
            <p className="text-xs text-steel-300">Shipyard Management System</p>
          </div>
        </div>
        <div className="relative">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-bold leading-tight tracking-tight"
          >
            Kendali penuh galangan kapal dalam satu dasbor.
          </motion.h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-steel-300">
            13 modul terintegrasi — proyek, drydock, inventori, equipment, QC, keuangan, hingga rekam jejak kapal.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { v: "13", l: "Modul aktif" },
              { v: "Rp 157 M", l: "Portofolio" },
              { v: "272", l: "Pekerja" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/10 p-3 backdrop-blur">
                <p className="text-xl font-bold">{s.v}</p>
                <p className="text-[11px] text-steel-300">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-steel-300">© 2026 ISMS Galangan · Batam & Surabaya</p>
      </div>

      {/* Panel kanan — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-hero text-white">
              <Anchor className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-navy-900">ISMS Galangan</p>
              <p className="text-xs text-steel-500">Shipyard Management System</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-navy-900">Masuk ke ISMS</h2>
          <p className="mt-1 text-sm text-steel-500">
            Mode demo tanpa database — data tersimpan di sesi browser saja.
          </p>

          <motion.form
            key={shake}
            animate={shake > 0 ? { x: [0, -8, 8, -5, 5, 0] } : {}}
            transition={{ duration: 0.35 }}
            onSubmit={submit}
            className="card mt-6 space-y-4 p-6"
          >
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <label className="block">
              <span className="label">Username</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
                <input
                  className="input pl-9"
                  placeholder="cth: direktur"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </label>
            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
                <input
                  type="password"
                  className="input pl-9"
                  placeholder="cth: demo123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </label>
            <button type="submit" className="btn-primary-gradient w-full justify-center py-2.5">
              Masuk <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>

          <div className="card mt-4 p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-steel-500">
              <MousePointerClick className="h-3.5 w-3.5" /> AKUN DEMO — KLIK UNTUK MASUK LANGSUNG
            </p>
            <div className="mt-3 space-y-2">
              {demoUsers.map((u) => (
                <button
                  key={u.username}
                  onClick={() => quickLogin(u.username)}
                  className="flex w-full items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-left transition-colors hover:border-ocean-400 hover:bg-ocean-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-white">
                    {u.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy-900">{u.name}</span>
                    <span className="block text-xs text-steel-500">
                      {u.role} · <span className="font-mono">{u.username} / demo123</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-steel-400" />
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-surface p-3 text-[11px] leading-relaxed text-steel-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
              <span>
                Tanpa server & database. Sesi login tersimpan di <span className="font-mono">sessionStorage</span> dan
                hilang saat tab ditutup.
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-surface p-3 text-[11px] leading-relaxed text-steel-500">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-ocean-500" />
              <span>
                Semua data tambah/ubah antar modul tersimpan di sesi browser dan saling terhubung (proyek ↔ kapal ↔
                invoice ↔ NCR ↔ PO).
              </span>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-steel-400">
            Kembali ke <Link to="/dashboard" className="font-semibold text-ocean-600 hover:underline">halaman utama</Link> (perlu login)
          </p>
        </motion.div>
      </div>
    </div>
  );
}
