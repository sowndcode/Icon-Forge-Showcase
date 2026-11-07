// Visual audit: every built-in template under representative themes, as contact sheets.
//   npm run dev; node tests/e2e/audit-templates.mjs [--themes=minimal-light,mono] [--n=40] [--title="Long title"]
// Writes e2e-out/templates/<theme>.png and prints the texts whose colour fails against what is
// actually behind them (background + panels), as measured from the rendered pixels.
import fs from 'node:fs';
import { BASE, launch, outDir } from './lib.mjs';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const themes = arg('themes', 'none,minimal-light,minimal-dark,mono,horror,steampunk,pro-high-contrast').split(',');
const n = +arg('n', '40');
const title = arg('title', '');
const { browser, page, errors } = await launch({ width: 1400, height: 900 });
await page.goto(BASE + '/tests/e2e/blank.html');
const dir = outDir('templates');
for (const themeId of themes) {
  const res = await page.evaluate(
    async ({ themeId, n, title }) => {
      const { createProject } = await import('/src/core/defaults.ts');
      const { THEMES } = await import('/src/core/themes.ts');
      const { loadDoc, getAsset } = await import('/src/state/doc.ts');
      const { images } = await import('/src/render/images.ts');
      const { renderPage } = await import('/src/render/renderer.ts');
      const gen = await import('/src/state/generators.ts');
      const d = createProject('audit');
      d.assets = Array.from({ length: n }, (_, i) => ({ id: 'au' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: ['Weapons', 'Potions', 'Armor'][i % 3], width: 128, height: 128, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 12, y: 12, w: 104, h: 104 }, occupancy: 0.7, fill: 0.85, hasAlpha: true, empty: false, centroid: { x: 64, y: 64 } } }));
      loadDoc(d);
      for (let i = 0; i < n; i++) {
        if (images.previews.has('au' + i)) continue;
        const c = new OffscreenCanvas(128, 128);
        const x = c.getContext('2d');
        x.fillStyle = `hsl(${i * 37} 65% 52%)`;
        x.beginPath();
        x.roundRect(12, 12, 104, 104, 22);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.85)';
        x.beginPath();
        x.arc(64, 60, 26, 0, 7);
        x.fill();
        images.previews.set('au' + i, await createImageBitmap(c));
      }
      const theme = themeId === 'none' ? undefined : THEMES.find((t) => t.id === themeId);
      const all = [...gen.BUILTIN_TEMPLATES, ...(gen.PRO_TEMPLATES ?? []).filter((t) => !gen.BUILTIN_TEMPLATES.includes(t))];
      const W = 300, cols = 5;
      const cells = [];
      const problems = [];
      for (const t of all) {
        let p;
        try {
          p = gen.applyTemplateOptions(t.build(d.assets, title || 'Fantasy RPG', gen.BUILTIN_TEMPLATES[0] && undefined), { text: 'keep', icons: 1, theme });
        } catch (e) {
          try {
            p = gen.previewTemplate(t, d.assets, undefined, 120, { text: 'keep', icons: 1, theme });
          } catch (e2) {
            problems.push(`${t.name}: build failed ${e2}`);
            continue;
          }
        }
        const k = W / p.width;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = Math.round(p.height * k);
        const ctx = c.getContext('2d');
        ctx.setTransform(k, 0, 0, k, 0, 0);
        renderPage(ctx, p, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
        // measured contrast: each text's fill against the pixels around it when the text is not drawn
        const bare = document.createElement('canvas');
        bare.width = c.width;
        bare.height = c.height;
        const b = bare.getContext('2d');
        b.setTransform(k, 0, 0, k, 0, 0);
        const texts = p.objects.filter((o) => o.type === 'text' && !o.hidden);
        renderPage(b, p, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null, skip: new Set(texts.map((t) => t.id)) });
        const lum = (r, g, bb) => {
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb);
        };
        const hexL = (h) => {
          const m = /^#?([0-9a-f]{6})/i.exec(h ?? '#ffffff');
          const v = parseInt(m ? m[1] : 'ffffff', 16);
          return lum((v >> 16) & 255, (v >> 8) & 255, v & 255);
        };
        for (const o of texts) {
          if (o.style.badge?.enabled) continue;
          const x0 = Math.max(0, Math.floor((o.x - o.w / 2) * k)), y0 = Math.max(0, Math.floor((o.y - o.h / 2) * k));
          const w = Math.max(1, Math.min(c.width - x0, Math.ceil(o.w * k))), h = Math.max(1, Math.min(c.height - y0, Math.ceil(o.h * k)));
          if (w < 2 || h < 2) continue;
          const px = b.getImageData(x0, y0, w, h).data;
          let L = 0, m = 0;
          for (let i = 0; i < px.length; i += 16) (L += lum(px[i], px[i + 1], px[i + 2])), m++;
          L /= m;
          const fl = hexL(o.style.fill);
          const ratio = (Math.max(fl, L) + 0.05) / (Math.min(fl, L) + 0.05);
          const st = o.style.stroke;
          const outlined = st?.enabled && st.width >= o.style.fontSize * 0.035 && (Math.max(hexL(st.color), L) + 0.05) / (Math.min(hexL(st.color), L) + 0.05) >= 3;
          if (ratio < 3 && !outlined) {
            problems.push(`${t.name}: "${o.text.slice(0, 24).replace(/\n/g, ' ')}" ${o.style.fill} on backdrop L=${L.toFixed(2)} → ${ratio.toFixed(2)}:1`);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.strokeStyle = '#ff2d55';
            ctx.lineWidth = 2;
            ctx.strokeRect(x0, y0, w, h);
            ctx.restore();
          }
        }
        cells.push({ c, name: t.name });
      }
      const rowH = Math.max(...cells.map((x) => x.c.height)) + 22;
      const sheet = document.createElement('canvas');
      sheet.width = cols * (W + 10) + 10;
      sheet.height = Math.ceil(cells.length / cols) * (rowH + 10) + 10;
      const s = sheet.getContext('2d');
      s.fillStyle = '#18181b';
      s.fillRect(0, 0, sheet.width, sheet.height);
      cells.forEach(({ c, name }, i) => {
        const x = 10 + (i % cols) * (W + 10), y = 10 + Math.floor(i / cols) * (rowH + 10);
        s.drawImage(c, x, y);
        s.fillStyle = '#d4d4d8';
        s.font = '12px sans-serif';
        s.fillText(name, x, y + c.height + 15);
      });
      return { png: sheet.toDataURL('image/png'), problems, count: cells.length };
    },
    { themeId, n, title },
  );
  fs.writeFileSync(`${dir}/${themeId}.png`, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log(`${themeId}: ${res.count} templates, ${res.problems.length} readability problems`);
  for (const p of res.problems) console.log('   ', p);
}
if (errors.length) console.log('window errors:', errors.slice(0, 5));
await browser.close();
