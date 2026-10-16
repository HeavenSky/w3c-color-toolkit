# Highlighting and hover

**English** · [简体中文](../zh/docs/highlight-and-hover.md)

This page shows how to change the marker drawn on colors, which syntaxes get one, and which rows the hover shows; it assumes the extension is installed and you can edit your `settings.json`. Option keys under `advanced` are set as described in [Configuration](./configuration.md#override-built-in-options).

## Pick a marker style

`w3cColorToolkit.highlight` sets one marker style for the whole extension:

| Value | What it draws |
| --- | --- |
| `underline` (default) | Underline in the color |
| `background` | Filled background behind the text, with a readable foreground |
| `foreground` | Colors the text itself |
| `outline` | 2px outline around the value |
| `dot-before` / `dot-after` | Bullet before or after the value |
| `square-before` / `square-after` | Filled square before or after the value |
| `off` | No highlighting |

**`square-before` and `square-after` are drawn by the extension itself**, so they work in every language and position and do not depend on VS Code's color feature. Use them when you turn the inline swatch off but still want a visible chip.

`advanced.highlight.markRuler` adds or removes the tick in the overview ruler.

## Choose which colors count

Hover and highlighting share one field list, so turning a field off removes it from the hover, the highlighting, or both, depending on its group. Run *W3C Color Toolkit: Configure Color Fields* to tick fields in a Quick Pick, or edit `advanced.fields.enabled` and `advanced.fields.excluded` directly.

| Group | Applies to | Fields |
| --- | --- | --- |
| CSS formats | hover row and highlighting | `hex`, `rgb`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color-srgb`, `color-srgb-linear`, `display-p3`, `color-display-p3-linear`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d50`, `xyz-d65`, `ictcp`†, `jzazbz`†, `jzczhz`†, `rec2100-pq`†, `rec2100-hlg`†, `rec2100-linear`†, `css-color-name` |
| CSS syntax, read only | highlighting only | `transparent`, `color-mix`, `relative-color`, `contrast-color`, `color-layers`, `light-dark`, `device-cmyk`, `color-custom-profile`, `current-color`, `system-color`, `hdr-color`† |
| Non-CSS representations | hover only | `hsv`, `cmyk` |
| Extra information | hover only | `preview`, `source`, `spec-level`, `diagnostics`, `alpha`\*, `gamut`\*, `contrast-on-white`\*, `contrast-on-black`\* |

† Needs `cssColorHdr` in `w3cColorToolkit.experimental`. \* Off by default; add it to `fields.enabled` or tick it in *Configure Color Fields*.

- `fields.enabled` set to `null` keeps the default list; exclusions in `fields.excluded` always win.
- Syntax the field list does not know is always highlighted, so a newly supported syntax never loses its marker silently.
- *Configure Color Fields* writes fields back in the default order; edit `fields.enabled` by hand for a custom hover order.

A few more options decide what the scanner looks at:

| Option | Effect |
| --- | --- |
| `advanced.highlight.matchWords` | Where bare color names such as `red` count: `off`, `css-like` (`css`, `scss`, `sass`, `less`, `stylus`, `postcss`), or `all` languages |
| `advanced.scan.comments`, `advanced.scan.strings` | Whether colors inside comments and string literals count |
| `advanced.highlight.hexAlphaOrder` | Read 8-digit hex as `#RRGGBBAA` (`rgba`) or `#AARRGGBB` (`argb`) |
| `advanced.highlight.maxMatchesPerDocument` | Stop highlighting after this many colors; nested colors count separately, so `var(--a, #fff)` uses two |

## Change what the hover shows

The hover lists rows in the order of `fields.enabled`: by default the preview, the source text, one row per CSS format, `hsv` and `cmyk`, then the specification level and parser notes. For `oklch(70% 0.2 30)` the first rows read:

```text
Source: oklch(70% 0.2 30)
Hex: #ff614d
rgb(): rgb(255, 97, 76.8)
hsl(): hsl(6.66, 100%, 65.8%)
```

- `advanced.info.previewSize` (`small`, `large`) and `advanced.info.previewShape` (`square`, `rectangle`) set the preview swatch.
- `advanced.info.showSpecLevel` and `advanced.info.showDiagnostics` hide the specification row and the parser notes; the specification row is also omitted for a variable reference without a unique value.
- `w3cColorToolkit.info` set to `false` turns the hover off entirely.

The preview is a local SVG built only from sanitized numbers; the source text is never inserted into it.

## Preview wide-gamut and HDR colors

Previews are mapped into sRGB, while the hover keeps the original value and states whether it was mapped. Wide-gamut colors use the CSS gamut-mapping algorithm, and HDR colors are tone mapped with `advanced.highlight.hdrToneMapping` (`reinhard` by default, or `clip`, `none`) and flagged as tone mapped. `light-dark()` follows `advanced.contextualPreview`; see [Supported color syntax](./color-support.md#values-that-depend-on-context).
