import { defineConfig } from 'vitest/config';

// Vitest 4's type for `forks` (top-level singleFork option) is incomplete in our
// installed version, but the runtime accepts it. Cast to any to bypass the check.
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    pool: 'forks',
    // One worker process — all integration tests share the test DB sequentially.
    ...({ forks: { singleFork: true } } as any),
    testTimeout: 15_000,
    passWithNoTests: true,
  },
});
