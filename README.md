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
| CSS Color 6 (ED 2026-01-11) | experimental, **off by default**: `color-layers()`, extended `contrast-color()`, `wcag2` / `wcag2()`, `tbd-fg` / `tbd-bg` |
| CSS Color HDR 1 (ED 2026-07-28) | experimental, **off by default**: `ictcp()`, `jzazbz()`, `jzczhz()`, `color(rec2100-pq | rec2100-hlg | rec2100-linear)`, `hdr-color()` |

Run **W3C Color Toolkit: Manage → Show specification support matrix** to see the matrix with your
current switches applied.

### Context dependent values are never faked

`currentColor`, the 19 system colors, the 23 deprecated system colors, `light-dark()`, unresolved
`var()`, custom `@color-profile` without a `fallback`, and non-static alpha all resolve to a
`contextual` state. They are not highlighted and not converted, and the hover explains what they
depend on instead of showing a made-up swatch. Deprecated system colors also show their
replacement keyword.

`hdr-color()` depends on the display HDR headroom, so it stays contextual even with the HDR switch on.

## Settings

Only 8 settings appear in the Settings UI:

| Setting | Default | Purpose |
| --- | --- | --- |
| `w3cColorToolkit.enabled` | `true` | Master switch |
| `w3cColorToolkit.languages` | `["*"]` | Language filter; `!id` excludes, exclusions win |
| `w3cColorToolkit.highlight` | `background` | Highlight style; `off` disables highlighting |
| `w3cColorToolkit.info` | `true` | Hover information |
| `w3cColorToolkit.convertSyntax` | `modern` | `rgb()` / `hsl()` output style |
| `w3cColorToolkit.precision` | `5` | Significant digits |
| `w3cColorToolkit.experimental` | `[]` | `cssColor6`, `cssColorHdr` |
| `w3cColorToolkit.advanced` | `{}` | Incremental overrides for the 34 built-in options |

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
| `Configure Hover Fields` | Multi-select Quick Pick for hover fields |
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
