# Data and storage

Where Icon Forge Showcase keeps your work, how it protects it, and how updating works.

## Folder layout

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

## Files from other people

- **Share codes** (themes and templates as text) and **template files** are validated field by field
  before anything is added: sizes, nesting and object counts are limited, unknown fields are dropped,
  and layouts this version doesn't have are refused. They never contain images or personal data.
- **`.showcase` project files** are cleaned on opening, and their images get fresh ids so a file can
  never overwrite the images of a stored project.
- **Images** are decoded by the browser engine inside a sandboxed window with no network access.
