// End-to-end helpers: drive the app on the Vite dev server in Chromium (Playwright), with
// realistic projects seeded into the browser storage the dev build uses (IndexedDB).
// Not part of `npm test`: run with `node tests/e2e/run.mjs` while `npm run dev` is running.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Playwright is not a project dependency: use a global installation (or a local one, if present)
export const { chromium } = createRequire(import.meta.url)('playwright');

export const BASE = process.env.E2E_URL ?? 'http://localhost:5183';

export async function launch({ width = 1600, height = 900, scale = 1 } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { browser, page, errors };
}

/**
 * Seed projects into IndexedDB and make `open` the project the app opens on start.
 * Each project: { id, name, assets: n, missing: [indices without a file], corrupt: [indices with
 * damaged files], pages: [{ name, w, h, color, icons: n }] }. Icons are real PNGs drawn in the page.
 */
export async function seed(page, projects, open) {
  // seed from a blank page of the same origin, so no running app writes to the storage meanwhile
  await page.goto(BASE + '/tests/e2e/blank.html');
  await page.evaluate(
    async ({ projects, open }) => {
      const { createProject, createPage, createImage } = await import('/src/core/defaults.ts');
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('asset-forge-showcase', 1);
        r.onupgradeneeded = () => {
          for (const [n, k] of [['projects', 'id'], ['blobs'], ['presets', 'id'], ['kv']]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, k ? { keyPath: k } : undefined);
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const put = (store, value, key) =>
        new Promise((res, rej) => {
          const t = db.transaction(store, 'readwrite');
          t.objectStore(store).put(value, key);
          t.oncomplete = res;
          t.onerror = () => rej(t.error);
        });
      const pool = [];
      for (let i = 0; i < 24; i++) {
        const c = new OffscreenCanvas(128, 128);
        const x = c.getContext('2d');
        x.fillStyle = `hsl(${i * 47} 70% 55%)`;
        x.beginPath();
        x.roundRect(16, 16, 96, 96, 20);
        x.fill();
        x.fillStyle = '#fff';
        x.font = 'bold 48px sans-serif';
        x.textAlign = 'center';
        x.fillText(String(i), 64, 82);
        pool.push(await c.convertToBlob({ type: 'image/png' }));
      }
      for (const spec of projects) {
        const d = createProject(spec.name);
        d.id = spec.id;
        const assets = [];
        const blobs = [];
        for (let i = 0; i < spec.assets; i++) {
          const id = `${spec.id}_a${i}`;
          assets.push({ id, name: `icon_${String(i).padStart(4, '0')}.png`, format: 'png', kind: 'asset', folder: '', category: ['Weapons', 'Potions', 'Armor', 'Gems'][i % 4], width: 128, height: 128, bytes: 2000, importIndex: i, addedAt: Date.now(), status: 'ready', alpha: { bounds: { x: 16, y: 16, w: 96, h: 96 }, occupancy: 0.7, fill: 0.9, hasAlpha: true, empty: false, centroid: { x: 64, y: 64 } } });
          if ((spec.missing ?? []).includes(i)) continue;
          blobs.push([id, (spec.corrupt ?? []).includes(i) ? new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7])], { type: 'image/png' }) : pool[i % pool.length]]);
        }
        d.assets = assets;
        d.pages = spec.pages.map((ps) => {
          const p = createPage(ps.name, ps.w, ps.h);
          p.background = { ...p.background, type: 'solid', color: ps.color };
          const n = Math.min(ps.icons ?? 0, assets.length);
          const cols = Math.ceil(Math.sqrt(n * (ps.w / ps.h)));
          const cell = Math.min(ps.w / cols, ps.h / Math.ceil(n / Math.max(1, cols)));
          p.objects = Array.from({ length: n }, (_, i) => createImage(assets[i].id, assets[i].name, (i % cols) * cell + cell / 2, Math.floor(i / cols) * cell + cell / 2, cell * 0.8, cell * 0.8));
          return p;
        });
        d.activePageId = d.pages[0].id;
        const meta = { id: d.id, name: d.name, updatedAt: Date.now(), createdAt: Date.now(), pages: d.pages.length, assets: d.assets.length, width: d.pages[0].width, height: d.pages[0].height };
        await put('projects', { id: d.id, meta, doc: d });
        for (const [k, b] of blobs) await put('blobs', b, k);
      }
      if (open) await put('kv', open, 'lastProject');
    },
    { projects, open },
  );
  await page.goto(BASE + '/');
  await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
}

export function outDir(name) {
  const d = path.resolve(process.env.E2E_OUT ?? 'e2e-out', name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

let failures = 0;
export function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
export const failed = () => failures;
