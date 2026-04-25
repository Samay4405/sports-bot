/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      colors: {
        surface: "#f6f8fb",
        ink: "#172033",
        accent: "#0f766e",
        accentSoft: "#b7efe5",
        alert: "#b45309",
        danger: "#991b1b",
      },
      boxShadow: {
        card: "0 20px 60px -32px rgba(15, 118, 110, 0.6)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 0.5s ease-out forwards",
      },
    },
  },
  plugins: [],
};
