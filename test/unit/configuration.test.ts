import { describe, expect, it } from 'vitest';

import { resolveAdvanced } from '../../src/configuration/advanced.js';
import {
  ADVANCED_KEYS,
  ADVANCED_SETTINGS,
  advancedDefaults,
  EXPOSED_KEYS,
  EXPOSED_SETTINGS,
  isExposedKey,
} from '../../src/configuration/schema.js';

describe('两层配置的形状', () => {
  it('暴露层恰好 7 个键', () => {
    expect(EXPOSED_SETTINGS).toHaveLength(7);
    expect(EXPOSED_KEYS).toEqual([
      'enabled',
      'highlight',
      'info',
      'convertSyntax',
      'precision',
      'experimental',
      'advanced',
    ]);
  });

  it('内置层恰好 33 项', () => {
    expect(ADVANCED_SETTINGS).toHaveLength(33);
    expect(Object.keys(advancedDefaults())).toHaveLength(33);
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

  it('null 数组类型 fields.enabled 接受 null 与字符串数组', () => {
    expect(resolveAdvanced({ user: { 'fields.enabled': null } }).issues).toHaveLength(0);
    expect(resolveAdvanced({ user: { 'fields.enabled': ['hex'] } }).values['fields.enabled']).toEqual([
      'hex',
    ]);
    expect(resolveAdvanced({ user: { 'fields.enabled': [1] } }).issues[0].kind).toBe('type-mismatch');
  });
});
