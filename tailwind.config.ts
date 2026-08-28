import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0f1419',
          soft: '#3d4852',
          muted: '#6b7785',
        },
        tkd: {
          // Taekwondo belt-inspired accents
          red: '#c8102e',
          blue: '#0b3d91',
          gold: '#c9a227',
          silver: '#8e97a3',
          bronze: '#a1662f',
        },
        surface: {
          DEFAULT: '#ffffff',
          sunk: '#f5f6f8',
          line: '#e3e6ea',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,20,25,.05), 0 1px 12px rgba(15,20,25,.04)',
      },
    },
  },
  plugins: [],
} satisfies Config;
