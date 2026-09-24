import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/auth";

const WM_IDS = ["isms-wm-1", "isms-wm-2"];
const PRINT_ID = "isms-wm-print";

/* ---------- info perangkat (tanpa izin khusus) ---------- */

function parseDevice(): string {
  const ua = navigator.userAgent;
  let os = "Unknown OS";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let br = "Browser";
  if (/Edg\//i.test(ua)) br = "Edge";
  else if (/Chrome\//i.test(ua)) br = "Chrome";
  else if (/Firefox\//i.test(ua)) br = "Firefox";
  else if (/Safari\//i.test(ua)) br = "Safari";
  return `${os} · ${br}`;
}

/* ---------- format waktu GMT+8 (Asia/Makassar) ---------- */

function fmtWita(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${parts} WITA`;
}

/* ---------- Geo-IP (IP + kota + negara sekaligus) ---------- */

interface Geo {
  ip: string;
  city: string;
  country: string;
}

async function fetchGeo(signal: AbortSignal): Promise<Geo> {
  const res = await fetch("https://ipapi.co/json/", { signal });
  if (!res.ok) throw new Error("geo fail");
  const j = (await res.json()) as Record<string, unknown>;
  return {
    ip: String(j.ip ?? "?"),
    city: String(j.city ?? ""),
    country: String(j.country_code ?? j.country_name ?? ""),
  };
}

/* ---------- tile SVG watermark ---------- */

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tileUri(lines: string[]): string {
  const W = 1300;
  const H = 400;
  const texts = lines
    .map(
      (t, i) => {
        const yBase = i === 0 ? H / 2 - 14 : H / 2 + 14;
        const fw = i === 0 ? "800" : "700";
        const fs = i === 0 ? "18" : "14";
        return `<text x="${W / 2}" y="${yBase}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fs}" font-weight="${fw}" fill="rgba(11,58,99,0.07)" letter-spacing="0.5">${escapeXml(t)}</text>`;
      }
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="rotate(-18 ${W / 2} ${H / 2})">${texts}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* ---------- manajer DOM imperatif (di luar React tree) ---------- */

function paintLayer(el: HTMLElement, bg: string) {
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.zIndex = "9999";
  el.style.pointerEvents = "none";
  el.style.backgroundImage = bg;
  el.style.backgroundRepeat = "repeat";
  el.style.animation = "isms-wm-drift 60s linear infinite";
}

function ensureDom(bg: string, printText: string) {
  for (const id of WM_IDS) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    paintLayer(el, bg);
  }
  let pr = document.getElementById(PRINT_ID);
  if (!pr) {
    pr = document.createElement("div");
    pr.id = PRINT_ID;
    pr.className = "isms-wm-print";
    pr.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 24; i++) {
      const c = document.createElement("div");
      c.className = "isms-wm-print-cell";
      pr.appendChild(c);
    }
    document.body.appendChild(pr);
  }
  pr.querySelectorAll(".isms-wm-print-cell").forEach((c) => {
    c.textContent = printText;
  });
}

function guardBroken(): boolean {
  return !WM_IDS.every((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  });
}

/* ---------- komponen React (hanya pemasok konten, return null) ---------- */

export default function Watermark() {
  const { user } = useAuth();
  const [geo, setGeo] = useState<Geo>({ ip: "…", city: "", country: "" });
  const [now, setNow] = useState(() => new Date());
  const latest = useRef({ bg: "", printText: "" });

  useEffect(() => {
    const c = new AbortController();
    const t = window.setTimeout(() => c.abort(), 4000);
    fetchGeo(c.signal)
      .then((g) => setGeo(g))
      .catch(() => setGeo({ ip: "unavailable", city: "", country: "" }));
    return () => {
      window.clearTimeout(t);
      c.abort();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const device = useMemo(() => parseDevice(), []);
  const who = user?.username ?? "guest";
  const loc = [geo.city, geo.country].filter(Boolean).join(", ");
  const timeLabel = fmtWita(now);
  const lines = useMemo(
    () => [
      `On Development by Alenkosa for PT Syukur Bersaudara`,
      `${who} · ${timeLabel} · ${geo.ip}${loc ? ` · ${loc}` : ""} · ${device}`,
    ],
    [who, timeLabel, geo.ip, loc, device]
  );
  const bg = useMemo(() => tileUri(lines), [lines]);
  const printText = lines[1];

  latest.current = { bg, printText };

  /* pasang / perbarui konten */
  useEffect(() => {
    ensureDom(bg, printText);
  }, [bg, printText]);

  /* self-healing: pasang ulang jika node dihapus / disembunyikan */
  useEffect(() => {
    const heal = () => {
      if (guardBroken()) ensureDom(latest.current.bg, latest.current.printText);
    };
    const iv = window.setInterval(heal, 2000);
    const obs = new MutationObserver(heal);
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    return () => {
      window.clearInterval(iv);
      obs.disconnect();
    };
  }, []);

  return null;
}

/* ---------- penggentar: shortcut DevTools saja (klik kanan & seleksi bebas) ---------- */

export function useDeterrent() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (k === "F12") e.preventDefault();
      else if (mod && (k === "u" || k === "U")) e.preventDefault();
      else if (mod && e.shiftKey && ["i", "I", "j", "J", "c", "C"].includes(k)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

export function SecurityGuards() {
  useDeterrent();
  return <Watermark />;
}
