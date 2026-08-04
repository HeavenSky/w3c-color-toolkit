import { describe, expect, it } from 'vitest';

import { resolveAdvanced } from '../../src/configuration/advanced.js';
import { isLanguageEnabled, parseLanguageFilter } from '../../src/configuration/language-filter.js';
import {
  ADVANCED_KEYS,
  ADVANCED_SETTINGS,
  advancedDefaults,
  EXPOSED_KEYS,
  EXPOSED_SETTINGS,
  isExposedKey,
} from '../../src/configuration/schema.js';

describe('两层配置的形状', () => {
  it('暴露层恰好 8 个键', () => {
    expect(EXPOSED_SETTINGS).toHaveLength(8);
    expect(EXPOSED_KEYS).toEqual([
      'enabled',
      'languages',
      'highlight',
      'info',
      'convertSyntax',
      'precision',
      'experimental',
      'advanced',
    ]);
  });

  it('内置层恰好 34 项', () => {
    expect(ADVANCED_SETTINGS).toHaveLength(34);
    expect(Object.keys(advancedDefaults())).toHaveLength(34);
  });

  it('两层没有重叠键', () => {
    for (const key of ADVANCED_KEYS) {
      expect(isExposedKey(key), `${key} 不应同时属于两层`).toBe(false);
    }
  });

  it('每个设置都有 nlsKey 与默认值', () => {
    for (const setting of [...EXPOSED_SETTINGS, ...ADVANCED_SETTINGS]) {
      expect(setting.nlsKey, `${setting.key} 缺少 nlsKey`).toBeTruthy();
      expect(setting.default, `${setting.key} 缺少默认值`).not.toBeUndefined();
    }
  });

  it('枚举型设置的默认值在枚举内', () => {
    for (const setting of [...EXPOSED_SETTINGS, ...ADVANCED_SETTINGS]) {
      if (!setting.enum || setting.type !== 'string') continue;
      expect(setting.enum, `${setting.key} 默认值不在枚举内`).toContain(setting.default as string);
    }
  });
});

describe('advanced 增量覆盖', () => {
  it('未出现的键保持默认值', () => {
    const result = resolveAdvanced({ user: { 'output.hexCase': 'upper' } });
    expect(result.values['output.hexCase']).toBe('upper');
    expect(result.values['highlight.markRuler']).toBe(true);
    expect(result.sources['output.hexCase']).toBe('advanced:user');
    expect(result.sources['highlight.markRuler']).toBe('default');
  });

  it('跨 scope 逐键合并而不是整体替换', () => {
    const result = resolveAdvanced({
      user: { 'output.hexCase': 'upper' },
      workspace: { 'scan.comments': false },
    });
    // 关键行为: 工作区只设了 B 键, 用户级的 A 键必须仍然生效。
    expect(result.values['output.hexCase']).toBe('upper');
    expect(result.values['scan.comments']).toBe(false);
    expect(result.sources['output.hexCase']).toBe('advanced:user');
    expect(result.sources['scan.comments']).toBe('advanced:workspace');
  });

  it('更具体的 scope 覆盖更宽的 scope', () => {
    const result = resolveAdvanced({
      user: { 'output.hexCase': 'upper' },
      workspace: { 'output.hexCase': 'lower' },
      folder: { 'logLevel': 'debug' },
    });
    expect(result.values['output.hexCase']).toBe('lower');
    expect(result.values['logLevel']).toBe('debug');
    expect(result.sources['output.hexCase']).toBe('advanced:workspace');
  });

  it('未知键被忽略并记录', () => {
    const result = resolveAdvanced({ user: { 'not.a.key': 1 } });
    expect(result.issues).toEqual([{ kind: 'unknown-key', key: 'not.a.key', scope: 'advanced:user' }]);
  });

  it('暴露层键出现在 advanced 中被拒绝', () => {
    const result = resolveAdvanced({ user: { precision: 3, enabled: false } });
    expect(result.issues.map((issue) => issue.kind)).toEqual(['exposed-key', 'exposed-key']);
    expect(result.values['precision']).toBeUndefined();
  });

  it('类型不匹配被忽略并记录', () => {
    const result = resolveAdvanced({ user: { 'scan.comments': 'yes' } });
    expect(result.values['scan.comments']).toBe(true);
    expect(result.issues[0].kind).toBe('type-mismatch');
  });

  it('枚举值不合法视为类型不匹配', () => {
    const result = resolveAdvanced({ user: { 'output.hexCase': 'Mixed' } });
    expect(result.values['output.hexCase']).toBe('lower');
    expect(result.issues[0].kind).toBe('type-mismatch');
  });

  it('数值越界被钳制并记录', () => {
    const result = resolveAdvanced({ user: { 'variables.maxImportDepth': 5000 } });
    expect(result.values['variables.maxImportDepth']).toBe(100);
    expect(result.issues[0].kind).toBe('clamped');
  });

  it('非对象值被忽略而不抛异常', () => {
    const result = resolveAdvanced({ user: 'nonsense' });
    expect(result.issues[0].kind).toBe('type-mismatch');
    expect(result.values['highlight.markRuler']).toBe(true);
  });

  it('null 数组类型 info.fields 接受 null 与字符串数组', () => {
    expect(resolveAdvanced({ user: { 'info.fields': null } }).issues).toHaveLength(0);
    expect(resolveAdvanced({ user: { 'info.fields': ['hex'] } }).values['info.fields']).toEqual(['hex']);
    expect(resolveAdvanced({ user: { 'info.fields': [1] } }).issues[0].kind).toBe('type-mismatch');
  });
});

describe('语言过滤', () => {
  it('* 匹配所有语言', () => {
    expect(isLanguageEnabled(['*'], 'css')).toBe(true);
    expect(isLanguageEnabled(['*'], 'plaintext')).toBe(true);
  });

  it('显式包含项只匹配自身', () => {
    expect(isLanguageEnabled(['css', 'scss'], 'css')).toBe(true);
    expect(isLanguageEnabled(['css', 'scss'], 'less')).toBe(false);
  });

  it('! 前缀排除项优先于包含项', () => {
    expect(isLanguageEnabled(['*', '!plaintext'], 'plaintext')).toBe(false);
    expect(isLanguageEnabled(['*', '!plaintext'], 'css')).toBe(true);
  });

  it('排除项优先与顺序无关', () => {
    expect(isLanguageEnabled(['!css', 'css'], 'css')).toBe(false);
    expect(isLanguageEnabled(['css', '!css'], 'css')).toBe(false);
  });

  it('空数组不启用任何语言', () => {
    expect(isLanguageEnabled([], 'css')).toBe(false);
  });

  it('大小写不敏感', () => {
    expect(isLanguageEnabled(['CSS'], 'css')).toBe(true);
    expect(isLanguageEnabled(['*', '!CSS'], 'css')).toBe(false);
  });

  it('解析结果区分包含、排除与通配', () => {
    const filter = parseLanguageFilter(['*', 'css', '!plaintext', ' ']);
    expect(filter.includesAll).toBe(true);
    expect(filter.includes).toEqual(['css']);
    expect(filter.excludes).toEqual(['plaintext']);
  });
});
