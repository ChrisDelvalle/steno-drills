import { afterEach, expect, it, vi } from 'vitest';
import { browserSpeech, chooseVoice, PromptSpeaker } from './speech';
import type { SpeechAdapter, SpeechEvents } from './speech';

const voice = { id: 'local', name: 'English', lang: 'en-US', default: true };
function harness(voices = [voice]) {
  const calls: { text: string; events: SpeechEvents }[] = [];
  const adapter: SpeechAdapter = { voices: () => voices, subscribe: () => () => {}, cancel: vi.fn(), speak: (text, _voice, _rate, events) => { calls.push({ text, events }); } };
  const events = { start: vi.fn(), error: vi.fn() };
  return { speaker: new PromptSpeaker(adapter, events), calls, adapter, events };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('requires activation, sequences identities, ignores spaces and stale playback callbacks', () => {
  vi.useFakeTimers();
  const { speaker, calls, events, adapter } = harness();
  const first = { id: '0:0', text: 'one net dad' }, next = { id: '3:1', text: 'main bad' };
  speaker.update(first, '', 1); expect(calls).toHaveLength(0);
  speaker.play(first, '', 1); expect(events.start).not.toHaveBeenCalled();
  calls[0].events.start(); expect(events.start).toHaveBeenCalledTimes(1);
  speaker.update(first, '', 1); expect(calls).toHaveLength(1);
  speaker.update(next, '', 1); expect(calls[1].text).toBe('main bad');
  calls[0].events.error('stale'); calls[0].events.start();
  expect(events.error).not.toHaveBeenCalled(); expect(events.start).toHaveBeenCalledTimes(1);
  speaker.update(first, '', 1); expect(calls[2].text).toBe('one net dad');
  speaker.cancel(); calls[2].events.start(); expect(events.start).toHaveBeenCalledTimes(1);
  speaker.update(first, '', 1); expect(calls).toHaveLength(3); // Focus return never replays.
  speaker.play(first, '', .5); expect(calls).toHaveLength(4);
  speaker.update(null, '', 1); vi.advanceTimersByTime(10_000);
  expect(events.error).not.toHaveBeenCalled(); expect(adapter.cancel).toHaveBeenCalled();
});
it('reports missing voices, denial, thrown errors, and a browser that never starts', () => {
  vi.useFakeTimers();
  const h = harness([]), p = { id: '0', text: 'bad' };
  h.speaker.play(p, '', 1); expect(h.events.error).toHaveBeenLastCalledWith(expect.stringContaining('No local English'));
  const other = harness(); other.speaker.play(p, '', 1);
  other.calls[0].events.error('Playback blocked.'); expect(other.events.error).toHaveBeenCalledWith('Playback blocked.');
  other.speaker.play(p, '', 1); vi.advanceTimersByTime(8001);
  expect(other.events.error).toHaveBeenLastCalledWith(expect.stringContaining('did not start'));
  other.calls[1].events.start(); expect(other.events.start).not.toHaveBeenCalled();
  other.adapter.speak = () => { throw new Error('blocked'); };
  other.speaker.play(p, '', 1); expect(other.events.error).toHaveBeenLastCalledWith(expect.stringContaining('Speech failed'));
});
it('delays scheduled playback and cancels it on restart, navigation, or explicit Replay', () => {
  vi.useFakeTimers();
  const { speaker, calls, events } = harness();
  const first = { id: 'first', text: 'one' }, next = { id: 'next', text: 'net' };
  speaker.play(first, '', 1, 500);
  speaker.update(first, '', 1);
  vi.advanceTimersByTime(499); expect(calls).toHaveLength(0); expect(events.start).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(calls.map(c => c.text)).toEqual(['one']);
  expect(events.start).not.toHaveBeenCalled(); calls[0].events.start(); expect(events.start).toHaveBeenCalledOnce();
  speaker.play(first, '', 1, 500); vi.advanceTimersByTime(250);
  speaker.play(next, '', 1, 500); vi.advanceTimersByTime(499); expect(calls).toHaveLength(1);
  vi.advanceTimersByTime(1); expect(calls.map(c => c.text)).toEqual(['one', 'net']);
  speaker.play(first, '', 1, 500); speaker.cancel(); vi.advanceTimersByTime(1000); expect(calls).toHaveLength(2);
  speaker.play(first, '', 1, 500); speaker.update(null, '', 1); vi.advanceTimersByTime(1000); expect(calls).toHaveLength(2);
  speaker.play(first, '', 1, 500); speaker.play(first, '', 1); vi.advanceTimersByTime(500); expect(calls).toHaveLength(3);
});
it('selects only local English browser voices and handles delayed discovery', () => {
  const native = (id: string, lang: string, localService: boolean, isDefault = false) => ({ voiceURI: id, name: id, lang, localService, default: isDefault });
  let voices: ReturnType<typeof native>[] = [];
  const synth = Object.assign(new EventTarget(), { getVoices: () => voices, speak: vi.fn(), cancel: vi.fn() });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  const adapter = browserSpeech(), update = vi.fn(), unsubscribe = adapter.subscribe(update);
  expect(adapter.voices()).toEqual([]);
  voices = [native('remote', 'en-US', false, true), native('French', 'fr-FR', true), native('US', 'en-US', true), native('UK', 'en-GB', true, true)];
  synth.dispatchEvent(new Event('voiceschanged')); expect(update).toHaveBeenCalledOnce();
  expect(adapter.voices().map(v => v.id)).toEqual(['US', 'UK']);
  expect(chooseVoice(adapter.voices(), 'US')?.id).toBe('US');
  expect(chooseVoice(adapter.voices(), 'remote')?.id).toBe('UK');
  adapter.speak('bad', adapter.voices()[0], 1.2, { start() {}, end() {}, error() {} });
  expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: voices[2], rate: 1.2, text: 'bad' }));
  unsubscribe(); synth.dispatchEvent(new Event('voiceschanged')); expect(update).toHaveBeenCalledOnce();
});
