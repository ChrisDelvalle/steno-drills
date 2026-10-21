import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Legend } from 'chart.js';
import type { ErrorSample, SpeedSample, WordMistake } from '../domain/practice';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

interface ChartHover {
  key: string; x: number; y: number;
  mistakes: WordMistake[];
  series: { label: string; value: number }[];
}

export default function ResultsChart({ samples, errors, chords = false }: { samples: SpeedSample[]; errors: ErrorSample[]; chords?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<ChartHover | null>(null);
  useLayoutEffect(() => {
    if (!hover || !tooltipRef.current || !canvas.current) return;
    const box = tooltipRef.current.getBoundingClientRect();
    const chart = canvas.current.getBoundingClientRect();
    tooltipRef.current.style.left = `${Math.max(0, Math.min(hover.x + 12, chart.width - box.width))}px`;
    tooltipRef.current.style.top = `${Math.max(0, hover.y - box.height - 12)}px`;
  }, [hover]);
  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === 'undefined') return;
    const style = getComputedStyle(canvas.current);
    const color = (token: string) => style.getPropertyValue(token).trim();
    const chart = new Chart(canvas.current, {
      type: 'line',
      data: { datasets: [
        { label: chords ? 'Correct chords/min' : 'WPM', data: samples.map(s => ({ x: s.seconds, y: s.wpm })), borderColor: color('--accent'), backgroundColor: color('--accent'), borderWidth: 2, pointRadius: 1, tension: .2 },
        ...(!chords ? [{ label: 'Raw WPM', data: samples.map(s => ({ x: s.seconds, y: s.raw })), borderColor: color('--muted'), backgroundColor: color('--muted'), borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, tension: .2 }] : []),
        ...(!chords ? [{ label: 'Burst', data: samples.map(s => ({ x: s.seconds, y: s.burst })), borderColor: color('--ink'), backgroundColor: color('--ink'), borderWidth: 1.5, pointRadius: 0, tension: .2 }] : []),
        { label: 'Errors', data: errors.map(s => ({ x: s.seconds, y: s.count })), yAxisID: 'errors', showLine: false, pointStyle: 'crossRot', pointRadius: 4, borderColor: color('--error'), backgroundColor: color('--error'), borderWidth: 2 },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        font: { family: 'Roboto Mono, monospace' },
        plugins: {
          legend: { position: 'bottom', align: 'end', labels: { color: color('--muted'), usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
          tooltip: { enabled: false, external: ({ tooltip }) => {
            if (!tooltip.opacity || !tooltip.dataPoints.length) { setHover(null); return; }
            const points = tooltip.dataPoints;
            const mistakes = points.filter(p => p.dataset.yAxisID === 'errors').flatMap(p => errors[p.dataIndex]?.mistakes || []);
            const next: ChartHover = { key: points.map(p => `${p.datasetIndex}:${p.dataIndex}`).join(','), x: tooltip.caretX, y: tooltip.caretY, mistakes,
              series: mistakes.length ? [] : points.map(p => ({ label: p.dataset.label || '', value: Math.round(p.parsed.y || 0) })) };
            setHover(previous => previous?.key === next.key && previous.x === next.x && previous.y === next.y ? previous : next);
          } },
        },
        scales: {
          x: { type: 'linear', min: 0, title: { display: true, text: 'seconds', color: color('--muted') }, ticks: { color: color('--muted'), maxTicksLimit: 8 }, grid: { color: color('--soft-border') } },
          y: { min: 0, ticks: { color: color('--muted'), maxTicksLimit: 5 }, grid: { color: color('--soft-border') } },
          errors: { min: 0, position: 'right', ticks: { color: color('--muted'), stepSize: 1, maxTicksLimit: 5 }, grid: { drawOnChartArea: false } },
        },
      },
    });
    return () => chart.destroy();
  }, [samples, errors, chords]);
  return <div className="results-chart"><canvas ref={canvas} role="img" aria-label="Speed and incorrect words over time"/>
    {hover && <div className="chart-tooltip" ref={tooltipRef} role="tooltip">
      {hover.mistakes.map((mistake, i) => <div className="chart-mistake" key={i}><span className="mistake-typed"><span className="sr-only">Typed: </span>{mistake.typed}</span><span><span className="sr-only">Expected: </span>{mistake.expected}</span></div>)}
      {hover.series.map((point, i) => <div key={i}>{point.label}: {point.value}</div>)}
    </div>}
    <details className="chart-data"><summary>Chart data</summary><div className="table-scroll"><table><caption className="sr-only">Speed samples</caption><thead><tr><th>Seconds</th><th>{chords ? 'Chords/min' : 'WPM'}</th>{!chords && <><th>Raw</th><th title="Translated characters entered in the preceding second, converted to WPM">Burst</th></>}<th>Errors</th></tr></thead><tbody>{samples.map((s, i) => <tr key={i}><td>{s.seconds}</td><td>{Math.round(s.wpm)}</td>{!chords && <><td>{Math.round(s.raw)}</td><td>{Math.round(s.burst)}</td></>}<td>{s.errors}</td></tr>)}</tbody></table><table><caption>Error events</caption><thead><tr><th>Typed</th><th>Expected</th></tr></thead><tbody>{errors.flatMap(e => e.mistakes).map((mistake, i) => <tr key={i}><td className="mistake-typed">{mistake.typed}</td><td>{mistake.expected}</td></tr>)}</tbody></table></div></details>
  </div>;
}
