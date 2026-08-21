/**
 * DocumentColorProvider: VS Code 原生的行内色块与 Hover 取色器。
 *
 * 为什么必须自己提供:
 * - 原生取色器挂在"颜色装饰"上 (`ColorHoverParticipant` 只对 `isColorDecoration`
 *   的装饰产出取色器), 因此"要调节器就必须有色块", 二者不能拆开;
 * - VS Code 内置的默认提供器只认 hex 与 rgb/hsl 系写法, 内置语言服务只在自己的语言里,
 *   且颜色落在 AST 认得的位置时给颜色。`oklch()`、`lab()`、`color()`、`color-mix()`、
 *   相对颜色、HDR 空间, 以及注释与字符串里的颜色, 两者都不给。
 *
 * 去重的难点 (2026-08-05 实测 VS Code 1.130.0 打包源码):
 * - 渲染端 `getColors` 只要有**任意**扩展提供器返回了数组 (哪怕是空数组) 就不再使用
 *   内置默认提供器, 且多个提供器的结果直接叠加, 不按 range 去重;
 * - 探测命令 `vscode.executeDocumentColorProvider` 调用的是同一个函数, 但只回传
 *   `{range, color}`, **丢掉了提供器身份**, 所以无法区分"这一格是内置语言服务给的还是
 *   默认提供器给的"。
 *
 * 由此得到 `dedupe` 模式 (默认): 只在内置提供器也会给颜色的语言里做一次探测, 按 range
 * 补空缺; 其他语言直接全量上报 (那里唯一可能重叠的是内置默认提供器, 而它会因为我们
 * 返回了数组而自动让位)。本扩展同时把 `editor.defaultColorDecorators` 的默认值改为
 * `never` (`contributes.configurationDefaults`), 让探测结果只可能来自真正的扩展提供器
 * —— 此时 `dedupe` 是精确的。
 *
 * 哪些语言要探测由 `builtInColorLanguages` 在运行时算出, 不是一份常量: HTML 与 JSON
 * 两个语言服务都会把其他扩展通过参与者贡献点挂进来的语言一并接管 (见 swatch-plan.ts)。
 * 第三方颜色扩展在哪些语言里注册提供器无法从清单静态判定, 因此不自动探测; 需要时用
 * `advanced.colorPicker.dedupeLanguages` 手动把语言加进来。
 *
 * 其他约束:
 * - 任何"没有可上报颜色"的分支必须返回 `undefined` 而不是 `[]`,
 *   否则空数组会让内置默认提供器整体让位, 反而把别人的色块也弄没;
 * - contextual 与只读语法不提供候选写法, 取色器因此不会把 `light-dark()`、
 *   `color-mix()` 这类表达式压成字面值。
 */
import * as vscode from 'vscode';

import { isDocumentHidden } from '../../configuration/disable-gate.js';
import type { RuntimeConfiguration } from '../../configuration/load.js';
import { buildResolved } from '../../core/colorjs-bridge.js';
import type { SerializerOptions } from '../../core/types.js';
import type { DocumentIndexManager } from '../../index/document-index-manager.js';
import type { Logger } from '../../logging/output-channel.js';
import { colorPresentationTexts } from '../convert/presentations.js';
import { resolveHighlightSyntaxes, targetForSyntax } from '../fields/registry.js';
import { previewSrgb, previewSource } from '../highlight/preview-color.js';

import {
  builtInColorLanguages,
  coverageKeys,
  planSwatches,
  readProbeCache,
  resolveProbeTarget,
  shouldCacheProbe,
  writeProbeCache,
  type ProbeEntry,
  type ProbeTarget,
} from './swatch-plan.js';

/**
 * 某个内置提供器是否已经就绪。
 *
 * 本扩展在 `onStartupFinished` 激活, 内置语言服务在 `onLanguage:*` 激活, 因此工作区启动时
 * 就打开的文件很可能在它激活之前被探测一次。扩展缺失时返回 false, 此时空结果同样不缓存
 * —— 那种情况下本来也没有别人可去重, 代价只是多一次命令调用。
 */
function builtInColorProviderReady(extensionId: string): boolean {
  return vscode.extensions.getExtension(extensionId)?.isActive === true;
}

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

export class ColorSwatchProvider implements vscode.DocumentColorProvider, vscode.Disposable {
  /**
   * 正在探测的文档 uri; 嵌套回到本提供器时返回 undefined, 只让其他提供器应答。
   *
   * 按文档隔离而不是用一个实例级布尔: `provideDocumentColors` 是异步的, 多个可见编辑器
   * 会并发进来。用单个布尔时, 文档 A 的探测在 `finally` 里把标志置回 false, 而文档 B 的
   * 探测可能仍在 await 中 —— 此时本提供器不再被屏蔽, 会把自己的 range 也算进 B 的
   * `covered`, 于是 B 的色块被自己顶掉。
   */
  private readonly probing = new Set<string>();
  /** 探测结果按 uri 缓存, 每个 uri 一条并携带文档版本; 避免每次按键都多一次跨进程往返。 */
  private readonly probeCache = new Map<string, ProbeEntry>();
  /** 语言 id → 内置提供器扩展 id; 装扩展会改变它, 因此按 `extensions.onDidChange` 失效。 */
  private builtInLanguageCache: ReadonlyMap<string, string> | undefined;
  private readonly extensionsChanged = vscode.extensions.onDidChange(() => {
    this.builtInLanguageCache = undefined;
  });

  constructor(
    private readonly manager: DocumentIndexManager,
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
    private readonly logger: Logger,
  ) {}

  dispose(): void {
    this.extensionsChanged.dispose();
  }

  async provideDocumentColors(
    document: vscode.TextDocument,
  ): Promise<vscode.ColorInformation[] | undefined> {
    // 探测触发的嵌套调用: 让位, 且必须返回 undefined (空数组会顶掉默认提供器)。
    if (this.probing.has(document.uri.toString())) return undefined;

    const config = this.getConfig(document);
    if (isDocumentHidden(document, config) || config.colorPickerMode === 'off') return undefined;

    const snapshot = this.manager.ensure(document);
    if (!snapshot) return undefined;

    const target =
      config.colorPickerMode === 'dedupe'
        ? resolveProbeTarget(
            document.languageId,
            this.builtInLanguages(),
            config.colorPickerDedupeLanguages,
          )
        : undefined;
    // 已被内置提供器覆盖的语言又被写进 dedupeLanguages: 结果不变 (内置优先), 但用户多半是
    // 误以为不写就不探测, 提示一次省得他们继续往里加。
    if (
      target?.kind === 'built-in' &&
      config.colorPickerDedupeLanguages.includes(document.languageId)
    ) {
      this.logger.warnOnce(
        `redundant-dedupe-language:${document.languageId}`,
        `advanced.colorPicker.dedupeLanguages lists "${document.languageId}", which a built-in ` +
          `language service already covers; the entry has no effect and can be removed`,
      );
    }

    const covered = target ? await this.probeOtherProviders(document, target) : undefined;

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

    // contextual, 变量引用与只读语法只看不改: 取色器一旦写回就会把整个表达式压成字面值,
    // 与"contextual 不允许转换"的既有策略一致。需要改色请用"转换颜色"命令。
    const target = targetForSyntax(original.syntax);
    if (original.resolution === 'contextual' || original.resolvedVia || !target) return [];

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
   * 结果按 uri 缓存并携带文档版本, 同一版本内的重复调用零成本。
   *
   * 缓存写入发生在清除 `probing` 标记**之前**: 反过来会留下一个"标记已清除但缓存还没落"
   * 的窗口, 期间进来的调用会重新触发一次跨进程探测。
   */
  private async probeOtherProviders(
    document: vscode.TextDocument,
    target: ProbeTarget,
  ): Promise<ReadonlySet<string> | undefined> {
    const uri = document.uri.toString();
    const cached = readProbeCache(this.probeCache, uri, document.version);
    if (cached) return cached;

    this.probing.add(uri);
    try {
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
      }
      if (!colors) return undefined;

      const text = document.getText();
      const covered = new Set<string>();
      for (const color of colors) {
        const range = {
          start: document.offsetAt(color.range.start),
          end: document.offsetAt(color.range.end),
        };
        for (const key of coverageKeys(text, range)) covered.add(key);
      }
      // 其他提供器尚未激活时的空结果是暂态, 不能缓存 —— 否则"没人覆盖"会被钉死到文档
      // 下一次改动为止, 表现为色块重复且没有任何错误日志。用户手动列出的语言背后是哪个
      // 扩展无从得知, 因此那里的空结果一律当作暂态, 代价是每个文档版本多一次探测。
      const ready = target.kind === 'built-in' && builtInColorProviderReady(target.extensionId);
      if (shouldCacheProbe(covered.size, ready)) {
        writeProbeCache(this.probeCache, uri, { version: document.version, covered });
      }
      return covered;
    } finally {
      this.probing.delete(uri);
    }
  }

  /**
   * 「语言 id → 内置提供器扩展 id」。
   *
   * 结果缓存在实例上: 参与者贡献点要遍历全部已安装扩展的清单, 而语言集合只在装卸或
   * 启停扩展时才变, 那时 `extensions.onDidChange` 会把缓存清掉。
   */
  private builtInLanguages(): ReadonlyMap<string, string> {
    this.builtInLanguageCache ??= builtInColorLanguages(
      vscode.extensions.all.map((extension) => extension.packageJSON),
    );
    return this.builtInLanguageCache;
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
