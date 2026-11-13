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
 if(req.url.includes('/chat/conversations'))return res.end('{"conversations":[]}');
 if(req.url.includes('/tasks'))return res.end('{"tasks":[]}');
 if(req.url.includes('/settings'))return res.end('{"users":[],"servers":[]}');
 return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8766,'0.0.0.0',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewportSize({width:1200,height:1500});
 await page.goto('http://127.0.0.1:8766');
 const input=page.getByRole('textbox',{name:'Message Backend Butler'});
 await input.waitFor();
 const assertLayout=async()=>{
  const box=await page.locator('backend-butler-card ha-card').boundingBox();
  const dock=await page.locator('.lk-dock').boundingBox();
  const viewport=page.viewportSize();
  assert.ok(Math.abs(box.y+box.height-viewport.height)<=3,'chat must fill available page height');
  assert.ok(Math.abs(dock.y+dock.height-viewport.height)<=20,'composer must stay at page bottom');
  assert.ok(dock.x>=0 && dock.x+dock.width<=viewport.width+1,'composer must fit width');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'page should not scroll behind chat');
 };
 await assertLayout();
 if(process.env.LAYOUT_ONLY==='1'){
  for(const [width,height] of [[768,1024],[390,844],[390,420]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(150);await assertLayout();
  }
  console.log('PASS: full-height layout at desktop, tablet, mobile and short viewports');
  await browser.close();server.close();return;
 }
 assert.equal(await page.getByRole('tab',{name:'Chat',exact:true}).getAttribute('aria-selected'),'true');
 for(const [width,height] of [[1200,1500],[390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);
  await page.screenshot({path:path.join(artifacts,'chat-empty-'+width+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1200,height:1500});
 await page.getByRole('button',{name:'Which lights are on?',exact:true}).click();
 assert.equal(await input.inputValue(),'Which lights are on?');
 assert.equal(requests,0,'starter prompt should draft, not execute');
 const draft='Test draft — 中文 🙂';await input.fill(draft);await input.press('Enter');await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Retry message',exact:true}).waitFor();
 assert.equal(await input.inputValue(),draft,'failed saved send preserves draft');
 assert.equal(requests,1);
 await page.screenshot({path:path.join(artifacts,'chat-send-error.png'),fullPage:true});
 await page.getByRole('button',{name:'Connection settings',exact:true}).click();
 assert.ok(page.url().endsWith('/config/integrations/integration/backend_butler'),'connection settings must open the integration');
 await page.goBack();
 await page.getByRole('tab',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 assert.equal(await input.inputValue(),draft,'draft survives opening settings');
 await page.waitForTimeout(5200);
 assert.equal(await page.getByRole('button',{name:'Retry message',exact:true}).count(),1,'polling must not erase send failure');
 failSend=false;await page.getByRole('button',{name:'Retry message',exact:true}).click();
 await page.locator('.lk-bubble').filter({hasText:draft}).waitFor();
 await page.waitForFunction(()=>document.querySelector('backend-butler-card').shadowRoot.querySelector('textarea').value==='');
 assert.equal(await input.inputValue(),'');assert.equal(requests,2);
 // A late successful send must not clear a new draft written after changing tabs.
 sendDelay=800;await input.fill('Accepted request');await input.press('Enter');
 await page.getByRole('tab',{name:'Settings',exact:true}).click();
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 await input.fill('New draft while earlier request finishes');
 await page.waitForTimeout(1000);
 assert.equal(await input.inputValue(),'New draft while earlier request finishes');
 sendDelay=150;
 failHistory=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Chat is unavailable',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Retry message',exact:true}).count(),0,'history failure must not claim draft was sent');
 failHistory=false;await page.getByRole('button',{name:'Retry connection',exact:true}).click();
 await page.getByRole('tab',{name:'Voice',exact:true}).click();
 await input.fill('Keep my voice-session draft');await input.press('Enter');
 await page.getByRole('button',{name:'Retry message',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'Keep my voice-session draft','failed voice connect preserves draft');
 await page.screenshot({path:path.join(artifacts,'voice-connect-error.png'),fullPage:true});
 await page.setViewportSize({width:390,height:420});await page.waitForTimeout(150);await assertLayout();
 assert.equal(await input.isVisible(),true);
 await page.setViewportSize({width:1200,height:1500});
 await page.getByRole('button',{name:'Retry message',exact:true}).click();
 await page.getByRole('button',{name:'Retry message',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'Keep my voice-session draft');
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 history=Array.from({length:40},(_,i)=>({kind:'message',id:'long-'+i,role:i%2?'agent':'user',text:'Message '+i+' '+('A readable home status update. '.repeat(12)),ts:Date.now()+i}));
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText(/^Message 39 /).waitFor();
 for(const [width,height] of [[1200,1500],[768,1024],[390,844],[390,420]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);await assertLayout();
  const convo=page.locator('.lk-convo');
  assert.equal(await convo.evaluate(e=>e.scrollHeight>e.clientHeight),true,'only transcript should scroll');
  await convo.evaluate(e=>e.scrollTop=e.scrollHeight);
  const tail=await page.getByText(/^Message 39 /).boundingBox();const dock=await page.locator('.lk-dock').boundingBox();
  assert.ok(tail.y+tail.height<=dock.y+2,'latest message must clear composer');
  await page.screenshot({path:path.join(artifacts,'chat-workspace-'+width+'x'+height+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1024,height:900});
 await page.evaluate(()=>{const c=document.querySelector('backend-butler-card');c.setConfig({type:'custom:backend-butler-card',layout:'card',height:480})});
 assert.ok((await page.locator('backend-butler-card ha-card').boundingBox()).height<=480,'embedded card height remains supported');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks:['fullpage','default saved chat','starter drafts','saved draft retry','voice draft retry','settings preserves draft','sticky send error','desktop','tablet','mobile','short viewport','long transcript','embedded card','zero page errors']}));
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
