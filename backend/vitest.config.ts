import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. Integration tests run via vitest.config.integration.ts.
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
  },
});
