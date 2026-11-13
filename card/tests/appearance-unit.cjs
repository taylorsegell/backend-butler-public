// Preference behavior is independent of React and Home Assistant's backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/appearance.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
function load(initial, unavailable = false) {
  const data = new Map(initial ? [['backend-butler-accent', initial]] : []);
  const events = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { if (unavailable) throw Error('Storage blocked'); data.set(key, value); },
    removeItem: (key) => { if (unavailable) throw Error('Storage blocked'); data.delete(key); },
  };
  const sandbox = { exports: {}, window: {
    localStorage: storage,
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name, listener) => { if (events.get(name) === listener) events.delete(name); },
  }};
  vm.runInNewContext(code, sandbox);
  return { api: sandbox.exports, data, events, storage };
}
const { api, data, events, storage } = load();
assert.equal(api.getAppearanceAccent(), null);
assert.equal(api.normalizeAccent(' #abc '), '#AABBCC');
assert.equal(api.normalizeAccent('#224466'), '#224466');
assert.equal(api.normalizeAccent('red; background:url(x)'), null);
assert.throws(() => api.setAppearanceAccent('not a color'), /hex color/);
assert.equal(api.getAppearanceAccent(), null, 'invalid text cannot change the preference');
let changes = 0;
const unsub = api.subscribeAppearance(() => changes++);
assert.equal(api.setAppearanceAccent('#abc'), true);
assert.equal(api.getAppearanceAccent(), '#AABBCC');
assert.equal(data.get('backend-butler-accent'), '#AABBCC');
assert.equal(changes, 1);
const styles = new Map();let writes = 0;
const host = { style: {
  getPropertyValue: (key) => styles.get(key) ?? '',
  setProperty: (key, value) => { writes++; styles.set(key, value); },
  removeProperty: (key) => { writes++; styles.delete(key); },
}};
api.applyAppearance(host);api.applyAppearance(host);
assert.equal(styles.get('--lk-accent'), '#AABBCC');
assert.equal(writes, 1, 'reattachment must not create a style mutation loop');
events.get('storage')({ key: 'backend-butler-accent', newValue: '#123456', storageArea: storage });
assert.equal(api.getAppearanceAccent(), '#123456');
assert.equal(changes, 2, 'other tabs notify subscribers');
events.get('storage')({ key: 'unrelated', newValue: '#000000', storageArea: storage });
assert.equal(api.getAppearanceAccent(), '#123456');
assert.equal(api.setAppearanceAccent(null), true);api.applyAppearance(host);api.applyAppearance(host);
assert.equal(styles.has('--lk-accent'), false);
assert.equal(writes, 2, 'reset removes only the override, once');
unsub();assert.equal(events.has('storage'), false, 'last subscriber removes the browser listener');
assert.equal(load('#12').api.getAppearanceAccent(), null, 'malformed storage falls back to HA');
assert.equal(load('#abc').api.getAppearanceAccent(), '#AABBCC');
const blocked = load(null, true).api;
assert.equal(blocked.setAppearanceAccent('#FFBF00'), false);
assert.equal(blocked.getAppearanceAccent(), '#FFBF00', 'failed persistence still permits immediate in-memory preview');
assert.equal(blocked.setAppearanceAccent(null), false);
assert.equal(blocked.getAppearanceAccent(), null);
console.log('PASS: appearance normalization, invalid input, persistence, cross-tab updates, reset, storage failure and idempotent host styling');
