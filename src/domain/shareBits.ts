const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export class BitWriter {
  bits = '';
  write(value: number | bigint, width: number) {
    const n = BigInt(value);
    if (n < 0n || n >= 1n << BigInt(width)) throw new Error('Value outside shared-test bounds.');
    if (width) this.bits += n.toString(2).padStart(width, '0');
  }
  gamma(value: number) {
    if (!Number.isInteger(value) || value < 1) throw new Error('Invalid change count.');
    const binary = value.toString(2);
    this.bits += '0'.repeat(binary.length - 1) + binary;
  }
  token() {
    const padded = this.bits.padEnd(Math.ceil(this.bits.length / 6) * 6, '0');
    return padded.match(/.{6}/g)!.map(bits => alphabet[parseInt(bits, 2)]).join('');
  }
}
export class BitReader {
  private bits: string;
  private cursor = 0;
  constructor(token: string) {
    if (!/^[A-Za-z0-9_-]{2,128}$/.test(token)) throw new Error('Invalid test link.');
    this.bits = [...token].map(c => alphabet.indexOf(c).toString(2).padStart(6, '0')).join('');
  }
  big(width: number): bigint {
    if (width < 0 || this.cursor + width > this.bits.length) throw new Error('Incomplete test link.');
    const bits = this.bits.slice(this.cursor, this.cursor += width);
    return bits ? BigInt('0b' + bits) : 0n;
  }
  read(width: number) { return Number(this.big(width)); }
  gamma(max: number) {
    let zeros = 0;
    while (this.read(1) === 0) if (++zeros > Math.floor(Math.log2(max))) throw new Error('Invalid change count.');
    const value = 2 ** zeros + this.read(zeros);
    if (value > max) throw new Error('Invalid change count.');
    return value;
  }
  finish() {
    const tail = this.bits.slice(this.cursor);
    if (tail.length > 5 || /1/.test(tail)) throw new Error('Unexpected data in test link.');
  }
}
export function choose(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  k = Math.min(k, n - k);
  let value = 1n;
  for (let i = 1; i <= k; i++) value = value * BigInt(n - k + i) / BigInt(i);
  return value;
}
export const rankWidth = (n: number, k: number) => (choose(n, k) - 1n).toString(2).replace(/^0$/, '').length;
export const subsetRank = (indices: number[]) => indices.reduce((rank, index, i) => rank + choose(index, i + 1), 0n);
export function subsetUnrank(n: number, k: number, rank: bigint) {
  if (rank < 0n || rank >= choose(n, k)) throw new Error('Invalid subset rank.');
  const indices = Array<number>(k);
  let upper = n - 1;
  for (let i = k; i >= 1; i--) {
    while (choose(upper, i) > rank) upper--;
    indices[i - 1] = upper;
    rank -= choose(upper, i); upper--;
  }
  return indices;
}
const idWidth = (length: number) => Math.ceil(Math.log2(length));
export function writeSet(writer: BitWriter, indices: number[], n: number, presets: readonly (readonly number[])[]) {
  const selected = new Set(indices);
  if (selected.size !== indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= n)) throw new Error('Invalid shared selection.');
  const candidates: { cost: number; mode: number; base: number; changes: number[] }[] = [{ cost: 2 + n, mode: 2, base: 0, changes: [] }];
  presets.forEach((preset, base) => {
    const original = new Set(preset);
    const changes = Array.from({ length: n }, (_, i) => i).filter(i => selected.has(i) !== original.has(i));
    const k = changes.length;
    if (!k) candidates.push({ cost: 2 + idWidth(presets.length), mode: 0, base, changes });
    else if (k <= Math.floor(n / 2)) candidates.push({ cost: 2 + idWidth(presets.length) + 2 * Math.floor(Math.log2(k)) + 1 + rankWidth(n, k), mode: 1, base, changes });
  });
  candidates.sort((a, b) => a.cost - b.cost || a.mode - b.mode || a.base - b.base);
  const best = candidates[0]; writer.write(best.mode, 2);
  if (best.mode === 2) { for (let i = 0; i < n; i++) writer.write(selected.has(i) ? 1 : 0, 1); }
  else {
    writer.write(best.base, idWidth(presets.length));
    if (best.mode === 1) { writer.gamma(best.changes.length); writer.write(subsetRank(best.changes), rankWidth(n, best.changes.length)); }
  }
}
export function readSet(reader: BitReader, n: number, presets: readonly (readonly number[])[]) {
  const mode = reader.read(2);
  if (mode === 3) throw new Error('Invalid selection encoding.');
  if (mode === 2) return Array.from({ length: n }, (_, i) => reader.read(1) ? i : -1).filter(i => i >= 0);
  const preset = presets[reader.read(idWidth(presets.length))];
  if (!preset) throw new Error('Invalid selection preset.');
  const selection = new Set(preset);
  if (mode === 1) {
    const k = reader.gamma(Math.floor(n / 2));
    for (const i of subsetUnrank(n, k, reader.big(rankWidth(n, k)))) {
      if (selection.has(i)) selection.delete(i); else selection.add(i);
    }
  }
  return [...selection].sort((a, b) => a - b);
}
