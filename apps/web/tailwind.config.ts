import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#18212a',
        paper: '#f6f1e7',
        coral: '#e66c4f',
        teal: '#1b6b69',
      },
      fontFamily: {
        sans: ['Inter', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
