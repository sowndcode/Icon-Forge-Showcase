# Development

## Commands

| Command | What it does |
| --- | --- |
| `npm run app` | Builds the interface when the sources changed and opens the desktop app |
| `npm run dev` | Interface in a browser at http://localhost:5183 (uses the browser's storage, not `data/`) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Typecheck and production build of the interface into `dist/` |
| `npm run package` | Portable Windows folder in `release/` (also `build_exe.bat`) |

`npm run app` also downloads the Electron runtime if npm skipped it. The packaged folder is unsigned
and meant for personal use; versions, the release checklist and how to update an installed copy are
in [RELEASING.md](../RELEASING.md).

## Visual and end-to-end checks

These are not part of `npm test`. They drive the interface in Chromium with Playwright from a global
installation, against a freshly started `npm run dev`:

| Script | Checks |
| --- | --- |
| `node tests/e2e/run.mjs` | Review, the import dialog and the Export workflows |
| `node tests/e2e/audit-templates.mjs` | Every template under several themes as contact sheets, with a measured readability check |
| `node tests/e2e/settings.mjs` | Every Settings page |
| `node bench/run.mjs` | Layout and rendering performance ([performance.md](performance.md)) |

`audit-templates.mjs` takes `--themes=`, `--n=` (icon count) and `--title=`, which is the quickest way
to see how a template change behaves with small packs, large packs and long names.

## Source tree

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

## Templates and themes

- Templates are `TemplateDef` entries in `src/state/generators.ts`. A build function returns a page;
  use `titleText` / `leftText` for titles so long pack names shrink or wrap instead of overflowing.
- **Tilted Wall Cover and Ribbon Cover are frozen.** `tests/protectedTemplates.test.ts` compares
  their full output with a snapshot; shared helpers must not change it.
- Themes are entries in `src/core/themes.ts`: a background, a title look, a subtitle colour and
  badge colours. `tests/themeSeparation.test.ts` and `tests/readability.test.ts` check contrast.
- `src/core/templateFit.ts` holds the icon-count ranges behind *Smart template recommendations*.
  Give a new template an entry there, or leave it out and it is simply never labelled.

## A note on dev mode

`npm run dev` in a browser uses the browser's own storage (IndexedDB), not the `data/` folder, and
has no access to the desktop file dialogs. Use `npm run app` to test anything about storage.
