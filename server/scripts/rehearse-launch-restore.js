// Only called inside the disposable launch-test cluster. Never points at an
// existing or production database; the destination database is newly created.
import pg from 'pg';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const target=new URL(process.env.LAUNCH_TEST_DATABASE_URL || 'https://invalid');
if (target.hostname!=='127.0.0.1' || target.pathname!=='/borrowhood_launch_test'
  || target.search || target.hash || process.env.LAUNCH_TEST_FRESH_CLUSTER!=='yes' || !process.env.PRIVACY_PG_BIN) {
  throw new Error('Use npm run test:launch:local for a disposable cluster and restore rehearsal.');
}
const root=await mkdtemp(path.join(tmpdir(),'borrowhood-restore-'));
const archive=path.join(root,'launch.dump');
const env={PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:target.port,PGUSER:decodeURIComponent(target.username),
  PGPASSWORD:decodeURIComponent(target.password)};
const run=(command,args)=>new Promise((resolve,reject)=>{
  const child=spawn(path.join(process.env.PRIVACY_PG_BIN,command),args,{env,stdio:'inherit'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${command} failed (${code})`)));
});
const original=new pg.Client({connectionString:target.href,ssl:false});
const restoredUrl=new URL(target);restoredUrl.pathname='/borrowhood_restore_test';
const restored=new pg.Client({connectionString:restoredUrl.href,ssl:false});
try {
  await run('pg_dump',['--format=custom','--file',archive,'borrowhood_launch_test']);
  await run('createdb',['borrowhood_restore_test']);
  await run('pg_restore',['--exit-on-error','--dbname=borrowhood_restore_test',archive]);
  await original.connect();await restored.connect();
  for(const table of ['users','listings','item_requests','messages','notifications','feed_windows','borrow_transactions','exchange_endorsements','push_deliveries']){
    const sql=`SELECT COUNT(*)::int AS count,md5(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text)) AS digest FROM ${table} t`;
    assert.deepEqual((await restored.query(sql)).rows,(await original.query(sql)).rows,`Restore mismatch: ${table}`);
  }
  console.log('Native pg_dump/pg_restore rehearsal passed: counts and full-row digests match across nine fixture tables.');
  const reportPath = new URL('../../docs/qa/launch-load-results.json', import.meta.url);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  report.restore = 'Passed native pg_dump/pg_restore in a disposable local cluster: counts and full-row digests match across nine synthetic tables. Railway backup/restore remains unverified.';
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
} finally {
  await original.end();await restored.end();await rm(root,{recursive:true,force:true});
}
