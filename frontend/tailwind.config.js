/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Neutral "dispatch desk" palette — cool graphite, one petrol-blue brand colour.
        ink: { 950: '#0e1a22', 900: '#14232d', 700: '#2c3d4a', 500: '#5a6b78', 400: '#7d8c98', 300: '#aab5be', 200: '#d6dce1', 100: '#e8ecef', 50: '#f4f6f8' },
        brand: { 700: '#0c1f4a', 600: '#13306b', 500: '#2563eb', 100: '#dbe7fb', 50: '#eff5ff' },
        // Semantic risk colours — identical to RISK_COLORS in src/risk.ts (used on the map).
        risk: { low: '#16a34a', moderate: '#eab308', high: '#f97316', severe: '#dc2626', stop: '#7f1d1d', unknown: '#94a3b8' },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(14,26,34,.06), 0 4px 16px rgba(14,26,34,.06)',
        float: '0 2px 4px rgba(14,26,34,.08), 0 12px 32px rgba(14,26,34,.14)',
      },
      borderRadius: { card: '10px' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(.97) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        sweep: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(350%)' } },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'pop-in': 'pop-in 200ms cubic-bezier(.2,.7,.2,1) both',
        sweep: 'sweep 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
