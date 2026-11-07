# Benchmarks

Development tools for measuring layout and rendering performance with real modules of the app.
They are not part of the build or of `npm test`.

```bash
npm run dev
```

```bash
node bench/run.mjs --page=editor
```

```bash
node bench/run.mjs --page=index
```

- `editor.html` mounts the real editor canvas at 1600×900 and times every animation frame while it
  applies a layout, pans, zooms with the wheel and moves the pointer over the selection.
- `index.html` times the layout action, the page renderer without the editor's caches, hit testing
  and the export render.
- `profile.mjs` records a CPU profile of `index.html` and prints the functions with the most self time.

Options: `--n=20,180,1000,2267` (icon counts), `--alg=floor,groundplane` (layouts), `--url=` (another
dev server, e.g. an older checkout for before/after comparisons).

Playwright is used from a global installation; it is not a project dependency. Absolute numbers
depend on the machine and on whether Chromium has a GPU (headless runs here use software
rendering), so compare runs made on the same machine only.
