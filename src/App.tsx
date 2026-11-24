import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calculator,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  Grid3X3,
  ShieldCheck,
} from 'lucide-react';
import Papa from 'papaparse';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StepComposites } from './components/steps/StepComposites';
import { StepCorrelation } from './components/steps/StepCorrelation';
import { StepFactorAnalysis } from './components/steps/StepFactorAnalysis';
import { StepRegression } from './components/steps/StepRegression';
import { StepReliability } from './components/steps/StepReliability';
import { StepReport } from './components/steps/StepReport';
import { StepUpload } from './components/steps/StepUpload';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  AnalysisBundle,
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
} from './types/stats';
import { autoDetectConstructs, parsePastedSurveyText, parseSurveyFile } from './utils/fileIO';
import {
  computeComposites,
  extractNumericColumn,
  runCorrelation,
  runEFA,
  runMediation,
  runModeration,
  runOLS,
  runReliability,
} from './utils/statistics';
import { generateThesisSections } from './utils/thesisWriter';

type StepId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const STEPS: {
  id: StepId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 0, label: '0. 개요 & 데이터 입력', shortLabel: '0. 데이터', icon: Database },
  { id: 1, label: '1. 요인분석 (타당성)', shortLabel: '1. 요인분석', icon: BarChart3 },
  { id: 2, label: '2. 신뢰도 분석 (α)', shortLabel: '2. 신뢰도', icon: ShieldCheck },
  { id: 3, label: '3. 변수 계산 (합변수)', shortLabel: '3. 합변수', icon: Calculator },
  { id: 4, label: '4. 상관분석', shortLabel: '4. 상관분석', icon: Grid3X3 },
  { id: 5, label: '5. 회귀 · 매개 · 조절', shortLabel: '5. 회귀·매개', icon: GitBranch },
  { id: 6, label: '6. 결과 요약 & 논문 작성', shortLabel: '6. 논문작성', icon: FileText },
];

function deriveDefaultHypothesis(constructs: ConstructMapping[]): HypothesisConfig {
  const names = constructs.filter((c) => c.items.length > 0).map((c) => c.name);
  const mediator =
    names.find((n) => /심리|매개|capital|psy/i.test(n)) || names[1] || names[0] || '';
  const dependent =
    names.find((n) => /혁신|종속|outcome|innov/i.test(n) && n !== mediator) ||
    names[names.length - 1] ||
    '';
  const independents = names.filter((n) => n !== mediator && n !== dependent);
  return { mediator, dependent, independents, controls: [] };
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeStep, setActiveStep] = useState<StepId>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(() => new Set([0]));
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [constructs, setConstructs] = useState<ConstructMapping[]>([]);
  const [hypothesis, setHypothesis] = useState<HypothesisConfig>({
    mediator: '',
    dependent: '',
    independents: [],
    controls: [],
  });
  const [efaConfig, setEfaConfig] = useState<EFAConfig>({
    items: [],
    extractionMode: 'kaiser',
    fixedFactors: 6,
    loadingThreshold: 0.5,
    sortBySize: true,
  });

  const [bundle, setBundle] = useState<AnalysisBundle | null>(null);

  const navigateToStep = useCallback((nextStep: StepId, markCurrentDone = false) => {
    setActiveStep((prev) => {
      if (markCurrentDone) {
        setCompletedSteps((doneSet) => {
          const nextSet = new Set(doneSet);
          nextSet.add(prev);
          return nextSet;
        });
      }
      return nextStep;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const executePipeline = useCallback(
    (
      targetRows: DataRow[],
      targetConstructs: ConstructMapping[],
      targetHypothesis: HypothesisConfig,
      targetEfaConfig: EFAConfig
    ) => {
      const activeConstructs = targetConstructs.filter((c) => c.items.length > 0);
      if (!targetRows.length || !activeConstructs.length) return;

      const allMappedItems = Array.from(new Set(activeConstructs.flatMap((c) => c.items)));
      const efaResult = runEFA(targetRows, {
        ...targetEfaConfig,
        items: allMappedItems,
      });

      const reliability = runReliability(targetRows, activeConstructs);
      const composites = computeComposites(targetRows, activeConstructs);
      const correlation = runCorrelation(composites);

      const getComp = (name: string) => composites.find((c) => c.name === name);
      const medComp = getComp(targetHypothesis.mediator);
      const depComp = getComp(targetHypothesis.dependent);
      const indepComps = targetHypothesis.independents
        .map((n) => getComp(n))
        .filter((c): c is NonNullable<typeof c> => !!c);

      const controlNames = (targetHypothesis.controls ?? []).filter((c) =>
        targetRows.some((r) => r[c] !== undefined)
      );
      const controlCols = controlNames.map((colName) => ({
        name: colName,
        values: extractNumericColumn(targetRows, colName),
      }));

      const regressions = [];
      let h1Reg = null;
      let h3Reg = null;

      if (medComp && indepComps.length) {
        h1Reg = runOLS(
          'H1',
          'H1',
          `${medComp.name} ← ${indepComps.map((c) => c.name).join(' + ')}`,
          medComp.name,
          medComp.values,
          [...controlCols, ...indepComps.map((c) => ({ name: c.name, values: c.values }))],
          controlNames
        );
        if (h1Reg) regressions.push(h1Reg);
      }

      if (depComp && medComp && depComp.name !== medComp.name) {
        const h2Reg = runOLS(
          'H2',
          'H2',
          `${depComp.name} ← ${medComp.name}`,
          depComp.name,
          depComp.values,
          [...controlCols, { name: medComp.name, values: medComp.values }],
          controlNames
        );
        if (h2Reg) regressions.push(h2Reg);
      }

      if (depComp && indepComps.length) {
        h3Reg = runOLS(
          'H3',
          'H3',
          `${depComp.name} ← ${indepComps.map((c) => c.name).join(' + ')}`,
          depComp.name,
          depComp.values,
          [...controlCols, ...indepComps.map((c) => ({ name: c.name, values: c.values }))],
          controlNames
        );
        if (h3Reg) regressions.push(h3Reg);
      }

      const mediation = runMediation(
        composites,
        targetHypothesis,
        h1Reg,
        h3Reg,
        1000,
        controlCols
      );

      let moderation = null;
      if (
        targetHypothesis.moderationX &&
        targetHypothesis.moderator &&
        targetHypothesis.moderationY
      ) {
        const mx = getComp(targetHypothesis.moderationX);
        const mw = getComp(targetHypothesis.moderator);
        const my = getComp(targetHypothesis.moderationY);
        if (mx && mw && my) {
          moderation = runModeration(
            mx.name,
            mx.values,
            mw.name,
            mw.values,
            my.name,
            my.values,
            controlCols
          );
        }
      }

      setBundle({
        timestamp: Date.now(),
        efa: efaResult,
        reliability,
        composites,
        correlation,
        regressions,
        mediation,
        moderation,
      });
    },
    []
  );

  const initializeDataset = useCallback(
    (loadedRows: DataRow[], loadedCols: string[], name: string, autoRun = true) => {
      setRows(loadedRows);
      setColumns(loadedCols);
      setFileName(name);
      setErrorMsg(null);
      setCompletedSteps(new Set([0]));

      const detected = autoDetectConstructs(loadedCols);
      const hyp = deriveDefaultHypothesis(detected);
      const allItems = Array.from(new Set(detected.flatMap((c) => c.items)));
      const nextEfa: EFAConfig = {
        items: allItems,
        extractionMode: 'kaiser',
        fixedFactors: Math.max(1, detected.length),
        loadingThreshold: 0.5,
        sortBySize: true,
      };

      setConstructs(detected);
      setHypothesis(hyp);
      setEfaConfig(nextEfa);

      if (autoRun && detected.length > 0) {
        executePipeline(loadedRows, detected, hyp, nextEfa);
      } else {
        setBundle(null);
      }
    },
    [executePipeline]
  );

  const handleLoadSample = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/assets/aistudio/data_items_2b48a8f0.csv');
      if (!res.ok) throw new Error('샘플 CSV 파일을 불러오지 못했습니다.');
      const text = (await res.text()).replace(/^\uFEFF/, '');
      const parsed = Papa.parse<DataRow>(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });
      const cleaned = parsed.data.filter((r) =>
        Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
      );
      const cols = (parsed.meta.fields || Object.keys(cleaned[0] || {})).filter(
        (c) => c && String(c).trim() !== ''
      );
      initializeDataset(cleaned, cols, '매개효과test (기본 샘플)', true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '샘플 데이터 로드 실패');
    } finally {
      setIsLoading(false);
    }
  }, [initializeDataset]);

  useEffect(() => {
    void handleLoadSample();
  }, [handleLoadSample]);

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { rows: parsedRows, columns: parsedCols, fileName: parsedName } =
        await parseSurveyFile(file);
      if (!parsedRows.length || !parsedCols.length) {
        setErrorMsg('데이터 행이나 변수명을 찾을 수 없습니다. 첫 행에 변수명이 포함된 파일인지 확인하세요.');
        return;
      }
      initializeDataset(parsedRows, parsedCols, parsedName, true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `파일을 읽는 중 오류가 발생했습니다: ${err.message}`
          : '파일을 읽는 중 오류가 발생했습니다.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasteData = (rawText: string) => {
    setErrorMsg(null);
    const { rows: parsedRows, columns: parsedCols } = parsePastedSurveyText(rawText);
    if (parsedRows.length < 3 || parsedCols.length < 2) {
      setErrorMsg('붙여넣은 데이터에서 충분한 행(3행 이상)과 변수 열(2열 이상)을 찾지 못했습니다. 첫 행에 변수명을 포함해 주세요.');
      return;
    }
    initializeDataset(parsedRows, parsedCols, '직접 붙여넣기 입력 데이터', true);
  };

  const handleRunAnalysis = () => {
    if (!rows.length) {
      navigateToStep(0);
      return;
    }
    executePipeline(rows, constructs, hypothesis, efaConfig);
    setCompletedSteps(new Set([0]));
    navigateToStep(1, true);
  };

  const handleUpdateEfaConfig = (next: EFAConfig) => {
    setEfaConfig(next);
    if (rows.length && constructs.length) {
      executePipeline(rows, constructs, hypothesis, next);
    }
  };

  const handleUpdateModeration = (x?: string, w?: string, y?: string) => {
    const nextHyp: HypothesisConfig = {
      ...hypothesis,
      moderationX: x,
      moderator: w,
      moderationY: y,
    };
    setHypothesis(nextHyp);
    if (rows.length && constructs.length) {
      executePipeline(rows, constructs, nextHyp, efaConfig);
    }
  };

  const thesisSections = useMemo(
    () => (bundle ? generateThesisSections(bundle, hypothesis) : []),
    [bundle, hypothesis]
  );

  const efaRelThesis = useMemo(
    () => thesisSections.find((s) => s.id === 'efa_rel'),
    [thesisSections]
  );
  const descCorrThesis = useMemo(
    () => thesisSections.find((s) => s.id === 'desc_corr'),
    [thesisSections]
  );
  const regThesis = useMemo(
    () => thesisSections.find((s) => s.id === 'regression'),
    [thesisSections]
  );
  const medThesis = useMemo(
    () => thesisSections.find((s) => s.id === 'mediation'),
    [thesisSections]
  );
  const modThesis = useMemo(
    () => thesisSections.find((s) => s.id === 'moderation'),
    [thesisSections]
  );

  const datasetStatusText = useMemo(() => {
    if (isLoading && !rows.length) return '데이터 불러오는 중...';
    if (!rows.length) return '데이터 대기 중';
    return `N = ${rows.length} · 변수 ${columns.length}개`;
  }, [isLoading, rows.length, columns.length]);

  const progressText = useMemo(() => {
    return `${completedSteps.size} / ${STEPS.length}단계 확인`;
  }, [completedSteps.size]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              navigateToStep(0);
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            StatFlow 연구통계
          </a>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateToStep(0)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeStep === 0 ? 'text-blue-700 font-semibold border-b-2 border-blue-700' : ''
              }`}
            >
              개요·데이터
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(1)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeStep === 1 ? 'text-blue-700 font-semibold border-b-2 border-blue-700' : ''
              }`}
            >
              요인분석
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(2)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeStep === 2 || activeStep === 3
                  ? 'text-blue-700 font-semibold border-b-2 border-blue-700'
                  : ''
              }`}
            >
              신뢰도·변수계산
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(4)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeStep === 4 || activeStep === 5
                  ? 'text-blue-700 font-semibold border-b-2 border-blue-700'
                  : ''
              }`}
            >
              상관·회귀분석
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(6)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeStep === 6 ? 'text-blue-700 font-semibold border-b-2 border-blue-700' : ''
              }`}
            >
              결과·논문작성
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {rows.length > 0 ? (
              <button
                type="button"
                onClick={handleRunAnalysis}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                1단계부터 순서대로 시작
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                매개효과test 불러오기
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile horizontal step switcher */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-3 py-2 overflow-x-auto no-print">
        <div className="flex items-center gap-1.5">
          {STEPS.map((step) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => navigateToStep(step.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {step.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Desktop Left Sidebar */}
        <aside className="hidden lg:block lg:col-span-3 xl:col-span-2 no-print">
          <div className="sticky top-20 space-y-5">
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-xs font-semibold text-slate-500">SPSS 분석 절차</span>
                <span className="text-[11px] font-mono tabular-nums text-blue-700 font-semibold">
                  {progressText}
                </span>
              </div>
              <nav className="space-y-1" aria-label="통계 분석 단계">
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  const active = activeStep === step.id;
                  const done = completedSteps.has(step.id) && bundle !== null;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => navigateToStep(step.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-700 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                        <span className="truncate">{step.label}</span>
                      </span>
                      {done && !active && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-slate-200 pt-4 px-2 space-y-2 text-xs text-slate-600">
              <div className="font-semibold text-slate-800">현재 작업 상태</div>
              <div className="font-mono tabular-nums text-slate-700">{datasetStatusText}</div>
              {fileName && <div className="truncate text-slate-500">{fileName}</div>}
              {bundle && (
                <div className="text-emerald-700 font-medium">
                  전체 분석 · 논문 문장 준비됨
                </div>
              )}
            </div>

            <div className="pt-1">
              <PWAInstallButton />
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="lg:col-span-9 xl:col-span-10 min-w-0">
          {activeStep === 0 && (
            <StepUpload
              fileName={fileName}
              rows={rows}
              columns={columns}
              isLoading={isLoading}
              errorMsg={errorMsg}
              constructs={constructs}
              hypothesis={hypothesis}
              efaConfig={efaConfig}
              bundle={bundle}
              onChangeConstructs={setConstructs}
              onChangeHypothesis={setHypothesis}
              onChangeEFAConfig={setEfaConfig}
              onAutoDetect={() => {
                const detected = autoDetectConstructs(columns);
                const hyp = deriveDefaultHypothesis(detected);
                setConstructs(detected);
                setHypothesis(hyp);
                executePipeline(rows, detected, hyp, efaConfig);
              }}
              onFileUpload={handleFileUpload}
              onPasteData={handlePasteData}
              onLoadSample={handleLoadSample}
              onRunAnalysis={handleRunAnalysis}
              onNext={() => {
                executePipeline(rows, constructs, hypothesis, efaConfig);
                navigateToStep(1, true);
              }}
            />
          )}

          {activeStep === 1 && (
            <StepFactorAnalysis
              efa={bundle?.efa ?? null}
              efaConfig={efaConfig}
              thesisSection={efaRelThesis}
              onUpdateConfig={handleUpdateEfaConfig}
              onPrev={() => navigateToStep(0)}
              onNext={() => navigateToStep(2, true)}
            />
          )}

          {activeStep === 2 && (
            <StepReliability
              rows={bundle?.reliability ?? []}
              thesisSection={efaRelThesis}
              onPrev={() => navigateToStep(1)}
              onNext={() => navigateToStep(3, true)}
            />
          )}

          {activeStep === 3 && (
            <StepComposites
              composites={bundle?.composites ?? []}
              thesisSection={descCorrThesis}
              onPrev={() => navigateToStep(2)}
              onNext={() => navigateToStep(4, true)}
            />
          )}

          {activeStep === 4 && (
            <StepCorrelation
              correlation={bundle?.correlation ?? { names: [], matrix: [] }}
              composites={bundle?.composites ?? []}
              thesisSection={descCorrThesis}
              onPrev={() => navigateToStep(3)}
              onNext={() => navigateToStep(5, true)}
            />
          )}

          {activeStep === 5 && (
            <StepRegression
              regressions={bundle?.regressions ?? []}
              mediation={bundle?.mediation ?? null}
              moderation={bundle?.moderation ?? null}
              composites={bundle?.composites ?? []}
              hypothesis={hypothesis}
              regressionThesis={regThesis}
              mediationThesis={medThesis}
              moderationThesis={modThesis}
              onUpdateModeration={handleUpdateModeration}
              onPrev={() => navigateToStep(4)}
              onNext={() => navigateToStep(6, true)}
            />
          )}

          {activeStep === 6 && (
            <StepReport
              bundle={bundle}
              fileName={fileName}
              thesisSections={thesisSections}
              onPrev={() => navigateToStep(5)}
              onResetToStart={() => navigateToStep(0, true)}
            />
          )}
        </main>
      </div>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg no-print">
          오프라인 모드 · 모든 통계 연산과 논문 문장 작성이 브라우저 내부에서 정상 작동합니다.
        </div>
      )}

      <footer className="border-t border-slate-200 bg-white py-5 px-4 text-center text-xs text-slate-500 no-print">
        StatFlow 연구통계 · 데이터 입력 → 통계분석 → 결과표 읽기 → 논문 본문 문장 작성 · 모든 데이터는 기기 내에서만 처리됩니다.
      </footer>
    </div>
  );
}
