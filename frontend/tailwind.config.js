/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        red: {
          1: "#6366f1"
        },
        black: {
          1: "#121212",
          2: "#1F1F1F"
        },
        gray: {
          1: "#5E5E5E",
          2: "#3D3D3D",
          3: "#1F1F1F"
        },
        green: {
          1: "#4B9467"
        }
      }
    },
  },
  plugins: [
    // require("tailwindcss-animate")
  ],
}