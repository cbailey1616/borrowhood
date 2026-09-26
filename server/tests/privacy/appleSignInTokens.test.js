import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../src/utils/db.js',()=>({query:(...args)=>state.db.query(...args),withTransaction:fn=>state.db.transaction(fn)}));
import { ensureAppleSignInSchema, saveAppleAuthorization, queueAppleRevocation, processAppleRevocations } from '../../src/services/appleSignInTokens.js';
const userId=randomUUID();
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const identity={provider:'apple',subject:'apple-person',authorizationCode:'one-time-code'};
const verify=vi.fn();
beforeAll(async()=>{
  state.db=new PGlite();await state.db.exec('CREATE TABLE users(id UUID PRIMARY KEY,apple_id TEXT)');
  await ensureAppleSignInSchema();await ensureAppleSignInSchema();
},20000);
afterAll(async()=>{await state.db.close();vi.unstubAllEnvs();vi.unstubAllGlobals();});
beforeEach(async()=>{
  vi.stubEnv('JWT_SECRET','isolated-encryption-secret');vi.stubEnv('APPLE_SIGN_IN_TEAM_ID','TEAMID');vi.stubEnv('APPLE_SIGN_IN_KEY_ID','KEYID');
  vi.stubEnv('APPLE_SIGN_IN_PRIVATE_KEY',privateKey.export({type:'pkcs8',format:'pem'}));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({id_token:'verified-apple-id-token',refresh_token:'refresh-secret'})}));
  verify.mockReset().mockResolvedValue({subject:'apple-person'});
  await state.db.exec('TRUNCATE users,apple_token_revocations');await state.db.query('INSERT INTO users(id,apple_id) VALUES($1,$2)',[userId,'apple-person']);
});
it('exchanges a one-use authorization code and stores only encrypted refresh credentials',async()=>{
  await saveAppleAuthorization(state.db,userId,identity,verify);
  const [url,options]=fetch.mock.calls[0];expect(url).toBe('https://appleid.apple.com/auth/token');expect(options.redirect).toBe('error');
  expect(options.body.get('code')).toBe('one-time-code');expect(options.body.get('client_id')).toBe('com.borrowhood.app');
  const claims=jwt.verify(options.body.get('client_secret'),publicKey,{algorithms:['ES256'],issuer:'TEAMID',audience:'https://appleid.apple.com',subject:'com.borrowhood.app'});
  expect(claims.exp-claims.iat).toBe(300);expect(verify).toHaveBeenCalledWith('apple','verified-apple-id-token');
  const [u]=(await state.db.query('SELECT * FROM users')).rows;expect(u.apple_refresh_token_ciphertext).toBeTruthy();expect(JSON.stringify(u)).not.toContain('refresh-secret');
});
it('rejects a code exchanged for a different Apple identity',async()=>{
  verify.mockResolvedValueOnce({subject:'attacker'});
  await expect(saveAppleAuthorization(state.db,userId,identity,verify)).rejects.toMatchObject({status:503});
  expect((await state.db.query('SELECT apple_refresh_token_ciphertext FROM users')).rows[0].apple_refresh_token_ciphertext).toBeNull();
});
it('retries an Apple outage after account removal and erases credentials after successful revocation',async()=>{
  await saveAppleAuthorization(state.db,userId,identity,verify);
  const user=(await state.db.query('SELECT * FROM users')).rows[0];
  const pending=await state.db.transaction(db=>queueAppleRevocation(db,user));
  await state.db.query('DELETE FROM users WHERE id=$1',[userId]);
  fetch.mockResolvedValueOnce({ok:false});
  expect(await processAppleRevocations(pending.id)).toBe(false);
  let jobs=(await state.db.query('SELECT * FROM apple_token_revocations')).rows;expect(jobs).toHaveLength(1);expect(jobs[0].attempts).toBe(1);
  await state.db.exec("UPDATE apple_token_revocations SET next_attempt_at=NOW()-INTERVAL '1 second'");
  expect(await processAppleRevocations(pending.id)).toBe(true);
  const [url,opts]=fetch.mock.calls.at(-1);expect(url).toBe('https://appleid.apple.com/auth/revoke');
  expect(opts.body.get('token')).toBe('refresh-secret');expect(opts.body.get('token_type_hint')).toBe('refresh_token');
  expect((await state.db.query('SELECT * FROM apple_token_revocations')).rows).toHaveLength(0);
});
it('does not contact Apple or orphan a revocation after a rolled-back deletion',async()=>{
  await saveAppleAuthorization(state.db,userId,identity,verify);
  const user=(await state.db.query('SELECT * FROM users')).rows[0];
  await expect(state.db.transaction(async db=>{await queueAppleRevocation(db,user);throw new Error('rollback');})).rejects.toThrow('rollback');
  expect((await state.db.query('SELECT * FROM apple_token_revocations')).rows).toHaveLength(0);
  expect((await state.db.query('SELECT * FROM users')).rows[0].apple_refresh_token_ciphertext).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('never silently succeeds after an authorization exchange failure',async()=>{
  fetch.mockRejectedValueOnce(new Error('outage'));
  await expect(saveAppleAuthorization(state.db,userId,identity,verify)).rejects.toMatchObject({status:503});
});
it('fulfills the legacy no-token fallback without pretending revocation happened',async()=>{
  expect(await queueAppleRevocation(state.db,{id:userId,apple_id:'legacy'})).toEqual({status:'manual',helpUrl:'https://support.apple.com/102571'});
  expect(fetch).not.toHaveBeenCalled();
});
