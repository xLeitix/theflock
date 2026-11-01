// Tests the pulled release image against a real, authenticated replica set.
// This script is restricted to disposable CI runners and its own preview database.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {MongoClient} from 'mongodb';
if(process.env.CI!=='true')throw new Error('Run image checks only in disposable CI.');
const image=process.env.FLOCK_TEST_IMAGE;
const revision=process.env.GITHUB_SHA;
if(!image?.startsWith('europe-north2-docker.pkg.dev/theflock-icet/flock/app@sha256:')||!/^[a-f0-9]{40}$/.test(revision??''))throw new Error('Expected immutable release image and revision.');
const secret=randomBytes(36).toString('base64url');
const password=randomBytes(36).toString('base64url');
const credentials=JSON.parse(await readFile('.local/mongo-credentials.json','utf8'));
const admin=new MongoClient(`mongodb://${credentials.adminUser}:${credentials.adminPassword}@127.0.0.1:27018/admin?authSource=admin&replicaSet=rs0`);
const configPath=resolve('.local/image-runtime.json');
const base='http://127.0.0.1:4301';
const origin='https://theflock.icet-lab.eu';
const headers={'X-Flock-Gateway':secret,'X-Forwarded-Proto':'https',Host:'theflock.icet-lab.eu'};
let checks=0;
async function expect(path,status,options={}){const response=await fetch(base+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(5000),redirect:'manual'});assert.equal(response.status,status,path);checks++;return response;}
try{
 await admin.connect();
 await admin.db('flock_preview').command({createUser:'flock_image_test',pwd:password,roles:[{role:'readWrite',db:'flock_preview'}]});
 await writeFile(configPath,JSON.stringify({mongoUri:`mongodb://flock_image_test:${password}@127.0.0.1:27018/flock_preview?authSource=flock_preview&replicaSet=rs0`,databaseName:'flock_preview',origin,sessionSecret:secret,preview:{mode:'preview',gatewaySecret:secret,revision}}),{mode:0o600});
 execFileSync('sudo',['chown','1000:1000',configPath]);
 execFileSync('docker',['run','-d','--name','flock-image-test','--network','host','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--memory-swap','256m','--pids-limit','64','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','-e','PORT=4301','--mount',`type=bind,src=${configPath},dst=/run/flock/runtime.json,readonly`,image],{stdio:'ignore'});
 let ready=false;
 for(let i=0;i<60;i++){try{const r=await fetch(base+'/health/ready',{headers,signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready,'Release image became ready');
 for(const path of ['/','/api/v1/session','/health/ready','/api/v1/places'])await expect(path,403,{headers:{'X-Flock-Gateway':'forged'}});
 await expect('/api/v1/session',400,{headers:{'X-Forwarded-Proto':'http'}});
 // Node fetch ignores a caller-supplied Host header; exercise the trusted
 // loopback proxy hostname instead. The raw Host path is covered by Supertest.
 await expect('/api/v1/session',421,{headers:{'X-Forwarded-Host':'other.invalid'}});
 const home=await expect('/',200);assert.match(await home.text(),/id="app"/);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const emergency=await expect('/emergency',200);assert.match(await emergency.text(),/id="app"/);
 const assets=JSON.parse(execFileSync('docker',['exec','flock-image-test','node','-e',"console.log(JSON.stringify(require('node:fs').readdirSync('/app/apps/web/dist/assets')))" ]).toString());
 const worker=assets.find(name=>/^maplibre-gl-worker-[\w-]+\.js$/.test(name));assert.ok(worker,'Map worker was included in the release image');
 const workerResponse=await expect('/assets/'+worker,200);assert.match(workerResponse.headers.get('content-type'),/javascript/);assert.ok((await workerResponse.text()).length>10000);
 for(const path of ['/.local/runtime.json','/run/flock/runtime.json','/.env','/package.json','/apps/api/src/app.ts','/favicon.ico','/assets/missing.js']){
  const missing=await expect(path,404);assert.deepEqual(missing.headers.getSetCookie(),[],'Missing resources must not issue session cookies');
 }
 const publicContacts=await expect('/api/v1/emergency-contacts',200);assert.deepEqual(publicContacts.headers.getSetCookie(),[]);
 const health=await (await expect('/health/ready',200)).json();assert.equal(health.revision,revision);
 const bootstrap=await expect('/api/v1/session',200);const session=await bootstrap.json();assert.equal(session.mode,'preview');
 const cookie=bootstrap.headers.getSetCookie()[0];assert.match(cookie,/^__Host-flock.sid=/);assert.match(cookie,/; Secure/);assert.match(cookie,/; HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 const login=await expect('/api/v1/dev/login',200,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':session.csrfToken,Cookie:cookie.split(';')[0]},body:JSON.stringify({persona:'member'})});
 const logged=await login.json();const loginCookie=login.headers.getSetCookie()[0].split(';')[0];assert.equal(logged.user.displayName,'Alex · demo member');
 const places=await (await expect('/api/v1/places',200)).json();assert.equal(places.places.length,4);
 const place=places.places[0];const key=randomUUID();
 const mutation={method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':logged.csrfToken,Cookie:loginCookie,'X-Flock-Contract':'community-care-v2','Idempotency-Key':key},body:JSON.stringify({flockBand:'small',foodTypes:['seeds'],comment:'Fictional exact-image check'})};
 await expect(`/api/v1/places/${place.id}/feedings`,403,{...mutation,headers:{...mutation.headers,Origin:'https://other.invalid'}});
 const first=await (await expect(`/api/v1/places/${place.id}/feedings`,201,mutation)).json();
 const replay=await (await expect(`/api/v1/places/${place.id}/feedings`,201,mutation)).json();assert.equal(first.feeding.id,replay.feeding.id);
 const history=await (await expect(`/api/v1/places/${place.id}/feedings`,200)).json();assert.ok(history.feedings.some(f=>f.id===first.feeding.id&&f.authorDisplayName==='Alex · demo member'));
 const stats=JSON.parse(execFileSync('docker',['stats','--no-stream','--format','{{json .}}','flock-image-test']).toString());
 console.log(`Release image passed ${checks} HTTP boundary/workflow checks; container memory: ${stats.MemUsage}.`);
}catch(error){
 // The app logs error types and readiness only, never runtime credentials.
 try{console.error(execFileSync('docker',['logs','--tail','40','flock-image-test']).toString());}catch{}
 throw error;
}finally{
 try{execFileSync('docker',['rm','-f','flock-image-test'],{stdio:'ignore'});}catch{}
 await rm(configPath,{force:true});
 await admin.db('flock_preview').dropDatabase().catch(()=>{});
 await admin.close();
}
