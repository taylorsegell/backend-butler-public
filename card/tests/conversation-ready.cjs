const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/conversation-ready.ts'), 'utf8');
let timeout;
const sandbox = {exports: {}, setTimeout(fn) { timeout = fn; return 1; }, clearTimeout() { timeout = null; }};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, sandbox);
const {createConversationReady} = sandbox.exports;
(async () => {
  const waiting = createConversationReady();
  let capture = false;
  const speak = waiting.promise.then(ready => { if (ready) capture = true; });
  await Promise.resolve();
  assert.equal(capture, false, 'connected transport alone must never open the microphone');
  assert.equal(waiting.state, null);
  waiting.settle(true);
  await speak;
  assert.equal(capture, true, 'valid authoritative seed permits capture');
  assert.equal(timeout, null, 'successful seed clears timeout');
  for (const reason of ['backend error', 'cancel', 'timeout']) {
    const gate = createConversationReady();
    let failedCapture = false;
    const attempt = gate.promise.then(ready => { if (ready) failedCapture = true; });
    if (reason === 'timeout') timeout(); else gate.settle(false);
    gate.settle(true);
    await attempt;
    assert.equal(gate.state, false, reason);
    assert.equal(failedCapture, false, `${reason} must prevent microphone capture even after a late seed`);
  }
  const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  const openTurn = app.slice(app.indexOf('const openTurn ='), app.indexOf('// Single entry point'));
  assert.ok(openTurn.indexOf('await connectSession()') < openTurn.indexOf('await setMic(true)'), 'production capture waits for the readiness gate');
  assert.match(app, /await readiness.promise/, 'connectSession includes authority barrier');
  console.log('conversation readiness: pending, valid seed, backend error, cancellation and timeout pass');
})().catch(error => { console.error(error); process.exitCode = 1; });
