import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/performance/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
  },
});
