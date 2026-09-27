"""Sekali jalan: sidebar const -> renderSidebar(mini) agar drawer mobile selalu penuh.
Jalankan dari root repo:  python tools/sidebar_fn.py
"""
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "layouts" / "AppShell.tsx"
lines = P.read_text(encoding="utf-8").split("\n")

i = next(i for i, l in enumerate(lines) if l.strip() == "const sidebar = (")
# akhir blok: '  );' pertama setelah i yang menutup const (cari pola tepat)
j = next(i for i in range(i + 1, len(lines)) if lines[i] == "  );")
block = lines[i:j + 1]
assert "minSide" in "\n".join(block), "blok sidebar tak ketemu"
block[0] = "  const renderSidebar = (mini: boolean) => ("
text = "\n".join(block).replace("minSide", "mini")
lines[i:j + 1] = text.split("\n")

src = "\n".join(lines)
src = src.replace(
    '<div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</div>',
    '<div className="absolute inset-y-0 left-0 w-72 shadow-xl">{renderSidebar(false)}</div>',
)
src = src.replace(
    '<aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>',
    '<aside className={`fixed inset-y-0 left-0 z-30 hidden transition-all duration-300 lg:block ${minSide ? "w-20" : "w-64"}`}>{renderSidebar(minSide)}</aside>',
)
src = src.replace(
    '<div className="lg:pl-64">',
    '<div className={`transition-all duration-300 ${minSide ? "lg:pl-20" : "lg:pl-64"}`}>\n',
)
P.write_text(src, encoding="utf-8")
print("OK: renderSidebar(mini)")
