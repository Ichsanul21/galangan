"""Sekali jalan: ganti modal tambah-proyek inline Projects.tsx -> ProjectAddModal.
Jalankan dari root repo:  python tools/extract_project_modal.py
"""
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "pages" / "proyek" / "Projects.tsx"
lines = P.read_text(encoding="utf-8").split("\n")

# 1. Hapus fungsi save (dari '  const save = async () => {' sampai penutup '  };' berikutnya).
i = next(i for i, l in enumerate(lines) if l == "  const save = async () => {")
j = next(i for i in range(i + 1, len(lines)) if lines[i] == "  };")
del lines[i:j + 1]

# 2. Tombol header: cukup buka modal.
i = next(i for i, l in enumerate(lines) if "setScopeRows([{ service:" in l and "setShowAdd(true)" in l)
lines[i] = lines[i].split("onClick={() =>")[0] + "onClick={() => setShowAdd(true)}><Plus className=\"h-4 w-4\" /> {S.prjNew}</button>"

# 3. Ganti blok Modal showAdd + ClientModal -> ProjectAddModal.
i = next(i for i, l in enumerate(lines) if l.strip() == "<Modal" and i + 1 < len(lines) and "showAdd" in lines[i + 1])
# akhir: penutup ClientModal '/>' setelah 'onSaved={(name) => setF("client", name)}'
k = next(i for i in range(i, len(lines)) if "onSaved=" in lines[i])
end = next(i for i in range(k, len(lines)) if lines[i].strip() == "/>")
block = [
    "      <ProjectAddModal",
    "        open={showAdd}",
    "        onClose={() => setShowAdd(false)}",
    "        S={S}",
    "        projects={projects}",
    "        vessels={data.vessels}",
    "        clients={data.clients}",
    "        employees={data.employees}",
    "        add={add}",
    "      />",
]
lines[i:end + 1] = block

P.write_text("\n".join(lines), encoding="utf-8")
print("OK: modal diekstrak")
