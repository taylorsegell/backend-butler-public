import { useEffect, useState } from 'react';
import { ConnectionState, RoomEvent, Track, type Room } from 'livekit-client';

/** Subscribe only to transport state. Reading these flags never opens the microphone. */
export function useVoiceTransport(room: Room) {
  const read = () => {
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = publication?.track;
    return {
      reconnecting: room.state === ConnectionState.Reconnecting || room.state === ConnectionState.SignalReconnecting,
      micActive: Boolean(track && !publication?.isMuted && track.mediaStreamTrack.readyState === 'live' && track.mediaStreamTrack.enabled),
      canPlayback: room.canPlaybackAudio,
    };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState(read());
    const events = [RoomEvent.ConnectionStateChanged, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.AudioPlaybackStatusChanged];
    events.forEach(event => room.on(event, update));
    update();
    return () => { events.forEach(event => room.off(event, update)); };
    // The room is stable; each listener reads the current transport flags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  return state;
}
