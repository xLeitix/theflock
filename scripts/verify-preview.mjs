// Operator smoke test. Credentials stay in the ignored local file, never argv/logs.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const credentials=JSON.parse(await readFile('.local/cloud/preview-secrets.json','utf8'));
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const options={headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:process.env.FLOCK_PREVIEW_IP?[`--host-resolver-rules=MAP theflock.icet-lab.eu ${process.env.FLOCK_PREVIEW_IP}`]:[]};
const browser=await chromium.launch(options);
await mkdir('.local/cloud/screenshots',{recursive:true,mode:0o700});
const result={checkedAt:new Date().toISOString(),viewports:[],feeding:null};
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const context=await browser.newContext({viewport,httpCredentials:{username:credentials.previewUsername,password:credentials.previewPassword}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://theflock.icet-lab.eu',{waitUntil:'networkidle'});
  await expect(page.getByText('PROTECTED PREVIEW',{exact:true})).toBeVisible();
  await page.getByTestId('toggle-list').click();
  await page.getByTestId('place-20000000-0000-4000-8000-000000000001').click();
  await expect(page.getByTestId('activity-log')).toContainText('Alex');
  await page.getByTestId('demo-login').click();
  await page.getByTestId('persona-member').click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  if(viewport.width===390){
   const marker='Fictional cloud deployment verification '+randomUUID();
   result.feeding=await page.evaluate(async comment=>{
    const session=await (await fetch('/api/v1/session')).json();
    const response=await fetch('/api/v1/places/20000000-0000-4000-8000-000000000001/feedings',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken,'X-Flock-Contract':'community-care-v2','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({flockBand:'small',foodTypes:['seeds'],comment})});
    if(response.status!==201)throw new Error('Cloud write failed: '+response.status);
    return (await response.json()).feeding;
   },marker);
   await page.getByTestId('account-menu').click();await page.getByTestId('logout').click();
   await page.reload({waitUntil:'networkidle'});await page.getByTestId('toggle-list').click();await page.getByTestId('place-20000000-0000-4000-8000-000000000001').click();
   await expect(page.getByTestId('activity-log')).toContainText(marker);
  }
  const size=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth}));
  expect(size.page).toBeLessThanOrEqual(size.viewport+1);expect(errors).toEqual([]);
  await page.screenshot({path:`.local/cloud/screenshots/preview-${viewport.width}.png`,fullPage:true});
  result.viewports.push({width:viewport.width,overflow:false,pageErrors:errors});
  await context.close();
 }
 await writeFile('.local/cloud/preview-verification.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log('Authenticated HTTPS mobile/desktop checks passed; demo login, public history, write/read after logout, no page errors or horizontal overflow.');
 console.log('The exact fictional test record is recorded in .local/cloud/preview-verification.json for scoped cleanup.');
}finally{await browser.close();}
