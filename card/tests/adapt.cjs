const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine = process.env.ENGINE || 'chromium';
const bundle = path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || require('node:os').tmpdir();
let failSend = true;
let history = [];
let requests = 0;
let failHistory = false;
let sendDelay = 150;
let settingsDelay=0, settingsFail=false, settingsWrites=0, scheduleFail=true, failSettingsSave=true;
let people=[{name:'Alex',ha_user_id:'test',notify_targets:[]}];
const tasks=[{id:'one',description:'Evening reminder 中文 🙂',status:'scheduled',enabled:true,schedule_type:'once',run_at:'2027-01-01T08:00:00Z',timezone:'America/Denver',created_at:'2026-11-11T00:00:00Z',execution:{notification:{message:'Time for tea'}}}];

const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#16181d;color:#e9eaee}header.fixture{height:64px}backend-butler-card{display:block}</style><header class="fixture"></header><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
window.addEventListener('location-changed',event=>{if(event.detail?.replace!==false)throw new Error('HA navigation requires event detail')});
const card=document.querySelector('backend-butler-card');
card.setConfig({type:'custom:backend-butler-card',layout:'fullpage',areas:['room'],music_entity:'media_player.music'});
window.serviceCalls=[];window.moreInfo=0;card.addEventListener('hass-more-info',()=>window.moreInfo++);
card.hass=window.fixtureHass={states:{...Object.fromEntries(Array.from({length:10},(_,i)=>['light.fixture_'+i,{entity_id:'light.fixture_'+i,state:'on',attributes:{friendly_name:'Living room light '+i}}])),
'media_player.music':{entity_id:'media_player.music',state:'playing',attributes:{friendly_name:'Music',media_title:'A very long track title that should stay readable',media_artist:'An artist with a long name',volume_level:0.25}}},entities:Object.fromEntries(Array.from({length:10},(_,i)=>['light.fixture_'+i,{area_id:'room'}])),areas:{room:{name:'room'}},user:{id:'test',name:'Test',is_admin:true},callService:async(domain,service,data)=>{window.serviceCalls.push({domain,service,data})},callWS:async()=>({}),callApi:async(method,path,body)=>{const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
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
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
 const context=await browser.newContext({hasTouch:true});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try {
 await page.setViewportSize({width:320,height:568});await page.goto('http://127.0.0.1:8766');
 await page.getByRole('tab',{name:'Chat',exact:true}).waitFor();
 await page.locator('.lk-tile').first().waitFor();
 assert.equal(await page.locator('.lk-convo').evaluate(e=>e.scrollTop),0,'new empty chat starts at the top of its content');
 const checkTargets=async()=>{
 const small=await page.locator('backend-butler-card').evaluate(h=>[...h.shadowRoot.querySelectorAll('button,summary,input[type="range"]')].filter(e=>e.getBoundingClientRect().width>0).filter(e=>e.getBoundingClientRect().width<43.5||e.getBoundingClientRect().height<43.5).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
 assert.deepEqual(small,[],'interactive controls need 44px targets');
 };
 const checkTabs=async()=>{
 const tabs=await page.locator('[role="tab"]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {name:e.textContent.trim(),fits:b.left>=p.left-1&&b.right<=p.right+1&&b.top>=p.top-1&&b.bottom<=p.bottom+1};}));
 assert.ok(tabs.every(t=>t.fits),'all tabs must remain inside visible navigation: '+JSON.stringify(tabs));
 };
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1440,900],[2560,1440],[3840,2160]]){
 await page.setViewportSize({width,height});
 const headerPositions=[];
 for(const tab of ['Chat','Voice','Schedules','Settings']){
 await page.getByRole('tab',{name:tab,exact:true}).click();await page.waitForTimeout(120);
 await checkTargets();await checkTabs();
 headerPositions.push(await page.locator('.lk-tabs').evaluate(el=>Math.round(el.getBoundingClientRect().top)));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(tab==='Chat'||tab==='Voice'){
 const dock=await page.locator('.lk-dock').boundingBox(),convo=await page.locator('.lk-convo').boundingBox();
 assert.ok(dock.y+dock.height<=height+2,'composer stays on screen');assert.ok(convo.height>=48,'home controls leave room for transcript '+JSON.stringify({width,height,tab,convo,dock}));
 }
 await page.screenshot({path:path.join(artifacts,'adapt-'+engine+'-'+tab.toLowerCase()+'-'+width+'.png'),fullPage:true});
 }
 assert.equal(new Set(headerPositions).size,1,'title/header height must match across all four tabs at width '+width+': '+headerPositions);
 }
 assert.ok(await page.locator('.lk-set-sec').evaluateAll(sections=>sections.every(section=>section.getBoundingClientRect().width<=840)),'desktop Settings sections need a readable content width');
 await page.setViewportSize({width:320,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
 for(const tab of ['Chat','Voice','Schedules','Settings']){await page.getByRole('tab',{name:tab,exact:true}).click();await checkTabs();await page.screenshot({path:path.join(artifacts,'adapt-'+engine+'-text200-'+tab.toLowerCase()+'.png'),fullPage:true});}
 await page.evaluate(()=>document.documentElement.style.fontSize='16px');
 await page.setViewportSize({width:1200,height:900});
 await page.evaluate(()=>{const c=document.querySelector('backend-butler-card');c.style.width='320px';c.setConfig({type:'custom:backend-butler-card',layout:'card',height:600,areas:['room'],music_entity:'media_player.music'});});
 await page.getByRole('tab',{name:'Voice',exact:true}).click();await checkTargets();await checkTabs();
 await page.evaluate(()=>{const c=document.querySelector('backend-butler-card');c.style.width='';c.setConfig({type:'custom:backend-butler-card',layout:'fullpage',areas:['room'],music_entity:'media_player.music'});});
 await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Chat',exact:true}).click();
 if(engine==='webkit'){assert.deepEqual(errors,[]);console.log('PASS: WebKit responsive layout, 44px controls, enlarged text and narrow embedded card');return;}
 await page.getByRole('button',{name:'Conversations',exact:true}).click();
 await page.getByRole('slider',{name:'Volume',exact:true}).waitFor();await checkTargets();
 await page.getByRole('button',{name:'Back to the conversation',exact:true}).click();
 const cdp=await context.newCDPSession(page);
 const swipe=async(x1,y1,x2,y2,cancel=false)=>{
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});
 for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/8,y:y1+(y2-y1)*i/8}]});await page.waitForTimeout(25);}
 await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
 };
 const rail=page.locator('.lk-tiles');await rail.scrollIntoViewIfNeeded();const r=await rail.boundingBox();
 const before=await page.evaluate(()=>window.serviceCalls.length);
 await swipe(r.x+r.width-35,r.y+30,r.x+35,r.y+30);
 assert.ok(await rail.evaluate(e=>e.scrollLeft>20),'horizontal device swipe must scroll');
 assert.equal(await page.evaluate(()=>window.serviceCalls.length),before,'swipe must not toggle devices');
 await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.moreInfo),0,'swipe must not trigger long press');
 const railPosition=await rail.boundingBox();const scrollBefore=await page.locator('.lk-convo').evaluate(e=>e.scrollTop);
 await swipe(railPosition.x+80,railPosition.y+60,railPosition.x+80,railPosition.y+5);
 assert.ok(await page.locator('.lk-convo').evaluate(e=>e.scrollTop)>scrollBefore,'vertical swipe over devices scrolls the conversation');
 assert.equal(await page.evaluate(()=>window.serviceCalls.length),before,'vertical scroll must not toggle a device');
 await rail.scrollIntoViewIfNeeded();
 await rail.evaluate(e=>e.scrollLeft=0);const tile=page.locator('.lk-tile').first();await tile.tap();
 assert.equal(await page.evaluate(()=>window.serviceCalls.filter(c=>c.service==='toggle').length),1,'touch tap toggles exactly once');
 const t=await tile.boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x+25,y:t.y+25}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.moreInfo),0,'cancelled touch must cancel long press');
 await page.locator('.lk-convo').evaluate(e=>e.scrollTop=0);const slider=page.getByRole('slider',{name:'Volume'});const v=await slider.boundingBox();
 await swipe(v.x+v.width*.25,v.y+v.height/2,v.x+v.width*.8,v.y+v.height/2);
 assert.ok(await page.evaluate(()=>window.serviceCalls.some(c=>c.service==='volume_set'&&c.data.volume_level>.5)),'touch drag commits volume');
 await swipe(v.x+v.width*.25,v.y+v.height/2,v.x+v.width*.7,v.y+v.height/2,true);
 assert.equal(await slider.inputValue(),'25','cancelled volume drag returns to reported state');
 await slider.focus();await slider.press('ArrowRight');
 assert.ok(await page.evaluate(()=>window.serviceCalls.some(c=>c.service==='volume_set'&&c.data.volume_level===.26)),'keyboard volume adjustment commits');
 await slider.tap();assert.ok(await page.evaluate(()=>window.serviceCalls.filter(c=>c.service==='volume_set').length>=2),'next volume tap still works');
 await rail.scrollIntoViewIfNeeded();await rail.evaluate(e=>e.scrollLeft=0);await tile.scrollIntoViewIfNeeded();
 const hold=await tile.boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:hold.x+25,y:hold.y+25}]});await page.waitForTimeout(650);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.moreInfo),1,'long press opens device details exactly once');
 await tile.tap();assert.equal(await page.evaluate(()=>window.serviceCalls.filter(c=>c.service==='toggle').length),2,'next tap after long press works');
 assert.deepEqual(errors,[]);console.log('PASS: 44px controls, all tabs visible, populated short screens, bounded desktop Settings, narrow embedded card, 200% text, synthesized Chromium touch device scroll/tap/cancel and volume drag/cancel/recovery');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
