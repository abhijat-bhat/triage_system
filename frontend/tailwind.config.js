/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#e2e8f0",
          200: "#cbd5e1",
          300: "#94a3b8",
          400: "#64748b",
          500: "#475569",
          600: "#334155",
          700: "#1e293b",
          800: "#0f172a",
          900: "#020617",
        },
        accent: {
          DEFAULT: "#06b6d4",
          soft: "#22d3ee",
          deep: "#0e7490",
        },
        priority: {
          p1: "#ef4444",
          p2: "#f97316",
          p3: "#eab308",
          p4: "#3b82f6",
          p5: "#10b981",
        },
      },
      boxShadow: {
        glow: "0 0 30px -10px rgba(6,182,212,0.55)",
        panel: "0 16px 40px -20px rgba(2,6,23,0.7)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at top, rgba(6,182,212,0.12), transparent 60%), radial-gradient(circle at bottom right, rgba(14,116,144,0.18), transparent 55%)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
