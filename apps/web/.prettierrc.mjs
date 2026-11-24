import base from '../../.prettierrc.json' with { type: 'json' };

/** Shared repo style + Tailwind class ordering for the web app. */
const config = { ...base, plugins: ['prettier-plugin-tailwindcss'], tailwindStylesheet: './src/app/globals.css' };

export default config;
