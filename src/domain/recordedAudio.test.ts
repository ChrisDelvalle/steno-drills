import { afterEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { AudioQueue, ByteLru, RecordedLoader, phoneKey, recordedSpeech, recordedVoice, resolveClip, validateAudioManifest, wavBytes } from './recordedAudio';
import type { AudioManifest, RecordedEnvironment } from './recordedAudio';
import type { SpeechAdapter, SpeechEvents } from './speech';
import { chooseVoice } from './speech';

const bytes = new Uint8Array([1,2,3,4]);
const hash = createHash('sha256').update(bytes).digest('hex');
const sprite = { url: `/audio/instructor/${hash}.opus`, sha256: hash, bytes: 4, samples: 12 };
const manifest: AudioManifest = { version: 1, sampleRate: 24000, words: 2, sprites: [sprite], fallback: [], clips: [
  { word: 'read', phones: 'R EH D', outlines: ['RAED'], sprite: 0, start: 0, end: 6 },
  { word: 'read', phones: 'R IY D', outlines: ['RAOED'], sprite: 0, start: 6, end: 12 },
] };
function environment() {
  vi.stubGlobal('crypto',webcrypto);
  const fetcher = vi.fn(async (url: string) => url === '/catalog' ? new Response(JSON.stringify(manifest)) : new Response(bytes));
  const decode = vi.fn(async () => Float32Array.from({length:12},(_,i)=>i/12));
  const stop = vi.fn();
  const play = vi.fn((_samples: Float32Array,_rate: number,_events: SpeechEvents) => stop);
  const env: RecordedEnvironment = { manifestUrl: '/catalog', fetch: fetcher, decode, play };
  return { env, fetcher, decode, play, stop };
}
const target = { word: 'read', outline: 'RAED', pronunciations: [['R','EH1','D']] };
const events = () => ({ start: vi.fn(), end: vi.fn(), error: vi.fn(), status: vi.fn() });
function browser(available = true): SpeechAdapter {
  return { voices: () => available ? [{ id:'device',name:'Device',lang:'en-US',default:true }] : [], subscribe:()=>()=>{},cancel:vi.fn(),speak:vi.fn() };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('defaults to recorded speech while preserving an explicitly selected device voice', () => {
  const device = browser().voices()[0];
  expect(chooseVoice([recordedVoice, device],'')).toBe(recordedVoice);
  expect(chooseVoice([recordedVoice],'missing-device')).toBe(recordedVoice);
  expect(chooseVoice([recordedVoice],recordedVoice.id)).toBe(recordedVoice);
  expect(chooseVoice([recordedVoice, device],device.id)).toBe(device);
});
it('resolves the outline pronunciation and rejects incompatible personal corrections', () => {
  expect(phoneKey(['R','EH1','D'])).toBe('R EH D');
  expect(resolveClip(manifest,target)?.start).toBe(0);
  expect(resolveClip(manifest,{word:'read',outline:'RAOED',pronunciations:[['R','IY1','D']]})?.start).toBe(6);
  expect(resolveClip(manifest,{...target,pronunciations:[['R','IY1','D']]})).toBeUndefined();
  expect(resolveClip(manifest,{...target,pronunciations:[]})).toBeUndefined();
  expect(resolveClip(manifest,{...target,outline:'RED'})?.start).toBe(0);
  expect(resolveClip(manifest,{word:'unknown'})).toBeUndefined();
});
it('respects effective dictionary pronunciation order instead of manifest display order', () => {
  expect(resolveClip(manifest,{word:'read',pronunciations:[['R','IY1','D'],['R','EH1','D']]})?.start).toBe(6);
});
it('prefers a clear citation form only when compatible with the effective pronunciation', () => {
  const collection = { ...manifest, clips: [{...manifest.clips[0]}, {...manifest.clips[1], preferred: true}] };
  expect(resolveClip(collection, {word:'read', pronunciations:[['R','EH1','D'],['R','IY1','D']]})?.start).toBe(6);
  expect(resolveClip(collection, target)?.start).toBe(0);
});
it('validates bounded manifests, duplicate pronunciations, and sample ranges', () => {
  expect(validateAudioManifest(manifest)).toBe(manifest);
  const lossless = { ...manifest, sprites: [{ ...sprite, url: sprite.url.replace('.opus', '.flac') }] };
  expect(validateAudioManifest(lossless)).toBe(lossless);
  expect(()=>validateAudioManifest({...manifest,version:2})).toThrow();
  expect(()=>validateAudioManifest({...manifest,sprites:[{...sprite,bytes:48001}]})).toThrow();
  expect(()=>validateAudioManifest({...manifest,sprites:[{...sprite,url:'https://example.com/a.opus'}]})).toThrow();
  expect(()=>validateAudioManifest({...manifest,clips:[{...manifest.clips[0],end:13}]})).toThrow();
  expect(()=>validateAudioManifest({...manifest,clips:[manifest.clips[0],manifest.clips[0]]})).toThrow();
});
it('coalesces sprite fetch/decode, extracts exact samples, and retains only requested clips', async () => {
  const h = environment(), loader = new RecordedLoader(h.env);
  const clips = await loader.group([target,{word:'read',outline:'RAOED'}]);
  expect(h.fetcher.mock.calls.map(c=>c[0])).toEqual(['/catalog',sprite.url]);
  expect(h.decode).toHaveBeenCalledOnce();
  expect([...clips[0]]).toEqual([...Float32Array.from({length:6},(_,i)=>i/12)]);
  expect(clips[1][0]).toBe(.5);
  expect(loader.clips.bytes).toBe(48);
  loader.cancel(); await loader.group([target]);
  expect(h.decode).toHaveBeenCalledOnce();
});
it('rejects corrupt assets and decoded boundary mismatches', async () => {
  const h = environment();
  h.env.fetch = async url => url === '/catalog' ? new Response(JSON.stringify(manifest)) : new Response(new Uint8Array([9,2,3,4]));
  await expect(new RecordedLoader(h.env).group([target])).rejects.toThrow('Invalid recording');
  h.env.fetch = h.fetcher; h.decode.mockResolvedValue(new Float32Array(4));
  await expect(new RecordedLoader(h.env).group([target])).rejects.toThrow('boundary');
});
it('survives unavailable storage and reuses persistent compressed audio on reload', async () => {
  const h = environment(), stored = new Map<string,Response>();
  const cache = { match: async (key: string | Request) => stored.get(typeof key==='string'?key:key.url)?.clone(),
    put: async (key: string,value: Response) => {stored.set(key,value.clone());}, delete: async (key: string | Request) => stored.delete(typeof key==='string'?key:key.url), keys: async()=>[...stored.keys()].map(url=>({url})) };
  h.env.storage = {open:async()=>cache} as unknown as CacheStorage;
  await new RecordedLoader(h.env).group([target]);
  await vi.waitFor(()=>expect(stored.size).toBe(1));
  const loader = new RecordedLoader(h.env); await loader.group([target]);
  expect(h.fetcher.mock.calls.filter(c=>c[0]===sprite.url)).toHaveLength(1);
  h.env.storage = {open:async()=>{throw Error('quota');}} as unknown as CacheStorage;
  await expect(new RecordedLoader(h.env).group([target])).resolves.toHaveLength(1);
});
it('bounds caches by bytes and keeps recently used entries', () => {
  const cache = new ByteLru<string>(10); cache.set('a','a',5); cache.set('b','b',5); cache.get('a'); cache.set('c','c',5);
  expect(cache.get('b')).toBeUndefined(); expect(cache.get('a')).toBe('a'); expect(cache.bytes).toBe(10);
  cache.set('huge','x',11); expect(cache.bytes).toBe(10);
});
it('limits work to four jobs, promotes queued urgent work, and cancels queued jobs', async () => {
  const queue = new AudioQueue(), started: number[] = [], release: (()=>void)[] = [];
  const job = (i:number) => async()=>{started.push(i);await new Promise<void>(r=>release.push(r));};
  const jobs = Array.from({length:6},(_,i)=>queue.add(job(i),false));
  const urgent = queue.add(job(6),true);
  expect(started).toEqual([0,1,2,3]); release.shift()!();
  await vi.waitFor(()=>expect(started).toContain(6));
  const cancelled = Promise.allSettled(jobs); queue.clear();
  release.splice(0).forEach(r=>r()); await urgent;
  const results = await cancelled; expect(results.filter(r=>r.status==='rejected')).toHaveLength(2);
});
it('plays the group once and falls back as a whole without mixing voices', async () => {
  const h=environment(), native=browser(), adapter=recordedSpeech(native,h.env), e=events();
  adapter.speak('read read',recordedVoice,1.5,e,{id:'a',text:'read read',words:[target,{word:'read',outline:'RAOED'}]});
  await vi.waitFor(()=>expect(h.play).toHaveBeenCalledOnce());
  expect(h.play.mock.calls[0][0]).toHaveLength(12); expect(h.play.mock.calls[0][1]).toBe(1.5);
  expect(e.start).not.toHaveBeenCalled(); h.play.mock.calls[0][2].start(); expect(e.start).toHaveBeenCalledOnce();
  adapter.cancel(); expect(h.stop).toHaveBeenCalledOnce();
  adapter.speak('read unknown',recordedVoice,1,e,{id:'b',text:'read unknown',words:[target,{word:'unknown'}]});
  await vi.waitFor(()=>expect(native.speak).toHaveBeenCalledOnce());
  expect(e.status).toHaveBeenLastCalledWith('Using device voice'); expect(h.play).toHaveBeenCalledOnce();
});
it('does not fall back after playback starts, and reports unavailable fallback voices', async () => {
  const h=environment(), native=browser(false), adapter=recordedSpeech(native,h.env), e=events();
  adapter.speak('unknown',recordedVoice,1,e); await vi.waitFor(()=>expect(e.error).toHaveBeenCalledOnce());
  adapter.speak('read',recordedVoice,1,e,{id:'a',text:'read',words:[target]});
  await vi.waitFor(()=>expect(h.play).toHaveBeenCalledOnce());
  h.play.mock.calls[0][2].start(); h.play.mock.calls[0][2].error('Audio failed.');
  expect(native.speak).not.toHaveBeenCalled(); expect(e.error).toHaveBeenLastCalledWith('Audio failed.');
});
it('falls back on stalled preparation and never plays the late recording afterward', async () => {
  vi.useFakeTimers();const h=environment(),native=browser(),adapter=recordedSpeech(native,h.env),e=events();
  let release!:(r:Response)=>void;h.env.fetch=()=>new Promise<Response>(r=>{release=r;});
  adapter.speak('read',recordedVoice,1,e,{id:'a',text:'read',words:[target]});
  await vi.advanceTimersByTimeAsync(2501);expect(native.speak).toHaveBeenCalledOnce();
  release(new Response(JSON.stringify(manifest)));await vi.advanceTimersByTimeAsync(0);expect(h.play).not.toHaveBeenCalled();adapter.cancel();
});
it('ignores cancelled loading and retries after cancelling a pending manifest', async () => {
  const h=environment(), native=browser(), adapter=recordedSpeech(native,h.env), e=events();
  const original = h.env.fetch; let resolve!: (r:Response)=>void;
  h.env.fetch=()=>new Promise<Response>(r=>{resolve=r;});
  adapter.speak('read',recordedVoice,1,e,{id:'a',text:'read',words:[target]});
  adapter.cancel(); h.env.fetch=original;
  adapter.speak('read',recordedVoice,1,e,{id:'b',text:'read',words:[target]});
  resolve(new Response(JSON.stringify(manifest)));
  await vi.waitFor(()=>expect(h.play).toHaveBeenCalledOnce()); expect(native.speak).not.toHaveBeenCalled();
});
it('keeps preparation alive across prompt changes and cancels it on a session boundary', async () => {
  const h=environment(),adapter=recordedSpeech(browser(),h.env),e=events();
  let signal!: AbortSignal,release!:()=>void;
  const fetcher=h.env.fetch;
  h.env.fetch=async(url,s)=>{if(url===sprite.url){signal=s;await new Promise<void>(r=>release=r);}return fetcher(url,s);};
  adapter.prepare!({id:'a',text:'read',words:[target]},[]);
  await vi.waitFor(()=>expect(release).toBeDefined()); adapter.cancel(true);expect(signal.aborted).toBe(false);
  adapter.speak('read',recordedVoice,1,e,{id:'b',text:'read',words:[target]});release();
  await vi.waitFor(()=>expect(h.play).toHaveBeenCalledOnce());adapter.cancel();expect(signal.aborted).toBe(true);
});
it('writes a mono 24 kHz WAV without changing source sample count', () => {
  const result = wavBytes(new Float32Array([-.5,0,.5])), view = new DataView(result);
  expect(result.byteLength).toBe(50); expect(view.getUint32(24,true)).toBe(24000); expect(view.getUint32(40,true)).toBe(6);
  expect(view.getInt16(44,true)).toBe(-16383);
});
