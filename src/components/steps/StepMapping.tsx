import React, { useEffect, useMemo, useRef } from 'react';
import { GitBranch, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  ColumnKind,
  ColumnProfile,
  ConstructMapping,
  EFAConfig,
  HypothesisConfig,
} from '../../types/stats';
import {
  buildDefaultPaths,
  validateResearchModel,
} from '../../utils/researchModel';
import { StepIssuesAlert } from '../StepIssuesAlert';

interface StepMappingProps {
  columns: string[];
  columnProfiles?: ColumnProfile[];
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  efaConfig: EFAConfig;
  highlightVariables?: boolean;
  onChangeConstructs: (next: ConstructMapping[]) => void;
  onChangeHypothesis: (next: HypothesisConfig) => void;
  onChangeEFAConfig: (next: EFAConfig) => void;
  onAutoDetect: () => void;
  onOpenModelEditor?: () => void;
  onRunAnalysis: () => void;
}

const KIND_LABELS: Record<ColumnKind, { label: string; cls: string }> = {
  numeric: { label: '수치', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  categorical: { label: '범주', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  text: { label: '문자', cls: 'text-slate-600 bg-slate-100 border-slate-200' },
  constant: { label: '상수', cls: 'text-slate-500 bg-slate-100 border-slate-200' },
  empty: { label: '빈열', cls: 'text-red-600 bg-red-50 border-red-200' },
};

export const StepMapping: React.FC<StepMappingProps> = ({
  columns,
  columnProfiles = [],
  constructs,
  hypothesis,
  efaConfig,
  highlightVariables = false,
  onChangeConstructs,
  onChangeHypothesis,
  onChangeEFAConfig,
  onAutoDetect,
  onOpenModelEditor,
  onRunAnalysis,
}) => {
  const varSectionRef = useRef<HTMLDivElement>(null);
  const profileMap = new Map(columnProfiles.map((p) => [p.name, p]));
  const itemColumns = columns.filter((c) => profileMap.get(c)?.kind !== 'empty');

  useEffect(() => {
    if (highlightVariables && varSectionRef.current) {
      varSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightVariables]);

  const toggleItemInConstruct = (constructId: string, item: string) => {
    onChangeConstructs(
      constructs.map((c) => {
        if (c.id !== constructId) return c;
        const exists = c.items.includes(item);
        return {
          ...c,
          items: exists ? c.items.filter((i) => i !== item) : [...c.items, item],
        };
      })
    );
  };

  const updateConstructName = (constructId: string, name: string) => {
    onChangeConstructs(constructs.map((c) => (c.id === constructId ? { ...c, name } : c)));
  };

  const addConstruct = () => {
    const nextIdx = constructs.length + 1;
    onChangeConstructs([
      ...constructs,
      { id: `c-${Date.now()}-${nextIdx}`, name: `구성개념 ${nextIdx}`, items: [] },
    ]);
  };

  const removeConstruct = (constructId: string) => {
    onChangeConstructs(constructs.filter((c) => c.id !== constructId));
  };

  const updateRolesAndPaths = (nextHyp: HypothesisConfig) => {
    onChangeHypothesis({
      ...nextHyp,
      paths: buildDefaultPaths(nextHyp, constructs),
    });
  };

  const toggleIndep = (name: string) => {
    const exists = hypothesis.independents.includes(name);
    const nextIndeps = exists
      ? hypothesis.independents.filter((n) => n !== name)
      : [...hypothesis.independents, name];

    updateRolesAndPaths({
      ...hypothesis,
      independents: nextIndeps,
      dependent: !exists && hypothesis.dependent === name ? '' : hypothesis.dependent,
      mediator: !exists && hypothesis.mediator === name ? '' : hypothesis.mediator,
    });
  };

  const addIndepFromCombo = (name: string) => {
    if (!name) return;
    if (!hypothesis.independents.includes(name)) {
      updateRolesAndPaths({
        ...hypothesis,
        independents: [...hypothesis.independents, name],
        dependent: hypothesis.dependent === name ? '' : hypothesis.dependent,
        mediator: hypothesis.mediator === name ? '' : hypothesis.mediator,
      });
    }
  };

  const toggleControl = (colName: string) => {
    const exists = hypothesis.controls.includes(colName);
    onChangeHypothesis({
      ...hypothesis,
      controls: exists
        ? hypothesis.controls.filter((n) => n !== colName)
        : [...hypothesis.controls, colName],
    });
  };

  // Show ALL registered constructs (never hide constructs just because items haven't been assigned yet)
  const allConstructs = constructs.filter((c) => c.name.trim().length > 0);
  const allConstructNames = allConstructs.map((c) => c.name);
  const itemCountByName = new Map(allConstructs.map((c) => [c.name, c.items.length]));

  const assignedItems = new Set(constructs.flatMap((c) => c.items));
  const controlCandidates = columns.filter((col) => {
    if (assignedItems.has(col)) return false;
    const kind = profileMap.get(col)?.kind;
    return kind !== 'empty' && kind !== 'text' && kind !== 'constant';
  });

  const resolvedPaths = useMemo(
    () =>
      hypothesis.paths && hypothesis.paths.length > 0
        ? hypothesis.paths
        : buildDefaultPaths(hypothesis, constructs),
    [hypothesis, constructs]
  );

  const modelValidation = useMemo(
    () => validateResearchModel(constructs, hypothesis, columns.length ? columns : undefined),
    [constructs, hypothesis, columns]
  );

  if (!columns.length && constructs.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-slate-700">
          데이터를 업로드하거나 [연구모형 데이터 입력]에서 구성개념을 먼저 등록하세요.
        </p>
      </div>
    );
  }

  const missingIndep = hypothesis.independents.length === 0;
  const missingDep = !hypothesis.dependent;

  return (
    <div className="space-y-6">
      {/* 1. Constructs & Item Mapping */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">구성개념 및 문항 매핑</h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              연구모형에서 등록한 모든 구성개념과 데이터 문항을 연결합니다. 변경사항은 자동으로 저장·반영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenModelEditor && (
              <button
                type="button"
                onClick={onOpenModelEditor}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <GitBranch className="w-4 h-4 shrink-0" />
                <span>연구모형 데이터 입력</span>
              </button>
            )}
            {columns.length > 0 && (
              <button
                type="button"
                onClick={onAutoDetect}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>문항 자동 매핑</span>
              </button>
            )}
            <button
              type="button"
              onClick={addConstruct}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>구성개념 추가</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200 mt-2">
          {constructs.map((c, idx) => (
            <div key={c.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
                  <span className="text-xs font-mono text-slate-400 w-6 shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateConstructName(c.id, e.target.value)}
                    className="border border-slate-300 rounded-xl px-3 py-1.5 min-h-[40px] w-full sm:w-56 min-w-0 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <span
                    className={`text-xs font-mono tabular-nums font-medium whitespace-nowrap ${
                      c.items.length === 0 ? 'text-amber-700' : 'text-slate-500'
                    }`}
                  >
                    선택 문항 {c.items.length}개
                  </span>
                </div>
                {constructs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeConstruct(c.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>삭제</span>
                  </button>
                )}
              </div>

              {itemColumns.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-2 pl-0 sm:pl-8">
                  {itemColumns.map((col) => {
                    const checked = c.items.includes(col);
                    const prof = profileMap.get(col);
                    const kindMeta = prof ? KIND_LABELS[prof.kind] : null;
                    return (
                      <label
                        key={col}
                        className={`inline-flex items-center gap-1.5 text-xs cursor-pointer select-none py-1 px-2 rounded-lg transition-colors ${
                          checked
                            ? 'text-blue-800 font-semibold bg-blue-50/70'
                            : prof && prof.kind !== 'numeric'
                              ? 'text-slate-400 hover:bg-slate-50'
                              : 'text-slate-700 hover:bg-slate-50'
                        }`}
                        title={
                          prof
                            ? `${col} · 유효값 ${prof.validCount}건, 결측 ${prof.missingCount}건`
                            : col
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItemInConstruct(c.id, col)}
                          className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                        />
                        <span>{col}</span>
                        {kindMeta && prof?.kind !== 'numeric' && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${kindMeta.cls}`}
                          >
                            {kindMeta.label}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 pl-0 sm:pl-8">
                  {c.items.length > 0
                    ? `등록된 문항: ${c.items.join(', ')} (데이터 파일 업로드 시 자동 매칭됨)`
                    : '데이터 파일을 업로드하거나 [연구모형 데이터 입력]에서 측정문항을 연결할 수 있습니다.'}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Research Model & Variable Selection (Highlight target for Step 5 / Toast jumps) */}
      <div
        id="step0-variable-mapping"
        ref={varSectionRef}
        className={`bg-white rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] transition-all ${
          highlightVariables
            ? 'border-2 border-blue-600 ring-4 ring-blue-600/15'
            : 'border border-slate-200/90'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3.5 border-b border-slate-200">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              연구모형(가설 H1~H3 · 독립 X · 매개 M · 종속 Y · 통제 · 조절) 및 요인분석 옵션
            </h3>
            {hypothesis.modelName && (
              <p className="text-xs text-blue-700 font-semibold mt-1">
                모형명: {hypothesis.modelName}
              </p>
            )}
          </div>
          <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
            등록 구성개념 {allConstructNames.length}개
          </span>
        </div>

        {modelValidation.issues.length > 0 && (
          <div className="mt-4">
            <StepIssuesAlert issues={modelValidation.issues} title="변수 매핑 · 가설 경로 확인" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 mt-5">
          {/* Column 1: Independent (X) Combobox + Multi-Select + Controls */}
          <div className="min-w-0 space-y-4">
            <div>
              <label htmlFor="sel-independent" className="block text-xs font-bold text-slate-700 mb-2">
                독립변수 (X · 1개 이상 / 다중 선택)
              </label>

              {/* Enabled Independent Variable Combobox */}
              <select
                id="sel-independent"
                value={hypothesis.independents[0] ?? ''}
                disabled={allConstructNames.length === 0}
                onChange={(e) => {
                  const picked = e.target.value;
                  if (!picked) {
                    updateRolesAndPaths({ ...hypothesis, independents: [] });
                    return;
                  }
                  if (hypothesis.independents.length <= 1) {
                    updateRolesAndPaths({
                      ...hypothesis,
                      independents: [picked],
                      dependent: hypothesis.dependent === picked ? '' : hypothesis.dependent,
                      mediator: hypothesis.mediator === picked ? '' : hypothesis.mediator,
                    });
                  } else {
                    addIndepFromCombo(picked);
                  }
                }}
                className={`w-full border rounded-xl px-3.5 py-2 min-h-[42px] text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 mb-2.5 ${
                  missingIndep ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300'
                }`}
              >
                <option value="">독립변수(X) 선택하세요</option>
                {allConstructNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {(itemCountByName.get(n) ?? 0) === 0 ? ' (문항 미연결)' : ''}
                  </option>
                ))}
              </select>

              {/* Multi-select Checkboxes (never disabled when constructs exist) */}
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/60 max-h-48 overflow-y-auto">
                {allConstructNames.map((name) => {
                  const isDep = name === hypothesis.dependent;
                  const isMed = name === hypothesis.mediator;
                  const checked = hypothesis.independents.includes(name);
                  const itemsLen = itemCountByName.get(name) ?? 0;
                  return (
                    <label
                      key={name}
                      className="flex items-center justify-between gap-2 text-xs cursor-pointer py-0.5 text-slate-800 font-medium"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIndep(name)}
                          className="w-4 h-4 accent-blue-700 cursor-pointer shrink-0"
                        />
                        <span className="truncate">{name}</span>
                      </span>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {isDep
                          ? '현재 Y'
                          : isMed
                            ? '현재 M'
                            : itemsLen === 0
                              ? '문항 0개'
                              : `${itemsLen}문항`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                통제변수 (선택 · 인구통계 등 회귀식 통제)
              </label>
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/60 max-h-36 overflow-y-auto">
                {controlCandidates.length > 0 ? (
                  controlCandidates.map((col) => {
                    const checked = hypothesis.controls.includes(col);
                    return (
                      <label
                        key={col}
                        className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleControl(col)}
                          className="w-4 h-4 accent-blue-700"
                        />
                        <span>{col}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500">
                    현재 데이터에는 미매핑 인구통계/통제 열이 없습니다.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Mediator (M), Dependent (Y) Combobox, Moderation */}
          <div className="min-w-0">
            <label htmlFor="sel-mediator" className="block text-xs font-bold text-slate-700 mb-2">
              매개변수 (M · H1 종속 / H2 독립)
            </label>
            <select
              id="sel-mediator"
              value={hypothesis.mediator}
              disabled={allConstructNames.length === 0}
              onChange={(e) => {
                const nextMed = e.target.value;
                updateRolesAndPaths({
                  ...hypothesis,
                  mediator: nextMed,
                  independents: hypothesis.independents.filter((n) => n !== nextMed),
                  dependent: hypothesis.dependent === nextMed ? '' : hypothesis.dependent,
                });
              }}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2 min-h-[42px] text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="">선택 안 함 (직접회귀 모형)</option>
              {allConstructNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {(itemCountByName.get(n) ?? 0) === 0 ? ' (문항 미연결)' : ''}
                </option>
              ))}
            </select>

            <div className="mt-4">
              <label htmlFor="sel-dependent" className="block text-xs font-bold text-slate-700 mb-2">
                최종 종속변수 (Y · H2, H3 종속)
              </label>
              <select
                id="sel-dependent"
                value={hypothesis.dependent}
                disabled={allConstructNames.length === 0}
                onChange={(e) => {
                  const nextDep = e.target.value;
                  updateRolesAndPaths({
                    ...hypothesis,
                    dependent: nextDep,
                    mediator: hypothesis.mediator === nextDep ? '' : hypothesis.mediator,
                    independents: hypothesis.independents.filter((n) => n !== nextDep),
                  });
                }}
                className={`w-full border rounded-xl px-3.5 py-2 min-h-[42px] text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 ${
                  missingDep ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300'
                }`}
              >
                <option value="">선택하세요</option>
                {allConstructNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {(itemCountByName.get(n) ?? 0) === 0 ? ' (문항 미연결)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                조절효과 검증 (선택 · 5단계에서 변경 가능)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  aria-label="조절모형 독립변수 X"
                  value={hypothesis.moderationX ?? ''}
                  onChange={(e) =>
                    onChangeHypothesis({ ...hypothesis, moderationX: e.target.value || undefined })
                  }
                  className="border border-slate-300 rounded-xl px-2.5 py-2 min-h-[40px] text-xs bg-white text-slate-800"
                >
                  <option value="">독립(X)</option>
                  {allConstructNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="조절모형 조절변수 W"
                  value={hypothesis.moderator ?? ''}
                  onChange={(e) =>
                    onChangeHypothesis({ ...hypothesis, moderator: e.target.value || undefined })
                  }
                  className="border border-slate-300 rounded-xl px-2.5 py-2 min-h-[40px] text-xs bg-white text-slate-800"
                >
                  <option value="">조절(W)</option>
                  {allConstructNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="조절모형 종속변수 Y"
                  value={hypothesis.moderationY ?? ''}
                  onChange={(e) =>
                    onChangeHypothesis({ ...hypothesis, moderationY: e.target.value || undefined })
                  }
                  className="border border-slate-300 rounded-xl px-2.5 py-2 min-h-[40px] text-xs bg-white text-slate-800"
                >
                  <option value="">종속(Y)</option>
                  {allConstructNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Column 3: EFA Options */}
          <div className="space-y-4 min-w-0">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                요인추출 기준 (주성분 분석 · Varimax)
              </label>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="radio"
                    name="efaMode"
                    checked={efaConfig.extractionMode === 'kaiser'}
                    onChange={() => onChangeEFAConfig({ ...efaConfig, extractionMode: 'kaiser' })}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span>고유값 &gt; 1.0 (자동)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="radio"
                    name="efaMode"
                    checked={efaConfig.extractionMode === 'fixed'}
                    onChange={() => onChangeEFAConfig({ ...efaConfig, extractionMode: 'fixed' })}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span>요인 수 지정</span>
                </label>
              </div>
              {efaConfig.extractionMode === 'fixed' && (
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={efaConfig.fixedFactors}
                  onChange={(e) =>
                    onChangeEFAConfig({
                      ...efaConfig,
                      fixedFactors: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="mt-2 w-28 border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs font-mono"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                요인적재값 필터 기준 (SPSS 0.5 이하 삭제)
              </label>
              <select
                value={efaConfig.loadingThreshold}
                onChange={(e) =>
                  onChangeEFAConfig({ ...efaConfig, loadingThreshold: Number(e.target.value) })
                }
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2 min-h-[42px] text-xs bg-white font-mono"
              >
                <option value={0.5}>0.50 이하 숨김 (수업 기준)</option>
                <option value={0.4}>0.40 이하 숨김</option>
                <option value={0}>모든 적재값 표시</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer: Auto-connected Hypothesis Paths & Run Analysis */}
        <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="text-xs sm:text-sm text-slate-700">
              <span className="font-semibold text-slate-900">가설 경로: </span>
              {resolvedPaths.length > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
                  {resolvedPaths.map((p) => (
                    <span
                      key={`${p.id}-${p.from}-${p.to}`}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800"
                    >
                      <span className="font-mono font-bold text-blue-700">{p.id}</span>
                      <span>{p.from}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-semibold text-emerald-700">{p.to}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-amber-700 font-medium">
                  독립변수(X)와 종속변수(Y)를 선택하면 가설 경로가 자동 연결됩니다.
                </span>
              )}
              {hypothesis.controls.length > 0 && (
                <span className="ml-2 text-xs text-slate-500">
                  (통제: {hypothesis.controls.join(', ')})
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onRunAnalysis}
            className="w-full lg:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 min-h-[44px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 shrink-0" />
            <span>설정 적용 후 1. 요인분석 시작</span>
          </button>
        </div>
      </div>
    </div>
  );
};
