// Builds a standalone Windows app folder: release/IconForgeShowcase-win32-x64/IconForgeShowcase.exe
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { packager } from '@electron/packager';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
// the exe never needs these, and leaving them on lets anything on the PC run code through a trusted app
await flipFuses(path.join(out[0], 'IconForgeShowcase.exe'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
});
console.log('Built:', out.join(', '));
