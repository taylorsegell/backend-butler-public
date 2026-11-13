import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ConnectionState, Track, type Room } from 'livekit-client';

export type VoiceFeedbackPhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'reconnecting' | 'error';

export interface VoiceFeedbackInput {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  /** Actual local microphone capture AND the worker's listening gate are enabled. */
  micActive: boolean;
  micStarting: boolean;
  agentState?: string;
  /** Spoken output is enabled and playback is permitted; not merely generated text/audio. */
  audioOutput: boolean;
  pendingTool?: string;
  error?: string | null;
  interrupted?: boolean;
}

export interface VoiceFeedbackState {
  phase: VoiceFeedbackPhase;
  label: string;
  detail: string;
}

/** State words describe the connection, microphone and playback truth, never tool success. */
export function resolveVoiceFeedback(input: VoiceFeedbackInput): VoiceFeedbackState {
  const { connected, connecting, reconnecting, micActive, micStarting, agentState, audioOutput, interrupted } = input;
  if (input.error || agentState === 'failed') {
    return { phase: 'error', label: 'Voice needs attention', detail: input.error || 'The voice connection failed. Use the retry controls below.' };
  }
  if (reconnecting) return { phase: 'reconnecting', label: 'Reconnecting', detail: 'Your transcript is still here. Waiting for the voice connection.' };
  if (connecting) return { phase: 'connecting', label: 'Connecting', detail: 'Preparing your voice session.' };
  if (!connected) return { phase: 'idle', label: 'Ready to talk', detail: 'Start the microphone when you’re ready.' };
  if (micStarting) return { phase: 'connecting', label: 'Starting microphone', detail: 'Wait for Listening before you speak.' };
  if (interrupted) {
    return { phase: micActive ? 'listening' : 'paused', label: micActive ? 'Listening' : 'Microphone paused', detail: 'Speech stopped. Home actions may still be running.' };
  }
  if (agentState === 'speaking') {
    return audioOutput
      ? { phase: 'speaking', label: 'Speaking', detail: micActive ? 'You can interrupt the reply.' : 'Use Stop reply audio to mute this reply.' }
      : { phase: 'thinking', label: 'Replying in text', detail: 'Reply audio is unavailable or muted. Read the transcript.' };
  }
  if (input.pendingTool || agentState === 'thinking') {
    return { phase: 'thinking', label: 'Working on your request', detail: input.pendingTool?.trim().slice(0, 160) || 'Waiting for Butler’s reply.' };
  }
  return micActive
    ? { phase: 'listening', label: 'Listening', detail: 'Your microphone is on.' }
    : { phase: 'paused', label: 'Microphone paused', detail: 'Connected. Start talking when you’re ready.' };
}

const boundedLevel = (value: number): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Read transport audio levels on demand. The visual can sample these getters without
 * rendering React on every frame. No new audio graph, microphone request or playback
 * element is created; muted, detached and disconnected tracks read as exact silence.
 */
export function useVoiceAudioLevels(room: Room, enabled: boolean, inputEnabled: boolean, outputEnabled: boolean) {
  const gates = useRef({ enabled, inputEnabled, outputEnabled });
  gates.current = { enabled, inputEnabled, outputEnabled };
  const owner = useRef(room);
  owner.current = room;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, [room]);

  const getInputLevel = useCallback(() => {
    if (!mounted.current || owner.current !== room || !gates.current.enabled || !gates.current.inputEnabled || room.state !== ConnectionState.Connected) return 0;
    const participant = room.localParticipant;
    const publication = participant.getTrackPublication(Track.Source.Microphone);
    const stream = publication?.track?.mediaStreamTrack;
    if (!participant.isMicrophoneEnabled || !publication || publication.isMuted || !stream?.enabled || stream.readyState !== 'live') return 0;
    return boundedLevel(participant.audioLevel);
  }, [room]);

  const getOutputLevel = useCallback(() => {
    if (!mounted.current || owner.current !== room || !gates.current.enabled || !gates.current.outputEnabled || room.state !== ConnectionState.Connected || !room.canPlaybackAudio) return 0;
    let level = 0;
    for (const participant of room.remoteParticipants.values()) {
      if (!participant.isAgent) continue;
      const audible = [...participant.audioTrackPublications.values()].some((publication) => {
        const stream = publication.track?.mediaStreamTrack;
        return publication.isSubscribed && !publication.isMuted && stream?.enabled && stream.readyState === 'live';
      });
      if (audible) level = Math.max(level, boundedLevel(participant.audioLevel));
    }
    return level;
  }, [room]);

  return useMemo(() => ({ getInputLevel, getOutputLevel }), [getInputLevel, getOutputLevel]);
}
