import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F6F2",
        ink: "#1C1B29",
        muted: "#6B6A78",
        line: "#E4E1D8",
        indigo: "#4A4FE0",
        indigoSoft: "#ECEBFB",
        amber: "#E2A33D",
        amberSoft: "#FBF0DE",
        moss: "#3C8768",
        mossSoft: "#E4F1EA",
        grey: "#9C9AA6",
        greySoft: "#EEEDE8",
        coral: "#E0594F",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,27,41,0.04), 0 1px 1px rgba(28,27,41,0.03)",
        pop: "0 8px 24px rgba(28,27,41,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
