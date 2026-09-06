import { defineConfig } from 'vitest/config';
// Release regression suite: real local SQL and HTTP, external services blocked.
export default defineConfig({ test: {
  globals: true, environment: 'node',
  include: ['tests/*.test.js'],
  setupFiles: ['tests/helpers/release-setup.js'],
  testTimeout: 10000, hookTimeout: 15000,
  pool: 'forks', poolOptions: { forks: { singleFork: true } },
} });
