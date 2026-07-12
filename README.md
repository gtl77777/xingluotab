# XingLuoTab 2.0

XingLuoTab is an independent WXT + React browser tab manager.

This project is intentionally a new extension line:

- Do not copy the old manifest `key`.
- 2.0 installs beside 1.x instead of replacing it.
- XingLuoTab uses independent namespaced storage and versioned backup formats.
- Full backups use `xingluotab_backup.json`; single-space exports use `*_xingluotab-space.json`.

## First Steps

```powershell
npm install
npm run compile
npm run test
npm run dev:edge
```

## Current Scope

XingLuoTab 2.0 includes:

- Space, Group and saved-tab management with high-performance drag and drop.
- Current-tab capture, global search, tags, sorting, views and Zen mode.
- Local backup plus GitHub Gist and WebDAV synchronization.
- Namespaced `xingluotab:*` local storage keys and schema-versioned XingLuoTab backup files.
