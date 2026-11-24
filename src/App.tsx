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
  ColumnProfile,
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
  StepIssue,
} from './types/stats';
import {
  autoDetectConstructs,
  normalizeTabularData,
  parsePastedSurveyText,
  parseSurveyFile,
} from './utils/fileIO';
import {
  computeComposites,
  extractNumericColumn,
  profileColumns,
  runCorrelation,
  runEFAWithDiagnostics,
  runMediation,
  runModeration,
  runOLSWithDiagnostics,
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
  if (names.length === 0) {
    return { mediator: '', dependent: '', independents: [], controls: [] };
  }
  if (names.length === 1) {
    return { mediator: '', dependent: names[0], independents: [], controls: [] };
  }
  if (names.length === 2) {
    return { mediator: '', dependent: names[1], independents: [names[0]], controls: [] };
  }

  const mediator =
    names.find((n) => /심리|매개|capital|psy|mediat|^m$/i.test(n)) || names[1] || '';
  const dependent =
    names.find((n) => n !== mediator && /혁신|종속|성과|만족|outcome|innov|dep|^y$/i.test(n)) ||
    names.find((n) => n !== mediator && n === names[names.length - 1]) ||
    names.find((n) => n !== mediator) ||
    '';
  const independents = names.filter((n) => n !== mediator && n !== dependent);
  return { mediator, dependent, independents, controls: [] };
}

function runUnifiedPipeline(
  targetRows: DataRow[],
  targetColumns: string[],
  targetConstructs: ConstructMapping[],
  targetHypothesis: HypothesisConfig,
  targetEfaConfig: EFAConfig,
  parseWarnings: string[]
): AnalysisBundle | null {
  if (!targetRows.length) return null;

  const issues: StepIssue[] = parseWarnings.map((msg) => ({
    step: 'upload',
    severity: 'info',
    message: msg,
  }));

  const columnProfiles: ColumnProfile[] = profileColumns(targetRows, targetColumns);
  const numericColsCount = columnProfiles.filter((c) => c.kind === 'numeric').length;
  if (numericColsCount === 0) {
    issues.push({
      step: 'upload',
      severity: 'error',
      message: '데이터에서 통계 계산이 가능한 수치형 열을 찾지 못했습니다.',
      actionHint: '설문 응답 값이 숫자(예: 1~5점)로 저장된 파일인지 확인하세요.',
    });
  }

  const activeConstructs = targetConstructs.filter((c) => c.items.length > 0);
  if (!activeConstructs.length) {
    issues.push({
      step: 'mapping',
      severity: 'error',
      message: '구성개념에 연결된 측정 문항이 없어 분석을 실행할 수 없습니다.',
      actionHint: '0단계 [변수 매핑 · 모형 설정] 탭에서 각 구성개념에 문항을 연결해 주세요.',
    });
    console.warn('[SPSS 연구통계] 매핑된 문항이 없어 분석을 건너뛰었습니다.', { issues });
    return {
      timestamp: Date.now(),
      efa: null,
      reliability: [],
      composites: [],
      correlation: { names: [], matrix: [] },
      regressions: [],
      mediation: null,
      moderation: null,
      issues,
      columnProfiles,
    };
  }

  const allMappedItems = Array.from(new Set(activeConstructs.flatMap((c) => c.items)));
  const efaOut = runEFAWithDiagnostics(targetRows, {
    ...targetEfaConfig,
    items: allMappedItems,
  });
  issues.push(...efaOut.issues);

  const reliability = runReliability(targetRows, activeConstructs);
  for (const rel of reliability) {
    if (rel.nItems < 2) {
      issues.push({
        step: 'reliability',
        severity: 'info',
        message: `'${rel.constructName}'은(는) 단일 문항(1개)으로 구성되어 Cronbach’s α를 산출하지 않습니다.`,
        variables: rel.items,
      });
    } else if (rel.nValid < 2 || !Number.isFinite(rel.alpha)) {
      issues.push({
        step: 'reliability',
        severity: 'warning',
        message: `'${rel.constructName}'의 유효 응답 케이스(N=${rel.nValid})가 부족하거나 응답 분산이 0이어서 신뢰도(α)를 계산할 수 없습니다.`,
        actionHint: '결측이 많은 문항이나 문자형 열이 포함되었는지 확인하세요.',
        variables: rel.items,
      });
    }
  }

  const composites = computeComposites(targetRows, activeConstructs);
  for (const comp of composites) {
    if (comp.n === 0) {
      issues.push({
        step: 'composites',
        severity: 'error',
        message: `합변수 '${comp.name}합'에 유효한 수치 데이터가 없습니다(N=0).`,
        actionHint: '연결된 문항이 문자열·날짜·결측으로만 채워져 있지 않은지 확인하세요.',
        variables: comp.items,
      });
    }
  }

  const correlation = runCorrelation(composites);
  if (composites.length < 2) {
    issues.push({
      step: 'correlation',
      severity: 'info',
      message: '상관분석 및 회귀분석을 수행하려면 최소 2개 이상의 구성개념이 필요합니다.',
      actionHint: '0단계 [변수 매핑 · 모형 설정]에서 독립변수와 종속변수를 별도 구성개념으로 분리해 주세요.',
    });
  }

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

  if (!depComp || !indepComps.length) {
    issues.push({
      step: 'regression',
      severity: 'warning',
      message:
        '회귀분석을 실행하려면 독립변수(X)와 종속변수(Y)가 각각 1개 이상 지정되어야 합니다.',
      actionHint: '0단계 [변수 매핑 · 모형 설정]에서 독립변수(X)와 종속변수(Y)를 선택해 주세요.',
    });
  }

  if (medComp && indepComps.length) {
    const h1Out = runOLSWithDiagnostics(
      'H1',
      'H1',
      `${medComp.name} ← ${indepComps.map((c) => c.name).join(' + ')}`,
      medComp.name,
      medComp.values,
      [...controlCols, ...indepComps.map((c) => ({ name: c.name, values: c.values }))],
      controlNames
    );
    if (h1Out.result) {
      h1Reg = h1Out.result;
      regressions.push(h1Reg);
    } else if (h1Out.issue) {
      issues.push(h1Out.issue);
    }
  }

  if (depComp && medComp && depComp.name !== medComp.name) {
    const h2Out = runOLSWithDiagnostics(
      'H2',
      'H2',
      `${depComp.name} ← ${medComp.name}`,
      depComp.name,
      depComp.values,
      [...controlCols, { name: medComp.name, values: medComp.values }],
      controlNames
    );
    if (h2Out.result) {
      regressions.push(h2Out.result);
    } else if (h2Out.issue) {
      issues.push(h2Out.issue);
    }
  }

  if (depComp && indepComps.length) {
    const h3Out = runOLSWithDiagnostics(
      'H3',
      'H3',
      `${depComp.name} ← ${indepComps.map((c) => c.name).join(' + ')}`,
      depComp.name,
      depComp.values,
      [...controlCols, ...indepComps.map((c) => ({ name: c.name, values: c.values }))],
      controlNames
    );
    if (h3Out.result) {
      h3Reg = h3Out.result;
      regressions.push(h3Reg);
    } else if (h3Out.issue) {
      issues.push(h3Out.issue);
    }
  }

  const mediation = runMediation(
    composites,
    targetHypothesis,
    h1Reg,
    h3Reg,
    1000,
    controlCols
  );

  if (!mediation && indepComps.length > 0 && depComp) {
    if (!medComp || medComp.name === depComp.name) {
      issues.push({
        step: 'mediation',
        severity: 'info',
        message: '매개효과 검정을 실행하려면 독립·종속변수와 구분되는 매개변수(M)를 선택해야 합니다.',
        actionHint: '0단계 [변수 매핑 · 모형 설정]에서 매개변수(M)를 별도로 지정하면 Baron & Kenny · Sobel · Bootstrap 검증이 자동 실행됩니다.',
      });
    } else {
      issues.push({
        step: 'mediation',
        severity: 'warning',
        message: '유효 표본 수 부족 또는 다중공선성으로 인해 4단계 매개검증 회귀식을 추정하지 못했습니다.',
      });
    }
  }

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
      if (!moderation) {
        issues.push({
          step: 'moderation',
          severity: 'warning',
          message:
            '조절효과 검증에 필요한 유효 표본 수가 부족하거나 선택한 변수(X, W, Y)가 중복·상수입니다.',
        });
      }
    }
  }

  console.info('[SPSS 연구통계] 분석 파이프라인 실행 완료', {
    rows: targetRows.length,
    constructs: activeConstructs.map((c) => `${c.name}(${c.items.length})`),
    efaN: efaOut.result?.n ?? null,
    regressions: regressions.map((r) => `${r.id}:N=${r.n},adjR2=${r.adjR2.toFixed(3)}`),
    issuesCount: issues.length,
  });
  if (issues.some((i) => i.severity === 'error')) {
    console.error(
      '[SPSS 연구통계] 분석 단계 오류 감지:',
      issues.filter((i) => i.severity === 'error')
    );
  }

  return {
    timestamp: Date.now(),
    efa: efaOut.result,
    reliability,
    composites,
    correlation,
    regressions,
    mediation,
    moderation,
    issues,
    columnProfiles,
  };
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeStep, setActiveStep] = useState<StepId>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(() => new Set([0]));
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
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

  // Reactive unified calculation: guarantees ANY change to rows, constructs, hypothesis, or efaConfig
  // immediately clears/recomputes bundle without ever leaving stale sample results behind.
  useEffect(() => {
    if (!rows.length) {
      setBundle(null);
      return;
    }
    const nextBundle = runUnifiedPipeline(
      rows,
      columns,
      constructs,
      hypothesis,
      efaConfig,
      parseWarnings
    );
    setBundle(nextBundle);
  }, [rows, columns, constructs, hypothesis, efaConfig, parseWarnings]);

  const initializeDataset = useCallback(
    (loadedRows: DataRow[], loadedCols: string[], name: string, warnings: string[] = []) => {
      const detected = autoDetectConstructs(loadedCols, loadedRows);
      const hyp = deriveDefaultHypothesis(detected);
      const allItems = Array.from(new Set(detected.flatMap((c) => c.items)));
      const nextEfa: EFAConfig = {
        items: allItems,
        extractionMode: 'kaiser',
        fixedFactors: Math.max(1, detected.length),
        loadingThreshold: 0.5,
        sortBySize: true,
      };

      console.info('[SPSS 연구통계] 데이터셋 로드 및 자동 매핑', {
        fileName: name,
        rowCount: loadedRows.length,
        columnCount: loadedCols.length,
        detectedConstructs: detected,
        defaultHypothesis: hyp,
        warnings,
      });

      setBundle(null);
      setRows(loadedRows);
      setColumns(loadedCols);
      setFileName(name);
      setParseWarnings(warnings);
      setErrorMsg(null);
      setCompletedSteps(new Set([0]));
      setConstructs(detected);
      setHypothesis(hyp);
      setEfaConfig(nextEfa);
    },
    []
  );

  const handleLoadSample = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/assets/aistudio/data_items_2b48a8f0.csv');
      if (!res.ok) throw new Error('샘플 CSV 파일을 불러오지 못했습니다.');
      const text = (await res.text()).replace(/^\uFEFF/, '');
      const parsed = Papa.parse<unknown[]>(text, {
        header: false,
        skipEmptyLines: 'greedy',
      });
      const normalized = normalizeTabularData(parsed.data || []);
      if (!normalized.rows.length || !normalized.columns.length) {
        throw new Error('샘플 데이터에서 유효한 행과 변수명을 찾지 못했습니다.');
      }
      initializeDataset(
        normalized.rows,
        normalized.columns,
        '매개효과test (기본 샘플)',
        normalized.warnings
      );
    } catch (err) {
      console.error('[SPSS 연구통계] 샘플 데이터 로드 실패:', err);
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
      const { rows: parsedRows, columns: parsedCols, fileName: parsedName, warnings } =
        await parseSurveyFile(file);
      if (!parsedRows.length || !parsedCols.length) {
        const msg =
          '업로드한 파일에서 유효한 데이터 행 또는 변수명(첫 행 헤더)을 찾을 수 없습니다. 빈 시트나 제목만 있는 파일인지 확인해 주세요.';
        console.error('[SPSS 연구통계] 파일 파싱 결과 비어 있음:', { fileName: file.name, warnings });
        setErrorMsg(msg);
        return;
      }
      if (parsedRows.length < 3) {
        const msg = `데이터 행이 ${parsedRows.length}행뿐입니다. 통계 분석을 수행하려면 헤더 외 최소 3행 이상의 응답 데이터가 필요합니다.`;
        console.warn('[SPSS 연구통계] 표본 수 부족:', { fileName: file.name, rows: parsedRows.length });
        setErrorMsg(msg);
        return;
      }
      initializeDataset(parsedRows, parsedCols, parsedName, warnings);
    } catch (err) {
      console.error('[SPSS 연구통계] 파일 업로드 파싱 오류:', file.name, err);
      setErrorMsg(
        err instanceof Error
          ? `파일(${file.name})을 읽는 중 오류가 발생했습니다: ${err.message}`
          : '파일을 읽는 중 오류가 발생했습니다.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasteData = (rawText: string) => {
    setErrorMsg(null);
    try {
      const { rows: parsedRows, columns: parsedCols, warnings } = parsePastedSurveyText(rawText);
      if (parsedRows.length < 3 || parsedCols.length < 2) {
        const msg = `붙여넣은 데이터에서 충분한 행(현재 ${parsedRows.length}행, 최소 3행 필요)과 변수 열(현재 ${parsedCols.length}열, 최소 2열 필요)을 찾지 못했습니다. 첫 행에 변수명을 포함해 주세요.`;
        console.warn('[SPSS 연구통계] 붙여넣기 데이터 형식 부족:', {
          rows: parsedRows.length,
          cols: parsedCols.length,
        });
        setErrorMsg(msg);
        return;
      }
      initializeDataset(parsedRows, parsedCols, '직접 붙여넣기 입력 데이터', warnings);
    } catch (err) {
      console.error('[SPSS 연구통계] 붙여넣기 파싱 오류:', err);
      setErrorMsg(
        err instanceof Error
          ? `붙여넣은 데이터를 해석하는 중 오류가 발생했습니다: ${err.message}`
          : '붙여넣은 데이터를 해석하는 중 오류가 발생했습니다.'
      );
    }
  };

  const handleChangeConstructs = useCallback(
    (nextConstructs: ConstructMapping[]) => {
      setConstructs(nextConstructs);
      const nextNames = nextConstructs.filter((c) => c.items.length > 0).map((c) => c.name);
      const nextNameSet = new Set(nextNames);
      const nextItems = Array.from(new Set(nextConstructs.flatMap((c) => c.items)));

      setEfaConfig((prev) => ({
        ...prev,
        items: nextItems,
      }));

      setHypothesis((prev) => {
        const mediator = nextNameSet.has(prev.mediator) ? prev.mediator : '';
        const dependent = nextNameSet.has(prev.dependent) ? prev.dependent : nextNames[0] || '';
        const independents = prev.independents.filter(
          (n) => nextNameSet.has(n) && n !== mediator && n !== dependent
        );
        const modX = prev.moderationX && nextNameSet.has(prev.moderationX) ? prev.moderationX : undefined;
        const modW = prev.moderator && nextNameSet.has(prev.moderator) ? prev.moderator : undefined;
        const modY = prev.moderationY && nextNameSet.has(prev.moderationY) ? prev.moderationY : undefined;

        // If user edited constructs and left independents empty while >= 2 constructs exist, auto-fill sensible independents
        const autoIndeps =
          independents.length > 0
            ? independents
            : nextNames.filter((n) => n !== mediator && n !== dependent);

        return {
          ...prev,
          mediator,
          dependent,
          independents: autoIndeps,
          moderationX: modX,
          moderator: modW,
          moderationY: modY,
        };
      });
    },
    []
  );

  const handleRunAnalysis = () => {
    if (!rows.length) {
      setErrorMsg('분석할 설문 데이터가 없습니다. 먼저 파일을 업로드하거나 데이터를 붙여넣어 주세요.');
      navigateToStep(0);
      return;
    }
    setCompletedSteps(new Set([0]));
    navigateToStep(1, true);
  };

  const handleUpdateEfaConfig = (next: EFAConfig) => {
    setEfaConfig(next);
  };

  const handleUpdateModeration = (x?: string, w?: string, y?: string) => {
    setHypothesis((prev) => ({
      ...prev,
      moderationX: x,
      moderator: w,
      moderationY: y,
    }));
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
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 sticky top-0 z-30 no-print">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-[60px] sm:h-[68px] flex items-center justify-between gap-3 lg:gap-8">
          {/* Zone 1: Single wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              navigateToStep(0);
            }}
            className="inline-flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-900 text-white text-xs font-mono font-bold tracking-tighter shadow-sm">
              S
            </span>
            <span>SPSS 연구통계</span>
          </a>

          {/* Zone 2: 5 concise single-line nav links (lg+ paired cleanly with <lg step bar) */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateToStep(0)}
              className={`hover:text-slate-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer py-2 border-b-2 ${
                activeStep === 0
                  ? 'text-blue-700 font-semibold border-blue-700'
                  : 'border-transparent'
              }`}
            >
              개요·데이터
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(1)}
              className={`hover:text-slate-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer py-2 border-b-2 ${
                activeStep === 1
                  ? 'text-blue-700 font-semibold border-blue-700'
                  : 'border-transparent'
              }`}
            >
              요인분석
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(2)}
              className={`hover:text-slate-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer py-2 border-b-2 ${
                activeStep === 2 || activeStep === 3
                  ? 'text-blue-700 font-semibold border-blue-700'
                  : 'border-transparent'
              }`}
            >
              신뢰도·변수계산
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(4)}
              className={`hover:text-blue-700 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer py-2 border-b-2 ${
                activeStep === 4 || activeStep === 5
                  ? 'text-blue-700 font-semibold border-blue-700'
                  : 'border-transparent'
              }`}
            >
              상관·회귀분석
            </button>
            <button
              type="button"
              onClick={() => navigateToStep(6)}
              className={`hover:text-slate-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer py-2 border-b-2 ${
                activeStep === 6
                  ? 'text-blue-700 font-semibold border-blue-700'
                  : 'border-transparent'
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
                className="px-3 sm:px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-blue-700 rounded-xl shadow-sm hover:bg-blue-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="sm:hidden">순서대로 시작</span>
                <span className="hidden sm:inline">1단계부터 순서대로 시작</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={isLoading}
                className="px-3 sm:px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-slate-900 rounded-xl shadow-sm hover:bg-slate-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                매개효과test 불러오기
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile & Tablet horizontal step switcher */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-3 sm:px-6 py-2 overflow-x-auto no-print">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((step) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => navigateToStep(step.id)}
                className={`px-3 sm:px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                {step.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 min-w-0">
        {/* Desktop Left Sidebar */}
        <aside className="hidden lg:block lg:col-span-3 no-print">
          <div className="sticky top-24 space-y-5">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-600">SPSS 분석 절차</span>
                <span className="text-xs font-mono tabular-nums text-blue-700 font-bold">
                  {progressText}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-all duration-300"
                  style={{ width: `${Math.round((completedSteps.size / STEPS.length) * 100)}%` }}
                />
              </div>
              <nav className="space-y-1 pt-1" aria-label="통계 분석 단계">
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  const active = activeStep === step.id;
                  const done = completedSteps.has(step.id) && bundle !== null;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => navigateToStep(step.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[42px] rounded-xl text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-700 hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-300' : 'text-slate-400'}`} />
                        <span className="truncate">{step.label}</span>
                      </span>
                      {done && !active && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-2 text-xs text-slate-600">
              <div className="font-bold text-slate-900">현재 작업 상태</div>
              <div className="font-mono tabular-nums text-slate-800 font-semibold">{datasetStatusText}</div>
              {fileName && <div className="truncate text-slate-500" title={fileName}>{fileName}</div>}
              {bundle && (
                <div className="pt-2 border-t border-slate-100 text-emerald-700 font-semibold">
                  전체 분석 · 논문 문장 준비됨
                </div>
              )}
            </div>

            <PWAInstallButton />
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="lg:col-span-9 min-w-0">
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
              onChangeConstructs={handleChangeConstructs}
              onChangeHypothesis={setHypothesis}
              onChangeEFAConfig={setEfaConfig}
              onAutoDetect={() => {
                const detected = autoDetectConstructs(columns, rows);
                const hyp = deriveDefaultHypothesis(detected);
                const allItems = Array.from(new Set(detected.flatMap((c) => c.items)));
                setConstructs(detected);
                setHypothesis(hyp);
                setEfaConfig((prev) => ({
                  ...prev,
                  items: allItems,
                  fixedFactors: Math.max(1, detected.length),
                }));
              }}
              onFileUpload={handleFileUpload}
              onPasteData={handlePasteData}
              onLoadSample={handleLoadSample}
              onRunAnalysis={handleRunAnalysis}
              onNext={() => navigateToStep(1, true)}
            />
          )}

          {activeStep === 1 && (
            <StepFactorAnalysis
              efa={bundle?.efa ?? null}
              efaConfig={efaConfig}
              issues={bundle?.issues?.filter((i) => i.step === 'efa' || i.step === 'mapping') ?? []}
              thesisSection={efaRelThesis}
              onUpdateConfig={handleUpdateEfaConfig}
              onPrev={() => navigateToStep(0)}
              onNext={() => navigateToStep(2, true)}
            />
          )}

          {activeStep === 2 && (
            <StepReliability
              rows={bundle?.reliability ?? []}
              issues={bundle?.issues?.filter((i) => i.step === 'reliability' || i.step === 'mapping') ?? []}
              thesisSection={efaRelThesis}
              onPrev={() => navigateToStep(1)}
              onNext={() => navigateToStep(3, true)}
            />
          )}

          {activeStep === 3 && (
            <StepComposites
              composites={bundle?.composites ?? []}
              issues={bundle?.issues?.filter((i) => i.step === 'composites' || i.step === 'mapping') ?? []}
              thesisSection={descCorrThesis}
              onPrev={() => navigateToStep(2)}
              onNext={() => navigateToStep(4, true)}
            />
          )}

          {activeStep === 4 && (
            <StepCorrelation
              correlation={bundle?.correlation ?? { names: [], matrix: [] }}
              composites={bundle?.composites ?? []}
              issues={bundle?.issues?.filter((i) => i.step === 'correlation' || i.step === 'mapping') ?? []}
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
              issues={
                bundle?.issues?.filter(
                  (i) =>
                    i.step === 'regression' ||
                    i.step === 'mediation' ||
                    i.step === 'moderation' ||
                    i.step === 'mapping'
                ) ?? []
              }
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
        <div className="fixed bottom-4 left-4 z-50 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-medium text-white shadow-lg no-print">
          오프라인 모드 · 모든 통계 연산과 논문 문장 작성이 브라우저 내부에서 정상 작동합니다.
        </div>
      )}

      <footer className="border-t border-slate-200/80 bg-white py-5 px-4 text-center text-xs text-slate-500 no-print">
        SPSS 연구통계 · 데이터 입력 → 통계분석 → 결과표 읽기 → 논문 본문 문장 작성 · 모든 데이터는 기기 내에서만 처리됩니다.
      </footer>
    </div>
  );
}
