import React from 'react';
import { MediationAnalysisResult, RegressionResult } from '../types/stats';
import { fmtNum, sigStars } from '../utils/statistics';

interface PathDiagramProps {
  h1: RegressionResult | undefined;
  h2: RegressionResult | undefined;
  h3: RegressionResult | undefined;
  mediation: MediationAnalysisResult | null;
  mediatorName: string;
  dependentName: string;
  independents: string[];
}

export const PathDiagram: React.FC<PathDiagramProps> = ({
  h1,
  h2,
  h3,
  mediation,
  mediatorName,
  dependentName,
  independents,
}) => {
  if (!independents.length || !mediatorName || !dependentName) return null;

  const height = Math.max(280, independents.length * 68 + 64);
  const width = 780;

  const leftX = 28;
  const boxW = 166;
  const boxH = 44;

  const medX = 332;
  const medY = 46;

  const depX = 586;
  const depY = height / 2 - boxH / 2 + 24;

  const startY = 36;
  const stepY = (height - 72 - boxH) / Math.max(1, independents.length - 1);

  const getH1Beta = (name: string) => h1?.coeffs.find((c) => c.name === name);
  const getH3Beta = (name: string) => h3?.coeffs.find((c) => c.name === name);
  const h2MedCoeff = h2?.coeffs.find((c) => c.name === mediatorName);
  const h4MedCoeff = mediation?.step4Regression?.coeffs.find((c) => c.name === mediatorName);

  return (
    <div className="w-full space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">
          연구모형 경로도 (표준화 계수 β 기준)
        </h4>
        <span className="text-xs text-slate-600">
          실선: p &lt; .05 (유의) · 점선: 비유의 · * p&lt;.05, ** p&lt;.01, *** p&lt;.001
        </span>
      </div>

      <div className="sm:hidden text-xs text-slate-600 bg-slate-50 border border-slate-200/90 rounded-lg px-3 py-1.5">
        ↔ 좌우로 스크롤하여 전체 경로모형 확인
      </div>

      <div className="w-full overflow-x-auto overscroll-x-contain border border-slate-200 rounded-xl bg-white">
        <div className="min-w-[640px]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto block"
            role="img"
            aria-label="연구모형 경로도"
          >
          <defs>
            <marker
              id="arrow-sig"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#1d4ed8" />
            </marker>
            <marker
              id="arrow-ns"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>
            <marker
              id="arrow-med"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#059669" />
            </marker>
          </defs>

          {/* Independent -> Mediator (H1) & Independent -> Dependent (H3) */}
          {independents.map((indName, idx) => {
            const y = independents.length === 1 ? height / 2 - boxH / 2 : startY + idx * stepY;
            const xEnd = leftX + boxW;
            const yCenter = y + boxH / 2;

            const c1 = getH1Beta(indName);
            const sig1 = c1 ? c1.p < 0.05 : false;
            const c3 = getH3Beta(indName);
            const sig3 = c3 ? c3.p < 0.05 : false;

            const medTargetX = medX - 4;
            const medTargetY = medY + boxH / 2 + (idx - (independents.length - 1) / 2) * 5;

            const depTargetX = depX - 4;
            const depTargetY = depY + boxH / 2 + (idx - (independents.length - 1) / 2) * 6;

            return (
              <g key={indName}>
                {/* X -> M line */}
                <line
                  x1={xEnd}
                  y1={yCenter - 4}
                  x2={medTargetX}
                  y2={medTargetY}
                  stroke={sig1 ? '#1d4ed8' : '#94a3b8'}
                  strokeWidth={sig1 ? 2 : 1.25}
                  strokeDasharray={sig1 ? undefined : '4 3'}
                  markerEnd={sig1 ? 'url(#arrow-sig)' : 'url(#arrow-ns)'}
                />
                {c1 && (
                  <text
                    x={xEnd + (medTargetX - xEnd) * 0.45}
                    y={yCenter - 4 + (medTargetY - (yCenter - 4)) * 0.45 - 5}
                    textAnchor="middle"
                    className={`text-[11.5px] font-mono ${sig1 ? 'fill-blue-700 font-semibold' : 'fill-slate-500'}`}
                  >
                    β={fmtNum(c1.beta, 3)}
                    {sigStars(c1.p)}
                  </text>
                )}

                {/* X -> Y direct (H3) line */}
                <line
                  x1={xEnd}
                  y1={yCenter + 6}
                  x2={depTargetX}
                  y2={depTargetY}
                  stroke={sig3 ? '#0f172a' : '#cbd5e1'}
                  strokeWidth={sig3 ? 1.75 : 1}
                  strokeDasharray={sig3 ? undefined : '3 3'}
                  markerEnd={sig3 ? 'url(#arrow-sig)' : 'url(#arrow-ns)'}
                />
                {c3 && sig3 && (
                  <text
                    x={xEnd + (depTargetX - xEnd) * 0.62}
                    y={yCenter + 6 + (depTargetY - (yCenter + 6)) * 0.62 + 13}
                    textAnchor="middle"
                    className="text-[11.5px] font-mono fill-slate-800 font-semibold"
                  >
                    c={fmtNum(c3.beta, 3)}
                    {sigStars(c3.p)}
                  </text>
                )}

                {/* Independent Node */}
                <rect
                  x={leftX}
                  y={y}
                  width={boxW}
                  height={boxH}
                  rx="8"
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                />
                <text
                  x={leftX + boxW / 2}
                  y={y + boxH / 2 + 5}
                  textAnchor="middle"
                  className="fill-slate-900 text-[13.5px] font-semibold"
                >
                  {indName}
                </text>
              </g>
            );
          })}

          {/* Mediator -> Dependent (H2 / H4 b-path) */}
          {(() => {
            const medCoeff = h4MedCoeff || h2MedCoeff;
            const sigM = medCoeff ? medCoeff.p < 0.05 : false;
            const mx1 = medX + boxW;
            const my1 = medY + boxH / 2;
            const dx2 = depX - 4;
            const dy2 = depY + 12;
            return (
              <g>
                <line
                  x1={mx1}
                  y1={my1}
                  x2={dx2}
                  y2={dy2}
                  stroke={sigM ? '#059669' : '#94a3b8'}
                  strokeWidth={sigM ? 2.25 : 1.25}
                  strokeDasharray={sigM ? undefined : '4 3'}
                  markerEnd={sigM ? 'url(#arrow-med)' : 'url(#arrow-ns)'}
                />
                {medCoeff && (
                  <text
                    x={(mx1 + dx2) / 2 + 6}
                    y={(my1 + dy2) / 2 - 9}
                    textAnchor="middle"
                    className={`text-[11.5px] font-mono ${sigM ? 'fill-emerald-700 font-semibold' : 'fill-slate-500'}`}
                  >
                    {h4MedCoeff ? 'H4' : 'H2'} β={fmtNum(medCoeff.beta, 3)}
                    {sigStars(medCoeff.p)}
                  </text>
                )}
              </g>
            );
          })()}

          {/* Mediator Node */}
          <rect
            x={medX}
            y={medY}
            width={boxW}
            height={boxH}
            rx="8"
            fill="#eff6ff"
            stroke="#2563eb"
            strokeWidth="1.75"
          />
          <text
            x={medX + boxW / 2}
            y={medY + boxH / 2 + 5}
            textAnchor="middle"
            className="fill-blue-950 text-[13.5px] font-semibold"
          >
            {mediatorName} (매개)
          </text>
          {h1 && (
            <text
              x={medX + boxW / 2}
              y={medY - 9}
              textAnchor="middle"
              className="fill-slate-600 text-[11.5px] font-mono"
            >
              H1 수정 R²={fmtNum(h1.adjR2, 3)}
            </text>
          )}

          {/* Dependent Node */}
          <rect
            x={depX}
            y={depY}
            width={boxW}
            height={boxH}
            rx="8"
            fill="#ecfdf5"
            stroke="#059669"
            strokeWidth="1.75"
          />
          <text
            x={depX + boxW / 2}
            y={depY + boxH / 2 + 5}
            textAnchor="middle"
            className="fill-emerald-950 text-[13.5px] font-semibold"
          >
            {dependentName} (종속)
          </text>
          {h2 && (
            <text
              x={depX + boxW / 2}
              y={depY + boxH + 18}
              textAnchor="middle"
              className="fill-slate-600 text-[11.5px] font-mono"
            >
              H2 수정 R²={fmtNum(h2.adjR2, 3)}
              {h3 ? ` · H3=${fmtNum(h3.adjR2, 3)}` : ''}
            </text>
          )}
          </svg>
        </div>
      </div>
    </div>
  );
};
