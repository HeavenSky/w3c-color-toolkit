import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    // vscode 模块只在集成测试中可用, 单元测试不允许引入。
    alias: {},
  },
});
