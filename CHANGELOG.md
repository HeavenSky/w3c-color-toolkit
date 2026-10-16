# Changelog

Notable changes to W3C Color Toolkit.

## v0.0.9 2026-10-16 Scoped preprocessor variables

### Changed

- Docs: the README is now a short overview; full usage moved to
  [the docs pages](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/README.md), and the
  Chinese pages live under `zh/`.

### Fixed

- **Less variables resolve the way Less compiles them.** The last definition in scope wins even when
  it comes after the reference, and a variable used before its definition now shows its color
  instead of nothing.
- **SCSS and Less variables respect block scope.** A definition inside a block overrides outer ones
  within that block and is no longer picked up from sibling blocks or from blocks in other files;
  `!global` assignments still count as top-level. See
  [Read the three outcomes of a lookup](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/variables.md#read-the-three-outcomes-of-a-lookup).
- **The specification support matrix follows the display language.** "Show Specification Support
  Matrix" was always in Chinese; it is now in English, and in Chinese when VS Code runs in Chinese.

## v0.0.8 2026-10-12 Color picker keeps the original text

### Changed

- Docs: the README now shows a screenshot of each feature. The
  images are loaded from GitHub when the page is viewed and are not packaged into the extension.

### Fixed

- **Opening the native color picker no longer rewrites the color.** VS Code passes picker colors as
  8-bit sRGB, so a wide-gamut value such as `color(display-p3 0.2 0.8 0.4)` showed up as
  `color(display-p3 0.363 0.791 0.427)`, and even in-gamut values such as `oklch(60% 0.1 200)` were
  re-serialized; one click on the picker header wrote the lossy value back. While the color is
  unchanged, the first presentation is now the original text and the other formats are converted
  from the original value. Dragging to a new color behaves as before.
- **Hover no longer shows `Specification: CSS Color 4` for a variable without a unique value.**
  `var(--x)`, `$x` and `@x` references with several candidate definitions have no CSS Color level;
  a variable inside a color function takes the level of its candidates when they all agree.

### Internal

- Synced the shared skeleton scripts; `npm run shots` regenerates the screenshots by hand and is not
  part of packaging or release.

## v0.0.7 2026-10-08 New icon, docs aligned

### Changed

- **New icon**: a color picker panel above a hue bar, drawn in the same flat style and accent
  palette as the other HeavenSky extensions. It replaces the OKLCH gradient ring.
- The untrusted workspace description shown by VS Code now matches the behavior: only definitions
  from files you have open are used, and other files on disk are not read.

### Fixed

- **README and README.zh-cn now agree with each other and with the code**: 34 built-in options
  (not 33), six Manage actions (not seven), command names match the UI, `coexistence.notify` names
  the three extensions it actually detects, and the troubleshooting entry for variables no longer
  describes the pre-glob lookup.

### Internal

- `package-lock.json` resolves every tarball from `registry.npmjs.org`. Mirror URLs were treated as
  remote tarballs under npm 12's default `allow-remote=none`, so `npm ci` refused to install.

## v0.0.6 2026-08-13 Duplicate swatches outside CSS

### Added

- `advanced.colorPicker.dedupeLanguages` (`string[]`, default `[]`) lets `dedupe` mode also probe
  the languages of a third-party color extension; see
  [Get exactly one swatch per color](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/color-picker.md#get-exactly-one-swatch-per-color).

  The built-in options go from 33 to 34.

### Fixed

- **Every color in an HTML `<style>` block had two swatches.** Probing for other color providers
  was limited to `css` / `less` / `scss`, taken from the activation events of
  `vscode.css-language-features`. But `vscode.html-language-features` runs the same CSS language
  service over embedded CSS — `<style>` blocks and `style` attributes — and its server declares
  `colorProvider` too, so in HTML both it and this extension reported the same range and VS Code
  drew both. The probe now covers every language a built-in language service contributes colors in.
- **The same duplicate appeared in JSON**, where `vscode.json-language-features` reports colors for
  strings whose schema says `format: color-hex` — theme files and `workbench.colorCustomizations`
  in `settings.json`. Two things were needed: probing `json` / `jsonc` at all, and matching the
  range. The JSON service reports the whole string node **including the quotes** while this
  extension reports the color inside them, so exact-range comparison never matched; a quoted probe
  result now also covers the range inside the quotes.
- **The set of probed languages is no longer a constant.** The HTML and JSON language services both
  adopt languages that any extension registers through `contributes.htmlLanguageParticipants` /
  `jsonLanguageParticipants` — that is how the built-in handlebars extension routes `handlebars`
  through the HTML service. The set is now computed from the installed extensions and recomputed
  when they change, so `handlebars` and third-party participants are covered as well.

Third-party color extensions (Tailwind CSS IntelliSense, Volar and the like) are still out of
scope: which languages they register a provider in cannot be derived from their manifests, so
overlapping with one of those still means turning off one of the two.

## v0.0.5 2026-08-12 Variables, nested swatches, dead configuration

### Removed

- **Breaking.** `advanced.variables.includePaths`, `advanced.variables.maxImportDepth` and
  `advanced.variables.maxImportFiles` are gone, replaced by `advanced.variables.lookupGlobs`,
  `advanced.variables.maxIndexedFiles` and `advanced.variables.languageIds`. The three old keys
  only ever configured the `@import` walk, which never ran (see *Fixed*), so removing them takes
  nothing away. Setting them now produces an `unknown-key` warning. Migration: list your token
  files in `advanced.variables.lookupGlobs` and delete the three old keys.
- **Breaking.** Stylus variables are no longer resolved. Colors in `.styl` files are unaffected —
  hex, color names and color functions are still recognised — but `$brand = #ff8800` definitions
  and `color: $brand` references are not. PostCSS has no official Stylus syntax package, and the
  only third-party bridge depends on the Stylus compiler and `glob`, which use Node built-ins and
  would break the browser bundle. The previous regex implementation also mis-reported the
  definition side of `$brand = …` as a reference, because Stylus assigns with `=` rather than `:`.
  Migration: move tokens that need a resolved swatch into a CSS, SCSS or Less file.
- **Breaking.** Four built-in options that never did anything are gone:
  `advanced.highlight.matchRgbWithoutFunction`, `advanced.highlight.rgbWithoutFunctionLanguages`,
  `advanced.highlight.matchHslWithoutFunction` and `advanced.highlight.hslWithoutFunctionLanguages`.
  They described a "bare `255, 136, 0` counts as a colour" mode that was never implemented — the
  scanner has no such branch and `ScanOptions` has no matching field, so changing them had no effect
  whatsoever. Setting them now produces an `unknown-key` warning in the output channel instead of
  silently doing nothing. Migration: delete the four keys from `w3cColorToolkit.advanced`.
- **Breaking.** Legacy settings migration is gone: the `w3cColorToolkit.migrateLegacySettings`
  command, its Manage entry, and the whole mapping table from `color-highlight.*` / `colorInfo.*`
  keys. The coexistence notice — the one that warns when the three original extensions are still
  installed — is unaffected. Migration: set the equivalent `w3cColorToolkit.*` keys by hand, then
  delete the old `color-highlight.*` / `colorInfo.*` keys.

The built-in options drop from 37 to 33, and hidden commands from 31 to 30.

### Added

- **Variable resolution actually works now.** `var(--brand)`, `$brand` and `@brand` resolve to real
  colors and take part in highlighting, hover and the inline swatch. The adapter layer for this had
  been written but never wired to the scan pipeline — the `FileReader` was created and immediately
  discarded, and five adapter modules had zero importers. Definitions come from a workspace symbol
  index (see below), and the lookup during a scan is synchronous.
  `@color-profile --name { fallback: … }` is collected too, so `color(--name …)` can resolve.
- **Colors inside a reference get their own swatch and picker**: `var(--brand, #ff8800)` shows two;
  see [Work with nested and resolved references](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/variables.md#work-with-nested-and-resolved-references).
- Hover, `Convert Color` and the picker all act on the **innermost** color at the cursor, so working
  on a nested value edits that value and not the expression around it.
- **Variable definitions are found by glob, not by following `@import`**, so token files combined by a
  JS bundler are found too; see
  [Let the extension find your token files](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/variables.md#let-the-extension-find-your-token-files).
- **"Not unique" is now its own outcome**: a variable defined per theme or per media query lists every
  candidate in the hover instead of disappearing; see
  [Read the three outcomes of a lookup](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/variables.md#read-the-three-outcomes-of-a-lookup).
- **Definitions are collected from a real CSS AST.** `postcss`, `postcss-scss` and `postcss-less`
  replace 13 hand-written regular expressions. Comments, nested rules, conditional at-rules and
  dialect differences are now handled structurally rather than pattern by pattern; a file with a
  syntax error only stops contributing its own definitions.
- **A variable used as a fragment of a color function now resolves**, such as Tailwind-style
  `rgb(var(--channels) / 0.4)`; see
  [Use variables inside color functions](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/variables.md#use-variables-inside-color-functions).

### Changed

- **Two defaults are lower.** `advanced.disable.maxFileSizeMb` `1` → `0.3` (314,573 UTF-16 code
  units, roughly 307 KiB) and `advanced.highlight.maxMatchesPerDocument` `1000` → `600`. Documents
  between the old and new thresholds now go unhighlighted by default; the allowed ranges are
  unchanged, so raising either key restores the previous behaviour. Anyone who already set these keys
  explicitly is unaffected.

- **A reference with no definition shows nothing at all** — no highlight, no swatch, no hover. This
  covers a missing definition, a value that is not a color, a reference cycle, `maxResolveDepth`, and
  files that are not readable in an untrusted workspace. A reference whose value merely is not
  *unique* is a different case and keeps its hover, see above. SCSS maps, `@each`, mixins and calls
  like `darken($x, 10%)` are not evaluated and therefore fall into the silent case.
- **A resolved variable reference is read only**: the picker displays the color without allowing a
  drag, and `Convert Color` refuses and names the variable. Rewriting `var(--brand)` into a literal
  would destroy the token.
- Colors that come from another file may appear a beat late right after activation, because building
  the index reads files asynchronously; it does not block activation. Afterwards a file watcher keeps
  the index current, and editing an open stylesheet updates it from the editor content immediately.

### Fixed

- **Cross-file variable resolution never actually ran.** The index scheduled its asynchronous
  cross-file pass only when the synchronous pass had left an unresolved variable behind — but that
  same synchronous pass removes those matches, so the condition was always false and
  `schedulePatch()` was unreachable. Variables now resolve from a workspace symbol index, which is
  a plain synchronous lookup during the scan, so there is no second phase to be unreachable.
- **A commented-out definition poisoned the real one.** `:root { /* --a: red; */ --a: #ff8800 }`
  used to report two definitions and give up on both. Definitions are now collected from a PostCSS
  AST, where a comment is a comment.
- **A comment inside a value made the value unparseable.** `--a: /* c */ #ff8800` kept the comment
  in the raw value, the color parse failed, and the reference silently disappeared.
- **A `:root` block preceded by a comment was not recognised as `:root`.** The selector of a
  declaration is found by scanning back to the previous `{` / `}` / `;`, which swept up any comment
  sitting between the two — so a perfectly ordinary
  `@layer base { /* … */ :root { --border: … } }` was classified as a non-root definition and refused.
  Comments are now stripped from the selector text. This affected every custom property whose `:root`
  block happened to be introduced by a comment, which is most real stylesheets.

## v0.0.4 2026-08-11 Disable mode

### Removed

- **Breaking.** `w3cColorToolkit.languages` is gone. It was an allow-list; the replacement
  `advanced.disable.languageIds` is a deny-list, and the two cannot be reconciled by renaming alone,
  so old values are no longer read. Convert them by hand — with gitignore's "later entries win" the
  translation is exact: `["*"]` → `[]`, `["*", "!plaintext"]` → `["plaintext"]`,
  `["css", "scss"]` → `["*", "!css", "!scss"]`, `[]` → `["*"]`. Settings migrated from
  `color-highlight.languages` or `colorInfo.languages` are converted automatically by
  **Manage → Migrate legacy settings**.
- **Breaking.** `advanced.scan.maxDocumentSizeKb` is replaced by `advanced.disable.maxFileSizeMb`.
  The old key only skipped indexing — hover still fell back to scanning the current line, so an
  over-size document was not actually left alone. The new key hides the extension outright. The unit
  is now MB of UTF-16 code units rather than KB of bytes, so for non-ASCII text the effective limit
  is looser than the size on disk. Migration: set `advanced.disable.maxFileSizeMb` to the old value
  divided by 1024 and delete the old key.

### Added

- A disable mode hides the extension completely, without scanning, in files over
  `advanced.disable.maxFileSizeMb` (default `1`) or matching `advanced.disable.fileNames` /
  `advanced.disable.languageIds`; see
  [Keep the extension out of some files](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/configuration.md#keep-the-extension-out-of-some-files).

### Changed

- **Defaults.** Several defaults now favour a quieter, faster out-of-the-box experience over
  "highlight everything":
  `w3cColorToolkit.precision` `5` → `3`;
  `advanced.disable.maxFileSizeMb` effectively `2` → `1` (the old key's `2048` KB);
  `advanced.highlight.maxMatchesPerDocument` `10000` → `1000`;
  `advanced.disable.fileNames` `[]` → `["*.min.*", "*.map"]`;
  `advanced.disable.languageIds` `[]` → `["log", "plaintext"]`.
  Consequence: minified bundles, source maps, log files and plain text are now left alone unless you
  opt back in, and documents with more than 1000 colours stop being highlighted part-way. Set the two
  pattern lists to `[]` to restore the previous "never hide anything" behaviour.

### Fixed

- The size check no longer uses `Buffer`, which does not exist in the Web extension host, and no
  longer materialises the whole document just to measure it.
- Decorations are now cleared when a document becomes hidden by growing past the size limit while
  you type. Previously nothing drove a re-render on that path, so stale markers stayed on screen.
- The conversion commands now respect the language and file filters. Only highlighting, hover and
  swatches did before.

## v0.0.3 2026-08-07

### Changed

- New icon: three swatches side by side at the centre of the colour wheel. The previous icon was
  a wheel around an empty hole — it said "colour space" but not what the extension does. Three
  swatches in a row read as "one colour in several representations", which is exactly the inline
  swatch and cross-colour-space conversion this extension provides. The swatch colours reuse the
  wheel's own `ringColor` at three evenly spaced hues (25 / 145 / 265), so they cannot clash with
  the ring. The inner radius grows from `0.205` to `0.219` to make room.

### Internal

- Build scaffolding synced with the shared skeleton: the VSIX allowlist now derives entries from
  `contributes.languages` / `grammars` / `snippets` and permits a `*.wasm` next to the bundle;
  the l10n directory may carry per-source subdirectories. This extension uses none of those
  additions — the change is pure alignment, with no effect on behaviour.

## v0.0.2 2026-08-05

### Added

- Inline swatches and the native colour picker for every syntax this extension supports, including
  `oklch()`, `color()` and colours inside comments and strings, controlled by
  `advanced.colorPicker.mode` (`dedupe` by default, which in `css` / `less` / `scss` fills in only
  the ranges other providers miss); see
  [Edit colors with the picker](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/docs/color-picker.md).
- `contributes.configurationDefaults` sets `editor.defaultColorDecorators` to `never`: the hex and
  `rgb()`/`hsl()` forms the built-in provider recognises are a strict subset of what this extension
  reports, so turning it off removes only the overlap and loses no coverage. Users can still set it
  back to `auto` / `always`.
- Two new marker styles, `square-before` / `square-after`, drawn as solid blocks by this
  extension's own decorations rather than through VS Code's colour feature (the existing
  `dot-before` / `dot-after` remain dots).

### Changed

- Highlighting and hover now share one field table: `advanced.info.fields` /
  `advanced.info.excludedFields` are renamed to `advanced.fields.enabled` /
  `advanced.fields.excluded`, and together decide both which hover rows appear and which colour
  syntaxes are highlighted — highlighting no longer needs separate configuration. The command
  `w3cColorToolkit.configureInfoFields` is renamed to `w3cColorToolkit.configureColorFields`.
- The field table now covers all 41 scannable syntaxes, grouped by scope: CSS formats (hover and
  highlighting), read-only CSS syntax (highlighting only, e.g. `color-mix()`, relative colours,
  `light-dark()`, system colours), non-CSS representations (hover-only `hsv` / `cmyk`), and
  supplementary information that is not a colour in itself (hover-only preview, original syntax,
  alpha, gamut, contrast, specification level, resolution notes). Syntaxes absent from the registry
  are allowed through, so a new parser syntax cannot silently lose its highlighting.
- New hover fields `color-srgb`, `color-srgb-linear` and `color-display-p3-linear`, bringing hover
  coverage to all 24 conversion targets.
- `advanced.contextualPreview` gains `auto` and adopts it as the default: the `light-dark()` branch
  follows the editor's current theme, so `light-dark()` gets a preview colour and highlighting out
  of the box. The result is still marked as assumed in the hover, and switching themes triggers a
  rescan. Set it to `off` for the previous behaviour.
- Ticking a field in "Configure Colour Fields" that was previously excluded by `fields.excluded`
  now clears the exclusion as well; turning the HDR switch off no longer drops HDR fields from the
  configuration merely because they were absent from the tick list.

## v0.0.1 2026-08-04

First local development build, merging the complementary capabilities of three reference
extensions onto a shared colour core.

### Added

- A unified colour core: scanning, parsing, evaluation, gamut mapping and serialisation are shared
  by highlighting, hover and conversion, so all three derive the same range, colour value, alpha,
  original colour space and resolution status for a given expression.
- Complete CSS Color 4 static syntax: 148 named colours, four hex lengths, legacy and modern
  syntax, percentages, alpha, four angle units, `none`, static `calc()`, and the 10 predefined
  `color()` spaces.
- The statically evaluable part of CSS Color 5: `color-mix()` (including three-or-more-colour forms
  and four hue interpolation methods), relative colour syntax, Relative Alpha Color `alpha()`,
  `contrast-color()`, `device-cmyk()` without an ICC fallback, and the `fallback` descriptor of
  `@color-profile`.
- Contextual colour classification: `currentColor`, 19 system colours, 23 deprecated system colours
  (with replacement hints), `light-dark()`, custom profiles without a fallback, and non-static
  alpha all resolve to `contextual` rather than to black.
- Experimental CSS Color 6 support (on by default, switchable via `w3cColorToolkit.experimental`):
  `color-layers()`, extended `contrast-color()`, `wcag2` / `wcag2(aa | aaa | large)`, `tbd-fg` /
  `tbd-bg`.
- Experimental CSS Color HDR 1 support (on by default, same switch): `ictcp()`, `jzazbz()`,
  `jzczhz()`, `color(rec2100-pq | rec2100-hlg | rec2100-linear)`, and `hdr-color()`, which is
  always contextual.
- Three features: colour highlighting with six marker styles, hover information with configurable
  fields, and conversion to 24 target formats.
- Two configuration layers: 8 exposed keys plus 34 incremental overrides under
  `w3cColorToolkit.advanced`. The `advanced` object carries three kinds of in-place reference: full
  English and Chinese tables (key / type / default / description), insertable full and minimal
  templates, and per-key completion with hover documentation.
- Entry points: 5 Command Palette commands, an editor context submenu (convert and copy), and 31
  hidden commands available for key binding. No default keybindings are contributed.
- A migration command for legacy settings and commands, covering three scopes and safe to run
  repeatedly.
- UI available in English and 简体中文. Command titles follow the display language: `Convert Color`
  in English, `转换颜色` in Chinese.

### Known limitations

- Scanning very large documents (several thousand colours and up) is noticeably slower than the
  target budget and is being worked on; `advanced.scan.maxDocumentSizeKb` and
  `advanced.highlight.maxMatchesPerDocument` bound the cost in the meantime.
- `hdr-color()` depends on the display's HDR headroom, so it can only be previewed as an assumed
  value.
- CSS Color 6 and CSS Color HDR are both drafts; values and syntax may change.
- Variables are not resolved across files in untrusted workspaces.
- There are no automated integration tests that depend on the VS Code runtime. The quality gates
  are type checking, contribution-point and localisation consistency checks, unit tests and a
  runtime-free smoke check; behaviour that needs a real Extension Host is covered by manual
  acceptance.
