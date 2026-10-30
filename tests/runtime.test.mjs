import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {local,prepareLocal,readJson,withLock,writeJson,fileExists} from '../scripts/runtime.mjs';

test('two stale-lock contenders cannot remove or replace an existing lock',async()=>{
 await prepareLocal();const name=`test-${randomUUID()}`;const path=join(local,`${name}.lock`);await mkdir(path);
 const owner={token:randomUUID(),identity:{pid:99999999,fingerprint:'dead owner fixture'}};await writeJson(join(path,'owner.json'),owner);
 let calls=0;
 try {const results=await Promise.allSettled([withLock(name,async()=>calls++),withLock(name,async()=>calls++)]);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(calls,0);assert.deepEqual(await readJson(join(path,'owner.json')),owner);}
 finally{await rm(path,{recursive:true,force:true});}
});

test('an active lock excludes a second operation and is released only by its owner',async()=>{
 const name=`test-${randomUUID()}`;let enter,release;const entered=new Promise(r=>enter=r);const wait=new Promise(r=>release=r);
 const pending=withLock(name,async()=>{enter();await wait;return 'done';});await entered;
 try{await assert.rejects(withLock(name,async()=>assert.fail('second callback must not run')),/lock already exists/);}
 finally{release();}
 assert.equal(await pending,'done');assert.equal(await fileExists(join(local,`${name}.lock`)),false);
});
