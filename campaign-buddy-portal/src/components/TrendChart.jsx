import { useState } from 'react';

// Dependency-free grouped-bar chart (matches the portal's hand-rolled visual
// language). `series` is [{ key, label, color }]; `data` rows carry each key
// plus `date` (ISO yyyy-mm-dd).
const H = 220;
const PAD_L = 40;
const PAD_B = 26;
const PAD_T = 10;

export default function TrendChart({ data = [], series = [] }) {
  const [hover, setHover] = useState(null);

  if (data.length === 0) {
    return <div className="cell-muted" style={{ padding: '28px 0' }}>No data recorded yet.</div>;
  }

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];

  const groupW = 46;
  const barW = Math.max(5, Math.min(14, (groupW - 8) / series.length));
  const W = PAD_L + data.length * groupW + 12;
  const plotH = H - PAD_B - PAD_T;
  const y = (v) => PAD_T + plotH - (v / top) * plotH;

  return (
    <div className="trend-chart">
      <div className="trend-legend">
        {series.map((s) => (
          <span key={s.key} className="item"><span className="sw" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="trend-svg">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" className="trend-axis">{fmtShort(t)}</text>
            </g>
          ))}
          {data.map((d, di) => {
            const gx = PAD_L + di * groupW;
            const inner = (groupW - barW * series.length) / 2;
            return (
              <g key={d.date}
                 onMouseEnter={() => setHover(d)}
                 onMouseLeave={() => setHover((h) => (h === d ? null : h))}>
                <rect x={gx} y={PAD_T} width={groupW} height={plotH} fill="transparent" />
                {series.map((s, si) => {
                  const v = d[s.key] || 0;
                  const bh = Math.max(0, (v / top) * plotH);
                  return (
                    <rect key={s.key} x={gx + inner + si * barW} y={PAD_T + plotH - bh}
                          width={barW - 1.5} height={bh} rx="1.5" fill={s.color} />
                  );
                })}
                {di % Math.ceil(data.length / 12 || 1) === 0 ? (
                  <text x={gx + groupW / 2} y={H - 8} textAnchor="middle" className="trend-axis">{d.date.slice(5)}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {hover ? (
        <div className="trend-readout">
          <b>{hover.date}</b>
          {series.map((s) => (
            <span key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{(hover[s.key] || 0).toLocaleString()}</b></span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function niceTicks(max, count) {
  const step = niceNum(max / count);
  const out = [];
  for (let v = 0; v <= max + step * 0.5; v += step) out.push(Math.round(v));
  return out.length > 1 ? out : [0, Math.round(max)];
}
function niceNum(x) {
  const exp = Math.floor(Math.log10(x || 1));
  const f = (x || 1) / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}
function fmtShort(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}
