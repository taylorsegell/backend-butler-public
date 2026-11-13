import type { TurnMode } from '../lib/turn-mode';

export function Header({
  orbState,
  title,
  connected,
  mode,
  onModeChange,
  stateLabel,
  audioOutput,
  onToggleAudioOutput,
  onEnd,
  devicesVisible,
  onToggleDevices,
  announceState = true,
}: {
  orbState: string;
  title: string;
  connected: boolean;
  mode: TurnMode;
  onModeChange: (mode: TurnMode) => void;
  stateLabel: string;
  audioOutput: boolean;
  onToggleAudioOutput: () => void;
  onEnd: () => void;
  devicesVisible?: boolean;
  onToggleDevices?: () => void;
  announceState?: boolean;
}) {
  return (
    <header className="lk-top">
      <span className="lk-orb" data-state={orbState} data-connected={connected ? '1' : '0'} aria-hidden="true">
        <span className="lk-orb-core" />
      </span>
      <div className="lk-titlewrap">
        <span className="lk-title">{title}</span>
        <span className="lk-state" data-state={orbState} role={announceState ? "status" : undefined} aria-live={announceState ? "polite" : "off"}>
          {stateLabel}
        </span>
      </div>
      {onToggleDevices && <button type="button" className="lk-iconbtn" aria-pressed={devicesVisible}
        aria-label={devicesVisible ? 'Hide devices' : 'Show devices'}
        title={devicesVisible ? 'Hide devices' : 'Show devices'} onClick={onToggleDevices}>
        <ha-icon icon="mdi:view-grid-outline" />
      </button>}
      {connected && <VoiceControls mode={mode} onModeChange={onModeChange} audioOutput={audioOutput} onToggleAudioOutput={onToggleAudioOutput} onEnd={onEnd} />}
    </header>
  );
}

/** Shared session controls for the full-page header and dashboard companion. */
export function VoiceControls({ mode, onModeChange, audioOutput, onToggleAudioOutput, onEnd }: {
  mode: TurnMode;
  onModeChange: (mode: TurnMode) => void;
  audioOutput: boolean;
  onToggleAudioOutput: () => void;
  onEnd: () => void;
}) {
  return <>
      <ModeSwitch mode={mode} onChange={onModeChange} />
        <button
          className="lk-iconbtn"
          data-on={audioOutput ? '1' : '0'}
          title={audioOutput ? 'Mute agent voice' : 'Let the agent speak'}
          aria-label={audioOutput ? 'Mute agent voice' : 'Let the agent speak'}
          aria-pressed={audioOutput}
          onClick={onToggleAudioOutput}
        >
          <ha-icon icon={audioOutput ? 'mdi:volume-high' : 'mdi:volume-off'} />
        </button>
        <button className="lk-iconbtn" aria-label="End conversation" title="End conversation" onClick={onEnd}>
          <ha-icon icon="mdi:close" />
        </button>
    </>;
}

/** Segmented Continuous | Manual toggle for the turn-detection mode. */
export function ModeSwitch({ mode, onChange }: { mode: TurnMode; onChange: (mode: TurnMode) => void }) {
  return (
    <div className="lk-modeswitch" role="group" aria-label="Turn mode">
      <button
        type="button"
        aria-pressed={mode === 'auto'}
        data-on={mode === 'auto' ? '1' : '0'}
        title="Continuous: talk hands-free, the agent detects when you stop"
        onClick={() => onChange('auto')}
      >
        <span>Continuous</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === 'manual'}
        data-on={mode === 'manual' ? '1' : '0'}
        title="Push-to-talk: tap to start a turn, End to send or Cancel to discard"
        onClick={() => onChange('manual')}
      >
        <span>Manual</span>
      </button>
    </div>
  );
}
