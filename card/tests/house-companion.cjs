const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const esbuild=require('node:module').createRequire(require.resolve('vite/package.json'))('esbuild');
const script=esbuild.buildSync({entryPoints:[path.join(__dirname,'fixtures/house-companion.tsx')],bundle:true,write:false,format:'iife',jsx:'automatic',logLevel:'silent'}).outputFiles[0].contents;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?script:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;background:#181818;color:#eee}</style><body><script src="/fixture.js"></script></body>')});
(async()=>{await new Promise(r=>server.listen(8772,'127.0.0.1',r));const engine=process.env.ENGINE||'chromium';const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));try{
 await page.goto('http://127.0.0.1:8772');await page.locator('.lk-companion').waitFor();
 for(const width of [320,390,560]){await page.setViewportSize({width,height:800});for(const phase of ['idle','connecting','listening','thinking','speaking','paused','reconnecting','error']){
  await page.evaluate(p=>window.setVoicePhase(p),phase);const logoFills=await page.locator('.lk-companion-mark path').evaluateAll(paths=>paths.map(p=>getComputedStyle(p).fill));assert.deepEqual(logoFills,['rgb(242, 242, 243)','rgb(242, 242, 243)','rgb(242, 242, 243)','rgb(242, 242, 243)','rgb(252, 107, 2)'],'approved logo colors never inherit session status or UI accent');const card=await page.locator('ha-card').boundingBox(),dock=await page.locator('.lk-dock').boundingBox();
  assert.ok(dock.y+dock.height<=card.y+card.height+1,`${width}/${phase}: composer inside card`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(phase!=='idle'){const transcript=await page.locator('.lk-convo').boundingBox();assert.ok(transcript.height>=70,`${width}/${phase}: readable transcript (${transcript.height}px)`)}
  if(phase==='idle'||phase==='speaking')await page.screenshot({path:path.join(process.env.ARTIFACTS_DIR||'/tmp',`house-companion-${engine}-${width}-${phase}.png`)});
 }}
 await page.evaluate(()=>{window.setVoicePhase('listening');window.setVoiceLevel(.8)});
 await page.waitForFunction(()=>parseFloat(document.querySelector('body>div').shadowRoot.querySelector('.lk-companion').style.getPropertyValue('--lk-voice-level'))>.4);
 await page.evaluate(()=>window.setVoiceLevel(0));await page.waitForFunction(()=>parseFloat(document.querySelector('body>div').shadowRoot.querySelector('.lk-companion').style.getPropertyValue('--lk-voice-level'))<.02);
 await page.evaluate(()=>window.setVoicePhase('speaking'));await page.getByRole('button',{name:'Stop reply audio',exact:true}).click();assert.equal(await page.evaluate(()=>window.stops),1);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.setVoicePhase('listening');window.setVoiceLevel(1)});await page.waitForFunction(()=>document.querySelector('body>div').shadowRoot.querySelector('.lk-companion').dataset.motion==='0');
 await page.getByRole('button',{name:'End conversation',exact:true}).click();await page.getByText('At your service.',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log(engine+' PASS: companion phases, transcript space, controls, audio signals/silence, reduced motion at 320/390/560px');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
