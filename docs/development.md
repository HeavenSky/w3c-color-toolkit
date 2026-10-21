# Development

**English** · [简体中文](../zh/docs/development.md)

This page gets you from a fresh clone to a packaged `.vsix`; it needs the Node version in `.nvmrc`. The `scripts` field of `package.json` lists every task.

## Build and package

```bash
npm ci
npm run check
npm run typecheck
npm run lint:check  # oxlint; `npm run lint` also applies fixes
npm run fmt:check  # oxfmt; `npm run fmt` formats in place
npm test
npm run package
```

`npm run check` verifies that the icon, manifest, localization and shared template files are in sync, and `npm run package` writes `artifacts/<name>-<version>.vsix` and asserts its contents.

## Install with npm 12

With npm 12, `npm ci` only accepts a lockfile resolved from `registry.npmjs.org`, and dependency install scripts (`esbuild`, `@vscode/vsce-sign`, `fsevents`) are skipped by default. None of them is needed to check, test or package. Approve one with `npm install-scripts approve <package>` only if signing or publishing locally fails; CI uses the npm bundled with the Node version in `.nvmrc` and is not affected.

## Regenerate the screenshots

`npm run shots` regenerates the images in `media/screenshots/` on macOS; a VS Code window opens while it runs. Screenshots are not part of packaging or publishing, so commit them together with the documentation that uses them.
