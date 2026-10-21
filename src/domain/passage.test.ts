import { expect, it } from 'vitest';
import { passageWindow, wrapPassage } from './passage';

it('wraps expected widths into complete rows without dropping or duplicating words', () => {
  const rows = wrapPassage(Array(10).fill(50), 200, 10);
  expect(rows).toEqual([{ start: 0, end: 3 }, { start: 3, end: 6 }, { start: 6, end: 9 }, { start: 9, end: 10 }]);
  expect(wrapPassage([2000, 20], 200, 10)).toEqual([{ start: 0, end: 1 }, { start: 1, end: 2 }]);
  expect(wrapPassage([], 200, 10)).toEqual([]);
  expect(wrapPassage([50], 0, 10)).toEqual([]);
});
it('keeps the active row second until reaching the finite end, and follows backspace', () => {
  const rows = wrapPassage(Array(30).fill(50), 200, 10);
  expect(passageWindow(rows, 0, 3)).toMatchObject({ start: 0, active: 0 });
  expect(passageWindow(rows, 4, 3)).toMatchObject({ start: 0, active: 1 });
  expect(passageWindow(rows, 6, 3)).toMatchObject({ start: 1, active: 2 });
  expect(passageWindow(rows, 29, 3)).toMatchObject({ start: 7, active: 9 });
  expect(passageWindow(rows, 2, 3)).toMatchObject({ start: 0, active: 0 });
  expect(passageWindow(rows, 15, 5).lines).toHaveLength(5);
});
