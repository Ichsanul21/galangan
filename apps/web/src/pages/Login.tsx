import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Anchor, Lock, User, AlertCircle, ArrowRight, ArrowUpRight, Globe2, Container, ShipWheel } from "lucide-react";
import { useAuth } from "../auth/auth";
import { toast } from "../components/ui";

/* Latar peta rute abstrak — garis lintang/bujur */
function RouteGrid() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.14]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 1000">
      {Array.from({ length: 17 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="1000" stroke="#8cc9e8" strokeWidth="1" />
      ))}
      {Array.from({ length: 21 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 50} x2="800" y2={i * 50} stroke="#8cc9e8" strokeWidth="1" />
      ))}
      <path d="M -20 760 C 150 700, 260 780, 420 690 S 700 600, 840 640" fill="none" stroke="#5ec8f2" strokeWidth="2" strokeDasharray="8 7" />
      <circle cx="420" cy="690" r="5" fill="#5ec8f2" />
      <circle cx="420" cy="690" r="11" fill="none" stroke="#5ec8f2" strokeWidth="1.5" opacity="0.6" />
      <circle cx="120" cy="738" r="4" fill="#f59e0b" />
      <circle cx="690" cy="622" r="4" fill="#34d399" />
    </svg>
  );
}

/* Siluet kapal kontainer + crane pelabuhan */
function ShipScene() {
  return (
    <div className="relative mt-8 h-56 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0e4a7a] to-[#071f38]">
      <RouteGrid />
      {/* bulan */}
      <div className="absolute right-10 top-6 h-12 w-12 rounded-full bg-[#f4e9c8] opacity-90 blur-[1px]" />
      <div className="absolute right-10 top-6 h-12 w-12 rounded-full bg-gradient-to-b from-transparent to-[#071f38]/40" />
      {/* crane pelabuhan */}
      <svg className="absolute bottom-10 left-6 h-28 w-40 text-[#0b3a63]" viewBox="0 0 160 110" fill="currentColor" opacity="0.9">
        <rect x="18" y="30" width="8" height="70" />
        <rect x="52" y="30" width="8" height="70" />
        <rect x="8" y="22" width="120" height="8" rx="2" />
        <rect x="96" y="30" width="4" height="26" />
        <rect x="88" y="56" width="20" height="12" rx="1" />
        <rect x="0" y="100" width="160" height="10" />
      </svg>
      {/* kapal */}
      <motion.svg
        className="absolute bottom-8 left-1/2 w-[420px] max-w-none"
        style={{ x: "-50%" }}
        viewBox="0 0 420 150"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* kontainer */}
        <g>
          <rect x="90" y="62" width="34" height="18" rx="1.5" fill="#e11d48" />
          <rect x="126" y="62" width="34" height="18" rx="1.5" fill="#2e9ad4" />
          <rect x="162" y="62" width="34" height="18" rx="1.5" fill="#f59e0b" />
          <rect x="198" y="62" width="34" height="18" rx="1.5" fill="#1f9d55" />
          <rect x="108" y="42" width="34" height="18" rx="1.5" fill="#2e9ad4" />
          <rect x="144" y="42" width="34" height="18" rx="1.5" fill="#e11d48" />
          <rect x="180" y="42" width="34" height="18" rx="1.5" fill="#8cc9e8" />
          <rect x="126" y="22" width="34" height="18" rx="1.5" fill="#f59e0b" />
          <rect x="162" y="22" width="34" height="18" rx="1.5" fill="#1f9d55" />
        </g>
        {/* bridge */}
        <rect x="252" y="18" width="30" height="62" rx="2" fill="#e8eef4" />
        <rect x="256" y="24" width="22" height="8" rx="1" fill="#0b3a63" />
        <rect x="256" y="36" width="22" height="8" rx="1" fill="#0b3a63" />
        <rect x="256" y="48" width="22" height="8" rx="1" fill="#0b3a63" />
        <rect x="264" y="6" width="4" height="14" fill="#e8eef4" />
        <circle cx="266" cy="4" r="3" fill="#f87171" />
        {/* cerobong */}
        <rect x="292" y="40" width="20" height="40" rx="2" fill="#0b3a63" />
        <rect x="292" y="40" width="20" height="10" fill="#2e9ad4" />
        {/* lambung */}
        <path d="M40 84 L330 84 L306 128 L70 128 Z" fill="#123f63" />
        <path d="M40 84 L330 84 L326 94 L44 94 Z" fill="#e11d48" />
        <text x="120" y="114" fill="#ffffff" opacity="0.85" fontSize="15" fontWeight="700" letterSpacing="3">ISMS LINE</text>
        {/* refleksi */}
        <ellipse cx="185" cy="136" rx="130" ry="6" fill="#5ec8f2" opacity="0.25" />
      </motion.svg>
      {/* ombak */}
      <svg className="absolute bottom-0 left-0 h-10 w-full" viewBox="0 0 800 40" preserveAspectRatio="none">
        <motion.path
          d="M0 22 Q 50 10, 100 22 T 200 22 T 300 22 T 400 22 T 500 22 T 600 22 T 700 22 T 800 22 V40 H0 Z"
          fill="#0b3a63"
          opacity="0.9"
          animate={{ x: [0, -50, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      {/* label koordinat */}
      <div className="absolute left-4 top-3 flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-[#9fd4ef]">
        <Globe2 className="h-3.5 w-3.5" /> 1°15′N 103°49′E — BATAM
      </div>
      <div className="absolute right-4 top-3 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
        ● PORT OPERATIONAL
      </div>
    </div>
  );
}

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
    <div className="flex min-h-screen bg-[#06182e]">
      {/* Panel kiri — brand maritim */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b3a63] via-[#0a2c4e] to-[#06182e]" />
        <RouteGrid />
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-ocean-500/20 blur-3xl" />
        <div className="absolute -bottom-36 -left-20 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Anchor className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight tracking-tight">ISMS Galangan</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#9fd4ef]">Shipyard Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-[#cfe8f7]">
            <ShipWheel className="h-3.5 w-3.5" /> V.2026.1
          </div>
        </div>

        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9fd4ef]">
              <Container className="h-3.5 w-3.5" /> New Build · Repair · Retrofit
            </p>
            <h1 className="text-[42px] font-bold leading-[1.08] tracking-tight text-white">
              Command your
              <br />
              shipyard<span className="text-[#5ec8f2]">.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#b8d4e8]">
              Integrated Shipbuilding Management System — 13 modules covering project, drydock, inventory,
              QC, finance and vessel lifecycle. Trusted by yards in Batam & Surabaya.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.12 }}>
            <ShipScene />
          </motion.div>

          <div className="mt-5 grid grid-cols-4 gap-3">
            {[
              { v: "13", l: "Modules" },
              { v: "120m", l: "Max Dock" },
              { v: "52T", l: "Bollard Pull" },
              { v: "24/7", l: "Yard Ops" },
            ].map((s, i) => (
              <motion.div
                key={s.l}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.07 }}
                className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur"
              >
                <p className="text-xl font-bold">{s.v}</p>
                <p className="text-[10px] uppercase tracking-wider text-[#9fd4ef]">{s.l}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[11px] text-[#7ba7c4]">
          <p>© 2026 ISMS Galangan · Batam — Surabaya</p>
          <p className="flex items-center gap-3">
            <span>ISO 9001</span>
            <span className="h-3 w-px bg-white/20" />
            <span>ISM CODE</span>
            <span className="h-3 w-px bg-white/20" />
            <span>BKI CLASS</span>
          </p>
        </div>
      </div>

      {/* Panel kanan — form */}
      <div className="relative flex flex-1 items-center justify-center bg-surface p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-hero" />
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
              <p className="text-[11px] uppercase tracking-wider text-steel-500">Shipyard Management System</p>
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocean-600">Sign in to continue</p>
          <h2 className="mt-1 text-[28px] font-bold tracking-tight text-navy-900">Welcome aboard</h2>
          <p className="mt-1 text-sm text-steel-500">Access the yard control center with your crew account.</p>

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
                  placeholder="e.g. demo@galangan.com"
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
                  placeholder="e.g. password@123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </label>
            <button type="submit" className="btn-primary-gradient w-full justify-center py-2.5">
              Sign In <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>

          <div className="card mt-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">Demo access — one click sign in</p>
            <div className="mt-3">
              <button
                onClick={() => quickLogin("demo@galangan.com")}
                className="group flex w-full items-center gap-2.5 rounded-xl border border-steel-200 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-ocean-400 hover:shadow-soft"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-white">
                  DC
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-navy-900">Demo Client</span>
                  <span className="block truncate text-[11px] text-steel-500">
                    Client Viewer · <span className="font-mono">demo@galangan.com</span>
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-steel-300 transition-colors group-hover:text-ocean-500" />
              </button>
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-steel-400">demo password: password@123</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
