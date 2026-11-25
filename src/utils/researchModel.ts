import {
  ConstructMapping,
  ConstructRole,
  HypothesisConfig,
  ResearchHypothesisPath,
  StepIssue,
} from '../types/stats';

function findConstructByIdOrName(
  constructs: ConstructMapping[],
  id?: string,
  name?: string
): ConstructMapping | undefined {
  if (id) {
    const byId = constructs.find((c) => c.id === id);
    if (byId) return byId;
  }
  if (name) {
    return constructs.find((c) => c.name === name);
  }
  return undefined;
}

export function buildDefaultPaths(
  hyp: HypothesisConfig,
  constructs: ConstructMapping[] = []
): ResearchHypothesisPath[] {
  const paths: ResearchHypothesisPath[] = [];
  const getId = (name: string) => constructs.find((c) => c.name === name)?.id;

  const indeps = hyp.independents.filter(Boolean);
  const med = hyp.mediator?.trim() || '';
  const dep = hyp.dependent?.trim() || '';

  if (indeps.length > 0 && dep) {
    if (med && med !== dep) {
      paths.push({
        id: 'H1',
        from: indeps.join(', '),
        fromId: indeps.length === 1 ? getId(indeps[0]) : undefined,
        to: med,
        toId: getId(med),
        role: 'mediation_a',
        description: `${indeps.join(', ')} → ${med}`,
      });
      paths.push({
        id: 'H2',
        from: med,
        fromId: getId(med),
        to: dep,
        toId: getId(dep),
        role: 'mediation_b',
        description: `${med} → ${dep}`,
      });
      paths.push({
        id: 'H3',
        from: indeps.join(', '),
        fromId: indeps.length === 1 ? getId(indeps[0]) : undefined,
        to: dep,
        toId: getId(dep),
        role: 'direct',
        description: `${indeps.join(', ')} → ${dep}`,
      });
    } else {
      indeps.forEach((indep, idx) => {
        paths.push({
          id: `H${idx + 1}`,
          from: indep,
          fromId: getId(indep),
          to: dep,
          toId: getId(dep),
          role: 'direct',
          description: `${indep} → ${dep}`,
        });
      });
    }
  }

  if (hyp.moderationX && hyp.moderator && hyp.moderationY) {
    paths.push({
      id: `H${paths.length + 1}`,
      from: hyp.moderationX,
      fromId: getId(hyp.moderationX),
      to: hyp.moderationY,
      toId: getId(hyp.moderationY),
      role: 'moderation',
      moderator: hyp.moderator,
      moderatorId: getId(hyp.moderator),
      description: `${hyp.moderationX} × ${hyp.moderator}(조절) → ${hyp.moderationY}`,
    });
  }

  return paths;
}

/**
 * Splits a potentially comma-separated source string into individual construct names
 * when matching known constructs.
 */
export function parsePathSources(fromText: string, constructNames: Set<string>): string[] {
  const trimmed = fromText.trim();
  if (!trimmed) return [];
  if (constructNames.has(trimmed)) return [trimmed];
  return trimmed
    .split(/[,·+]+/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && constructNames.has(s));
}

export function deriveHypothesisFromPaths(
  paths: ResearchHypothesisPath[],
  constructs: ConstructMapping[],
  current: HypothesisConfig
): HypothesisConfig {
  const constructNames = new Set(constructs.map((c) => c.name));
  const getId = (name: string) => constructs.find((c) => c.name === name)?.id;

  const cleanPaths = paths
    .map((p, idx) => {
      const resolvedTo = findConstructByIdOrName(constructs, p.toId, p.to)?.name ?? p.to.trim();
      const resolvedFrom = findConstructByIdOrName(constructs, p.fromId, p.from)?.name ?? p.from.trim();
      const resolvedMod = p.moderator
        ? findConstructByIdOrName(constructs, p.moderatorId, p.moderator)?.name ?? p.moderator.trim()
        : undefined;
      return {
        ...p,
        id: p.id.trim() || `H${idx + 1}`,
        from: resolvedFrom,
        fromId: p.fromId ?? getId(resolvedFrom),
        to: resolvedTo,
        toId: p.toId ?? getId(resolvedTo),
        moderator: resolvedMod,
        moderatorId: resolvedMod ? p.moderatorId ?? getId(resolvedMod) : undefined,
      };
    })
    .filter((p) => p.from || p.to);

  const structuralPaths = cleanPaths.filter((p) => p.role !== 'moderation');
  const modPath = cleanPaths.find((p) => p.role === 'moderation');

  if (!structuralPaths.length) {
    return {
      ...current,
      paths: cleanPaths,
      moderationX: modPath ? modPath.from : current.moderationX,
      moderator: modPath?.moderator ?? current.moderator,
      moderationY: modPath ? modPath.to : current.moderationY,
      moderatorId: modPath?.moderator ? getId(modPath.moderator) : current.moderatorId,
    };
  }

  // Build adjacency for structural paths (excluding self loops)
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const p of structuralPaths) {
    if (!constructNames.has(p.to)) continue;
    const sources = parsePathSources(p.from, constructNames);
    for (const src of sources) {
      if (src === p.to) continue;
      if (!outgoing.has(src)) outgoing.set(src, new Set());
      outgoing.get(src)!.add(p.to);
      if (!incoming.has(p.to)) incoming.set(p.to, new Set());
      incoming.get(p.to)!.add(src);
    }
  }

  // Dependent (Y): prefer node with incoming edges & NO outgoing edges (sink)
  const allTargets = Array.from(incoming.keys());
  const sinks = allTargets.filter((n) => !(outgoing.get(n)?.size));
  let dependent = '';
  if (sinks.length > 0) {
    // Pick sink with most incoming edges (or last in structuralPaths)
    dependent =
      sinks.sort((a, b) => (incoming.get(b)?.size ?? 0) - (incoming.get(a)?.size ?? 0))[0] || '';
  } else if (allTargets.length > 0) {
    dependent = allTargets[allTargets.length - 1];
  } else {
    dependent = current.dependent;
  }

  // Mediator (M): explicit mediation_a target / mediation_b source OR intermediate node (incoming > 0 & outgoing to dependent)
  let mediator = '';
  const explicitMedPath =
    structuralPaths.find((p) => p.role === 'mediation_a' && p.to !== dependent) ??
    structuralPaths.find((p) => p.role === 'mediation_b' && p.from !== dependent);
  if (explicitMedPath) {
    const candidate =
      explicitMedPath.role === 'mediation_a'
        ? explicitMedPath.to
        : parsePathSources(explicitMedPath.from, constructNames)[0] ?? '';
    if (candidate && candidate !== dependent && constructNames.has(candidate)) {
      mediator = candidate;
    }
  }
  if (!mediator) {
    const intermediates = Array.from(incoming.keys()).filter(
      (n) => n !== dependent && outgoing.get(n)?.has(dependent)
    );
    if (intermediates.length > 0) {
      mediator = intermediates[0];
    }
  }

  // Independents (X): exogenous nodes (no incoming edges, or sources targeting M/Y excluding M and Y)
  const indepSet = new Set<string>();
  for (const p of structuralPaths) {
    const sources = parsePathSources(p.from, constructNames);
    for (const src of sources) {
      if (src !== dependent && src !== mediator) {
        indepSet.add(src);
      }
    }
  }

  const independents = Array.from(indepSet);
  return {
    ...current,
    independents,
    independentIds: independents.map((n) => getId(n)).filter((id): id is string => Boolean(id)),
    mediator,
    mediatorId: mediator ? getId(mediator) : undefined,
    dependent,
    dependentId: dependent ? getId(dependent) : undefined,
    moderationX: modPath ? modPath.from : current.moderationX,
    moderator: modPath?.moderator ?? current.moderator,
    moderationY: modPath ? modPath.to : current.moderationY,
    moderatorId: modPath?.moderator ? getId(modPath.moderator) : current.moderatorId,
    paths: cleanPaths,
  };
}

export function applyConstructRoles(
  constructs: ConstructMapping[],
  hyp: HypothesisConfig
): ConstructMapping[] {
  const indepSet = new Set(hyp.independents);
  return constructs.map((c) => {
    let role: ConstructRole = 'unassigned';
    if (c.name === hyp.dependent) role = 'dependent';
    else if (c.name === hyp.mediator) role = 'mediator';
    else if (c.name === hyp.moderator) role = 'moderator';
    else if (indepSet.has(c.name)) role = 'independent';
    return { ...c, role };
  });
}

export function syncModelOnConstructChange(
  prevConstructs: ConstructMapping[],
  rawNextConstructs: ConstructMapping[],
  prevHyp: HypothesisConfig
): { constructs: ConstructMapping[]; hypothesis: HypothesisConfig } {
  // Ensure unique IDs & clean item lists
  const usedIds = new Set<string>();
  const nextConstructs: ConstructMapping[] = rawNextConstructs.map((c, idx) => {
    let id = c.id || `c-${Date.now()}-${idx}`;
    while (usedIds.has(id)) {
      id = `${id}-${idx}`;
    }
    usedIds.add(id);
    return {
      ...c,
      id,
      name: c.name,
      items: Array.from(new Set(c.items)),
    };
  });

  // Map prev construct ID -> new construct name (handles renames cleanly!)
  const prevById = new Map(prevConstructs.map((c) => [c.id, c]));
  const nextById = new Map(nextConstructs.map((c) => [c.id, c]));
  const nextNames = nextConstructs.map((c) => c.name);
  const nextNameSet = new Set(nextNames);

  const renameMap = new Map<string, string>();
  for (const nextC of nextConstructs) {
    const prevC = prevById.get(nextC.id);
    if (prevC && prevC.name !== nextC.name && prevC.name.trim()) {
      renameMap.set(prevC.name, nextC.name);
    }
  }

  const resolveName = (oldName?: string, oldId?: string): string => {
    if (oldId && nextById.has(oldId)) {
      return nextById.get(oldId)!.name;
    }
    if (oldName) {
      if (renameMap.has(oldName)) return renameMap.get(oldName)!;
      if (nextNameSet.has(oldName)) return oldName;
    }
    return '';
  };

  const nextDependent = resolveName(prevHyp.dependent, prevHyp.dependentId);
  let nextMediator = resolveName(prevHyp.mediator, prevHyp.mediatorId);
  if (nextMediator === nextDependent) nextMediator = '';

  const prevIndepNames = prevHyp.independents;
  const prevIndepIds = prevHyp.independentIds ?? [];
  const nextIndeps: string[] = [];
  prevIndepNames.forEach((n, idx) => {
    const resolved = resolveName(n, prevIndepIds[idx]);
    if (resolved && resolved !== nextDependent && resolved !== nextMediator && !nextIndeps.includes(resolved)) {
      nextIndeps.push(resolved);
    }
  });

  const nextModX = resolveName(prevHyp.moderationX) || undefined;
  const nextModW = resolveName(prevHyp.moderator, prevHyp.moderatorId) || undefined;
  const nextModY = resolveName(prevHyp.moderationY) || undefined;

  // Remap existing paths
  let nextPaths: ResearchHypothesisPath[] | undefined = prevHyp.paths?.map((p) => {
    const fromSingle = resolveName(p.from, p.fromId);
    const fromMulti =
      fromSingle ||
      p.from
        .split(/[,·+]+/)
        .map((s) => resolveName(s.trim()))
        .filter(Boolean)
        .join(', ');
    const toResolved = resolveName(p.to, p.toId);
    const modResolved = p.moderator ? resolveName(p.moderator, p.moderatorId) : undefined;
    return {
      ...p,
      from: fromMulti || p.from,
      fromId: nextConstructs.find((c) => c.name === fromMulti)?.id ?? p.fromId,
      to: toResolved || p.to,
      toId: nextConstructs.find((c) => c.name === toResolved)?.id ?? p.toId,
      moderator: modResolved || undefined,
    };
  });

  const getId = (name: string) => nextConstructs.find((c) => c.name === name)?.id;

  // Keep paths aligned if there were no custom paths or all existing paths were auto-derived
  if (!nextPaths || nextPaths.length === 0) {
    nextPaths = buildDefaultPaths(
      {
        ...prevHyp,
        independents: nextIndeps,
        mediator: nextMediator,
        dependent: nextDependent,
        moderationX: nextModX,
        moderator: nextModW,
        moderationY: nextModY,
      },
      nextConstructs
    );
  }

  const nextHypothesis: HypothesisConfig = {
    ...prevHyp,
    independents: nextIndeps,
    independentIds: nextIndeps.map((n) => getId(n)).filter((id): id is string => Boolean(id)),
    mediator: nextMediator,
    mediatorId: nextMediator ? getId(nextMediator) : undefined,
    dependent: nextDependent,
    dependentId: nextDependent ? getId(nextDependent) : undefined,
    moderationX: nextModX,
    moderator: nextModW,
    moderatorId: nextModW ? getId(nextModW) : undefined,
    moderationY: nextModY,
    paths: nextPaths,
  };

  return {
    constructs: applyConstructRoles(nextConstructs, nextHypothesis),
    hypothesis: nextHypothesis,
  };
}

export interface ModelValidationResult {
  valid: boolean;
  missingFields: ('constructs' | 'items' | 'independents' | 'dependent' | 'paths' | 'conflict')[];
  issues: StepIssue[];
}

export function validateResearchModel(
  constructs: ConstructMapping[],
  hypothesis: HypothesisConfig,
  availableColumns?: string[]
): ModelValidationResult {
  const issues: StepIssue[] = [];
  const missingFields: ModelValidationResult['missingFields'] = [];

  if (constructs.length === 0) {
    missingFields.push('constructs');
    issues.push({
      step: 'mapping',
      severity: 'error',
      constraint: '구성개념 미등록',
      message: '등록된 구성개념이 없습니다. 먼저 연구모형에서 구성개념(예: A, B, C)을 등록해 주세요.',
      actionHint: '0단계 [연구모형 데이터 입력] 또는 [변수 매핑 · 모형 설정]에서 구성개념을 추가하세요.',
    });
    return { valid: false, missingFields, issues };
  }

  const constructMap = new Map(constructs.map((c) => [c.name, c]));
  const colSet = availableColumns ? new Set(availableColumns) : null;

  // Check duplicate construct names
  const nameCounts = new Map<string, number>();
  for (const c of constructs) {
    const trimmed = c.name.trim();
    nameCounts.set(trimmed, (nameCounts.get(trimmed) ?? 0) + 1);
  }
  const dupNames = Array.from(nameCounts.entries())
    .filter(([, cnt]) => cnt > 1)
    .map(([name]) => name);
  if (dupNames.length > 0) {
    missingFields.push('conflict');
    issues.push({
      step: 'mapping',
      severity: 'error',
      constraint: '구성개념 이름 중복',
      message: `동일한 구성개념 이름이 중복 등록되었습니다: ${dupNames.join(', ')}`,
      actionHint: '각 구성개념이 구별될 수 있도록 고유한 이름을 지정해 주세요.',
      variables: dupNames,
    });
  }

  if (!hypothesis.independents.length) {
    missingFields.push('independents');
    issues.push({
      step: 'regression',
      severity: 'warning',
      constraint: '독립변수(X) 미지정',
      message: '독립변수(X)가 지정되지 않았습니다. 회귀분석을 실행하려면 1개 이상의 독립변수가 필요합니다.',
      actionHint: '0단계 [변수 매핑 · 모형 설정]의 독립변수(X) 선택란에서 1개 이상의 구성개념을 선택하세요.',
      variables: constructs.map((c) => c.name),
    });
  }

  if (!hypothesis.dependent) {
    missingFields.push('dependent');
    issues.push({
      step: 'regression',
      severity: 'warning',
      constraint: '종속변수(Y) 미지정',
      message: '종속변수(Y)가 지정되지 않았습니다. 회귀분석의 결과변수를 지정해 주세요.',
      actionHint: '0단계 [변수 매핑 · 모형 설정]의 종속변수(Y) 콤보박스에서 대상 구성개념을 선택하세요.',
      variables: constructs.map((c) => c.name),
    });
  }

  if (hypothesis.dependent && hypothesis.independents.includes(hypothesis.dependent)) {
    missingFields.push('conflict');
    issues.push({
      step: 'mapping',
      severity: 'error',
      constraint: '독립(X) · 종속(Y) 변수 중복',
      message: `'${hypothesis.dependent}'가 독립변수(X)와 종속변수(Y)에 동시에 지정되어 있습니다.`,
      actionHint: '독립변수(X)와 종속변수(Y)에는 서로 다른 구성개념을 지정해 주세요.',
      variables: [hypothesis.dependent],
    });
  }

  if (hypothesis.mediator && hypothesis.mediator === hypothesis.dependent) {
    missingFields.push('conflict');
    issues.push({
      step: 'mapping',
      severity: 'error',
      constraint: '매개(M) · 종속(Y) 변수 중복',
      message: `매개변수(M)와 종속변수(Y)가 동일한 구성개념('${hypothesis.dependent}')으로 지정되었습니다.`,
      actionHint: '매개변수는 독립(X)과 종속(Y)을 연결하는 별도의 구성개념이어야 합니다.',
      variables: [hypothesis.dependent],
    });
  }

  // Check items on role-assigned constructs
  const roleVars = Array.from(
    new Set([
      ...hypothesis.independents,
      ...(hypothesis.mediator ? [hypothesis.mediator] : []),
      ...(hypothesis.dependent ? [hypothesis.dependent] : []),
    ])
  );
  const emptyItemVars: string[] = [];
  const unmappedCols: string[] = [];
  for (const vName of roleVars) {
    const c = constructMap.get(vName);
    if (!c) {
      missingFields.push('conflict');
      issues.push({
        step: 'mapping',
        severity: 'error',
        constraint: '존재하지 않는 변수 참조',
        message: `연구모형에서 참조한 '${vName}' 구성개념을 찾을 수 없습니다.`,
        actionHint: '0단계 변수 매핑에서 유효한 구성개념으로 다시 선택해 주세요.',
        variables: [vName],
      });
    } else if (c.items.length === 0) {
      emptyItemVars.push(vName);
    } else if (colSet && colSet.size > 0) {
      const validMatched = c.items.filter((it) => colSet.has(it));
      if (validMatched.length === 0) {
        unmappedCols.push(vName);
      }
    }
  }

  if (emptyItemVars.length > 0) {
    missingFields.push('items');
    issues.push({
      step: 'mapping',
      severity: 'warning',
      constraint: '측정문항 미연결',
      message: `선택한 변수 [${emptyItemVars.join(', ')}]에 연결된 측정문항이 없습니다.`,
      actionHint: '0단계 [구성개념 및 문항 매핑]에서 각 구성개념에 해당하는 설문 문항 열을 체크해 주세요.',
      variables: emptyItemVars,
    });
  }

  if (unmappedCols.length > 0) {
    missingFields.push('items');
    issues.push({
      step: 'mapping',
      severity: 'warning',
      constraint: '데이터 열과 문항 불일치',
      message: `[${unmappedCols.join(', ')}]의 측정문항이 현재 업로드된 데이터 파일의 열 이름과 일치하지 않습니다.`,
      actionHint: '현재 데이터셋의 실제 열 이름으로 문항을 다시 연결해 주세요.',
      variables: unmappedCols,
    });
  }

  // Validate explicit hypothesis paths consistency
  const paths = hypothesis.paths ?? [];
  for (const p of paths) {
    const sources = parsePathSources(p.from, new Set(constructMap.keys()));
    if (!p.from.trim() || !p.to.trim()) {
      missingFields.push('paths');
      issues.push({
        step: 'mapping',
        severity: 'error',
        constraint: '연구가설 경로 불완전',
        message: `가설 ${p.id}의 출발 변수(원인) 또는 도착 변수(결과)가 비어 있습니다.`,
        actionHint: '연구모형 입력 화면에서 모든 가설 경로의 출발·도착 변수를 지정해 주세요.',
      });
      continue;
    }
    if (!constructMap.has(p.to)) {
      missingFields.push('paths');
      issues.push({
        step: 'mapping',
        severity: 'error',
        constraint: '가설 경로 변수 누락',
        message: `가설 ${p.id}의 도착 변수 '${p.to}'가 등록된 구성개념 목록에 없습니다.`,
        variables: [p.to],
      });
    }
    if (!sources.length) {
      missingFields.push('paths');
      issues.push({
        step: 'mapping',
        severity: 'error',
        constraint: '가설 경로 변수 누락',
        message: `가설 ${p.id}의 출발 변수 '${p.from}'가 등록된 구성개념 목록에 없습니다.`,
        variables: [p.from],
      });
    }
    if (sources.includes(p.to)) {
      missingFields.push('paths');
      issues.push({
        step: 'mapping',
        severity: 'error',
        constraint: '자기 순환 경로 오류',
        message: `가설 ${p.id}(${p.from} → ${p.to})의 출발 변수와 도착 변수가 동일합니다.`,
        variables: [p.to],
      });
    }
    // Check path vs role consistency
    if (p.role !== 'moderation' && hypothesis.dependent && p.from === hypothesis.dependent) {
      missingFields.push('paths');
      issues.push({
        step: 'mapping',
        severity: 'warning',
        constraint: '가설 경로와 종속변수 불일치',
        message: `가설 ${p.id}(${p.from} → ${p.to})에서는 '${p.from}'이 원인 변수이지만, 변수 매핑에서는 '${hypothesis.dependent}'가 최종 종속변수(Y)로 지정되어 있습니다.`,
        actionHint: '‘가설 경로 → 역할 자동 동기화’를 실행하거나 종속변수(Y)를 모형 경로에 맞게 수정해 주세요.',
        variables: [p.from, p.to],
      });
    }
  }

  return {
    valid: issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length === 0,
    missingFields: Array.from(new Set(missingFields)),
    issues,
  };
}
