/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff8eb', 100: '#feeac7', 200: '#fdd28a', 300: '#fcb44d', 400: '#fb9a24',
          500: '#f2760b', 600: '#d65406', 700: '#b13a09', 800: '#8f2d0e', 900: '#76270f',
        },
        ink: {
          50: '#f6f7f9', 100: '#eceef2', 200: '#d5d9e2', 300: '#b0b8c9', 400: '#8592ab', 500: '#667491',
          600: '#515d78', 700: '#424b62', 800: '#394053', 900: '#1f2430', 950: '#141821',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(20,24,33,.06), 0 1px 3px rgba(20,24,33,.08)' },
    },
  },
  plugins: [],
}
