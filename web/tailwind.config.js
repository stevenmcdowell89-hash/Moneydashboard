/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        paper: '#f8fafc',
        accent: '#2563eb',
        good: '#16a34a',
        warn: '#d97706',
        bad: '#dc2626',
      },
    },
  },
  plugins: [],
};
