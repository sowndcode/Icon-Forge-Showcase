# Security Policy

## Reporting a vulnerability

Please **don't report security vulnerabilities in public issues, discussions or pull requests.**

Report them privately with GitHub's **private vulnerability reporting**: open the repository's
**Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report.

Please include:

- what the problem is and what an attacker could do with it
- the steps or a proof of concept needed to reproduce it
- the version or commit you tested
- your Windows version, and whether you used the desktop app or `npm run dev`

This is a small volunteer project, so response times may vary. We'll acknowledge the report, keep you
updated on the fix, and credit you in the release notes if you'd like.

## Supported versions

Icon Forge Showcase is in **Alpha**. Only the latest code on the default branch (and the latest tagged
release, once there is one) gets security fixes.

| Version | Supported |
| --- | --- |
| Latest `main` / latest release | Yes |
| Anything older | No |

## Security model

What the desktop app is designed to guarantee, and what counts as a vulnerability:

- **No network access.** The app loads its interface from local files through a private `app://`
  protocol and blocks every other request. It has no telemetry, accounts or update checks. A way to make
  it send data anywhere is a vulnerability.
- **An isolated interface.** The page runs with `contextIsolation`, the Chromium `sandbox`, no Node.js
  integration, no webviews, no new windows and a strict Content Security Policy. It reaches the system only
  through the small API in `electron/preload.cjs`, and the main process accepts those calls only from
  the app's own page.
- **Limited file access.** The app writes only inside its `data/` folder, and to files or folders you pick
  in a save or folder dialog. IDs and paths are validated so they can't leave those locations.
- **Untrusted input:** imported images, fonts and `.showcase` files are treated as untrusted. A file that
  crashes the app, escapes its folder or runs code is a vulnerability.

Out of scope:

- **Problems that need someone already running code on your computer,** or editing the app's files.
- **Advisories in development-only tools** (Vite dev server, Vitest) that can't be reached from the
  desktop app. These are tracked in the changelog.
- **Missing code signing** on builds people make themselves.
