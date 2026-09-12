/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0b3a63",
          800: "#0e4a7d",
          700: "#12598f",
          600: "#166aa5",
        },
        steel: {
          700: "#3d5468",
          600: "#52697c",
          500: "#5a7a94",
          400: "#8aa2b6",
          300: "#bcccd8",
          200: "#d7e1ea",
          100: "#e9eff4",
        },
        ocean: {
          600: "#1f7fae",
          500: "#2e9ad4",
          400: "#5cb1de",
          300: "#8cc9e8",
        },
        surface: "#f4f7fb",
        teal: {
          500: "#0d9488",
          400: "#2dd4bf",
          100: "#ccfbf1",
          50: "#f0fdfa",
        },
        rose: {
          600: "#e11d48",
          500: "#f43f5e",
          400: "#fb7185",
          100: "#ffe4e6",
          50: "#fff1f2",
        },
        violet: {
          600: "#7c3aed",
          500: "#8b5cf6",
          100: "#ede9fe",
          50: "#f5f3ff",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Sora'", "'Inter'", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(11,58,99,0.05), 0 8px 24px -8px rgba(11,58,99,0.12)",
        lift: "0 4px 8px rgba(11,58,99,0.06), 0 20px 40px -16px rgba(11,58,99,0.25)",
        glow: "0 0 0 1px rgba(46,154,212,0.15), 0 12px 32px -8px rgba(46,154,212,0.35)",
      },
      backgroundImage: {
        "gradient-hero":
          "linear-gradient(135deg, #0b3a63 0%, #12598f 45%, #2e9ad4 100%)",
        "gradient-teal": "linear-gradient(135deg, #0d9488, #2dd4bf)",
        "gradient-rose": "linear-gradient(135deg, #e11d48, #fb7185)",
        "gradient-violet": "linear-gradient(135deg, #7c3aed, #8b5cf6)",
        "gradient-amber": "linear-gradient(135deg, #d97706, #fbbf24)",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.5s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
