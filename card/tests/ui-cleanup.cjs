const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const bundle = path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || require('node:os').tmpdir();
const html = `<!doctype html><meta name="viewport" content="width=device-width"><style>body{background:#16181d;margin:0}backend-butler-card{display:block;max-width:700px}</style><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
const card=document.querySelector('backend-butler-card');
card.setConfig({type:'custom:backend-butler-card',height:720,title:'Voice Assistant',areas:['room']});
card.hass={states:Object.fromEntries(Array.from({length:44},(_,i)=>['light.fixture_'+i,{entity_id:'light.fixture_'+i,state:'on',attributes:{friendly_name:i<10?'Visible light '+i:'Hidden segment '+i}}])),entities:Object.fromEntries(Array.from({length:44},(_,i)=>['light.fixture_'+i,{area_id:'room',hidden_by:i<10?null:'user'}])),areas:{room:{name:'room'}},user:{id:'test',name:'Test',is_admin:true},callService:async()=>{},callWS:async()=>({exposed_entities:Object.fromEntries(Array.from({length:44},(_,i)=>['light.fixture_'+i,{conversation:true}]))}),callApi:async(method,path,body)=>{const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
</script>`;
let rows = [];
let fail = false;
const decisions=[];
function prompt(id, preview) {return {id,chat_id:'chat',title:'Test '+id,summary:'A safe browser fixture',preview,expires_at:new Date(Date.now()+60000).toISOString(),status:'pending'};}
const server = http.createServer((req,res)=>{
  if(req.url==='/card.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(bundle));}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('/chat/approvals')){
    if(fail){res.statusCode=502;return res.end('{}');}
    if(req.method==='POST'){let body='';req.on('data',d=>body+=d);req.on('end',()=>{const d=JSON.parse(body);decisions.push(d);rows=rows.map(r=>r.id===d.id?{...r,status:d.allow?'approved':'denied'}:r);res.end('{"ok":true}');});return;}
    return res.end(JSON.stringify({items:rows}));
  }
  if(req.url.includes('/chat/history'))return res.end(JSON.stringify({items:[{kind:'action',id:'failure',call_id:'failure',ts:1,name:'get_areas',args:{},status:'error',output:JSON.stringify({error:{message:'Home Assistant did not respond'}})},{kind:'action',id:'running',ts:2,name:'list_devices',args:{},status:'running'},{kind:'action',id:'cancelled',ts:3,name:'set_light',args:{entity_id:'light.fixture_0'},status:'cancelled'}],busy:false}));
  if(req.url.includes('/chat/conversations'))return res.end('{"conversations":[]}');
  if(req.url.includes('/tasks'))return res.end('{"tasks":[]}');
  if(req.url.includes('/settings'))return res.end('{"users":[],"servers":[]}');
  return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8765,'0.0.0.0',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 rows=[prompt('approve',{kind:'yaml',text:'alias: Browser test\n# <img src=x onerror=alert(1)>'}),prompt('deny',{kind:'diff',lines:[{op:'-',text:'old'},{op:'+',text:'new'}]})];
 await page.goto('http://127.0.0.1:8765');
 await page.getByRole('button',{name:'Approve: Test approve',exact:true}).waitFor();
 await page.getByRole('button',{name:'Approve: Test approve',exact:true}).click();
 await page.getByText('Approved',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Deny: Test deny',exact:true}).click();
 await page.getByText('Not approved',{exact:true}).waitFor();
 assert.deepEqual(decisions,[{id:'approve',allow:true},{id:'deny',allow:false}]);
 assert.equal(await page.getByRole('button',{name:'Approve: Test approve',exact:true}).isDisabled(),true);
 assert.equal(await page.locator('.lk-approval img').count(),0);
 await page.locator('.lk-approval summary').first().click();
 await page.screenshot({path:path.join(artifacts,'browser-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1024,height:900});
 await page.screenshot({path:path.join(artifacts,'browser-desktop.png'),fullPage:true});
 fail=true;
 await page.getByText('Could not refresh Butler requests. Try again.',{exact:false}).waitFor({timeout:10000});
 fail=false;
 rows=[{...prompt('expired',{kind:'yaml',text:'alias: expired'}),expires_at:'2020-01-01T00:00:00Z'}];
 await page.locator('.lk-approval-error').getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Expired',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Approve: Test expired',exact:true}).isDisabled(),true);
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 await page.locator('.lk-act-badge').filter({hasText:'Failed'}).waitFor();
 assert.equal(await page.locator('.lk-title').innerText(),'Backend Butler');
 assert.equal(await page.locator('.lk-tile').count(),10);
 assert.equal(await page.getByText(/Hidden segment/).count(),0);
 assert.equal(await page.locator('.lk-act[data-status="error"] ha-icon[icon="mdi:alert-circle-outline"]').count(),1);
 assert.equal(await page.locator('.lk-act-reason').innerText(),'Home Assistant did not respond');
 assert.equal(await page.locator('.lk-act-badge').count(),3);
 await page.locator('.lk-act[data-status="error"]').click();
 assert.match(await page.locator('.lk-act-code[data-error="1"]').innerText(),/Home Assistant did not respond/);
 assert.equal(await page.getByRole('textbox',{name:'Message Backend Butler'}).count(),1);
 const icon=await page.evaluate(async()=>window.customIcons.backend_butler.getIcon('logo'));
 assert.equal(icon.viewBox,'160 162 704 704');assert.ok(icon.path.length>100);assert.equal(icon.secondaryPath,undefined);
 for (const width of [390,1024]) {
   await page.setViewportSize({width,height:900});
   assert.equal(await page.locator('.lk-act').evaluateAll(els=>els.every(e=>e.getBoundingClientRect().right<=innerWidth)),true);
   await page.screenshot({path:path.join(artifacts,'ui-cleanup-'+width+'.png'),fullPage:true});
 }
 assert.equal(errors.filter(e=>e.includes('502 (Bad Gateway)')).length,1);
 assert.deepEqual(errors.filter(e=>!e.includes('502 (Bad Gateway)')),[]);
 console.log(JSON.stringify({result:'PASS',decisions,checks:['approve','deny','disabled final','escaped preview','mobile','desktop','network error and retry','expiry','no runtime errors','legacy title','10 visible and 34 hidden exposed lights','failed/running/cancelled tools','error details','composer accessible name','iconset']}));
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
