// Re-encode the chosen voice only. No inference, downloads, or source changes.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, '.audio-audition');
const publicRoot = resolve(work, 'public');
const manifestPath = resolve(publicRoot, 'compression.json');
const data = JSON.parse(await readFile(resolve(publicRoot, 'candidates.json'), 'utf8'));
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const voice = data.voices.find(v => v.id === 'instructor');
if (!voice || data.words.length !== 32 || new Set(data.words).size !== 32 || data.words.some(word => !/^[a-z]+$/.test(word))) throw new Error('Generate the Clear instructor word auditions first.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout.trim();
};
const encoding = { ...config.encoding, bitrates: [6, 8, 10, 12], encoder: run('ffmpeg', ['-version']).split('\n')[0] };
const recipe = hash(JSON.stringify(encoding));
let previous;
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const output = { version: 1, voice, words: data.words, notes: data.notes, sequence: data.sequence,
  qualities: ['original', '16', '12', '10', '8', '6'], encoding, recipe,
  clips: {}, sequences: {}, sources: {}, complete: false, report: { bytesByQuality: {}, wordBytesByQuality: {}, sequenceBytesByQuality: {} } };
const start = performance.now();
for (const word of [...data.words, 'sequence']) {
  const originals = word === 'sequence' ? data.sequences.instructor : data.clips.instructor[word];
  if (!originals?.original || !originals['16']) throw new Error(`Missing source: ${word}`);
  if (originals.original.url !== `/clips/instructor/${word}.wav`) throw new Error(`Unexpected source path: ${word}`);
  const master = resolve(publicRoot, originals.original.url.slice(1));
  if (hash(await readFile(master)) !== originals.original.sha256) throw new Error(`Source checksum mismatch: ${word}`);
  output.sources[word] = originals.original.sha256;
  const files = { original: originals.original, 16: originals['16'] };
  for (const rate of encoding.bitrates) {
    const url = `/clips/instructor/${word}.${rate}.opus`;
    const path = resolve(publicRoot, url.slice(1));
    const cached = (word === 'sequence' ? previous?.sequences : previous?.clips?.[word])?.[rate];
    let reusable = previous?.recipe === recipe && previous?.sources?.[word] === originals.original.sha256 && cached?.url === url;
    if (reusable) {
      try { reusable = hash(await readFile(path)) === cached.sha256; }
      catch (error) { if (error.code === 'ENOENT') reusable = false; else throw error; }
    }
    if (reusable) { files[rate] = cached; continue; }
    const temporary = path.replace(/\.opus$/, '.tmp.opus');
    await mkdir(resolve(publicRoot, 'clips/instructor'), { recursive: true });
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', master, '-map_metadata', '-1',
      '-c:a', 'libopus', '-b:a', `${rate}k`, '-vbr', encoding.vbr, '-application', encoding.application,
      '-compression_level', String(encoding.complexity), '-frame_duration', String(encoding.frameDuration), temporary]);
    const duration = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', temporary]));
    if (!Number.isFinite(duration) || Math.abs(duration - originals.original.duration) > .05) throw new Error(`Invalid encoded duration: ${word} at ${rate}`);
    const bytes = await readFile(temporary);
    await rename(temporary, path);
    files[rate] = { url, bytes: bytes.length, duration: originals.original.duration, sha256: hash(bytes) };
  }
  if (word === 'sequence') output.sequences = files;
  else output.clips[word] = files;
  console.log(`Clear instructor: ${word}`);
}
for (const quality of output.qualities) {
  output.report.wordBytesByQuality[quality] = Object.values(output.clips).reduce((sum, files) => sum + files[quality].bytes, 0);
  output.report.sequenceBytesByQuality[quality] = output.sequences[quality].bytes;
  output.report.bytesByQuality[quality] = output.report.wordBytesByQuality[quality] + output.report.sequenceBytesByQuality[quality];
}
output.complete = true;
output.report.encodingSeconds = Math.round((performance.now() - start) / 10) / 100;
await writeFile(manifestPath + '.tmp', JSON.stringify(output, null, 2) + '\n');
await rename(manifestPath + '.tmp', manifestPath);
console.log(JSON.stringify(output.report, null, 2));
