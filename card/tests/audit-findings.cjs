const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine=process.env.ENGINE||'chromium';
const bundle = process.env.BUNDLE_PATH || path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || require('node:os').tmpdir();
let failSend = true;
let history = [];
let requests = 0;
let failHistory = false;
let sendDelay = 150;
let settingsDelay=0, settingsFail=false, settingsWrites=0, scheduleFail=true, failSettingsSave=false;
let releaseFirst=()=>{};let gateFirst=false;
let savedPatch=null;
const submittedSettings=[];
let people=[{name:'Alex',ha_user_id:'test',notify_targets:[]}];
const tasks=[{id:'one',description:'Evening reminder 中文 🙂',status:'scheduled',enabled:true,schedule_type:'once',run_at:'2027-01-01T08:00:00Z',timezone:'America/Denver',created_at:'2026-11-11T00:00:00Z',execution:{notification:{message:'Time for tea'}}}];

const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#16181d;color:#e9eaee}header.fixture{height:64px}backend-butler-card{display:block}</style><header class="fixture"></header><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
window.addEventListener('location-changed',event=>{if(event.detail?.replace!==false)throw new Error('HA navigation requires event detail')});
const card=document.querySelector('backend-butler-card');
card.setConfig({type:'custom:backend-butler-card',layout:'fullpage',music_entity:'media_player.music',entities:['light.audit',...Array.from({length:6},(_,i)=>'light.extra_'+i)]});
window.serviceCalls=[];window.failService=true;
card.hass=window.fixtureHass={states:{...Object.fromEntries(Array.from({length:6},(_,i)=>['light.extra_'+i,{entity_id:'light.extra_'+i,state:'on',attributes:{friendly_name:'Extra light '+i}}])),'light.audit':{entity_id:'light.audit',state:'on',attributes:{friendly_name:'Audit light'}},'media_player.music':{entity_id:'media_player.music',state:'playing',attributes:{media_title:'Audit track',volume_level:.25}}},user:{id:'test',name:'Test',is_admin:true},callService:async(domain,service,data)=>{window.serviceCalls.push({domain,service,data});await new Promise(r=>setTimeout(r,150));if(window.failService)throw new Error('Fixture service unavailable')},callWS:async()=>({}),callApi:async(method,path,body)=>{const r=await fetch('/api/'+path,{cache:'no-store',method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
</script>`;
const server = http.createServer(async(req,res)=>{
 if(req.url==='/card.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(bundle));}
 if(req.url.startsWith('/?') || req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.url.includes('/token')){res.statusCode=503;return res.end('{}');}
 if(req.url.includes('/chat/history') && failHistory){res.statusCode=503;return res.end('{}');}
 if(req.url.includes('/chat/history'))return res.end(JSON.stringify({items:history,busy:false}));
 if(req.url.endsWith('/backend_butler/chat') && req.method==='POST'){
   requests++;
   let body='';for await(const chunk of req)body+=chunk;
   await new Promise(r=>setTimeout(r,sendDelay));
   if(failSend){res.statusCode=503;return res.end('{}');}
   history.push({kind:'message',id:'user-'+requests,role:'user',text:JSON.parse(body).text,ts:Date.now()});
   return res.end('{"ok":true}');
 }
 if(req.url.includes('/chat/approvals'))return res.end('{"items":[]}');
 if(req.url.includes('/chat/delete')){res.statusCode=503;return res.end('{}');}
 if(req.url.includes('/chat/conversations'))return res.end(JSON.stringify({current:'current',conversations:[{id:'past',title:'Past conversation',updated:Date.now()}]}));
 if(req.url.includes('/tasks/') && req.method==='PATCH'){let raw='';for await(const chunk of req)raw+=chunk;savedPatch=JSON.parse(raw);return res.end('{}');}
 if(req.url.includes('/tasks/')){await new Promise(r=>setTimeout(r,200));if(scheduleFail){res.statusCode=503;return res.end('{}');}return res.end('{}');}
 if(req.url.includes('/tasks'))return res.end(JSON.stringify(tasks));
 if(req.url.includes('/settings')){
 if(req.method==='PUT'){const write=++settingsWrites;let raw='';for await(const chunk of req)raw+=chunk;submittedSettings.push(JSON.parse(raw));if(write===1&&gateFirst)await new Promise(resolve=>releaseFirst=resolve);else await new Promise(r=>setTimeout(r,150));if(failSettingsSave){res.statusCode=503;return res.end('{}');}people=JSON.parse(raw).users.map(p=>({...p,id:p.id||p.name.toLowerCase(),servers:p.servers||[]}));return res.end(JSON.stringify({users:people}));}
 await new Promise(r=>setTimeout(r,settingsDelay));if(settingsFail){res.statusCode=503;return res.end('{}');}
 return res.end(JSON.stringify({users:people,servers:[]}));
 }
 return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8766,'127.0.0.1',r));
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
 const checks=[];
 const openPage=async(zone='America/New_York')=>{
 const context=await browser.newContext({timezoneId:zone});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:8766');await page.getByRole('tab',{name:'Chat',exact:true}).waitFor();return {context,page,errors};
 };
 try {
 if(!process.env.CASE||process.env.CASE==='timezone'){
 const {context,page,errors}=await openPage();
 const edit=async()=>{await page.getByRole('tab',{name:'Schedules',exact:true}).click();await page.locator('.lk-taskrow-main').first().click();await page.getByRole('dialog').waitFor();};
 await edit();await page.getByLabel('Description',{exact:true}).fill('Only rename, preserve the instant');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(savedPatch.schedule,undefined,'renaming must not rewrite the schedule in another timezone');
 await edit();await page.getByText('Times shown in America/New_York.',{exact:true}).waitFor();
 await page.locator('.lk-editor-panel').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'findings-'+engine+'-timezone-editor.png'),fullPage:true});
 await page.getByLabel('Date and time',{exact:true}).fill('2027-01-01T04:00');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(Date.parse(savedPatch.schedule.run_at),Date.parse('2027-01-01T09:00:00Z'));assert.equal(savedPatch.schedule.timezone,'America/Denver');
 await edit();const before=savedPatch;await page.getByLabel('Date and time',{exact:true}).fill('2027-03-14T02:30');await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'does not exist'}).waitFor();assert.equal(savedPatch,before,'nonexistent DST time must not submit');
 await page.getByLabel('Date and time',{exact:true}).fill('2027-03-14T03:30');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(Date.parse(savedPatch.schedule.run_at),Date.parse('2027-03-14T07:30:00Z'));
 tasks[0]={...tasks[0],run_at:'2027-11-07T06:30:00Z'};await page.getByRole('button',{name:'Refresh',exact:true}).click();await edit();await page.getByLabel('Description',{exact:true}).fill('Preserve the later repeated hour');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(savedPatch.schedule,undefined,'unchanged repeated DST instant remains untouched');
 tasks[0]={...tasks[0],schedule_type:'recurring',cron:'0 8 * * *'};await page.getByRole('button',{name:'Refresh',exact:true}).click();await edit();await page.getByText('Recurring times use America/Denver.',{exact:true}).waitFor();await page.getByLabel('Cron expression',{exact:true}).fill('0 9 * * *');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.deepEqual(savedPatch.schedule,{type:'recurring',cron:'0 9 * * *',timezone:'America/Denver'});
 assert.deepEqual(errors,[]);await context.close();checks.push('offset-aware edits, unchanged instants, DST gap/repetition and recurring timezone');
 }
 if(!process.env.CASE||process.env.CASE==='settings'){
 people=[{name:'Alex',ha_user_id:'test',notify_targets:[]}];settingsWrites=0;gateFirst=true;
 const {context,page,errors}=await openPage();await page.getByRole('tab',{name:'Settings',exact:true}).click();await page.getByText('Alex',{exact:true}).waitFor();
 const name=page.getByRole('textbox',{name:"New person's name"});await name.fill('Mia');await page.getByRole('button',{name:'Add',exact:true}).click();
 for(let n=0;settingsWrites===0&&n<100;n++)await new Promise(r=>setTimeout(r,10));assert.equal(settingsWrites,1);
 await page.getByRole('tab',{name:'Chat',exact:true}).click();await page.getByRole('tab',{name:'Settings',exact:true}).click();
 await page.getByText('Loading notification settings…',{exact:true}).waitFor({state:'hidden'});
 assert.equal(await name.isDisabled(),true,'pending save must survive navigation');assert.equal(settingsWrites,1);
 releaseFirst();await page.waitForFunction(()=>!document.querySelector('backend-butler-card').shadowRoot.querySelector('.lk-settings-fields').disabled);
 await name.fill('Noah');await page.getByRole('button',{name:'Add',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('backend-butler-card').shadowRoot.querySelector('.lk-settings-fields').disabled);
 assert.equal(submittedSettings[1].users.find(p=>p.name==='Mia').id,'mia','next save must retain server-normalized identity');assert.deepEqual(people.map(p=>p.name),['Alex','Mia','Noah']);assert.deepEqual(await page.locator('.lk-person-name').allTextContents(),['Alex','Mia','Noah']);
 failSettingsSave=true;await name.fill('Eve');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('tab',{name:'Chat',exact:true}).click();await page.getByRole('tab',{name:'Settings',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not save'}).waitFor();assert.equal(await name.inputValue(),'Eve');assert.equal(await page.getByText('Eve',{exact:true}).count(),0);failSettingsSave=false;
 assert.deepEqual(errors,[]);await context.close();checks.push('Settings save ownership and failure/draft recovery across navigation');
 }
 if(!process.env.CASE||process.env.CASE==='tabs'){
 const {context,page,errors}=await openPage();
 for(const label of ['Chat','Voice','Schedules','Settings']){
 const tab=page.getByRole('tab',{name:label,exact:true});await tab.click();
 const association=await tab.evaluate(el=>{const panel=el.getRootNode().getElementById(el.getAttribute('aria-controls'));return {tabId:el.id,role:panel?.getAttribute('role'),label:panel?.getAttribute('aria-labelledby'),hidden:panel?.hidden};});
 assert.ok(association.tabId);assert.equal(association.role,'tabpanel');assert.equal(association.label,association.tabId);assert.equal(association.hidden,false);
 assert.equal(await page.getByRole('tabpanel').count(),1);
 }
 const active=page.getByRole('tab',{name:'Settings',exact:true});await active.focus();await page.keyboard.press('Tab');assert.equal(await page.getByRole('tabpanel').evaluate(el=>el.getRootNode().activeElement===el),true,'Tab enters the named panel');
 await active.focus();await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'Chat',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Voice',exact:true}).getAttribute('aria-selected'),'true');
 assert.deepEqual(errors,[]);await context.close();checks.push('tab/panel associations and keyboard entry/navigation');
 }
 if(!process.env.CASE||process.env.CASE==='services'){
 const {context,page,errors}=await openPage();await page.getByRole('button',{name:'Pause',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Pause',exact:true}).isDisabled(),true);
 await page.getByRole('alert').filter({hasText:'Could not control this player'}).waitFor();assert.deepEqual(errors,[]);
 await page.setViewportSize({width:320,height:568});
 await page.waitForTimeout(200);
 await page.waitForFunction(()=>{const root=document.querySelector('backend-butler-card').shadowRoot;return root.querySelector('.lk-music .lk-service-error button').getBoundingClientRect().bottom<=root.querySelector('.lk-dock').getBoundingClientRect().top;},null,{timeout:3000});
 await page.screenshot({path:path.join(artifacts,'findings-'+engine+'-media-error.png'),fullPage:true});
 await page.evaluate(()=>window.failService=false);await page.getByRole('button',{name:'Retry player action',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not control this player'}).waitFor({state:'hidden'});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.serviceCalls.filter(c=>c.service==='media_pause').length),2);
 await page.evaluate(()=>window.failService=true);await page.locator('.lk-tile').first().click();await page.getByRole('alert').filter({hasText:'Could not change this device'}).waitFor();
 await page.getByRole('alert').filter({hasText:'Could not change this device'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'findings-'+engine+'-device-error.png'),fullPage:true});
 const rail=page.locator('.lk-tiles');await rail.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(100);const away=await rail.evaluate(el=>el.scrollLeft);
 await page.setViewportSize({width:340,height:568});await page.waitForTimeout(150);assert.ok(await rail.evaluate(el=>el.scrollLeft)>=away-25,'resizing must not pull the rail back to an offscreen failed tile');await page.evaluate(()=>window.failService=false);await page.getByRole('button',{name:'Retry device action',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not change this device'}).waitFor({state:'hidden'});assert.deepEqual(errors,[]);await context.close();checks.push('handled media/device failures, disabled pending controls and retry');
 }
 console.log(JSON.stringify({engine,result:'PASS',checks}));
 } finally {releaseFirst();await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
