export type DataRow = Record<string, string | number | null | undefined>;

export interface ConstructMapping {
  id: string;
  name: string;
  items: string[];
}

export interface HypothesisConfig {
  mediator: string;
  dependent: string;
  independents: string[];
  controls: string[];
  moderator?: string;
  moderationX?: string;
  moderationY?: string;
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
}
