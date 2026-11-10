# Contributing to Icon Forge Showcase

Thanks for helping! This is an Alpha project, so focused bug reports and small, well-scoped pull requests
help the most.

## Reporting bugs

1. Search the existing issues first.
2. Open a new issue with the **Bug report** template and include:
   - what you did, what you expected, and what happened instead
   - your Windows version, and whether you started the app with the `.bat` file, `npm run app` or `npm run dev`
   - the app version (Settings → About)
   - relevant lines from `data/logs/main.log`, if any. Home-folder paths there are already shortened to
     `~`, but check for file or project names you'd rather not share.
3. Attach a `.showcase` file or screenshots only if they contain nothing private.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Suggesting features

Open an issue with the **Feature request** template. Describe the problem you're trying to solve (for
example, "a cover for a store that needs 800×450"), not only the solution. The project stays local-first:
proposals that need accounts, cloud services, telemetry or network access won't be accepted.

## Development setup

Requirements: Windows 10/11, Node.js 20.19+ or 22.12+ and npm.

```bash
npm ci
npm run app        # desktop app (data saved in ./data)
npm run dev        # interface in a browser at http://localhost:5183 (browser storage)
npm test           # unit tests
npm run typecheck  # TypeScript
npm run build      # typecheck + production build
```

Newer npm versions can skip Electron's download step during `npm ci`. `npm run app` and
`Start Icon Forge Showcase.bat` fetch the runtime when it's missing; you can also run
`node node_modules/electron/install.js` yourself.

[docs/development.md](docs/development.md) has a map of the source tree. Desktop-only code (file storage, dialogs, IPC) lives in
`electron/`, and the interface reaches it only through the small API in `electron/preload.cjs`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change. Avoid unrelated reformatting.
3. Before opening it, make sure all of these pass (GitHub Actions runs them, plus `npm audit`, on every
   pull request):
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
4. Add or update tests for behaviour you change (see `tests/`). Storage changes need tests in
   `tests/storage.test.ts`.
5. Describe what changed, why, and how you tested it, including manual checks in the desktop app for
   anything visual.
6. Never commit your `data/` or `exports/` folders, logs, or personal assets. `.gitignore` covers the usual
   places.

## Code quality expectations

- **TypeScript:** strict typing, no `any` without a reason in a comment.
- **Match the surrounding code:** naming, comment density, and small focused modules.
- **Keep it local-first:** no network requests, telemetry or remote content. The desktop shell blocks the
  network on purpose.
- **Never lose user data:** writes go through the atomic helpers in `electron/store.cjs`. Destructive
  actions move things to the Trash or ask for confirmation first, and damaged files are kept, not deleted.
- **Security:** don't loosen the Electron settings (`contextIsolation`, `sandbox`, no `nodeIntegration`).
  New native features go through a narrow IPC handler that validates its inputs.
- **Performance:** editing large pages (hundreds of icons) must stay smooth. Avoid work on every frame
  or every edit when it can wait until editing pauses.
- **Dependencies:** add new ones only when clearly needed, and only with permissive licenses (MIT, ISC,
  BSD, Apache-2.0).

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
