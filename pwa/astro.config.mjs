// @ts-check
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// Local self-signed dev cert (see pwa/.certs/README.md). Not committed —
// generate it per-machine. Falls back to plain HTTP if absent, so `npm run
// dev` still works out of the box on a fresh clone.
const certDir = fileURLToPath(new URL('./.certs/', import.meta.url));
const keyPath = certDir + 'dev-key.pem';
const certPath = certDir + 'dev-cert.pem';
const httpsConfig = existsSync(keyPath) && existsSync(certPath)
  ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
  : undefined;

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://permaculture-guild-designer.netlify.app',
  devToolbar: { enabled: false },

  vite: {
    plugins: [tailwindcss()],
    server: {
      https: httpsConfig,
    },
  },
});