import { createContext, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, ApiNotConfigured, apiFetch, clearJwt, isBackendConfigured, setJwt } from "../services/http";

export interface DemoUser {
  username: string;
  password: string;
  name: string;
  role: string;
  email: string;
  initials: string;
}

export const demoUsers: DemoUser[] = [
  { username: "demo@galangan.com", password: "password@123", name: "Demo Client", role: "Client Viewer", email: "demo@galangan.com", initials: "DC" },
  { username: "dev@alk.id", password: "KucingTerbang", name: "Alenkosa Dev", role: "Developer", email: "dev@alk.id", initials: "DV" },
  { username: "direktur@galangan.com", password: "direktur123", name: "Direktur Utama", role: "Direktur", email: "direktur@galangan.com", initials: "DU" },
  { username: "manager@galangan.com", password: "manager123", name: "Manager Proyek", role: "Manager", email: "manager@galangan.com", initials: "MP" },
];

/* Hak atur target & konstanta sensitif: hanya Direktur / Manager / Developer. */
export function canSetTarget(role: string | undefined | null): boolean {
  const r = String(role ?? "").toLowerCase();
  return r.includes("direktur") || r.includes("direksi") || r.includes("manager") || r.includes("developer");
}

const SESSION_KEY = "isms.session";

export interface Session {
  name: string;
  role: string;
  email: string;
  initials: string;
  username: string;
  loginAt: string;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/* Role sesi saat ini (null bila belum login). Perilaku: baca sesi yang sama
   dengan yang dipakai AuthProvider — tidak mengubah kebiasaan rolecheck. */
export function getRole(): string | null {
  return loadSession()?.role ?? null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] as string;
  const last = parts.length > 1 ? (parts[parts.length - 1] as string) : "";
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
}

interface BackendLoginUser {
  id?: string;
  username?: string;
  name?: string;
  role?: string;
  email?: string;
}

interface AuthCtx {
  user: Session | null;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, login: async () => "Belum siap", logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session | null>(() => loadSession());

  const login = async (username: string, password: string): Promise<string | null> => {
    const uname = username.trim();
    if (isBackendConfigured()) {
      try {
        const res = await apiFetch<{ token: string; user: BackendLoginUser }>(`/api/auth/login`, {
          method: "POST",
          body: JSON.stringify({ username: uname, password }),
        });
        setJwt(res.token);
        const bu = res.user ?? {};
        const session: Session = {
          name: bu.name || bu.username || uname,
          role: bu.role || "Client Viewer",
          email: bu.email || "",
          initials: initialsOf(bu.name || bu.username || uname),
          username: bu.username || uname,
          loginAt: new Date().toISOString(),
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        setUser(session);
        return null;
      } catch (err) {
        // Backend tak terjangkau / belum dikonfigurasi → lanjut ke demo lokal.
        if (err instanceof ApiNotConfigured || (err instanceof ApiError && err.status === 0)) {
          /* fall through */
        } else if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
          return "Username atau password salah. Hubungi administrator untuk akses.";
        } else {
          return err instanceof Error && err.message ? err.message : "Login backend gagal.";
        }
      }
    }
    const found = demoUsers.find(
      (u) => u.username.toLowerCase() === uname.toLowerCase() && u.password === password
    );
    if (!found) return "Username atau password salah. Hubungi administrator untuk akses.";
    const session: Session = {
      name: found.name,
      role: found.role,
      email: found.email,
      initials: found.initials,
      username: found.username,
      loginAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return null;
  };

  const logout = () => {
    clearJwt();
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
