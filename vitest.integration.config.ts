import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['tests/integration/**/*.test.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    passWithNoTests: true,
  },
});
