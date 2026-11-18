# Third-party notices

Icon Forge Showcase's own source code is licensed under the [MIT License](LICENSE). This repository
contains **no third-party source code, fonts, images or other assets**. The app icon (`electron/icon.png`,
`electron/icon.ico`) and favicon (`public/favicon.svg`) are original to this project.

Dependencies are installed by npm from the public registry and are not stored in this repository.
When you build or share the app, the runtime dependencies below are included and their licence notices
must go with it. `npm run package` does this: the app folder and its ZIP contain Electron's `LICENSE`
and `LICENSES.chromium.html`, this project's `LICENSE.IconForgeShowcase.txt`, this file, and
`THIRD_PARTY_LICENSES.txt` with the full licence text of every package bundled into the interface.

## Runtime dependencies (included in the built app)

| Package | Licence | Notes |
| --- | --- | --- |
| [react](https://github.com/facebook/react), [react-dom](https://github.com/facebook/react), [scheduler](https://github.com/facebook/react) | MIT | Copyright (c) Facebook, Inc. and its affiliates. `scheduler` is a dependency of react-dom |
| [zustand](https://github.com/pmndrs/zustand) | MIT | Copyright (c) 2019 Paul Henschel |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Copyright (c) Arjun Barrett |
| [@fontsource-variable/geist](https://github.com/fontsource/font-files), [@fontsource-variable/geist-mono](https://github.com/fontsource/font-files) | OFL-1.1 | The Geist and Geist Mono typefaces used by the interface. Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font). The font files are bundled into the built app; the SIL Open Font License text is in each package folder |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC | Lucide icons. Copyright (c) Lucide Icons and Contributors; portions Copyright (c) 2013-present Cole Bemis (Feather, MIT) |
| [Electron](https://github.com/electron/electron) | MIT | Copyright (c) Electron contributors, Copyright (c) 2013-2020 GitHub Inc. It bundles Chromium, Node.js and other components under their own licences. These are listed in `LICENSES.chromium.html`, which ships next to the Electron binary and must be kept with any build you share. |

The full licence text of each package is in its folder under `node_modules/` after `npm install`.

## Development dependencies (not included in the built app)

TypeScript (Apache-2.0), Vite (MIT), Vitest (MIT), @vitejs/plugin-react (MIT), @electron/fuses (MIT),
@electron/packager (BSD-2-Clause) and their dependencies, all under permissive licences (MIT, ISC, BSD, Apache-2.0,
BlueOak-1.0.0, and CC-BY-4.0 for the `caniuse-lite` browser data).

## Fonts

The interface itself uses Geist and Geist Mono (SIL Open Font License 1.1, see above). They are bundled
into the built app, so the interface never loads fonts from the network. They style the editor only;
your artwork keeps its own fonts. Built-in text styles name fonts that come with Windows (e.g. Segoe UI,
Bahnschrift, Impact); the operating system provides them, and they are subject to their own licences.
Fonts you import into a project are your responsibility, including when you share `.showcase` files or
exported images.
