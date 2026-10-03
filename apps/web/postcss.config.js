// Tailwind v4 memakai plugin PostCSS tersendiri; `tailwindcss` sebagai plugin
// PostCSS sudah dihapus di v4. Autoprefixer tetap dipakai karena v4 tidak
// menyertakan prefix vendor.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};