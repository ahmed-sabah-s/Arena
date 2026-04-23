/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './index.ts',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Surface hierarchy
        pitch: '#000000',
        turf: '#0c0e11',
        bench: '#171a1d',
        suite: '#23262a',

        // Color semantics
        primary: {
          DEFAULT: '#cafd00',
          container: '#f3ffca',
          'on-fixed': '#3a4a00',
        },
        secondary: '#00e3fd',
        tertiary: {
          DEFAULT: '#fc3c00',
          accent: '#ff7350',
        },
        'on-surface': '#f9f9fd',
        'outline-variant': '#46484b',

        // Tier colors
        tier: {
          bronze: '#cd7f32',
          silver: '#a8a9ad',
          gold: '#ffd700',
          platinum: '#e5e4e2',
          elite: '#fc3c00',
        },

        // Result indicators
        result: {
          win: '#cafd00',
          loss: '#fc3c00',
          draw: '#46484b',
        },
      },
      fontFamily: {
        display: ['Space Grotesk Bold'],
        headline: ['Space Grotesk Medium'],
        body: ['Manrope Regular'],
        'body-medium': ['Manrope Medium'],
        data: ['Lexend Regular'],
        arabic: ['Tajawal Regular'],
        'arabic-bold': ['Tajawal Bold'],
      },
      borderRadius: {
        arena: '0.375rem',
        'arena-lg': '0.75rem',
      },
    },
  },
  plugins: [],
};
