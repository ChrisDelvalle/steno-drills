import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ChartConfiguration, TooltipModel } from 'chart.js';
import ResultsChart from './ResultsChart';
import type { ErrorSample } from '../domain/practice';

const chart = vi.hoisted(() => ({ configuration: null as unknown as ChartConfiguration<'line'> }));
vi.mock('chart.js', () => ({
  Chart: class {
    static register() {}
    constructor(_canvas: unknown, configuration: ChartConfiguration<'line'>) { chart.configuration = configuration; }
    destroy() {}
  },
  LineController: {}, LineElement: {}, PointElement: {}, LinearScale: {}, Tooltip: {}, Legend: {},
}));
afterEach(() => vi.unstubAllGlobals());

const errors: ErrorSample[] = [{ seconds: 2.123456789, count: 2, mistakes: [
  { index: 1, typed: 'dam', expected: 'dim' }, { index: 2, typed: '<wrong>', expected: 'name' },
] }];
const show = (error = true, visible = true) => {
  const external = chart.configuration.options?.plugins?.tooltip?.external;
  const tooltip = { opacity: visible ? 1 : 0, caretX: 100, caretY: 100,
    dataPoints: [{ datasetIndex: error ? 3 : 0, dataIndex: 0, dataset: error ? { label: 'Errors', yAxisID: 'errors' } : { label: 'WPM' }, parsed: { x: 2.123456789, y: error ? 2 : 43.987 } }],
  } as unknown as TooltipModel<'line'>;
  act(() => { external?.call({} as never, { chart: {} as never, tooltip }); });
};

it('shows each submitted word in red above its expected word, without a timestamp', () => {
  vi.stubGlobal('ResizeObserver', class {});
  render(<ResultsChart samples={[]} errors={errors}/>);
  show();
  const tooltip = screen.getByRole('tooltip');
  const mistakes = tooltip.querySelectorAll('.chart-mistake');
  expect(mistakes).toHaveLength(2);
  expect(mistakes[0].children[0]).toHaveClass('mistake-typed');
  expect(mistakes[0].children[0]).toHaveTextContent('Typed: dam');
  expect(mistakes[0].children[1]).toHaveTextContent('Expected: dim');
  expect(tooltip).toHaveTextContent('<wrong>');
  expect(tooltip.querySelector('wrong')).toBeNull();
  expect(tooltip).not.toHaveTextContent('2.123');
  expect(chart.configuration.data.datasets.at(-1)?.data).toEqual([{ x: 2.123456789, y: 2 }]);
  expect(chart.configuration.options?.interaction?.axis).toBe('xy');
  show(false);
  expect(screen.getByRole('tooltip')).toHaveTextContent('WPM: 44');
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('2.123');
  show(true, false); expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('keeps the full speed summary when pointing at any speed series', () => {
  vi.stubGlobal('ResizeObserver', class {});
  render(<ResultsChart samples={[{ seconds: 2, wpm: 43.987, raw: 51.2, burst: 72, errors: 0 }]} errors={[]}/>);
  show(false);
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent('WPM: 44');
  expect(tooltip).toHaveTextContent('Raw WPM: 51');
  expect(tooltip).toHaveTextContent('Burst: 72');
});
it('offers the same typed and expected words in the accessible chart-data table', () => {
  render(<ResultsChart samples={[]} errors={errors}/>);
  fireEvent.click(screen.getByText('Chart data'));
  const table = screen.getByRole('table', { name: 'Error events' });
  expect(within(table).getByRole('columnheader', { name: 'Typed' })).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: 'Expected' })).toBeInTheDocument();
  expect(within(table).queryByText('Seconds')).not.toBeInTheDocument();
  expect(within(table).getByRole('cell', { name: 'dam' })).toHaveClass('mistake-typed');
  expect(within(table).getByRole('cell', { name: 'dim' })).toBeInTheDocument();
});
