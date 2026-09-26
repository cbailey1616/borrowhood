import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  environment: 'node', include: ['tests/load/*.test.js'], setupFiles: [],
  testTimeout: 180000, hookTimeout: 60000,
  pool: 'forks', poolOptions: { forks: { singleFork: true } },
} });
