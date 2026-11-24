import React, { useState } from 'react';
import { CorrelationResult } from '../types/stats';
import { fmtNum, fmtP, sigStars } from '../utils/statistics';

interface CorrelationHeatmapProps {
  correlation: CorrelationResult;
}

function getHeatColors(
  r: number,
  isDiagonal: boolean,
  dimmed: boolean
): { backgroundColor: string; color: string } {
  if (isDiagonal) {
    return { backgroundColor: '#1e293b', color: '#f8fafc' };
  }
  if (!Number.isFinite(r)) {
    return { backgroundColor: '#f8fafc', color: '#94a3b8' };
  }

  const abs = Math.min(1, Math.abs(r));
  const intensity = Math.pow(abs, 0.82); // slight boost so moderate r (.25~.55) is clearly visible

  if (r >= 0) {
    // Interpolate white (#ffffff) -> blue-700/800 (#1d4ed8)
    const red = Math.round(255 - intensity * (255 - 29));
    const green = Math.round(255 - intensity * (255 - 78));
    const blue = Math.round(255 - intensity * (255 - 216));
    const text = intensity >= 0.54 ? '#ffffff' : dimmed ? '#94a3b8' : '#0f172a';
    return { backgroundColor: `rgb(${red}, ${green}, ${blue})`, color: text };
  } else {
    // Interpolate white (#ffffff) -> rose-700 (#be123c)
    const red = Math.round(255 - intensity * (255 - 190));
    const green = Math.round(255 - intensity * (255 - 18));
    const blue = Math.round(255 - intensity * (255 - 60));
    const text = intensity >= 0.54 ? '#ffffff' : dimmed ? '#94a3b8' : '#0f172a';
    return { backgroundColor: `rgb(${red}, ${green}, ${blue})`, color: text };
  }
}

export const CorrelationHeatmap: React.FC<CorrelationHeatmapProps> = ({ correlation }) => {
  const [triangleOnly, setTriangleOnly] = useState(false);
  const [highlightSig, setHighlightSig] = useState(true);
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);

  const { names, matrix } = correlation;
  if (!names.length) return null;

  const hoveredCell =
    hovered && hovered.i !== hovered.j ? matrix[hovered.i]?.[hovered.j] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900">상관관계 히트맵 (Heatmap)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            정(+)의 상관은 파란색, 부(-)의 상관은 붉은색 농도로 강도를 표현합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={highlightSig}
              onChange={(e) => setHighlightSig(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-700 rounded cursor-pointer"
            />
            <span>유의수준(p &lt; .05) 강조</span>
          </label>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setTriangleOnly(false)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                !triangleOnly
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              전체 행렬
            </button>
            <button
              type="button"
              onClick={() => setTriangleOnly(true)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                triangleOnly
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              하삼각만 보기
            </button>
          </div>
        </div>
      </div>

      {/* Color Legend + Live Hover Readout */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums text-rose-700 font-semibold">-1.0</span>
          <div
            className="h-2.5 w-36 rounded-sm border border-slate-200"
            style={{
              background: 'linear-gradient(90deg, #be123c 0%, #ffffff 50%, #1d4ed8 100%)',
            }}
            aria-label="상관계수 색상 범례: -1.0(붉은색)에서 0(흰색)을 거쳐 +1.0(파란색)"
          />
          <span className="font-mono tabular-nums text-blue-700 font-semibold">+1.0</span>
          <span className="text-slate-400 ml-1">(0 = 무상관)</span>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-700 min-h-[20px]">
          {hovered ? (
            hovered.i === hovered.j ? (
              <span>
                {names[hovered.i]} ↔ {names[hovered.j]} · 대각선 (r = 1.000)
              </span>
            ) : hoveredCell ? (
              <span>
                <strong className="font-sans text-slate-900">
                  {names[hovered.i]} ↔ {names[hovered.j]}
                </strong>{' '}
                · r = {fmtNum(hoveredCell.r, 3)}
                {sigStars(hoveredCell.p)} · {fmtP(hoveredCell.p)} · N = {hoveredCell.n}
              </span>
            ) : null
          ) : (
            <span className="font-sans text-slate-400">
              셀에 마우스를 올리면 정확한 상관계수와 유의확률을 확인할 수 있습니다.
            </span>
          )}
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto pb-1">
        <div
          className="inline-grid gap-1 min-w-full"
          style={{
            gridTemplateColumns: `minmax(112px, 140px) repeat(${names.length}, minmax(72px, 1fr))`,
          }}
        >
          {/* Top-left corner */}
          <div />

          {/* Column Headers */}
          {names.map((colName, j) => (
            <div
              key={`col-${colName}`}
              className={`px-2 py-2 text-center text-xs font-semibold truncate transition-colors ${
                hovered?.j === j ? 'text-blue-700' : 'text-slate-700'
              }`}
              title={`${j + 1}. ${colName}`}
            >
              {j + 1}. {colName}
            </div>
          ))}

          {/* Rows */}
          {names.map((rowName, i) => (
            <React.Fragment key={`row-${rowName}`}>
              {/* Row Label */}
              <div
                className={`px-2 py-2 flex items-center text-xs font-semibold truncate transition-colors ${
                  hovered?.i === i ? 'text-blue-700' : 'text-slate-700'
                }`}
                title={`${i + 1}. ${rowName}`}
              >
                {i + 1}. {rowName}
              </div>

              {/* Heatmap Cells */}
              {names.map((_, j) => {
                if (triangleOnly && j > i) {
                  return <div key={`cell-${i}-${j}`} className="h-14 rounded-md bg-slate-50/40" />;
                }

                const isDiag = i === j;
                const cell = matrix[i][j];
                const isSig = !isDiag && cell.p < 0.05;
                const dimmed = highlightSig && !isDiag && !isSig;
                const colors = getHeatColors(cell.r, isDiag, dimmed);
                const isActive = hovered?.i === i && hovered?.j === j;
                const stars = !isDiag ? sigStars(cell.p) : '';

                return (
                  <div
                    key={`cell-${i}-${j}`}
                    onMouseEnter={() => setHovered({ i, j })}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      backgroundColor: colors.backgroundColor,
                      color: colors.color,
                      opacity: dimmed ? 0.58 : 1,
                    }}
                    className={`h-14 rounded-md border flex flex-col items-center justify-center px-1 select-none transition-all font-mono tabular-nums ${
                      isActive
                        ? 'border-slate-900 ring-2 ring-slate-900/20 z-10'
                        : 'border-slate-200/80'
                    }`}
                    title={
                      isDiag
                        ? `${rowName} (r = 1.000)`
                        : `${rowName} ↔ ${names[j]}: r = ${fmtNum(cell.r, 3)}, ${fmtP(cell.p)}, N = ${cell.n}`
                    }
                  >
                    <span className="text-xs font-bold leading-tight">
                      {isDiag ? '1.000' : `${fmtNum(cell.r, 3)}${stars}`}
                    </span>
                    {!isDiag && (
                      <span className="text-[10px] opacity-80 leading-tight mt-0.5">
                        {fmtP(cell.p)}
                      </span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
