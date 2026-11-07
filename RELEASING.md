# Versions and releases

## Versioning

Icon Forge Showcase follows [Semantic Versioning](https://semver.org/). The version is written in one
place, `package.json` (and its lockfile, updated by npm). Everything else reads it:

- the desktop shell: `app.getVersion()` (window log, About ▸ System),
- the interface: `src/version.ts`, filled in by Vite at build time (`vite.config.ts`),
- the packaged app: `@electron/packager` stamps it into the executable's file properties.

No other file spells out a version number.

| Version | Meaning |
| --- | --- |
| `0.2.0-alpha.1` | This milestone: polish, performance, fixes, branding, release engineering |
| `0.2.0-alpha.2`, `-alpha.3`… | Further alpha stabilisation of 0.2 |
| `0.2.0-beta.1` | First beta candidate: feature-complete for 0.2, only fixes after this |
| `0.2.0` | The finished 0.2 release |
| `0.2.1` | Fixes on top of 0.2.0 (no new features, project files stay compatible) |
| `1.0.0` | First stable release, when the project format and the core workflow are settled and tested on the supported platforms |

Before 1.0.0 a minor version (0.3.0) may change behaviour. Saved projects stay readable in later
versions either way: a change to the project format comes with a tested, non-destructive migration.

## Making a release

Releases are made by a maintainer. Nothing is published or tagged automatically.

1. Start from a clean checkout of the commit to release.

   ```bash
   git status
   ```

2. Set the version (updates `package.json` and `package-lock.json`, no Git tag yet).

   ```bash
   npm version 0.2.0-alpha.2 --no-git-tag-version
   ```

3. Move the `[Unreleased]` notes in `CHANGELOG.md` under the new version and date.

4. Install exactly what the lockfile says, then check everything.

   ```bash
   npm ci
   ```

   ```bash
   npm run typecheck
   ```

   ```bash
   npm test
   ```

   ```bash
   npm run build
   ```

   ```bash
   npm audit
   ```

5. Run the end-to-end checks against a freshly started dev server (a dev server that has been running
   during edits serves some modules under new URLs, which the checks cannot reach).

   ```bash
   npm run dev
   ```

   ```bash
   node tests/e2e/run.mjs
   ```

6. Build the Windows app (unsigned, portable) and its ZIP.

   ```bash
   npm run package
   ```

   This writes `release/IconForgeShowcase-win32-x64/` and, from that fresh folder,
   `release/IconForgeShowcase-<version>-win-x64.zip`. **Upload that ZIP, never a ZIP you make by hand:**
   once the app has been started, the folder holds your own projects, settings and logs in `data/`.
   The ZIP also carries the licence notices (`LICENSE`, `LICENSES.chromium.html`,
   `LICENSE.IconForgeShowcase.txt`, `THIRD_PARTY_LICENSES.txt`, `THIRD_PARTY_NOTICES.md`).

7. Smoke-test on Windows **from the ZIP**, not the build folder: extract it to a new folder, then

   - start `IconForgeShowcase.exe` (SmartScreen: More info ▸ Run anyway); the window and taskbar show the
     app icon and the title bar follows the theme;
   - Settings ▸ About shows the new version and a `data` folder inside the extracted folder;
   - create a project, import a folder of PNGs (subfolders become categories), apply a template, change
     the theme, then export one page as PNG and open the file;
   - save with Ctrl+S to a `.showcase` file, close the app, reopen it: the project is still there; open
     the `.showcase` file too;
   - delete a project, then restore it from Settings ▸ Storage ▸ Trash;
   - check `data/logs/main.log` for errors.

   A copy started with an earlier version's data on the same PC offers or performs a one-time
   migration; test on a PC (or Windows account) without earlier data as well, to see the first-run
   experience new users get.

8. Commit the version change, then tag it once the release is approved.

   ```bash
   git commit -am "Release 0.2.0-alpha.2"
   ```

   ```bash
   git tag -a v0.2.0-alpha.2 -m "Icon Forge Showcase 0.2.0-alpha.2"
   ```

   ```bash
   git push origin v0.2.0-alpha.2
   ```

9. On GitHub, draft a release from the tag: title `Icon Forge Showcase <version>`, notes from
   `docs/releases/` (copy the latest file and update it) and the `CHANGELOG.md` section, the ZIP from
   step 6 as the only asset, and **Set as a pre-release** for alpha and beta versions. Check the draft,
   download the asset once from the draft page and compare its size with the local ZIP, then publish.

## Reproducibility

- `package-lock.json` pins every dependency; `npm ci` installs exactly those.
- `overrides` in `package.json` raise `glob` and `minimatch` inside the packaging tool
  (`@electron/asar`) to versions without the GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249 advisories.
  Remove them when `@electron/asar` depends on those versions itself.
- The Electron version is pinned by the lockfile; `@electron/packager` downloads the matching runtime.
- Packaged builds turn off Electron's run-as-Node mode, `NODE_OPTIONS` and inspector arguments, load
  the app only from `app.asar`, verify that archive against the hash embedded in the executable, and
  turn off the extra `file://` privileges (`scripts/package.mjs`).
- GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, unit tests, build and `npm audit` on
  Windows for pull requests and pushes to `main`. It doesn't package or start the app.

## Updating an installed copy

The app keeps its data in a `data` folder next to `IconForgeShowcase.exe`.

- **Easiest:** close the app and copy the new release's files over the old ones. `data/` is not part
  of a release, so it is never replaced.
- **New folder:** extract the new release somewhere else. On its first start it finds the projects of
  the earlier copy and offers to copy them (the earlier folder is only read and stays as it was).
- Never delete the old folder before the new copy shows your projects.
