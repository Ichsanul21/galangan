import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { migrate } from "./migrate.js";
import { initFonts, fontFilesAvailable } from "./pdf/font.js";

async function main(): Promise<void> {
  const env = loadEnv();
  await migrate();
  /* initFonts() WAJIB dipanggil sebelum render pertama. Tanpa itu fontsDir
     tetap kosong dan loadFontFiles() selalu mengembalikan null - jadi
     menaruh TTF di assets/fonts pun tidak pernah terpakai, dan dokumen
     diam-diam jatuh ke standard-14 (nama Mandarin jadi kotak kosong).
     Fungsinya ada tapi tidak pernah dipanggil sama sekali. */
  initFonts(env.fontsDir);
  if (!fontFilesAvailable()) {
    console.warn(
      `[api] tidak ada TTF di ${env.fontsDir} - PDF memakai font standard-14. ` +
      "Karakter di luar WinAnsi (mis. huruf Mandarin) akan tercetak sebagai kotak.",
    );
  }
  const app = buildApp();
  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("[api] fatal:", err);
  process.exit(1);
});
