const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine = process.env.ENGINE || 'chromium';
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#181818;color:#eee}backend-butler-card{display:block;--primary-color:#ffa000;--primary-text-color:#eee;--secondary-text-color:#aaa;--card-background-color:#181818}</style><body><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';window.micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.micRequests++;throw Error('Fixture must never acquire audio')};const card=document.querySelector('backend-butler-card');card.setConfig({type:'custom:backend-butler-card',layout:'fullpage'});card.hass={states:{},user:{id:'fixture',is_admin:true},callWS:async()=>[],callService:async()=>{},callApi:async(method,path,body)=>{const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw {status_code:r.status};return r.json()}};
</script>`;
const server = http.createServer((req,res) => {
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
  if(req.url==='/card.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.resolve(__dirname,'../../custom_components/backend_butler/frontend/backend-butler-card.js')))}
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('/token')){res.statusCode=503;return res.end('{}')}
  if(req.url.includes('/tasks'))return res.end('{"tasks":[]}');
  if(req.url.includes('/approvals'))return res.end('{"items":[]}');
  if(req.url.includes('/settings'))return res.end('{"users":[],"servers":[]}');
  if(req.url.includes('/conversations'))return res.end('{"conversations":[]}');
  if(req.url.includes('/history'))return res.end('{"conversation_id":null,"items":[],"busy":false}');
  res.end('{}');
});
(async()=>{
  await new Promise(r=>server.listen(8773,'127.0.0.1',r));
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try {
    await page.goto('http://127.0.0.1:8773');
    const settings=page.getByRole('button',{name:'Settings',exact:true});await settings.waitFor();
    assert.equal(await page.getByRole('tab').count(),0,'one conversation has no mode tabs');
    assert.equal(await page.getByRole('region',{name:'Conversation',exact:true}).count(),1);
    const composer=page.getByRole('textbox',{name:'Message Backend Butler',exact:true});await composer.fill('Keep this unsent conversation draft');
    for(const width of [1200,390,320]){
      await page.setViewportSize({width,height:800});await page.screenshot({path:path.join(process.env.ARTIFACTS_DIR||'/tmp',`conversation-main-${engine}-${width}.png`)});await settings.click();
      const sheet=page.getByRole('dialog',{name:'Settings',exact:true});await sheet.waitFor();
      const close=sheet.getByRole('button',{name:'Close Settings',exact:true});assert.ok((await close.boundingBox()).height>=44);
      assert.ok(await close.evaluate(el=>el.getRootNode().activeElement===el),'dialog initially focuses close');
      await sheet.getByRole('heading',{name:'Appearance',exact:true}).click();assert.ok(await sheet.isVisible(),'inside click preserves drawer');
      for(let i=0;i<20;i++){await page.keyboard.press('Tab');assert.ok(await sheet.evaluate(el=>{const active=el.getRootNode().activeElement;return active===null||el.contains(active)}),'modal never focuses background controls')}
      await settings.evaluate(el=>el.focus());assert.ok(await sheet.evaluate(el=>el.getRootNode().activeElement!==el.getRootNode().querySelector('[aria-label="Settings"]')),'background controls are inert');
      const draft=sheet.getByRole('textbox',{name:"New person's name",exact:true});await draft.fill('Unsubmitted fixture');
      await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
      assert.ok(await settings.evaluate(el=>el.getRootNode().activeElement===el),'Escape restores opener focus');
      await settings.click();assert.equal(await draft.inputValue(),'Unsubmitted fixture','closing preserves unsaved draft');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const box=await sheet.boundingBox();assert.ok(box.width<=width&&box.x>=0);
      await sheet.locator('.lk-settings-scroll').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(process.env.ARTIFACTS_DIR||'/tmp',`conversation-first-${engine}-${width}.png`)});
      await close.click();
    }
    await page.getByRole('button',{name:'Upcoming tasks, 0 tasks',exact:true}).click();
    const upcoming=page.getByRole('dialog',{name:'Upcoming',exact:true});await upcoming.getByRole('textbox',{name:'Search schedules'}).fill('retained query');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Upcoming tasks, 0 tasks',exact:true}).click();assert.equal(await upcoming.getByRole('textbox',{name:'Search schedules'}).inputValue(),'retained query');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Conversation history',exact:true}).click();await page.getByRole('dialog',{name:'Conversations',exact:true}).getByRole('button',{name:'New conversation',exact:true}).waitFor();await page.keyboard.press('Escape');
    assert.equal(await composer.inputValue(),'Keep this unsent conversation draft','navigation preserves primary conversation draft');
    await page.setViewportSize({width:1200,height:800});await settings.click();await page.mouse.click(10,400);await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor({state:'hidden'});
    await page.setViewportSize({width:320,height:800});await page.locator('backend-butler-card').evaluate(el=>{el.style.setProperty('--primary-text-color','#202124');el.style.setProperty('--secondary-text-color','#555');el.style.setProperty('--card-background-color','#fff');document.documentElement.style.fontSize='200%'});await settings.click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'enlarged light theme has no viewport overflow');await page.screenshot({path:path.join(process.env.ARTIFACTS_DIR||'/tmp',`conversation-light-large-${engine}.png`)});await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.micRequests),0,'navigation never captures microphone');assert.deepEqual(errors,[]);
    console.log(engine+' PASS: conversation-first navigation, modal focus/Escape, draft retention, mobile geometry, no automatic capture');
  } finally {await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
