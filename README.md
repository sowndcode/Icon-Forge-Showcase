# Icon Forge Showcase

> **Status: Alpha.** Usable day to day, but expect rough edges, and back up anything important
> (Ctrl+S saves a portable `.showcase` file).

Icon Forge Showcase is a local desktop tool for turning a folder of transparent game assets (icons,
items, sprites) into marketplace images: itch.io covers, wide thumbnails, social posts, banners, free-demo
covers and full catalogs.

**Everything runs on your computer.** Images are decoded locally and saved as files in the `data` folder
next to the app. There are no uploads, accounts, telemetry or AI services, and the desktop app blocks all
network requests.

## Development status

Icon Forge Showcase is in early alpha and is actively being developed. Features, menus and the look
of the app still change from version to version.

Your feedback shapes what comes next. If something breaks, feels confusing or is missing, please open
an issue to report a bug or suggest a feature. Notes on how you use the app are welcome too.

If the project grows an active community of users, a larger overhaul of templates, customization and
layout flexibility is being considered. Nothing is scheduled yet, and there are no promised dates.

## Features

- **Import** files or whole folders (PNG, WebP, JPEG, AVIF, GIF, BMP). Subfolders become categories, and
  auto-categorize suggests categories from file names. Alpha analysis finds each image's *visible* bounds,
  which every layout, alignment tool and snap uses.
- **Compose** on a canvas: move, scale, rotate, flip, group and lock objects; add text, shapes, guides,
  a safe zone and a focal region that layouts keep clear. Smart guides appear while moving and resizing.
- **35 smart layouts**, including grid, packed grid, honeycomb, masonry, rows, columns, circle, arc,
  spiral, scatter, clusters, bands, edge frame, fan, pyramid, cascade, custom path, and perspective
  layouts (endless floor, tilted wall, perspective floor and wall, and ground plane with icons lying
  flat). Random layouts are seeded, and objects you move by hand are pinned. The picker has search,
  favourites, recently used and live previews of your own icons.
- **68 built-in templates** in groups: itch.io covers, clean & professional, wide thumbnails, square &
  social, banners & headers, free demos, sales & comparisons, and catalogs (up to 4K). Templates can
  follow a colour theme, including themes built from your icons' colours. Each template page keeps its
  own options; changing one (for example Pixel → Pixel ++) changes only what it names. Right-click a
  template to apply only its layout, background or text style.
- **Themes:** 51 built-in themes (15 restrained professional ones) plus clean light, dark, soft, vivid,
  warm and cool variants made from your icons' colours with readable contrast. Search, favourites,
  recently used, a before/after preview, and apply to several selected pages at once.
- **Local libraries:** your themes, backgrounds, templates and elements are kept on this computer and
  available in every project; import them from another project's pages without changing it.
- **My themes and Share Codes:** save a page's look as your own theme, and share custom themes and
  templates as a short text code that others paste in (checked and previewed before it's added; no
  images or personal data inside, works offline).
- **60 canvas size presets** for itch.io, Steam, asset stores, social media and video.
- **Text and badges:** titles, badges, labels and pixel-style text, with gradient fill, outlines, 3D
  depth, glow, shadow and curved text. `{count}` in any text shows the current number of assets. Simple
  mode offers coordinated looks and suggestions that read on the actual background, with a contrast
  check and one-click fixes; Advanced mode has every control.
- **Backgrounds:** solids, gradients, mesh blends, procedural patterns and spotlight glows, plus
  backgrounds and themes matched to your assets.
- **Image effects:** opacity, grayscale, glow and outline, and shapes that can affect what lies below them.
- **Watermark:** a project watermark of text and logo layers (single, repeated or on each icon) drawn over
  pages in Review and exports, never into them, with presets and smart placement.
- **Review:** page by page at Fit, pixel-accurate 100% or thumbnail sizes, platform crops, store-card
  mock-ups, clean / watermarked / side by side, and composition warnings with one-click fixes.
- **Export:** PNG, WebP or JPEG at 1×, 2×, 4× or a custom scale. Each page is rendered fresh at the
  target resolution from the original files. Batch export uses a naming pattern (`{project}`, `{page}`,
  `{index}`, `{w}`, `{h}`, `{date}`, `{time}`), and existing files are never overwritten. The Export
  workspace previews the exact output file, manages presets, and can save a clean and a watermarked
  copy of each page.
- **Projects:** new projects start with no assets (or reuse chosen assets from another saved project),
  autosave, a project browser with search, pinning and multi-select, recovery from autosaves, a Trash for
  deleted projects, and portable `.showcase` files (a zip of the project plus its original images and fonts).
- **Assets:** large preview with zoom and file details, adjustable grid, filters by format, transparency
  and size, and exact-duplicate detection by file content.
- **Guide:** twelve interactive tutorials that point at the real controls, work offline and remember
  where you stopped.

## Screenshots

**Home:** your project library, recent work and new-project sizes.
![Home](docs/screenshots/home.png)

**Import:** bring in icons, sort them into categories.
![Import](docs/screenshots/import.png)

**Templates:** ready-made store covers, one click to apply.
![Templates](docs/screenshots/templates.png)

**Themes and layouts:** restyle a page and pick from dozens of layouts.
![Themes and layouts](docs/screenshots/themes-and-layouts.png)

## Requirements

- **Windows 10 or 11** (64-bit). This is the only platform it's developed and tested on. The code is
  cross-platform Electron, but other systems are untested, and the launcher is a Windows `.bat` file.
- **Node.js 20.19+ or 22.12+** (LTS recommended) with npm.
- About 500 MB of disk space for dependencies (mostly the Electron runtime), plus space for your projects.
- An internet connection only for the first `npm ci`. The app itself works fully offline.

## Getting started (from source)

```bash
git clone <this repository>
cd <repository folder>
npm ci
```

Then either:

- **Double-click `Start Icon Forge Showcase.bat`.** It installs dependencies if needed, fetches the
  Electron runtime, builds the interface when the sources changed, and opens the desktop app; or
- run `npm run app` from a terminal.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Interface in a browser at http://localhost:5183 (uses the browser's storage, not `data/`) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Typecheck and production build of the interface into `dist/` |

There are no prebuilt downloads yet. `build_exe.bat` (`npm run package`) makes an unsigned, portable
Windows folder for personal use; it's not an official release. Versions, the release checklist and how
to update an installed copy are in [RELEASING.md](RELEASING.md).

Development checks beyond `npm test` (they use Playwright from a global installation and a freshly
started `npm run dev`): `node tests/e2e/run.mjs` (Review, import dialog and Export workflows),
`node tests/e2e/audit-templates.mjs` (every template under several themes, with a readability check),
`node tests/e2e/settings.mjs` (every Settings page), and `node bench/run.mjs` (layout and rendering
performance, see [docs/performance.md](docs/performance.md)).

## Where your data is saved

Everything the app manages stays inside its own folder. Paths are worked out from the app's location,
so the folder can be moved or renamed (spaces are fine). `data/` and `exports/` are never committed to Git.

```
data/
  projects/<id>/        each project (project.json, written atomically; meta.json = list info)
  projects/_files/      original imported images and fonts
  autosaves/<id>/       earlier versions of each project (last 10, at least 3 min apart, kept 30 days)
  trash/projects/       deleted projects with their images, until you empty the Trash
  trash/files/          single images removed from a project (kept 30 days so Undo can restore them)
  settings/             preferences, app state, presets, window position
  cache/                browser engine cache; safe to delete
  logs/                 main.log (rotated at 1 MB, kept 30 days; your home folder is shown as ~)
  migration/            report of data moved from earlier versions
exports/                default folder for save dialogs (you can choose any other folder)
```

- **Damaged files** are never deleted: they're renamed to `*.corrupt-<time>.json`, and the newest autosave
  is used instead.
- **Deleting a project** moves it, with its images, to the Trash (Settings → Storage → Trash). You can
  restore it from there; only **Delete permanently** or **Empty Trash** erases it, and both ask first.
- **Updating:** copy the new release over the old app folder (a release never contains `data/`), or
  extract it elsewhere: a new copy with no projects finds the projects of an earlier copy on this
  computer and offers to copy them. The earlier folder is only read. Don't delete an old folder before
  the new copy shows your projects.
- **Upgrading from versions before the file-based storage** (the app was called Asset Forge Showcase then), which kept data in
  `%APPDATA%\asset-forge-showcase`: the first start copies that data into `data/` and writes
  `data/migration/report.txt`. The original folder is left untouched.

## Project structure

```
electron/      desktop shell: main.cjs (window, app:// protocol, network block, dialogs, IPC),
               store.cjs (files in data/), migrate.cjs, paths.cjs, log.cjs, preload.cjs (the only bridge)
src/core/      document types, geometry, alpha analysis, collision, align/snap, palettes, catalog, warnings
src/layout/    layout plug-ins (one LayoutAlgorithm each), the registry and run.ts (pinning, slots, focal area)
src/render/    the shared renderer (editor and export), text layout, image cache
src/services/  storage, migration, analysis workers, exporter, file input/output
src/state/     zustand stores (document with undo history, UI, preferences) and actions by area
src/ui/        React interface: canvas editor, panels, dialogs, views
tests/         Vitest unit tests
scripts/       build helpers (ensure-build, packaging)
```

To add a layout, write a `LayoutAlgorithm` (parameters plus a pure `run(items, params, ctx)` that
returns visible-box placements) and register it in `src/layout/registry.ts`.

## Known limitations

- **Alpha:** the project file format may still change. Old projects are migrated when it does, but keep
  `.showcase` backups of important work.
- **Windows only** so far (see Requirements).
- **Fonts:** templates use fonts installed with Windows (e.g. Segoe UI, Bahnschrift, Impact). Other systems
  substitute similar fonts, so layouts can look different. Custom fonts can be imported per project.
- **The app folder must be writable.** If it isn't, the app warns you and saves to your user profile
  for that session.
- **Dev mode uses separate storage:** `npm run dev` in a browser uses the browser's own storage, not `data/`.
- **No auto-update and no signed builds.**
- **The packaging tool (`@electron/packager`)** has moderate advisories with no fix in its current version.
  It only runs when building, and isn't part of the app (see [CHANGELOG.md](CHANGELOG.md)).

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

- **Bugs:** open an issue with the *Bug report* template. Include your Windows version, steps to reproduce,
  and the relevant lines from `data/logs/main.log`. Check them for anything private first.
- **Security problems:** please don't open a public issue. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
