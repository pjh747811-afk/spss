import React, { useRef, useState } from 'react';
import {
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  GitBranch,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {
  AnalysisBundle,
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
} from '../../types/stats';
import { Step0SubTab } from '../../utils/modelStore';
import { buildDefaultPaths } from '../../utils/researchModel';
import { ResearchModelEditor } from '../ResearchModelEditor';
import { ScrollableTable } from '../ScrollableTable';
import { StepFooterNav } from '../StepFooterNav';
import { StepIssuesAlert } from '../StepIssuesAlert';
import { StepMapping } from './StepMapping';

interface StepUploadProps {
  fileName: string;
  rows: DataRow[];
  columns: string[];
  isLoading: boolean;
  errorMsg: string | null;
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  efaConfig: EFAConfig;
  bundle: AnalysisBundle | null;
  activeSubTab: Step0SubTab;
  highlightVariables?: boolean;
  onChangeSubTab: (tab: Step0SubTab) => void;
  onChangeConstructs: (next: ConstructMapping[]) => void;
  onChangeHypothesis: (next: HypothesisConfig) => void;
  onSaveResearchModel: (
    nextConstructs: ConstructMapping[],
    nextHypothesis: HypothesisConfig,
    options?: { showToast?: boolean; nextTab?: 'overview' | 'mapping' }
  ) => void;
  onChangeEFAConfig: (next: EFAConfig) => void;
  onAutoDetect: () => void;
  onFileUpload: (file: File) => void;
  onPasteData: (rawText: string) => void;
  onLoadSample: () => void;
  onRunAnalysis: () => void;
  onNext: () => void;
}

export const StepUpload: React.FC<StepUploadProps> = ({
  fileName,
  rows,
  columns,
  isLoading,
  errorMsg,
  constructs,
  hypothesis,
  efaConfig,
  bundle,
  activeSubTab,
  highlightVariables = false,
  onChangeSubTab,
  onChangeConstructs,
  onChangeHypothesis,
  onSaveResearchModel,
  onChangeEFAConfig,
  onAutoDetect,
  onFileUpload,
  onPasteData,
  onLoadSample,
  onRunAnalysis,
  onNext,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchCol, setSearchCol] = useState('');
  const [page, setPage] = useState(0);
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const filteredCols = searchCol.trim()
    ? columns.filter((c) => c.toLowerCase().includes(searchCol.trim().toLowerCase()))
    : columns;
  const showCols = filteredCols.slice(0, 12);

  const activeConstructs = constructs.filter((c) => c.items.length > 0);
  const factorCount = bundle?.efa?.numFactors ?? 0;
  const compositeCount = bundle?.composites.length ?? activeConstructs.length;
  const regressionCount = bundle?.regressions.length ?? 0;

  const hasModel = hypothesis.independents.length > 0 && Boolean(hypothesis.dependent);
  const isMediationModel = Boolean(hypothesis.mediator);
  const indepText = hypothesis.independents.length
    ? hypothesis.independents.join(', ')
    : '미지정 (변수 매핑에서 선택)';
  const medText = hypothesis.mediator || '선택 안 함 (직접회귀 모형)';
  const depText = hypothesis.dependent || '미지정';

  const resolvedPaths =
    hypothesis.paths && hypothesis.paths.length > 0
      ? hypothesis.paths
      : buildDefaultPaths(hypothesis, constructs);

  const hypothesisRows = resolvedPaths.map((p, idx) => ({
    id: p.id,
    color:
      idx % 3 === 0
        ? 'text-blue-700'
        : idx % 3 === 1
          ? 'text-emerald-700'
          : 'text-violet-700',
    dep: p.to || '미지정',
    indep: p.role === 'moderation' && p.moderator ? `${p.from} × ${p.moderator}` : p.from || '미지정',
    roleLabel:
      p.role === 'mediation_a'
        ? '매개 경로 (a)'
        : p.role === 'mediation_b'
          ? '매개 경로 (b)'
          : p.role === 'moderation'
            ? '조절 경로'
            : '직접 경로',
  }));

  const colProfiles = bundle?.columnProfiles ?? [];
  const profileCounts = {
    numeric: colProfiles.filter((c) => c.kind === 'numeric').length,
    categorical: colProfiles.filter((c) => c.kind === 'categorical').length,
    text: colProfiles.filter((c) => c.kind === 'text').length,
    other: colProfiles.filter((c) => c.kind === 'constant' || c.kind === 'empty').length,
  };
  const uploadOrBlockingIssues = (bundle?.issues ?? []).filter(
    (i) => i.step === 'upload' || i.step === 'mapping' || i.severity === 'error'
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileUpload(file);
  };

  return (
    <div className="space-y-6">
      {/* Step 0 Header + Sub-tab Switcher */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4 sm:pb-5 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">0. 개요 &amp; 데이터 입력</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              연구 흐름: 데이터 입력 → 연구모형 · 변수 매핑 → 요인분석 → 신뢰도 → 변수계산 → 상관분석 → 회귀·매개검증 → 논문 작성
            </p>
          </div>
          <div className="w-full xl:w-auto shrink-0 overflow-x-auto">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs min-w-full sm:min-w-0">
              <button
                type="button"
                onClick={() => onChangeSubTab('overview')}
                className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 min-h-[40px] rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                  activeSubTab === 'overview'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                개요 · 데이터 입력
              </button>
              <button
                type="button"
                onClick={() => onChangeSubTab('model')}
                className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 min-h-[40px] rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                  activeSubTab === 'model'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                연구모형 데이터 입력
              </button>
              <button
                type="button"
                onClick={() => onChangeSubTab('mapping')}
                className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 min-h-[40px] rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                  activeSubTab === 'mapping'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                변수 매핑 · 모형 설정
              </button>
            </div>
          </div>
        </div>

        {activeSubTab === 'overview' && (
          <div className="mt-4 sm:mt-5 space-y-5 sm:space-y-6">
            {/* 3 KPI Stat Blocks */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 min-w-0">
                <div className="text-xs font-medium text-slate-600">추출 요인 (타당성)</div>
                <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                  {factorCount}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 min-w-0">
                <div className="text-xs font-medium text-slate-600">생성 합변수</div>
                <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {compositeCount}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-center justify-between sm:block min-w-0">
                <div className="text-xs font-medium text-slate-600">회귀 가설</div>
                <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 sm:mt-1">
                  {regressionCount}
                </div>
              </div>
            </div>

            {/* Research Model & Hypotheses */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
              <div className="lg:col-span-5 min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {hypothesis.modelName ? `연구모형 · ${hypothesis.modelName}` : '연구모형'}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChangeSubTab('model')}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>연구모형 데이터 입력</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeSubTab('mapping')}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>변수 매핑</span>
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 sm:p-5 text-xs sm:text-sm space-y-2.5">
                  <p className="font-bold text-slate-900 leading-relaxed">
                    {!rows.length && constructs.length === 0
                      ? '설문 데이터를 불러오거나 [연구모형 데이터 입력]을 눌러 연구모형을 설정하세요.'
                      : hasModel
                        ? isMediationModel
                          ? `${hypothesis.independents.join(' · ')} → ${hypothesis.mediator} (매개) → ${hypothesis.dependent}`
                          : `${hypothesis.independents.join(' · ')} → ${hypothesis.dependent} (직접회귀 모형)`
                        : '변수 매핑 · 모형 설정에서 독립(X)과 종속(Y)을 지정해 주세요.'}
                  </p>
                  <ul className="space-y-1.5 text-slate-700 leading-relaxed">
                    <li>· 등록 구성개념: {constructs.length}개 ({constructs.map((c) => c.name).join(', ') || '없음'})</li>
                    <li>· 독립변수(X): {indepText}</li>
                    <li>· 매개변수(M): {medText}</li>
                    {hypothesis.moderator && <li>· 조절변수(W): {hypothesis.moderator}</li>}
                    <li>· 종속변수(Y): {depText}</li>
                  </ul>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ※ 연구모형 데이터 입력과 변수 매핑에서 설정한 내용은 모든 분석 단계에 자동 연동되며 새로고침 후에도 유지됩니다.
                </p>
              </div>

              <div className="lg:col-span-7 min-w-0">
                <h3 className="text-base font-bold text-slate-900 mb-3">
                  {isMediationModel ? '연구가설 (H1~H3 · 매개모형)' : '연구가설 및 경로'}
                </h3>

                {hypothesisRows.length === 0 ? (
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 text-xs sm:text-sm text-slate-600 space-y-2">
                    <p>
                      상단 [연구모형 데이터 입력] 또는 [변수 매핑 · 모형 설정] 탭에서 구성개념과 독립변수(X)·종속변수(Y)를 지정하면 가설 경로가 표시됩니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => onChangeSubTab('model')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 cursor-pointer"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>연구모형 데이터 입력 열기</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Mobile card layout for hypotheses */}
                    <div className="sm:hidden space-y-2.5">
                      {hypothesisRows.map((item) => (
                        <div
                          key={`${item.id}-${item.indep}-${item.dep}`}
                          className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3.5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-mono text-xs font-bold ${item.color}`}>{item.id}</span>
                            <span className="text-xs font-semibold text-slate-900">
                              종속: {item.dep}
                            </span>
                          </div>
                          <div className="text-xs text-slate-700 leading-relaxed">
                            <span className="text-slate-500 font-medium">독립: </span>
                            {item.indep} → {item.dep}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tablet/Desktop table layout */}
                    <div className="hidden sm:block">
                      <ScrollableTable>
                        <table className="w-full min-w-[480px] text-xs">
                          <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                            <tr>
                              <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap w-16">가설</th>
                              <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap min-w-[140px]">독립(원인)</th>
                              <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap min-w-[120px]">종속(결과)</th>
                              <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">경로 구분</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {hypothesisRows.map((item) => (
                              <tr key={`${item.id}-${item.indep}-${item.dep}`} className="hover:bg-slate-50/60">
                                <td className={`px-3.5 py-3 font-mono font-bold whitespace-nowrap ${item.color}`}>
                                  {item.id}
                                </td>
                                <td className="px-3.5 py-3 text-slate-700">{item.indep}</td>
                                <td className="px-3.5 py-3 font-semibold text-slate-900 whitespace-nowrap">
                                  {item.dep}
                                </td>
                                <td className="px-3.5 py-3 text-slate-500 whitespace-nowrap">
                                  {item.roleLabel}
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
            </div>
          </div>
        )}
      </div>

      {activeSubTab === 'model' && (
        <ResearchModelEditor
          columns={columns}
          columnProfiles={bundle?.columnProfiles}
          constructs={constructs}
          hypothesis={hypothesis}
          onSaveModel={onSaveResearchModel}
          onGoToMapping={() => onChangeSubTab('mapping')}
        />
      )}

      {activeSubTab === 'mapping' && (
        <StepMapping
          columns={columns}
          columnProfiles={bundle?.columnProfiles}
          constructs={constructs}
          hypothesis={hypothesis}
          efaConfig={efaConfig}
          highlightVariables={highlightVariables}
          onChangeConstructs={onChangeConstructs}
          onChangeHypothesis={onChangeHypothesis}
          onChangeEFAConfig={onChangeEFAConfig}
          onAutoDetect={onAutoDetect}
          onOpenModelEditor={() => onChangeSubTab('model')}
          onRunAnalysis={onRunAnalysis}
        />
      )}

      {activeSubTab === 'overview' && (
        <>
          {/* Data Input Card: File Upload or Direct Paste */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">설문 데이터 입력</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  파일을 업로드하거나 엑셀·구글시트 표를 복사해 바로 붙여넣을 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs">
                  <button
                    type="button"
                    onClick={() => setInputMode('file')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      inputMode === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    파일 업로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      inputMode === 'paste' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    표 직접 붙여넣기
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onLoadSample}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>매개효과test 샘플</span>
                </button>
                <a
                  href="/assets/aistudio/data_items_2b48a8f0.csv"
                  download="매개효과test_샘플.csv"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>원본 CSV</span>
                </a>
              </div>
            </div>

            {inputMode === 'file' ? (
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                }}
                className={`mt-5 border-2 border-dashed rounded-xl p-7 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2.5" />
                <p className="text-sm font-semibold text-slate-800">
                  설문 데이터 파일 (CSV · Excel .xlsx · JSON)을 끌어놓거나 클릭하여 업로드
                </p>
                <p className="text-xs text-slate-600 mt-1.5">
                  첫 행은 변수명이어야 합니다 · SPSS CSV (UTF-8 / EUC-KR 자동 인식) · 기기 내 로컬 연산
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileUpload(f);
                    e.target.value = '';
                  }}
                />
              </div>
            ) : (
              <div className="mt-5 space-y-3.5">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={6}
                  placeholder={`엑셀이나 구글 시트에서 첫 행(변수명)을 포함하여 복사(Ctrl+C)한 뒤 여기에 붙여넣으세요.\n예:\n카리스마1\t카리스마2\t배려1\t배려2\t혁신1\t혁신2\n5\t4\t5\t5\t4\t4`}
                  className="w-full border border-slate-300 rounded-xl p-3.5 text-xs sm:text-sm font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span className="text-xs text-slate-600">
                    탭(TSV) 또는 쉼표(CSV) 구분 데이터를 자동으로 인식합니다.
                  </span>
                  <button
                    type="button"
                    onClick={() => onPasteData(pastedText)}
                    disabled={!pastedText.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 min-h-[42px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40"
                  >
                    <ClipboardPaste className="w-4 h-4 shrink-0" />
                    <span>붙여넣은 데이터 적용</span>
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            {uploadOrBlockingIssues.length > 0 && (
              <div className="mt-4">
                <StepIssuesAlert issues={uploadOrBlockingIssues} title="데이터 점검 및 안내" />
              </div>
            )}
          </div>

          {/* Data Preview Table */}
          {rows.length > 0 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="text-sm sm:text-base text-slate-700 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-bold text-slate-900">데이터 미리보기 ({fileName})</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono tabular-nums text-xs sm:text-sm">총 {rows.length}케이스</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono tabular-nums text-xs sm:text-sm">변수 {columns.length}개</span>
                  {colProfiles.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="text-xs text-slate-600 font-mono tabular-nums">
                        수치형 {profileCounts.numeric}
                        {profileCounts.categorical > 0 ? ` · 범주형 ${profileCounts.categorical}` : ''}
                        {profileCounts.text > 0 ? ` · 텍스트 ${profileCounts.text}` : ''}
                        {profileCounts.other > 0 ? ` · 상수/빈열 ${profileCounts.other}` : ''}
                      </span>
                    </>
                  )}
                </div>

                <div className="relative w-full md:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchCol}
                    onChange={(e) => setSearchCol(e.target.value)}
                    placeholder="변수명 필터..."
                    className="w-full pl-9 pr-3.5 py-2 min-h-[40px] text-xs border border-slate-300 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              </div>

              <ScrollableTable className="mt-4" hintText="좌우로 스크롤하여 전체 변수 열 확인">
                <table className="w-full min-w-[540px] text-xs">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-semibold w-12 whitespace-nowrap">#</th>
                      {showCols.map((col) => (
                        <th key={col} className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5 text-slate-400 font-mono tabular-nums whitespace-nowrap">
                          {safePage * pageSize + idx + 1}
                        </td>
                        {showCols.map((col) => {
                          const val = row[col];
                          return (
                            <td
                              key={col}
                              className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap"
                            >
                              {typeof val === 'number'
                                ? Number.isInteger(val)
                                  ? val
                                  : val.toFixed(2)
                                : val ?? '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
                <span>
                  표시 변수 {showCols.length} / {filteredCols.length}개 (최대 12열 미리보기)
                </span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="px-3 py-1.5 min-h-[36px] border border-slate-300 rounded-lg bg-white hover:bg-slate-50 font-medium disabled:opacity-40 cursor-pointer"
                  >
                    이전
                  </button>
                  <span className="px-1 font-semibold text-slate-700">
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="px-3 py-1.5 min-h-[36px] border border-slate-300 rounded-lg bg-white hover:bg-slate-50 font-medium disabled:opacity-40 cursor-pointer"
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {rows.length > 0 && (
        <StepFooterNav nextLabel="1. 요인분석 (타당성) 진행" onNext={onNext} />
      )}
    </div>
  );
};
