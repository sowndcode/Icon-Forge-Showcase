// Builds a standalone Windows app folder, release/IconForgeShowcase-win32-x64/IconForgeShowcase.exe,
// and the ZIP to share: release/IconForgeShowcase-<version>-win-x64.zip
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { packager } from '@electron/packager';
import { zipSync } from 'fflate';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const out = await packager({
  dir: root,
  name: 'IconForgeShowcase',
  executableName: 'IconForgeShowcase',
  out: path.join(root, 'release'),
  overwrite: true,
  platform: 'win32',
  arch: 'x64',
  asar: true,
  prune: true,
  icon: path.join(root, 'electron', 'icon.ico'),
  // only the built UI and the Electron shell are needed at runtime
  ignore: (p) => p !== '' && !/^\/(dist|electron|package\.json)(\/|$)/.test(p.split(path.sep).join('/')),
  // the version comes from package.json; without appCopyright Windows would show Electron's own notice
  appCopyright: 'Copyright (c) 2026 Icon Forge Showcase contributors',
  win32metadata: { CompanyName: 'Icon Forge', ProductName: 'Icon Forge Showcase', FileDescription: 'Icon Forge Showcase' },
});
const dir = out[0];

// The exe never needs these, and leaving them on lets anything on the PC run code through a trusted app.
// The app loads only from app.asar, which must match the hash packager embeds in the exe.
await flipFuses(path.join(dir, 'IconForgeShowcase.exe'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
});

// Licence notices that must travel with the app. Electron's own (LICENSE, LICENSES.chromium.html) are
// already in the folder; add this project's and those of every runtime package bundled into dist/.
copyFileSync(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE.IconForgeShowcase.txt'));
copyFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(dir, 'THIRD_PARTY_NOTICES.md'));

function runtimePackages(names, seen = new Map()) {
  for (const name of names) {
    // type declarations are never bundled
    if (seen.has(name) || name.startsWith('@types/')) continue;
    const dirOf = path.join(root, 'node_modules', name);
    const meta = JSON.parse(readFileSync(path.join(dirOf, 'package.json'), 'utf8'));
    seen.set(name, { dir: dirOf, version: meta.version, license: meta.license });
    runtimePackages(Object.keys(meta.dependencies ?? {}), seen);
  }
  return seen;
}
const sections = [...runtimePackages(Object.keys(pkg.dependencies))]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, p]) => {
    const file = readdirSync(p.dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
    if (!file) throw new Error(`No licence file in ${name}: add its notice by hand before shipping`);
    return `${'='.repeat(78)}\n${name} ${p.version} (${p.license})\n${'='.repeat(78)}\n\n${readFileSync(path.join(p.dir, file), 'utf8').trim()}\n`;
  });
writeFileSync(
  path.join(dir, 'THIRD_PARTY_LICENSES.txt'),
  `Icon Forge Showcase ${pkg.version}: licences of third-party software included in this app.\n` +
    `Electron's licence is in LICENSE, and Chromium's and its components' in LICENSES.chromium.html.\n` +
    `This project's own licence is in LICENSE.IconForgeShowcase.txt.\n\n${sections.join('\n')}`,
);
for (const f of ['LICENSE', 'LICENSES.chromium.html', 'IconForgeShowcase.exe', 'resources/app.asar']) {
  if (!existsSync(path.join(dir, f))) throw new Error(`Missing from the build: ${f}`);
}
console.log('Built:', dir);

// Zip the fresh folder now, before anything runs it: a started copy writes the user's projects, settings
// and logs to data/ next to the exe, and that must never end up in a shared ZIP.
const entries = {};
(function add(abs, rel) {
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (!rel && (e.name === 'data' || e.name === 'exports')) throw new Error(`${r}/ found in the build folder: refusing to zip personal data`);
    if (e.isDirectory()) add(path.join(abs, e.name), r);
    else entries[r] = readFileSync(path.join(abs, e.name));
  }
})(dir, '');
const zipPath = path.join(root, 'release', `IconForgeShowcase-${pkg.version}-win-x64.zip`);
writeFileSync(zipPath, zipSync(entries, { level: 9 }));
console.log(`Zipped: ${zipPath} (${Object.keys(entries).length} files)`);
