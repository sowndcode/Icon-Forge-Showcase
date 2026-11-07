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

6. Build the Windows app folder (unsigned, portable).

   ```bash
   npm run package
   ```

   The result is `release/IconForgeShowcase-win32-x64/`. Zip that folder for distribution. It never
   contains `data/` or `exports/`.

7. Smoke-test the packaged app on Windows: start it, check the window and taskbar icon, open Settings ▸
   About (version, data folder), create a project, import a few PNGs, export one page, close and
   reopen (the project is still there).

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

## Reproducibility

- `package-lock.json` pins every dependency; `npm ci` installs exactly those.
- `overrides` in `package.json` raise `glob` and `minimatch` inside the packaging tool
  (`@electron/asar`) to versions without the GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249 advisories.
  Remove them when `@electron/asar` depends on those versions itself.
- The Electron version is pinned by the lockfile; `@electron/packager` downloads the matching runtime.
- Packaged builds turn off Electron's run-as-Node mode, `NODE_OPTIONS` and inspector arguments
  (`scripts/package.mjs`).

## Updating an installed copy

The app keeps its data in a `data` folder next to `IconForgeShowcase.exe`.

- **Easiest:** close the app and copy the new release's files over the old ones. `data/` is not part
  of a release, so it is never replaced.
- **New folder:** extract the new release somewhere else. On its first start it finds the projects of
  the earlier copy and offers to copy them (the earlier folder is only read and stays as it was).
- Never delete the old folder before the new copy shows your projects.
