const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine=process.env.ENGINE||'chromium';
const bundle = path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || require('node:os').tmpdir();
let failSend = true;
let history=[{kind:'message',id:'example',role:'user',text:'Which whole lights are on?',ts:Date.now()}];
let requests = 0;
let failHistory = false;
let sendDelay = 150;
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#16181d;color:#e9eaee}header.fixture{height:64px}backend-butler-card{display:block}</style><header class="fixture"></header><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
window.addEventListener('location-changed',event=>{if(event.detail?.replace!==false)throw new Error('HA navigation requires event detail')});
const card=document.querySelector('backend-butler-card');
const names={'light.light_bar':'Light bar','light.light_bar_segment_1':'Light bar Segment 1','light.light_bar_segment_10':'Light bar Segment 10','light.monitor_lights':'Monitor lights','light.monitor_lights_segment_13':'Monitor lights Segment 13','light.corner_light':'Corner light','vacuum.sucka':'Sucka'};
card.setConfig({type:'custom:backend-butler-card',layout:'fullpage',entities:Object.keys(names)});
document.body.style.setProperty('--primary-color','#ffa000');
card.hass={states:Object.fromEntries(Object.entries(names).map(([id,name])=>[id,{entity_id:id,state:id.startsWith('vacuum.')?'cleaning':'on',attributes:{friendly_name:name}}])),entities:{},user:{id:'test',name:'Test',is_admin:true},callService:async()=>{},callWS:async()=>({}),callApi:async(method,path,body)=>{if(path.includes('/token'))throw {status_code:503};const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
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
 if(req.url.includes('/settings')){res.statusCode=503;return res.end('{}');}
 return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8766,'127.0.0.1',r));
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const accent=()=>page.locator('backend-butler-card').evaluate(h=>getComputedStyle(h).getPropertyValue('--lk-accent').trim().toUpperCase());
 const waitAccent=async(value)=>page.waitForFunction(v=>getComputedStyle(document.querySelector('backend-butler-card')).getPropertyValue('--lk-accent').trim().toUpperCase()===v,value.toUpperCase());
 try {
 await page.goto('http://127.0.0.1:8766');await page.locator('.lk-tile').first().waitFor();
 const titles=await page.locator('.lk-tile').evaluateAll(es=>es.map(e=>e.title));
 assert.deepEqual(new Set(titles),new Set(['Light bar','Monitor lights','Corner light','Sucka']),'only whole-device controls may appear, even with explicit segment IDs and no registry metadata');
 await page.getByRole('tab',{name:'Settings',exact:true}).click();
 await page.getByRole('heading',{name:'Appearance',exact:true}).waitFor();
 assert.equal(await page.getByRole('radio',{name:'Use Home Assistant theme',exact:true}).isChecked(),true);
 await page.getByRole('radio',{name:'Custom color',exact:true}).check();
 const hex=page.getByRole('textbox',{name:'Hex color',exact:true});await hex.fill('#ffe600');await waitAccent('#FFE600');
 assert.equal(await page.getByLabel('Accent color picker',{exact:true}).inputValue(),'#ffe600');
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 const ratio=await page.locator('.lk-msg[data-role="user"] .lk-bubble').evaluate(el=>{const s=getComputedStyle(el),c=document.createElement('canvas').getContext('2d');const lum=value=>{c.fillStyle=value;c.fillRect(0,0,1,1);const rgb=[...c.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);};const a=lum(s.color),b=lum(s.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 assert.ok(ratio>=4.5,'custom bright accents must retain readable text');
 await page.reload();await waitAccent('#FFE600');await page.getByRole('tab',{name:'Settings',exact:true}).click();assert.equal(await page.getByRole('radio',{name:'Custom color',exact:true}).isChecked(),true);
 await hex.fill('#381e72');await waitAccent('#381E72');await hex.fill('#12');await hex.blur();assert.equal(await accent(),'#381E72','invalid drafts must not change saved accent');
 await page.getByRole('alert').filter({hasText:'Enter a hex color'}).waitFor();
 await hex.fill('#00aa88');await waitAccent('#00AA88');
 for(const [width,height] of [[1200,900],[390,844],[320,568]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(artifacts,'appearance-'+engine+'-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.getByRole('button',{name:'Reset to Home Assistant theme',exact:true}).click();await waitAccent('#FFA000');assert.equal(await page.getByRole('radio',{name:'Use Home Assistant theme',exact:true}).isChecked(),true);
 await page.reload();await waitAccent('#FFA000');assert.deepEqual(errors,[]);
 const unavailable=await browser.newContext();await unavailable.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError')};});const blocked=await unavailable.newPage();const blockedErrors=[];blocked.on('pageerror',e=>blockedErrors.push(String(e)));await blocked.goto('http://127.0.0.1:8766');await blocked.getByRole('tab',{name:'Settings',exact:true}).click();await blocked.getByRole('radio',{name:'Custom color',exact:true}).check();await blocked.getByRole('textbox',{name:'Hex color',exact:true}).fill('#a05adb');await blocked.getByText('Color applied for now. This browser could not save it.',{exact:true}).waitFor();assert.equal(await blocked.locator('backend-butler-card').evaluate(h=>getComputedStyle(h).getPropertyValue('--lk-accent').trim().toUpperCase()),'#A05ADB');assert.deepEqual(blockedErrors,[]);await unavailable.close();
 console.log(JSON.stringify({engine,result:'PASS',checks:['whole-device controls only','explicit visible segments excluded','appearance independent of server settings','custom accent preview','contrast','invalid draft','reload persistence','HA reset','mobile/desktop','storage failure']}));
 } finally {await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
