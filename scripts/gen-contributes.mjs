/**
 * 从 TypeScript 单一来源生成 `package.json` 的 contributes 与两份 `package.nls` 文件。
 *
 * 来源:
 * - `src/configuration/schema.ts`: 8 个暴露层键 + 35 项内置层默认值;
 * - `src/commands/ids.ts` 与 `src/features/convert/format-catalog.ts`: 5 个可见命令 + 31 个隐藏命令;
 * - `configurationDefaults`: 把 `editor.defaultColorDecorators` 默认值改为 `never` (见 buildContributes)。
 *
 * 用法:
 *   node scripts/gen-contributes.mjs          写入
 *   node scripts/gen-contributes.mjs --check  只校验, 不写入 (供 CI 与测试使用)
 */
import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CONVERT_TITLE_TEMPLATE, EN, ZH_CN } from './nls-source.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const CHECK_ONLY = process.argv.includes('--check');

/** 把 TS 单一来源打包成一个临时 ESM 文件后动态导入。 */
async function loadSources() {
  const dir = await mkdtemp(join(tmpdir(), 'w3c-color-toolkit-gen-'));
  const outfile = join(dir, 'sources.mjs');
  await build({
    entryPoints: [join(ROOT, 'scripts/sources-entry.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['vscode'],
    logLevel: 'silent',
  });
  try {
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function jsonSchemaFor(setting) {
  const schema = {};
  switch (setting.type) {
    case 'boolean':
      schema.type = 'boolean';
      break;
    case 'string':
      schema.type = 'string';
      if (setting.enum) schema.enum = [...setting.enum];
      break;
    case 'number':
      schema.type = 'number';
      break;
    case 'integer':
      schema.type = 'integer';
      break;
    case 'string[]':
      schema.type = 'array';
      schema.items = setting.enum ? { type: 'string', enum: [...setting.enum] } : { type: 'string' };
      break;
    case 'string[]|null':
      schema.type = ['array', 'null'];
      schema.items = { type: 'string' };
      break;
    default:
      throw new Error(`unknown setting type: ${setting.type}`);
  }
  if (setting.minimum !== undefined) schema.minimum = setting.minimum;
  if (setting.maximum !== undefined) schema.maximum = setting.maximum;
  schema.default = setting.default;
  schema.description = `%${setting.nlsKey}%`;
  return schema;
}

/** 内置层键的分组顺序, 只影响参考文档的排版。 */
const ADVANCED_GROUPS = [
  ['highlight.', 'Highlight'],
  ['colorPicker.', 'Color picker'],
  ['fields.', 'Fields (hover + highlight)'],
  ['info.', 'Hover'],
  ['convert.', 'Convert'],
  ['output.', 'Output'],
  ['scan.', 'Scan'],
  ['variables.', 'Variables'],
  ['experimental.', 'Experimental'],
  ['coexistence.', 'Coexistence'],
];

function groupOf(key) {
  for (const [prefix, label] of ADVANCED_GROUPS) {
    if (key.startsWith(prefix)) return label;
  }
  return 'Other';
}

function typeLabel(setting) {
  if (setting.enum && setting.type === 'string') return setting.enum.map((v) => `\`${v}\``).join(' \\| ');
  if (setting.type === 'string[]|null') return '`string[]` \\| `null`';
  const range =
    setting.minimum !== undefined || setting.maximum !== undefined
      ? ` (${setting.minimum ?? ''}–${setting.maximum ?? ''})`
      : '';
  return `\`${setting.type}\`${range}`;
}

/** 参考表的表头与前言, 按语言给出。 */
const ADVANCED_INTRO = {
  en: [
    'Incremental overrides for the built-in options. Keys are **flat dotted paths**; ' +
      'omitted keys keep their default. The 8 top-level settings must not appear here.',
    '',
    'Tip: type `"` inside the object for completion, or pick the ' +
      '"All advanced options" snippet to insert every key with its default.',
    '',
    '| Key | Type / values | Default | Description |',
    '| --- | --- | --- | --- |',
  ],
  'zh-cn': [
    '内置选项的增量覆盖。键为**扁平点分路径**; 未出现的键保持默认值。' +
      '8 个顶层设置不允许出现在这里。',
    '',
    '提示: 在对象内输入 `"` 可获得补全, 或选择"All advanced options"模板' +
      '一次插入全部键及其默认值。',
    '',
    '| 键 | 类型 / 取值 | 默认值 | 说明 |',
    '| --- | --- | --- | --- |',
  ],
};

/**
 * 生成 `advanced` 的参考表格。
 *
 * 键名、类型/取值、默认值与说明四列全部写入, 使用户在设置界面和 settings.json
 * 悬停时都能直接看到全部可用项。中英文各生成一份, 通过 nls 覆盖整段,
 * 因此中文界面看到的是中文表格。
 */
function advancedReferenceMarkdown(advancedSettings, locale, descriptions) {
  const lines = [...ADVANCED_INTRO[locale]];
  let currentGroup = '';
  for (const setting of advancedSettings) {
    const group = groupOf(setting.key);
    if (group !== currentGroup) {
      currentGroup = group;
      lines.push(`| **${group}** | | | |`);
    }
    const description = (descriptions[setting.nlsKey] ?? '').replace(/\|/g, '\\|');
    lines.push(
      `| \`${setting.key}\` | ${typeLabel(setting)} | \`${JSON.stringify(setting.default)}\` | ${description} |`,
    );
  }
  return lines.join('\n');
}

/** settings.json 内可插入的模板。 */
function advancedSnippets(advancedSettings) {
  const full = {};
  for (const setting of advancedSettings) full[setting.key] = setting.default;
  return [
    {
      label: 'All advanced options (with defaults)',
      description: `Insert all ${advancedSettings.length} built-in options with their default values`,
      body: full,
    },
    {
      label: 'Minimal example',
      description: 'A few commonly changed options',
      body: {
        'output.hexCase': 'upper',
        'highlight.matchWords': 'all',
        'scan.comments': false,
      },
    },
  ];
}

function buildContributes(sources) {
  const { EXPOSED_SETTINGS, ADVANCED_SETTINGS, ADVANCED_KEY } = sources;
  const properties = {};

  for (const setting of EXPOSED_SETTINGS) {
    const key = `w3cColorToolkit.${setting.key}`;
    if (setting.key === ADVANCED_KEY) {
      // advanced 声明为 object, 并列出全部内置键以提供 settings.json 内的补全与说明。
      const advancedProperties = {};
      for (const advanced of ADVANCED_SETTINGS) {
        advancedProperties[advanced.key] = jsonSchemaFor(advanced);
      }
      properties[key] = {
        type: 'object',
        scope: 'resource',
        default: {},
        additionalProperties: false,
        properties: advancedProperties,
        // markdownDescription 走 nls: 两种语言各有一份完整参考表格
        // (见 buildNls 对 config.advanced 的覆盖), 中文界面看到的是中文表格。
        markdownDescription: `%${setting.nlsKey}%`,
        // defaultSnippets 提供两个可插入模板: 全量 (含全部默认值) 与最小示例。
        defaultSnippets: advancedSnippets(ADVANCED_SETTINGS),
      };
      continue;
    }
    properties[key] = { ...jsonSchemaFor(setting), scope: 'resource' };
  }

  const commands = [];
  const paletteMenu = [];
  // 编辑器右键子菜单: 命令面板不是唯一入口, 右键更容易被发现。
  const contextMenu = [];

  for (const command of sources.VISIBLE_COMMANDS) {
    commands.push({
      command: command.id,
      title: `%${command.nlsKey}%`,
      category: '%command.category%',
    });
    if (command.paletteWhen) paletteMenu.push({ command: command.id, when: command.paletteWhen });
    if (command.inEditorContext) {
      contextMenu.push({ command: command.id, group: 'w3cColorToolkit@1', when: command.contextWhen });
    }
  }

  for (const command of sources.HIDDEN_COMMANDS) {
    commands.push({
      command: command.id,
      title: `%${command.nlsKey}%`,
      category: '%command.category%',
    });
    // 隐藏只作用于命令面板; Keyboard Shortcuts 界面仍可搜索绑定。
    paletteMenu.push({ command: command.id, when: 'false' });
  }

  return {
    configuration: {
      title: '%extension.displayName%',
      properties,
    },
    // 关掉 VS Code 内置的默认颜色提供器: 它认的 hex 与 rgb/hsl 系写法是本扩展
    // DocumentColorProvider 的真子集, 而 VS Code 会把多个提供器的色块叠加渲染
    // (不按 range 去重)。把它的默认值设为 never, "一个颜色一个色块 + 一个取色器"
    // 才是确定行为; 用户仍可在设置里改回 auto / always。
    configurationDefaults: {
      'editor.defaultColorDecorators': 'never',
    },
    commands,
    submenus: [{ id: 'w3cColorToolkit.editorContext', label: '%extension.displayName%' }],
    menus: {
      commandPalette: paletteMenu,
      'editor/context': [
        { submenu: 'w3cColorToolkit.editorContext', group: '1_modification', when: 'editorTextFocus' },
      ],
      'w3cColorToolkit.editorContext': contextMenu,
    },
  };
}

function buildNls(sources) {
  const en = { ...EN };
  const zh = { ...ZH_CN };

  // config.advanced 的说明替换为完整参考表格 (键 / 类型 / 默认值 / 说明), 两种语言各一份。
  en['config.advanced'] = advancedReferenceMarkdown(sources.ADVANCED_SETTINGS, 'en', EN);
  zh['config.advanced'] = advancedReferenceMarkdown(sources.ADVANCED_SETTINGS, 'zh-cn', ZH_CN);

  for (const entry of sources.FORMAT_CATALOG) {
    const key = `command.convertTo.${entry.commandSuffix}`;
    en[key] = CONVERT_TITLE_TEMPLATE.en(entry.label);
    zh[key] = CONVERT_TITLE_TEMPLATE['zh-cn'](entry.label);
  }

  return { en, zh };
}

function collectRequiredNlsKeys(contributes) {
  const keys = new Set();
  const visit = (value) => {
    if (typeof value === 'string') {
      const match = /^%(.+)%$/.exec(value);
      if (match) keys.add(match[1]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  visit(contributes);
  return keys;
}

function paletteMenuOf(contributes) {
  return contributes.menus.commandPalette.filter((entry) => entry.when !== 'false');
}

function sortObject(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const sources = await loadSources();
  const contributes = buildContributes(sources);
  const { en, zh } = buildNls(sources);

  // 一致性校验
  const errors = [];
  const required = collectRequiredNlsKeys(contributes);
  required.add('extension.displayName');
  required.add('extension.description');
  required.add('capabilities.untrustedWorkspaces');

  for (const key of required) {
    if (!(key in en)) errors.push(`missing English nls key: ${key}`);
    if (!(key in zh)) errors.push(`missing Chinese nls key: ${key}`);
  }
  for (const key of Object.keys(en)) {
    if (!required.has(key)) errors.push(`unused English nls key: ${key}`);
  }
  const enKeys = Object.keys(en).sort().join(',');
  const zhKeys = Object.keys(zh).sort().join(',');
  if (enKeys !== zhKeys) errors.push('English and Chinese nls key sets differ');

  // 护栏: 命令面板的 when 不允许依赖编辑器焦点, 否则命令永远不出现在面板里。
  for (const entry of paletteMenuOf(contributes)) {
    if (entry.when && /editor(Text)?Focus/.test(entry.when)) {
      errors.push(
        `commandPalette entry for ${entry.command} uses ${entry.when}; ` +
          'the palette steals focus so this hides the command. Use editorIsOpen instead.',
      );
    }
  }

  const visibleCount = sources.VISIBLE_COMMANDS.length;
  const hiddenCount = sources.HIDDEN_COMMANDS.length;
  if (visibleCount !== 5) errors.push(`expected 5 visible commands, got ${visibleCount}`);
  if (hiddenCount !== 31) errors.push(`expected 31 hidden commands, got ${hiddenCount}`);
  if (sources.EXPOSED_SETTINGS.length !== 8) {
    errors.push(`expected 8 exposed settings, got ${sources.EXPOSED_SETTINGS.length}`);
  }
  if (sources.ADVANCED_SETTINGS.length !== 35) {
    errors.push(`expected 35 advanced settings, got ${sources.ADVANCED_SETTINGS.length}`);
  }

  if (errors.length > 0) {
    console.error('gen-contributes failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const packagePath = join(ROOT, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  const nextPkg = { ...pkg, contributes };

  const targets = [
    [packagePath, `${JSON.stringify(nextPkg, null, 2)}\n`],
    [join(ROOT, 'package.nls.json'), `${JSON.stringify(sortObject(en), null, 2)}\n`],
    [join(ROOT, 'package.nls.zh-cn.json'), `${JSON.stringify(sortObject(zh), null, 2)}\n`],
  ];

  if (CHECK_ONLY) {
    let drifted = false;
    for (const [path, expected] of targets) {
      const actual = await readFile(path, 'utf8').catch(() => '');
      if (actual !== expected) {
        console.error(`out of date: ${path}`);
        drifted = true;
      }
    }
    if (drifted) {
      console.error('run `npm run gen:contributes` to regenerate');
      process.exit(1);
    }
    console.log('contributes and nls files are up to date');
    return;
  }

  for (const [path, content] of targets) await writeFile(path, content, 'utf8');
  console.log(
    `wrote contributes: ${Object.keys(contributes.configuration.properties).length} settings, ${
      contributes.commands.length
    } commands`,
  );
}

await main();
