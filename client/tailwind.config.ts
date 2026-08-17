import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#D81F26",
          dark: "#A3151B",
          black: "#111111",
        },
        surface: {
          DEFAULT: "#f9f9fb",
          dim: "#d9dadc",
          bright: "#f9f9fb",
          "container": "#eeeef0",
          "container-low": "#f3f3f5",
          "container-high": "#e8e8ea",
          "container-highest": "#e2e2e4",
          "container-lowest": "#ffffff",
        },
        "on-surface": {
          DEFAULT: "#1a1c1d",
          variant: "#46464a",
        },
        "outline-variant": "#c7c6ca",
        "secondary-container": "#fde0e1",
        "on-secondary-container": "#7a0d11",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
