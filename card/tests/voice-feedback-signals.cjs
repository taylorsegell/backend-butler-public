const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/voice-feedback.ts'), 'utf8'), {
  compilerOptions: {target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},
}).outputText;
let refs=[], effects=[], index=0;
const React={useRef(value){return refs[index++]??(refs[index-1]={current:value})},useCallback(fn){return fn},useMemo(fn){return fn()},useEffect(fn){effects.push(fn)}};
const sandbox={exports:{},require(name){return name==='react'?React:{ConnectionState:{Connected:'connected'},Track:{Source:{Microphone:'microphone'}}}}};
vm.runInNewContext(code,sandbox);const {resolveVoiceFeedback:resolve,useVoiceAudioLevels:levels}=sandbox.exports;
const base={connected:true,connecting:false,reconnecting:false,micActive:false,micStarting:false,agentState:'listening',audioOutput:true};
assert.equal(resolve({...base,connected:false}).phase,'idle');
assert.equal(resolve(base).phase,'paused','agent listening does not imply an open microphone');
assert.equal(resolve({...base,micActive:true}).phase,'listening');
assert.equal(resolve({...base,agentState:'speaking',audioOutput:false}).label,'Replying in text');
assert.equal(resolve({...base,agentState:'speaking'}).phase,'speaking');
assert.equal(resolve({...base,pendingTool:'Set office lights'}).phase,'thinking');
assert.equal(resolve({...base,connecting:true,micActive:true}).phase,'connecting');
assert.equal(resolve({...base,reconnecting:true}).phase,'reconnecting');
assert.equal(resolve({...base,micStarting:true}).label,'Starting microphone');
assert.equal(resolve({...base,error:'Microphone permission denied'}).detail,'Microphone permission denied');
assert.equal(resolve({...base,agentState:'failed'}).phase,'error');
assert.match(resolve({...base,micActive:true,interrupted:true}).detail,/may still be running/);
const stream={enabled:true,readyState:'live'},pub={isMuted:false,isSubscribed:true,track:{mediaStreamTrack:stream}};
const room={state:'connected',canPlaybackAudio:true,localParticipant:{isMicrophoneEnabled:true,audioLevel:.4,getTrackPublication:()=>pub},remoteParticipants:new Map([['agent',{isAgent:true,audioLevel:.7,audioTrackPublications:new Map([['audio',pub]])}],['human',{isAgent:false,audioLevel:1,audioTrackPublications:new Map([['audio',pub]])}]])};
function render(...gates){index=0;effects=[];return levels(room,...gates)}
let meter=render(true,true,true);const cleanup=effects[0]();
assert.equal(meter.getInputLevel(),.4);assert.equal(meter.getOutputLevel(),.7,'other participants cannot drive Butler output');
render(true,false,false);assert.equal(meter.getInputLevel(),0);assert.equal(meter.getOutputLevel(),0);
render(true,true,true);room.canPlaybackAudio=false;assert.equal(meter.getOutputLevel(),0,'autoplay-blocked output is silent');room.canPlaybackAudio=true;
stream.enabled=false;assert.equal(meter.getInputLevel(),0);assert.equal(meter.getOutputLevel(),0);stream.enabled=true;
room.state='reconnecting';assert.equal(meter.getInputLevel(),0);assert.equal(meter.getOutputLevel(),0);room.state='connected';
room.localParticipant.audioLevel=Infinity;assert.equal(meter.getInputLevel(),0);room.localParticipant.audioLevel=5;assert.equal(meter.getInputLevel(),1);
cleanup();assert.equal(meter.getInputLevel(),0);assert.equal(meter.getOutputLevel(),0);
console.log('PASS: truthful voice states and transport meters gated for capture, playback, participants, connection and unmount');
