// Run policy checks in a disposable local PostgreSQL cluster, never an existing
// database. Requires installed PostgreSQL tools; no download or .env loading.
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const candidates = [process.env.PRIVACY_PG_BIN,
  path.join(os.homedir(), 'Applications/Postgres.app/Contents/Versions/latest/bin'),
  '/Applications/Postgres.app/Contents/Versions/latest/bin'].filter(Boolean);
let bin;
for (const candidate of candidates) {
  try { await access(path.join(candidate, 'initdb')); bin = candidate; break; } catch { /* Try next installed path. */ }
}
if (!bin) {
  console.error('Not run: install PostgreSQL tools or set PRIVACY_PG_BIN to their bin directory. No database was accessed.');
  process.exit(2);
}
const cleanEnv = { PATH: process.env.PATH, LANG: 'en_US.UTF-8' };
const run = (command, args, env = cleanEnv) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: serverRoot, env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited ${code}`)));
});
const socket = createServer();
await new Promise((resolve, reject) => {
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', resolve);
});
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const taskRoot = await mkdtemp(path.join(os.tmpdir(), 'borrowhood-privacy-'));
const dataDir = path.join(taskRoot, 'data');
const passwordFile = path.join(taskRoot, 'password');
const password = randomUUID();
let initialized = false;
let stopped = false;
try {
  await writeFile(passwordFile, password + '\n', { mode: 0o600 });
  await run(path.join(bin, 'initdb'), ['-D', dataDir, '-U', 'privacy_test', '--pwfile', passwordFile,
    '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--no-locale', '--encoding=UTF8']);
  initialized = true;
  await run(path.join(bin, 'pg_ctl'), ['-D', dataDir, '-l', path.join(taskRoot, 'postgres.log'),
    '-o', `-h 127.0.0.1 -p ${port} -k ${taskRoot}`, '-w', 'start']);
  await run(path.join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'privacy_test',
    'borrowhood_privacy_test'], { ...cleanEnv, PGPASSWORD: password });
  const url = `postgresql://privacy_test:${password}@127.0.0.1:${port}/borrowhood_privacy_test`;
  await run(process.execPath, ['scripts/test-privacy-postgres.js'], {
    ...cleanEnv, PRIVACY_TEST_DATABASE_URL: url,
  });
  if (process.argv.includes('--migrations') || process.argv.includes('--suite')) {
    await run(process.execPath, ['scripts/test-privacy-migrations.js'], {
      ...cleanEnv, PRIVACY_TEST_DATABASE_URL: url, PRIVACY_TEST_FRESH_CLUSTER: 'yes',
    });
  }
  if (process.argv.includes('--suite')) {
    await run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.release.config.js', '--reporter=json', '--outputFile=/tmp/borrowhood-release-server-results.json'], {
      ...cleanEnv, DATABASE_URL: url, PRIVACY_TEST_FRESH_CLUSTER: 'yes', NODE_ENV: 'test',
      ADMIN_SECRET: randomUUID(), API_URL: 'http://borrowhood.test', JWT_SECRET: randomUUID(), JWT_REFRESH_SECRET: randomUUID(), STRIPE_SECRET_KEY: 'sk_test_local_placeholder_not_a_real_key',
      ENABLE_PAYMENTS: 'false', ENABLE_PAID_TIERS: 'false',
      ANTHROPIC_API_KEY: 'local_placeholder', AWS_EC2_METADATA_DISABLED: 'true',
    });
  }
} catch (error) {
  console.error('Isolated database test could not finish:', error.message);
  process.exitCode = 1;
} finally {
  if (initialized) {
    try {
      await run(path.join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      stopped = true;
    } catch {
      console.error(`Could not confirm shutdown. Retained test cluster: ${taskRoot}`);
      process.exitCode = 1;
    }
  }
  if (stopped || !initialized) await rm(taskRoot, { recursive: true, force: true });
  console.log('Production credentials and data were not used.');
}
