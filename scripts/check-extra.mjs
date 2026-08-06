/**
 * W3C Color Toolkit 专属门禁。
 *
 * 本仓库的 `contributes` 与 l10n bundle 都是从 TypeScript 单一来源生成的,
 * 漂移会让设置界面与实现不一致 (而且不会有任何报错), 因此必须在发布前卡住。
 * 冒烟检查跑一遍不依赖 VS Code 运行时的端到端链路: 扫描 → 解析 → 求值 → 色域映射 → 序列化。
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** 跑一个生成脚本的 --check 模式; 失败时把它的输出作为问题描述。 */
function drift(root, script, label) {
  try {
    execFileSync(process.execPath, [join(root, script), '--check'], { cwd: root, stdio: 'pipe' });
    return [];
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    return [`${label} 已漂移, 请重新生成${detail ? `:\n${detail}` : ''}`];
  }
}

export function checks(root) {
  return {
    'contributes 与 TS 单一来源一致': () => drift(root, 'scripts/gen-contributes.mjs', 'contributes'),
    'l10n bundle 与字符串表一致': () => drift(root, 'scripts/gen-l10n.mjs', 'l10n bundle'),
    '端到端冒烟通过': () => {
      try {
        execFileSync(process.execPath, [join(root, 'scripts/smoke.mjs')], {
          cwd: root,
          stdio: 'pipe',
        });
        return [];
      } catch (error) {
        const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
        return [`冒烟检查失败${detail ? `:\n${detail}` : ''}`];
      }
    },
  };
}
