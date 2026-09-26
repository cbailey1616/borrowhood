import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const state=vi.hoisted(()=>({pools:[],jobsBlocked:false,release:null}));
vi.mock('pg',()=>({default:{Pool:class {
  constructor(config){this.config=config;this.handlers={};state.pools.push(this);}
  on(name,fn){this.handlers[name]=fn;}
  async query(){if(this.config.application_name==='borrowhood-jobs'&&state.jobsBlocked)await new Promise(resolve=>{state.release=resolve;});return {rows:[{pool:this.config.application_name}]};}
  async connect(){return {query:this.query.bind(this),release(){}};}
  async end(){}
}}}));
vi.mock('../../src/utils/logger.js',()=>({default:{warn:vi.fn(),error:vi.fn()}}));
import {query,withBackgroundDatabase,pool} from '../../src/utils/db.js';
import {healthCheck} from '../../src/services/health.js';
import {safeRoute} from '../../src/services/observability.js';
const app=express();app.get('/health',healthCheck);
afterEach(()=>{vi.restoreAllMocks();state.jobsBlocked=false;state.release?.();});
it('serves API database work while a background connection is blocked',async()=>{
  state.jobsBlocked=true;
  const background=withBackgroundDatabase(()=>query('SELECT 1'));
  const response=await query('SELECT 1');
  expect(response.rows[0].pool).toBe('borrowhood-api');
  state.release();
  expect((await background).rows[0].pool).toBe('borrowhood-jobs');
  expect((await query('SELECT 1')).rows[0].pool).toBe('borrowhood-api');
});
it('reports database outages as unavailable and recovers without revealing credentials',async()=>{
  const spy=vi.spyOn(pool,'query').mockRejectedValueOnce(new Error('private database detail'));
  const failed=await request(app).get('/health');
  expect(failed.status).toBe(503);expect(failed.body).toEqual({status:'unavailable'});
  spy.mockRestore();
  expect((await request(app).get('/health')).status).toBe(200);
});
it('redacts bearer photo URLs and identifiers from request diagnostics',()=>{
  expect(safeRoute('/api/private-photos/private-bearer-token')).toBe('/api/private-photos/:token');
  expect(safeRoute('/api/users/11111111-1111-4111-8111-111111111111')).toBe('/api/users/:id');
});
it('shares an in-flight health probe and returns 503 within its deadline',async()=>{
  vi.useFakeTimers();
  let release;
  const spy=vi.spyOn(pool,'query').mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const response=()=>{const res={set:vi.fn(),status:vi.fn(),json:vi.fn()};res.set.mockReturnValue(res);res.status.mockReturnValue(res);return res;};
  const a=response(),b=response();
  try{
    const checks=[healthCheck({},a),healthCheck({},b)];
    await vi.advanceTimersByTimeAsync(2000);await Promise.all(checks);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.status).toHaveBeenCalledWith(503);expect(b.status).toHaveBeenCalledWith(503);
    release({rows:[{}]});await Promise.resolve();
  }finally{vi.useRealTimers();}
});
