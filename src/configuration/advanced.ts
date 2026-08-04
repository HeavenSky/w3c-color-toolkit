/**
 * `w3cColorToolkit.advanced` 的解析与增量覆盖。
 *
 * 关键设计:
 * - 键是点分路径字符串, 扁平书写, 不接受嵌套对象, 避免深合并歧义;
 * - 覆盖是增量的, 未出现的键保持内置默认值;
 * - 暴露层的 8 个键禁止出现在 `advanced` 中, 出现即忽略并告警,
 *   这条规则消除了两层之间的优先级歧义;
 * - 未知键忽略、类型不符忽略、数值越界钳制, 任何情况下都不抛异常;
 * - 跨 scope 由本模块自行逐键合并: VS Code 对 object 类型设置是整体替换,
 *   直接读会让工作区配置丢掉用户级配置里的其他键。
 */
import { advancedDefaults, advancedSetting, isExposedKey, type SettingDefinition } from './schema.js';

export type AdvancedScope = 'default' | 'advanced:user' | 'advanced:workspace' | 'advanced:folder';

export type AdvancedIssueKind = 'unknown-key' | 'exposed-key' | 'type-mismatch' | 'clamped';

export interface AdvancedIssue {
  readonly kind: AdvancedIssueKind;
  readonly key: string;
  readonly scope: AdvancedScope;
  readonly detail?: string;
}

export interface AdvancedResolution {
  /** 合并后的完整内置层取值。 */
  readonly values: Readonly<Record<string, unknown>>;
  /** 每个键的来源, 供"显示生效配置"使用。 */
  readonly sources: Readonly<Record<string, AdvancedScope>>;
  readonly issues: readonly AdvancedIssue[];
}

export interface AdvancedInput {
  readonly user?: unknown;
  readonly workspace?: unknown;
  readonly folder?: unknown;
}

const SCOPE_ORDER: readonly { readonly scope: AdvancedScope; readonly field: keyof AdvancedInput }[] =
  Object.freeze([
    { scope: 'advanced:user', field: 'user' },
    { scope: 'advanced:workspace', field: 'workspace' },
    { scope: 'advanced:folder', field: 'folder' },
  ]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesType(setting: SettingDefinition, value: unknown): boolean {
  switch (setting.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string' && (!setting.enum || setting.enum.includes(value));
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
    case 'string[]|null':
      return value === null || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
    default:
      return false;
  }
}

function clampIfNeeded(
  setting: SettingDefinition,
  value: unknown,
): { readonly value: unknown; readonly clamped: boolean } {
  if (typeof value !== 'number') return { value, clamped: false };
  let next = value;
  if (setting.minimum !== undefined && next < setting.minimum) next = setting.minimum;
  if (setting.maximum !== undefined && next > setting.maximum) next = setting.maximum;
  return { value: next, clamped: next !== value };
}

/** 合并三个 scope 的 `advanced` 对象到完整内置层取值。 */
export function resolveAdvanced(input: AdvancedInput): AdvancedResolution {
  const values = advancedDefaults();
  const sources: Record<string, AdvancedScope> = {};
  for (const key of Object.keys(values)) sources[key] = 'default';
  const issues: AdvancedIssue[] = [];

  for (const { scope, field } of SCOPE_ORDER) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (!isPlainObject(raw)) {
      issues.push({ kind: 'type-mismatch', key: '(root)', scope, detail: 'expected object' });
      continue;
    }
    for (const [key, value] of Object.entries(raw)) {
      if (isExposedKey(key)) {
        issues.push({ kind: 'exposed-key', key, scope });
        continue;
      }
      const setting = advancedSetting(key);
      if (!setting) {
        issues.push({ kind: 'unknown-key', key, scope });
        continue;
      }
      if (!matchesType(setting, value)) {
        issues.push({ kind: 'type-mismatch', key, scope, detail: setting.type });
        continue;
      }
      const { value: finalValue, clamped } = clampIfNeeded(setting, value);
      if (clamped) {
        issues.push({ kind: 'clamped', key, scope, detail: String(finalValue) });
      }
      values[key] = finalValue;
      sources[key] = scope;
    }
  }

  return { values, sources, issues };
}

/** 按类型安全地取值; 键不存在时返回内置默认值。 */
export function advancedValue<T>(resolution: AdvancedResolution, key: string): T {
  return resolution.values[key] as T;
}
