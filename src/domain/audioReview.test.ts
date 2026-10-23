import { describe, expect, it } from 'vitest';
import { approvedWaveData } from '../../scripts/approved-wave';

function source() {
  const bytes = new Uint8Array(52), v = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c,i) => bytes[at+i] = c.charCodeAt(0));
  text(0,'RIFF'); v.setUint32(4,44,true); text(8,'WAVE'); text(12,'fmt '); v.setUint32(16,16,true);
  v.setUint16(20,3,true); v.setUint16(22,1,true); v.setUint32(24,24000,true); v.setUint32(28,96000,true); v.setUint16(32,4,true); v.setUint16(34,32,true);
  text(36,'data'); v.setUint32(40,8,true); v.setFloat32(44,.25,true); v.setFloat32(48,-.25,true);
  return bytes;
}
describe('listening-review source integrity', () => {
  it('extracts exact float samples without resampling or normalization', () => {
    const bytes = source(), result = approvedWaveData(bytes);
    expect(result.samples).toBe(2); expect(result.pcm).toEqual(bytes.subarray(44));
  });
  it('rejects truncated chunks and incomplete sample frames', () => {
    expect(() => approvedWaveData(source().slice(0,-1))).toThrow();
    const bytes = source(); new DataView(bytes.buffer).setUint32(40,7,true);
    expect(() => approvedWaveData(bytes)).toThrow();
  });
  it('rejects a different sample rate, format, or nonfinite audio', () => {
    for (const change of [(v: DataView) => v.setUint32(24,48000,true), (v: DataView) => v.setUint16(20,1,true), (v: DataView) => v.setFloat32(44,NaN,true)]) {
      const bytes = source(); change(new DataView(bytes.buffer)); expect(() => approvedWaveData(bytes)).toThrow();
    }
  });
});
