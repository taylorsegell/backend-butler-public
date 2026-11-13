const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const bundle = path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || require('node:os').tmpdir();
let failSend = true;
let history = [];
let requests = 0;
let failHistory = false;
let sendDelay = 150;
let settingsDelay=500, settingsFail=false, settingsWrites=0, scheduleFail=true, failSettingsSave=true;
let people=[{name:'Alex',ha_user_id:'test',notify_targets:[]}];
const tasks=[{id:'one',description:'Evening reminder 中文 🙂',status:'scheduled',enabled:true,schedule_type:'once',run_at:'2027-01-01T08:00:00Z',timezone:'America/Denver',created_at:'2026-11-11T00:00:00Z',execution:{notification:{message:'Time for tea'}}}];

const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#16181d;color:#e9eaee}header.fixture{height:64px}backend-butler-card{display:block}</style><header class="fixture"></header><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
window.addEventListener('location-changed',event=>{if(event.detail?.replace!==false)throw new Error('HA navigation requires event detail')});
const card=document.querySelector('backend-butler-card');
card.setConfig({type:'custom:backend-butler-card',layout:'fullpage'});
card.hass=window.fixtureHass={states:{},user:{id:'test',name:'Test',is_admin:true},callService:async()=>{},callWS:async()=>({}),callApi:async(method,path,body)=>{const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
</script>`;
const server = http.createServer(async(req,res)=>{
 if(req.url==='/card.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(bundle));}
 if(req.url.startsWith('/?') || req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 res.setHeader('Content-Type','application/json');
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
 if(req.url.includes('/tasks/')){await new Promise(r=>setTimeout(r,200));if(scheduleFail){res.statusCode=503;return res.end('{}');}return res.end('{}');}
 if(req.url.includes('/tasks'))return res.end(JSON.stringify(tasks));
 if(req.url.includes('/settings')){
 if(req.method==='PUT'){settingsWrites++;let raw='';for await(const chunk of req)raw+=chunk;await new Promise(r=>setTimeout(r,300));if(failSettingsSave){res.statusCode=503;return res.end('{}');}people=JSON.parse(raw).users;return res.end('{}');}
 await new Promise(r=>setTimeout(r,settingsDelay));if(settingsFail){res.statusCode=503;return res.end('{}');}
 return res.end(JSON.stringify({users:people,servers:[]}));
 }
 return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8766,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try {
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8766');
 await page.getByRole('tab',{name:'Settings',exact:true}).click();
 const name=page.getByRole('textbox',{name:"New person's name"});
 assert.equal(await name.isDisabled(),true,'settings edits must wait for loaded people');
 await page.evaluate(()=>{const card=document.querySelector('backend-butler-card');card.hass={...window.fixtureHass};});
 await page.getByText('Alex',{exact:true}).waitFor();await name.fill('Mia 中文 🙂');await page.getByRole('button',{name:'Add',exact:true}).click();
 assert.equal(await name.isDisabled(),true,'settings controls must be locked during save');
 await page.getByRole('alert').filter({hasText:'Could not save'}).waitFor();
 assert.equal(await name.inputValue(),'Mia 中文 🙂','failed add preserves name for retry');
 assert.equal(settingsWrites,1);assert.equal(await page.getByText('Alex',{exact:true}).count(),1);
 assert.equal(await page.getByText('Mia 中文 🙂',{exact:true}).count(),0,'failed save rolls back');
 failSettingsSave=false;await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.getByText('Mia 中文 🙂',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('backend-butler-card').shadowRoot.querySelector('.lk-person-add input').value==='');
 assert.equal(settingsWrites,2,'retry saves the retained name');
 settingsFail=true;await page.reload();await page.getByRole('tab',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Retry loading settings',exact:true}).waitFor();assert.equal(await name.isDisabled(),true);
 settingsFail=false;settingsDelay=0;await page.getByRole('button',{name:'Retry loading settings',exact:true}).click();await page.getByText('Alex',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Schedules',exact:true}).click();
 await page.getByRole('button',{name:'Pause schedule',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Pause schedule',exact:true}).isDisabled(),true);
 await page.getByRole('alert').filter({hasText:'Could not pause'}).waitFor();
 await page.getByRole('button',{name:'Delete schedule',exact:true}).click();
 await page.getByRole('button',{name:'Confirm delete schedule',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Could not delete this schedule'}).waitFor();
 const row=page.locator('.lk-taskrow-main');await row.click();
 const dialog=page.getByRole('dialog',{name:'Edit schedule',exact:true});await dialog.waitFor();
 await page.getByRole('textbox',{name:'Description',exact:true}).waitFor();
 assert.equal(await dialog.evaluate(el=>el.getRootNode().activeElement?.getAttribute('aria-label')==='Description'||el.contains(el.getRootNode().activeElement)),true,'dialog takes focus');
 await page.getByRole('textbox',{name:'Description',exact:true}).fill('');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('alert').filter({hasText:'Enter a description'}).waitFor();
 await page.getByRole('textbox',{name:'Description',exact:true}).fill('Evening reminder 中文 🙂');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.keyboard.press('Escape');
 assert.equal(await dialog.isVisible(),true,'pending save must not dismiss editor');
 await page.getByRole('alert').filter({hasText:'Save failed'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Description',exact:true}).inputValue(),'Evening reminder 中文 🙂');
 await page.getByLabel('Date and time',{exact:true}).waitFor();await page.getByLabel('Reminder text',{exact:true}).waitFor();
 await page.keyboard.press('Shift+Tab');assert.equal(await dialog.evaluate(el=>el.contains(el.getRootNode().activeElement)),true,'focus remains in modal');
 for(const [width,height] of [[1200,900],[390,844],[320,420]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(100);
 assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'modal must fit narrow viewport');
 await page.screenshot({path:path.join(artifacts,'harden-dialog-'+width+'.png'),fullPage:true});
 }
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelector('backend-butler-card').shadowRoot.activeElement?.classList.contains('lk-taskrow-main'),{},{timeout:3000});
 assert.equal(await row.evaluate(el=>el.getRootNode().activeElement===el),true,'closing restores row focus');
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 await page.getByRole('button',{name:'Conversations',exact:true}).click();
 await page.getByRole('button',{name:'Delete conversation',exact:true}).click();
 await page.getByRole('button',{name:'Confirm delete conversation',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Could not delete the conversation'}).waitFor();
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Could not delete the conversation'}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: settings load/save/retry/rollback; schedule failure/pending; modal focus, labels, Escape, narrow viewports; zero page errors');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
