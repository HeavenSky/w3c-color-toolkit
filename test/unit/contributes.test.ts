/**
 * `package.json` 与 TypeScript 单一来源的一致性断言。
 *
 * 这些测试是方案第 10.3 节"命令与配置一致性"的落地:
 * 一旦有人手改 package.json 或忘记跑 `npm run gen:contributes`, 这里会失败。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALL_COMMANDS, HIDDEN_COMMANDS, VISIBLE_COMMANDS } from '../../src/commands/ids.js';
import { ADVANCED_SETTINGS, EXPOSED_SETTINGS } from '../../src/configuration/schema.js';
import { FORMAT_CATALOG, FORMAT_CATEGORIES, formatsInCategory } from '../../src/features/convert/format-catalog.js';
import { RUNTIME_STRINGS } from '../../src/l10n/runtime-strings.js';

const ROOT = join(import.meta.dirname, '..', '..');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8')) as Record<string, unknown>;
}

const pkg = readJson('package.json');
const nlsEn = readJson('package.nls.json');
const nlsZh = readJson('package.nls.zh-cn.json');
const bundleZh = readJson('l10n/bundle.l10n.zh-cn.json');

const contributes = pkg.contributes as {
  configuration: { properties: Record<string, Record<string, unknown>> };
  configurationDefaults: Record<string, unknown>;
  commands: { command: string; title: string; category: string }[];
  submenus: { id: string; label: string }[];
  menus: {
    commandPalette: { command: string; when?: string }[];
    'editor/context': { submenu?: string; group?: string; when?: string }[];
    'w3cColorToolkit.editorContext': { command: string; group?: string; when?: string }[];
  };
};

describe('package.json 基本声明', () => {
  it('main 与 browser 指向同一个 bundle (三种宿主共用一份产物)', () => {
    // 全部文件读取都走 workspace.fs, 不使用 node 内置模块, 因此不需要为 Web 单独出一份。
    expect(pkg.main).toBe('./out/extension.js');
    expect(pkg.browser).toBe(pkg.main);
  });

  it('engines.vscode 固定为 ^1.101.0', () => {
    expect((pkg.engines as Record<string, string>).vscode).toBe('^1.101.0');
  });

  it('extensionKind 让 Remote 优先在工作区 host 运行', () => {
    expect(pkg.extensionKind).toEqual(['workspace', 'ui']);
  });

  it('未受信任工作区声明为 limited', () => {
    const capabilities = pkg.capabilities as { untrustedWorkspaces: { supported: string } };
    expect(capabilities.untrustedWorkspaces.supported).toBe('limited');
  });

  it('声明 l10n 目录', () => {
    expect(pkg.l10n).toBe('./l10n');
  });

  it('把内置默认颜色提供器关掉, 避免与本扩展的色块叠加', () => {
    // VS Code 会把多个 DocumentColorProvider 的色块叠加渲染 (不按 range 去重),
    // 而内置默认提供器认的写法是本扩展的真子集, 因此默认关掉它。
    expect(contributes.configurationDefaults['editor.defaultColorDecorators']).toBe('never');
  });

  it('不内置任何默认快捷键', () => {
    expect('keybindings' in contributes).toBe(false);
  });

  it('激活事件为 onStartupFinished', () => {
    expect(pkg.activationEvents).toEqual(['onStartupFinished']);
  });

  it('运行时依赖只有 CSSTools 三个包与 colorjs.io', () => {
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual([
      '@csstools/css-color-parser',
      '@csstools/css-parser-algorithms',
      '@csstools/css-tokenizer',
      'colorjs.io',
    ]);
  });
});

describe('配置贡献点一致性', () => {
  const properties = contributes.configuration.properties;

  it('设置界面只出现 8 个键', () => {
    expect(Object.keys(properties)).toHaveLength(8);
  });

  it('每个暴露层键都已声明, 且默认值一致', () => {
    for (const setting of EXPOSED_SETTINGS) {
      const key = `w3cColorToolkit.${setting.key}`;
      expect(properties[key], `${key} 未声明`).toBeDefined();
      expect(properties[key].default, `${key} 默认值不一致`).toEqual(setting.default);
      // advanced 用 markdownDescription 承载参考表格, 其余键用 description。
      const description = properties[key].description ?? properties[key].markdownDescription;
      expect(description, `${key} 缺少说明`).toBe(`%${setting.nlsKey}%`);
    }
  });

  it('advanced 提供完整的可用项参考: 表格 + 可插入模板 + 逐键说明', () => {
    const advanced = properties['w3cColorToolkit.advanced'];

    // 1. 参考表格: 每个内置键都在表格里出现, 且带默认值。
    for (const locale of [nlsEn, nlsZh]) {
      const table = locale['config.advanced'] as string;
      expect(typeof table).toBe('string');
      for (const setting of ADVANCED_SETTINGS) {
        expect(table, `参考表格缺少 ${setting.key}`).toContain(`\`${setting.key}\``);
        expect(table, `参考表格缺少 ${setting.key} 的默认值`).toContain(
          `\`${JSON.stringify(setting.default)}\``,
        );
      }
    }

    // 2. 可插入模板: 全量模板含全部 35 个键及默认值。
    const snippets = advanced.defaultSnippets as { label: string; body: Record<string, unknown> }[];
    expect(snippets.length).toBeGreaterThanOrEqual(2);
    const full = snippets[0].body;
    expect(Object.keys(full)).toHaveLength(ADVANCED_SETTINGS.length);
    for (const setting of ADVANCED_SETTINGS) {
      expect(full[setting.key], `模板中 ${setting.key} 默认值不一致`).toEqual(setting.default);
    }

    // 3. 逐键说明: 每个键都有 description 与 default, 供 settings.json 补全与悬停使用。
    const advancedProperties = advanced.properties as Record<
      string,
      { default: unknown; description: string }
    >;
    for (const setting of ADVANCED_SETTINGS) {
      expect(advancedProperties[setting.key].description).toBe(`%${setting.nlsKey}%`);
    }
  });

  it('枚举值与 schema 一致', () => {
    for (const setting of EXPOSED_SETTINGS) {
      if (!setting.enum) continue;
      const declared = properties[`w3cColorToolkit.${setting.key}`];
      const enumValues = (declared.enum ?? (declared.items as { enum?: string[] })?.enum) as string[];
      expect(enumValues, `${setting.key} 枚举缺失`).toEqual([...setting.enum]);
    }
  });

  it('advanced 列出全部 35 个内置键并拒绝未知键', () => {
    const advanced = properties['w3cColorToolkit.advanced'];
    expect(advanced.additionalProperties).toBe(false);
    const advancedProperties = advanced.properties as Record<string, { default: unknown }>;
    expect(Object.keys(advancedProperties)).toHaveLength(35);
    for (const setting of ADVANCED_SETTINGS) {
      expect(advancedProperties[setting.key], `${setting.key} 未声明`).toBeDefined();
      expect(advancedProperties[setting.key].default).toEqual(setting.default);
    }
  });
});

describe('命令贡献点一致性', () => {
  it('声明的命令集合与 ids.ts 完全一致', () => {
    expect(contributes.commands.map((command) => command.command).sort()).toEqual(
      ALL_COMMANDS.map((command) => command.id).sort(),
    );
  });

  it('可见命令 5 个, 隐藏命令 31 个', () => {
    expect(VISIBLE_COMMANDS).toHaveLength(5);
    expect(HIDDEN_COMMANDS).toHaveLength(31);
    expect(ALL_COMMANDS).toHaveLength(36);
  });

  it('命令面板中只有 5 个命令可见', () => {
    // VS Code 语义: 没有 commandPalette 条目 = 可见; `when: false` = 隐藏。
    const hidden = new Set(
      contributes.menus.commandPalette
        .filter((entry) => entry.when === 'false')
        .map((entry) => entry.command),
    );
    const visible = contributes.commands
      .map((command) => command.command)
      .filter((id) => !hidden.has(id));
    expect(visible).toHaveLength(5);
    expect(visible.sort()).toEqual(VISIBLE_COMMANDS.map((command) => command.id).sort());
  });

  it('命令面板的 when 不依赖编辑器焦点', () => {
    // 真实缺陷回归: 命令面板一打开焦点就离开编辑器, `editorTextFocus` 立即变 false,
    // 带这个 when 的命令会永远不出现在面板里 (2026-08-04 实测)。
    for (const entry of contributes.menus.commandPalette) {
      if (entry.when === 'false') continue;
      expect(entry.when ?? '', `${entry.command} 的面板 when 不能依赖焦点`).not.toMatch(
        /editor(Text)?Focus/,
      );
    }
  });

  it('需要编辑器的面板命令使用 editorIsOpen', () => {
    const palette = new Map(
      contributes.menus.commandPalette.map((entry) => [entry.command, entry.when]),
    );
    expect(palette.get('w3cColorToolkit.convert')).toBe('editorIsOpen');
    expect(palette.get('w3cColorToolkit.copyColorAs')).toBe('editorIsOpen');
  });

  it('右键子菜单仍使用 editorTextFocus (该处正确)', () => {
    for (const entry of contributes.menus['w3cColorToolkit.editorContext']) {
      expect(entry.when).toBe('editorTextFocus');
    }
  });

  it('全部隐藏命令都带 when: false', () => {
    for (const command of HIDDEN_COMMANDS) {
      const entry = contributes.menus.commandPalette.find((item) => item.command === command.id);
      expect(entry, `${command.id} 缺少 commandPalette 条目`).toBeDefined();
      expect(entry?.when).toBe('false');
    }
  });

  it('每个命令都有 title 与统一 category, 以保证可在快捷键界面搜索', () => {
    for (const command of contributes.commands) {
      expect(command.title).toMatch(/^%.+%$/);
      expect(command.category).toBe('%command.category%');
    }
  });

  it('编辑器右键子菜单提供转换与复制入口', () => {
    // 命令面板不是唯一入口: 右键子菜单是更容易被发现的入口。
    expect(contributes.submenus.map((submenu) => submenu.id)).toEqual([
      'w3cColorToolkit.editorContext',
    ]);
    expect(contributes.menus['editor/context']).toEqual([
      {
        submenu: 'w3cColorToolkit.editorContext',
        group: '1_modification',
        when: 'editorTextFocus',
      },
    ]);
    const contextCommands = contributes.menus['w3cColorToolkit.editorContext'].map(
      (entry) => entry.command,
    );
    expect(contextCommands).toEqual(['w3cColorToolkit.convert', 'w3cColorToolkit.copyColorAs']);
  });

  it('右键子菜单里的命令都是已声明的可见命令', () => {
    const visible = new Set(VISIBLE_COMMANDS.map((command) => command.id));
    for (const entry of contributes.menus['w3cColorToolkit.editorContext']) {
      expect(visible.has(entry.command), `${entry.command} 不是可见命令`).toBe(true);
    }
  });

  it('没有多余的无实现命令, 也没有未声明的已注册命令', () => {
    const declared = new Set(contributes.commands.map((command) => command.command));
    for (const command of ALL_COMMANDS) expect(declared.has(command.id)).toBe(true);
    expect(declared.size).toBe(ALL_COMMANDS.length);
  });
});

describe('转换目标与命令数量一致', () => {
  it('目标格式 24 个', () => {
    expect(FORMAT_CATALOG).toHaveLength(24);
  });

  it('convertTo.* 命令数量与目标格式一致', () => {
    const convertCommands = HIDDEN_COMMANDS.filter((command) =>
      command.id.startsWith('w3cColorToolkit.convertTo.'),
    );
    expect(convertCommands).toHaveLength(FORMAT_CATALOG.length);
  });

  it('分类条目总数等于目标格式总数', () => {
    const total = FORMAT_CATEGORIES.reduce(
      (sum, category) => sum + formatsInCategory(category.id).length,
      0,
    );
    expect(total).toBe(FORMAT_CATALOG.length);
  });

  it('分类分布为 4 + 4 + 9 + 1 + 6', () => {
    expect(formatsInCategory('common')).toHaveLength(4);
    expect(formatsInCategory('perceptual')).toHaveLength(4);
    expect(formatsInCategory('color-function')).toHaveLength(9);
    expect(formatsInCategory('named')).toHaveLength(1);
    expect(formatsInCategory('hdr')).toHaveLength(6);
  });

  it('目标格式与命令后缀都不重复', () => {
    expect(new Set(FORMAT_CATALOG.map((entry) => entry.target)).size).toBe(FORMAT_CATALOG.length);
    expect(new Set(FORMAT_CATALOG.map((entry) => entry.commandSuffix)).size).toBe(FORMAT_CATALOG.length);
  });

  it('只有 HDR 分类是实验性的', () => {
    for (const entry of FORMAT_CATALOG) {
      expect(entry.experimental).toBe(entry.category === 'hdr');
    }
  });
});

describe('本地化一致性', () => {
  it('两份 package.nls 的 key 集合完全一致', () => {
    expect(Object.keys(nlsEn).sort()).toEqual(Object.keys(nlsZh).sort());
  });

  it('package.json 中的每个 %key% 都有中英文条目', () => {
    const used = new Set<string>();
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        const match = /^%(.+)%$/.exec(value);
        if (match) used.add(match[1]);
        return;
      }
      if (Array.isArray(value)) return value.forEach(visit);
      if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(pkg);

    for (const key of used) {
      expect(nlsEn[key], `英语缺少 ${key}`).toBeDefined();
      expect(nlsZh[key], `中文缺少 ${key}`).toBeDefined();
    }
  });

  it('没有多余的 nls 条目', () => {
    const used = new Set<string>();
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        const match = /^%(.+)%$/.exec(value);
        if (match) used.add(match[1]);
        return;
      }
      if (Array.isArray(value)) return value.forEach(visit);
      if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(pkg);
    for (const key of Object.keys(nlsEn)) {
      expect(used.has(key), `${key} 未被使用`).toBe(true);
    }
  });

  it('只有中文 bundle: 英语 key 就是默认文案本身, 恒等映射没有意义', () => {
    // vscode.l10n.t 用默认文案作为 key, 缺 bundle 时直接回退到源码字面量。
    expect(existsSync(join(ROOT, 'l10n/bundle.l10n.json'))).toBe(false);
  });

  it('中文 bundle 覆盖 RUNTIME_STRINGS 的全部文案', () => {
    for (const text of Object.values(RUNTIME_STRINGS)) {
      expect(bundleZh[text], `中文 bundle 缺少: ${text}`).toBeDefined();
    }
  });

  it('中文条目非空, 不出现回退为 key 原文的空串', () => {
    for (const [key, value] of Object.entries(bundleZh)) {
      expect(typeof value === 'string' && value.length > 0, `${key} 中文为空`).toBe(true);
    }
  });

  it('每个 DiagnosticCode 对应的文案 key 都存在', () => {
    const diagnosticKeys = Object.keys(RUNTIME_STRINGS).filter((key) => key.startsWith('diagnostic.'));
    expect(diagnosticKeys.length).toBeGreaterThanOrEqual(15);
    for (const key of diagnosticKeys) {
      expect(RUNTIME_STRINGS[key as keyof typeof RUNTIME_STRINGS]).toBeTruthy();
    }
  });

  it('中文文案保留占位符', () => {
    for (const [text, translated] of Object.entries(bundleZh)) {
      const placeholders = text.match(/\{\d\}/g) ?? [];
      for (const placeholder of placeholders) {
        expect(String(translated).includes(placeholder), `${text} 缺少 ${placeholder}`).toBe(true);
      }
    }
  });

  it('中文文案不本地化色彩空间名与配置键', () => {
    expect(bundleZh['display-p3']).toBe('display-p3');
    expect(bundleZh['rec2100-pq']).toBe('rec2100-pq');
  });
});
