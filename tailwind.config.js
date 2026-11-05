module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effaf6",
          100: "#d6f2e7",
          200: "#aee4d0",
          300: "#76d0b0",
          400: "#3fb78f",
          500: "#1c9d77",
          600: "#118063",
          700: "#0e6650",
          800: "#0d5142",
          900: "#0a3f34",
          950: "#052b23"
        },
        sand: {
          50: "#f6f9f8",
          100: "#eef3f1",
          200: "#e0e8e5",
          300: "#cbd6d2"
        },
        gold: {
          100: "#fbefd0",
          300: "#f4cd75",
          400: "#efb94a",
          500: "#dd9f26",
          600: "#b97d14"
        }
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Noto Sans Arabic", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"]
      },
      borderRadius: {
        "4xl": "2rem"
      },
      boxShadow: {
        card: "0 1px 1px rgba(5, 43, 35, 0.04), 0 8px 24px -12px rgba(5, 43, 35, 0.12)",
        lift: "0 2px 4px rgba(5, 43, 35, 0.05), 0 16px 32px -16px rgba(5, 43, 35, 0.22)",
        pop: "0 24px 60px -20px rgba(5, 43, 35, 0.45)",
        glow: "0 8px 20px -6px rgba(17, 128, 99, 0.55)"
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(8px) scale(0.99)" }, "100%": { opacity: "1", transform: "none" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } }
      },
      animation: {
        rise: "rise 0.22s ease-out both",
        fade: "fade 0.18s ease-out both"
      }
    }
  },
  plugins: []
};
