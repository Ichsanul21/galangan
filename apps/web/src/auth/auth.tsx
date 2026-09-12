import { createContext, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

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
];

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

interface AuthCtx {
  user: Session | null;
  login: (username: string, password: string) => string | null;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, login: () => "Belum siap", logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session | null>(() => loadSession());

  const login = (username: string, password: string): string | null => {
    const found = demoUsers.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
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
