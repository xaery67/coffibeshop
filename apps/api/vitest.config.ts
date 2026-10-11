import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Test tidak boleh menyentuh infra nyata (mock Redis/Prisma/Queue per-file).
    env: { NODE_ENV: 'test', LOG_LEVEL: 'error' },
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], exclude: ['**/*.test.ts', '**/dist/**'] },
  },
});
