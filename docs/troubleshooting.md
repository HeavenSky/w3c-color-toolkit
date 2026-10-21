# Troubleshooting

**English** · [简体中文](../zh/docs/troubleshooting.md)

This page helps you fix a color that is missing, doubled, refused or stale; it assumes the extension is installed and enabled. Most fixes use an action of _W3C Color Toolkit: Manage_, named in each section below.

## No inline swatch appears

- Cause: VS Code's `editor.colorDecorators` is off. Fix: turn it on.
- Cause: `advanced.colorPicker.mode` is `off`. Fix: set it to `dedupe`.
- Cause: the file has more colors than `editor.colorDecoratorsLimit` (500 by default); the log says `document has more than editor.colorDecoratorsLimit colors`. Fix: raise that VS Code setting.
- Cause: the file is hidden by the size or pattern rules. Fix: see [A color is not highlighted](#a-color-is-not-highlighted).

## A color shows two swatches

- Cause: `advanced.colorPicker.mode` is `all`. Fix: set it to `dedupe`.
- Cause: a third-party color extension, such as Tailwind CSS IntelliSense or Volar, reports the same range. Fix: add that language to `advanced.colorPicker.dedupeLanguages`, as explained in [Edit colors with the picker](./color-picker.md#get-exactly-one-swatch-per-color).

## A color is not highlighted

Check these causes in order of likelihood:

1. `w3cColorToolkit.highlight` is `off`.
2. The file is hidden by `advanced.disable.fileNames` or `advanced.disable.languageIds`; the defaults hide `*.min.*`, `*.map`, log files and plain text.
3. The field for that syntax is off in _Configure Color Fields_.
4. The value depends on context, such as `currentColor` or a variable with several definitions; see [Supported color syntax](./color-support.md#values-that-depend-on-context).
5. The document is longer than `advanced.disable.maxFileSizeMb` (about 307 KiB by default).
6. The document has more colors than `advanced.highlight.maxMatchesPerDocument` (600 by default).
7. It is a bare color name such as `red` outside CSS-like languages, and `advanced.highlight.matchWords` is `css-like`.

The log names the reason a file is hidden; raise the matching limit or narrow the matching list.

## The picker does not let me change a value

- Cause: the swatch is read only, because the value is context dependent, a resolved variable, or read-only syntax such as `color-mix()`. Fix: rewrite it on purpose with _Convert Color_.

## Conversion was refused

The message names the reason:

- `Cannot convert a context dependent color: …` → the value depends on context or on a variable. Fix: convert the literal it resolves to, or edit the definition.
- `… cannot express alpha. Change convert.alphaLoss to allow it.` → the target has no alpha channel. Fix: set `advanced.convert.alphaLoss` to `confirm` or `drop`, or pick a target with alpha.
- `No exact color name matches this color.` → Fix: set `advanced.convert.namedColorFallback` to `nearest`.
- `The selection is not a single valid color expression.` → the selection covers part of a color or more than one. Fix: collapse the selection to the cursor, or select exactly one color.

## A variable reference shows nothing

A reference with no usable definition shows nothing by design. _Manage_ → _Open the log_ names the reason, then check:

1. `advanced.variables.resolve` is `true`, and the file's language is in `advanced.variables.languageIds`.
2. The token file matches `advanced.variables.lookupGlobs` and is not in an always-skipped folder such as `node_modules` or `dist` (full list in [Resolve variables](./variables.md#let-the-extension-find-your-token-files)).
3. The workspace is trusted, or the token file is open in an editor.
4. The index is below `advanced.variables.maxIndexedFiles`, and the reference chain is shorter than `advanced.variables.maxResolveDepth`.
5. The value does not need evaluation: SCSS maps, `@each`, mixins, arithmetic, `darken()` and Stylus variables are not supported.

A token defined only under `[data-theme="…"]` or `.dark` is a different case: its hover lists the candidates and the swatch stays hidden on purpose. See [Resolve variables](./variables.md#read-the-three-outcomes-of-a-lookup).

## A key in `advanced` has no effect

- Cause: the key is unknown, has the wrong type, is out of range, or is one of the seven top-level settings. Fix: run _Manage_ → _Show effective configuration_; it lists every key with its scope, plus the keys that were rejected. For more detail set `advanced.logLevel` to `debug` and open the log.

## Results look stale

- Fix: run _Manage_ → _Rescan the current document_, or _Clear the index cache_.
- If the extension does not recognize a syntax, _Manage_ → _Log unsupported syntax_ records it for a bug report on the [issue tracker](https://github.com/HeavenSky/w3c-color-toolkit/issues).

## Known limitations

- Very large documents scan noticeably slower; `advanced.disable.maxFileSizeMb` and `advanced.highlight.maxMatchesPerDocument` bound the work.
- CSS Color 6 and CSS Color HDR are drafts, so values and syntax may change.
- Untrusted workspaces only use definitions from files you have open.
- Variable resolution does not evaluate expressions, and Stylus variables are not resolved.
- Remote ICC profiles are never downloaded; `device-cmyk()` uses the naive fallback and is marked approximate.
