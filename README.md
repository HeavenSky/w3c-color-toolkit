# W3C Color Toolkit

Color highlighting, hover information and format conversion for VS Code, built on a single
color engine with CSS Color 4 / 5 / 6 and CSS Color HDR support.

中文文档: [README.zh-cn.md](./README.zh-cn.md)

## Why one extension

Highlighting, hovers and conversion share the **same** document color index, so all three agree on
the range, the color value, the alpha, the original color space and the resolution state of every
expression. Nothing is re-parsed per feature.

## Specification support

| Level | State |
| --- | --- |
| CSS Color 3 (legacy comma syntax) | supported |
| CSS Color 4 (ED 2026-07-28) | supported, including all 148 named colors, four hex lengths, `none`, static `calc()`, angle units and the 10 predefined `color()` spaces |
| CSS Color 5 (ED 2026-07-31) | statically evaluable parts: `color-mix()` including the multi-color form, relative color syntax, `alpha()`, `contrast-color()`, `device-cmyk()` naive fallback, `@color-profile` `fallback` |
| CSS Color 6 (ED 2026-01-11) | experimental, **on by default**, switchable through `w3cColorToolkit.experimental`: `color-layers()`, extended `contrast-color()`, `wcag2` / `wcag2()`, `tbd-fg` / `tbd-bg` |
| CSS Color HDR 1 (ED 2026-07-28) | experimental, **on by default**, same switch: `ictcp()`, `jzazbz()`, `jzczhz()`, `color(rec2100-pq | rec2100-hlg | rec2100-linear)`, `hdr-color()` |

Run **W3C Color Toolkit: Manage → Show specification support matrix** to see the matrix with your
current switches applied.

### Context dependent values are never faked

`currentColor`, the 19 system colors, the 23 deprecated system colors, `light-dark()`, unresolved
`var()`, custom `@color-profile` without a `fallback`, and non-static alpha all resolve to a
`contextual` state. They are never converted, and unless an explicit preview assumption applies they
are not highlighted either: the hover explains what they depend on instead of showing a made-up
swatch. Deprecated system colors also show their replacement keyword.

One exception is previewable without guessing: `light-dark()` picks a branch according to
`advanced.contextualPreview`, whose default `auto` follows the current editor theme. The value is
still labelled as an assumption in the hover, and switching theme re-renders it. Set the option to
`off` to go back to no preview at all.

`hdr-color()` depends on the display HDR headroom, so it stays contextual even with the HDR switch on.

### One field list for hover and highlighting

`advanced.fields.enabled` / `advanced.fields.excluded` are the single scope for both features, so
there is no second place to configure what gets highlighted:

| Group | Applies to | Examples |
| --- | --- | --- |
| CSS formats | hover row **and** highlighting | `hex`, `rgb`, `oklch`, `display-p3`, `rec2100-pq`, `css-color-name` |
| CSS syntax, read only | highlighting only | `color-mix`, `relative-color`, `light-dark`, `contrast-color`, `system-color`, `device-cmyk`, `transparent`, `current-color`, `color-layers`, `color-custom-profile`, `hdr-color` |
| Non-CSS representations | hover only | `hsv`, `cmyk` |
| Extra information, not a color | hover only | `preview`, `source`, `spec-level`, `diagnostics`, `alpha`, `gamut`, `contrast-on-white`, `contrast-on-black` |

Turning a CSS syntax off stops highlighting it; turning a format off also removes its hover row.
`Configure Color Fields` shows the same grouping with the applicable scope on every entry.
Syntax that the registry does not know about is always highlighted, so a new parser feature never
silently loses its decoration.

### Inline swatch and native color picker

The extension registers a `DocumentColorProvider`, so VS Code draws its **inline swatch** in front of
the color and offers its **color picker in the hover** — including `oklch()`, `lab()`, `color()`,
`color-mix()`, relative color syntax, the HDR spaces, and colors inside comments and strings, none of
which VS Code's own providers cover. The swatch range is filtered by the same field list as
highlighting.

The picker is anchored on the swatch (VS Code only produces a color hover where a color *decoration*
exists), so "picker without swatch" is not possible; turning `editor.colorDecorators` off removes
both.

Picking a color rewrites the value in the **original format first** (falling back to hex, rgb, hsl,
oklch) and skips any format that cannot express the current alpha. Values that are not a plain color
— context dependent ones (`light-dark()`, system colors, …) and read-only syntax (`color-mix()`,
relative colors, `contrast-color()`, `device-cmyk()`, `color-layers()`) — get a **read-only** swatch:
no presentation is offered, so one stray drag cannot flatten the expression into a literal. Use
`Convert Color` to rewrite those on purpose.

`advanced.colorPicker.mode`:

| Mode | Behaviour |
| --- | --- |
| `dedupe` (default) | In `css` / `less` / `scss` — the three languages where the built-in CSS provider contributes colors — probe the other providers once per document version and report only the ranges they left uncovered. Everywhere else report everything. No color ever gets two swatches. |
| `all` | Report every supported syntax in every language, even where another provider already did. |
| `off` | Provide nothing; VS Code falls back to its own providers. |

Why the probe is needed: VS Code renders the results of **all** color providers without
deduplicating by range, it drops the built-in *default* provider as soon as any extension returns an
array (even an empty one), and `vscode.executeDocumentColorProvider` does not tell you which provider
produced which color. Probing the ranges is the only way to guarantee exactly one swatch.

For the same reason the extension sets `"editor.defaultColorDecorators": "never"` through
`contributes.configurationDefaults`: everything the built-in default provider recognises (hex,
`rgb()`, `hsl()`) is a subset of what this extension reports, so switching it off removes overlap
without losing coverage. The Settings UI shows it as "default value overridden by extension" and you
can set it back to `auto` or `always` at any time.

Two limits worth knowing: VS Code renders at most `editor.colorDecoratorsLimit` (500 by default)
swatches per editor — the extension truncates its report to that number and logs it — and
`editor.colorDecoratorsActivatedOn` decides whether the picker opens on hover, on click, or both.

If you want a swatch that does not depend on VS Code's color feature at all, use the marker styles
`square-before` / `square-after`: they draw a filled square with the extension's own decoration, in
every language and every position, limited only by `advanced.highlight.maxMatchesPerDocument`.

## Settings

Only 8 settings appear in the Settings UI:

| Setting | Default | Purpose |
| --- | --- | --- |
| `w3cColorToolkit.enabled` | `true` | Master switch |
| `w3cColorToolkit.languages` | `["*"]` | Language filter; `!id` excludes, exclusions win |
| `w3cColorToolkit.highlight` | `underline` | Marker style: `background`, `foreground`, `outline`, `underline`, `dot-before`, `dot-after`, `square-before`, `square-after`; `off` disables highlighting |
| `w3cColorToolkit.info` | `true` | Hover information |
| `w3cColorToolkit.convertSyntax` | `legacy` | `rgb()` / `hsl()` output style |
| `w3cColorToolkit.precision` | `5` | Significant digits |
| `w3cColorToolkit.experimental` | `["cssColor6", "cssColorHdr"]` | `cssColor6`, `cssColorHdr`; both on by default |
| `w3cColorToolkit.advanced` | `{}` | Incremental overrides for the 35 built-in options |

Everything else is built in with a sensible default and overridden **incrementally** through
`w3cColorToolkit.advanced`, using dotted keys:

```jsonc
{
  "w3cColorToolkit.advanced": {
    "output.hexCase": "upper",
    "highlight.maxMatchesPerDocument": 3000,
    "variables.includePaths": ["src/styles"]
  }
}
```

Rules:

- keys not listed keep their built-in default; arrays and objects are replaced as a whole;
- the 8 top-level settings must **not** appear here — they are ignored with a warning, which
  removes any ambiguity about precedence;
- unknown keys and wrong types are ignored, out-of-range numbers are clamped, and every case is
  logged instead of throwing;
- User / Workspace / Folder scopes are merged **key by key** by the extension, because VS Code
  replaces object settings wholesale;
- **Manage → Show effective configuration** prints the merged result with the origin of each key.

## Commands

Five entries appear in the Command Palette:

| Command | What it does |
| --- | --- |
| `Convert Color` | Flat Quick Pick grouped by category |
| `Copy Color As` | Same picker, writes to the clipboard |
| `Enable Features` | Multi-select Quick Pick for the feature switches |
| `Configure Color Fields` | Multi-select Quick Pick for the shared hover + highlight field list |
| `Manage` | Migration, effective configuration, support matrix, rescan, clear cache, log |

The 24 direct `w3cColorToolkit.convertTo.*` commands and the 7 `Manage` actions are hidden from the
Command Palette but are **fully bindable**: they appear in the Keyboard Shortcuts editor. No default
keybindings are shipped, to avoid conflicting with your existing bindings:

```jsonc
// keybindings.json
[
  { "key": "ctrl+alt+h", "command": "w3cColorToolkit.convertTo.hex", "when": "editorTextFocus" },
  { "key": "ctrl+alt+o", "command": "w3cColorToolkit.convertTo.oklch", "when": "editorTextFocus" },
  {
    "key": "ctrl+alt+p",
    "command": "w3cColorToolkit.convertTo.rec2100Pq",
    "when": "editorTextFocus && w3cColorToolkit.hdrEnabled"
  }
]
```

## Migrating from the original extensions

**Manage → Migrate legacy plug-in settings** reads explicit `color-highlight.*` and `colorInfo.*`
values, shows a preview, and only writes after you confirm. It never modifies the old settings, is
idempotent, and writes each scope back to that same scope.

| Old command | New command |
| --- | --- |
| `extension.changeColorFormat.commands` | `w3cColorToolkit.convert` |
| `extension.changeColorFormat.hexSmartConvert` | `w3cColorToolkit.convertTo.hex` (hidden, bindable) |
| `extension.changeColorFormat.hslSmartConvert` | `w3cColorToolkit.convertTo.hsl` (hidden, bindable) |
| `extension.changeColorFormat.rgbSmartConvert` | `w3cColorToolkit.convertTo.rgb` (hidden, bindable) |
| `extension.colorHighlight` | `w3cColorToolkit.toggleFeatures` |

`color-highlight.enable` and `color-highlight.markerType` collapse into the single
`w3cColorToolkit.highlight` setting. The four `colorInfo` preview field variants collapse into the
`preview` field plus `info.previewSize` and `info.previewShape`.

### Running alongside the originals

If the original extensions are installed, this extension warns **once per workspace** that
highlighting, hovers or commands may be duplicated. It never disables, uninstalls or modifies them,
and it does not register their command ids. Set `advanced.coexistence.notify` to `false` to silence
the notice.

## Gamut and HDR handling

- sRGB output uses the CSS-specified gamut mapping by default, not per-channel clipping
  (`advanced.output.gamutMapping` can switch to `clip` or `none`).
- Wide gamut colors are mapped for the preview swatch only; the hover keeps showing the original
  value and the gamut status.
- HDR colors are tone mapped for the preview (`advanced.highlight.hdrToneMapping`) and flagged as
  tone mapped in the hover.
- Conversion tells you before it happens whether the value will be gamut mapped, whether alpha will
  be dropped, and whether `none` components will be lost. The default policy is to refuse rather
  than silently lose information.

## Known limitations

- Scanning very large documents is slower than the target performance budget; see the plan document
  for the pending optimisation. `advanced.scan.maxDocumentSizeKb` and
  `advanced.highlight.maxMatchesPerDocument` bound the work.
- CSS Color 6 and CSS Color HDR are drafts; values and syntax may change.
- Untrusted workspaces resolve variables only within the current document.
- No remote ICC profile download; `device-cmyk()` uses the naive fallback and is marked approximate.

## Localisation

English and Simplified Chinese. Other locales fall back to English.

## License

MIT. See [NOTICE.md](./NOTICE.md) for how the three reference extensions were used.
