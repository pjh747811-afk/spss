import React from 'react';
import { Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ConstructMapping, EFAConfig, HypothesisConfig } from '../../types/stats';

interface StepMappingProps {
  columns: string[];
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  efaConfig: EFAConfig;
  onChangeConstructs: (next: ConstructMapping[]) => void;
  onChangeHypothesis: (next: HypothesisConfig) => void;
  onChangeEFAConfig: (next: EFAConfig) => void;
  onAutoDetect: () => void;
  onRunAnalysis: () => void;
}

export const StepMapping: React.FC<StepMappingProps> = ({
  columns,
  constructs,
  hypothesis,
  efaConfig,
  onChangeConstructs,
  onChangeHypothesis,
  onChangeEFAConfig,
  onAutoDetect,
  onRunAnalysis,
}) => {
  const itemColumns = columns.filter(
    (c) => !/합$|합계|mean|avg|total|FAC/i.test(c.trim())
  );

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
    onChangeConstructs([
      ...constructs,
      { id: `c-${Date.now()}`, name: `새 구성개념 ${constructs.length + 1}`, items: [] },
    ]);
  };

  const removeConstruct = (constructId: string) => {
    onChangeConstructs(constructs.filter((c) => c.id !== constructId));
  };

  const toggleIndep = (name: string) => {
    const exists = hypothesis.independents.includes(name);
    onChangeHypothesis({
      ...hypothesis,
      independents: exists
        ? hypothesis.independents.filter((n) => n !== name)
        : [...hypothesis.independents, name],
    });
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

  const validConstructNames = constructs.filter((c) => c.items.length > 0).map((c) => c.name);
  const assignedItems = new Set(constructs.flatMap((c) => c.items));
  const controlCandidates = columns.filter(
    (col) =>
      !assignedItems.has(col) &&
      !/합$|합계|mean|avg|total|FAC/i.test(col.trim())
  );

  if (!columns.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-slate-700">데이터를 먼저 업로드하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">구성개념 및 문항 매핑</h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              요인분석·신뢰도·합변수 계산에 사용할 문항을 구성개념별로 연결합니다. (자동 매핑 기본 적용됨)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onAutoDetect}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>문항 자동 매핑</span>
            </button>
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
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-mono text-slate-400 w-6">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateConstructName(c.id, e.target.value)}
                    className="border border-slate-300 rounded-xl px-3 py-1.5 min-h-[40px] text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                  <span className="text-xs text-slate-500 font-mono tabular-nums font-medium">
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

              <div className="flex flex-wrap gap-x-4 gap-y-2 pl-0 sm:pl-8">
                {itemColumns.map((col) => {
                  const checked = c.items.includes(col);
                  return (
                    <label
                      key={col}
                      className={`inline-flex items-center gap-2 text-xs cursor-pointer select-none py-1 px-2 rounded-lg transition-colors ${
                        checked
                          ? 'text-blue-800 font-semibold bg-blue-50/70'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItemInConstruct(c.id, col)}
                        className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                      />
                      <span>{col}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Research Model & EFA Options */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 pb-3.5 border-b border-slate-200">
          연구모형(가설 H1~H3 · 매개 · 통제 · 조절) 및 요인분석 옵션
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              독립변수 (X · H1, H3 독립변수)
            </label>
            <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/60 max-h-48 overflow-y-auto">
              {validConstructNames.map((name) => {
                const isMedOrDep = name === hypothesis.mediator || name === hypothesis.dependent;
                const checked = hypothesis.independents.includes(name);
                return (
                  <label
                    key={name}
                    className={`flex items-center gap-2 text-xs cursor-pointer py-0.5 ${
                      isMedOrDep ? 'text-slate-400' : 'text-slate-800 font-medium'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isMedOrDep}
                      onChange={() => toggleIndep(name)}
                      className="w-4 h-4 accent-blue-700"
                    />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4">
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

          <div>
            <label htmlFor="sel-mediator" className="block text-xs font-bold text-slate-700 mb-2">
              매개변수 (M · H1 종속 / H2 독립)
            </label>
            <select
              id="sel-mediator"
              value={hypothesis.mediator}
              onChange={(e) => {
                const nextMed = e.target.value;
                onChangeHypothesis({
                  ...hypothesis,
                  mediator: nextMed,
                  independents: hypothesis.independents.filter((n) => n !== nextMed),
                });
              }}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2 min-h-[42px] text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              {validConstructNames.map((n) => (
                <option key={n} value={n}>
                  {n}
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
                onChange={(e) => {
                  const nextDep = e.target.value;
                  onChangeHypothesis({
                    ...hypothesis,
                    dependent: nextDep,
                    independents: hypothesis.independents.filter((n) => n !== nextDep),
                  });
                }}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2 min-h-[42px] text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              >
                {validConstructNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
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
                  {validConstructNames.map((n) => (
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
                  {validConstructNames.map((n) => (
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
                  {validConstructNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
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

        <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs sm:text-sm text-slate-600">
            가설 경로:{' '}
            <span className="font-semibold text-slate-900">
              {hypothesis.independents.join(', ') || '없음'}
            </span>
            {' → '}
            <span className="font-semibold text-blue-700">{hypothesis.mediator || '미지정'}</span>
            {' → '}
            <span className="font-semibold text-emerald-700">{hypothesis.dependent || '미지정'}</span>
            {hypothesis.controls.length > 0 && (
              <span className="ml-2 text-slate-500">
                (통제: {hypothesis.controls.join(', ')})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onRunAnalysis}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 min-h-[44px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 shrink-0" />
            <span>설정 적용 후 1. 요인분석 시작</span>
          </button>
        </div>
      </div>
    </div>
  );
};
