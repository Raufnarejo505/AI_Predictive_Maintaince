/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#2C3E50",
          accent: "#1ABC9C",
          warning: "#F4A261",
          danger: "#E76F51",
        },
      },
    },
  },
  plugins: [],
};

