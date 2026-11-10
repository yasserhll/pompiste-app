/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Couleur d'action principale (bleu indigo)
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
          500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b',
        },
        // Couleur métier « gasoil » : jauges, quantités
        fuel: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
          500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f',
        },
        // Neutres (ardoise)
        ink: {
          50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b',
          600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617',
        },
        navy: { 800: '#111a2e', 900: '#0b1220', 950: '#070c17' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)',
        lift: '0 10px 30px -12px rgba(15,23,42,.25), 0 4px 10px -4px rgba(15,23,42,.08)',
        glow: '0 8px 24px -8px rgba(79,70,229,.55)',
        'glow-fuel': '0 8px 24px -8px rgba(245,158,11,.6)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': { '0%': { transform: 'scale(.8)', opacity: .7 }, '100%': { transform: 'scale(2.2)', opacity: 0 } },
        'scan-line': { '0%,100%': { top: '8%' }, '50%': { top: '88%' } },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.2,.7,.2,1) both',
        shimmer: 'shimmer 1.4s infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(.2,.6,.3,1) infinite',
        'scan-line': 'scan-line 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
