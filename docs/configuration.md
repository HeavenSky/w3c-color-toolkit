# Configuration

**English** · [简体中文](../zh/docs/configuration.md)

Everything works without configuration. This page explains how settings are layered, what every built-in option does and how to keep the extension out of some files; it assumes you can edit `settings.json`.

## Use the seven top-level settings

The Settings UI shows seven settings, and the marketplace page lists them on its Feature Contributions tab: the master switch `enabled`, the marker style `highlight`, the hover switch `info`, the conversion output `convertSyntax` and `precision`, the draft-spec switch `experimental`, and the `advanced` object described below. All of them have `resource` scope, so each workspace folder can set its own value.

`experimental` lists the drafts to enable, `cssColor6` and `cssColorHdr`; both are on by default.

_W3C Color Toolkit: Enable Features_ toggles highlighting, the swatch and picker, hover, conversion, variable resolution and the two drafts from one Quick Pick, so you rarely need to edit these by hand.

## Override built-in options

The other 34 options are built in with defaults and overridden **one key at a time** through `w3cColorToolkit.advanced`, using flat dotted keys:

```jsonc
{
	"w3cColorToolkit.advanced": {
		"output.hexCase": "upper",
		"highlight.maxMatchesPerDocument": 3000,
		"variables.lookupGlobs": ["src/styles/**/*.css"],
	},
}
```

Typing `"` inside the object in `settings.json` offers completion, hover documentation and range checks for every key. Two snippets insert either every option with its default or a minimal example.

- A key you omit keeps its default; an array or object value replaces the default as a whole.
- The seven top-level settings are ignored with a warning if they appear here, so there is only one place for each.
- Unknown keys and wrong types are ignored, numbers out of range are clamped, and each case is logged instead of failing.
- User, Workspace and Folder values are merged key by key, whereas VS Code on its own would replace the whole object.
- _W3C Color Toolkit: Manage_ → _Show effective configuration_ prints the merged result, the scope each key came from and the keys that were rejected.

## Look up an option

| Key                               | Values (default first)                  | Effect                                                                                                                                                                             |
| --------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `disable.maxFileSizeMb`           | `0.3`, 0 to 1024                        | Hide the extension in larger documents; see [below](#keep-the-extension-out-of-some-files)                                                                                         |
| `disable.fileNames`               | `["*.min.*", "*.map"]`                  | File-name patterns that hide the extension                                                                                                                                         |
| `disable.languageIds`             | `["log", "plaintext"]`                  | Language-id patterns that hide the extension                                                                                                                                       |
| `highlight.markRuler`             | `true`, `false`                         | Tick in the overview ruler                                                                                                                                                         |
| `highlight.matchWords`            | `css-like`, `off`, `all`                | Where bare color names count; see [Highlighting and hover](./highlight-and-hover.md#choose-which-colors-count)                                                                     |
| `highlight.hexAlphaOrder`         | `rgba`, `argb`                          | Reading of 8-digit hex                                                                                                                                                             |
| `highlight.maxMatchesPerDocument` | `600`, 1 to 1000000                     | Colors highlighted per document                                                                                                                                                    |
| `highlight.hdrToneMapping`        | `reinhard`, `clip`, `none`              | Tone mapping for HDR previews                                                                                                                                                      |
| `colorPicker.mode`                | `dedupe`, `all`, `off`                  | How swatches are shared; see [Edit colors with the picker](./color-picker.md#get-exactly-one-swatch-per-color)                                                                     |
| `colorPicker.dedupeLanguages`     | `[]`                                    | Extra languages to probe in `dedupe` mode                                                                                                                                          |
| `fields.enabled`                  | `null` or a list of field ids           | Fields for hover and highlighting, in hover order; `null` uses the default list                                                                                                    |
| `fields.excluded`                 | `[]`                                    | Fields to turn off; exclusions win                                                                                                                                                 |
| `info.previewSize`                | `small`, `large`                        | Hover preview size                                                                                                                                                                 |
| `info.previewShape`               | `rectangle`, `square`                   | Hover preview shape                                                                                                                                                                |
| `info.showDiagnostics`            | `true`, `false`                         | Parser notes in the hover                                                                                                                                                          |
| `info.showSpecLevel`              | `true`, `false`                         | Specification level in the hover                                                                                                                                                   |
| `convert.enabled`                 | `true`, `false`                         | Conversion commands                                                                                                                                                                |
| `convert.alphaLoss`               | `reject`, `confirm`, `drop`             | Target cannot express alpha; see [Convert and copy colors](./convert.md#decide-what-happens-when-information-would-be-lost)                                                        |
| `convert.missingComponentLoss`    | `confirm`, `compute`                    | `none` components cannot be kept                                                                                                                                                   |
| `convert.namedColorFallback`      | `reject`, `nearest`                     | No exact color name                                                                                                                                                                |
| `convert.recentFirst`             | `true`, `false`                         | Recent targets at the top of the picker                                                                                                                                            |
| `output.gamutMapping`             | `css`, `clip`, `none`                   | Gamut mapping for sRGB output                                                                                                                                                      |
| `output.hexCase`                  | `lower`, `upper`                        | Case of generated hex                                                                                                                                                              |
| `scan.comments`                   | `true`, `false`                         | Colors inside comments                                                                                                                                                             |
| `scan.strings`                    | `true`, `false`                         | Colors inside string literals                                                                                                                                                      |
| `variables.resolve`               | `true`, `false`                         | Variable resolution; see [Resolve variables](./variables.md)                                                                                                                       |
| `variables.lookupGlobs`           | `["**/*.{css,scss,sass,less}"]`         | Files searched for definitions                                                                                                                                                     |
| `variables.maxIndexedFiles`       | `2000`, 0 to 100000                     | Stylesheets in the index                                                                                                                                                           |
| `variables.languageIds`           | `null` or a list of language ids        | Languages where references are recognized                                                                                                                                          |
| `variables.maxResolveDepth`       | `20`, 1 to 100                          | Nesting depth of references                                                                                                                                                        |
| `contextualPreview`               | `auto`, `light`, `dark`, `off`          | Branch assumed for `light-dark()`; see [Supported color syntax](./color-support.md#values-that-depend-on-context)                                                                  |
| `experimental.hdrAssumedHeadroom` | `0`, 0 to 10                            | Assumed HDR headroom for `hdr-color()`; `0` disables the preview                                                                                                                   |
| `coexistence.notify`              | `true`, `false`                         | Warn once per workspace when Color Highlight (`naumovs.color-highlight`), Color Info (`bierner.color-info`) or Change Color Format (`bbugh.change-color-format`) is also installed |
| `logLevel`                        | `warn`, `off`, `error`, `info`, `debug` | Detail written to the output channel                                                                                                                                               |

## Keep the extension out of some files

A hidden file gets no highlighting, swatch, hover or working commands, and it is never scanned. Any one of three conditions hides a file:

- `disable.maxFileSizeMb`: the document is longer than this. Decimals are allowed and `0` means no limit. **The limit counts UTF-16 code units, not bytes on disk**, with 1 MB = 1,048,576 code units: the default `0.3` is 314,573 code units, about 307 KiB of ASCII text, and for CJK and other non-ASCII text the limit is looser than the file size suggests.
- `disable.fileNames`: gitignore-style patterns matched against the file name only. A pattern containing `/` is ignored and reported in the output channel.
- `disable.languageIds`: the same syntax matched against the language id, which catches `Dockerfile`, `Makefile` or a file whose language you switched by hand.

In both pattern lists later entries win and `!` re-enables, so `["*.min.*", "*.map", "!theme.min.css"]` keeps one minified file in scope. A negation only works within its own list; it cannot rescue a file the other list hides. Set a list to `[]` to turn that condition off.

## Know where it runs

The extension needs VS Code 1.101 or newer and no other extension or tool. It runs in local, remote and web workspaces from one bundle. In an untrusted workspace it reads only files you have open, so variables defined elsewhere stay unresolved until you trust the workspace.

The interface is in English and Simplified Chinese, including command titles, and follows VS Code's display language; other languages fall back to English.
