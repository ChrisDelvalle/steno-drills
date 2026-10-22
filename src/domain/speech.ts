export interface LocalVoice { id: string; name: string; lang: string; default: boolean }
export interface SpeechEvents { start(): void; end(): void; error(message: string): void }
export interface SpeechAdapter {
  voices(): LocalVoice[];
  subscribe(listener: () => void): () => void;
  speak(text: string, voice: LocalVoice, rate: number, events: SpeechEvents): void;
  cancel(): void;
}
export function chooseVoice(voices: LocalVoice[], preferred: string) {
  return voices.find(v => v.id === preferred) || voices.find(v => v.default) || voices[0];
}
export function browserSpeech(): SpeechAdapter {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let current: SpeechSynthesisUtterance | undefined;
  const available = () => synth?.getVoices().filter(v => v.localService && /^en(?:[-_]|$)/i.test(v.lang)) || [];
  return {
    voices: () => available().map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang, default: v.default })),
    subscribe(listener) { synth?.addEventListener('voiceschanged', listener); return () => synth?.removeEventListener('voiceschanged', listener); },
    cancel() { current = undefined; synth?.cancel(); },
    speak(text, voice, rate, events) {
      const native = available().find(v => v.voiceURI === voice.id);
      if (!synth || !native) { events.error('No local English voice. Check audio settings.'); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      current = utterance;
      utterance.voice = native; utterance.lang = native.lang; utterance.rate = rate;
      utterance.onstart = events.start;
      utterance.onend = () => { if (current === utterance) current = undefined; events.end(); };
      utterance.onerror = event => { if (current === utterance) current = undefined; events.error(event.error === 'not-allowed' ? 'Playback blocked. Select Replay to try again.' : 'Speech failed. Select Replay to try again.'); };
      synth.speak(utterance);
    },
  };
}
export interface SpokenPrompt { id: string; text: string }
/** Owns cancellation and activation, independently of input, scoring, and React. */
export class PromptSpeaker {
  activated = false;
  private generation = 0;
  private prompt: SpokenPrompt | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  constructor(private adapter: SpeechAdapter, private events: { start(): void; error(message: string): void }) {}
  cancel() {
    this.generation++;
    clearTimeout(this.timeout); this.timeout = undefined;
    this.adapter.cancel();
  }
  update(prompt: SpokenPrompt | null, preferred: string, rate: number, allowed = true) {
    if (prompt?.id === this.prompt?.id) return;
    this.prompt = prompt;
    this.cancel();
    if (this.activated && prompt && allowed) this.speak(prompt, preferred, rate);
  }
  play(prompt: SpokenPrompt, preferred: string, rate: number) {
    this.activated = true; this.prompt = prompt; this.cancel(); this.speak(prompt, preferred, rate);
  }
  private speak(prompt: SpokenPrompt, preferred: string, rate: number) {
    const voice = chooseVoice(this.adapter.voices(), preferred);
    if (!voice) { this.events.error('No local English voice. Check audio settings.'); return; }
    const generation = this.generation;
    let started = false;
    this.timeout = setTimeout(() => {
      if (generation !== this.generation || started) return;
      this.cancel(); this.events.error('Playback did not start. Select Replay to try again.');
    }, 8000);
    const clear = () => { clearTimeout(this.timeout); this.timeout = undefined; };
    try {
      this.adapter.speak(prompt.text, voice, rate, {
        start: () => { if (generation === this.generation) { started = true; clear(); this.events.start(); } },
        end: () => { if (generation === this.generation) clear(); },
        error: message => { if (generation === this.generation) { this.cancel(); this.events.error(message); } },
      });
    } catch { this.cancel(); this.events.error('Speech failed. Select Replay to try again.'); }
  }
}
