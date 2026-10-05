// @ts-check
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

// Build id shown on /fehler-melden/ and in debug files: short commit + date.
let pdkVersion = 'dev';
try { pdkVersion = `${execSync('git rev-parse --short HEAD').toString().trim()}-${new Date().toISOString().slice(0, 10)}`; } catch {}

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://permaculture-guild-designer.netlify.app',
  devToolbar: { enabled: false },

  vite: {
    plugins: [tailwindcss()],
    define: { __PDK_VERSION__: JSON.stringify(pdkVersion) },
    // Astro inlines processed <script>s smaller than this limit into the
    // HTML, which the production CSP (script-src without 'unsafe-inline')
    // silently blocks — the dev server sends no CSP, so it only breaks live.
    build: { assetsInlineLimit: 0 },
    server: {
      https: httpsConfig,
      // Forwards /api/plant-proxy to the standalone proxy process (see
      // server/plant-proxy-server.mjs) so the frontend can keep calling a
      // relative path — matches how the old netlify.toml redirect worked,
      // just without Netlify. xfwd forwards the real client IP so the
      // proxy's own rate limiter sees actual visitors, not just this dev
      // server's address.
      proxy: {
        '/api/plant-proxy': {
          target: `http://127.0.0.1:${process.env.PLANT_PROXY_PORT || 8787}`,
          changeOrigin: true,
          xfwd: true,
        },
        // Terrain tiles come via our own server in production (nginx cache,
        // see server/nginx/permadesignkit.org.conf); in dev go straight to the bucket.
        '/geo/terrain': {
          target: 'https://s3.amazonaws.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/geo\/terrain/, '/elevation-tiles-prod/terrarium'),
        },
      },
    },
  },
});