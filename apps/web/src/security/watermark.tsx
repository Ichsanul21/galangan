import { useEffect, useMemo, useRef } from "react";

const WM_IDS = ["isms-wm-1", "isms-wm-2"];
const PRINT_ID = "isms-wm-print";

/* ---------- tile SVG watermark ---------- */

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tileUri(lines: string[]): string {
  const W = 1300;
  const H = 300;
  const texts = lines
    .map(
      (t) => {
        return `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="800" fill="rgba(11,58,99,0.07)" letter-spacing="0.5">${escapeXml(t)}</text>`;
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
  const latest = useRef({ bg: "", printText: "" });

  const lines = useMemo(
    () => ["On Development by Alenkosa for PT Syukur Bersaudara"],
    []
  );
  const bg = useMemo(() => tileUri(lines), [lines]);
  const printText = lines[0];

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
