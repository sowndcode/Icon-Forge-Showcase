// Rebuilds the UI into dist/ only when the sources are newer than the last build.
import { statSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(root, 'dist', 'index.html');

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

const srcTime = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'public')), statSync(path.join(root, 'index.html')).mtimeMs);
if (!existsSync(built) || statSync(built).mtimeMs < srcTime) {
  console.log('Preparing Icon Forge Showcase (one-time build)...');
  execSync('npx vite build --logLevel warn', { cwd: root, stdio: 'inherit' });
}
