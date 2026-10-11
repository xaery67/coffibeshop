/**
 * Design token CoffeeShop — sumber kebenaran: PRD-FRONTEND-UX §3.
 * Brand = Coffee Brown #6F4E37. Pasangan `-fg` eksplisit untuk tiap latar (review FE).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6F4E37', // --color-primary
          fg: '#FFFFFF', // --color-primary-fg
          hover: '#5A3E2B', // --color-primary-hover
          50: '#F7F4F0', // --color-bg-subtle (Cream)
          100: '#EDE3DA',
          500: '#6F4E37',
          600: '#5C402E',
          700: '#493326',
        },
        secondary: { DEFAULT: '#C8A27A', fg: '#3A2A18' }, // fill saja (kontras < 3:1)
        accent: { DEFAULT: '#E8B44F', fg: '#3A2A18' }, // fill saja
        success: { DEFAULT: '#2E7D32', fg: '#FFFFFF' },
        // warning #ED8B00 = 2.53:1 → fill saja; teks pakai warning-fg #8A4B00 (6.80:1 ✔)
        warning: { DEFAULT: '#ED8B00', fg: '#8A4B00' },
        error: { DEFAULT: '#C62828', fg: '#FFFFFF' },
        info: { DEFAULT: '#1565C0', fg: '#FFFFFF' },
        text: { DEFAULT: '#1F1B16', muted: '#6B6257' },
        border: '#E5DED6',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      // Skala tipografi mobile — PRD-FRONTEND-UX §3.2 (size/line-height).
      fontSize: {
        display: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700' }],
        h1: ['1.5rem', { lineHeight: '1.875rem', fontWeight: '700' }],
        h2: ['1.25rem', { lineHeight: '1.625rem', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.25rem' }],
      },
      spacing: { 1: '4px' },
      borderRadius: { card: '12px', pill: '999px' },
    },
  },
  plugins: [],
};
