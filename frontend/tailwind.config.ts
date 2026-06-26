import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0E1A",
          soft: "#2D3448",
          muted: "#6B7280",
        },
        paper: {
          DEFAULT: "#FAFAF8",
          warm: "#F5F3EE",
          border: "#E4E0D8",
        },
        amber: {
          DEFAULT: "#E8A020",
          light: "#FFF3D6",
          dark: "#B87A10",
        },
        success: "#16A34A",
        danger: "#DC2626",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        sans: ["'Inter'", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
