/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#f8fafc', // slate-50
        surface: '#ffffff',
        primary: '#2563eb',   // blue-600
        secondary: '#6366f1', // indigo-500
        border: '#e2e8f0',    // slate-200
        text: {
          main: '#0f172a',    // slate-900
          body: '#475569',    // slate-600
          muted: '#94a3b8',   // slate-400
        }
      },
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      }
    },
  },
  plugins: [],
}