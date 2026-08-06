import { defineConfig } from 'vitest/config';

/**
 * 测试只覆盖不依赖 vscode 运行时的纯逻辑, 因此不需要 VS Code 集成测试 harness;
 * 需要宿主能力的接缝在测试里替换成内存实现。
 *
 * `test/performance/` 不在这里跑: 它耗时长且断言的是时间, 由 `vitest.perf.config.ts`
 * 单独触发 (没有性能测试的仓库不需要那份配置)。
 *
 * 同时收 `.mjs`: 构建脚本 (`scripts/**.mjs`) 也需要被测, 而 `tsconfig.json` 没开
 * `allowJs`, 从 `.ts` 测试里 import `.mjs` 会让 `tsc --noEmit` 报缺声明文件。
 * 反过来 tsc 不收录 `.mjs`, 所以用 `.mjs` 写这类测试两边都干净。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,mjs}'],
    exclude: ['test/performance/**'],
    environment: 'node',
  },
});
