export interface PassageLine { start: number; end: number }

// Widths come only from expected words, never from user input or annotations.
export function wrapPassage(widths: number[], width: number, gap: number): PassageLine[] {
  if (!widths.length || width <= 0) return [];
  const lines: PassageLine[] = [];
  let start = 0, used = 0;
  widths.forEach((word, i) => {
    const size = Math.min(word, width);
    if (i > start && used + gap + size > width + .05) {
      lines.push({ start, end: i }); start = i; used = 0;
    }
    used += (i > start ? gap : 0) + size;
  });
  lines.push({ start, end: widths.length });
  return lines;
}

export function passageWindow(lines: PassageLine[], current: number, visible: number) {
  const active = Math.max(0, lines.findIndex(line => current >= line.start && current < line.end));
  const start = Math.min(Math.max(0, active - 1), Math.max(0, lines.length - visible));
  return { start, active, lines: lines.slice(start, start + visible) };
}
