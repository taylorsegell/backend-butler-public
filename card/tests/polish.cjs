const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine=process.env.ENGINE||'chromium';
const bundle = path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || require('node:os').tmpdir();
let failSend = true;
let history = [
 {kind:'message',id:'user',role:'user',text:'Set the office light to deep saffron.',ts:Date.now()},
 {kind:'action',id:'light',name:'light_HassLightSet',args:{name:'Office light'},status:'error',output:'The light could not use these settings.',ts:Date.now()+1},
 {kind:'message',id:'reply',role:'agent',text:'The light did not change. You can try a different setting.',ts:Date.now()+2}
];
let requests = 0;
let failHistory = false;
let failArchive = true;
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
 if(req.url.includes('/chat/history?') && failArchive){res.statusCode=503;return res.end('{}');}
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
 if(req.url.includes('/chat/conversations'))return res.end(JSON.stringify({current:'current',conversations:[{id:'archive',title:'Evening lights',updated:Date.now()}]}));
 if(req.url.includes('/tasks'))return res.end('{"tasks":[]}');
 if(req.url.includes('/settings'))return res.end('{"users":[],"servers":[]}');
 return res.end('{}');
});
(async()=>{
 await new Promise(r=>server.listen(8766,'127.0.0.1',r));
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const themes=[
 {name:'dark-amber',surface:'#111110',fg:'#f1f1ef',muted:'#b8b8b4',elevated:'#1c1c19',accent:'#ffa000',danger:'#f0483e',preferred:'#ffffff'},
 {name:'light-amber',surface:'#ffffff',fg:'#202020',muted:'#626262',elevated:'#f1f1f1',accent:'#ffbf00',danger:'#db4437',preferred:'#ffffff'},
 {name:'dark-blue',surface:'#16181d',fg:'#e9eaee',muted:'#9aa1ac',elevated:'#24262e',accent:'#4c8dff',danger:'#f0483e',preferred:'#ffffff'},
 {name:'dark-translucent',surface:'#111110',fg:'#f1f1ef',muted:'#b8b8b4',elevated:'#1c1c19',accent:'rgba(255,160,0,0.12)',danger:'#f0483e',preferred:'#ffffff'},
 {name:'dark-lowcontrast',surface:'#181818',fg:'#333333',muted:'#444444',elevated:'#202020',accent:'#f08000',danger:'#f0483e',preferred:'#ffffff'},
 {name:'light-lowcontrast',surface:'#ffffff',fg:'#bbbbbb',muted:'#cccccc',elevated:'#f4f4f4',accent:'#03a9f4',danger:'#ef4444',preferred:'#ffffff'},
 {name:'light-blue',surface:'#ffffff',fg:'#202020',muted:'#626262',elevated:'#f1f1f1',accent:'#03a9f4',danger:'#ef4444',preferred:'#ffffff'}
 ];
 const contrast=async(selector,foreground='color',background='backgroundColor')=>page.locator(selector).evaluate((el,{foreground,background})=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
 const rgb=(color,under=[255,255,255])=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const [r,g,b,a]=ctx.getImageData(0,0,1,1).data;return [r,g,b].map((v,i)=>v*a/255+under[i]*(1-a/255));};
 const luminance=values=>values.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const style=getComputedStyle(el),surface=rgb(getComputedStyle(el.getRootNode().host).getPropertyValue('--lk-surface'),rgb(getComputedStyle(document.body).backgroundColor)),bg=rgb(style[background],surface),a=luminance(rgb(style[foreground],bg)),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 },{foreground,background});
 const archiveCheck=async()=>{
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 await page.getByRole('button',{name:'Conversations',exact:true}).click();
 await page.getByRole('button',{name:/Evening lights/}).click();
 await page.getByRole('button',{name:'Retry conversation',exact:true}).waitFor({timeout:2000});
 assert.equal(await page.getByRole('button',{name:'Continue this conversation',exact:true}).isDisabled(),true);
 failArchive=false;await page.getByRole('button',{name:'Retry conversation',exact:true}).click();
 await page.locator('.lk-msg[data-role="user"] .lk-bubble').waitFor();
 assert.equal(await page.getByRole('button',{name:'Continue this conversation',exact:true}).isEnabled(),true);
 };
 try {
 await page.goto('http://127.0.0.1:8766');await page.locator('.lk-msg[data-role="user"] .lk-bubble').waitFor();
 if(process.env.ARCHIVE_ONLY){await archiveCheck();console.log('PASS: archived conversation error and retry');return;}
 for(const theme of themes){
 await page.evaluate(t=>{const host=document.querySelector('backend-butler-card');const vars={'--primary-color':t.accent,'--text-primary-color':t.preferred,'--primary-text-color':t.fg,'--secondary-text-color':t.muted,'--card-background-color':t.surface,'--secondary-background-color':t.elevated,'--error-color':t.danger};for(const [key,value] of Object.entries(vars)){if(t.name.startsWith('light-')){host.style.removeProperty(key);document.body.style.setProperty(key,value);}else host.style.setProperty(key,value);}document.body.style.background=t.surface;},theme);
 await page.waitForTimeout(100);
 assert.ok(await contrast('.lk-msg[data-role="user"] .lk-bubble')>=4.5,theme.name+' user bubble needs 4.5:1 contrast');
 assert.ok(await contrast('.lk-msg[data-role="agent"] .lk-bubble')>=4.5,theme.name+' assistant text contrast');
 assert.ok(await contrast('.lk-usage')>=4.5,theme.name+' secondary text contrast');
 const failed=page.locator('.lk-act[data-status="error"]');await failed.hover();
 const dangerBorder=await failed.evaluate(el=>{const style=getComputedStyle(el),host=el.getRootNode().host;const probe=document.createElement('span');probe.style.color=getComputedStyle(host).getPropertyValue('--lk-danger-ink')||getComputedStyle(host).getPropertyValue('--lk-danger');host.shadowRoot.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {actual:style.borderTopColor,expected};});
 assert.equal(dangerBorder.actual,dangerBorder.expected,theme.name+' failed action must retain error border on hover');
 await page.keyboard.press('Tab');
 await page.getByRole('tab',{name:'Schedules',exact:true}).focus();
 assert.equal(await page.getByRole('tab',{name:'Schedules',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'solid','keyboard focus must be visible');
 const focusRatio=await page.getByRole('tab',{name:'Schedules',exact:true}).evaluate(el=>({outline:getComputedStyle(el).outlineColor,surface:getComputedStyle(el.getRootNode().host).getPropertyValue('--lk-surface')}));
 // Compare through temporary solid swatches so the contrast reader handles any supported CSS color.
 await page.getByRole('tab',{name:'Schedules',exact:true}).evaluate((el,colors)=>{el.style.color=colors.outline;el.style.backgroundColor=colors.surface;},focusRatio);
 assert.ok(await contrast('[role="tab"]:focus')>=3,theme.name+' focus indicator needs 3:1 contrast');
 await page.getByRole('tab',{name:'Schedules',exact:true}).evaluate(el=>{el.style.removeProperty('color');el.style.removeProperty('background-color');});
 for(const width of [1200,390]){
 await page.setViewportSize({width,height:width===1200?900:844});
 for(const tab of ['Chat','Voice','Schedules','Settings']){
 await page.getByRole('tab',{name:tab,exact:true}).click();await page.waitForTimeout(100);
 const field=tab==='Schedules'?page.getByRole('textbox',{name:'Search schedules'}):tab==='Settings'?page.getByRole('textbox',{name:"New person's name"}):page.getByRole('textbox',{name:'Message Backend Butler'});
 await page.keyboard.press('Tab');await field.focus();
 assert.equal(await field.evaluate(el=>getComputedStyle(el.closest('.lk-bar')||el).outlineStyle),'solid',tab+' input keyboard focus must remain visible');
 await page.screenshot({path:path.join(artifacts,'polish-'+engine+'-'+theme.name+'-'+tab.toLowerCase()+'-'+width+'.png'),fullPage:true});
 }
 }
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 }
 await archiveCheck();
 assert.deepEqual(errors,[]);console.log(engine+' PASS: live theme switching, accent text contrast, semantic failed-action styling, focus contrast, all four pages in dark/light amber and blue at desktop/mobile');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
