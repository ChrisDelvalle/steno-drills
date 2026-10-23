import published from '../../data/audio/published.json';
import type { PracticeWord } from './types';
import { analyzeOutline } from './classifier';
import { chooseVoice } from './speech';
import type { SpeechAdapter, SpeechEvents, SpokenPrompt } from './speech';

export const recordedVoiceId = 'recorded:clear-instructor';
export const recordedVoice = { id: recordedVoiceId, name: 'Clear instructor', lang: 'en-US', default: true };
export interface AudioSprite { url: string; sha256: string; bytes: number; samples: number; bitrate?: number }
export interface AudioClip { word: string; phones: string; outlines: string[]; sprite: number; start: number; end: number; preferred?: boolean; spokenPhones?: string }
export interface AudioManifest { version: 1; sampleRate: 24000; sprites: AudioSprite[]; clips: AudioClip[]; words: number; fallback: { id: string; reason: string }[] }
export const phoneKey = (phones: string[]) => phones.map(p => p.replace(/[012]$/, '')).join(' ');
export function validateAudioManifest(value: unknown): AudioManifest {
  const m = value as AudioManifest;
  if (!m || m.version !== 1 || m.sampleRate !== 24000 || !Number.isInteger(m.words) || m.words < 0 || !Array.isArray(m.fallback) || m.fallback.length > 100000 || !Array.isArray(m.sprites) || !Array.isArray(m.clips) || m.sprites.length > 20000 || m.clips.length > 100000) throw Error('Invalid audio collection.');
  for (const s of m.sprites) {
    if (!/^\/audio\/instructor\/[a-f0-9]{64}\.(?:opus|flac)$/.test(s.url) || !/^[a-f0-9]{64}$/.test(s.sha256) || (!s.url.endsWith(s.sha256+'.opus') && !s.url.endsWith(s.sha256+'.flac')) || !Number.isInteger(s.bytes) || s.bytes < 1 || s.bytes > 48000 || !Number.isInteger(s.samples) || s.samples < 1 || s.samples > 960000 || (s.bitrate !== undefined && ![10000,16000,24000,32000,48000,64000].includes(s.bitrate))) throw Error('Invalid audio sprite.');
  }
  const keys = new Set<string>();
  for (const c of m.clips) {
    const s = m.sprites[c.sprite], key = `${c.word}|${c.phones}`;
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(c.word) || typeof c.phones !== 'string' || !c.phones || (c.preferred !== undefined && typeof c.preferred !== 'boolean') || (c.spokenPhones !== undefined && (typeof c.spokenPhones !== 'string' || !c.spokenPhones)) || !Array.isArray(c.outlines) || c.outlines.some(o => typeof o !== 'string') || !Number.isInteger(c.sprite) || !s || !Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start < 0 || c.end <= c.start || c.end > s.samples || keys.has(key)) throw Error('Invalid audio clip.');
    keys.add(key);
  }
  return m;
}
export function resolveClip(manifest: AudioManifest, target: PracticeWord): AudioClip | undefined {
  const keys = target.pronunciations?.filter(phones => !target.outline || analyzeOutline(target.word,target.outline,[phones]).requirements.length).map(phoneKey);
  const matches = manifest.clips.filter(c => c.word === target.word.toLowerCase());
  const compatible = keys ? keys.flatMap(key => matches.filter(c => c.phones === key)) : matches.filter(c => !target.outline || c.outlines.includes(target.outline));
  return compatible.find(c => c.preferred) || compatible[0];
}
export class ByteLru<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  bytes = 0;
  constructor(readonly limit: number) {}
  get(key: string) { const item = this.entries.get(key); if (item) { this.entries.delete(key); this.entries.set(key, item); } return item?.value; }
  set(key: string, value: T, bytes: number) {
    const old = this.entries.get(key); if (old) { this.bytes -= old.bytes; this.entries.delete(key); }
    if (bytes > this.limit) return;
    this.entries.set(key, { value, bytes }); this.bytes += bytes;
    while (this.bytes > this.limit) { const first = this.entries.entries().next().value!; this.entries.delete(first[0]); this.bytes -= first[1].bytes; }
  }
}
const aborted = () => new DOMException('Cancelled', 'AbortError');
export class AudioQueue {
  private tasks: { run: () => Promise<unknown>; reject: (e: unknown) => void; priority: boolean }[] = [];
  private active = 0;
  constructor(readonly limit = 4) {}
  add<T>(run: () => Promise<T>, priority: boolean): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = { run: async () => { try { resolve(await run()); } catch (e) { reject(e); } }, reject, priority };
      const before = priority ? this.tasks.findIndex(t => !t.priority) : -1;
      if (before >= 0) this.tasks.splice(before, 0, task); else this.tasks.push(task);
      this.pump();
    });
  }
  clear() { for (const task of this.tasks.splice(0)) task.reject(aborted()); }
  private pump() {
    while (this.active < this.limit && this.tasks.length) {
      const task = this.tasks.shift()!; this.active++;
      void task.run().finally(() => { this.active--; this.pump(); });
    }
  }
}
export interface RecordedEnvironment {
  fetch(url: string, signal: AbortSignal): Promise<Response>;
  decode(bytes: ArrayBuffer): Promise<Float32Array>;
  play(samples: Float32Array, rate: number, events: SpeechEvents): () => void;
  activate?(): void;
  storage?: CacheStorage;
  manifestUrl: string;
}
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export class RecordedLoader {
  readonly compressed = new ByteLru<ArrayBuffer>(32 * 1024 * 1024);
  readonly clips = new ByteLru<Float32Array>(24 * 1024 * 1024);
  private queue = new AudioQueue(4);
  private controller = new AbortController();
  private manifestPromise?: Promise<AudioManifest>;
  private catalog?: AudioManifest;
  private inflight = new Map<string, Promise<Float32Array>>();
  private storageWrites: Promise<unknown> = Promise.resolve();
  constructor(private environment: RecordedEnvironment) {}
  cancel() { this.controller.abort(); this.controller = new AbortController(); this.queue.clear(); this.inflight.clear(); if (!this.catalog) this.manifestPromise = undefined; }
  async manifest() {
    if (this.catalog) return this.catalog;
    if (!this.manifestPromise) {
      const signal = this.controller.signal;
      const pending = this.environment.fetch(this.environment.manifestUrl, signal).then(async r => { if (!r.ok) throw Error('Audio collection unavailable.'); const catalog = validateAudioManifest(await r.json()); if (signal.aborted) throw aborted(); this.catalog = catalog; return catalog; });
      this.manifestPromise = pending;
      void pending.catch(() => { if (this.manifestPromise === pending) this.manifestPromise = undefined; });
    }
    return this.manifestPromise;
  }
  async group(words: PracticeWord[], priority = true): Promise<Float32Array[]> {
    const signal = this.controller.signal, manifest = await this.manifest();
    if (signal.aborted) throw aborted();
    const clips = words.map(w => resolveClip(manifest, w));
    if (clips.some(c => !c)) throw Error('Recording unavailable.');
    return Promise.all(clips.map(c => this.clip(c!, manifest, priority, signal)));
  }
  private async clip(clip: AudioClip, manifest: AudioManifest, priority: boolean, signal: AbortSignal) {
    const sprite = manifest.sprites[clip.sprite], key = `${sprite.sha256}:${clip.start}:${clip.end}`;
    const cached = this.clips.get(key); if (cached) return cached;
    let pending = this.inflight.get(sprite.url);
    if (!pending) {
      pending = this.queue.add(async () => {
        if (signal.aborted) throw aborted();
        const bytes = await this.bytes(sprite, signal);
        const decoded = await this.environment.decode(bytes.slice(0));
        if (signal.aborted) throw aborted();
        if (Math.abs(decoded.length - sprite.samples) > 2) throw Error('Audio boundary mismatch.');
        return decoded;
      }, priority);
      this.inflight.set(sprite.url, pending);
      const current = pending;
      void pending.finally(() => { if (this.inflight.get(sprite.url) === current) this.inflight.delete(sprite.url); }).catch(() => {});
    }
    const decoded = await pending;
    if (signal.aborted) throw aborted();
    const samples = decoded.slice(clip.start, clip.end);
    this.clips.set(key, samples, samples.byteLength);
    return samples;
  }
  private async bytes(sprite: AudioSprite, signal: AbortSignal) {
    const cached = this.compressed.get(sprite.url); if (cached) return cached;
    let cache: Cache | undefined, response: Response | undefined;
    try { cache = await this.environment.storage?.open('steno-drills-audio-v1'); response = await cache?.match(sprite.url); } catch { /* Audio also works without persistent storage. */ }
    if (!response) response = await this.environment.fetch(sprite.url, signal);
    if (!response.ok) throw Error('Recording unavailable.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== sprite.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== sprite.sha256) { try { await cache?.delete(sprite.url); } catch { /* best effort */ } throw Error('Invalid recording.'); }
    if (signal.aborted) throw aborted();
    this.compressed.set(sprite.url, bytes, bytes.byteLength);
    if (cache) {
      const store = cache;
      this.storageWrites = this.storageWrites.catch(() => {}).then(async () => {
        await store.delete(sprite.url);
        await store.put(sprite.url, new Response(bytes, { headers: { 'Content-Type': sprite.url.endsWith('.flac') ? 'audio/flac' : 'audio/ogg', 'Content-Length': String(bytes.byteLength) } }));
        const keys = [...await store.keys()]; let size = 0;
        for (const key of keys.reverse()) { const item = await store.match(key); size += Number(item?.headers.get('Content-Length') || 48000); if (size > this.compressed.limit) await store.delete(key); }
      }).catch(() => {});
    }
    return bytes;
  }
}
export function wavBytes(samples: Float32Array) {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((c,i) => view.setUint8(offset+i,c.charCodeAt(0)));
  text(0,'RIFF'); view.setUint32(4,bytes.byteLength-8,true); text(8,'WAVE'); text(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,24000,true); view.setUint32(28,48000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,samples.length*2,true);
  samples.forEach((s,i) => view.setInt16(44+i*2, Math.round(Math.max(-1,Math.min(1,s))*32767),true));
  return bytes;
}
export function browserRecordedEnvironment(): RecordedEnvironment {
  let context: OfflineAudioContext | undefined;
  let player: HTMLAudioElement | undefined;
  let storage: CacheStorage | undefined;
  try { storage = globalThis.caches; } catch { /* private browsing */ }
  return { manifestUrl: published.manifest, storage,
    activate() {
      player ||= new Audio();
      // Unlock this media element inside the user's gesture, before fetch/decode.
      if (!player.src) { const url = URL.createObjectURL(new Blob([wavBytes(new Float32Array(1))], { type: 'audio/wav' })); player.src = url; void player.play().then(() => URL.revokeObjectURL(url), () => URL.revokeObjectURL(url)); }
    },
    fetch: (url, signal) => fetch(url, { signal }),
    async decode(bytes) { context ||= new OfflineAudioContext(1,1,24000); const audio = await context.decodeAudioData(bytes); return audio.getChannelData(0); },
    play(samples, rate, events) {
      const url = URL.createObjectURL(new Blob([wavBytes(samples)], { type: 'audio/wav' })), audio = player ||= new Audio();
      audio.src = url;
      let stopped = false, started = false;
      const stop = () => { if (stopped) return; stopped = true; audio.onplaying = audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); };
      const fail = () => { if (stopped) return; stop(); events.error('Audio failed. Select Replay to try again.'); };
      audio.defaultPlaybackRate = rate; audio.playbackRate = rate; audio.preservesPitch = true;
      audio.onplaying = () => { if (!stopped && !started) { started = true; events.start(); } };
      audio.onended = () => { if (!stopped) { stop(); events.end(); } }; audio.onerror = fail;
      void audio.play().catch(error => { if (!stopped) { stop(); events.error(error?.name === 'NotAllowedError' ? 'Playback blocked. Select Replay to try again.' : 'Audio failed. Select Replay to try again.'); } });
      return stop;
    },
  };
}
export function recordedSpeech(browser: SpeechAdapter, environment = browserRecordedEnvironment()): SpeechAdapter {
  const loader = new RecordedLoader(environment);
  let generation = 0, stop: (() => void) | undefined, preparation: { prompt: SpokenPrompt; upcoming: PracticeWord[] } | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const words = (prompt: SpokenPrompt) => prompt.words || prompt.text.split(/\s+/).map(word => ({ word }));
  const warm = (upcoming: PracticeWord[], at: number) => {
    if (at !== generation || !upcoming.length) return;
    void loader.manifest().then(manifest => { if (at === generation) void loader.group(upcoming.slice(0,20).filter(w => resolveClip(manifest,w)),false).catch(() => {}); }, () => {});
  };
  return {
    voices: () => [recordedVoice, ...browser.voices()], subscribe: listener => browser.subscribe(listener),
    cancel(keepPreparation = false) { generation++; clearTimeout(deadline); stop?.(); stop = undefined; if (!keepPreparation) { loader.cancel(); preparation = undefined; } browser.cancel(); },
    prepare(prompt, upcoming) {
      preparation = { prompt, upcoming }; const at = generation;
      void loader.group(words(prompt)).then(() => warm(upcoming, at), () => warm(upcoming, at));
    },
    speak(text, voice, rate, events, prompt = { id: '', text }) {
      if (voice.id !== recordedVoiceId) { browser.speak(text,voice,rate,events,prompt); return; }
      environment.activate?.();
      const at = generation;
      let settled = false;
      const fallback = () => {
        if (at !== generation || settled) return;
        settled = true; clearTimeout(deadline);
        const voice = chooseVoice(browser.voices(),'');
        if (!voice) { events.error('Recording unavailable. Choose another voice in settings.'); return; }
        events.status?.('Using device voice'); browser.speak(text,voice,rate,events,prompt);
      };
      deadline = setTimeout(fallback,2500);
      void loader.group(words(prompt)).then(clips => {
        if (at !== generation || settled) return;
        clearTimeout(deadline);
        const samples = new Float32Array(clips.reduce((n,c) => n+c.length,0)); let offset = 0;
        for (const clip of clips) { samples.set(clip,offset); offset += clip.length; }
        events.status?.('');
        try { stop = environment.play(samples,rate,events); settled = true; } catch { fallback(); }
        if (preparation?.prompt.id === prompt.id) warm(preparation.upcoming,at);
      }, fallback);
    },
  };
}
