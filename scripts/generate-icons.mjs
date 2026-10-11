// Renders public/icons/* from scripts/icon.mjs. Run: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { appIcon, badgeIcon } from './icon.mjs';

const out = new URL('../public/icons/', import.meta.url);
const icons = [
  { file: 'icon-192.png', size: 192, svg: appIcon() },
  { file: 'icon-512.png', size: 512, svg: appIcon() },
  { file: 'icon-maskable-512.png', size: 512, svg: appIcon({ radius: 0, scale: 3 }) },
  { file: 'apple-touch-icon.png', size: 180, svg: appIcon({ radius: 0, scale: 3 }) },
  { file: 'favicon-32.png', size: 32, svg: appIcon({ scale: 4 }) },
  { file: 'badge-96.png', size: 96, svg: badgeIcon() },
];

writeFileSync(new URL('favicon.svg', out), appIcon());
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const { file, size, svg } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', file);
}
await browser.close();
