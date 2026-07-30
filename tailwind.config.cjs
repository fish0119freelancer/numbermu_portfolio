module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './data/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#f2f5f7',
        accent: '#192a3d',
        brand: '#2872fa',
        soft: '#e1e8ed',
      },
      fontFamily: {
        display: ['var(--font-lana)', 'var(--font-cubic)', 'sans-serif'],
        body: ['var(--font-lana)', 'var(--font-cubic)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
