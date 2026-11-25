import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ColumnProfile,
  ConstructMapping,
  HypothesisConfig,
  ResearchHypothesisPath,
} from '../types/stats';
import {
  applyConstructRoles,
  buildDefaultPaths,
  deriveHypothesisFromPaths,
  syncModelOnConstructChange,
  validateResearchModel,
} from '../utils/researchModel';
import { StepIssuesAlert } from './StepIssuesAlert';

interface ResearchModelEditorProps {
  columns: string[];
  columnProfiles?: ColumnProfile[];
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  onSaveModel: (
    nextConstructs: ConstructMapping[],
    nextHypothesis: HypothesisConfig,
    options?: { showToast?: boolean; nextTab?: 'overview' | 'mapping' }
  ) => void;
  onGoToMapping?: () => void;
}

export const ResearchModelEditor: React.FC<ResearchModelEditorProps> = ({
  columns,
  columnProfiles = [],
  constructs,
  hypothesis,
  onSaveModel,
  onGoToMapping,
}) => {
  const [draftModelName, setDraftModelName] = useState<string>(hypothesis.modelName ?? '');
  const [draftConstructs, setDraftConstructs] = useState<ConstructMapping[]>(constructs);
  const [draftHyp, setDraftHyp] = useState<HypothesisConfig>(hypothesis);
  const [customItemInputs, setCustomItemInputs] = useState<Record<string, string>>({});
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Sync external updates (e.g., when dataset file is uploaded or sample loaded)
  useEffect(() => {
    setDraftModelName(hypothesis.modelName ?? '');
    setDraftConstructs(constructs);
    setDraftHyp({
      ...hypothesis,
      paths:
        hypothesis.paths && hypothesis.paths.length > 0
          ? hypothesis.paths
          : buildDefaultPaths(hypothesis, constructs),
    });
  }, [constructs, hypothesis]);

  const allConstructNames = useMemo(
    () => draftConstructs.map((c) => c.name).filter((n) => n.trim().length > 0),
    [draftConstructs]
  );

  const profileMap = useMemo(
    () => new Map(columnProfiles.map((p) => [p.name, p])),
    [columnProfiles]
  );

  const itemColumnChoices = useMemo(
    () => columns.filter((c) => profileMap.get(c)?.kind !== 'empty'),
    [columns, profileMap]
  );

  const activePaths = useMemo(
    () => draftHyp.paths ?? buildDefaultPaths(draftHyp, draftConstructs),
    [draftHyp, draftConstructs]
  );

  const validation = useMemo(
    () =>
      validateResearchModel(
        draftConstructs,
        { ...draftHyp, modelName: draftModelName, paths: activePaths },
        columns.length ? columns : undefined
      ),
    [draftConstructs, draftHyp, draftModelName, activePaths, columns]
  );

  const commitDraft = (
    nextConstructs: ConstructMapping[],
    nextHyp: HypothesisConfig,
    showToast = false,
    nextTab?: 'overview' | 'mapping'
  ) => {
    const synced = syncModelOnConstructChange(draftConstructs, nextConstructs, {
      ...nextHyp,
      modelName: draftModelName,
    });
    setDraftConstructs(synced.constructs);
    setDraftHyp(synced.hypothesis);
    onSaveModel(synced.constructs, synced.hypothesis, { showToast, nextTab });
  };

  const handleAddConstruct = () => {
    const letter = String.fromCharCode(65 + (draftConstructs.length % 26));
    const baseName = `구성개념 ${letter}`;
    const existing = new Set(draftConstructs.map((c) => c.name));
    const uniqueName = existing.has(baseName)
      ? `구성개념 ${draftConstructs.length + 1}`
      : baseName;

    const nextConstructs: ConstructMapping[] = [
      ...draftConstructs,
      {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: uniqueName,
        items: [],
        role: 'unassigned',
      },
    ];
    commitDraft(nextConstructs, draftHyp);
  };

  const handleRenameConstruct = (id: string, nextName: string) => {
    const nextConstructs = draftConstructs.map((c) => (c.id === id ? { ...c, name: nextName } : c));
    const synced = syncModelOnConstructChange(draftConstructs, nextConstructs, {
      ...draftHyp,
      modelName: draftModelName,
    });
    setDraftConstructs(synced.constructs);
    setDraftHyp(synced.hypothesis);
  };

  const handleBlurRename = () => {
    onSaveModel(draftConstructs, { ...draftHyp, modelName: draftModelName });
  };

  const handleRemoveConstruct = (id: string) => {
    const nextConstructs = draftConstructs.filter((c) => c.id !== id);
    commitDraft(nextConstructs, draftHyp);
  };

  const handleToggleItem = (constructId: string, item: string) => {
    const nextConstructs = draftConstructs.map((c) => {
      if (c.id !== constructId) return c;
      const exists = c.items.includes(item);
      return {
        ...c,
        items: exists ? c.items.filter((i) => i !== item) : [...c.items, item],
      };
    });
    commitDraft(nextConstructs, draftHyp);
  };

  const handleAddCustomItem = (constructId: string) => {
    const raw = (customItemInputs[constructId] ?? '').trim();
    if (!raw) return;
    const itemsToAdd = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!itemsToAdd.length) return;
    const nextConstructs = draftConstructs.map((c) =>
      c.id === constructId
        ? { ...c, items: Array.from(new Set([...c.items, ...itemsToAdd])) }
        : c
    );
    setCustomItemInputs((prev) => ({ ...prev, [constructId]: '' }));
    commitDraft(nextConstructs, draftHyp);
  };

  const handleRoleChange = (updatedHyp: HypothesisConfig, regeneratePaths = true) => {
    const withPaths = regeneratePaths
      ? {
          ...updatedHyp,
          modelName: draftModelName,
          paths: buildDefaultPaths(updatedHyp, draftConstructs),
        }
      : { ...updatedHyp, modelName: draftModelName };
    const roledConstructs = applyConstructRoles(draftConstructs, withPaths);
    setDraftConstructs(roledConstructs);
    setDraftHyp(withPaths);
    onSaveModel(roledConstructs, withPaths);
  };

  const handleToggleIndep = (name: string) => {
    const exists = draftHyp.independents.includes(name);
    const nextIndeps = exists
      ? draftHyp.independents.filter((n) => n !== name)
      : [...draftHyp.independents, name];
    handleRoleChange({
      ...draftHyp,
      independents: nextIndeps,
      dependent: draftHyp.dependent === name && !exists ? '' : draftHyp.dependent,
      mediator: draftHyp.mediator === name && !exists ? '' : draftHyp.mediator,
    });
  };

  const handleAddPath = () => {
    const nextIdx = activePaths.length + 1;
    const defaultFrom =
      draftHyp.independents[0] || allConstructNames[0] || '';
    const defaultTo =
      draftHyp.dependent ||
      allConstructNames.find((n) => n !== defaultFrom) ||
      allConstructNames[0] ||
      '';
    const newPath: ResearchHypothesisPath = {
      id: `H${nextIdx}`,
      from: defaultFrom,
      fromId: draftConstructs.find((c) => c.name === defaultFrom)?.id,
      to: defaultTo,
      toId: draftConstructs.find((c) => c.name === defaultTo)?.id,
      role: 'direct',
    };
    const nextPaths = [...activePaths, newPath];
    const derived = deriveHypothesisFromPaths(nextPaths, draftConstructs, {
      ...draftHyp,
      modelName: draftModelName,
    });
    const roled = applyConstructRoles(draftConstructs, derived);
    setDraftConstructs(roled);
    setDraftHyp(derived);
    onSaveModel(roled, derived);
  };

  const handleUpdatePath = (idx: number, patch: Partial<ResearchHypothesisPath>) => {
    const nextPaths = activePaths.map((p, i) => {
      if (i !== idx) return p;
      const merged = { ...p, ...patch };
      return {
        ...merged,
        fromId: draftConstructs.find((c) => c.name === merged.from)?.id,
        toId: draftConstructs.find((c) => c.name === merged.to)?.id,
        moderatorId: merged.moderator
          ? draftConstructs.find((c) => c.name === merged.moderator)?.id
          : undefined,
      };
    });
    const derived = deriveHypothesisFromPaths(nextPaths, draftConstructs, {
      ...draftHyp,
      modelName: draftModelName,
    });
    const roled = applyConstructRoles(draftConstructs, derived);
    setDraftConstructs(roled);
    setDraftHyp(derived);
    onSaveModel(roled, derived);
  };

  const handleRemovePath = (idx: number) => {
    const nextPaths = activePaths.filter((_, i) => i !== idx);
    const derived = deriveHypothesisFromPaths(nextPaths, draftConstructs, {
      ...draftHyp,
      modelName: draftModelName,
    });
    const roled = applyConstructRoles(draftConstructs, derived);
    setDraftConstructs(roled);
    setDraftHyp(derived);
    onSaveModel(roled, derived);
  };

  const handleRegenerateStandardPaths = () => {
    const stdPaths = buildDefaultPaths(draftHyp, draftConstructs);
    const nextHyp = { ...draftHyp, modelName: draftModelName, paths: stdPaths };
    const roled = applyConstructRoles(draftConstructs, nextHyp);
    setDraftConstructs(roled);
    setDraftHyp(nextHyp);
    onSaveModel(roled, nextHyp, { showToast: true });
  };

  const handleSaveAndApply = () => {
    const finalHyp: HypothesisConfig = {
      ...draftHyp,
      modelName: draftModelName.trim(),
      paths: activePaths,
    };
    const synced = syncModelOnConstructChange(draftConstructs, draftConstructs, finalHyp);
    setDraftConstructs(synced.constructs);
    setDraftHyp(synced.hypothesis);
    onSaveModel(synced.constructs, synced.hypothesis, { showToast: true });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2200);
  };

  return (
    <div className="space-y-6">
      {/* 1. Research Model Name & Role Overview */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              연구모형 데이터 입력 · 설계
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              연구모형명, 구성개념, 측정문항, 독립(X)·매개(M)·조절(W)·종속(Y) 변수 및 가설 경로(H1, H2...)를 직접 입력하고 저장합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onGoToMapping && (
              <button
                type="button"
                onClick={onGoToMapping}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span>변수 매핑 화면으로</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 min-h-[40px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors cursor-pointer"
            >
              {savedFeedback ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>저장됨</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 shrink-0" />
                  <span>연구모형 저장 및 적용</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Model Name Input */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6">
            <label htmlFor="research-model-name" className="block text-xs font-bold text-slate-700 mb-1.5">
              1. 연구모형명
            </label>
            <input
              id="research-model-name"
              type="text"
              value={draftModelName}
              onChange={(e) => setDraftModelName(e.target.value)}
              onBlur={handleBlurRename}
              placeholder="예: 변혁적 리더십과 혁신행동 간 심리적 자본의 매개효과 모형"
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div className="lg:col-span-6 flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5">
            <span className="font-semibold text-slate-800">연동 요약:</span>
            <span>구성개념 {draftConstructs.length}개</span>
            <span>·</span>
            <span>독립(X) {draftHyp.independents.length}개</span>
            <span>·</span>
            <span>매개(M) {draftHyp.mediator || '없음'}</span>
            <span>·</span>
            <span>종속(Y) {draftHyp.dependent || '미지정'}</span>
            <span>·</span>
            <span>가설 {activePaths.length}개</span>
          </div>
        </div>

        {validation.issues.length > 0 && (
          <StepIssuesAlert issues={validation.issues} title="연구모형 설정 점검" />
        )}
      </div>

      {/* 2. Constructs & Measurement Items */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h4 className="text-base font-bold text-slate-900">
              2. 구성개념 및 측정문항 등록
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              연구모형에 포함할 구성개념을 추가·수정하고, 데이터 열이나 직접 입력으로 측정문항을 연결하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddConstruct}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>구성개념 추가</span>
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {draftConstructs.map((c, idx) => {
            const roleLabel =
              c.name === draftHyp.dependent
                ? { text: '종속변수(Y)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                : c.name === draftHyp.mediator
                  ? { text: '매개변수(M)', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
                  : c.name === draftHyp.moderator
                    ? { text: '조절변수(W)', cls: 'bg-violet-50 text-violet-700 border-violet-200' }
                    : draftHyp.independents.includes(c.name)
                      ? { text: '독립변수(X)', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
                      : { text: '역할 미지정', cls: 'bg-slate-100 text-slate-600 border-slate-200' };

            return (
              <div key={c.id} className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-xs font-mono text-slate-400 w-6 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      aria-label={`구성개념 ${idx + 1} 이름`}
                      value={c.name}
                      onChange={(e) => handleRenameConstruct(c.id, e.target.value)}
                      onBlur={handleBlurRename}
                      className="border border-slate-300 rounded-xl px-3 py-1.5 min-h-[40px] w-full sm:w-56 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    />
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${roleLabel.cls}`}>
                      {roleLabel.text}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      문항 {c.items.length}개
                    </span>
                  </div>
                  {draftConstructs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveConstruct(c.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>삭제</span>
                    </button>
                  )}
                </div>

                {/* Selected / Custom measurement items */}
                {c.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-0 sm:pl-8">
                    {c.items.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleItem(c.id, item)}
                          aria-label={`${item} 제거`}
                          className="text-blue-500 hover:text-red-600 font-bold ml-0.5 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Dataset column checkboxes */}
                {itemColumnChoices.length > 0 && (
                  <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 pl-0 sm:pl-8">
                    {itemColumnChoices.map((col) => {
                      const checked = c.items.includes(col);
                      return (
                        <label
                          key={col}
                          className={`inline-flex items-center gap-1.5 text-xs cursor-pointer select-none py-1 px-2 rounded-lg transition-colors ${
                            checked
                              ? 'bg-blue-50/80 text-blue-800 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleItem(c.id, col)}
                            className="w-3.5 h-3.5 accent-blue-700 cursor-pointer"
                          />
                          <span>{col}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Manual measurement item input */}
                <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-8">
                  <input
                    type="text"
                    value={customItemInputs[c.id] ?? ''}
                    onChange={(e) =>
                      setCustomItemInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomItem(c.id);
                      }
                    }}
                    placeholder="측정문항 직접 추가 (쉼표로 구분: 예 A1, A2, A3)"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 min-h-[36px] text-xs w-full sm:w-72 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomItem(c.id)}
                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    문항 추가
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Variable Roles (X, M, W, Y) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="pb-3.5 border-b border-slate-200">
          <h4 className="text-base font-bold text-slate-900">
            3. 독립(X) · 매개(M) · 조절(W) · 종속(Y) 변수 역할 지정
          </h4>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            등록한 모든 구성개념이 선택 목록에 자동 반영됩니다. 독립변수는 다중회귀를 위해 복수 선택할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Independent (X) Combo + Multi-select */}
          <div className="space-y-2">
            <label htmlFor="model-sel-x" className="block text-xs font-bold text-slate-700">
              독립변수 (X · 복수 선택)
            </label>
            <select
              id="model-sel-x"
              value=""
              disabled={allConstructNames.length === 0}
              onChange={(e) => {
                const picked = e.target.value;
                if (!picked) return;
                if (!draftHyp.independents.includes(picked)) {
                  handleRoleChange({
                    ...draftHyp,
                    independents: [...draftHyp.independents, picked],
                    dependent: draftHyp.dependent === picked ? '' : draftHyp.dependent,
                    mediator: draftHyp.mediator === picked ? '' : draftHyp.mediator,
                  });
                }
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="">+ 독립변수(X) 선택 추가</option>
              {allConstructNames.map((n) => (
                <option key={n} value={n}>
                  {n} {draftHyp.independents.includes(n) ? '(선택됨)' : ''}
                </option>
              ))}
            </select>
            <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/70 space-y-1.5 max-h-36 overflow-y-auto">
              {allConstructNames.map((name) => {
                const checked = draftHyp.independents.includes(name);
                return (
                  <label
                    key={name}
                    className="flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleIndep(name)}
                      className="w-4 h-4 accent-blue-700 cursor-pointer"
                    />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Mediator (M) */}
          <div className="space-y-2">
            <label htmlFor="model-sel-m" className="block text-xs font-bold text-slate-700">
              매개변수 (M)
            </label>
            <select
              id="model-sel-m"
              value={draftHyp.mediator}
              disabled={allConstructNames.length === 0}
              onChange={(e) => {
                const nextMed = e.target.value;
                handleRoleChange({
                  ...draftHyp,
                  mediator: nextMed,
                  independents: draftHyp.independents.filter((n) => n !== nextMed),
                  dependent: draftHyp.dependent === nextMed ? '' : draftHyp.dependent,
                });
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="">선택 안 함 (직접회귀 모형)</option>
              {allConstructNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              매개변수를 지정하면 H1(X→M), H2(M→Y), H3(X→Y)와 Baron·Kenny, Sobel, Bootstrap 검정이 자동 생성됩니다.
            </p>
          </div>

          {/* Moderator (W) */}
          <div className="space-y-2">
            <label htmlFor="model-sel-w" className="block text-xs font-bold text-slate-700">
              조절변수 (W · 선택)
            </label>
            <select
              id="model-sel-w"
              value={draftHyp.moderator ?? ''}
              disabled={allConstructNames.length === 0}
              onChange={(e) => {
                const nextW = e.target.value || undefined;
                handleRoleChange({
                  ...draftHyp,
                  moderator: nextW,
                  moderationX: nextW ? draftHyp.moderationX || draftHyp.independents[0] : undefined,
                  moderationY: nextW ? draftHyp.moderationY || draftHyp.dependent : undefined,
                });
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="">선택 안 함</option>
              {allConstructNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              조절변수를 지정하면 5단계에서 상호작용항(X×W) 위계적 회귀 및 단순기울기 검증이 실행됩니다.
            </p>
          </div>

          {/* Dependent (Y) */}
          <div className="space-y-2">
            <label htmlFor="model-sel-y" className="block text-xs font-bold text-slate-700">
              종속변수 (Y)
            </label>
            <select
              id="model-sel-y"
              value={draftHyp.dependent}
              disabled={allConstructNames.length === 0}
              onChange={(e) => {
                const nextDep = e.target.value;
                handleRoleChange({
                  ...draftHyp,
                  dependent: nextDep,
                  mediator: draftHyp.mediator === nextDep ? '' : draftHyp.mediator,
                  independents: draftHyp.independents.filter((n) => n !== nextDep),
                });
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="">선택하세요</option>
              {allConstructNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              최종 결과변수입니다. 5단계 회귀분석 및 6단계 논문 작성 결과의 종속변수로 연결됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Research Hypotheses & Path Directions */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-700" />
              <span>4. 연구가설(H1, H2...) 및 변수 간 경로 방향 설정</span>
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              출발 변수(원인) → 도착 변수(결과) 경로를 설정하면 독립(X)·매개(M)·종속(Y) 역할과 회귀분석 가설이 자동 동기화됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRegenerateStandardPaths}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[38px] text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>X·M·Y 기준 경로 재생성</span>
            </button>
            <button
              type="button"
              onClick={handleAddPath}
              disabled={allConstructNames.length < 2}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 min-h-[38px] text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>가설 경로 추가</span>
            </button>
          </div>
        </div>

        {activePaths.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center text-xs sm:text-sm text-slate-600">
            등록된 가설 경로가 없습니다. ‘가설 경로 추가’를 눌러 예: H1(A → B), H2(B → C), H3(A → C)를 설정하세요.
          </div>
        ) : (
          <div className="space-y-2.5">
            {activePaths.map((p, idx) => (
              <div
                key={`${p.id}-${idx}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center rounded-xl border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="md:col-span-2">
                  <input
                    type="text"
                    aria-label={`가설 ${idx + 1} 번호`}
                    value={p.id}
                    onChange={(e) => handleUpdatePath(idx, { id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 min-h-[38px] text-xs font-mono font-bold text-blue-700 bg-white"
                  />
                </div>

                <div className="md:col-span-3">
                  <select
                    aria-label={`${p.id} 출발 변수`}
                    value={p.from}
                    onChange={(e) => handleUpdatePath(idx, { from: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 min-h-[38px] text-xs bg-white text-slate-900"
                  >
                    <option value="">출발 변수 선택</option>
                    {!allConstructNames.includes(p.from) && p.from && (
                      <option value={p.from}>{p.from}</option>
                    )}
                    {allConstructNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1 flex items-center justify-center text-blue-700 font-bold text-sm">
                  →
                </div>

                <div className="md:col-span-3">
                  <select
                    aria-label={`${p.id} 도착 변수`}
                    value={p.to}
                    onChange={(e) => handleUpdatePath(idx, { to: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 min-h-[38px] text-xs bg-white text-slate-900"
                  >
                    <option value="">도착 변수 선택</option>
                    {!allConstructNames.includes(p.to) && p.to && (
                      <option value={p.to}>{p.to}</option>
                    )}
                    {allConstructNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <select
                    aria-label={`${p.id} 경로 유형`}
                    value={p.role}
                    onChange={(e) =>
                      handleUpdatePath(idx, {
                        role: e.target.value as ResearchHypothesisPath['role'],
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 min-h-[38px] text-xs bg-white text-slate-700"
                  >
                    <option value="mediation_a">매개 경로 (X→M)</option>
                    <option value="mediation_b">매개 경로 (M→Y)</option>
                    <option value="direct">직접 경로 (X→Y)</option>
                    <option value="moderation">조절 경로 (X×W→Y)</option>
                  </select>
                </div>

                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemovePath(idx)}
                    aria-label={`${p.id} 삭제`}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              자동 연결 결과: 독립(X)=<strong>{draftHyp.independents.join(', ') || '미지정'}</strong> · 매개(M)=
              <strong>{draftHyp.mediator || '없음'}</strong> · 종속(Y)=
              <strong>{draftHyp.dependent || '미지정'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveAndApply}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 cursor-pointer shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>저장 후 전체 단계 반영</span>
          </button>
        </div>
      </div>
    </div>
  );
};
