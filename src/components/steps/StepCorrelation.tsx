import React, { useState } from 'react';
import { CompositeSummary, CorrelationResult, SectionVerificationResult, StepIssue } from '../../types/stats';
import { fmtNum, fmtP, sigStars } from '../../utils/statistics';
import { ThesisSection } from '../../utils/thesisWriter';
import { CopyTableButton } from '../CopyTableButton';
import { CorrelationHeatmap } from '../CorrelationHeatmap';
import { ScrollableTable } from '../ScrollableTable';
import { SPSSGuideBar } from '../SPSSGuideBar';
import { StepFooterNav } from '../StepFooterNav';
import { StepIssuesAlert } from '../StepIssuesAlert';
import { ThesisSentenceCard } from '../ThesisSentenceCard';

interface StepCorrelationProps {
  correlation: CorrelationResult;
  composites: CompositeSummary[];
  issues?: StepIssue[];
  thesisSection?: ThesisSection;
  thesisVerification?: SectionVerificationResult;
  onPrev: () => void;
  onNext: () => void;
}

const SPSS_CORR_STEPS = [
  '생성한 합변수들을 전부 오른쪽 [변수] 칸으로 옮깁니다.',
  '상관계수에서 Pearson이 체크된 기본 상태 그대로 확인을 누릅니다.',
  '논문용 표 정리 시 유의확률(양측)과 N 행을 생략하고 피어슨 상관 값(r)만 남깁니다.',
  '대각선 1을 기준으로 오른쪽(위쪽) 중복 값을 삭제해 하삼각 행렬을 완성합니다.',
];

export const StepCorrelation: React.FC<StepCorrelationProps> = ({
  correlation,
  composites,
  issues = [],
  thesisSection,
  thesisVerification,
  onPrev,
  onNext,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!correlation.names.length) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
          <p className="text-sm font-medium text-slate-700 text-center">상관분석 결과가 없습니다.</p>
          {issues.length > 0 && <StepIssuesAlert issues={issues} />}
        </div>
        <StepFooterNav prevLabel="3. 변수 계산 (합변수)" nextLabel="5. 회귀분석 (H1~H3)" onPrev={onPrev} onNext={onNext} />
      </div>
    );
  }

  const { names, matrix } = correlation;
  const copyHeaders = [
    '변수',
    ...(showDetails ? ['평균', '표준편차'] : []),
    ...names.map((n, i) => `${i + 1}. ${n}`),
  ];
  const copyRows = names.map((name, i) => {
    const comp = composites.find((c) => c.name === name);
    const statCols = showDetails ? [fmtNum(comp?.mean, 3), fmtNum(comp?.sd, 3)] : [];
    const corrCols = names.map((_, j) => {
      if (j > i) return '';
      if (j === i) return '1';
      const cell = matrix[i][j];
      return showDetails ? `${fmtNum(cell.r, 3)}${sigStars(cell.p)}` : fmtNum(cell.r, 3);
    });
    return [`${i + 1}. ${name}`, ...statCols, ...corrCols];
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">4. 상관분석 (Pearson 이변량 상관)</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5">
              생성된 합변수 간의 상관계수(r) 및 판별타당성을 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className={`px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer text-center ${
                  !showDetails
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                논문용 하삼각 (r만)
              </button>
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className={`px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer text-center ${
                  showDetails
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                상세 보기 (평균·SD·p값)
              </button>
            </div>
            <CopyTableButton headers={copyHeaders} rows={copyRows} />
          </div>
        </div>

        <SPSSGuideBar
          menuPath="분석 → 상관분석 → 이변량 상관 · Pearson"
          steps={SPSS_CORR_STEPS}
        />

        {issues.length > 0 && <StepIssuesAlert issues={issues} />}

        <ScrollableTable hintText="좌우로 스크롤하여 전체 상관행렬 확인">
          <table className="w-full min-w-[600px] text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap min-w-[130px]">변수</th>
                {showDetails && (
                  <>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">평균</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">표준편차</th>
                  </>
                )}
                {names.map((n, i) => (
                  <th key={n} className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">
                    {i + 1}. {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {names.map((name, i) => {
                const comp = composites.find((c) => c.name === name);
                return (
                  <tr key={name} className="hover:bg-slate-50/80">
                    <td className="px-3.5 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {i + 1}. {name}
                    </td>
                    {showDetails && (
                      <>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-700">
                          {fmtNum(comp?.mean, 3)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600">
                          {fmtNum(comp?.sd, 3)}
                        </td>
                      </>
                    )}
                    {names.map((_, j) => {
                      if (j > i) {
                        return (
                          <td key={j} className="px-3.5 py-3 text-right font-mono text-slate-300">
                            ·
                          </td>
                        );
                      }
                      if (j === i) {
                        return (
                          <td
                            key={j}
                            className="px-3.5 py-3 text-right font-mono font-bold text-slate-900 bg-slate-50/70"
                          >
                            1
                          </td>
                        );
                      }
                      const cell = matrix[i][j];
                      const stars = sigStars(cell.p);
                      const strong = Math.abs(cell.r) >= 0.3 && cell.p < 0.05;
                      return (
                        <td
                          key={j}
                          className={`px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                            strong
                              ? 'font-bold text-blue-800'
                              : cell.p < 0.05
                                ? 'text-slate-900'
                                : 'text-slate-400'
                          }`}
                          title={`r = ${fmtNum(cell.r, 4)}, p = ${fmtP(cell.p)}, N = ${cell.n}`}
                        >
                          <div>
                            {fmtNum(cell.r, 3)}
                            {showDetails && stars && <span className="text-blue-700 ml-0.5">{stars}</span>}
                          </div>
                          {showDetails && (
                            <div className="text-xs font-normal text-slate-500 mt-0.5">
                              ({fmtP(cell.p)})
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>

        <p className="text-xs text-slate-600 leading-relaxed">
          {showDetails
            ? '* p < .05, ** p < .01, *** p < .001 (양측검정). 판별타당성 확인 시 상관계수가 0.85 미만인지 함께 점검하세요.'
            : '논문 표 양식에 맞춰 대각선 오른쪽(위쪽) 중복 값과 유의확률·N 행을 제거한 하삼각 표입니다. 우측 상단 버튼으로 엑셀에 바로 붙여넣을 수 있습니다.'}
        </p>
      </div>

      <CorrelationHeatmap correlation={correlation} />

      {thesisSection && (
        <ThesisSentenceCard section={thesisSection} verification={thesisVerification} />
      )}

      <StepFooterNav
        prevLabel="3. 변수 계산 (합변수)"
        nextLabel="5. 회귀분석 (H1~H3) 진행"
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  );
};
