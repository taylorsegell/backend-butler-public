const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/conversation.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { exports: {}, require(name) {
  if (name === 'react' || name === '@livekit/components-react') return {};
  if (name === './tasks') return { SCHEDULING_TOOLS: new Set() };
  throw Error('Unexpected runtime import: ' + name);
}};
vm.runInNewContext(source, sandbox);
const { liveTranscriptionMessages } = sandbox.exports;
const segment = (id, text, final = false, identity = 'local', timestamp = 100) => ({
  text, participantInfo: { identity }, streamInfo: { id: 'stream-'+id, timestamp,
    attributes: { 'lk.segment_id': id, 'lk.transcription_final': String(final) } },
});
const interim = segment('user-1', 'Turn on the kitch');
const final = segment('user-1', 'Turn on the kitchen lights', true, 'local', 200);
let rows = liveTranscriptionMessages([interim], 'local');
assert.equal(rows[0].interim, true);assert.equal(rows[0].role, 'user');
rows = liveTranscriptionMessages([interim, final, segment('user-1', 'late stale delta')], 'local');
assert.equal(rows.length, 1);assert.equal(rows[0].interim, false);assert.equal(rows[0].text, 'Turn on the kitchen lights');
assert.equal(rows[0].ts, 100, 'settling preserves original segment ordering timestamp');
rows = liveTranscriptionMessages([segment('reply-1','The lights',false,'agent'), segment('reply-1','The lights are on.',true,'agent')], 'local');
assert.equal(rows[0].role, 'agent');assert.equal(rows[0].interim, false);
assert.equal(liveTranscriptionMessages([segment('empty','')], 'local').length, 0);
assert.equal(liveTranscriptionMessages([{text:'No stream metadata'}], 'local').length, 0);
assert.equal(interim.text, 'Turn on the kitch', 'provider records remain unchanged');
console.log('PASS: live captions expose interim/final state, preserve segment identity/order, reject stale deltas and keep user/agent attribution');

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const componentSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/Conversation.tsx'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const components = { exports: {}, require(name) {
  if (name === '../lib/conversation') return sandbox.exports;
  if (name === './Markdown') return { Markdown: ({ text }) => React.createElement('p', null, text) };
  if (name === './ButlerApprovals') return { ButlerApprovals: () => null };
  return require(name);
}};
vm.runInNewContext(componentSource, components);
const render = (messages) => renderToStaticMarkup(React.createElement(components.exports.Conversation, { voice: true, items: messages }));
const liveMarkup = render(liveTranscriptionMessages([segment('me','Turn on <kitchen>'),segment('reply','Working…',false,'agent')], 'local'));
assert.match(liveMarkup,/data-interim="1"/);assert.match(liveMarkup,/aria-busy="true"/);
assert.match(liveMarkup,/Transcribing…/);assert.match(liveMarkup,/Reply in progress…/);
assert.match(liveMarkup,/&lt;kitchen&gt;/,'recognition text remains escaped');
const settledMarkup = render(liveTranscriptionMessages([segment('me','Turn on the kitchen lights',true)], 'local'));
assert.doesNotMatch(settledMarkup,/aria-busy="true"|Transcribing…|Reply in progress…/);
console.log('PASS: interim captions render clear progress labels without treating finalized or escaped text as interim content');
