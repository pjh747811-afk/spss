import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  AnalysisBundle,
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
  SectionVerificationResult,
  VerificationHistoryEntry,
} from '../../types/stats';
import {
  downloadCompositesCSV,
  downloadExcelWorkbook,
  downloadSummaryCSV,
  downloadThesisText,
} from '../../utils/fileIO';
import {
  appendVerificationHistory,
  clearVerificationHistory,
  loadVerificationStore,
  saveVerificationSnapshot,
} from '../../utils/modelStore';
import { fmtNum, fmtP, getHypothesisVerdict, sigStars } from '../../utils/statistics';
import { verifyThesisSections } from '../../utils/thesisVerifier';
import { ThesisSection, ThesisStyle } from '../../utils/thesisWriter';
import { AcademicTablesPanel } from '../AcademicTablesPanel';
import { ScrollableTable } from '../ScrollableTable';
import { StepFooterNav } from '../StepFooterNav';
import { StepIssuesAlert } from '../StepIssuesAlert';
import {
  AppliedFixBanner,
  StatusBadge,
  ThesisVerificationReport,
} from '../ThesisVerificationReport';
import { useOptionalToast } from '../ToastCenter';

interface StepReportProps {
  bundle: AnalysisBundle | null;
  fileName: string;
  rows: DataRow[];
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  efaConfig: EFAConfig;
  thesisSections: ThesisSection[];
  onPrev: () => void;
  onResetToStart: () => void;
}

export const StepReport: React.FC<StepReportProps> = ({
  bundle,
  fileName,
  rows,
  constructs,
  hypothesis,
  efaConfig,
  thesisSections,
  onPrev,
  onResetToStart,
}) => {
  const [style, setStyle] = useState<ThesisStyle>('standard');
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [recentlyAppliedIds, setRecentlyAppliedIds] = useState<Record<string, boolean>>({});
  const [lastAppliedBanner, setLastAppliedBanner] = useState<AppliedFixBanner | null>(null);
  const [history, setHistory] = useState<VerificationHistoryEntry[]>(
    () => loadVerificationStore().history
  );
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const highlightTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toast = useOptionalToast();

  // Reset user edits when dataset/bundle or style changes
  useEffect(() => {
    setEditedTexts({});
    setRecentlyAppliedIds({});
    setLastAppliedBanner(null);
  }, [bundle?.timestamp, style]);

  useEffect(() => {
    const timers = highlightTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  // Reactive 8-rule verification + independent mathematical cross-check
  const verificationReport = useMemo(
    () =>
      verifyThesisSections({
        rows,
        constructs,
        hypothesis,
        efaConfig,
        bundle,
        sections: thesisSections,
        style,
        editedTexts,
      }),
    [rows, constructs, hypothesis, efaConfig, bundle, thesisSections, style, editedTexts]
  );

  // Persist verification snapshot whenever report updates
  useEffect(() => {
    if (!bundle || verificationReport.totalSections === 0) return;
    saveVerificationSnapshot(verificationReport);
  }, [bundle, verificationReport]);

  if (!bundle) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-slate-700">종합 보고서 데이터가 없습니다.</p>
          <p className="text-xs text-slate-500 mt-1">
            0단계에서 설문 데이터를 불러온 뒤 각 분석 단계를 확인하세요.
          </p>
        </div>
        <StepFooterNav prevLabel="5. 회귀분석 (H1~H3)" onPrev={onPrev} />
      </div>
    );
  }

  const getSectionText = (s: ThesisSection) => {
    if (editedTexts[s.id] !== undefined) return editedTexts[s.id];
    return style === 'standard' ? s.standardText : s.conciseText;
  };

  const fullManuscript = thesisSections
    .map((s, idx) => `${idx + 1}. ${s.title}\n${getSectionText(s)}`)
    .join('\n\n');

  const handleCopyOne = async (s: ThesisSection) => {
    try {
      await navigator.clipboard.writeText(getSectionText(s));
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullManuscript);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const jumpToSection = (sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const ta = textareaRefs.current[sectionId];
    if (ta && typeof ta.focus === 'function') {
      setTimeout(() => {
        ta.focus({ preventScroll: true });
      }, 220);
    }
  };

  const markSectionApplied = (sectionId: string) => {
    setRecentlyAppliedIds((prev) => ({ ...prev, [sectionId]: true }));
    if (highlightTimersRef.current[sectionId]) {
      clearTimeout(highlightTimersRef.current[sectionId]);
    }
    highlightTimersRef.current[sectionId] = setTimeout(() => {
      setRecentlyAppliedIds((prev) => {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      });
    }, 3500);
  };

  const computeNextEditedTexts = (
    base: Record<string, string>,
    updates: Array<{ sectionId: string; revised: string }>
  ) => {
    const next = { ...base };
    for (const { sectionId, revised } of updates) {
      const targetSec = thesisSections.find((s) => s.id === sectionId);
      const autoText = targetSec
        ? style === 'standard'
          ? targetSec.standardText
          : targetSec.conciseText
        : null;
      if (autoText !== null && revised === autoText) {
        delete next[sectionId];
      } else {
        next[sectionId] = revised;
      }
    }
    return next;
  };

  const handleApplyFix = (
    secResult: SectionVerificationResult,
    options?: { scrollOnResolve?: boolean }
  ) => {
    if (!secResult.suggestedText) return;
    const revised = secResult.suggestedText;
    const nextEdited = computeNextEditedTexts(editedTexts, [
      { sectionId: secResult.sectionId, revised },
    ]);
    setEditedTexts(nextEdited);

    const nextReport = verifyThesisSections({
      rows,
      constructs,
      hypothesis,
      efaConfig,
      bundle,
      sections: thesisSections,
      style,
      editedTexts: nextEdited,
    });
    const nextSec = nextReport.sectionResults.find(
      (r) => r.sectionId === secResult.sectionId
    );
    const nextStatus = nextSec?.status ?? 'pass';

    const reasonSummary = secResult.issues.length
      ? `${secResult.issues.map((i) => i.ruleNumber).join(', ')} 수정 제안 적용`
      : '수정된 논문 문장 적용';
    const nextHistory = appendVerificationHistory({
      id: `${Date.now()}_${secResult.sectionId}`,
      timestamp: Date.now(),
      fileName,
      sectionId: secResult.sectionId,
      sectionTitle: secResult.sectionTitle,
      action: 'apply_fix',
      previousStatus: secResult.status,
      nextStatus,
      previousText: secResult.originalText,
      revisedText: revised,
      reasonSummary,
    });
    setHistory(nextHistory);
    markSectionApplied(secResult.sectionId);
    setLastAppliedBanner({
      sectionId: secResult.sectionId,
      sectionTitle: secResult.sectionTitle,
      appliedCount: 1,
      passRate: nextReport.passRate,
    });

    toast?.pushToast({
      severity: 'success',
      title: '수정된 논문 문장 적용 완료',
      message: `‘${secResult.sectionTitle}’ 절에 검증된 수정 문장이 본문에 반영되었습니다. (통과율 ${nextReport.passRate.toFixed(1)}%)`,
    });

    const remainingFlagged = nextReport.sectionResults.filter((r) => r.status !== 'pass').length;
    if (options?.scrollOnResolve && remainingFlagged === 0) {
      jumpToSection(secResult.sectionId);
    }
  };

  const handleApplyAllFixes = (secResults: SectionVerificationResult[]) => {
    const applicable = secResults.filter((r) => Boolean(r.suggestedText));
    if (!applicable.length) return;

    const nextEdited = computeNextEditedTexts(
      editedTexts,
      applicable.map((r) => ({ sectionId: r.sectionId, revised: r.suggestedText! }))
    );
    setEditedTexts(nextEdited);

    const nextReport = verifyThesisSections({
      rows,
      constructs,
      hypothesis,
      efaConfig,
      bundle,
      sections: thesisSections,
      style,
      editedTexts: nextEdited,
    });

    let latestHistory = history;
    for (const secResult of applicable) {
      const nextSec = nextReport.sectionResults.find(
        (r) => r.sectionId === secResult.sectionId
      );
      const nextStatus = nextSec?.status ?? 'pass';
      const reasonSummary = secResult.issues.length
        ? `${secResult.issues.map((i) => i.ruleNumber).join(', ')} 일괄 수정 적용`
        : '수정된 논문 문장 일괄 적용';
      latestHistory = appendVerificationHistory({
        id: `${Date.now()}_${secResult.sectionId}_batch`,
        timestamp: Date.now(),
        fileName,
        sectionId: secResult.sectionId,
        sectionTitle: secResult.sectionTitle,
        action: 'apply_fix',
        previousStatus: secResult.status,
        nextStatus,
        previousText: secResult.originalText,
        revisedText: secResult.suggestedText!,
        reasonSummary,
      });
      markSectionApplied(secResult.sectionId);
    }
    setHistory(latestHistory);

    const firstSec = applicable[0];
    setLastAppliedBanner({
      sectionId: firstSec.sectionId,
      sectionTitle: firstSec.sectionTitle,
      appliedCount: applicable.length,
      passRate: nextReport.passRate,
    });

    toast?.pushToast({
      severity: 'success',
      title: '수정된 논문 문장 일괄 적용 완료',
      message: `${applicable.length}개 절에 수정된 논문 문장이 적용되었습니다. (통과율 ${nextReport.passRate.toFixed(1)}%)`,
    });

    jumpToSection(firstSec.sectionId);
  };

  const handleRestoreAuto = (section: ThesisSection, secResult?: SectionVerificationResult) => {
    const autoText = style === 'standard' ? section.standardText : section.conciseText;
    const prevText = editedTexts[section.id] ?? autoText;
    setEditedTexts((prev) => {
      const next = { ...prev };
      delete next[section.id];
      return next;
    });
    if (prevText !== autoText && secResult) {
      const nextHistory = appendVerificationHistory({
        id: `${Date.now()}_${section.id}_restore`,
        timestamp: Date.now(),
        fileName,
        sectionId: section.id,
        sectionTitle: section.title,
        action: 'restore_auto',
        previousStatus: secResult.status,
        nextStatus: 'pass',
        previousText: prevText,
        revisedText: autoText,
        reasonSummary: '자동 생성 원문 복원',
      });
      setHistory(nextHistory);
    }
  };

  const handleClearHistory = () => {
    clearVerificationHistory();
    setHistory([]);
  };

  const exportThesisRows = thesisSections.map((s) => ({
    stepLabel: s.stepLabel,
    title: s.title,
    text: getSectionText(s),
  }));

  return (
    <div className="space-y-6">
      {/* Export Actions & Summary Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">6. 결과 요약 &amp; 논문 문장 작성</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              분석 파일: {fileName} · 결과표 요약과 KCI/APA 3선표, 그리고 논문에 바로 삽입할 수 있는 통계 보고 문장을 작성·복사합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => downloadExcelWorkbook(bundle, exportThesisRows)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>엑셀 통합 시트 (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => downloadThesisText('SPSS연구통계_논문결과문장', fullManuscript)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>논문 문장 (.txt)</span>
            </button>
            <button
              type="button"
              onClick={() => downloadSummaryCSV(bundle)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>결과 요약 CSV</span>
            </button>
            <button
              type="button"
              onClick={() => downloadCompositesCSV(bundle)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>합변수 CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>인쇄 / PDF</span>
            </button>
          </div>
        </div>

        {/* Checklist metrics: 2-up on mobile, 4-up on lg */}
        {(() => {
          const h1Reg = bundle.regressions.find((r) => r.id === 'H1');
          const h3Reg = bundle.regressions.find((r) => r.id === 'H3') ?? bundle.regressions[0];
          const finiteAlphas = bundle.reliability
            .map((r) => r.alpha)
            .filter((a) => Number.isFinite(a));
          const multiItemRel = bundle.reliability.filter((r) => r.nItems >= 2);
          const alertIssues = (bundle.issues ?? []).filter((i) => i.severity !== 'info');

          return (
            <>
              {alertIssues.length > 0 && (
                <div className="pt-4">
                  <StepIssuesAlert issues={alertIssues} title="분석 주의·오류 안내" />
                </div>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 py-4 sm:py-5 border-b border-slate-200">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 min-w-0">
                  <div className="text-xs font-medium text-slate-600">표본적합도 KMO · Harman</div>
                  <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {bundle.efa ? fmtNum(bundle.efa.kmo, 3) : '—'}
                    {bundle.efa && Number.isFinite(bundle.efa.harmanSingleFactorPct) && (
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        ({fmtNum(bundle.efa.harmanSingleFactorPct, 1)}%)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {bundle.efa
                      ? `요인 ${bundle.efa.numFactors}개 · ${
                          bundle.efa.harmanSingleFactorPct < 50 ? 'CMB 양호 (< 50%)' : 'CMB 주의 (≥ 50%)'
                        }`
                      : '요인분석 미실행'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 min-w-0">
                  <div className="text-xs font-medium text-slate-600">신뢰도(Cronbach α)</div>
                  <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {finiteAlphas.length
                      ? finiteAlphas.length === 1
                        ? fmtNum(finiteAlphas[0], 2)
                        : `${fmtNum(Math.min(...finiteAlphas), 2)} ~ ${fmtNum(Math.max(...finiteAlphas), 2)}`
                      : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {multiItemRel.length
                      ? `${multiItemRel.filter((r) => r.alpha >= 0.6).length}/${multiItemRel.length}개 기준 충족`
                      : '단일 문항 구성'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 min-w-0">
                  <div className="text-xs font-medium text-slate-600">
                    {h1Reg ? 'H1 설명력 (수정 R²)' : 'H1 (매개 모형)'}
                  </div>
                  <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {h1Reg ? fmtNum(h1Reg.adjR2, 3) : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {h1Reg ? `${(h1Reg.adjR2 * 100).toFixed(1)}% 설명` : '매개변수 미지정'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 min-w-0">
                  <div className="text-xs font-medium text-slate-600">
                    {h3Reg ? `${h3Reg.hypothesis} 설명력 (수정 R²)` : 'H3 설명력 (수정 R²)'}
                  </div>
                  <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {h3Reg ? fmtNum(h3Reg.adjR2, 3) : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {h3Reg ? `${(h3Reg.adjR2 * 100).toFixed(1)}% 설명` : '회귀 결과 없음'}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Hypothesis Summary Table */}
        <h3 className="text-base font-bold text-slate-900 mt-6 mb-3">가설 검정 결과 일람표 (H1~H3)</h3>

        {/* Mobile Card View for H1~H3 (< sm) */}
        <div className="sm:hidden space-y-3">
          {bundle.regressions.map((reg) => {
            const ctrlSet = new Set(reg.controls ?? []);
            const sigs = reg.coeffs
              .filter((c) => c.name !== '(상수)' && !ctrlSet.has(c.name) && c.p < 0.05)
              .sort((a, b) => Math.abs(b.beta ?? 0) - Math.abs(a.beta ?? 0));
            const verdict = getHypothesisVerdict(reg);
            return (
              <div
                key={reg.id}
                className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-blue-700">{reg.hypothesis}</span>
                  <span
                    className={`text-xs font-bold whitespace-nowrap ${
                      verdict === '채택'
                        ? 'text-emerald-700'
                        : verdict === '부분 채택'
                          ? 'text-blue-700'
                          : 'text-slate-500'
                    }`}
                  >
                    {verdict}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-900 leading-relaxed">{reg.label}</div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-white border border-slate-200/70 rounded-lg p-2.5">
                  <div>
                    <span className="text-slate-500">수정 R²: </span>
                    <span className="font-mono font-bold text-slate-900">
                      {fmtNum(reg.adjR2, 3)} ({(reg.adjR2 * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">F: </span>
                    <span
                      className={`font-mono font-semibold ${
                        reg.anova.p < 0.05 ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {fmtNum(reg.anova.f, 2)} ({fmtP(reg.anova.p)})
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  <span className="text-slate-500 font-medium">유의 독립변수: </span>
                  {sigs.length
                    ? sigs.map((s) => `${s.name}(β=${fmtNum(s.beta, 3)})`).join(', ')
                    : '유의한 변수 없음'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tablet/Desktop Table View (sm+) */}
        <div className="hidden sm:block">
          <ScrollableTable>
            <table className="w-full min-w-[700px] text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">가설</th>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap min-w-[160px]">회귀 경로</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">수정 R²</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">F (p)</th>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap min-w-[180px]">유의한 독립변수 (β)</th>
                  <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">채택 여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bundle.regressions.map((reg) => {
                  const ctrlSet = new Set(reg.controls ?? []);
                  const sigs = reg.coeffs
                    .filter((c) => c.name !== '(상수)' && !ctrlSet.has(c.name) && c.p < 0.05)
                    .sort((a, b) => Math.abs(b.beta ?? 0) - Math.abs(a.beta ?? 0));
                  const verdict = getHypothesisVerdict(reg);
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/80">
                      <td className="px-3.5 py-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {reg.hypothesis}
                      </td>
                      <td className="px-3.5 py-3 font-semibold text-slate-900">
                        {reg.label}
                        {reg.controls && reg.controls.length > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            (통제: {reg.controls.join(', ')})
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                        {fmtNum(reg.adjR2, 3)} ({(reg.adjR2 * 100).toFixed(1)}%)
                      </td>
                      <td
                        className={`px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                          reg.anova.p < 0.05 ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {fmtNum(reg.anova.f, 2)} ({fmtP(reg.anova.p)})
                      </td>
                      <td className="px-3.5 py-3 text-slate-700">
                        {sigs.length
                          ? sigs.map((s) => `${s.name} (β=${fmtNum(s.beta, 3)})`).join(', ')
                          : '유의한 변수 없음'}
                      </td>
                      <td
                        className={`px-3.5 py-3 font-semibold whitespace-nowrap ${
                          verdict === '채택'
                            ? 'text-emerald-700'
                            : verdict === '부분 채택'
                              ? 'text-blue-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {verdict}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTable>
        </div>

        {bundle.mediation && (
          <>
            <h3 className="text-base font-bold text-slate-900 mt-6 mb-3">매개효과 검정 요약</h3>

            {/* Mobile Card View (< sm) */}
            <div className="sm:hidden space-y-2.5">
              {bundle.mediation.paths.map((p) => {
                const statusLabel =
                  p.status === 'full'
                    ? '완전매개'
                    : p.status === 'partial'
                      ? '부분매개'
                      : p.status === 'indirect_only'
                        ? '간접효과 유의'
                        : '매개 없음';
                const statusCls =
                  p.status === 'full' || p.status === 'partial'
                    ? 'text-emerald-700'
                    : p.status === 'indirect_only'
                      ? 'text-blue-700'
                      : 'text-slate-400';
                return (
                  <div
                    key={p.independent}
                    className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {p.independent} → {p.mediator} → {p.dependent}
                      </span>
                      <span className={`text-xs font-bold whitespace-nowrap ${statusCls}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs bg-white border border-slate-200/70 rounded-lg p-2.5 font-mono tabular-nums">
                      <div>
                        <span className="font-sans text-slate-500">간접효과: </span>
                        <span className="font-bold text-slate-900">{fmtNum(p.indirectEffect, 3)}</span>
                      </div>
                      <div>
                        <span className="font-sans text-slate-500">Sobel: </span>
                        <span>{fmtNum(p.sobelZ, 2)} ({fmtP(p.sobelP)})</span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-sans text-slate-500">Boot 95% CI: </span>
                        <span>[{fmtNum(p.bootCiLow, 3)}, {fmtNum(p.bootCiHigh, 3)}]</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tablet/Desktop Table View (sm+) */}
            <div className="hidden sm:block">
              <ScrollableTable>
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap min-w-[180px]">경로</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">간접효과 (a×b)</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">Sobel Z (p)</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">Bootstrap 95% CI</th>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">최종 판정</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bundle.mediation.paths.map((p) => (
                      <tr key={p.independent} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                          {p.independent} → {p.mediator} → {p.dependent}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                          {fmtNum(p.indirectEffect, 3)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {fmtNum(p.sobelZ, 2)} ({fmtP(p.sobelP)})
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          [{fmtNum(p.bootCiLow, 3)}, {fmtNum(p.bootCiHigh, 3)}]
                        </td>
                        <td
                          className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                            p.status === 'full' || p.status === 'partial'
                              ? 'text-emerald-700'
                              : p.status === 'indirect_only'
                                ? 'text-blue-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {p.status === 'full'
                            ? '완전매개'
                            : p.status === 'partial'
                              ? '부분매개'
                              : p.status === 'indirect_only'
                                ? '간접효과 유의'
                                : '매개 없음'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          </>
        )}

        {bundle.moderation && (
          <>
            <h3 className="text-base font-bold text-slate-900 mt-6 mb-3">조절효과 검정 요약</h3>

            {/* Mobile Card View (< sm) */}
            <div className="sm:hidden border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {bundle.moderation.xName} × {bundle.moderation.wName} → {bundle.moderation.yName}
                </span>
                <span
                  className={`text-xs font-bold whitespace-nowrap ${
                    bundle.moderation.significant ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {bundle.moderation.significant ? '조절 유의 (채택)' : '조절 없음 (기각)'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs bg-white border border-slate-200/70 rounded-lg p-2.5 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-slate-500">ΔR²: </span>
                  <span className="font-bold">+{fmtNum(bundle.moderation.r2Change, 3)}</span>
                </div>
                <div>
                  <span className="font-sans text-slate-500">ΔF: </span>
                  <span>{fmtNum(bundle.moderation.fChange, 2)} ({fmtP(bundle.moderation.pChange)})</span>
                </div>
                <div className="col-span-2">
                  <span className="font-sans text-slate-500">상호작용 B: </span>
                  <span>
                    {fmtNum(bundle.moderation.interactionCoeff.b, 3)}
                    {sigStars(bundle.moderation.interactionCoeff.p)} (t ={' '}
                    {fmtNum(bundle.moderation.interactionCoeff.t, 2)},{' '}
                    {fmtP(bundle.moderation.interactionCoeff.p)})
                  </span>
                </div>
              </div>
            </div>

            {/* Tablet/Desktop Table View (sm+) */}
            <div className="hidden sm:block">
              <ScrollableTable>
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap min-w-[180px]">상호작용 경로</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">ΔR²</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">ΔF (p)</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">상호작용 B (t, p)</th>
                      <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">최종 판정</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                        {bundle.moderation.xName} × {bundle.moderation.wName} → {bundle.moderation.yName}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                        +{fmtNum(bundle.moderation.r2Change, 3)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {fmtNum(bundle.moderation.fChange, 2)} ({fmtP(bundle.moderation.pChange)})
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {fmtNum(bundle.moderation.interactionCoeff.b, 3)}
                        {sigStars(bundle.moderation.interactionCoeff.p)} (t ={' '}
                        {fmtNum(bundle.moderation.interactionCoeff.t, 2)},{' '}
                        {fmtP(bundle.moderation.interactionCoeff.p)})
                      </td>
                      <td
                        className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                          bundle.moderation.significant ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {bundle.moderation.significant ? '조절효과 유의 (채택)' : '조절효과 없음 (기각)'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          </>
        )}
      </div>

      {/* KCI / APA 3-Line Academic Tables */}
      <AcademicTablesPanel bundle={bundle} />

      {/* Thesis Prose Workbench */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 pb-4 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-blue-700 shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                논문 본문 문장 작성 워크벤치 (자동 생성 · 직접 편집 · 실시간 검증)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                각 절의 결과표 해석 기준과 실제 산출 수치를 반영해 학위·학술지 논문 본문 문장을 생성했습니다. 직접 문장을 수정하면 8개 검증 항목으로 즉시 대조합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
            <div className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setStyle('standard')}
                className={`px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                  style === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                KCI·학위논문 상세형
              </button>
              <button
                type="button"
                onClick={() => setStyle('concise')}
                className={`px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                  style === 'concise' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                핵심 요약형
              </button>
            </div>
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 min-h-[40px] text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedAll ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>전체 문장 복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>전체 논문 문장 복사</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {thesisSections.map((section, idx) => {
            const currentText = getSectionText(section);
            const isEdited = editedTexts[section.id] !== undefined;
            const isCopied = copiedId === section.id;
            const secVerification = verificationReport.sectionResults.find(
              (r) => r.sectionId === section.id
            );

            const isRecentlyApplied = Boolean(recentlyAppliedIds[section.id]);

            return (
              <div
                key={section.id}
                id={`thesis-section-${section.id}`}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                className={`border rounded-2xl p-4 sm:p-5 space-y-3.5 transition-all ${
                  isRecentlyApplied
                    ? 'border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-500/30'
                    : 'border-slate-200/90 bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-blue-700 font-bold">
                        {section.stepLabel}
                      </span>
                      {secVerification && <StatusBadge status={secVerification.status} />}
                      {isRecentlyApplied && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>수정된 논문 문장 적용됨</span>
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-slate-900">
                      {idx + 1}. {section.title}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
                    {isEdited && (
                      <button
                        type="button"
                        onClick={() => handleRestoreAuto(section, secVerification)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px] text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>자동문장 복원</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopyOne(section)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 min-h-[38px] text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-700">복사됨</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-slate-500" />
                          <span>이 절 복사</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Reading Guide */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 text-xs sm:text-sm text-slate-600 space-y-1.5 leading-relaxed">
                  <div className="text-xs font-bold text-slate-900">결과표 읽기 포인트</div>
                  {section.readingGuide.map((line, gIdx) => (
                    <div key={gIdx}>· {line}</div>
                  ))}
                </div>

                {/* Editable Manuscript Textarea */}
                <textarea
                  ref={(el) => {
                    textareaRefs.current[section.id] = el;
                  }}
                  value={currentText}
                  onChange={(e) =>
                    setEditedTexts((prev) => ({ ...prev, [section.id]: e.target.value }))
                  }
                  onBlur={() => {
                    if (isEdited && secVerification && secVerification.status !== 'pass') {
                      const nextHistory = appendVerificationHistory({
                        id: `${Date.now()}_${section.id}_edit`,
                        timestamp: Date.now(),
                        fileName,
                        sectionId: section.id,
                        sectionTitle: section.title,
                        action: 'manual_edit',
                        previousStatus: 'pass',
                        nextStatus: secVerification.status,
                        previousText:
                          style === 'standard' ? section.standardText : section.conciseText,
                        revisedText: currentText,
                        reasonSummary:
                          secVerification.issues.map((i) => i.ruleNumber).join(', ') ||
                          '편집 후 검증 오류 감지',
                      });
                      setHistory(nextHistory);
                    }
                  }}
                  rows={Math.min(10, Math.max(3, Math.ceil(currentText.length / 85)))}
                  aria-label={`${section.title} 논문 문장 편집`}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-800 leading-relaxed focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />

                {/* Inline Verification Error & Fix Panel */}
                {secVerification && secVerification.status !== 'pass' && (
                  <div
                    className={`rounded-xl border p-4 space-y-2.5 text-xs ${
                      secVerification.status === 'needs_revision'
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-amber-200 bg-amber-50/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-rose-900">
                        {secVerification.status === 'needs_revision'
                          ? '문장 검증 오류 감지 — 수정 필요'
                          : '필요한 통계값 누락 — 검증 불가'}
                      </span>
                      {secVerification.suggestedText && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleApplyFix(secVerification)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 transition-colors cursor-pointer no-print"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>수정된 논문 문장 적용</span>
                        </button>
                      )}
                    </div>
                    {secVerification.issues.length > 0 && (
                      <ul className="space-y-1 text-rose-900">
                        {secVerification.issues.map((iss, issIdx) => (
                          <li key={issIdx}>
                            · [{iss.ruleNumber} {iss.ruleTitle}] {iss.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="text-slate-700">
                      <span className="font-semibold">실제 통계 결과: </span>
                      <span className="font-mono">{secVerification.actualStatsSummary}</span>
                    </div>
                    {secVerification.suggestedText && (
                      <div className="bg-white border border-blue-200 rounded-lg p-2.5 text-slate-800">
                        <div className="font-bold text-blue-800 mb-1">수정된 논문 문장 제안</div>
                        <p className="whitespace-pre-line leading-relaxed">
                          {secVerification.suggestedText}
                        </p>
                      </div>
                    )}
                    <div className="text-slate-600">
                      <span className="font-semibold">참고한 통계적 판단 기준: </span>
                      {secVerification.appliedCriteria.join(' / ')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verification Dashboard & Independent Cross-Check Report */}
      <ThesisVerificationReport
        report={verificationReport}
        history={history}
        onApplyFix={(sec) => handleApplyFix(sec, { scrollOnResolve: true })}
        onApplyAllFixes={handleApplyAllFixes}
        lastAppliedBanner={lastAppliedBanner}
        onJumpToSection={jumpToSection}
        onClearHistory={handleClearHistory}
      />

      <StepFooterNav
        prevLabel="5. 회귀분석 (H1~H3)"
        isLastStep
        onPrev={onPrev}
        onResetToStart={onResetToStart}
      />
    </div>
  );
};

