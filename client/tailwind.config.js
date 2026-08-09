/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        blood: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#dc2626",
          600: "#b91c1c",
          700: "#991b1b",
          800: "#7f1d1d",
          900: "#641818",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 4px 12px -2px rgba(15, 23, 42, 0.06)",
        lift: "0 8px 24px -4px rgba(15, 23, 42, 0.12)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: 0, transform: "translateY(4px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        "slide-in-right": { "0%": { opacity: 0, transform: "translateX(16px)" }, "100%": { opacity: 1, transform: "translateX(0)" } },
        "pulse-once": { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.015)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
        "pulse-once": "pulse-once 0.4s ease-out",
      },
    },
  },
  plugins: [],
};
