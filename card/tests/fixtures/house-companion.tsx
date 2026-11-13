import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {VoiceFeedback, type VoiceFeedbackPhase} from '../../src/components/VoiceFeedback';
import {VoiceControls} from '../../src/components/Header';
import {Conversation} from '../../src/components/Conversation';
import {Dock} from '../../src/components/Dock';
import {CARD_STYLES} from '../../src/styles';
const host=document.createElement('div');host.style.cssText='display:block;max-width:520px;--lk-h:380px';document.body.append(host);
const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>'+CARD_STYLES+'</style><div class="lk-root"></div>';
let level=0;
const getLevel=()=>level;
const labels={idle:'Ready to talk',connecting:'Connecting',listening:'Listening',thinking:'Working on your request',speaking:'Speaking',paused:'Microphone paused',reconnecting:'Reconnecting',error:'Voice needs attention'};
function Fixture(){
 const [phase,setPhase]=useState<VoiceFeedbackPhase>('listening');
 const [mode,setMode]=useState<'auto'|'manual'>('auto');
 Object.assign(window,{setVoicePhase:setPhase});
 return <ha-card data-voice-card="1" data-voice-idle={phase==='idle'?'1':'0'}><div className="lk-panel">
  <VoiceFeedback companionTitle="Talk to Butler" phase={phase} label={labels[phase]} detail={phase==='error'?'The session dropped. Use the recovery controls to reconnect.':'Your microphone and reply stay in this session.'} getInputLevel={getLevel} getOutputLevel={getLevel}
   controls={phase==='idle'?undefined:<VoiceControls mode={mode} onModeChange={setMode} audioOutput onToggleAudioOutput={()=>{}} onEnd={()=>setPhase('idle')}/>}
   onInterrupt={()=>{(window as any).stops++;setPhase('paused')}} />
  <Conversation compact voice items={phase==='idle'?[]:[{kind:'message',id:'u',role:'user',text:'What is happening at home?',ts:Date.now(),interim:true},{kind:'message',id:'a',role:'agent',text:'I’m checking your request.',ts:Date.now()+1}]} />
  <Dock connected={phase!=='idle'} connecting={false} mode={mode} turnActive={false} autoPaused={phase==='idle'||phase==='paused'} micStarting={false} onSend={()=>{setPhase('thinking');return Promise.resolve(true)}} onTurnStart={()=>setPhase('listening')} onTurnEnd={()=>{}} onTurnCancel={()=>{}} onPause={()=>setPhase('paused')} onResume={()=>setPhase('listening')} />
 </div></ha-card>
}
Object.assign(window,{setVoiceLevel:(value:number)=>{level=value},stops:0});
createRoot(shadow.querySelector('.lk-root')!).render(<Fixture/>);
