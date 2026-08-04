/**
 * DocumentColorProvider: VS Code 原生的行内色块与 Hover 取色器。
 *
 * 为什么必须自己提供:
 * - 原生取色器挂在"颜色装饰"上 (`ColorHoverParticipant` 只对 `isColorDecoration`
 *   的装饰产出取色器), 因此"要调节器就必须有色块", 二者不能拆开;
 * - VS Code 内置的默认提供器只认 hex 与 rgb/hsl 系写法, 内置 CSS 提供器只在
 *   `css` / `less` / `scss` 且颜色落在 AST 认得的位置时给颜色。`oklch()`、`lab()`、
 *   `color()`、`color-mix()`、相对颜色、HDR 空间, 以及注释与字符串里的颜色, 两者都不给。
 *
 * 去重的难点 (2026-08-05 实测 VS Code 1.130.0 打包源码):
 * - 渲染端 `getColors` 只要有**任意**扩展提供器返回了数组 (哪怕是空数组) 就不再使用
 *   内置默认提供器, 且多个提供器的结果直接叠加, 不按 range 去重;
 * - 探测命令 `vscode.executeDocumentColorProvider` 调用的是同一个函数, 但只回传
 *   `{range, color}`, **丢掉了提供器身份**, 所以无法区分"这一格是内置 CSS 给的还是
 *   默认提供器给的"。
 *
 * 由此得到 `dedupe` 模式 (默认): 只在内置 CSS 提供器覆盖的三种语言里做一次探测,
 * 按 range 补空缺; 其他语言直接全量上报 (那里唯一可能重叠的是内置默认提供器,
 * 而它会因为我们返回了数组而自动让位)。本扩展同时把 `editor.defaultColorDecorators`
 * 的默认值改为 `never` (`contributes.configurationDefaults`), 让探测结果只可能来自
 * 真正的扩展提供器 —— 此时 `dedupe` 是精确的。
 *
 * 其他约束:
 * - 任何"没有可上报颜色"的分支必须返回 `undefined` 而不是 `[]`,
 *   否则空数组会让内置默认提供器整体让位, 反而把别人的色块也弄没;
 * - contextual 与只读语法不提供候选写法, 取色器因此不会把 `light-dark()`、
 *   `color-mix()` 这类表达式压成字面值。
 */
import * as vscode from 'vscode';

import { isLanguageEnabled } from '../../configuration/language-filter.js';
import type { RuntimeConfiguration } from '../../configuration/load.js';
import { buildResolved } from '../../core/colorjs-bridge.js';
import type { SerializerOptions } from '../../core/types.js';
import type { DocumentIndexManager } from '../../index/document-index-manager.js';
import type { Logger } from '../../logging/output-channel.js';
import { colorPresentationTexts } from '../convert/presentations.js';
import { resolveHighlightSyntaxes, targetForSyntax } from '../fields/registry.js';
import { previewSrgb, previewSource } from '../highlight/preview-color.js';

import { planSwatches, rangeKey } from './swatch-plan.js';

/**
 * 内置 CSS 扩展 (`vscode.css-language-features`) 提供颜色的语言。
 * 取自它的 `activationEvents`: `onLanguage:css` / `less` / `scss`。
 * `sass`、`stylus`、`postcss` 不在其中, 因此那里不需要探测。
 */
const BUILT_IN_COLOR_LANGUAGES: ReadonlySet<string> = new Set(['css', 'less', 'scss']);

/** VS Code 渲染色块的上限设置; 与 `editor.colorDecoratorsLimit` 的默认值一致。 */
const DEFAULT_DECORATOR_LIMIT = 500;

function serializerOptionsOf(config: RuntimeConfiguration): SerializerOptions {
  return {
    precision: config.precision,
    hexCase: config.hexCase,
    syntax: config.convertSyntax,
    gamutMapping: config.gamutMapping,
    computeMissingComponents: false,
  };
}

export class ColorSwatchProvider implements vscode.DocumentColorProvider {
  /** 探测期间置位: 嵌套回到本提供器时返回 undefined, 只让其他提供器应答。 */
  private probing = false;
  /** 探测结果按 (uri, version) 缓存, 避免每次按键都多一次跨进程往返。 */
  private probeCache: { readonly key: string; readonly covered: ReadonlySet<string> } | undefined;

  constructor(
    private readonly manager: DocumentIndexManager,
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
    private readonly logger: Logger,
  ) {}

  async provideDocumentColors(
    document: vscode.TextDocument,
  ): Promise<vscode.ColorInformation[] | undefined> {
    // 探测触发的嵌套调用: 让位, 且必须返回 undefined (空数组会顶掉默认提供器)。
    if (this.probing) return undefined;

    const config = this.getConfig(document);
    if (!config.enabled || config.colorPickerMode === 'off') return undefined;
    if (!isLanguageEnabled(config.languages, document.languageId)) return undefined;

    const snapshot = this.manager.ensure(document);
    if (!snapshot) return undefined;

    const covered =
      config.colorPickerMode === 'dedupe' && BUILT_IN_COLOR_LANGUAGES.has(document.languageId)
        ? await this.probeOtherProviders(document)
        : undefined;

    const syntaxes = resolveHighlightSyntaxes(
      config.fields,
      config.excludedFields,
      config.cssColorHdr,
    );

    const plan = planSwatches(snapshot.matches, {
      allows: (syntax) => syntaxes.allows(syntax),
      hasPreview: (match) => previewSource(match) !== undefined,
      covered,
      limit: decoratorLimit(document),
    });

    if (plan.dropped > 0) {
      this.logger.warnOnce(
        `swatch-limit:${document.uri.toString()}`,
        `document has more than editor.colorDecoratorsLimit colors; ` +
          `${plan.dropped} swatches were not reported for ${document.uri.toString()}`,
      );
    }

    // 没有可上报的颜色时返回 undefined, 把机会留给其他提供器。
    if (plan.matches.length === 0) return undefined;

    return plan.matches.map((match) => {
      // planSwatches 已保证 previewSource 有值。
      const resolved = previewSource(match) as NonNullable<ReturnType<typeof previewSource>>;
      const preview = previewSrgb(resolved, config.gamutMapping, config.hdrToneMapping);
      return new vscode.ColorInformation(
        new vscode.Range(
          document.positionAt(match.range.start),
          document.positionAt(match.range.end),
        ),
        new vscode.Color(preview.coords[0], preview.coords[1], preview.coords[2], preview.alpha),
      );
    });
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { readonly document: vscode.TextDocument; readonly range: vscode.Range },
  ): vscode.ColorPresentation[] | undefined {
    const config = this.getConfig(context.document);
    if (!config.enabled || config.colorPickerMode === 'off') return undefined;

    const original = this.matchAt(context.document, context.range);
    if (!original) return undefined;

    // contextual 与只读语法只看不改: 取色器一旦写回就会把整个表达式压成字面值,
    // 与"contextual 不允许转换"的既有策略一致。需要改色请用"转换颜色"命令。
    const target = targetForSyntax(original.syntax);
    if (original.resolution === 'contextual' || !target) return [];

    // 取色器给出的是新的 sRGB 值, 与原 match 的色彩空间无关。
    const picked = buildResolved({
      cssSpace: 'srgb',
      channels: [color.red, color.green, color.blue],
      alpha: color.alpha,
    });
    const texts = colorPresentationTexts(picked, target, serializerOptionsOf(config));
    return texts.map((text) => new vscode.ColorPresentation(text));
  }

  /**
   * 问一次"其他提供器覆盖了哪些 range"。
   *
   * 命令会走完整的提供器链, 因此必须用 `probing` 屏蔽自己;
   * 结果按文档版本缓存, 同一版本内的重复调用零成本。
   */
  private async probeOtherProviders(
    document: vscode.TextDocument,
  ): Promise<ReadonlySet<string> | undefined> {
    const key = `${document.uri.toString()}@${document.version}`;
    if (this.probeCache?.key === key) return this.probeCache.covered;

    this.probing = true;
    let colors: vscode.ColorInformation[] | undefined;
    try {
      colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
        'vscode.executeDocumentColorProvider',
        document.uri,
      );
    } catch (error) {
      // 探测失败不能让色块整体消失: 退化为"没人覆盖", 全量上报。
      this.logger.warnOnce(
        'swatch-probe-failed',
        `vscode.executeDocumentColorProvider failed: ${String(error)}`,
      );
      colors = undefined;
    } finally {
      this.probing = false;
    }
    if (!colors) return undefined;

    const covered = new Set<string>();
    for (const color of colors) {
      covered.add(
        rangeKey({
          start: document.offsetAt(color.range.start),
          end: document.offsetAt(color.range.end),
        }),
      );
    }
    this.probeCache = { key, covered };
    return covered;
  }

  /** 取回该 range 对应的 match, 用于判断原格式与解析状态。 */
  private matchAt(document: vscode.TextDocument, range: vscode.Range) {
    const index = this.manager.indexOf(document);
    if (!index?.current) return undefined;
    return index.findAtOffset(document.offsetAt(range.start));
  }
}

function decoratorLimit(document: vscode.TextDocument): number {
  const limit = vscode.workspace
    .getConfiguration('editor', document)
    .get<number>('colorDecoratorsLimit', DEFAULT_DECORATOR_LIMIT);
  return typeof limit === 'number' && limit > 0 ? limit : DEFAULT_DECORATOR_LIMIT;
}
