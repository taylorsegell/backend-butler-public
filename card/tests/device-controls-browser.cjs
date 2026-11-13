const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const engine = process.env.ENGINE || 'chromium';
const bundle = path.resolve(__dirname, '../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR || os.tmpdir();
const parents = {
  'light.light_bar': 'Light bar',
  'light.monitor_lights': 'Monitor lights',
  'light.corner_light': 'Corner Light',
  'light.segmented_lamp': 'Segmented art lamp',
};
const segments = Object.fromEntries(['light_bar', 'monitor_lights'].flatMap(device =>
  Array.from({ length: 16 }, (_, i) => [`light.${device}_segment_${i + 1}`, `${device === 'light_bar' ? 'Light bar' : 'Monitor lights'} Segment ${i + 1}`])));
const names = { ...parents, ...segments, 'light.friendly_only': 'Light bar Segment 17', 'light.renamed_child': 'Evening accent', 'light.hidden_member': 'Hidden group member' };
const now = new Date().toISOString();
const states = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, { entity_id: id, state: 'on', last_changed: now, last_updated: now, attributes: { friendly_name: name } }]));
const registry = Object.fromEntries(Object.keys(names).map(id => [id, { area_id: 'room', hidden_by: null }]));
registry['light.renamed_child'].original_name = 'Monitor lights Segment 8';
registry['light.hidden_member'].hidden_by = 'user';
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#16181d;color:#e9eaee}backend-butler-card{display:block}</style><backend-butler-card></backend-butler-card><script type="module">
import '/card.js';
const card=document.querySelector('backend-butler-card');
card.setConfig({type:'custom:backend-butler-card',layout:'fullpage',areas:['room'],entities:${JSON.stringify(Object.keys(names))}});
window.serviceCalls=[];
window.fixtureHass={states:${JSON.stringify(states)},entities:${JSON.stringify(registry)},areas:{room:{name:'Office'}},user:{id:'test',name:'Test',is_admin:true},callService:async(domain,service,data)=>{window.serviceCalls.push({domain,service,data})},callWS:async()=>({exposed_entities:${JSON.stringify(Object.fromEntries(Object.keys(names).map(id => [id, { conversation: true }])))}}),callApi:async(method,path,body)=>{const response=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!response.ok)throw {status_code:response.status};return response.json()}};
card.hass=window.fixtureHass;
</script>`;
const items = [
  { kind: 'message', id: 'request', role: 'user', text: 'Set Light bar Segment 1', ts: Date.now() },
  { kind: 'action', id: 'segment-action', name: 'HassLightSet', args: { name: 'Light bar Segment 1' }, status: 'done', ts: Date.now() + 1 },
  { kind: 'action', id: 'whole-action', name: 'HassLightSet', args: { name: 'Light bar' }, status: 'done', ts: Date.now() + 2 },
];
const server = http.createServer((req, res) => {
  if (req.url === '/card.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(bundle)); }
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
  res.setHeader('Content-Type', 'application/json');
  if (req.url.includes('/chat/history')) return res.end(JSON.stringify({ items, busy: false }));
  if (req.url.includes('/chat/approvals')) return res.end('{"items":[]}');
  if (req.url.includes('/chat/conversations')) return res.end('{"conversations":[]}');
  if (req.url.includes('/tasks')) return res.end('[]');
  if (req.url.includes('/settings')) return res.end('{"users":[],"servers":[]}');
  return res.end('{}');
});
(async () => {
  await new Promise(resolve => server.listen(8768, '127.0.0.1', resolve));
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, args: engine === 'chromium' ? ['--no-sandbox'] : [] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto('http://127.0.0.1:8768');
    assert.equal(await page.getByRole('tab', {name:'Voice',exact:true}).getAttribute('aria-selected'),'true','Voice is the default entry point');
    assert.equal(await page.getByRole('tab').first().textContent(),'Voice','Voice leads the tab order');
    const expected = Object.values(parents).sort();
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: width === 1200 ? 900 : 844 });
      for (const tab of ['Chat', 'Voice']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await page.getByRole('region', { name: 'Devices, 4 controls', exact: true }).waitFor();
        assert.deepEqual((await page.locator('.lk-tile').evaluateAll(elements => elements.map(element => element.title))).sort(), expected, `${tab} must expose whole devices only`);
        assert.equal(await page.locator('.lk-devices-count').textContent(), '4');
        if (tab === 'Chat') {
          await page.locator('.lk-tile[title="Light bar"][data-touched="1"]').waitFor();
          assert.equal(await page.locator('.lk-tile').first().getAttribute('title'), 'Light bar', 'the acted-on whole device remains first');
          assert.equal(await page.locator('.lk-tile').first().getAttribute('data-touched'), '1');
        }
        await page.screenshot({ path: path.join(artifacts, `device-controls-${engine}-${tab.toLowerCase()}-${width}.png`), fullPage: true });
      }
    }
    await page.evaluate(() => {
      const next = { ...window.fixtureHass, states: { ...window.fixtureHass.states }, entities: undefined };
      // These two have only registry-based identity/visibility; test identifiable segments
      // without a registry independently of those unrelated metadata-only exclusions.
      delete next.states['light.renamed_child'];
      delete next.states['light.hidden_member'];
      document.querySelector('backend-butler-card').hass = next;
    });
    assert.deepEqual((await page.locator('.lk-tile').evaluateAll(elements => elements.map(element => element.title))).sort(), expected, 'segment names and IDs remain filtered without registry metadata');
    await page.locator('.lk-tile[title="Light bar"]').click();
    assert.deepEqual(await page.evaluate(() => window.serviceCalls), [{ domain: 'light', service: 'toggle', data: { entity_id: 'light.light_bar' } }], 'the whole light-bar control remains usable');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine, result: 'PASS', checks: ['32 visible exposed segments excluded', 'explicit/recent/tool/query paths', 'original registry name', 'missing registry', 'whole light bars retained and actionable', 'Devices label/count', 'desktop/mobile Chat/Voice', 'zero page errors'] }));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
