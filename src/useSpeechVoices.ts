import { useEffect, useState } from 'react';
import type { SpeechAdapter } from './domain/speech';

export function useSpeechVoices(adapter: SpeechAdapter) {
  const [voices, setVoices] = useState(() => adapter.voices());
  useEffect(() => {
    const update = () => setVoices(adapter.voices());
    const unsubscribe = adapter.subscribe(update);
    update();
    return unsubscribe;
  }, [adapter]);
  return voices;
}
