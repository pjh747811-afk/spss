import React from 'react';
import { CompositeSummary, SectionVerificationResult, StepIssue } from '../../types/stats';
import { fmtNum } from '../../utils/statistics';
import { ThesisSection } from '../../utils/thesisWriter';
import { CopyTableButton } from '../CopyTableButton';
import { ScrollableTable } from '../ScrollableTable';
import { SPSSGuideBar } from '../SPSSGuideBar';
import { StepFooterNav } from '../StepFooterNav';
import { StepIssuesAlert } from '../StepIssuesAlert';
import { ThesisSentenceCard } from '../ThesisSentenceCard';

interface StepCompositesProps {
  composites: CompositeSummary[];
  issues?: StepIssue[];
  thesisSection?: ThesisSection;
  thesisVerification?: SectionVerificationResult;
  onPrev: () => void;
  onNext: () => void;
}

const SPSS_COMPUTE_STEPS = [
  '상단 메뉴에서 [변환] → [변수 계산]을 엽니다.',
  '[대상 변수] 칸에 합변수 이름(예: 혁신행동합)을 입력합니다.',
  '[숫자 표현식] 칸에 괄호로 문항들을 모두 더한 뒤 문항 수로 나누는 식을 입력하고 확인을 누릅니다.',
  '모든 구성개념에 대해 합변수를 순서대로 생성합니다.',
];

export const StepComposites: React.FC<StepCompositesProps> = ({
  composites,
  issues = [],
  thesisSection,
  thesisVerification,
  onPrev,
  onNext,
}) => {
  if (!composites.length) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
          <p className="text-sm font-medium text-slate-700 text-center">합변수 결과가 없습니다.</p>
          {issues.length > 0 && <StepIssuesAlert issues={issues} />}
        </div>
        <StepFooterNav prevLabel="2. 신뢰도 분석 (α)" nextLabel="4. 상관분석" onPrev={onPrev} onNext={onNext} />
      </div>
    );
  }

  const copyHeaders = ['합변수', '문항 수', 'N', '평균', '표준편차', '최솟값', '최댓값', '왜도', '첨도'];
  const copyRows = composites.map((c) => [
    `${c.name}합`,
    c.items.length,
    c.n,
    fmtNum(c.mean, 3),
    fmtNum(c.sd, 3),
    fmtNum(c.min, 3),
    fmtNum(c.max, 3),
    fmtNum(c.skewness, 3),
    fmtNum(c.kurtosis, 3),
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">3. 변수 계산 (합변수 · 기술통계)</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5">
              타당성·신뢰도를 통과한 구성개념별 문항 평균(합변수)과 기술통계량을 산출합니다.
            </p>
          </div>
          <CopyTableButton headers={copyHeaders} rows={copyRows} />
        </div>

        <SPSSGuideBar menuPath="변환 → 변수 계산" steps={SPSS_COMPUTE_STEPS} />

        {issues.length > 0 && <StepIssuesAlert issues={issues} />}

        <div className="rounded-xl border border-red-200/90 bg-red-50/70 px-4 py-3.5 text-xs sm:text-sm text-red-900 leading-relaxed">
          <strong className="font-bold text-red-700">가장 많이 하는 실수:</strong> 괄호를 빼먹는 것.
          괄호가 없으면 마지막 문항만 문항 수로 나눠집니다. 아래 수식 예시처럼 반드시 전체 합을 괄호로 감싼 뒤 나누세요.
        </div>

        {/* Mobile Card View (< sm) */}
        <div className="sm:hidden space-y-3">
          {composites.map((c) => (
            <div
              key={c.name}
              className="border border-slate-200/90 rounded-xl p-3.5 bg-white space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{c.name}합</span>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {c.items.length}문항 · N={c.n}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 bg-slate-50/80 rounded-xl p-3 text-xs">
                <div>
                  <div className="text-slate-500">평균 (M)</div>
                  <div className="font-mono tabular-nums font-bold text-slate-900 text-base mt-0.5">
                    {fmtNum(c.mean, 3)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">표준편차 (SD)</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-800 text-base mt-0.5">
                    {fmtNum(c.sd, 3)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">범위 (최소~최대)</div>
                  <div className="font-mono tabular-nums text-slate-700 mt-0.5">
                    {fmtNum(c.min, 2)} ~ {fmtNum(c.max, 2)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">왜도 / 첨도</div>
                  <div className="font-mono tabular-nums text-slate-700 mt-0.5">
                    {fmtNum(c.skewness, 2)} / {fmtNum(c.kurtosis, 2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tablet/Desktop Table View (sm+) */}
        <div className="hidden sm:block">
          <ScrollableTable>
            <table className="w-full min-w-[700px] text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">합변수명</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">문항 수</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">N</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">평균</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">표준편차</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">최솟값</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">최댓값</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">왜도</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">첨도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {composites.map((c) => (
                  <tr key={c.name} className="hover:bg-slate-50/80">
                    <td className="px-3.5 py-3 font-semibold text-slate-900 whitespace-nowrap">{c.name}합</td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">{c.items.length}</td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">{c.n}</td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {fmtNum(c.mean, 3)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {fmtNum(c.sd, 3)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {fmtNum(c.min, 3)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {fmtNum(c.max, 3)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {fmtNum(c.skewness, 3)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {fmtNum(c.kurtosis, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>

        <div className="pt-2">
          <h3 className="text-base font-bold text-slate-900 mb-3">적용된 SPSS 변수 계산 수식</h3>
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900 text-slate-100 overflow-hidden">
            {composites.map((c) => (
              <div
                key={c.name}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs"
              >
                <span className="font-bold text-emerald-300 w-32 shrink-0">{c.name}합</span>
                <code className="font-mono text-slate-200 break-all">= {c.formula}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {thesisSection && (
        <ThesisSentenceCard section={thesisSection} verification={thesisVerification} />
      )}

      <StepFooterNav
        prevLabel="2. 신뢰도 분석 (α)"
        nextLabel="4. 상관분석 진행"
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  );
};
