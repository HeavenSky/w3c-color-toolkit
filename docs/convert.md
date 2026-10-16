# Convert and copy colors

**English** · [简体中文](../zh/docs/convert.md)

This page shows how to rewrite a color in another format, copy it in another format, and bind keys to your favorite targets; it assumes `advanced.convert.enabled` is `true`, which is the default.

## Convert or copy the color under the cursor

*Convert Color* rewrites the value in the document; *Copy Color As* puts the converted value on the clipboard and leaves the document alone. Both are in the Command Palette and in the editor context menu under W3C Color Toolkit, and both open the same picker grouped by category:

| Category | Targets |
| --- | --- |
| Common | `#RRGGBB`, `rgb()`, `hsl()`, `oklch()` |
| Perceptual | `hwb()`, `lab()`, `lch()`, `oklab()` |
| `color()` predefined | `srgb`, `srgb-linear`, `display-p3`, `display-p3-linear`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d50`, `xyz-d65` |
| Color name | `<named-color>` |
| HDR (experimental) | `ictcp()`, `jzazbz()`, `jzczhz()`, `color(rec2100-pq)`, `color(rec2100-hlg)`, `color(rec2100-linear)` |

Each entry previews the result and flags gamut mapping before you choose it. With `advanced.convert.recentFirst` on (the default), your recent targets move to the top.

## Select what to convert

- Empty selection: the color under the cursor; with nested colors, the innermost one.
- Non-empty selection: it must cover exactly one complete color expression; a partial selection is reported as invalid rather than guessed at.
- Multiple selections: all of them are converted first, and the document is written in one edit only if every one succeeded, so a file is never half converted.

## Decide what happens when information would be lost

By default conversion refuses rather than silently dropping information, and the message names the reason and the line.

| Option | When it applies | Values |
| --- | --- | --- |
| `advanced.convert.alphaLoss` | The target cannot express the alpha, for example `#RRGGBB` for a translucent color | `reject` (default), `confirm`, `drop` |
| `advanced.convert.missingComponentLoss` | `none` components cannot be kept in the target | `confirm` (default), `compute` |
| `advanced.convert.namedColorFallback` | No color name matches exactly | `reject` (default), `nearest` |

Context-dependent values and resolved variable references are never converted; the message says what the value depends on, or which variable it comes from.

## Shape the output

| Option | Effect |
| --- | --- |
| `w3cColorToolkit.convertSyntax` | `legacy` (default) writes `rgb(255, 97, 76.8)` with commas; `modern` writes `rgb(255 97 76.8)` |
| `w3cColorToolkit.precision` | Significant digits in generated numbers, 1 to 10 (default 3) |
| `advanced.output.hexCase` | `lower` (default) or `upper` hex digits |
| `advanced.output.gamutMapping` | How out-of-gamut colors reach sRGB targets: `css` (default, the CSS Color 4 algorithm), `clip` per channel, or `none` |

## Bind a key to a target

Every target also has its own command, `w3cColorToolkit.convertTo.<target>`. They are hidden from the Command Palette but listed in the Keyboard Shortcuts editor; search for `convertTo`. No default keybindings are shipped, so add your own to `keybindings.json`:

```jsonc
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

The HDR targets only run while `cssColorHdr` is in `w3cColorToolkit.experimental`; the `w3cColorToolkit.hdrEnabled` context key lets a binding follow that switch.
