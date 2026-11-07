# Security review: 0.2.0-alpha.1

Date: 2026-11-05. Scope: the dependency advisories reported for the repository, and regressions this
milestone could introduce in the desktop app. A passing `npm audit` is not a claim that the app has no
vulnerabilities.

## Dependency advisories

GitHub reported two moderate Dependabot alerts. `npm audit` lists the same two advisories as five
entries (the packages that depend on them).

| Advisory | Package | Vulnerable | Fixed in | Path |
| --- | --- | --- | --- | --- |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) (CWE-400): AbortSignal cancellation bypass allows post-timeout filesystem traversal | `glob` | 9.0.0 – 14.0.1 | 14.0.2 | `@electron/packager` 20.3.0 → `@electron/asar` 4.3.1 → `glob` 13.0.6 |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (CWE-405): denial of service via globparts amplification | `minimatch` | 7.0.0 – 11.0.0 | 11.0.1 | `@electron/packager` → `@electron/asar` → `minimatch` 10.2.6 (and through `glob`) |

**Branches.** `main` and `feat/product-workflow-overhaul` declare the same `@electron/packager ^20.3.0`,
so both, and this branch before the fix, are affected.

**Development or runtime.** Development only. `@electron/packager` is a devDependency used by
`npm run package` to assemble the Windows folder. The packaged app contains only `dist/`, `electron/`
and `package.json` (checked by listing `resources/app.asar` of a fresh build: 29 entries, no
`node_modules`), so neither package ships to users.

**Exploitability.** Not reachable in practice. `@electron/asar` calls `glob(dir, options)` without an
AbortSignal, so the glob advisory's code path (cancellation) is never used, and `minimatch()` only with
patterns from this project's own build configuration, never with untrusted input. Exposure was limited
to a developer running the packaging script on this repository's own files.

**Fix.** `npm audit fix --force` would downgrade `@electron/packager` to 18.4.4 (a major step back).
`@electron/asar` 4.3.1 is the latest release and pins `glob ^13` and `minimatch ^10`, so no in-range
update exists. Instead `package.json` has a scoped override:

```json
"overrides": { "@electron/asar": { "glob": "^14.0.3", "minimatch": "^11.0.4" } }
```

**Verification.** `npm audit`: 0 vulnerabilities. `@electron/asar` with the new versions created an
archive of the real app files, listed it and extracted it byte-identical. `npm run package` built the
Windows app folder (Electron 44.10.1) without errors. Remove the override once `@electron/asar` depends
on the fixed versions itself.

## Desktop app: configuration, checked in the running app

Checked by starting the built app in Electron 44.10.1 (Linux, virtual display) and probing it from the
page:

| Check | Result |
| --- | --- |
| Request to `https://example.com/` (fetch and image) | Blocked |
| `require`, `process` in the page | Not defined |
| `eval` | Blocked by the Content Security Policy |
| `window.open` | Denied |
| Content Security Policy on `index.html` | `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'` … |
| Write to a path not chosen in a save dialog | Refused ("Write not permitted") |
| Read a stored file with id `../../etc/passwd` | Refused ("Invalid id") |
| `setTheme('evil')` (new call) | Refused by the main process |

Unchanged from the previous review and confirmed in the code: `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `webviewTag: false`, navigation outside
`app://showcase/` is prevented, permission requests other than clipboard writing and fullscreen are
denied, and IPC handlers refuse calls from any page other than the app's own.

**Packaged build** (`npm run package`, inspected after building): the `RunAsNode`,
`EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` fuses are off; the app is in an
asar archive; no source maps; the executable carries the app icon (16–256 px), the version from
`package.json` and the project's copyright (it showed Electron's own notice before this release).

## Changes in this milestone, reviewed

- **New IPC call `sc:setTheme`.** Accepts only `dark`, `light` or `system`, from the app's page only;
  it sets `nativeTheme.themeSource`. No other new IPC; `Open data folder` reuses the existing handler
  that can open only the app's own data folder.
- **Earlier data folders** (`electron/locations.cjs`). A list of data folders in the user's profile.
  Copying runs only after the user chooses it in a native dialog, only into a data folder with no
  projects, never overwrites, stages and verifies the copy, and only reads the source. A damaged list is
  ignored.
- **Thumbnails from storage** (`storedThumbs.ts`). Files are decoded with `createImageBitmap`, or for
  SVG through an `<img>` element, where SVG scripts never run; results are re-encoded as PNG. Asset ids
  are checked by the main process as before.
- **Readability, layout icon choice, export preview, new page dialog, sidebar.** Renderer-only code:
  no network, no filesystem, no dynamic code.
- **Development tools** (`bench/`, `tests/e2e/`, `scripts/brand-icons.mjs`) use Playwright from a global
  installation and run only on a developer's machine; they are not part of the build or the package.

## Secrets and personal data

`git grep` over the repository for keys, tokens, passwords, private keys, `.env` files, personal paths
(`C:\Users\…`, `/home/…`), data folders and project files found only obviously fake paths in two tests.
`.gitignore` excludes `data/`, `exports/`, `release/`, `e2e-out/`, `.env*` and project files.

## Remaining and limitations

- Not run on Windows here: the dark title bar, taskbar icon and the packaged `.exe` were inspected but
  not started on Windows.
- The executable is not code-signed (Windows SmartScreen will warn).
- Electron's asar integrity validation and "only load app from asar" fuses are not enabled; they could
  harden the packaged app further but need testing on Windows first.
- `npm audit` covers known advisories in the npm registry only.

## Addendum: release preparation, 2026-11-07

Checked on Windows 11 with Node 24, ahead of the first public alpha.

- **Electron 44.10.2** (patch update within `^44`): backports upstream Chromium, V8, Skia, PDFium,
  ANGLE and WebRTC fixes. Electron 44 is the oldest of the three supported major lines (46, 45, 44), so
  plan the move to a newer major before 44 reaches end of support.
- **Fuses now on:** `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`;
  `GrantFileProtocolExtraPrivileges` is off (the app serves itself over `app://`). The packaged app
  started normally on Windows 11 (window shown, earlier data migrated); after changing one byte of
  `resources/app.asar` it exited at once with code 1 and wrote nothing.
- **Configuration re-read in the code:** `contextIsolation`, `sandbox`, no `nodeIntegration`,
  `webviewTag: false`; CSP sent as a response header for HTML from `app://`; navigation outside
  `app://showcase/`, new windows and webviews refused; every request other than `app:`, `blob:`,
  `data:` and `devtools:` cancelled; permissions limited to clipboard writing and fullscreen; IPC only
  from the app's own page; writes only to dialog-chosen paths (`safeJoin`), stored IDs and keys checked
  against allow-lists; the smoke-test hooks (`SC_*`) work only in unpackaged runs.
- **Dependencies:** `npm audit`: 0 vulnerabilities. The `@electron/asar` overrides are still needed: its
  latest release (4.3.1) still declares `glob ^13` and `minimatch ^10`.
- **Distribution:** `npm run package` writes the ZIP from the fresh build and refuses one that contains
  `data/` or `exports/`. Starting the packaged app here copied a developer's earlier projects into
  `data/` next to the exe (its intended one-time migration), which is why zipping by hand is no longer
  part of the release steps.
- **Still open:** builds are not code-signed (SmartScreen warns); `npm audit` covers known registry
  advisories only.
