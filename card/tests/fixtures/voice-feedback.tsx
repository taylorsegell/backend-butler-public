import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {VoiceFeedback, type VoiceFeedbackPhase} from '../../src/components/VoiceFeedback';
import {Conversation} from '../../src/components/Conversation';
import {Header} from '../../src/components/Header';
import {Dock} from '../../src/components/Dock';
import {useReplyAudio} from '../../src/lib/reply-audio';
import {CARD_STYLES} from '../../src/styles';
const host=document.createElement('div');host.style.setProperty('--lk-h','540px');host.style.display='block';document.body.append(host);
const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>'+CARD_STYLES+'</style><div class="lk-root"></div>';
let level=0;const getLevel=()=>level;let setPhase:(p:VoiceFeedbackPhase)=>void;
const labels={idle:'Ready to talk',connecting:'Connecting',listening:'Listening',thinking:'Working on your request',speaking:'Speaking',paused:'Microphone paused',reconnecting:'Reconnecting',error:'Voice needs attention'};
function Fixture(){const [mode,setMode]=useState<'auto'|'manual'>('auto');const [utterance,setUtterance]=useState('first');const audio=useReplyAudio(utterance);Object.assign(window,{setUserUtterance:setUtterance,replyMuted:audio.muted});const [phase,change]=useState<VoiceFeedbackPhase>('listening');setPhase=change;return <ha-card data-voice-card="1"><Header orbState="listening" title="Backend Butler" connected mode={mode} onModeChange={setMode} stateLabel="Listening" audioOutput onToggleAudioOutput={()=>{}} onEnd={()=>{}} /><Conversation voice items={[{kind:'message',id:'u',role:'user',text:'Set the office lights…',ts:Date.now(),interim:true},{kind:'message',id:'a',role:'agent',text:'I’m checking the lights in your office.',ts:Date.now()+1}]} /><VoiceFeedback phase={phase} label={labels[phase]} detail={phase==='thinking'?'Set office lights':phase==='error'?'Connection failed. Retry below.':'Your microphone and reply stay in this session.'} getInputLevel={getLevel} getOutputLevel={getLevel} onInterrupt={()=>{(window as any).stops++;audio.stop();change('paused')}} onEnd={()=>{(window as any).ends++;change('idle')}}/><Dock connected connecting={false} mode="auto" turnActive={false} autoPaused={phase==='paused'} micStarting={false} onSend={()=>true} onTurnStart={()=>change('listening')} onTurnEnd={()=>{}} onTurnCancel={()=>{}} onPause={()=>change('paused')} onResume={()=>change('listening')} /></ha-card>}
createRoot(shadow.querySelector('.lk-root')!).render(<Fixture/>);
Object.assign(window,{setVoicePhase:(phase:VoiceFeedbackPhase)=>setPhase(phase),setVoiceLevel:(v:number)=>{level=v},stops:0,ends:0});
