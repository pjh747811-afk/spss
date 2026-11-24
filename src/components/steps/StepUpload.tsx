import React, { useRef, useState } from 'react';
import { ClipboardPaste, Download, FileSpreadsheet, Search, Upload } from 'lucide-react';
import {
  AnalysisBundle,
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
} from '../../types/stats';
import { StepFooterNav } from '../StepFooterNav';
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
  onChangeConstructs: (next: ConstructMapping[]) => void;
  onChangeHypothesis: (next: HypothesisConfig) => void;
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
  onChangeConstructs,
  onChangeHypothesis,
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
  const [activeTab, setActiveTab] = useState<'overview' | 'mapping'>('overview');
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
  const factorCount = bundle?.efa?.numFactors ?? activeConstructs.length;
  const compositeCount = bundle?.composites.length ?? activeConstructs.length;
  const regressionCount = bundle?.regressions.length ?? 3;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileUpload(file);
  };

  return (
    <div className="space-y-6">
      {/* Step 0 Header + Sub-tab Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">0. 개요 &amp; 데이터 입력</h2>
            <p className="text-xs text-slate-600 mt-1">
              연구 흐름: 데이터 입력 → 요인분석 → 신뢰도 → 변수계산 → 상관분석 → 회귀·매개검증 → 결과표 읽기 · 논문 문장 작성
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                연구모형 · 데이터 입력
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mapping')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'mapping'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                변수 매핑 · 모형 설정
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="mt-5 space-y-6">
            {/* 3 KPI Numbers */}
            <div className="grid grid-cols-3 gap-4 border-b border-slate-200 pb-5">
              <div>
                <div className="text-xs text-slate-500">추출 요인 (타당성)</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-0.5">
                  {factorCount || 6}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">생성 합변수</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                  {compositeCount || 6}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">회귀 가설</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {regressionCount}
                </div>
              </div>
            </div>

            {/* Research Model & Hypotheses */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">연구모형</h3>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-2">
                  <p className="font-semibold text-slate-900">
                    {hypothesis.independents.length
                      ? `${hypothesis.independents.join(' · ')} → ${hypothesis.mediator || '매개변수'} (매개) → ${hypothesis.dependent || '종속변수'}`
                      : '변혁적 리더십 (하위 4차원) → 심리적 자본 (매개) → 혁신행동'}
                  </p>
                  <ul className="space-y-1 text-slate-600">
                    <li>
                      · 독립변수(X): {hypothesis.independents.join(', ') || '카리스마, 개별배려, 지적 자극, 동기부여'}
                    </li>
                    <li>· 매개변수(M): {hypothesis.mediator || '심리적 자본'}</li>
                    <li>· 종속변수(Y): {hypothesis.dependent || '혁신행동'}</li>
                  </ul>
                </div>
                <p className="text-xs text-slate-500">
                  ※ 각 단계별로 결과표 해석 가이드와 논문에 바로 붙여넣을 수 있는 학술 문장이 자동 생성됩니다.
                </p>
              </div>

              <div className="lg:col-span-7">
                <h3 className="text-sm font-bold text-slate-900 mb-3">연구가설 (H1~H3 · 매개모형)</h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold w-16">가설</th>
                        <th className="px-3 py-2.5 text-left font-semibold w-28">종속변수</th>
                        <th className="px-3 py-2.5 text-left font-semibold">독립변수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-700">H1</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {hypothesis.mediator || '심리적 자본'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {hypothesis.independents.join(', ') || '카리스마, 개별배려, 지적자극, 동기부여'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">H2</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {hypothesis.dependent || '혁신행동'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {hypothesis.mediator || '심리적 자본'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 font-mono font-bold text-violet-700">H3</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {hypothesis.dependent || '혁신행동'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {hypothesis.independents.join(', ') || '카리스마, 개별배려, 지적자극, 동기부여'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'mapping' ? (
        <StepMapping
          columns={columns}
          constructs={constructs}
          hypothesis={hypothesis}
          efaConfig={efaConfig}
          onChangeConstructs={onChangeConstructs}
          onChangeHypothesis={onChangeHypothesis}
          onChangeEFAConfig={onChangeEFAConfig}
          onAutoDetect={onAutoDetect}
          onRunAnalysis={onRunAnalysis}
        />
      ) : (
        <>
          {/* Data Input Card: File Upload or Direct Paste */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">설문 데이터 입력</h3>
                <p className="text-xs text-slate-500 mt-1">
                  파일을 업로드하거나 엑셀·구글시트 표를 복사해 바로 붙여넣을 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setInputMode('file')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      inputMode === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    파일 업로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      inputMode === 'paste' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    표 직접 붙여넣기
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onLoadSample}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                  <span>매개효과test 샘플</span>
                </button>
                <a
                  href="/assets/aistudio/data_items_2b48a8f0.csv"
                  download="매개효과test_샘플.csv"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
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
                className={`mt-4 border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-800">
                  설문 데이터 파일 (CSV · Excel .xlsx · JSON)을 끌어놓거나 클릭하여 업로드
                </p>
                <p className="text-xs text-slate-500 mt-1">
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
              <div className="mt-4 space-y-3">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={6}
                  placeholder={`엑셀이나 구글 시트에서 첫 행(변수명)을 포함하여 복사(Ctrl+C)한 뒤 여기에 붙여넣으세요.\n예:\n카리스마1\t카리스마2\t배려1\t배려2\t혁신1\t혁신2\n5\t4\t5\t5\t4\t4`}
                  className="w-full border border-slate-300 rounded-lg p-3 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    탭(TSV) 또는 쉼표(CSV) 구분 데이터를 자동으로 인식합니다.
                  </span>
                  <button
                    type="button"
                    onClick={() => onPasteData(pastedText)}
                    disabled={!pastedText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
                    <span>붙여넣은 데이터 적용</span>
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Data Preview Table */}
          {rows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="text-sm text-slate-700 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-slate-900">데이터 미리보기 ({fileName})</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono tabular-nums text-xs">총 {rows.length}케이스</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono tabular-nums text-xs">변수 {columns.length}개</span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchCol}
                    onChange={(e) => setSearchCol(e.target.value)}
                    placeholder="변수명 필터..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium w-12">#</th>
                      {showCols.map((col) => (
                        <th key={col} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-2 text-slate-400 font-mono tabular-nums">
                          {safePage * pageSize + idx + 1}
                        </td>
                        {showCols.map((col) => {
                          const val = row[col];
                          return (
                            <td
                              key={col}
                              className="px-3 py-2 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap"
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
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
                <span>
                  표시 변수 {showCols.length} / {filteredCols.length}개 (최대 12열 미리보기)
                </span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    이전
                  </button>
                  <span>
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
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
