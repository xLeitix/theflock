import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const revision=process.env.GITHUB_SHA;
const digest=process.env.IMAGE_DIGEST;
const image='europe-north2-docker.pkg.dev/theflock-icet/flock/app';
if(!/^[a-f0-9]{40}$/.test(revision??'')||!/^sha256:[a-f0-9]{64}$/.test(digest??''))throw new Error('Invalid release identity');
const inspected=JSON.parse(execFileSync('docker',['image','inspect',`${image}@${digest}`]).toString())[0];
if(inspected.Config.Labels['org.opencontainers.image.revision']!==revision)throw new Error('Image revision mismatch');
const payload=Buffer.from(JSON.stringify({revision,digest,image,configDigest:inspected.Id,repositoryId:'1440286900',schema:'community-care-v2',mode:'preview',runId:process.env.GITHUB_RUN_ID}));
await writeFile('.local/release-payload.json',payload);
execFileSync('gcloud',['kms','asymmetric-sign','--project=theflock-icet','--location=europe-north2','--keyring=flock','--key=release','--version=1','--digest-algorithm=sha256','--input-file=.local/release-payload.json','--signature-file=.local/release-signature','--quiet'],{stdio:'inherit'});
// Current gcloud writes raw bytes; some command help describes base64 output.
// Normalize either representation and verify the actual RSA-2048 byte length.
const rawSignature=await readFile('.local/release-signature');
const signature=rawSignature.length===256?rawSignature.toString('base64'):rawSignature.toString('utf8').trim();
if(Buffer.from(signature,'base64').length!==256)throw new Error('Unexpected RSA signature format');
await writeFile('.local/eligibility.json',JSON.stringify({payload:payload.toString('base64'),signature}));
const destination=`gs://theflock-icet-releases/${revision}/eligibility.json`;
let previous;
try{previous=JSON.parse(execFileSync('gcloud',['storage','cat',destination],{stdio:['ignore','pipe','ignore']}).toString());}catch{}
if(previous){
 const old=JSON.parse(Buffer.from(previous.payload,'base64').toString());
 if(old.digest!==digest||old.configDigest!==inspected.Id)throw new Error('Existing immutable release differs');
 console.log('Existing eligibility record preserved for this same tested image.');
}else execFileSync('gcloud',['storage','cp','.local/eligibility.json',destination,'--if-generation-match=0','--quiet'],{stdio:'inherit'});
