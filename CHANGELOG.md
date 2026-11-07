# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0-alpha.1] - Unreleased (not tagged yet)

Everything below up to 0.1.0-alpha.1 is part of this version. This milestone's polish comes first.

### Fixed

- **Deleting the open project** made a new "Untitled showcase" and opened Import. It now closes the
  project and shows Home with no project open; nothing is created. Deleting another project never
  touches the open one, and a save already being written can no longer bring a deleted project back.
- **Phantom projects:** a start with no project to restore created and saved an empty project.
- **Themes rearranged icons:** choosing another Look for a template page made before template keys
  existed rebuilt it and laid the icons out again. A Look now only restyles; a theme's title look can no
  longer turn a title into a badge or bend it.
- **Guide progress** was worked out from the open project, so some lessons (background, export) could
  never be completed and progress changed with the project. See Changed.
- Preferences changed just before closing or reloading the window were lost.
- **Review showed the wrong page.** After selecting a page of another size (e.g. 1920×1080 after
  630×500), Review could show the previous page's composition stretched into the new page's frame
  until the new render finished; 100% looked right only because it starts a fresh canvas. Review,
  the Export preview and the Watermark preview now only ever show a render of the selected page, show
  a spinner while it is on the way, cancel renders of pages already left, and render Thumbnail and
  Crops views once. Review matches the exporter's pixels.
- **Add assets from a project showed empty tiles.** Each thumbnail's object URL was revoked as soon as
  it was set. Thumbnails are now decoded at tile size from the stored files, a few at a time, with
  distinct Loading, Missing and Unreadable states; only the visible rows are mounted (about 56 tiles for
  2,268 assets). The source project is still only read.
- **Dark text on dark panels.** Minimal light (and other light themes) gave the titles of templates
  with dark panels — Tilted Wall, Ribbon, Title Band, Launch Banner Strip, Square Cover — near-black
  text on near-black panels (1.07:1). Theming now measures the colour behind each text (background
  plus panels, translucent ones included) and only where the theme's colour reads clearly worse than on
  the theme's own background picks the theme's most readable colour. Deliberate pairings (Horror's red
  on black) are untouched. Text whose fill matched its own thick outline gets a distinct outline.
- **Very long pack names** made template titles wider than the page or their panel; such text is now
  scaled to fit.
- Selecting thousands of objects no longer expands groups quadratically.

### Performance

- **Ground Plane with thousands of icons** (measured at 2,267 icons, see `docs/performance.md`): a pan
  frame 35 → 1.5 ms, a wheel-zoom frame 675 → 1.4 ms (worst 8.4 s → 1.8 ms), work after a zoom stops
  56 s → 0.4 s, first frame after applying the layout 1,258 → 541 ms, export render 166 → 104 ms.
  Perspective Floor pans in 1.7 ms instead of 150 ms. Exports and previews keep full resolution and
  exact warps; the editor may show a fast warp of the same four corners for a frame or two while the
  exact one is made.
- `bench/` measures the layout action, the editor frame by frame and the export render with the app's
  own modules.

### Added

- **Icons per layout:** Layout ▸ Icons ▸ Choose… picks which icons a layout uses: all, categories, a
  hand-picked set, a seeded random subset, or a saved choice. Only that layout's icons change, in one
  undo step; background, theme and text stay. Rebuilding or reshuffling keeps the choice, and the panel
  offers Update when imports change what a choice stands for.
- **Export preview:** wheel zoom at the pointer, drag to pan, Fit, 100%, zoom in / out, Reset and a
  larger preview; keys 0, 1, + and −. The view never changes the files.
- **New page dialog:** name and size on top, then sizes as proportional cards (Popular first, store
  and platform categories, search) or templates with rendered thumbnails, and one Create button.
- **Projects of another copy of the app:** a new copy started from another folder (e.g. a release
  extracted elsewhere) with no projects offers to copy the projects and settings of the earlier copy.
  The copy is staged, checked file by file and only then put in place; the earlier folder is only read.

### Changed

- **Projects:** File ▸ Close project (also on Home and the project's card) saves, waits for the
  write, and leaves no project open; the next start respects it. If saving fails the project stays open
  unless you choose otherwise. Switching projects saves the first and loads the second with fresh
  editor state. With no project open, Home and the Guide are the only workspaces.
- **Home:** the open project in one row (Continue, Generate pages, Export, Close project), then Recent
  projects as Compact, Grid or Hidden (remembered across restarts; thumbnails load only when shown),
  then a compact row of popular sizes. The store set, custom set, catalog and category generators moved
  to Generate pages.
- **Guide:** optional (no banner on Home, nothing starts by itself; the editor's Quick start shows only
  on an empty page). Lessons complete when you do them (import, layout, title, background, export…) or,
  for reference lessons, when marked as read; progress is global and kept across restarts, with a
  current-lesson indicator, Next on every lesson and a finish message. Instructions match the app.
- **Export** in the header, File ▸ Export… and Ctrl+E open the Export workspace (with the open page
  selected) instead of the older compact dialog; Back returns to the workspace you came from. The
  Export tab beside the canvas stays for quick changes.
- **Sidebar:** the collapse / expand button stays at the top in both states; the icon rail has
  tooltips (hover and keyboard focus); section headings sit closer to their items.
- **Branding:** the header's mark is the one logo for the window, taskbar, executable, About and
  favicon (`assets/brand/`, `scripts/brand-icons.mjs`; icon sizes 16–256 px). On Windows the app has its
  own taskbar identity, and the native title bar follows the app theme.
- **Settings:** shortcuts are separate keycaps that wrap only between alternatives; the About data
  folder is shortened in the middle with Copy and Open buttons; the version shown comes from
  `package.json` only.
- **Versioning:** see `RELEASING.md` for the version policy and the build and release steps.

### Release engineering

- **`npm run package` also writes the ZIP to share**, `release/IconForgeShowcase-<version>-win-x64.zip`,
  straight from the fresh build. A copy of the app that has been started keeps the user's projects and
  logs in `data/` next to the exe, so the script refuses to zip a folder with `data/` or `exports/`.
- **Licence notices ship with the app:** the build adds `THIRD_PARTY_LICENSES.txt` (the full licence of
  every package bundled into the interface, including the Geist fonts' SIL Open Font License), this
  project's `LICENSE.IconForgeShowcase.txt` and `THIRD_PARTY_NOTICES.md`, next to Electron's own notices.
- **Continuous integration:** GitHub Actions runs typecheck, unit tests, the production build and
  `npm audit` on Windows for every pull request and every push to `main`.
- `.gitattributes` keeps test snapshots LF (on Windows every `npm test` used to mark them modified) and
  batch files CRLF.
- The README's install section separates the portable Windows build from running from source.

### Security

- The packaging tool's `glob` and `minimatch` (through `@electron/asar`) are raised with npm
  `overrides` past GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249; `npm audit` reports none. These were
  build-time only and not reachable from the app. Report: `docs/security-review-0.2.0-alpha.1.md`.
- The new native call (title bar theme) accepts only `dark`, `light` or `system` from the app's own page.
- **Electron 44.10.2**, with backported Chromium, V8, Skia, PDFium, ANGLE and WebRTC fixes.
- **Packaged builds verify their own code:** the embedded asar integrity check and "only load the app
  from the asar archive" fuses are on, and the `file://` extra-privileges fuse is off (the app uses its
  own `app://` protocol). A build whose `app.asar` was changed by one byte refuses to start.

### Known issues

- The packaged app was started on Windows 11 (start-up, migration of earlier data, window shown,
  integrity check). Its taskbar icon, dark title bar and Snap Layouts were not inspected visually, and
  the editor's desktop-only paths (save dialogs, folder export) were last exercised on Linux.
- The first start of a copy that migrates data from a version before the file-based storage took about
  45 seconds on Windows 11 before the window appeared; later starts don't migrate.
- Text placed directly over icons is not checked for readability (only backgrounds and panels).
- The template audit (68 templates under 7 themes) flags one low-contrast line: "FULL PACK" in
  Demo · Split Grid (wide) under Minimal dark (2.57:1). Horror's red titles on black (about 2.8:1) are
  intentional.
- Very long pack names fit by shrinking the title; pixel fonts become hard to read at that size.

### Security, reliability and large packs

- Export file names can no longer be Windows device names (`CON`, `NUL`, `COM1`…), contain control
  characters or exceed ~155 characters; the desktop process cleans every path segment it writes too.
- Damaged or hand-edited project files open with whatever is usable instead of failing or crashing
  every redraw (null or unknown objects, non-numeric sizes, fields of the wrong type).
- Autosave retries every 5 s after a failed write (full disk, locked file), reports it once and
  confirms when saving works again.
- Cluster, Round Cluster, Dual Cluster and Scatter are 1.4–11× faster with thousands of icons, with
  identical placements (Cluster at 3,000 icons: 25 s → 2.3 s).
- Icon previews shrink as packs grow (512 px up to 500 icons, down to 160 px from 3,000); originals are
  still used when zoomed in and for export. 2,000 icons of 512 px: 2.0 GB → 0.28 GB of bitmaps.
- Images left behind by an interrupted import are moved to the trash after a week (kept 30 days);
  Settings ▸ Storage shows where the space goes.

### Added (export, watermark, review, layouts, settings)

- **Watermark workspace** between Arrange and Review. The watermark is stored with the project and drawn
  over finished pages in Review and exports, never into them. Text (with `{brand}`, `{project}`, `{year}`,
  `{date}`, `{count}`, `{page}`) and logo layers, several layers at once, one mark, a repeated pattern
  or a mark on each icon, nine anchor points plus dragging, sizes relative to the page, outline and
  shadow, page scope, ten presets, saved presets and favourites, and **Suggest placement**, which picks
  the corner that covers no text or icons and a colour that reads there. Off for new projects unless
  turned on in Settings.
- **Export workspace:** page list with file names, an output preview at Fit or 100% that shows the
  exact file (format matte, transparency, watermark), estimated file size, grouped settings, presets
  that can be saved, renamed, duplicated, updated, starred and deleted, three new built-in presets, and
  **watermarked, clean or both** (`cover.png` plus `cover_preview.png`). Long exports can be cancelled.
- **Review:** previous/next page with ← → and Page Up/Down, Watermarked / Clean / Side by side, a
  pixel-accurate 100% view, platform crops (1:1, 16:9, 4:5, itch.io 630:500, 3:1), and warnings for
  watermarks at the page edge, over text, with a missing logo, or JPG exports of transparent pages, with
  one-click fixes. Layouts that crop on purpose (Tilted Wall, Endless Floor, Crop Frame) no longer get
  edge warnings.
- **Ground Plane layout:** icons lie flat on a receding floor, foreshortened like cards on a table,
  with editable plane corners. Perspective Floor (icons standing upright) is unchanged.
- **Grid:** new grids cap their cell size (Largest cell, 36% by default) so a few icons stay a sensible
  size and the grid sits centered; quick styles Contact sheet, Airy, Tight, Shelf and Honeycomb.
- **Perspective Floor, small packs:** new floors with fewer than 40 icons use fewer, deeper rows with
  steady size progression.
- **Layout picker:** search, type filter, recently used and larger previews with descriptions.
- **Inspector:** shared operations for several selected objects (opacity, rotation, scale each, order,
  hide and lock all, with Mixed values); layers search and type filter; text styles with search,
  groups, favourites and recently used.
- **Settings:** search (Ctrl+F); new sections Projects & autosave, Watermark defaults and Performance
  (undo steps); layout defaults for new floors and grids; export watermark mode; reset one section;
  copy the data folder path; copy diagnostics (versions, platform and display settings only — no paths,
  names or project contents). Restoring defaults keeps favourites, recents, pinned projects and the
  brand name.

### Compatibility (phase 2)

- Grids and Perspective Floors saved before these changes keep their exact arrangement: the new options
  default to off for saved layouts and are only switched on for new ones. Snapshot tests recorded from
  the previous code guard both (1–500 icons, several option combinations).
- Projects without a watermark load and export exactly as before.

### Fixed (state consistency)

- **Changing the text style of a template page (Pixel → Pixel ++, Smooth…) no longer resets its theme**
  or colours you picked. Template options are now stored per page instead of being global, an option
  change rebuilds only the page it was made on and only the aspect it names, and nothing rebuilds a page
  on its own (switching pages, opening a project or the icon palette finishing loading used to).
- A theme applied from the Themes tab is remembered as the page's look, so later option changes keep it.
- Applying a text preset or saved style keeps the text's size and alignment; style edits always merge
  into the current document state.
- Themed covers no longer wrap their title onto the count badge (Card Grid, Shelf, Sticker and demo
  covers); text that no longer fits is scaled to fit.

### Added

- New projects start with no assets; reuse chosen assets from any saved project (copied; the source
  project is not changed). Import ▸ From a project does the same for the open project.
- Asset preview (double-click / right-click), adjustable import grid, filters, exact-duplicate detection
  by content with a choice to skip or keep copies.
- Page strip: All / Invert selection, Shift ranges from the last clicked page, the open page's
  background for the selected pages, export one page; library actions apply to the selected pages.
- 15 professional themes, 8 readable variants from your icons' colours (with Shuffle), readability notes,
  20 new backgrounds, 13 clean templates, 13 clean elements.
- Libraries: search, favourites, recently used, before/after preview, scope line, My backgrounds,
  My elements, template variants and updates, import themes/backgrounds/templates from another project.
- Templates: apply layout only, background only or text style only, to one or several pages.
- Smart text: Simple and Advanced modes, coordinated looks, background-aware suggestions, contrast
  check, Improve contrast, Reduce effects, Reset.
- Home: Continue card, pinned projects, multi-select delete, sizes grouped by use.
- Guide: twelve interactive tutorials and "Show me how" links; outdated instructions corrected.

### Compatibility

- Tilted Wall Cover and Ribbon Cover are unchanged; snapshot tests recorded from the previous version
  guard them. Existing theme and template ids are kept. Pages store the styles a theme gave them, so
  improved theme definitions (Kawaii and Spring outlines) do not change existing pages unless a theme
  is applied again. Pages saved before options were stored per page show the options read from their
  build record.

### Changed

- **Redesigned interface.** A navigation sidebar now holds every workspace (Home, Import, Compose,
  Arrange, Review, Export) and every library section (Assets, Templates, Backgrounds, Themes, Elements),
  with counts; it collapses to an icon rail, and does so on its own while editing in narrower windows.
  The library, canvas and inspector sit side by side as cards. The canvas tools moved to a floating dock
  at the bottom of the canvas, the page strip moved into the canvas card, and the header holds the menus,
  the project name, undo/redo and Export.
- **Home** shows the open project at a glance: its pages as rendered thumbnails, the asset count and
  each category, then the generators, blank sizes and recent projects.
- **New look throughout:** graphite surfaces, one accent colour, Geist and Geist Mono (bundled, works
  offline), quiet hairlines instead of heavy borders, an off-white primary button, and the same
  controls, menus, dialogs and notifications on every screen. Categories get a colour dot in Home,
  Import and the library filter. The light theme follows the same system.
- Template options in the Templates tab fold away under **Options** (their summary stays visible).
- On narrow canvases the overlay toggles in the canvas bar hide; they stay in the View menu.

### Fixed

- **Typed text no longer resets** when a template page's Look, Text, Icons or Format option changes in
  the Templates tab. The page used to be rebuilt from scratch; the new build is now merged in. Your
  words, moved, added and deleted objects, and anything an unchanged option controls (for example a
  background you picked) stay as you left them. Replacing a page with another template carries your
  title, subtitle and badge text across, and remembers text the new template has no place for.
- Opening a `.showcase` file or duplicating a project no longer leaves live template and catalog pages
  pointing at the old icons (rebuilding them gave empty pages).
- Generated variations no longer turn back into their template when a template option changes.
- The library panel no longer shifts sideways when a half-hidden tab is clicked, and the Templates tab
  options are no longer cut off ("Everyt…", "As de…").
- Interrupted exports (full disk, crash) no longer leave a half-written image under the real name, and
  write errors say what went wrong (disk full, read-only, file in use…).
- Errors from the desktop shell no longer start with "Error invoking remote method…".
- A failed attempt to open a project file now shows an error instead of doing nothing.

### Added

- **My themes:** save a page's look as a theme, then apply, rename, duplicate or delete it. Saved themes
  also appear under Templates ▸ Look.
- **Share Codes** for custom themes and templates: Copy share code, send the text, Import share code.
  The import checks the code, shows a preview and adds it only when you confirm. Codes hold the design
  only, never images, project files, file paths or anything about your computer, and work offline.
- Rename for saved templates.

### Changed

- Interface polish (guided by the Unslop design skill): one accent per screen, no gradients or glows in
  the chrome, hover never moves tiles, sentence-case labels, no text below 11 px, consistent radii and
  motion, a visible keyboard focus ring everywhere, and the system "reduce motion" setting is respected.
  Built-in themes, templates and the images you export are unchanged.
- Muted interface text has more contrast.

### Security

- Paths from the window are checked with backslashes as separators on every system (not only Windows),
  and paths containing NUL characters are refused.
- `presets.json` of the wrong shape is set aside instead of overwritten; presets are checked for kind,
  name and size when saved.
- Opening a file larger than 2 GB is refused instead of exhausting memory.

## [0.1.0-alpha.1] - Unreleased

The first public Alpha. The app was previously developed under the name Asset Forge Showcase.

### Features

- **Desktop app** (Electron) for Windows that runs fully offline, started with
  `Start Icon Forge Showcase.bat` or `npm run app`.
- **Import:**
  - files or whole folders of PNG, WebP, JPEG, AVIF, GIF and BMP images
  - subfolders become categories, auto-categorize from file names, multi-select in the library
  - alpha analysis of each image's visible bounds
- **Canvas editor:**
  - move, scale, rotate, flip, group and lock objects; smart guides while moving and resizing
  - text, shapes, guides, a safe zone, and a focal region that layouts keep clear
  - undo/redo; multi-page projects with page multi-select
- **34 smart layouts,** including perspective layouts (endless floor, tilted wall, perspective floor and
  wall). Layouts are seeded; hand-placed objects are pinned.
- **55 built-in templates:** itch.io covers, wide thumbnails, square & social, banners & headers, free
  demos, sales & comparisons, and catalogs up to 4K. Template options for theme, pixel text and icon size
  apply live.
- **60 canvas size presets** for itch.io, Steam, asset stores, social media and video.
- **Text styles and badges:** gradient fill, outlines, 3D depth, glow, shadow, curved text and
  pixel-style text.
- **Backgrounds and themes:** procedural backgrounds, plus backgrounds and themes built from the
  imported assets' colours; a colour picker with suggestions from your icons.
- **Image effects:** opacity, grayscale, glow and outline; shapes can affect what lies below them.
- **Review** view with store-card mock-ups and composition warnings.
- **Export:** PNG, WebP and JPEG at any scale, batch export with naming patterns, and existing files
  are never overwritten.
- **Projects:** autosave, a project browser, and portable `.showcase` files.

### Storage and data safety

- **File storage:** all app data is saved as plain files in `data/` inside the app folder: projects,
  original images, settings, presets, autosaves, cache and logs. Paths are resolved from the app's
  location, so paths with spaces work.
- **One-time migration** from the browser storage used by earlier development builds
  (`%APPDATA%\asset-forge-showcase`):
  - copy only; the original is never modified or deleted
  - conflicts are kept side by side
  - a report is written to `data/migration/`
  - progress is shown on the start-up screen
- **Atomic writes and autosaves:** project files are written atomically, and earlier versions are kept
  as autosaves (last 10 per project). A damaged project file is set aside and restored from the newest
  autosave.
- **Trash:** deleting a project moves it, with its images, to `data/trash`. It can be restored or deleted
  permanently from Settings → Storage → Trash.
- **Undo after deleting assets:** images removed from a project are kept for 30 days, so Undo brings
  them back. Previously, undoing such a deletion left the assets without their image files.
- **Logs:** a local log in `data/logs` (rotated, kept 30 days, with the app folder, home folder and user
  name hidden).
- **Default export folder:** `exports/`.

### Security

- **Bridge calls** into the main process are accepted only from the app's own page.
- **Storage IDs and file paths are validated,** so nothing can be read or written outside the app's
  folders or folders you choose.
- **App files:** fixed a path check in the `app://` file server that could reach a sibling folder.
- **Browser permissions** (camera, microphone, location, notifications…) are denied, and webviews are
  blocked.
- **Dev server:** limited to files inside the project folder.
- **Electron** updated to 44.10.1. `undici` (packaging tool) updated to 7.30.1.
- **Development tools** upgraded (Vite 7, Vitest 4), which closes the dev server and test runner advisories.
  Node.js 20.19+ or 22.12+ is now required.
- **Packaged builds** turn off Electron's run-as-Node mode, `NODE_OPTIONS` and the inspector arguments, and
  no longer include source maps.
- **`.showcase` files:** archives that unpack to far more than their size are refused, and files the
  project doesn't use are ignored, so they can't replace stored images.
- **Opening a file** no longer also grants permission to write to it.

### Known issues

- **The packaging tool** still has moderate advisories, through `@electron/asar`, `glob` and `minimatch`,
  and the only suggested fix is a downgrade. It runs only when building, on this project's own files, and
  isn't part of the desktop app or reachable from it.
- **Windows is the only tested platform.**
