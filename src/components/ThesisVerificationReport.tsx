import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  History,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  SectionVerificationResult,
  VerificationHistoryEntry,
  VerificationReportSummary,
  VerificationStatus,
} from '../types/stats';
import { ScrollableTable } from './ScrollableTable';

export interface AppliedFixBanner {
  sectionId: string;
  sectionTitle: string;
  appliedCount: number;
  passRate: number;
}

interface ThesisVerificationReportProps {
  report: VerificationReportSummary;
  history: VerificationHistoryEntry[];
  onApplyFix?: (result: SectionVerificationResult) => void;
  onApplyAllFixes?: (results: SectionVerificationResult[]) => void;
  lastAppliedBanner?: AppliedFixBanner | null;
  onJumpToSection?: (sectionId: string) => void;
  onClearHistory?: () => void;
}

export const StatusBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-xs font-bold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>검증 통과</span>
      </span>
    );
  }
  if (status === 'needs_revision') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200/80 px-2.5 py-1 text-xs font-bold text-rose-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>수정 필요</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200/80 px-2.5 py-1 text-xs font-bold text-amber-800 whitespace-nowrap">
      <HelpCircle className="w-3.5 h-3.5 shrink-0" />
      <span>검증 불가</span>
    </span>
  );
};

export const ThesisVerificationReport: React.FC<ThesisVerificationReportProps> = ({
  report,
  history,
  onApplyFix,
  onApplyAllFixes,
  lastAppliedBanner,
  onJumpToSection,
  onClearHistory,
}) => {
  const [showHistory, setShowHistory] = useState(false);

  const flaggedSections = report.sectionResults.filter((s) => s.status !== 'pass');
  const applicableSections = flaggedSections.filter((s) => Boolean(s.suggestedText));
  const totalErrors = report.errorStats.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              논문 문장 검증 엔진 &amp; 독립 교차 검증 보고서
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              웹앱 통계 결과와 원자료 기반 독립 재계산(Householder QR OLS · 공분산 α · QR 고유값)을 대조해 수치·유의확률·부호·변수 방향·가설·매개/조절 기준·미분석 생성·인과표현(①~⑧)을 자동 검증합니다.
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <StatusBadge
            status={
              report.needsRevisionCount > 0
                ? 'needs_revision'
                : report.unverifiableCount > 0
                  ? 'unverifiable'
                  : 'pass'
            }
          />
        </div>
      </div>

      {/* Dashboard KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="text-xs font-medium text-slate-600">전체 검증 통과율</div>
          <div
            className={`text-lg sm:text-2xl font-bold font-mono tabular-nums mt-1 ${
              report.passRate === 100
                ? 'text-emerald-700'
                : report.passRate >= 50
                  ? 'text-blue-700'
                  : 'text-rose-700'
            }`}
          >
            {report.passRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            총 {report.totalSections}개 절 중 {report.passCount}개 일치
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="text-xs font-medium text-emerald-800">검증 통과</div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {report.passCount}건
          </div>
          <div className="text-xs text-emerald-700/80 mt-1">통계 결과와 문장이 일치</div>
        </div>

        <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="text-xs font-medium text-rose-800">수정 필요</div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-rose-700 mt-1">
            {report.needsRevisionCount}건
          </div>
          <div className="text-xs text-rose-700/80 mt-1">
            수치·해석·기준 오류 ({totalErrors}개 항목)
          </div>
        </div>

        <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="text-xs font-medium text-amber-900">검증 불가</div>
          <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-amber-800 mt-1">
            {report.unverifiableCount}건
          </div>
          <div className="text-xs text-amber-800/80 mt-1">필요한 통계값 누락</div>
        </div>
      </div>

      {/* 8-Rule Error Type Breakdown */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-900">오류 유형별 점검 현황 (①~⑧)</h4>
          <span className="text-xs text-slate-500">
            감지된 오류 총 {totalErrors}건
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          {report.errorStats.map((stat) => {
            const hasErr = stat.count > 0;
            return (
              <div
                key={stat.ruleId}
                className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${
                  hasErr
                    ? 'border-rose-200 bg-rose-50/60 text-rose-900'
                    : 'border-slate-200/80 bg-slate-50/60 text-slate-700'
                }`}
              >
                <span className="text-xs font-medium truncate" title={`${stat.ruleNumber} ${stat.label}`}>
                  {stat.ruleNumber} {stat.label}
                </span>
                <span
                  className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                    hasErr ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {hasErr ? `${stat.count}건` : '0'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Applied Confirmation Banner */}
      {lastAppliedBanner && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs text-emerald-900"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold leading-relaxed">
              {lastAppliedBanner.appliedCount > 1
                ? `${lastAppliedBanner.appliedCount}개 절에 수정된 논문 문장이 본문 워크벤치에 일괄 적용되었습니다.`
                : `‘${lastAppliedBanner.sectionTitle}’ 절에 수정된 논문 문장이 본문 워크벤치에 적용되었습니다.`}{' '}
              <span className="font-mono font-bold">
                (현재 검증 통과율 {lastAppliedBanner.passRate.toFixed(1)}%)
              </span>
            </span>
          </div>
          {onJumpToSection && (
            <button
              type="button"
              onClick={() => onJumpToSection(lastAppliedBanner.sectionId)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/70 transition-colors cursor-pointer shrink-0 no-print"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>적용된 본문 보기</span>
            </button>
          )}
        </div>
      )}

      {/* Flagged Errors & Correction Details (when any section is not pass) */}
      {flaggedSections.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-rose-900">
              오류 감지 절 상세 및 수정 제안 ({flaggedSections.length}건)
            </h4>
            {applicableSections.length > 1 && onApplyAllFixes && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onApplyAllFixes(applicableSections)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-1.5 min-h-[36px] text-xs font-semibold text-white hover:bg-blue-800 transition-colors cursor-pointer no-print"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>수정된 논문 문장 일괄 적용 ({applicableSections.length}건)</span>
              </button>
            )}
          </div>
          <div className="space-y-3">
            {flaggedSections.map((sec) => (
              <div
                key={sec.sectionId}
                className={`rounded-xl border p-4 space-y-3 ${
                  sec.status === 'needs_revision'
                    ? 'border-rose-200 bg-rose-50/30'
                    : 'border-amber-200 bg-amber-50/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status={sec.status} />
                    <span className="text-sm font-bold text-slate-900">
                      {sec.stepLabel} · {sec.sectionTitle}
                    </span>
                  </div>
                  {sec.suggestedText && onApplyFix && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onApplyFix(sec)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-white hover:bg-blue-800 transition-colors cursor-pointer no-print"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>수정된 논문 문장 적용</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5 text-xs">
                  <div className="bg-white border border-slate-200/80 rounded-lg p-3">
                    <div className="font-bold text-slate-700 mb-1">기존 문장</div>
                    <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                      {sec.originalText || '(문장 없음)'}
                    </p>
                  </div>

                  <div className="bg-white border border-rose-200/80 rounded-lg p-3">
                    <div className="font-bold text-rose-800 mb-1">오류가 발생한 이유</div>
                    {sec.issues.length > 0 ? (
                      <ul className="space-y-1 text-rose-900">
                        {sec.issues.map((iss, idx) => (
                          <li key={idx}>
                            · [{iss.ruleNumber} {iss.ruleTitle}] {iss.reason}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-amber-800">
                        필요한 통계값(또는 유효 표본)이 누락되어 문장을 검증할 수 없습니다.
                      </p>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200/80 rounded-lg p-3">
                    <div className="font-bold text-slate-700 mb-1">실제 통계 결과</div>
                    <p className="font-mono text-slate-800 leading-relaxed break-words">
                      {sec.actualStatsSummary}
                    </p>
                  </div>

                  <div className="bg-white border border-blue-200/80 rounded-lg p-3">
                    <div className="font-bold text-blue-800 mb-1">수정된 논문 문장</div>
                    {sec.suggestedText ? (
                      <p className="text-slate-800 leading-relaxed whitespace-pre-line">
                        {sec.suggestedText}
                      </p>
                    ) : (
                      <p className="text-slate-500">
                        필요한 통계 결과 또는 실행된 분석이 없어 수정 문장을 임의로 생성하지 않았습니다.
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
                    <div className="font-bold text-slate-700 mb-1">참고한 통계적 판단 기준</div>
                    <ul className="space-y-0.5 text-slate-600">
                      {sec.appliedCriteria.map((crit, cIdx) => (
                        <li key={cIdx}>· {crit}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Independent Cross-Check Comparison Report */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <h4 className="text-sm font-bold text-slate-900">
            분석별 교차 검증 보고서 (웹앱 분석 vs 독립 재계산)
          </h4>
          <span className="text-xs text-slate-500">허용 오차 기준: 계수·R²·α ≤ 10⁻⁴, F·Z ≤ 10⁻³</span>
        </div>

        {report.comparisons.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 text-center">
            교차 검증할 통계 분석 결과가 아직 없습니다.
          </div>
        ) : (
          <>
            {/* Mobile Card View (< sm) */}
            <div className="sm:hidden space-y-2.5">
              {report.comparisons.map((row) => (
                <div
                  key={row.analysisKey}
                  className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/60 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{row.analysisLabel}</span>
                    <StatusBadge status={row.finalVerdict} />
                  </div>
                  <div className="bg-white border border-slate-200/70 rounded-lg p-2.5 space-y-1.5">
                    <div>
                      <span className="text-slate-500">웹앱 결과: </span>
                      <span className="font-mono text-slate-900">{row.webAppResult}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">독립 계산: </span>
                      <span className="font-mono text-slate-900">{row.independentResult}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="font-mono text-slate-600">{row.differenceSummary}</span>
                      <span
                        className={`font-semibold ${
                          row.withinTolerance === true
                            ? 'text-emerald-700'
                            : row.withinTolerance === false
                              ? 'text-rose-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {row.withinTolerance === true
                          ? '오차 허용 내'
                          : row.withinTolerance === false
                            ? '오차 초과'
                            : '비교 불가'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (sm+) */}
            <div className="hidden sm:block">
              <ScrollableTable>
                <table className="w-full min-w-[780px] text-xs">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">분석 항목</th>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">웹앱 분석 결과</th>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">독립 계산 결과</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">두 결과의 차이</th>
                      <th className="px-3.5 py-2.5 text-center font-semibold whitespace-nowrap">오차 허용 여부</th>
                      <th className="px-3.5 py-2.5 text-center font-semibold whitespace-nowrap">논문 문장 정확성</th>
                      <th className="px-3.5 py-2.5 text-center font-semibold whitespace-nowrap">최종 검증 결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.comparisons.map((row) => (
                      <tr key={row.analysisKey} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                          {row.analysisLabel}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-800">{row.webAppResult}</td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-800">{row.independentResult}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {row.differenceSummary}
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              row.withinTolerance === true
                                ? 'text-emerald-700'
                                : row.withinTolerance === false
                                  ? 'text-rose-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {row.withinTolerance === true
                              ? '허용 내 (일치)'
                              : row.withinTolerance === false
                                ? '허용 초과'
                                : '계산 불가'}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <StatusBadge status={row.sentenceAccuracy} />
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <StatusBadge status={row.finalVerdict} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          </>
        )}
      </div>

      {/* Persisted Verification & Revision History */}
      <div className="border-t border-slate-200 pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 hover:text-blue-700 transition-colors cursor-pointer"
          >
            <History className="w-4 h-4 text-slate-500" />
            <span>검증 및 문장 수정 이력 저장소 ({history.length}건)</span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {history.length > 0 && onClearHistory && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:text-rose-700 hover:border-rose-200 transition-colors cursor-pointer no-print"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>이력 비우기</span>
            </button>
          )}
        </div>

        {showHistory && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 text-center">
                아직 저장된 수정 이력이 없습니다. 문장을 수정하거나 자동 수정 제안을 적용하면 이력이 기기 내에 자동 저장됩니다.
              </div>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {entry.sectionTitle} ·{' '}
                      <span className="font-normal text-slate-600">{entry.reasonSummary}</span>
                    </span>
                    <span className="font-mono text-slate-500">
                      {new Date(entry.timestamp).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-slate-600">
                    <span>이전 상태:</span>
                    <StatusBadge status={entry.previousStatus} />
                    <span>→</span>
                    <StatusBadge status={entry.nextStatus} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
