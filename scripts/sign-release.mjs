import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const revision=process.env.GITHUB_SHA;
const digest=process.env.IMAGE_DIGEST;
const image='europe-north2-docker.pkg.dev/theflock-icet/flock/app';
if(!/^[a-f0-9]{40}$/.test(revision??'')||!/^sha256:[a-f0-9]{64}$/.test(digest??''))throw new Error('Invalid release identity');
const inspected=JSON.parse(execFileSync('docker',['image','inspect',`${image}@${digest}`]).toString())[0];
if(inspected.Config.Labels['org.opencontainers.image.revision']!==revision)throw new Error('Image revision mismatch');
const payload=Buffer.from(JSON.stringify({revision,digest,image,configDigest:inspected.Id,repositoryId:'1440286900',schema:'community-care-v2',mode:'preview',runId:process.env.GITHUB_RUN_ID}));
await writeFile('.local/release-payload.sha256',createHash('sha256').update(payload).digest());
execFileSync('gcloud',['kms','asymmetric-sign','--project=theflock-icet','--location=europe-north2','--keyring=flock','--key=release','--version=1','--digest-algorithm=sha256','--digest-file=.local/release-payload.sha256','--signature-file=.local/release-signature','--quiet'],{stdio:'inherit'});
const signature=await readFile('.local/release-signature');
await writeFile('.local/eligibility.json',JSON.stringify({payload:payload.toString('base64'),signature:signature.toString('base64')}));
const destination=`gs://theflock-icet-releases/${revision}/eligibility.json`;
let previous;
try{previous=JSON.parse(execFileSync('gcloud',['storage','cat',destination],{stdio:['ignore','pipe','ignore']}).toString());}catch{}
if(previous){
 const old=JSON.parse(Buffer.from(previous.payload,'base64').toString());
 if(old.digest!==digest||old.configDigest!==inspected.Id)throw new Error('Existing immutable release differs');
 console.log('Existing eligibility record preserved for this same tested image.');
}else execFileSync('gcloud',['storage','cp','.local/eligibility.json',destination,'--if-generation-match=0','--quiet'],{stdio:'inherit'});
