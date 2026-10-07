// C1: modal resolusi konflik field yang sama di dua perangkat.
//
// Dipicu dari store.update() saat 409 STALE dan patch memuat field yang
// nilainya di server SUDAH berbeda dari yang ingin ditulis user (perangkat
// lain mengubah field yang sama). Tanpa dialog ini user hanya melihat toast
// "tidak disimpan" tanpa bisa memilih mempertahankan versi server atau
// menimpa dengan perubahan sendiri.

import { useEffect, useState } from "react";
import { Modal, AsyncButton } from "./ui";

export interface FieldConflictPayload {
  collection: string;
  rowId: string;
  label: string;
  fields: { key: string; mine: unknown; server: unknown }[];
  onForce: () => Promise<void>;
  onUseServer: () => void;
}

type Pending = FieldConflictPayload & { resolve: (choice: "force" | "server") => void };

let pending: Pending | null = null;

/** Dipanggil store saat konflik field terdeteksi. Mengembalikan Promise
    yang resolve setelah user memilih di modal. */
export function requestFieldConflict(payload: FieldConflictPayload): Promise<"force" | "server"> {
  return new Promise((resolve) => {
    pending = { ...payload, resolve };
    try {
      window.dispatchEvent(new CustomEvent("isms:field-conflict"));
    } catch { /* non-browser */ }
  });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    try { return JSON.stringify(v).slice(0, 80); } catch { return String(v); }
  }
  return String(v).slice(0, 80);
}

export function ConflictResolver() {
  const [state, setState] = useState<FieldConflictPayload | null>(null);

  useEffect(() => {
    const onEvent = () => {
      if (pending) setState(pending);
    };
    window.addEventListener("isms:field-conflict", onEvent);
    /* Mungkin event terjadi sebelum listener terpasang (race mount). */
    if (pending) setState(pending);
    return () => window.removeEventListener("isms:field-conflict", onEvent);
  }, []);

  const close = (choice: "force" | "server") => {
    const p = pending;
    pending = null;
    setState(null);
    p?.resolve(choice);
  };

  if (!state) return null;

  return (
    <Modal
      open
      onClose={() => close("server")}
      title="Konflik perubahan data"
      subtitle={`${state.collection} · ${state.rowId}`}
      footer={
        <>
          <button className="btn-secondary" onClick={() => close("server")}>
            Gunakan versi server
          </button>
          <AsyncButton className="btn-primary" onAction={async () => { await state.onForce(); close("force"); }}>
            Timpa dengan perubahan saya
          </AsyncButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-steel-600">
          Baris ini juga diubah di perangkat lain. Field di bawah sudah berbeda di server.
          Pilih mana yang dipertahankan.
        </p>
        <div className="overflow-x-auto rounded-xl border border-steel-100">
          <table className="w-full text-xs">
            <thead className="bg-surface">
              <tr>
                <th className="th">Field</th>
                <th className="th">Perubahan saya</th>
                <th className="th">Versi server</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {state.fields.map((f) => (
                <tr key={f.key}>
                  <td className="td font-mono font-semibold text-navy-900">{f.key}</td>
                  <td className="td text-rose-700">{fmtVal(f.mine)}</td>
                  <td className="td text-ocean-700">{fmtVal(f.server)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-steel-500">
          "Gunakan versi server" = data Anda untuk field di atas dibuang, versi perangkat lain
          dipertahankan. "Timpa" = nilai Anda ditulis ke server memakai versi terbaru sebagai acuan.
        </p>
      </div>
    </Modal>
  );
}
