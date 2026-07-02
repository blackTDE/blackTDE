/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f0f11",
          1: "#18181b",
          2: "#1f1f23",
          3: "#28282e",
        },
        brand: {
          DEFAULT: "#7c3aed",
          light: "#a78bfa",
        },
        success: "#22c55e",
        warning: "#f59e0b",
        error: "#ef4444",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
}
