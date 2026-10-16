# Edit colors with the picker

**English** · [简体中文](../zh/docs/color-picker.md)

This page shows how to edit a color through VS Code's native picker and how to make sure every color gets exactly one swatch; it assumes `editor.colorDecorators` is on, which is VS Code's default.

## Open the picker from the swatch

The extension registers a color provider, so VS Code draws its inline swatch in front of every supported color and opens its picker from that swatch. That includes `oklch()`, `lab()`, `color()`, `color-mix()`, relative colors, the HDR spaces, and colors inside comments and strings. `editor.colorDecoratorsActivatedOn` decides whether the picker opens on hover, on click, or both.

## Keep the original format

**Until you change the color, the source text stays exactly as written.** Because the picker itself works in 8-bit sRGB, the extension puts the original value in the header, and clicking the header to cycle formats converts from the original color, not from the picker's sRGB approximation. Opening the picker on `color(display-p3 0.2 0.8 0.4)` therefore leaves it untouched.

Once you drag to a new color, the value is written in the original format first, then falls back to hex, `rgb()`, `hsl()` and `oklch()`, skipping any format that cannot express the current alpha.

## Know which swatches are read only

Values that are not a plain color get a swatch you can look at but not drag, so a stray drag cannot flatten an expression into a literal:

- context-dependent values: `light-dark()`, system colors, `currentColor`, unresolved `var()`;
- resolved variable references such as `var(--brand)` or `$brand`;
- read-only syntax: `color-mix()`, relative colors, `contrast-color()`, `device-cmyk()`, `color-layers()`.

To rewrite one of these on purpose, use [Convert Color](./convert.md).

## Get exactly one swatch per color

`advanced.colorPicker.mode` decides how the extension shares the swatch with other color providers:

| Mode | Behavior |
| --- | --- |
| `dedupe` (default) | In languages where a built-in VS Code language service also reports colors, ask the other providers first, once per document version, and report only the ranges they left uncovered. Everywhere else, report everything. |
| `all` | Report every supported color in every language, even where another provider already did. |
| `off` | Report nothing; VS Code falls back to its own providers. |

`dedupe` probes `css`, `less`, `scss`, `html`, `handlebars`, `json`, `jsonc`, `snippets`, and every language another extension attaches to the HTML or JSON language service. Probing is the only reliable way: VS Code draws the results of all providers without merging equal ranges, and it does not say which provider produced which color.

Third-party color extensions, such as Tailwind CSS IntelliSense or Volar, cannot be detected from their manifests. If one of them doubles your swatches, add its languages to `advanced.colorPicker.dedupeLanguages` (default `[]`). Each entry costs one extra provider round trip per document version; listing a language that is already probed changes nothing and is reported once in the output channel.

## Know the limits VS Code sets

- At most `editor.colorDecoratorsLimit` swatches (500 by default) are shown per editor; the extension stops reporting at that number and logs it.
- The extension sets `editor.defaultColorDecorators` to `never`, because the hex, `rgb()` and `hsl()` forms VS Code's default provider recognizes are a subset of what the extension reports. The Settings UI shows this as "default value overridden by extension"; set it back to `auto` or `always` if you prefer.
