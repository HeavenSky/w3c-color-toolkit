# W3C Color Toolkit

**English** · [简体中文](./zh/README.md)

Highlight, inspect, pick and convert CSS colors in any source file, from hex to `oklch()`, `color-mix()` and HDR.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/HeavenSky.w3c-color-toolkit.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.w3c-color-toolkit)
[![Installs](https://vsmarketplacebadges.dev/installs-short/HeavenSky.w3c-color-toolkit.svg)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.w3c-color-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE.txt)

It does what Color Highlight, Color Info and Change Color Format do separately, in one extension that reads CSS Color 3, 4 and 5 plus the CSS Color 6 and HDR drafts in every language. VS Code's built-in swatches recognize classic forms such as hex, `rgb()` and `hsl()`, but `color(display-p3 …)`, `color-mix()`, relative colors and design tokens behind `var(--brand)` get no swatch. Highlighting, hover, the native picker and conversion share one color engine, so all four agree on the range, the value and whether it can be resolved at all.

![Highlighted colors with inline swatches in a CSS file, including var(), color-mix(), light-dark(), oklch() and display-p3](./media/screenshots/highlight.png)

## Get started

Three steps take you from installing to converting your first color; you need VS Code 1.101 or newer.

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HeavenSky.w3c-color-toolkit).
2. Open any file with colors in it and hover one: you get a preview, the original text and the value in every enabled format.
3. Put the cursor in a color and run _W3C Color Toolkit: Convert Color_ from the Command Palette to rewrite it in another format.

## See every color, not just hex and rgb()

Every supported color gets a marker in the editor and a tick in the overview ruler, in CSS and in any other language. Underline is the default marker, and `w3cColorToolkit.highlight` offers other styles. Colors that depend on context, such as `currentColor` or a `var()` with no definition, are never painted with a made-up value. See [Highlighting and hover](./docs/highlight-and-hover.md) to pick a marker and choose which syntaxes count.

## Read a color in every format on hover

Hovering shows a preview, the source text, one row per format and the specification level the syntax comes from.

![Hover over an oklch() color listing its hex, rgb(), hsl() and other forms](./media/screenshots/hover.png)

## Edit a color with the native picker without losing its format

Click the swatch in front of any supported color, including `oklch()`, `lab()` and `color(display-p3 …)`, to open VS Code's color picker. **The text stays as written until you actually change the color**, and the new value is written back in the original format whenever that format can express it. Expressions such as `color-mix()` or a resolved `var()` get a read-only swatch, so one stray drag cannot flatten them into a literal. Details are in [Edit colors with the picker](./docs/color-picker.md).

![Native color picker opened from the swatch of a display-p3 color](./media/screenshots/color-picker.png)

## Convert colors without silently losing alpha or gamut

_Convert Color_ rewrites the value in place and _Copy Color As_ puts it on the clipboard, in any target from `#RRGGBB` to `color(rec2100-pq)`. Before writing, it warns about gamut mapping and refuses to drop alpha or `none` components unless you allow it. See [Convert and copy colors](./docs/convert.md) for the selection rules and key bindings.

![Convert Color picker previewing each target value and flagging gamut mapping](./media/screenshots/convert.png)

## Preview design tokens behind var(), $ and @

`var(--brand)`, `$brand` and `@brand` resolve to the color they stand for when the workspace defines them unambiguously, including Tailwind-style channel tokens such as `rgb(var(--channels) / 0.4)`. When a token has several definitions, for example one per theme, the hover lists every candidate instead of guessing. See [Resolve variables](./docs/variables.md).

![Hover listing the :root and dark-scheme candidates of var(--surface)](./media/screenshots/variables.png)

## When not to use it

It resolves variables but does not evaluate preprocessor logic: SCSS maps, `@each`, mixins, functions such as `darken()`, and Stylus variables are left alone. It does not map Tailwind utility classes such as `bg-red-500` to colors; Tailwind CSS IntelliSense covers that.

## Learn more

- [Documentation index](./docs/README.md): configuration, supported syntax and troubleshooting.
- Commands and settings are listed on the marketplace page's Feature Contributions tab.
- See the [changelog](./CHANGELOG.md) for what changed in each release.

## License

[MIT](./LICENSE.txt). Third-party notices are in [NOTICE.md](./NOTICE.md).
