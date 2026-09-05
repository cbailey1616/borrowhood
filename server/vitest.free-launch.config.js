import { defineConfig } from 'vitest/config';

// Isolated route tests: no credentials, live Stripe calls, database or migrations.
export default defineConfig({ test: {
  environment: 'node', include: ['tests/free-launch.test.js'],
  pool: 'forks', poolOptions: { forks: { singleFork: true } },
} });
