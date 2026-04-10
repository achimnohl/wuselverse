/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './apps/platform-web/src/**/*.{html,ts,scss}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.10)',
      },
    },
  },
  plugins: [],
};
