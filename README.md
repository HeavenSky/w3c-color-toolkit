# W3C Color Toolkit

Color highlighting, hover information, an inline swatch with the native color picker, and format
conversion for VS Code — all driven by **one** color engine with CSS Color 3 / 4 / 5 / 6 and
CSS Color HDR support.

中文文档: [README.zh-cn.md](./README.zh-cn.md) · Changes: [CHANGELOG.md](./CHANGELOG.md)

---

## At a glance

| Feature | Where you see it | Turn it on/off with |
| --- | --- | --- |
| **Color highlighting** | Marker drawn on the color in the editor, plus an overview-ruler tick | `w3cColorToolkit.highlight` |
| **Hover information** | Preview swatch and one row per format when you hover a color | `w3cColorToolkit.info` |
| **Inline swatch + color picker** | VS Code's own square in front of the color; picker opens from it | `advanced.colorPicker.mode` |
| **Format conversion** | `Convert Color` / `Copy Color As`, or 24 direct commands | `advanced.convert.enabled` |
| **Variable resolution** | `var(--brand)`, `$brand`, `@brand` resolve to a real color | `advanced.variables.resolve` |

All five read the **same** document color index, so they always agree on the range, the color value,
the alpha, the original color space, and whether the value could be resolved at all. Nothing is
re-parsed per feature.

## Requirements

- VS Code **1.101** or newer.
- No other extension or external tool required.
- Works in remote workspaces and in VS Code for the Web (the extension ships a browser bundle).
- In an **untrusted** workspace, variables resolve only inside the current document — imported files
  are not read.

## Quick start

1. Install the extension. It activates after startup finishes; no command is needed.
2. Open any file with colors in it — CSS or not.
3. **Hover** a color: you get a preview swatch, the original syntax, and every enabled format.
4. **Click the inline swatch** in front of the color to open the native picker and edit the value in
   place.
5. Put the cursor inside a color and run **W3C Color Toolkit: Convert Color** (or right-click →
   *W3C Color Toolkit* → *Convert Color*) to rewrite it in another format.
6. Run **W3C Color Toolkit: Enable Features** to toggle the five features from one Quick Pick, or
   **Configure Color Fields** to choose exactly which formats and syntaxes are in scope.

Everything works out of the box. The sections below are the reference for when you want to change it.

---

## Features

### Color highlighting

`w3cColorToolkit.highlight` picks one marker style for the whole extension:

| Value | What it draws |
| --- | --- |
| `underline` *(default)* | Underline in the color |
| `background` | Filled background behind the text, with a readable foreground |
| `foreground` | Colors the text itself |
| `outline` | 2px outline around the value |
| `dot-before` / `dot-after` | Bullet before / after the value |
| `square-before` / `square-after` | Filled square before / after the value |
| `off` | No highlighting |

`square-before` / `square-after` are the extension's **own** decoration, so they work in every
language and every position and do not depend on VS Code's color feature at all — useful if you
turned inline swatches off but still want a visible chip.

Related options: `advanced.highlight.markRuler` (overview-ruler tick),
`advanced.highlight.maxMatchesPerDocument`, `advanced.scan.comments`, `advanced.scan.strings`,
`advanced.highlight.matchWords` (where bare color names count as colors).

### Hover information

Hovering a color renders, in this order: the preview swatch, the original source text, then one row
per enabled format, then the non-CSS rows (`hsv`, `cmyk`), then the meta rows (specification level,
parser notes, and — if you enable them — alpha, gamut and the two contrast ratios).

```
▇▇▇  (preview)
Source: oklch(70% 0.2 30)
Hex: #f0703f
rgb(): rgb(240, 112, 63)
…
Specification: CSS Color 4
```

Preview appearance: `advanced.info.previewSize` (`small` / `large`) and
`advanced.info.previewShape` (`square` / `rectangle`). Meta rows:
`advanced.info.showSpecLevel`, `advanced.info.showDiagnostics`.

The swatch is rendered as a local SVG data URI built only from sanitised numbers — the raw source
text is never interpolated into it.

### Inline swatch and the native color picker

The extension registers a `DocumentColorProvider`, so VS Code draws its **inline swatch** in front of
the color and offers its **color picker** from that swatch — including `oklch()`, `lab()`, `color()`,
`color-mix()`, relative color syntax, the HDR spaces, and colors inside comments and strings, none of
which VS Code's built-in providers cover.

Picking a color rewrites the value in the **original format first**, falling back to hex, rgb, hsl,
oklch, and skipping any format that cannot express the current alpha.

Values that are not a plain color get a **read-only** swatch — you see the color, but no rewrite is
offered, so one stray drag cannot flatten an expression into a literal:

- context dependent values: `light-dark()`, system colors, `currentColor`, unresolved `var()`;
- read-only syntax: `color-mix()`, relative colors, `contrast-color()`, `device-cmyk()`,
  `color-layers()`.

Use `Convert Color` when you want to rewrite those on purpose.

`advanced.colorPicker.mode`:

| Mode | Behaviour |
| --- | --- |
| `dedupe` *(default)* | In `css` / `less` / `scss` — the three languages where VS Code's built-in CSS provider also contributes colors — probe the other providers once per document version and report only the ranges they left uncovered. Everywhere else, report everything. No color ever gets two swatches. |
| `all` | Report every supported syntax in every language, even where another provider already did. |
| `off` | Provide nothing; VS Code falls back to its own providers. |

Two VS Code limits apply: at most `editor.colorDecoratorsLimit` (500 by default) swatches per editor
— the extension truncates its report to that number and logs it — and
`editor.colorDecoratorsActivatedOn` decides whether the picker opens on hover, on click, or both.

### Format conversion and copying

**Convert Color** rewrites the value in the document; **Copy Color As** puts it on the clipboard and
leaves the document untouched. Both use the same picker, grouped by category.

| Category | Targets |
| --- | --- |
| Common (4) | `#RRGGBB`, `rgb()`, `hsl()`, `oklch()` |
| Perceptual (4) | `hwb()`, `lab()`, `lch()`, `oklab()` |
| `color()` predefined (9) | `srgb`, `srgb-linear`, `display-p3`, `display-p3-linear`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d50`, `xyz-d65` |
| Color name (1) | `<named-color>` |
| HDR (6, experimental) | `ictcp()`, `jzazbz()`, `jzczhz()`, `color(rec2100-pq)`, `color(rec2100-hlg)`, `color(rec2100-linear)` |

How the target color is chosen:

- **Empty selection** → the color under the cursor.
- **Non-empty selection** → it must cover exactly one complete color expression; a partial selection
  is reported as invalid rather than guessed at.
- **Multiple selections** are supported. All of them are resolved first; the document is written in a
  single edit only if **every** selection succeeded, so you never get a half-converted file.

Before writing, conversion tells you whether the value will be gamut mapped, whether alpha will be
dropped, and whether `none` components will be lost. The default policy is to **refuse** rather than
silently lose information — see `advanced.convert.alphaLoss`,
`advanced.convert.missingComponentLoss`, `advanced.convert.namedColorFallback`.

Output style: `w3cColorToolkit.convertSyntax` (`legacy` commas vs `modern` spaces for `rgb()` /
`hsl()`), `w3cColorToolkit.precision`, `advanced.output.hexCase`, `advanced.output.gamutMapping`.

### Variable resolution

| Language | Resolved |
| --- | --- |
| any | CSS custom properties (`--brand`, used through `var()`) |
| `scss`, `sass` | `$brand` |
| `less` | `@brand` |
| `stylus` | `brand = …` |

`@import` / `@use` / `@forward` are followed across files, bounded by
`advanced.variables.maxImportDepth`, `advanced.variables.maxImportFiles` and cycle detection. Add
extra workspace-relative search roots with `advanced.variables.includePaths`.
`@color-profile --name { fallback: … }` is picked up too, so `color(--name …)` can resolve.

### Context dependent values are never faked

`currentColor`, the 19 system colors, the 23 deprecated system colors, `light-dark()`, unresolved
`var()`, a custom `@color-profile` without a `fallback`, and non-static alpha all resolve to a
`contextual` state. They are never converted, and unless an explicit preview assumption applies they
are not highlighted either: the hover explains **what the value depends on** instead of showing a
made-up swatch. Deprecated system colors also show their replacement keyword.

One case is previewable without guessing: `light-dark()` picks a branch according to
`advanced.contextualPreview`, whose default `auto` follows the current editor theme. The hover still
labels the result as an assumption, and switching theme re-renders it. Set the option to `off` for no
preview at all.

`hdr-color()` depends on the display's HDR headroom, so it stays contextual even with the HDR switch
on — unless you declare a headroom via `advanced.experimental.hdrAssumedHeadroom`.

---

## Commands

Five entries appear in the Command Palette (category **W3C Color Toolkit**):

| Command | Command id | What it does |
| --- | --- | --- |
| Convert Color | `w3cColorToolkit.convert` | Pick a target format and rewrite the value |
| Copy Color As | `w3cColorToolkit.copyColorAs` | Same picker, writes to the clipboard |
| Enable Features | `w3cColorToolkit.toggleFeatures` | Multi-select: highlighting, swatch + picker, hover, conversion, variables, CSS Color 6, CSS Color HDR |
| Configure Color Fields | `w3cColorToolkit.configureColorFields` | Multi-select for the shared hover + highlight field list |
| Manage | `w3cColorToolkit.manage` | Entry point for the seven maintenance actions below |

*Convert Color* and *Copy Color As* are also in the editor context menu, under the
**W3C Color Toolkit** submenu.

**Manage** actions (also registered as individual command ids):

| Action | Command id |
| --- | --- |
| Migrate legacy plug-in settings | `w3cColorToolkit.migrateLegacySettings` |
| Show effective configuration | `w3cColorToolkit.showEffectiveConfiguration` |
| Show specification support matrix | `w3cColorToolkit.showSupportMatrix` |
| Rescan the current document | `w3cColorToolkit.rescanDocument` |
| Clear the index cache | `w3cColorToolkit.clearIndexCache` |
| Open the log | `w3cColorToolkit.showOutputChannel` |
| Log unsupported syntax | `w3cColorToolkit.reportUnsupportedSyntax` |

*Migrate legacy plug-in settings* imports settings you had explicitly set for an older color
extension into their `w3cColorToolkit` equivalents. It shows a preview, writes only after you confirm,
never touches the old settings, keeps each scope in that same scope, and is safe to run twice.

### Keyboard shortcuts

The 24 direct `w3cColorToolkit.convertTo.*` commands and the 7 Manage actions are hidden from the
Command Palette but **fully bindable** — they appear in the Keyboard Shortcuts editor. No default
keybindings are shipped, to avoid clashing with yours:

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

Command id suffixes follow the format list: `hex`, `rgb`, `hsl`, `oklch`, `hwb`, `lab`, `lch`,
`oklab`, `srgb`, `srgbLinear`, `displayP3`, `displayP3Linear`, `a98Rgb`, `prophotoRgb`, `rec2020`,
`xyzD50`, `xyzD65`, `namedColor`, `ictcp`, `jzazbz`, `jzczhz`, `rec2100Pq`, `rec2100Hlg`,
`rec2100Linear`.

---

## Settings

### The 8 settings in the Settings UI

| Setting | Type | Default | Purpose |
| --- | --- | --- | --- |
| `w3cColorToolkit.enabled` | boolean | `true` | Master switch |
| `w3cColorToolkit.languages` | string[] | `["*"]` | Language filter; `"*"` = all, `"!id"` excludes, exclusions win |
| `w3cColorToolkit.highlight` | enum | `underline` | Marker style, or `off` |
| `w3cColorToolkit.info` | boolean | `true` | Hover information |
| `w3cColorToolkit.convertSyntax` | `modern` \| `legacy` | `legacy` | `rgb()` / `hsl()` output style |
| `w3cColorToolkit.precision` | integer 1–10 | `5` | Significant digits in generated values |
| `w3cColorToolkit.experimental` | string[] | `["cssColor6", "cssColorHdr"]` | Draft specs to enable; both on by default |
| `w3cColorToolkit.advanced` | object | `{}` | Incremental overrides for the 35 built-in options |

All eight have `resource` scope, so they can be set per folder.

### The advanced object

Everything else is built in with a sensible default and overridden **incrementally** through
`w3cColorToolkit.advanced`, using flat dotted keys:

```jsonc
{
  "w3cColorToolkit.advanced": {
    "output.hexCase": "upper",
    "highlight.maxMatchesPerDocument": 3000,
    "variables.includePaths": ["src/styles"]
  }
}
```

In `settings.json`, typing `"` inside the object gives you completion, hover docs and range
validation for every key. Two snippets are available: *All advanced options (with defaults)* and
*Minimal example*.

Rules:

- keys you omit keep their built-in default; arrays and objects are replaced as a whole;
- the 8 top-level settings must **not** appear here — they are ignored with a warning, which removes
  any ambiguity about precedence;
- unknown keys and wrong types are ignored, out-of-range numbers are clamped, and every case is
  logged instead of throwing;
- User / Workspace / Folder scopes are merged **key by key** by the extension, because VS Code
  replaces object settings wholesale;
- **Manage → Show effective configuration** prints the merged result with the origin of each key.

#### All 35 options

**Highlight**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `highlight.markRuler` | boolean | `true` | Show a marker in the overview ruler |
| `highlight.matchWords` | `off` \| `css-like` \| `all` | `css-like` | Where bare color names count: nowhere, CSS-like languages only (`css`, `scss`, `sass`, `less`, `stylus`, `postcss`), or everywhere |
| `highlight.hexAlphaOrder` | `rgba` \| `argb` | `rgba` | Reading of 8-digit hex: `#RRGGBBAA` or `#AARRGGBB` |
| `highlight.matchRgbWithoutFunction` | boolean | `false` | Recognise bare `255, 136, 0` as RGB |
| `highlight.rgbWithoutFunctionLanguages` | string[] | `["*"]` | Languages for the bare RGB mode |
| `highlight.matchHslWithoutFunction` | boolean | `false` | Recognise bare `30, 100%, 50%` as HSL |
| `highlight.hslWithoutFunctionLanguages` | string[] | `["*"]` | Languages for the bare HSL mode |
| `highlight.maxMatchesPerDocument` | integer 1–1000000 | `10000` | Stop highlighting after this many colors in one document |
| `highlight.hdrToneMapping` | `none` \| `reinhard` \| `clip` | `reinhard` | Tone mapping used to preview HDR colors in sRGB |

**Color picker**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `colorPicker.mode` | `off` \| `dedupe` \| `all` | `dedupe` | Inline swatch and native picker; see the table above |

**Fields — hover *and* highlight**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `fields.enabled` | string[] \| null | `null` | Ordered field list; `null` = default order |
| `fields.excluded` | string[] | `[]` | Fields to turn off; exclusions win |

**Hover**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `info.previewSize` | `small` \| `large` | `small` | Size of the hover swatch |
| `info.previewShape` | `square` \| `rectangle` | `rectangle` | Shape of the hover swatch |
| `info.showDiagnostics` | boolean | `true` | Show parser notes |
| `info.showSpecLevel` | boolean | `true` | Show which specification level a syntax comes from |

**Convert**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `convert.enabled` | boolean | `true` | Enable the conversion commands |
| `convert.alphaLoss` | `reject` \| `confirm` \| `drop` | `reject` | When the target cannot express alpha |
| `convert.missingComponentLoss` | `confirm` \| `compute` | `confirm` | When `none` components cannot be preserved |
| `convert.namedColorFallback` | `reject` \| `nearest` | `reject` | When no color name matches exactly |
| `convert.recentFirst` | boolean | `true` | Put recently used targets at the top of the picker |

**Output**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `output.gamutMapping` | `css` \| `clip` \| `none` | `css` | Gamut mapping strategy for sRGB output |
| `output.hexCase` | `lower` \| `upper` | `lower` | Letter case of generated hex values |

**Scan**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `scan.comments` | boolean | `true` | Scan comments for colors |
| `scan.strings` | boolean | `true` | Scan string literals for colors |
| `scan.maxDocumentSizeKb` | integer 1–102400 | `2048` | Skip documents larger than this |

**Variables**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `variables.resolve` | boolean | `true` | Resolve custom properties and preprocessor variables |
| `variables.includePaths` | string[] | `[]` | Extra workspace-relative search paths for imports |
| `variables.maxImportDepth` | integer 0–100 | `20` | Maximum import depth |
| `variables.maxImportFiles` | integer 0–10000 | `200` | Maximum number of imported files |
| `variables.maxResolveDepth` | integer 1–100 | `20` | Maximum variable resolution depth |

**Other**

| Key | Values | Default | Purpose |
| --- | --- | --- | --- |
| `contextualPreview` | `off` \| `auto` \| `light` \| `dark` | `auto` | Color scheme assumed for `light-dark()`; results are marked as assumed |
| `experimental.hdrAssumedHeadroom` | number 0–10 | `0` | Assumed display HDR headroom for `hdr-color()`; `0` disables the preview |
| `coexistence.notify` | boolean | `true` | Warn once per workspace when another installed color extension may duplicate highlighting, hovers or commands |
| `logLevel` | `off` \| `error` \| `warn` \| `info` \| `debug` | `warn` | Verbosity of the output channel |

### A default this extension overrides

Through `contributes.configurationDefaults` the extension sets
`"editor.defaultColorDecorators": "never"`. Everything VS Code's built-in *default* provider
recognises (hex, `rgb()`, `hsl()`) is a subset of what this extension reports, so switching it off
removes overlap without losing coverage. The Settings UI shows it as *"default value overridden by
extension"* and you can set it back to `auto` or `always` at any time.

---

## Color fields — one list for hover and highlighting

`advanced.fields.enabled` / `advanced.fields.excluded` are the single scope for both features, so
there is no second place to configure what gets highlighted. **Configure Color Fields** shows the
same grouping, with the applicable scope on every entry.

| Group | Applies to | Fields |
| --- | --- | --- |
| CSS formats | hover row **and** highlighting | `hex`, `rgb`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color-srgb`, `color-srgb-linear`, `display-p3`, `color-display-p3-linear`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d50`, `xyz-d65`, `ictcp`†, `jzazbz`†, `jzczhz`†, `rec2100-pq`†, `rec2100-hlg`†, `rec2100-linear`†, `css-color-name` |
| CSS syntax, read only | highlighting only | `transparent`, `color-mix`, `relative-color`, `contrast-color`, `color-layers`, `light-dark`, `device-cmyk`, `color-custom-profile`, `current-color`, `system-color`, `hdr-color`† |
| Non-CSS representations | hover only | `hsv`, `cmyk` |
| Extra information, not a color | hover only | `preview`, `source`, `spec-level`, `diagnostics`, `alpha`\*, `gamut`\*, `contrast-on-white`\*, `contrast-on-black`\* |

† requires the `cssColorHdr` experimental switch. \* off by default — add it to `fields.enabled` or
tick it in *Configure Color Fields*. (Alpha is already visible in the serialised values such as
`#ff880080`; gamut and the contrast ratios are diagnostic detail rather than everyday information.)

Turning a CSS syntax off stops highlighting it; turning a format off also removes its hover row.
Syntax the registry does not know about is always highlighted, so a new parser feature never silently
loses its decoration.

The order of `fields.enabled` is the order of the hover rows. *Configure Color Fields* always writes
back in registry order — edit `fields.enabled` directly if you want a custom order.

---

## Specification support

| Level | State |
| --- | --- |
| CSS Color 3 (legacy comma syntax) | supported |
| CSS Color 4 (ED 2026-07-28) | supported, including all 148 named colors, four hex lengths, `none`, static `calc()`, angle units, and the 10 predefined `color()` spaces |
| CSS Color 5 (ED 2026-07-31) | statically evaluable parts: `color-mix()` including the multi-color form, relative color syntax, `alpha()`, `contrast-color()`, `device-cmyk()` naive fallback, `@color-profile` `fallback` |
| CSS Color 6 (ED 2026-01-11) | experimental, **on by default**, switchable through `w3cColorToolkit.experimental`: `color-layers()`, extended `contrast-color()`, `wcag2` / `wcag2()`, `tbd-fg` / `tbd-bg` |
| CSS Color HDR 1 (ED 2026-07-28) | experimental, **on by default**, same switch: `ictcp()`, `jzazbz()`, `jzczhz()`, `color(rec2100-pq \| rec2100-hlg \| rec2100-linear)`, `hdr-color()` |

Run **Manage → Show specification support matrix** to see the matrix with your current switches
applied.

### Gamut and HDR handling

- sRGB output uses the CSS-specified gamut mapping by default, not per-channel clipping
  (`advanced.output.gamutMapping` can switch to `clip` or `none`).
- Wide gamut colors are mapped for the preview swatch only; the hover keeps showing the original
  value and the gamut status.
- HDR colors are tone mapped for the preview (`advanced.highlight.hdrToneMapping`) and flagged as
  tone mapped in the hover.

---

## Troubleshooting

**No inline swatch appears.** Check `editor.colorDecorators` (VS Code's own master switch),
`advanced.colorPicker.mode` (must not be `off`), and whether the file has more than
`editor.colorDecoratorsLimit` (500) colors — the extension truncates at that limit and logs it. The
picker is anchored on the swatch, so "picker without swatch" is not possible.

**A color shows two swatches.** Either `colorPicker.mode` is `all`, or another color extension is
also reporting that range. `dedupe` only probes VS Code's built-in CSS provider, in `css`, `less` and
`scss`.

*Why probing is needed:* VS Code renders the results of **all** color providers without deduplicating
by range, it drops the built-in *default* provider as soon as any extension returns an array (even an
empty one), and `vscode.executeDocumentColorProvider` does not tell you which provider produced which
color. Probing the ranges is the only way to guarantee exactly one swatch.

**A color is not highlighted.** In order of likelihood: `w3cColorToolkit.highlight` is `off`; the
language is excluded by `w3cColorToolkit.languages`; the field for that syntax is turned off in
*Configure Color Fields*; the value is context dependent (see above); the document is larger than
`advanced.scan.maxDocumentSizeKb`; there are more colors than
`advanced.highlight.maxMatchesPerDocument`; or it is a bare color name in a non-CSS language and
`advanced.highlight.matchWords` is still `css-like`.

**The picker offers no way to change a value.** That is the read-only swatch for context dependent
values and read-only syntax. Use `Convert Color` to rewrite it deliberately.

**Conversion was refused.** The message names the reason and the line: a contextual value, alpha that
the target cannot express (`convert.alphaLoss`), or no exact color name (`convert.namedColorFallback`).
Loosen the relevant policy, or pick a different target.

**`var(--x)` stays unresolved.** Check `advanced.variables.resolve`, add the stylesheet root to
`advanced.variables.includePaths`, and note that untrusted workspaces do not read imported files. The
import walk is bounded by `variables.maxImportDepth` / `maxImportFiles` / `maxResolveDepth`.

**A key in `advanced` seems to be ignored.** Run **Manage → Show effective configuration** — it
prints every key with the scope it came from, plus a list of rejected keys. Set
`advanced.logLevel` to `debug` and open **Manage → Open the log** for details.

**Results look stale.** **Manage → Rescan the current document**, or **Clear the index cache**. If you
hit syntax the extension does not recognise, **Manage → Log unsupported syntax** records it for a bug
report.

---

## Known limitations

- Scanning very large documents is slower than the target performance budget;
  `advanced.scan.maxDocumentSizeKb` and `advanced.highlight.maxMatchesPerDocument` bound the work.
- CSS Color 6 and CSS Color HDR are drafts; values and syntax may still change.
- Untrusted workspaces resolve variables only within the current document.
- No remote ICC profile download; `device-cmyk()` uses the naive fallback and is marked approximate.

## Localisation

English and Simplified Chinese, including the command titles. Other locales fall back to English.

## License

MIT — see [LICENSE.txt](./LICENSE.txt). Third-party notices: [NOTICE.md](./NOTICE.md).
