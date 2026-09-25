// Popover filter generik: semua dimensi filter dalam 1 tombol, berlaku
// setelah tekan Terapkan (draft vs applied). Pakai:
//   const [f, setF] = useState({ status: "Semua", ... });
//   <FilterPopover activeCount={countActive(f)} onReset={...} onApply={setF} initial={f}>
//     {(draft, setDraft) => (<>...kontrol... </>)}
//   </FilterPopover>
import { useEffect, useState, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { useT } from "../i18n/LanguageContext";

export function FilterPopover<T extends Record<string, string>>({
  activeCount,
  initial,
  onApply,
  onReset,
  children,
}: {
  activeCount: number;
  initial: T;
  onApply: (v: T) => void;
  onReset: () => void;
  children: (draft: T, setDraft: (v: T) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T>(initial);
  const { t } = useT();
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  return (
    <div className="relative">
      <button
        className="btn-secondary relative"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.filter.title}
        aria-expanded={open}
      >
        <Filter className="h-4 w-4" /> {t.filter.title}
        {activeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ocean-500 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-steel-200 bg-white p-4 shadow-lift">
            {children(draft, setDraft)}
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-steel-100 pt-3">
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                {t.filter.reset}
              </button>
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => setOpen(false)}
              >
                {t.filter.cancel}
              </button>
              <button
                className="btn-primary px-3 py-1.5 text-xs"
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
              >
                {t.filter.apply}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
