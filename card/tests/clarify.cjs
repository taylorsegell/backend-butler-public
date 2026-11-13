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
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#16181d;color:#e9eaee}header.fixture{height:64px}backend-butler-card{display:block}</style><header class="fixture"></header><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
window.addEventListener('location-changed',event=>{if(event.detail?.replace!==false)throw new Error('HA navigation requires event detail')});
const card=document.querySelector('backend-butler-card');
card.setConfig({type:'custom:backend-butler-card',layout:'fullpage'});
card.hass={states:{},user:{id:'test',name:'Test',is_admin:true},callService:async()=>{},callWS:async()=>({}),callApi:async(method,path,body)=>{const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
</script>`;
const server = http.createServer(async(req,res)=>{
 if(req.url==='/card.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(bundle));}
 if(req.url.startsWith('/?') || req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 res.setHeader('Content-Type','application/json');
 if(req.url.includes('/token')){res.statusCode=503;return res.end('{}');}
 if(req.url.includes('/chat/history') && failHistory){res.statusCode=503;return res.end('{}');}
 if(req.url.includes('/chat/history'))return res.end(JSON.stringify({items:history,busy:false,usage:{input:61400,cached:44400,output:293}}));
 if(req.url.endsWith('/backend_butler/chat') && req.method==='POST'){
   requests++;
   let body='';for await(const chunk of req)body+=chunk;
   await new Promise(r=>setTimeout(r,sendDelay));
   if(failSend){res.statusCode=503;return res.end('{}');}
   history.push({kind:'message',id:'user-'+requests,role:'user',text:JSON.parse(body).text,ts:Date.now()});
   return res.end('{"ok":true}');
 }
 if(req.url.includes('/chat/approvals'))return res.end('{"items":[]}');
 if(req.url.includes('/chat/conversations'))return res.end('{"conversations":[]}');
 if(req.url.includes('/tasks'))return res.end('{"tasks":[]}');
 if(req.url.includes('/settings'))return res.end('{"users":[],"servers":[]}');
 return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8766,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try {
 await page.goto('http://127.0.0.1:8766');
 await page.locator('.lk-usage').waitFor();
 assert.match(await page.locator('.lk-usage').innerText(), /^Tokens · .* in · .* out$/);
 assert.match(await page.locator('.lk-usage').getAttribute('aria-label'), /cached/);
 assert.equal(await page.locator('.lk-usage-details').count(),0,'token summary has no expanding layout');
 await page.getByRole('tab',{name:'Schedules',exact:true}).click();
 await page.getByRole('button',{name:'Plan a task in Chat',exact:true}).click();
 assert.equal(await page.getByRole('tab',{name:'Chat',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.getByRole('textbox',{name:'Message Backend Butler'}).inputValue(),'Remind me to take out the bins tomorrow at 7 PM.');
 assert.equal(requests,0,'schedule starter must draft, not execute');
 await page.getByRole('textbox',{name:'Message Backend Butler'}).fill('Keep my existing draft');
 await page.getByRole('tab',{name:'Schedules',exact:true}).click();
 await page.getByRole('button',{name:'Plan a task in Chat',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Message Backend Butler'}).inputValue(),'Keep my existing draft');
 await page.getByRole('tab',{name:'Voice',exact:true}).click();
 await page.getByRole('heading',{name:'Ready to talk?',exact:true}).waitFor();
 await page.getByRole('button',{name:'Start talking',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Send',exact:true}).count(),0,'idle Voice must expose microphone instead of text send');
 await page.getByText('Live session · Separate from saved Chat',{exact:true}).waitFor();
 for(const [width,height] of [[1200,900],[390,844],[320,568]]){
 await page.setViewportSize({width,height});
 for(const tab of ['Chat','Voice','Schedules','Settings']){
 await page.getByRole('tab',{name:tab,exact:true}).click();await page.waitForTimeout(120);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page copy must fit viewport');
 await page.screenshot({path:path.join(artifacts,'clarify-'+tab.toLowerCase()+'-'+width+'.png'),fullPage:true});
 }
 }
 await page.getByLabel("New person's name",{exact:true}).waitFor();
 assert.equal(await page.getByLabel("New person's name",{exact:true}).evaluate(el=>el.labels.length>0),true,'person field needs a persistent label');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 for(const tab of ['Chat','Voice','Schedules','Settings']){
 await page.getByRole('tab',{name:tab,exact:true}).click();await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'copy fits at 200% text size');
 }
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 history=[{kind:'action',id:'context',name:'homeassistant_get_live_context',args:{},status:'done',ts:Date.now()},
 {kind:'action',id:'light',name:'light_HassLightSet',args:{},status:'error',output:'Fixture error',ts:Date.now()+1}];
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Check home status',{exact:true}).waitFor();await page.getByText('Set light',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: distinct Chat/Voice copy and microphone action; schedule starter drafts in Chat without sending; persistent person label; all four pages at desktop/mobile and 200% text size; zero page errors');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
