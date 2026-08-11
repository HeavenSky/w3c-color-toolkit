# Changelog

Notable changes to W3C Color Toolkit.

## v0.0.5 2026-08-12 Drop dead configuration

### Removed

- **Breaking.** Four built-in options that never did anything are gone:
  `advanced.highlight.matchRgbWithoutFunction`, `advanced.highlight.rgbWithoutFunctionLanguages`,
  `advanced.highlight.matchHslWithoutFunction` and `advanced.highlight.hslWithoutFunctionLanguages`.
  They described a "bare `255, 136, 0` counts as a colour" mode that was never implemented — the
  scanner has no such branch and `ScanOptions` has no matching field, so changing them had no effect
  whatsoever. Setting them now produces an `unknown-key` warning in the output channel instead of
  silently doing nothing.
- **Breaking.** Legacy settings migration is gone: the `w3cColorToolkit.migrateLegacySettings`
  command, its Manage entry, and the whole mapping table from `color-highlight.*` / `colorInfo.*`
  keys. Configure this extension directly instead. The coexistence notice — the one that warns when
  the three original extensions are still installed — is unaffected.

The built-in options drop from 37 to 33, and hidden commands from 31 to 30.

## v0.0.4 2026-08-11 Disable mode

### Added

- A disable mode that makes the extension go fully invisible in files you do not want it in. Three
  built-in options, any one of which is enough (they are OR-ed):
  `advanced.disable.maxFileSizeMb` (number, default `1`, decimals allowed, `0` = no limit),
  `advanced.disable.fileNames` (default `["*.min.*", "*.map"]`) and
  `advanced.disable.languageIds` (default `["log", "plaintext"]`), both gitignore-style patterns.
  A hidden file gets no highlighting, no overview-ruler marker, no inline swatch or native picker,
  no hover, and the conversion commands plus *Report unsupported syntax* do nothing; it is never
  scanned either, so the size limit really is a performance guard rather than work that is computed
  and thrown away. The reason is logged once per file in the output channel.
- Patterns follow gitignore semantics — later entries win and `!` re-enables — but are matched
  against the file name or the language id alone, so a pattern containing `/` is ignored and
  reported. `!` applies within its own list; it cannot rescue a file the other list excluded.
  The language dimension exists because a name pattern cannot catch `Dockerfile`, `Makefile`, or a
  file whose language you switched by hand.

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
  is looser than the size on disk.

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

- Inline swatches and the native colour picker: registering a `DocumentColorProvider` makes VS Code
  draw inline swatches and offer its native picker on hover for every syntax this extension
  supports — `oklch()`, `lab()`, `color()`, `color-mix()`, relative colours, HDR spaces, and
  colours inside comments and strings — none of which the built-in providers cover. Ranges come
  from the same field table the highlighter uses; the count is truncated at
  `editor.colorDecoratorsLimit` (500 by default) and logged. Controlled by
  `advanced.colorPicker.mode`: `dedupe` (default), `all`, `off`; the "Enable Features" command has
  a matching toggle.
  - In `css` / `less` / `scss`, `dedupe` probes the other colour providers once per document
    version and fills in only the ranges they miss, so no colour ever gets two swatches. The probe
    is unavoidable: VS Code overlays the results of every provider without deduplicating by range,
    stops using its built-in default provider as soon as any extension returns an array (even an
    empty one), and `vscode.executeDocumentColorProvider` does not report which provider produced
    what.
  - When the picker writes back it keeps the original format where possible and skips formats that
    cannot express alpha. Context-dependent values and read-only syntax (`color-mix()`, relative
    colours, `contrast-color()`, `device-cmyk()`, `color-layers()`) get a read-only swatch with no
    candidate replacements, so a stray drag cannot flatten an expression into a literal.
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
