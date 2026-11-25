import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ReliabilityRow, SectionVerificationResult, StepIssue } from '../../types/stats';
import { fmtNum } from '../../utils/statistics';
import { ThesisSection } from '../../utils/thesisWriter';
import { CopyTableButton } from '../CopyTableButton';
import { ScrollableTable } from '../ScrollableTable';
import { SPSSGuideBar } from '../SPSSGuideBar';
import { StepFooterNav } from '../StepFooterNav';
import { StepIssuesAlert } from '../StepIssuesAlert';
import { ThesisSentenceCard } from '../ThesisSentenceCard';

interface StepReliabilityProps {
  rows: ReliabilityRow[];
  issues?: StepIssue[];
  thesisSection?: ThesisSection;
  thesisVerification?: SectionVerificationResult;
  onPrev: () => void;
  onNext: () => void;
}

const SPSS_RELIABILITY_STEPS = [
  '변수 하나의 측정 문항들을 오른쪽 [항목] 칸으로 옮깁니다 (예: 혁신행동1~6).',
  '모형을 [알파(Alpha)]로 두고 확인을 누릅니다.',
  '출력 결과 표에서 크론바흐 알파(Cronbach’s α) 값이 수업 기준(0.6 이상)을 충족하는지 확인합니다.',
  '모든 구성개념에 대해 변수마다 따로 반복합니다.',
];

export const StepReliability: React.FC<StepReliabilityProps> = ({
  rows,
  issues = [],
  thesisSection,
  thesisVerification,
  onPrev,
  onNext,
}) => {
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.constructName ?? null);

  if (!rows.length) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
          <p className="text-sm font-medium text-slate-700 text-center">신뢰도 분석 결과가 없습니다.</p>
          {issues.length > 0 && <StepIssuesAlert issues={issues} />}
        </div>
        <StepFooterNav prevLabel="1. 요인분석 (타당성)" nextLabel="3. 변수 계산 (합변수)" onPrev={onPrev} onNext={onNext} />
      </div>
    );
  }

  const getStatusMeta = (r: ReliabilityRow) => {
    if (r.nItems < 2) return { label: '단일 문항 (α 해당없음)', cls: 'text-slate-500' };
    if (!Number.isFinite(r.alpha)) return { label: '계산 불가', cls: 'text-red-700' };
    if (r.alpha >= 0.7) return { label: '우수 (≥ 0.7)', cls: 'text-emerald-700' };
    if (r.alpha >= 0.6) return { label: '양호 (≥ 0.6)', cls: 'text-blue-700' };
    return { label: '재검토 필요 (< 0.6)', cls: 'text-red-700' };
  };

  const copyHeaders = ['구성개념', '문항 수', '유효 N', 'Cronbach α', '표준화 α', '판정'];
  const copyRows = rows.map((r) => [
    r.constructName,
    r.nItems,
    r.nValid,
    fmtNum(r.alpha, 3),
    fmtNum(r.standardizedAlpha, 3),
    getStatusMeta(r).label,
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">2. 신뢰도 분석 (Cronbach’s α)</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5">
              내적 일관성 검증 · 수용 기준: α ≥ 0.60 (학술 권장 ≥ 0.70)
            </p>
          </div>
          <CopyTableButton headers={copyHeaders} rows={copyRows} />
        </div>

        <SPSSGuideBar
          menuPath="분석 → 척도 → 신뢰도 분석 · 모형: 알파"
          steps={SPSS_RELIABILITY_STEPS}
          note="※ 항목-총점 통계에서 '항목 삭제 시 Cronbach α'가 전체 α보다 크게 상승하는 문항이 있다면 제거 여부를 검토합니다."
        />

        {issues.length > 0 && <StepIssuesAlert issues={issues} />}

        {/* Mobile Card List View (< sm) */}
        <div className="sm:hidden space-y-3">
          {rows.map((r) => {
            const status = getStatusMeta(r);
            const isOpen = expanded === r.constructName;

            return (
              <div
                key={r.constructName}
                className="border border-slate-200/90 rounded-xl bg-white overflow-hidden"
              >
                <div className="p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{r.constructName}</span>
                    <span className={`text-xs font-bold whitespace-nowrap ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 bg-slate-50/80 rounded-xl p-3 text-xs">
                    <div>
                      <div className="text-slate-500">Cronbach’s α</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900 text-base mt-0.5">
                        {fmtNum(r.alpha, 3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">표준화 α</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-700 text-base mt-0.5">
                        {fmtNum(r.standardizedAlpha, 3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">문항 수 / 유효 N</div>
                      <div className="font-mono tabular-nums text-slate-700 mt-0.5">
                        {r.nItems}개 · N={r.nValid}
                      </div>
                    </div>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : r.constructName)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap cursor-pointer"
                      >
                        {isOpen ? (
                          <>
                            <ChevronDown className="w-4 h-4 shrink-0" />
                            <span>세부 접기</span>
                          </>
                        ) : (
                          <>
                            <ChevronRight className="w-4 h-4 shrink-0" />
                            <span>항목-총점 보기</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-3 space-y-2">
                    <div className="text-xs font-bold text-slate-800">
                      {r.constructName} · 항목-총점 통계량
                    </div>
                    <ScrollableTable>
                      <table className="w-full min-w-[540px] text-xs">
                        <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">문항</th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">삭제 시 평균</th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">삭제 시 분산</th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">총점 상관</th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">삭제 시 α</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {r.itemStats.map((st) => {
                            const improvesAlpha =
                              Number.isFinite(st.alphaIfDeleted) && st.alphaIfDeleted > r.alpha + 0.005;
                            return (
                              <tr key={st.item}>
                                <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{st.item}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                                  {fmtNum(st.scaleMeanIfDeleted, 3)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                                  {fmtNum(st.scaleVarIfDeleted, 3)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                                  {fmtNum(st.correctedItemTotalCorr, 3)}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${
                                    improvesAlpha ? 'text-amber-700 font-bold' : 'text-slate-700'
                                  }`}
                                >
                                  {fmtNum(st.alphaIfDeleted, 3)}
                                  {improvesAlpha ? ' (상승)' : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </ScrollableTable>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tablet/Desktop Table View (sm+) */}
        <div className="hidden sm:block">
          <ScrollableTable>
            <table className="w-full min-w-[680px] text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">구성개념</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">문항 수</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">유효 N</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">Cronbach’s α</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">표준화 α</th>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">판정</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">항목-총점 통계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r) => {
                  const status = getStatusMeta(r);
                  const isOpen = expanded === r.constructName;

                  return (
                    <React.Fragment key={r.constructName}>
                      <tr className="hover:bg-slate-50/80">
                        <td className="px-3.5 py-3 font-semibold text-slate-900 whitespace-nowrap">{r.constructName}</td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">{r.nItems}</td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">{r.nValid}</td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {fmtNum(r.alpha, 3)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {fmtNum(r.standardizedAlpha, 3)}
                        </td>
                        <td className={`px-3.5 py-3 font-semibold whitespace-nowrap ${status.cls}`}>
                          {status.label}
                        </td>
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : r.constructName)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50 font-semibold cursor-pointer"
                          >
                            {isOpen ? (
                              <>
                                <ChevronDown className="w-4 h-4" />
                                <span>접기</span>
                              </>
                            ) : (
                              <>
                                <ChevronRight className="w-4 h-4" />
                                <span>세부 보기</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50/80 px-4 py-3.5">
                            <div className="text-xs font-bold text-slate-800 mb-2.5">
                              {r.constructName} · 항목-총점 통계량 (항목 삭제 시 α 확인)
                            </div>
                            <ScrollableTable>
                              <table className="w-full min-w-[580px] text-xs">
                                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600">
                                  <tr>
                                    <th className="px-3.5 py-2 text-left font-semibold whitespace-nowrap">문항</th>
                                    <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">항목 삭제 시 척도 평균</th>
                                    <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">항목 삭제 시 척도 분산</th>
                                    <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">수정된 항목-총점 상관</th>
                                    <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">항목 삭제 시 Cronbach α</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {r.itemStats.map((st) => {
                                    const improvesAlpha =
                                      Number.isFinite(st.alphaIfDeleted) && st.alphaIfDeleted > r.alpha + 0.005;
                                    return (
                                      <tr key={st.item} className="hover:bg-slate-50/60">
                                        <td className="px-3.5 py-2 font-semibold text-slate-800 whitespace-nowrap">{st.item}</td>
                                        <td className="px-3.5 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                                          {fmtNum(st.scaleMeanIfDeleted, 3)}
                                        </td>
                                        <td className="px-3.5 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                                          {fmtNum(st.scaleVarIfDeleted, 3)}
                                        </td>
                                        <td className="px-3.5 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                                          {fmtNum(st.correctedItemTotalCorr, 3)}
                                        </td>
                                        <td
                                          className={`px-3.5 py-2 text-right font-mono tabular-nums whitespace-nowrap ${
                                            improvesAlpha ? 'text-amber-700 font-bold' : 'text-slate-700'
                                          }`}
                                        >
                                          {fmtNum(st.alphaIfDeleted, 3)}
                                          {improvesAlpha ? ' (상승)' : ''}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </ScrollableTable>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      </div>

      {thesisSection && (
        <ThesisSentenceCard section={thesisSection} verification={thesisVerification} />
      )}

      <StepFooterNav
        prevLabel="1. 요인분석 (타당성)"
        nextLabel="3. 변수 계산 (합변수) 진행"
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  );
};
