# Supported color syntax

**English** · [简体中文](../zh/docs/color-support.md)

This page lists which CSS color specifications are supported and explains why some values are recognized but never previewed; it needs no setup. Run _W3C Color Toolkit: Manage_ → _Show specification support matrix_ to see the same matrix with your current switches applied.

## Check a specification level

| Level                           | State                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CSS Color 3                     | Supported, including the legacy comma syntax                                                                                                                                                                                   |
| CSS Color 4 (ED 2026-07-28)     | Supported: all 148 named colors, four hex lengths, `none`, static `calc()`, four angle units and the 10 predefined `color()` spaces                                                                                            |
| CSS Color 5 (ED 2026-07-31)     | The statically evaluable parts: `color-mix()` including the multi-color form, relative color syntax, `alpha()`, `contrast-color()`, `device-cmyk()` with the naive fallback, and the `fallback` descriptor of `@color-profile` |
| CSS Color 6 (ED 2026-01-11)     | Experimental, on by default: `color-layers()`, extended `contrast-color()`, `wcag2` and `wcag2()`, `tbd-fg` and `tbd-bg`                                                                                                       |
| CSS Color HDR 1 (ED 2026-07-28) | Experimental, on by default: `ictcp()`, `jzazbz()`, `jzczhz()`, `color(rec2100-pq)`, `color(rec2100-hlg)`, `color(rec2100-linear)` and `hdr-color()`                                                                           |

Both drafts are switched through `w3cColorToolkit.experimental`; their values and syntax may still change as the specifications evolve.

## Values that depend on context

**A value that depends on the element, the theme or the display is never shown with a made-up color.** `currentColor`, the 19 system colors, the 23 deprecated system colors, `light-dark()`, an unresolved `var()`, a custom `@color-profile` without `fallback`, and alpha that is not static are recognized as contextual. They are not converted and, unless one of the preview assumptions below applies, not highlighted; the hover explains what the value depends on, and deprecated system colors also show their replacement.

- `light-dark()` previews the branch chosen by `advanced.contextualPreview`. The default `auto` follows the current editor theme and re-renders when you switch themes; `light` and `dark` fix the branch, and `off` disables the preview. The hover labels the result as assumed.
- `hdr-color()` depends on the display's HDR headroom, so it stays contextual even with the HDR draft on, unless you set `advanced.experimental.hdrAssumedHeadroom` above `0`.

## Approximations

`device-cmyk()` uses the naive conversion without an ICC profile, and the hover marks it as approximate; remote ICC profiles are never downloaded. Wide-gamut and HDR previews are mapped into sRGB, as described in [Highlighting and hover](./highlight-and-hover.md#preview-wide-gamut-and-hdr-colors).
