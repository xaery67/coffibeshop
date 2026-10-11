/** Design token CoffeeShop — Coffee Brown #6F4E37 (PRD-FRONTEND-UX §3). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6F4E37',
          fg: '#FFFFFF',
          50: '#F7F3EF',
          100: '#EDE3DA',
          500: '#6F4E37',
          600: '#5C402E',
          700: '#493326',
        },
        success: { DEFAULT: '#16A34A', fg: '#FFFFFF' },
        warning: { DEFAULT: '#D97706', fg: '#FFFFFF' },
        error: { DEFAULT: '#DC2626', fg: '#FFFFFF' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      spacing: { 1: '4px' },
      borderRadius: { card: '12px' },
    },
  },
  plugins: [],
};
