import React, { useState } from 'react';
import { fmtNum } from '../utils/statistics';

interface ScreePlotProps {
  eigenvalues: number[];
  numFactors: number;
}

export const ScreePlot: React.FC<ScreePlotProps> = ({ eigenvalues, numFactors }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!eigenvalues.length) return null;

  const width = 660;
  const height = 256;
  const padL = 48;
  const padR = 22;
  const padT = 22;
  const padB = 38;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxEv = Math.max(2, Math.ceil(Math.max(...eigenvalues) * 1.1));
  const n = eigenvalues.length;

  const xPos = (idx: number) =>
    n === 1 ? padL + plotW / 2 : padL + (idx / (n - 1)) * plotW;
  const yPos = (val: number) => padT + plotH - (Math.max(0, val) / maxEv) * plotH;

  const points = eigenvalues.map((ev, i) => `${xPos(i)},${yPos(ev)}`).join(' ');
  const kaiserY = yPos(1.0);

  const yTicks: number[] = [];
  const step = maxEv <= 6 ? 1 : 2;
  for (let v = 0; v <= maxEv; v += step) yTicks.push(v);

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">스크리 도표 (Scree Plot)</h4>
        <span className="text-xs text-slate-600 font-mono tabular-nums font-medium">
          {hovered !== null
            ? `요인 ${hovered + 1} · 고유값(Eigenvalue) = ${fmtNum(eigenvalues[hovered], 3)}`
            : `고유값 > 1.0 기준 추출 요인 ${numFactors}개`}
        </span>
      </div>

      <div className="w-full overflow-x-auto overscroll-x-contain border border-slate-200 rounded-xl bg-white">
        <div className="min-w-[460px]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto block"
            role="img"
            aria-label="요인분석 스크리 도표"
          >
          {/* Horizontal grid lines */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                y1={yPos(t)}
                x2={width - padR}
                y2={yPos(t)}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padL - 10}
                y={yPos(t) + 4}
                textAnchor="end"
                className="fill-slate-500 text-[12px]"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {t}
              </text>
            </g>
          ))}

          {/* Kaiser Criterion Line (Eigenvalue = 1.0) */}
          <line
            x1={padL}
            y1={kaiserY}
            x2={width - padR}
            y2={kaiserY}
            stroke="#dc2626"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text
            x={width - padR - 4}
            y={kaiserY - 6}
            textAnchor="end"
            className="fill-red-600 text-[12px] font-semibold"
          >
            Kaiser 기준 (λ = 1.0)
          </text>

          {/* Line path */}
          <polyline
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="2.25"
            points={points}
          />

          {/* Points & X-axis labels */}
          {eigenvalues.map((ev, i) => {
            const cx = xPos(i);
            const cy = yPos(ev);
            const extracted = i < numFactors;
            const isHover = hovered === i;
            return (
              <g
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHover ? 6.5 : 4.5}
                  fill={extracted ? '#1d4ed8' : '#ffffff'}
                  stroke={extracted ? '#1d4ed8' : '#64748b'}
                  strokeWidth="2"
                />
                {(n <= 16 || i % 2 === 0 || isHover) && (
                  <text
                    x={cx}
                    y={height - 12}
                    textAnchor="middle"
                    className="fill-slate-600 text-[12px]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {i + 1}
                  </text>
                )}
              </g>
            );
          })}
          </svg>
        </div>
      </div>
    </div>
  );
};
