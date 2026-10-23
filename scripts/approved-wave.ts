/** Read the exact float PCM rated in the local listening harness. */
export function approvedWaveData(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const invalid = () => { throw Error('Invalid approved WAV source.'); };
  if (bytes.length < 44 || text(0) !== 'RIFF' || text(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) invalid();
  let format = false, pcm: Uint8Array | undefined;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) invalid();
    const size = view.getUint32(at + 4, true), start = at + 8, end = start + size;
    if (end > bytes.length) invalid();
    if (text(at) === 'fmt ') {
      if (format || size < 16 || view.getUint16(start, true) !== 3 || view.getUint16(start + 2, true) !== 1 || view.getUint32(start + 4, true) !== 24000 || view.getUint32(start + 8, true) !== 96000 || view.getUint16(start + 12, true) !== 4 || view.getUint16(start + 14, true) !== 32) invalid();
      format = true;
    } else if (text(at) === 'data') {
      if (pcm || !size || size % 4) invalid();
      pcm = bytes.subarray(start, end);
    }
    at = end + size % 2;
  }
  if (!format || !pcm || pcm.length / 4 > 960000) invalid();
  const samples = new DataView(pcm!.buffer, pcm!.byteOffset, pcm!.byteLength);
  for (let at = 0; at < pcm!.length; at += 4) if (!Number.isFinite(samples.getFloat32(at, true)) || Math.abs(samples.getFloat32(at, true)) > 1) invalid();
  return { pcm: pcm!, samples: pcm!.length / 4 };
}
