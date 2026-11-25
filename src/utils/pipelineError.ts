import { StepIssue } from '../types/stats';

export type PipelineStage = StepIssue['step'];

export const STAGE_METADATA: Record<
  PipelineStage,
  { label: string; stepIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
> = {
  upload: { label: '0. 데이터 입력', stepIndex: 0 },
  mapping: { label: '0. 변수 매핑', stepIndex: 0 },
  efa: { label: '1. 요인분석 (EFA)', stepIndex: 1 },
  reliability: { label: '2. 신뢰도 분석 (α)', stepIndex: 2 },
  composites: { label: '3. 합변수 계산', stepIndex: 3 },
  correlation: { label: '4. 상관분석', stepIndex: 4 },
  regression: { label: '5. 회귀분석', stepIndex: 5 },
  mediation: { label: '5. 매개효과 검정', stepIndex: 5 },
  moderation: { label: '5. 조절효과 검정', stepIndex: 5 },
  thesis: { label: '6. 결과 · 논문 작성', stepIndex: 6 },
};

export class StatsCalculationError extends Error {
  readonly stage: PipelineStage;
  readonly variables: string[];
  readonly constraint: string;
  readonly actionHint?: string;

  constructor(opts: {
    stage: PipelineStage;
    message: string;
    constraint: string;
    variables?: string[];
    actionHint?: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'StatsCalculationError';
    this.stage = opts.stage;
    this.constraint = opts.constraint;
    this.variables = opts.variables ?? [];
    this.actionHint = opts.actionHint;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export function classifyRuntimeError(
  err: unknown,
  stage: PipelineStage,
  variables: string[] = []
): StepIssue {
  if (err instanceof StatsCalculationError) {
    return {
      step: err.stage,
      severity: 'error',
      constraint: err.constraint,
      message: err.message,
      actionHint: err.actionHint,
      variables: err.variables.length ? err.variables : variables,
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const stageLabel = STAGE_METADATA[stage]?.label ?? stage;
  const lower = rawMsg.toLowerCase();

  let constraint = '통계 연산 런타임 예외';
  let humanMessage = `${stageLabel} 계산 중 예기치 않은 오류가 발생했습니다: ${rawMsg}`;
  let actionHint = '관련 변수에 비정상적인 문자열·결측 또는 동일 값이 포함되어 있는지 확인해 주세요.';

  if (
    lower.includes('singular') ||
    lower.includes('invert') ||
    /\bdet(erminant)?\b/.test(lower)
  ) {
    constraint = '행렬 특이값 (다중공선성 / 역행렬 불가)';
    humanMessage = `${stageLabel}: 투입된 변수 간 완전 다중공선성 또는 표본 부족으로 행렬 연산에 실패했습니다.`;
    actionHint = '중복 변수나 완전히 비례·고정된 문항을 제외해 주세요.';
  } else if (lower.includes('nan') || lower.includes('infinity') || lower.includes('finite')) {
    constraint = '수치 연산 발산 (NaN / Infinity)';
    humanMessage = `${stageLabel}: 수치 계산 도중 유효하지 않은 값(NaN/무한대)이 발생했습니다.`;
    actionHint = '표본 수 부족, 분산 0, 또는 잘못된 문자 데이터를 점검해 주세요.';
  } else if (lower.includes('memory') || lower.includes('rangeerror') || lower.includes('stack')) {
    constraint = '연산 범위 / 메모리 한도 초과';
    humanMessage = `${stageLabel}: 투입 변수 또는 행렬 크기가 허용 연산 범위를 초과했습니다.`;
    actionHint = '불필요한 ID·텍스트 열을 매핑에서 제외한 뒤 다시 시도하세요.';
  }

  return {
    step: stage,
    severity: 'error',
    constraint,
    message: humanMessage,
    actionHint,
    variables: variables.length ? variables : undefined,
  };
}

export function safeRunStage<T>(
  stage: PipelineStage,
  variables: string[],
  fallback: T,
  fn: () => T,
  issues: StepIssue[]
): T {
  try {
    return fn();
  } catch (err) {
    const issue = classifyRuntimeError(err, stage, variables);
    issues.push(issue);
    console.error(`[SPSS 연구통계] ${STAGE_METADATA[stage].label} 단계 런타임 오류 포착:`, {
      issue,
      rawError: err,
    });
    return fallback;
  }
}

export function getIssueKey(issue: StepIssue): string {
  return [
    issue.step,
    issue.severity,
    issue.constraint ?? '',
    issue.message,
    (issue.variables ?? []).join(','),
  ].join('|');
}
