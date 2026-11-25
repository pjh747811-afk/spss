export type DataRow = Record<string, string | number | null | undefined>;

export type ConstructRole = 'independent' | 'mediator' | 'moderator' | 'dependent' | 'unassigned';

export interface ConstructMapping {
  id: string;
  name: string;
  items: string[];
  role?: ConstructRole;
}

export interface ResearchHypothesisPath {
  id: string; // e.g. 'H1', 'H2', 'H3'
  from: string; // source construct name
  fromId?: string;
  to: string; // target construct name
  toId?: string;
  role: 'direct' | 'mediation_a' | 'mediation_b' | 'moderation';
  moderator?: string;
  moderatorId?: string;
  description?: string;
}

export interface HypothesisConfig {
  modelName?: string;
  mediator: string;
  mediatorId?: string;
  dependent: string;
  dependentId?: string;
  independents: string[];
  independentIds?: string[];
  controls: string[];
  moderator?: string;
  moderatorId?: string;
  moderationX?: string;
  moderationY?: string;
  paths?: ResearchHypothesisPath[];
}

export interface EFAConfig {
  items: string[];
  extractionMode: 'kaiser' | 'fixed';
  fixedFactors: number;
  loadingThreshold: number;
  sortBySize: boolean;
}

export interface EFALoadingRow {
  item: string;
  communality: number;
  loadings: number[]; // length = numFactors
  dominantFactor: number; // 0-indexed
  maxAbsLoading: number;
}

export interface EFAVarianceRow {
  component: number;
  initialEigenvalue: number;
  initialPctVar: number;
  initialCumPct: number;
  rotSS: number;
  rotPctVar: number;
  rotCumPct: number;
}

export type ColumnKind = 'numeric' | 'categorical' | 'text' | 'empty' | 'constant';

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  validCount: number;
  missingCount: number;
  uniqueCount: number;
  numericCount: number;
  min?: number;
  max?: number;
}

export interface StepIssue {
  step:
    | 'upload'
    | 'mapping'
    | 'efa'
    | 'reliability'
    | 'composites'
    | 'correlation'
    | 'regression'
    | 'mediation'
    | 'moderation'
    | 'thesis';
  severity: 'error' | 'warning' | 'info';
  constraint?: string;
  message: string;
  actionHint?: string;
  variables?: string[];
}

export interface EFAResult {
  n: number;
  p: number;
  numFactors: number;
  kmo: number;
  bartlettChi2: number;
  bartlettDf: number;
  bartlettP: number;
  harmanSingleFactorPct: number;
  eigenvalues: number[];
  varianceExplained: EFAVarianceRow[];
  rotatedMatrix: EFALoadingRow[];
  scoreCoeffMatrix: { item: string; coeffs: number[] }[];
  itemNames: string[];
  missingMode?: 'listwise' | 'pairwise';
  excludedItems?: { item: string; reason: string }[];
}

export interface ItemTotalStat {
  item: string;
  scaleMeanIfDeleted: number;
  scaleVarIfDeleted: number;
  correctedItemTotalCorr: number;
  alphaIfDeleted: number;
}

export interface ReliabilityRow {
  constructName: string;
  items: string[];
  nValid: number;
  nItems: number;
  alpha: number;
  standardizedAlpha: number;
  itemStats: ItemTotalStat[];
}

export interface CompositeSummary {
  name: string;
  items: string[];
  formula: string;
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  values: (number | null)[];
}

export interface CorrelationCell {
  r: number;
  p: number;
  n: number;
}

export interface CorrelationResult {
  names: string[];
  matrix: CorrelationCell[][];
}

export interface RegressionCoeff {
  name: string;
  b: number;
  se: number;
  beta: number | null;
  t: number;
  p: number;
  tolerance: number | null;
  vif: number | null;
}

export interface RegressionAnova {
  ssReg: number;
  dfReg: number;
  msReg: number;
  ssRes: number;
  dfRes: number;
  msRes: number;
  ssTot: number;
  dfTot: number;
  f: number;
  p: number;
}

export interface RegressionResult {
  id: string;
  hypothesis: string;
  label: string;
  dependent: string;
  independents: string[];
  controls?: string[];
  n: number;
  k: number;
  r: number;
  r2: number;
  adjR2: number;
  stdErrorEst: number;
  durbinWatson: number;
  anova: RegressionAnova;
  coeffs: RegressionCoeff[];
}

export interface MediationPathResult {
  independent: string;
  mediator: string;
  dependent: string;
  a: number;
  seA: number;
  pA: number;
  b: number;
  seB: number;
  pB: number;
  cTotal: number; // direct without M (from H3)
  pCTotal: number;
  cPrime: number; // direct controlling M (from H4)
  pCPrime: number;
  indirectEffect: number; // a * b
  sobelZ: number;
  sobelSE: number;
  sobelP: number;
  bootMean: number;
  bootSE: number;
  bootCiLow: number;
  bootCiHigh: number;
  status: 'full' | 'partial' | 'indirect_only' | 'none';
}

export interface MediationAnalysisResult {
  step4Regression: RegressionResult | null;
  r2ChangeFromH3: number | null;
  fChangeFromH3: number | null;
  pChangeFromH3: number | null;
  paths: MediationPathResult[];
  bootstrapSamples: number;
}

export interface SimpleSlopePoint {
  level: '저집단 (-1 SD)' | '평균 (Mean)' | '고집단 (+1 SD)';
  wValue: number;
  slope: number;
  se: number;
  t: number;
  p: number;
}

export interface ModerationResult {
  xName: string;
  wName: string;
  yName: string;
  n: number;
  step1: RegressionResult;
  step2: RegressionResult;
  r2Change: number;
  fChange: number;
  pChange: number;
  interactionCoeff: RegressionCoeff;
  significant: boolean;
  simpleSlopes: SimpleSlopePoint[];
}

export interface AnalysisBundle {
  timestamp: number;
  efa: EFAResult | null;
  reliability: ReliabilityRow[];
  composites: CompositeSummary[];
  correlation: CorrelationResult;
  regressions: RegressionResult[];
  mediation: MediationAnalysisResult | null;
  moderation: ModerationResult | null;
  issues?: StepIssue[];
  columnProfiles?: ColumnProfile[];
}

// ---------- Thesis Sentence Verification Engine Types ----------

export type VerificationStatus = 'pass' | 'needs_revision' | 'unverifiable';

export type VerificationRuleId =
  | 'numeric_mismatch'        // ① 통계적 수치 일치 여부
  | 'significance_error'      // ② 유의확률·유의성 해석 정확성
  | 'direction_sign_error'    // ③ 회귀계수 부호·영향 방향 일치
  | 'variable_role_swap'      // ④ 독립·종속변수 위치 확인
  | 'hypothesis_mismatch'     // ⑤ 연구가설·분석 결과 일치
  | 'med_mod_criteria_error'  // ⑥ 매개·조절효과 판단 기준 적용
  | 'unanalyzed_content'      // ⑦ 미분석 내용 임의 생성 방지
  | 'causal_overstatement';   // ⑧ 인과표현 제한

export interface VerificationIssueDetail {
  ruleId: VerificationRuleId;
  ruleNumber: string; // '①'..'⑧'
  ruleTitle: string;
  reason: string;
  criterion: string;
}

export interface SectionVerificationResult {
  sectionId: string;
  sectionTitle: string;
  stepLabel: string;
  style: 'standard' | 'concise';
  isUserEdited: boolean;
  status: VerificationStatus;
  originalText: string;
  issues: VerificationIssueDetail[];
  actualStatsSummary: string;
  suggestedText: string | null;
  appliedCriteria: string[];
  checkedAt: number;
}

export interface IndependentStatComparisonRow {
  analysisKey: string;
  analysisLabel: string;
  sectionId: string;
  webAppResult: string;
  independentResult: string;
  differenceSummary: string;
  maxDiff: number | null;
  withinTolerance: boolean | null;
  sentenceAccuracy: VerificationStatus;
  finalVerdict: VerificationStatus;
  note?: string;
}

export interface VerificationErrorTypeStat {
  ruleId: VerificationRuleId;
  ruleNumber: string;
  label: string;
  count: number;
}

export interface VerificationReportSummary {
  generatedAt: number;
  totalSections: number;
  passCount: number;
  needsRevisionCount: number;
  unverifiableCount: number;
  passRate: number; // 0..100
  errorStats: VerificationErrorTypeStat[];
  sectionResults: SectionVerificationResult[];
  comparisons: IndependentStatComparisonRow[];
}

export interface VerificationHistoryEntry {
  id: string;
  timestamp: number;
  fileName: string;
  sectionId: string;
  sectionTitle: string;
  action: 'auto_verify' | 'manual_edit' | 'apply_fix' | 'restore_auto';
  previousStatus: VerificationStatus;
  nextStatus: VerificationStatus;
  previousText: string;
  revisedText: string;
  reasonSummary: string;
}

