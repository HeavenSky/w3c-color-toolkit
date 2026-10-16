# Resolve variables

**English** · [简体中文](../zh/docs/variables.md)

This page shows how CSS custom properties and SCSS or Less variables are turned into colors, and what to do when a reference shows nothing; it assumes your token files are in the workspace and `advanced.variables.resolve` is `true`, which is the default.

## Know which references resolve

| Reference | Where it resolves |
| --- | --- |
| `var(--brand)` | Every variable language, see below |
| `rgb(var(--channels) / 0.4)` | Same; the variable is substituted into the color function before parsing |
| `$brand` | `scss`, `sass` |
| `@brand` | `less` |
| Stylus `brand` or `$brand` | Not resolved; colors in `.styl` files are still recognized |

Variable references are recognized in the languages listed in `advanced.variables.languageIds`. The default `null` means `css`, `scss`, `sass`, `less`, `postcss` and `tailwindcss`; the last one is there because Tailwind CSS IntelliSense switches CSS files to that language.

## Let the extension find your token files

**Definitions are found by glob, not by following `@import`.** Stylesheets are often combined by a JavaScript bundler with no CSS-level import, so an import graph would never reach the token file. The extension indexes every file matched by `advanced.variables.lookupGlobs` (default `["**/*.{css,scss,sass,less}"]`) and keeps the index current with a file watcher.

- `@import`, `@use` and `@forward` still add files the globs missed.
- `node_modules`, `dist`, `out`, `build`, `coverage`, `.git`, `.next`, `.nuxt` and `.svelte-kit` are always skipped.
- `advanced.variables.maxIndexedFiles` (default `2000`) caps the index.
- Open files are read from the editor, so a new definition takes effect before you save.
- Right after startup, colors defined in other files may appear a moment late while the index is built.

In an untrusted workspace, only definitions in files you have open are used; other files on disk are not read.

## Read the three outcomes of a lookup

1. Unique: the reference shows the color like any literal. A custom property needs exactly one unconditional root-level definition (`:root`, `:host` or `html`, not inside `@media` or another conditional at-rule); a component-level override such as `.button { --brand: … }` does not change that. An SCSS or Less variable is looked up in the same file from the innermost block that contains the reference outwards, so a definition inside a block applies only within that block and overrides outer ones there. SCSS takes the last definition above the reference, the value it sees when it evaluates the file from top to bottom; Less takes the last definition in that block even when it comes after the reference, because Less evaluates variables lazily. Other files are consulted only for top-level definitions.
2. Not unique: the hover lists every candidate with where it comes from, for example `@media (prefers-color-scheme: dark) › :root`, but there is no swatch and no highlight. This happens when a definition sits inside a conditional at-rule or exists only under selectors such as `[data-theme="dark"]` or `.dark`, because the value depends on the environment or the element.
3. No definition: nothing at all, no highlight, no swatch and no hover. That keeps every unknown `$foo` in a SCSS file from opening an empty hover.

Definitions are read from a real stylesheet syntax tree, so a commented-out definition never competes with the real one, and a file with a syntax error only loses its own definitions.

## Use variables inside color functions

`rgb(var(--channels) / 0.4)`, `rgba(var(--x), 0.4)`, `hsl(var(--h) 50% 50%)` and `color-mix(in srgb, var(--a), red)` substitute the variable back into the text before parsing. That makes Tailwind-style channel tokens work:

```css
:root { --channels: 148 163 184; }
.badge { background: rgb(var(--channels) / 0.4); }
```

- A fallback applies when the variable is not found: `var(--missing, 1 2 3)`.
- A reference cycle, or nesting deeper than `advanced.variables.maxResolveDepth` (default `20`), counts as no definition.
- When the variable is not unique, each candidate is substituted into the whole expression, so the hover shows `rgb(148 163 184 / 0.4)` rather than a bare triplet.
- A preprocessor variable used this way, such as `rgba($brand, 0.4)`, is not resolved as a whole, because it would produce the SCSS or Less `rgba(color, alpha)` overload rather than CSS; the inner `$brand` still gets its own swatch.

## Work with nested and resolved references

Every color inside a reference gets its own swatch: `var(--brand, #ff8800)` shows two, one for the whole reference and one for the fallback, and `var(--a, var(--b, #674), #def)` shows four. Highlighting marks only the outermost range, so underlines never double up.

**A resolved reference is read only.** The picker shows its color without letting you drag it, and *Convert Color* refuses and names the variable, because rewriting `var(--brand)` into `#ff8800` would destroy the token.

## Know what is not evaluated

SCSS maps, `@each`, mixins, arithmetic and functions such as `darken()` are not evaluated, so references that need them fall into the "no definition" case. Stylus variables are not resolved at all: there is no official PostCSS parser for Stylus, and the only third-party bridge needs Node-only modules that would break VS Code for the Web.
