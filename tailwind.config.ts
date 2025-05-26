import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Your theme extensions here (e.g., custom colors, fonts)
    },
  },
  plugins: [
    // Any Tailwind plugins you're using (e.g., @tailwindcss/typography)
  ],
};

export default config;
