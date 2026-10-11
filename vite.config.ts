import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { serviceWorker } from './scripts/vite-service-worker.ts';

export default defineConfig({
  // The service worker plugin goes first so its dev middleware can serve /sw.js.
  plugins: [serviceWorker({ entry: 'src/sw.ts' }), preact(), cloudflare()],
});
