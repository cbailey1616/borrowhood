import { defineConfig } from 'vitest/config';

// Deliberately isolated: no .env files, production credentials, migrations,
// live database, Stripe calls, storage mutations or outgoing notifications.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/privacy/*.test.js'],
    setupFiles: [],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
