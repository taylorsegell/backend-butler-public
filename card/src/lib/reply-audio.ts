import {useEffect, useRef, useState} from 'react';

/** Stop current playback only; the next recognized user utterance restores future replies. */
export function useReplyAudio(userUtteranceId: string | undefined) {
  const [muted, setMuted] = useState(false);
  const mutedAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (muted && userUtteranceId !== undefined && userUtteranceId !== mutedAt.current) setMuted(false);
  }, [muted, userUtteranceId]);
  return {muted, stop: () => { mutedAt.current = userUtteranceId; setMuted(true); }, restore: () => setMuted(false)};
}
