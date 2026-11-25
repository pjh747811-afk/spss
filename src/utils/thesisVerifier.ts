import {
  AnalysisBundle,
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
  IndependentStatComparisonRow,
  SectionVerificationResult,
  VerificationErrorTypeStat,
  VerificationIssueDetail,
  VerificationReportSummary,
  VerificationRuleId,
  VerificationStatus,
} from '../types/stats';
import { fmtNum, getHypothesisVerdict } from './statistics';
import { generateThesisSections, ThesisSection, ThesisStyle } from './thesisWriter';

// ---------- Rule Metadata ----------

const RULE_META: Record<
  VerificationRuleId,
  { number: string; title: string; defaultCriterion: string }
> = {
  numeric_mismatch: {
    number: '①',
    title: '통계 수치 일치 여부',
    defaultCriterion: '웹앱 통계 결과 및 독립 재계산 결과와 소수점 반올림 오차(±0.005~0.15) 이내 일치',
  },
  significance_error: {
    number: '②',
    title: '유의확률·유의성 해석',
    defaultCriterion: '유의수준 α = .05 (p < .05 유의 / p ≥ .05 비유의), p < .01, p < .001 표기 일치',
  },
  direction_sign_error: {
    number: '③',
    title: '계수 부호·영향 방향',
    defaultCriterion: '회귀계수(B, β) 및 상관계수(r)의 부호(+ 정적 / - 부적)와 서술 방향 일치',
  },
  variable_role_swap: {
    number: '④',
    title: '독립·종속변수 위치',
    defaultCriterion: '연구모형의 독립변수(X) → 매개변수(M) → 종속변수(Y) 경로 방향 준수',
  },
  hypothesis_mismatch: {
    number: '⑤',
    title: '연구가설·분석 결과 일치',
    defaultCriterion: '모형 F·개별 계수 p < .05 기준 가설 판정(채택 / 부분 채택 / 기각) 일치',
  },
  med_mod_criteria_error: {
    number: '⑥',
    title: '매개·조절효과 판단 기준',
    defaultCriterion:
      '매개: Sobel p < .05 또는 Boot 95% CI 0 미포함(+c/c’ 비교) · 조절: 2단계 ΔR²/ΔF(p < .05) 및 상호작용항(p < .05)',
  },
  unanalyzed_content: {
    number: '⑦',
    title: '미분석 내용 임의 생성 방지',
    defaultCriterion: '실제 분석되지 않았거나 결측·누락된 통계 결과를 임의로 서술하지 않을 것',
  },
  causal_overstatement: {
    number: '⑧',
    title: '인과표현 제한 (횡단·회귀)',
    defaultCriterion: '횡단 설문·상관·회귀분석에서는 ‘인과 입증/증명’ 대신 ‘유의한 영향/관련성 확인’ 표현 사용',
  },
};

const ALL_RULE_IDS: VerificationRuleId[] = [
  'numeric_mismatch',
  'significance_error',
  'direction_sign_error',
  'variable_role_swap',
  'hypothesis_mismatch',
  'med_mod_criteria_error',
  'unanalyzed_content',
  'causal_overstatement',
];

// ---------- Independent Mathematical Verification Engine ----------
// Uses Householder QR decomposition for OLS, covariance-sum for Cronbach's α,
// and Gram-Schmidt QR eigenvalue iteration for EFA (distinct algorithms from statistics.ts).

const IND_MISSING = new Set([
  '',
  '.',
  '-',
  'na',
  'n/a',
  'nan',
  'null',
  'none',
  '#n/a',
  '#value!',
  '#ref!',
  '#div/0!',
  '결측',
  '미응답',
  '무응답',
]);

function indToNum(val: unknown): number | null {
  if (val === null || val === undefined || typeof val === 'boolean') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (val instanceof Date) return null;
  const s = String(val).replace(/[\u00A0\u3000]/g, ' ').trim();
  if (!s || IND_MISSING.has(s.toLowerCase())) return null;
  if (/^[+-]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*점)?$/.test(s)) {
    const n = Number(s.replace(/,/g, '').replace(/\s*점$/, '').replace(/\s+/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function indExtractCol(rows: DataRow[], colName: string): (number | null)[] {
  const raw = rows.map((r) => r[colName]);
  const nums = raw.map((v) => indToNum(v));
  const validNum = nums.filter((v) => v !== null).length;
  const nonEmpty = raw.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;
  if (nonEmpty === 0 || validNum / nonEmpty >= 0.5) return nums;
  const cats = Array.from(
    new Set(
      raw
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
        .map((v) => String(v).trim())
    )
  ).sort((a, b) => a.localeCompare(b, 'ko'));
  const map = new Map(cats.map((c, idx) => [c, idx]));
  return raw.map((v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    return map.get(String(v).trim()) ?? null;
  });
}

function indLogGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - indLogGamma(1 - z);
  z -= 1;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.984369654078761e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function indBetaCF(a: number, b: number, x: number): number {
  const MAXIT = 250;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function indIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    indLogGamma(a + b) - indLogGamma(a) - indLogGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return Math.min(1, Math.max(0, (bt * indBetaCF(a, b, x)) / a));
  }
  return Math.min(1, Math.max(0, 1 - (bt * indBetaCF(b, a, 1 - x)) / b));
}

function indTP(t: number, df: number): number {
  if (!Number.isFinite(t) || df < 1) return 1;
  if (t === 0) return 1;
  return Math.min(1, Math.max(0, indIncBeta(df / (df + t * t), df / 2, 0.5)));
}

function indFP(f: number, df1: number, df2: number): number {
  if (!Number.isFinite(f) || f <= 0 || df1 < 1 || df2 < 1) return 1;
  return Math.min(1, Math.max(0, indIncBeta(df2 / (df2 + df1 * f), df2 / 2, df1 / 2)));
}

function indNormalP(z: number): number {
  if (!Number.isFinite(z)) return 1;
  const az = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * az);
  const d = 0.3989422804014327 * Math.exp((-az * az) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, Math.max(0, 2 * p));
}

function indMean(a: number[]): number {
  if (!a.length) return NaN;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

function indSd(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = indMean(a);
  let ss = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - m;
    ss += d * d;
  }
  return Math.sqrt(ss / (a.length - 1));
}

function indPearson(x: number[], y: number[]): { r: number; p: number; n: number } {
  const vx: number[] = [];
  const vy: number[] = [];
  const len = Math.min(x.length, y.length);
  for (let i = 0; i < len; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      vx.push(x[i]);
      vy.push(y[i]);
    }
  }
  const n = vx.length;
  if (n < 3) return { r: NaN, p: NaN, n };
  const mx = indMean(vx);
  const my = indMean(vy);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = vx[i] - mx;
    const dy = vy[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const den = Math.sqrt(sxx * syy);
  if (den <= 0) return { r: NaN, p: NaN, n };
  const r = Math.max(-1, Math.min(1, sxy / den));
  const p = Math.abs(r) >= 1 - 1e-12 ? 0 : indTP(Math.abs(r) * Math.sqrt((n - 2) / (1 - r * r)), n - 2);
  return { r, p, n };
}

// Independent Householder QR OLS Solver (R b = Q' y)
interface IndependentOLS {
  n: number;
  r2: number;
  adjR2: number;
  f: number;
  p: number;
  coeffs: { name: string; b: number; se: number; beta: number | null; t: number; p: number }[];
}

function solveIndependentOLSQR(
  yRaw: (number | null)[],
  xCols: { name: string; values: (number | null)[] }[]
): IndependentOLS | null {
  const validRows: { y: number; x: number[] }[] = [];
  for (let i = 0; i < yRaw.length; i++) {
    const yv = yRaw[i];
    if (yv === null || !Number.isFinite(yv)) continue;
    const row = [1];
    let ok = true;
    for (const col of xCols) {
      const xv = col.values[i];
      if (xv === null || !Number.isFinite(xv)) {
        ok = false;
        break;
      }
      row.push(xv);
    }
    if (ok) validRows.push({ y: yv, x: row });
  }

  const n = validRows.length;
  const p = xCols.length + 1;
  const k = xCols.length;
  if (n <= p) return null;

  // Householder QR decomposition of A (n x p) and transform rhs = Q'y
  const A = validRows.map((r) => [...r.x]);
  const rhs = validRows.map((r) => r.y);

  for (let col = 0; col < p; col++) {
    let normSq = 0;
    for (let row = col; row < n; row++) normSq += A[row][col] * A[row][col];
    const norm = Math.sqrt(normSq);
    if (norm < 1e-12) return null;

    const alpha = A[col][col] >= 0 ? -norm : norm;
    const v0 = A[col][col] - alpha;
    const v = [v0];
    let vNormSq = v0 * v0;
    for (let row = col + 1; row < n; row++) {
      v.push(A[row][col]);
      vNormSq += A[row][col] * A[row][col];
    }
    if (vNormSq < 1e-24) continue;
    const scale = 2 / vNormSq;

    // Apply reflection to remaining columns of A
    for (let j = col; j < p; j++) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += v[i] * A[col + i][j];
      const factor = scale * dot;
      for (let i = 0; i < v.length; i++) A[col + i][j] -= factor * v[i];
    }
    // Apply reflection to rhs
    let dotY = 0;
    for (let i = 0; i < v.length; i++) dotY += v[i] * rhs[col + i];
    const factorY = scale * dotY;
    for (let i = 0; i < v.length; i++) rhs[col + i] -= factorY * v[i];
  }

  // Back-substitute upper triangular R (A[0..p-1][0..p-1])
  const b = Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    if (Math.abs(A[i][i]) < 1e-11) return null;
    let sum = rhs[i];
    for (let j = i + 1; j < p; j++) sum -= A[i][j] * b[j];
    b[i] = sum / A[i][i];
  }

  // Invert upper triangular R to get R^{-1}, then (X'X)^{-1} = R^{-1} (R^{-1})'
  const Rinv = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = p - 1; i >= 0; i--) {
    Rinv[i][i] = 1 / A[i][i];
    for (let j = i + 1; j < p; j++) {
      let sum = 0;
      for (let m = i + 1; m <= j; m++) sum += A[i][m] * Rinv[m][j];
      Rinv[i][j] = -sum / A[i][i];
    }
  }

  const yVals = validRows.map((r) => r.y);
  const yMean = indMean(yVals);
  let ssRes = 0;
  let ssTot = 0;
  for (const r of validRows) {
    let yh = 0;
    for (let j = 0; j < p; j++) yh += b[j] * r.x[j];
    ssRes += (r.y - yh) ** 2;
    ssTot += (r.y - yMean) ** 2;
  }
  if (ssTot <= 1e-12) return null;

  const dfReg = k;
  const dfRes = n - k - 1;
  const ssReg = Math.max(0, ssTot - ssRes);
  const msReg = ssReg / dfReg;
  const msRes = ssRes / dfRes;
  const r2 = Math.min(1, Math.max(0, 1 - ssRes / ssTot));
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / dfRes;
  const f = msRes > 0 ? msReg / msRes : 0;
  const pModel = indFP(f, dfReg, dfRes);

  const ySd = Math.sqrt(ssTot / (n - 1));
  const coeffs = [];
  for (let i = 0; i < p; i++) {
    let diagInv = 0;
    for (let j = i; j < p; j++) diagInv += Rinv[i][j] * Rinv[i][j];
    const se = Math.sqrt(Math.max(0, diagInv * msRes));
    const t = se > 0 ? b[i] / se : NaN;
    const pVal = indTP(Math.abs(t), dfRes);
    if (i === 0) {
      coeffs.push({ name: '(상수)', b: b[i], se, beta: null, t, p: pVal });
    } else {
      const xCol = validRows.map((r) => r.x[i]);
      const xSd = indSd(xCol);
      const beta = xSd && ySd ? (b[i] * xSd) / ySd : NaN;
      coeffs.push({ name: xCols[i - 1].name, b: b[i], se, beta, t, p: pVal });
    }
  }

  return { n, r2, adjR2, f, p: pModel, coeffs };
}

// Independent Gram-Schmidt QR eigenvalue computation for symmetric correlation matrix
function qrEigenvalues(M_in: number[][]): number[] {
  const n = M_in.length;
  let A = M_in.map((r) => [...r]);
  for (let iter = 0; iter < 80; iter++) {
    // Modified Gram-Schmidt QR of A
    const Q = Array.from({ length: n }, () => Array(n).fill(0));
    const R = Array.from({ length: n }, () => Array(n).fill(0));
    const cols = Array.from({ length: n }, (_, j) => A.map((row) => row[j]));
    for (let j = 0; j < n; j++) {
      const v = [...cols[j]];
      for (let i = 0; i < j; i++) {
        let dot = 0;
        for (let r = 0; r < n; r++) dot += Q[r][i] * v[r];
        R[i][j] = dot;
        for (let r = 0; r < n; r++) v[r] -= dot * Q[r][i];
      }
      let norm = 0;
      for (let r = 0; r < n; r++) norm += v[r] * v[r];
      norm = Math.sqrt(norm);
      R[j][j] = norm;
      if (norm > 1e-14) {
        for (let r = 0; r < n; r++) Q[r][j] = v[r] / norm;
      }
    }
    // Next A = R * Q
    const nextA = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = i; k < n; k++) s += R[i][k] * Q[k][j];
        nextA[i][j] = s;
      }
    }
    let offDiag = 0;
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) offDiag += Math.abs(nextA[i][j]);
    }
    A = nextA;
    if (offDiag < 1e-10) break;
  }
  return Array.from({ length: n }, (_, i) => A[i][i]).sort((a, b) => b - a);
}

// Independent Gauss-Jordan inverse for KMO check
function indInvert(M: number[][]): number[][] | null {
  const k = M.length;
  const aug = M.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
    }
    if (piv !== col) [aug[col], aug[piv]] = [aug[piv], aug[col]];
    const div = aug[col][col];
    if (Math.abs(div) < 1e-12) return null;
    for (let j = 0; j < 2 * k; j++) aug[col][j] /= div;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let j = 0; j < 2 * k; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map((r) => r.slice(k));
}

export interface IndependentComputationResult {
  efa: { n: number; p: number; kmo: number; numFactors: number; cumVarPct: number } | null;
  reliability: { name: string; alpha: number }[];
  composites: { name: string; values: (number | null)[]; mean: number; sd: number }[];
  maxAbsR: number;
  regressions: Record<string, IndependentOLS>;
  mediation: {
    step4AdjR2: number;
    paths: {
      independent: string;
      indirectEffect: number;
      sobelZ: number;
      sobelP: number;
      status: 'full' | 'partial' | 'indirect_only' | 'none';
    }[];
  } | null;
  moderation: {
    r2Change: number;
    fChange: number;
    pChange: number;
    interactionB: number;
    interactionP: number;
    significant: boolean;
  } | null;
}

export function computeIndependentStats(
  rows: DataRow[],
  constructs: ConstructMapping[],
  hypothesis: HypothesisConfig,
  efaConfig: EFAConfig,
  bundle: AnalysisBundle
): IndependentComputationResult {
  const activeConstructs = constructs.filter((c) => c.items.length > 0);

  // 1. Independent EFA check matching bundle.efa's active items
  let indEfa: IndependentComputationResult['efa'] = null;
  if (bundle.efa && bundle.efa.itemNames.length >= 2 && rows.length >= 3) {
    const items = bundle.efa.itemNames;
    const p = items.length;
    const R = Array.from({ length: p }, () => Array(p).fill(0));
    let nUsed = 0;
    if (bundle.efa.missingMode === 'pairwise') {
      const cols = items.map((it) => rows.map((r) => indToNum(r[it])));
      let minN = Infinity;
      for (let i = 0; i < p; i++) {
        R[i][i] = 1;
        for (let j = i + 1; j < p; j++) {
          const xi: number[] = [];
          const xj: number[] = [];
          for (let r = 0; r < rows.length; r++) {
            const a = cols[i][r];
            const b = cols[j][r];
            if (a !== null && b !== null) {
              xi.push(a);
              xj.push(b);
            }
          }
          const res = indPearson(xi, xj);
          if (res.n < minN) minN = res.n;
          R[i][j] = Number.isFinite(res.r) ? res.r : 0;
          R[j][i] = R[i][j];
        }
      }
      nUsed = Number.isFinite(minN) ? minN : rows.length;
    } else {
      const complete: number[][] = [];
      for (let r = 0; r < rows.length; r++) {
        const vec: number[] = [];
        let ok = true;
        for (let c = 0; c < p; c++) {
          const v = indToNum(rows[r][items[c]]);
          if (v === null) {
            ok = false;
            break;
          }
          vec.push(v);
        }
        if (ok) complete.push(vec);
      }
      nUsed = complete.length;
      for (let i = 0; i < p; i++) {
        R[i][i] = 1;
        const colI = complete.map((row) => row[i]);
        for (let j = i + 1; j < p; j++) {
          const colJ = complete.map((row) => row[j]);
          const res = indPearson(colI, colJ);
          R[i][j] = Number.isFinite(res.r) ? res.r : 0;
          R[j][i] = R[i][j];
        }
      }
    }
    const inv = indInvert(R);
    let kmo = NaN;
    if (inv) {
      let sumR2 = 0;
      let sumA2 = 0;
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          if (i === j) continue;
          sumR2 += R[i][j] * R[i][j];
          const aij = -inv[i][j] / Math.sqrt(Math.max(1e-12, inv[i][i] * inv[j][j]));
          sumA2 += aij * aij;
        }
      }
      kmo = sumR2 + sumA2 > 0 ? sumR2 / (sumR2 + sumA2) : NaN;
    }
    const evs = qrEigenvalues(R);
    let numFactors =
      efaConfig.extractionMode === 'fixed'
        ? Math.max(1, Math.min(p, efaConfig.fixedFactors))
        : evs.filter((ev) => ev > 1.0).length;
    if (numFactors < 1) numFactors = 1;
    const cumVarPct = (evs.slice(0, numFactors).reduce((s, v) => s + Math.max(0, v), 0) / p) * 100;
    indEfa = { n: nUsed, p, kmo, numFactors, cumVarPct };
  }

  // 2. Independent Reliability (covariance sum formula)
  const relRows: { name: string; alpha: number }[] = [];
  for (const c of activeConstructs) {
    const k = c.items.length;
    if (k < 2) {
      relRows.push({ name: c.name, alpha: NaN });
      continue;
    }
    const mat: number[][] = [];
    for (let r = 0; r < rows.length; r++) {
      const vec: number[] = [];
      let ok = true;
      for (let j = 0; j < k; j++) {
        const v = indToNum(rows[r][c.items[j]]);
        if (v === null) {
          ok = false;
          break;
        }
        vec.push(v);
      }
      if (ok) mat.push(vec);
    }
    if (mat.length < 2) {
      relRows.push({ name: c.name, alpha: NaN });
      continue;
    }
    const means = Array.from({ length: k }, (_, j) => indMean(mat.map((row) => row[j])));
    let traceSum = 0;
    let totalCovSum = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        let cov = 0;
        for (let r = 0; r < mat.length; r++) {
          cov += (mat[r][i] - means[i]) * (mat[r][j] - means[j]);
        }
        cov /= mat.length - 1;
        if (i === j) traceSum += cov;
        totalCovSum += cov;
      }
    }
    const alpha = totalCovSum > 0 ? (k / (k - 1)) * (1 - traceSum / totalCovSum) : NaN;
    relRows.push({ name: c.name, alpha });
  }

  // 3. Independent Composites & Correlation
  const comps = activeConstructs.map((c) => {
    const values: (number | null)[] = rows.map((r) => {
      const vals: number[] = [];
      for (const it of c.items) {
        const v = indToNum(r[it]);
        if (v !== null) vals.push(v);
      }
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });
    const valid = values.filter((v): v is number => v !== null);
    return {
      name: c.name,
      values,
      mean: indMean(valid),
      sd: indSd(valid),
    };
  });

  let maxAbsR = 0;
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const xi: number[] = [];
      const xj: number[] = [];
      for (let r = 0; r < comps[i].values.length; r++) {
        const a = comps[i].values[r];
        const b = comps[j].values[r];
        if (a !== null && b !== null) {
          xi.push(a);
          xj.push(b);
        }
      }
      const { r } = indPearson(xi, xj);
      if (Number.isFinite(r) && Math.abs(r) > maxAbsR) maxAbsR = Math.abs(r);
    }
  }

  // 4. Independent Regressions matching bundle.regressions
  const getComp = (n: string) => comps.find((c) => c.name === n);
  const controlNames = (hypothesis.controls ?? []).filter((c) =>
    rows.some((r) => r[c] !== undefined)
  );
  const controlCols = controlNames.map((col) => ({
    name: col,
    values: indExtractCol(rows, col),
  }));

  const regMap: Record<string, IndependentOLS> = {};
  for (const reg of bundle.regressions) {
    const dep = getComp(reg.dependent);
    const indeps = reg.independents
      .map((n) => getComp(n))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (!dep || !indeps.length) continue;
    const ctrls = (reg.controls ?? [])
      .map((n) => controlCols.find((cc) => cc.name === n))
      .filter((c): c is NonNullable<typeof c> => !!c);
    const res = solveIndependentOLSQR(dep.values, [
      ...ctrls,
      ...indeps.map((c) => ({ name: c.name, values: c.values })),
    ]);
    if (res) regMap[reg.id] = res;
  }

  // 5. Independent Mediation check
  let indMed: IndependentComputationResult['mediation'] = null;
  if (bundle.mediation && hypothesis.mediator && hypothesis.dependent && hypothesis.independents.length) {
    const mComp = getComp(hypothesis.mediator);
    const yComp = getComp(hypothesis.dependent);
    const xComps = hypothesis.independents
      .map((n) => getComp(n))
      .filter((c): c is NonNullable<typeof c> => !!c && c.name !== hypothesis.mediator && c.name !== hypothesis.dependent);
    const h1Ind = regMap['H1'];
    const h3Ind = regMap['H3'];
    if (mComp && yComp && xComps.length && h1Ind && h3Ind) {
      const s4 = solveIndependentOLSQR(yComp.values, [
        ...controlCols,
        ...xComps.map((c) => ({ name: c.name, values: c.values })),
        { name: mComp.name, values: mComp.values },
      ]);
      const medInH4 = s4?.coeffs.find((c) => c.name === mComp.name);
      if (s4 && medInH4) {
        const paths = xComps.map((xc) => {
          const xInH1 = h1Ind.coeffs.find((c) => c.name === xc.name);
          const xInH3 = h3Ind.coeffs.find((c) => c.name === xc.name);
          const xInH4 = s4.coeffs.find((c) => c.name === xc.name);
          const a = xInH1?.b ?? NaN;
          const seA = xInH1?.se ?? NaN;
          const pA = xInH1?.p ?? NaN;
          const b = medInH4.b;
          const seB = medInH4.se;
          const pB = medInH4.p;
          const pCTotal = xInH3?.p ?? NaN;
          const pCPrime = xInH4?.p ?? NaN;
          const indirectEffect = a * b;
          const sobelSE = Math.sqrt(Math.max(0, b * b * seA * seA + a * a * seB * seB));
          const sobelZ = sobelSE > 0 ? indirectEffect / sobelSE : NaN;
          const sobelP = indNormalP(sobelZ);

          // Check app bootstrap CI consistency as well
          const appPath = bundle.mediation?.paths.find((ap) => ap.independent === xc.name);
          const bootExcludesZero =
            appPath &&
            Number.isFinite(appPath.bootCiLow) &&
            Number.isFinite(appPath.bootCiHigh) &&
            (appPath.bootCiLow > 0 || appPath.bootCiHigh < 0);
          const indirectSig = pA < 0.05 && pB < 0.05 && (sobelP < 0.05 || Boolean(bootExcludesZero));
          let status: 'full' | 'partial' | 'indirect_only' | 'none' = 'none';
          if (indirectSig) {
            if (pCTotal < 0.05 && pCPrime >= 0.05) status = 'full';
            else if (pCTotal < 0.05 && pCPrime < 0.05) status = 'partial';
            else if (pCTotal >= 0.05) status = 'indirect_only';
          }
          return { independent: xc.name, indirectEffect, sobelZ, sobelP, status };
        });
        indMed = { step4AdjR2: s4.adjR2, paths };
      }
    }
  }

  // 6. Independent Moderation check
  let indMod: IndependentComputationResult['moderation'] = null;
  if (bundle.moderation) {
    const mx = getComp(bundle.moderation.xName);
    const mw = getComp(bundle.moderation.wName);
    const my = getComp(bundle.moderation.yName);
    if (mx && mw && my) {
      const validIdx: number[] = [];
      for (let i = 0; i < my.values.length; i++) {
        if (mx.values[i] === null || mw.values[i] === null || my.values[i] === null) continue;
        if (controlCols.some((cc) => cc.values[i] === null)) continue;
        validIdx.push(i);
      }
      if (validIdx.length > controlCols.length + 5) {
        const xm = indMean(validIdx.map((i) => mx.values[i] as number));
        const wm = indMean(validIdx.map((i) => mw.values[i] as number));
        const xc = mx.values.map((v) => (v !== null ? v - xm : null));
        const wc = mw.values.map((v) => (v !== null ? v - wm : null));
        const xw = xc.map((a, i) => (a !== null && wc[i] !== null ? a * (wc[i] as number) : null));
        const interName = `${mx.name}×${mw.name}`;
        const s1 = solveIndependentOLSQR(my.values, [
          ...controlCols,
          { name: mx.name, values: xc },
          { name: mw.name, values: wc },
        ]);
        const s2 = solveIndependentOLSQR(my.values, [
          ...controlCols,
          { name: mx.name, values: xc },
          { name: mw.name, values: wc },
          { name: interName, values: xw },
        ]);
        const interCoeff = s2?.coeffs.find((c) => c.name === interName);
        if (s1 && s2 && interCoeff) {
          const r2Change = Math.max(0, s2.r2 - s1.r2);
          const dfRes = s2.n - (controlCols.length + 3) - 1;
          const fChange = dfRes > 0 && s2.r2 < 1 ? r2Change / ((1 - s2.r2) / dfRes) : 0;
          const pChange = indFP(fChange, 1, dfRes);
          indMod = {
            r2Change,
            fChange,
            pChange,
            interactionB: interCoeff.b,
            interactionP: interCoeff.p,
            significant: pChange < 0.05 && interCoeff.p < 0.05,
          };
        }
      }
    }
  }

  return {
    efa: indEfa,
    reliability: relRows,
    composites: comps,
    maxAbsR,
    regressions: regMap,
    mediation: indMed,
    moderation: indMod,
  };
}

// ---------- Number Parsing & Verification Helpers ----------

function parseStatFloat(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function addIssue(
  issues: VerificationIssueDetail[],
  ruleId: VerificationRuleId,
  reason: string,
  customCriterion?: string
) {
  const meta = RULE_META[ruleId];
  // Avoid identical duplicate messages
  if (issues.some((i) => i.ruleId === ruleId && i.reason === reason)) return;
  issues.push({
    ruleId,
    ruleNumber: meta.number,
    ruleTitle: meta.title,
    reason,
    criterion: customCriterion ?? meta.defaultCriterion,
  });
}

function closestMatch(val: number, pool: number[], tol: number): boolean {
  return pool.some((target) => Number.isFinite(target) && Math.abs(val - target) <= tol);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Common Rule ⑧ Causal Overstatement Check
function checkCausalOverstatement(text: string, issues: VerificationIssueDetail[]) {
  const causalPatterns: { regex: RegExp; phrase: string }[] = [
    {
      regex: /인과관계[가이을를]?\s*(?:명확히\s*|완전히\s*)?(?:입증|증명|규명|확증|확정)/g,
      phrase: '인과관계 입증/증명',
    },
    {
      regex: /인과적(?:인)?\s*(?:영향|관계|효과|메커니즘)[가이을를]?\s*(?:입증|증명|확증)/g,
      phrase: '인과적 영향/관계 입증',
    },
    {
      regex: /(?:매개\s*작용|조절\s*효과|가설|영향|관계)[이가]?\s*(?:입증|증명)되/g,
      phrase: '통계 결과에 ‘입증/증명’ 표현 사용',
    },
    {
      regex: /(?:반드시|필연적으로|절대적으로)\s*(?:초래|유발|야기|발생)/g,
      phrase: '단정적 인과 표현(반드시 초래/유발)',
    },
    {
      regex: /직접적인?\s*원인(?:이|으로)\s*(?:되어|작용하여)\s*(?:유발|초래)/g,
      phrase: '직접 원인 단정 표현',
    },
  ];

  for (const pat of causalPatterns) {
    const match = text.match(pat.regex);
    if (match && match.length > 0) {
      addIssue(
        issues,
        'causal_overstatement',
        `인과관계를 실험적으로 입증할 수 없는 횡단·설문 회귀분석 문장에서 과도한 인과 단정 표현("${match[0].trim()}")이 사용되었습니다.`,
        '⑧ 횡단 설문·상관·회귀분석은 통계적 관련성·예측력을 검증하므로 ‘인과 입증/증명’ 대신 ‘유의한 영향/관련성이 확인되었다’로 서술해야 합니다.'
      );
    }
  }
}

// Common Rule ② P-value notation consistency check
function checkPValueInequalities(
  text: string,
  expectedPs: number[],
  issues: VerificationIssueDetail[]
) {
  const finitePs = expectedPs.filter((v) => Number.isFinite(v));
  if (!finitePs.length) return;

  // Check explicit `p = .xxx`
  const eqRegex = /\bp\s*=\s*([+-]?\d*\.?\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = eqRegex.exec(text)) !== null) {
    const val = parseStatFloat(m[1]);
    if (!Number.isFinite(val)) continue;
    if (!closestMatch(val, finitePs, 0.005)) {
      addIssue(
        issues,
        'numeric_mismatch',
        `문장에 기재된 유의확률(p = ${m[1]})이 실제 산출된 p값(${finitePs.map((p) => (p < 0.001 ? '< .001' : fmtNum(p, 3))).join(', ')})과 일치하지 않습니다.`
      );
    }
  }

  // Check `p < .001` when none of the scoped p-values are < .001
  if (/\bp\s*<\s*\.?001\b/i.test(text) && !finitePs.some((p) => p < 0.001)) {
    addIssue(
      issues,
      'significance_error',
      `문장에 'p < .001'이 표기되었으나 실제 산출된 최소 유의확률은 ${fmtNum(Math.min(...finitePs), 3)}로 .001 미만 기준을 충족하지 않습니다.`
    );
  }
  if (/\bp\s*<\s*\.?01\b/i.test(text) && !finitePs.some((p) => p < 0.01)) {
    addIssue(
      issues,
      'significance_error',
      `문장에 'p < .01'이 표기되었으나 실제 유의확률(${finitePs.map((p) => fmtNum(p, 3)).join(', ')})이 .01 미만 기준을 충족하지 않습니다.`
    );
  }
  if (/\bp\s*<\s*\.?05\b/i.test(text) && !finitePs.some((p) => p < 0.05)) {
    addIssue(
      issues,
      'significance_error',
      `문장에 'p < .05'가 표기되었으나 실제 유의확률(${finitePs.map((p) => fmtNum(p, 3)).join(', ')})은 .05 이상(비유의)입니다.`
    );
  }
}

// ---------- Section-by-Section Verifiers ----------

function verifyEfaRelSection(
  text: string,
  bundle: AnalysisBundle,
  issues: VerificationIssueDetail[]
): { missingStats: boolean; actualSummary: string; criteria: string[] } {
  const efa = bundle.efa;
  const rel = bundle.reliability.filter((r) => Number.isFinite(r.alpha));
  const criteria = [
    'KMO ≥ .60 및 Bartlett 구형성 검정 p < .05',
    '고유값 1.0 이상 요인 수 및 누적 분산 설명력(%) 일치',
    'Cronbach’s α ≥ .60 기준 및 범위 일치',
  ];

  // Rule ⑦ unanalyzed checks
  const mentionsEfa = /KMO|Bartlett|요인적재량|탐색적\s*요인분석|주성분분석|고유값/i.test(text);
  const mentionsHarman = /Harman|단일요인|동일방법편의/i.test(text);
  const mentionsRel = /Cronbach|신뢰도\s*계수|내적\s*일관성|α\s*=/i.test(text);

  if (mentionsEfa && !efa) {
    addIssue(
      issues,
      'unanalyzed_content',
      '요인분석(EFA) 결과가 존재하지 않음에도 문장에서 KMO·Bartlett·요인적재량 등 요인분석 결과를 서술했습니다.'
    );
  }
  if (mentionsHarman && (!efa || !Number.isFinite(efa.harmanSingleFactorPct))) {
    addIssue(
      issues,
      'unanalyzed_content',
      'Harman 단일요인 검정치가 산출되지 않았으나 문장에서 공통방법편의 결과를 임의로 언급했습니다.'
    );
  }
  if (mentionsRel && rel.length === 0) {
    addIssue(
      issues,
      'unanalyzed_content',
      '유효한 신뢰도(Cronbach’s α) 산출 결과가 없음에도 문장에서 신뢰도 계수를 서술했습니다.'
    );
  }

  let missingStats = false;
  if (efa && mentionsEfa) {
    const claimsKmoOrBartlettMetric =
      /KMO\s*(?:\)|\s)*[=는은]?\s*[+-]?\d*\.?\d+|χ²\s*=|표본적합도\(KMO\)는\s*[.\d]|구형성\s*검정\s*결과는\s*χ²/i.test(
        text
      );
    const notesOmitted = /KMO\s*및\s*Bartlett[^.]*산출되지\s*않았/.test(text);
    if (!Number.isFinite(efa.kmo) || !Number.isFinite(efa.bartlettChi2) || !Number.isFinite(efa.bartlettP)) {
      if (claimsKmoOrBartlettMetric || (!notesOmitted && /KMO|Bartlett/i.test(text))) {
        missingStats = true;
      }
    } else {
      const kmoMatches = Array.from(text.matchAll(/KMO\s*(?:\)|\s)*[=는은]?\s*([+-]?\d*\.?\d+)/gi));
      for (const m of kmoMatches) {
        const val = parseStatFloat(m[1]);
        if (Number.isFinite(val) && Math.abs(val - efa.kmo) > 0.005) {
          addIssue(
            issues,
            'numeric_mismatch',
            `KMO 수치 불일치: 문장(${m[1]}) ≠ 실제 분석(${fmtNum(efa.kmo, 3)})`
          );
        }
      }
      if (/KMO.{0,30}상회/.test(text) && efa.kmo < 0.6) {
        addIssue(
          issues,
          'significance_error',
          `KMO(${fmtNum(efa.kmo, 3)})가 기준(.60) 미만이나 문장에서 '기준치(.60)를 상회하였다'고 해석했습니다.`
        );
      }
      const chiMatches = Array.from(text.matchAll(/χ²\s*=\s*([+-]?[\d,]+\.?\d*)/gi));
      for (const m of chiMatches) {
        const val = parseStatFloat(m[1]);
        if (Number.isFinite(val) && Math.abs(val - efa.bartlettChi2) > 0.05) {
          addIssue(
            issues,
            'numeric_mismatch',
            `Bartlett χ² 수치 불일치: 문장(${m[1]}) ≠ 실제 분석(${fmtNum(efa.bartlettChi2, 2)})`
          );
        }
      }
      const dfMatches = Array.from(text.matchAll(/\bdf\s*=\s*(\d+)/gi));
      for (const m of dfMatches) {
        const val = parseInt(m[1], 10);
        if (val !== efa.bartlettDf) {
          addIssue(
            issues,
            'numeric_mismatch',
            `Bartlett 자유도(df) 불일치: 문장(${val}) ≠ 실제 분석(${efa.bartlettDf})`
          );
        }
      }
      if (/Bartlett.{0,50}(?:적합한|유의하여)/.test(text) && efa.bartlettP >= 0.05) {
        addIssue(
          issues,
          'significance_error',
          `Bartlett 구형성 검정 유의확률(p = ${fmtNum(efa.bartlettP, 3)})이 .05 이상이므로 통계적으로 유의하다고 볼 수 없습니다.`
        );
      }
      checkPValueInequalities(text, [efa.bartlettP], issues);
    }

    const nMatch = text.match(/총\s*(\d+)명의\s*응답/);
    if (nMatch && parseInt(nMatch[1], 10) !== efa.n) {
      addIssue(issues, 'numeric_mismatch', `표본 수(N) 불일치: 문장(${nMatch[1]}) ≠ 실제(${efa.n})`);
    }
    const pMatch = text.match(/측정\s*문항\s*(\d+)개/);
    if (pMatch && parseInt(pMatch[1], 10) !== efa.p) {
      addIssue(issues, 'numeric_mismatch', `측정 문항 수 불일치: 문장(${pMatch[1]}) ≠ 실제(${efa.p})`);
    }
    const fMatch = text.match(/(\d+)개의?\s*요인/);
    if (fMatch && parseInt(fMatch[1], 10) !== efa.numFactors) {
      addIssue(
        issues,
        'numeric_mismatch',
        `추출 요인 수 불일치: 문장(${fMatch[1]}개) ≠ 실제(${efa.numFactors}개)`
      );
    }
    const cumVar = efa.varianceExplained[efa.numFactors - 1]?.rotCumPct ?? NaN;
    const varMatch = text.match(/(?:전체|총)\s*분산의\s*([+-]?\d+\.?\d*)%/);
    if (varMatch && Number.isFinite(cumVar)) {
      const val = parseStatFloat(varMatch[1]);
      if (Math.abs(val - cumVar) > 0.15) {
        addIssue(
          issues,
          'numeric_mismatch',
          `누적 설명 분산(%) 불일치: 문장(${val}%) ≠ 실제(${fmtNum(cumVar, 2)}%)`
        );
      }
    }
    if (mentionsHarman && Number.isFinite(efa.harmanSingleFactorPct)) {
      const hMatch = text.match(/(?:제1요인의?\s*분산\s*설명력이?\s*|Harman\s*단일요인\s*)([+-]?\d+\.?\d*)%/i);
      if (hMatch) {
        const val = parseStatFloat(hMatch[1]);
        if (Math.abs(val - efa.harmanSingleFactorPct) > 0.15) {
          addIssue(
            issues,
            'numeric_mismatch',
            `Harman 단일요인 설명력(%) 불일치: 문장(${val}%) ≠ 실제(${fmtNum(efa.harmanSingleFactorPct, 2)}%)`
          );
        }
      }
      if (/동일방법편의의?\s*심각한\s*우려가\s*없는/.test(text) && efa.harmanSingleFactorPct >= 50) {
        addIssue(
          issues,
          'significance_error',
          `Harman 제1요인 설명력(${fmtNum(efa.harmanSingleFactorPct, 2)}%)이 50% 이상이므로 '우려가 없다'고 해석할 수 없습니다.`
        );
      }
    }
    const loadings = efa.rotatedMatrix.map((r) => r.maxAbsLoading).filter(Number.isFinite);
    const loadRange = text.match(/요인적재량은\s*([+-]?\d*\.?\d+)\s*~\s*([+-]?\d*\.?\d+)/);
    if (loadRange && loadings.length) {
      const l1 = parseStatFloat(loadRange[1]);
      const l2 = parseStatFloat(loadRange[2]);
      const minL = Math.min(...loadings);
      const maxL = Math.max(...loadings);
      if (Math.abs(l1 - minL) > 0.005 || Math.abs(l2 - maxL) > 0.005) {
        addIssue(
          issues,
          'numeric_mismatch',
          `요인적재량 범위 불일치: 문장(${loadRange[1]}~${loadRange[2]}) ≠ 실제(${fmtNum(minL, 3)}~${fmtNum(maxL, 3)})`
        );
      }
    }
  }

  if (rel.length && mentionsRel) {
    const alphas = rel.map((r) => r.alpha);
    const allOk = alphas.every((a) => a >= 0.6);
    // Construct-scoped alphas: Name(3문항, α = .842)
    for (const r of rel) {
      const scopedRe = new RegExp(`${escapeRegExp(r.constructName)}\\([^)]*?α\\s*=\\s*([+-]?\\d*\\.?\\d+)`, 'g');
      let sm: RegExpExecArray | null;
      while ((sm = scopedRe.exec(text)) !== null) {
        const val = parseStatFloat(sm[1]);
        if (Number.isFinite(val) && Math.abs(val - r.alpha) > 0.005) {
          addIssue(
            issues,
            'numeric_mismatch',
            `${r.constructName} 신뢰도(α) 불일치: 문장(${sm[1]}) ≠ 실제(${fmtNum(r.alpha, 3)})`
          );
        }
      }
    }
    const allAlphaMatches = Array.from(text.matchAll(/α\s*=\s*([+-]?\d*\.?\d+)/g));
    for (const am of allAlphaMatches) {
      const val = parseStatFloat(am[1]);
      if (Number.isFinite(val) && !closestMatch(val, alphas, 0.005)) {
        addIssue(
          issues,
          'numeric_mismatch',
          `Cronbach’s α 수치(${am[1]})가 분석된 구성개념의 신뢰도(${alphas.map((a) => fmtNum(a, 3)).join(', ')})와 일치하지 않습니다.`
        );
      }
    }
    if (/모두\s*기준치\(?\.?60\)?를\s*상회|수용\s*기준\(?\.?60\s*이상\)?을?\s*충족/.test(text) && !allOk) {
      const low = rel.filter((r) => r.alpha < 0.6).map((r) => `${r.constructName}(${fmtNum(r.alpha, 3)})`);
      addIssue(
        issues,
        'significance_error',
        `기준치(.60) 미만 구성개념[${low.join(', ')}]이 존재함에도 모두 기준치를 충족했다고 서술했습니다.`
      );
    }
  }

  const cumVar = efa && efa.numFactors > 0 ? efa.varianceExplained[efa.numFactors - 1]?.rotCumPct ?? NaN : NaN;
  const efaSummary = efa
    ? `EFA(N=${efa.n}, 문항=${efa.p}): KMO=${fmtNum(efa.kmo, 3)}, Bartlett χ²=${fmtNum(efa.bartlettChi2, 2)}(df=${efa.bartlettDf}, p=${efa.bartlettP < 0.001 ? '< .001' : fmtNum(efa.bartlettP, 3)}), ${efa.numFactors}개 요인(누적 ${fmtNum(cumVar, 2)}%)`
    : 'EFA 미실행';
  const relSummary = rel.length
    ? `신뢰도 α: ${rel.map((r) => `${r.constructName}=${fmtNum(r.alpha, 3)}`).join(', ')}`
    : '신뢰도 없음';

  return {
    missingStats,
    actualSummary: `${efaSummary} / ${relSummary}`,
    criteria,
  };
}

function verifyDescCorrSection(
  text: string,
  bundle: AnalysisBundle,
  issues: VerificationIssueDetail[]
): { missingStats: boolean; actualSummary: string; criteria: string[] } {
  const validComps = bundle.composites.filter((c) => c.n > 0 && Number.isFinite(c.mean) && Number.isFinite(c.sd));
  const { names, matrix } = bundle.correlation;
  const criteria = [
    '평균(M)·표준편차(SD) 및 정규성(|왜도| < 2, |첨도| < 7)',
    'Pearson 상관계수(r) 및 유의확률(p < .05) 일치',
    '판별타당성·다중공선성 사전 점검(|r| < .85)',
  ];

  const mentionsCorr = /Pearson|상관분석|상관계수|r\s*=/.test(text);
  const mentionsDesc = /M\s*=|SD\s*=|기술통계|왜도|첨도/.test(text);
  if ((mentionsDesc && validComps.length === 0) || (mentionsCorr && names.length < 2)) {
    addIssue(
      issues,
      'unanalyzed_content',
      '기술통계 또는 상관분석 결과가 없거나 변수가 2개 미만임에도 문장에서 해당 분석 결과를 서술했습니다.'
    );
  }

  // Construct-scoped M, SD
  for (const c of validComps) {
    const mRe = new RegExp(`${escapeRegExp(c.name)}\\([^)]*?M\\s*=\\s*([+-]?\\d*\\.?\\d+)`, 'g');
    let mm: RegExpExecArray | null;
    while ((mm = mRe.exec(text)) !== null) {
      const val = parseStatFloat(mm[1]);
      if (Number.isFinite(val) && Math.abs(val - c.mean) > 0.015) {
        addIssue(issues, 'numeric_mismatch', `${c.name} 평균(M) 불일치: 문장(${mm[1]}) ≠ 실제(${fmtNum(c.mean, 2)})`);
      }
    }
    const sdRe = new RegExp(`${escapeRegExp(c.name)}\\([^)]*?SD\\s*=\\s*([+-]?\\d*\\.?\\d+)`, 'g');
    let sm: RegExpExecArray | null;
    while ((sm = sdRe.exec(text)) !== null) {
      const val = parseStatFloat(sm[1]);
      if (Number.isFinite(val) && Math.abs(val - c.sd) > 0.015) {
        addIssue(issues, 'numeric_mismatch', `${c.name} 표준편차(SD) 불일치: 문장(${sm[1]}) ≠ 실제(${fmtNum(c.sd, 2)})`);
      }
    }
  }

  // Correlations
  const pairValues: number[] = [];
  const pairPs: number[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const cell = matrix[i]?.[j];
      if (cell && Number.isFinite(cell.r)) {
        pairValues.push(cell.r);
        if (Number.isFinite(cell.p)) pairPs.push(cell.p);
      }
    }
  }
  const maxAbsR = pairValues.length ? Math.max(...pairValues.map((r) => Math.abs(r))) : NaN;

  // Pair-scoped r = X, p = Y
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const cell = matrix[i]?.[j];
      if (!cell || !Number.isFinite(cell.r)) continue;
      const pairPattern = new RegExp(
        `(?:${escapeRegExp(a)}[과와]\\s*${escapeRegExp(b)}|${escapeRegExp(b)}[과와]\\s*${escapeRegExp(a)})\\(\\s*r\\s*=\\s*([+-]?\\d*\\.?\\d+)(?:\\s*,\\s*p\\s*(?:=|(<))\\s*([+-]?\\d*\\.?\\d+))?\\)`,
        'g'
      );
      let pm: RegExpExecArray | null;
      while ((pm = pairPattern.exec(text)) !== null) {
        const rVal = parseStatFloat(pm[1]);
        if (Number.isFinite(rVal) && Math.abs(rVal - cell.r) > 0.005) {
          addIssue(
            issues,
            'numeric_mismatch',
            `${a}-${b} 상관계수(r) 불일치: 문장(${pm[1]}) ≠ 실제(${fmtNum(cell.r, 3)})`
          );
        }
        if (Number.isFinite(rVal) && rVal * cell.r < 0 && Math.abs(cell.r) > 0.01) {
          addIssue(
            issues,
            'direction_sign_error',
            `${a}-${b} 상관계수 부호 오류: 문장(${pm[1]}) vs 실제(${fmtNum(cell.r, 3)})`
          );
        }
        if (pm[2] === '<') {
          const thr = parseStatFloat(pm[3]);
          if (Number.isFinite(thr) && cell.p >= thr) {
            addIssue(
              issues,
              'significance_error',
              `${a}-${b} 상관 유의확률 표기 오류: 문장(p < ${pm[3]}) ≠ 실제(p = ${fmtNum(cell.p, 3)})`
            );
          }
        }
        if (/유의한\s*상관관계가\s*확인/.test(text) && cell.p >= 0.05) {
          addIssue(
            issues,
            'significance_error',
            `${a}-${b} 상관계수의 실제 유의확률(p = ${fmtNum(cell.p, 3)})이 .05 이상이므로 유의한 상관이라고 볼 수 없습니다.`
          );
        }
      }
    }
  }

  // Standalone r = X values
  const allRMatches = Array.from(text.matchAll(/\br\s*=\s*([+-]?\d*\.?\d+)/g));
  for (const rm of allRMatches) {
    const val = parseStatFloat(rm[1]);
    if (Number.isFinite(val) && pairValues.length && !closestMatch(val, pairValues, 0.005)) {
      addIssue(
        issues,
        'numeric_mismatch',
        `상관계수(r = ${rm[1]})가 실제 상관행렬 값(${pairValues.map((v) => fmtNum(v, 3)).join(', ')})과 일치하지 않습니다.`
      );
    }
  }

  // Max |r| & multicollinearity claim
  if (Number.isFinite(maxAbsR)) {
    const maxMatch = text.match(/상관계수의\s*절댓값\s*최댓값은\s*([+-]?\d*\.?\d+)/);
    if (maxMatch) {
      const val = parseStatFloat(maxMatch[1]);
      if (Number.isFinite(val) && Math.abs(val - maxAbsR) > 0.005) {
        addIssue(
          issues,
          'numeric_mismatch',
          `최대 상관계수 불일치: 문장(${maxMatch[1]}) ≠ 실제(${fmtNum(maxAbsR, 3)})`
        );
      }
    }
    if (/기준치\(?\.?85\)?\s*미만|다중공선성\s*우려가\s*없/.test(text) && maxAbsR >= 0.85) {
      addIssue(
        issues,
        'significance_error',
        `최대 상관계수(|r| = ${fmtNum(maxAbsR, 3)})가 기준(.85) 이상임에도 다중공선성 우려가 없다고 서술했습니다.`
      );
    }
  }

  // Normality check
  const skews = validComps.map((c) => Math.abs(c.skewness)).filter(Number.isFinite);
  const kurts = validComps.map((c) => Math.abs(c.kurtosis)).filter(Number.isFinite);
  if (skews.length && kurts.length) {
    const maxSkew = Math.max(...skews);
    const maxKurt = Math.max(...kurts);
    if (/정규분포\s*가정\s*기준을\s*충족|정규성\s*기준.*충족/.test(text) && (maxSkew >= 2 || maxKurt >= 7)) {
      addIssue(
        issues,
        'significance_error',
        `최대 |왜도|(${fmtNum(maxSkew, 2)}) 또는 |첨도|(${fmtNum(maxKurt, 2)})가 정규성 기준(|왜도|<2, |첨도|<7)을 초과합니다.`
      );
    }
  }

  checkPValueInequalities(text, pairPs, issues);

  return {
    missingStats: validComps.length === 0 || names.length < 2,
    actualSummary: `${validComps.map((c) => `${c.name}(M=${fmtNum(c.mean, 2)}, SD=${fmtNum(c.sd, 2)})`).join(', ')} · 최대 |r|=${fmtNum(maxAbsR, 3)}`,
    criteria,
  };
}

function verifyRegressionSection(
  text: string,
  bundle: AnalysisBundle,
  hypothesis: HypothesisConfig,
  constructs: ConstructMapping[],
  issues: VerificationIssueDetail[]
): { missingStats: boolean; actualSummary: string; criteria: string[] } {
  const regs = bundle.regressions;
  const criteria = [
    '모형 적합도(F, p < .05) 및 수정된 R² 일치',
    '개별 예측변수 계수(B, β, t, p < .05) 및 부호(+/-) 일치',
    '가설 판정 기준: 모형 유의 + 전체 독립 채택 / 일부 유의 부분 채택 / 비유의 기각',
    '독립변수(X) → 종속변수(Y) 방향 및 횡단 회귀 인과표현 제한',
  ];

  if (!regs.length) {
    if (/회귀모형|회귀분석|R²|β\s*=|F\s*=/.test(text)) {
      addIssue(
        issues,
        'unanalyzed_content',
        '산출된 회귀분석 모형이 없음에도 문장에서 회귀계수 및 가설 검정 결과를 서술했습니다.'
      );
    }
    return {
      missingStats: true,
      actualSummary: '회귀분석 결과가 산출되지 않았습니다.',
      criteria,
    };
  }

  // Rule ⑦ control variables hallucination
  if (
    /통제변수(?:\s*\([^)]+\)|\s+[가-힣A-Za-z0-9_]+)?[를을]?\s*(?:통제한\s*상태에서|투입한|투입하여|통제하여)/.test(text) &&
    (hypothesis.controls ?? []).length === 0
  ) {
    addIssue(
      issues,
      'unanalyzed_content',
      '실제 연구모형에 통제변수가 설정되지 않았으나 문장에서 통제변수를 투입했다고 서술했습니다.'
    );
  }

  // Check if text mentions an unanalyzed hypothesis ID like H1/H2/H3 not in bundle.regressions
  const mentionedHyps = Array.from(new Set(Array.from(text.matchAll(/\b(H\d+)\b/g)).map((m) => m[1])));
  for (const mh of mentionedHyps) {
    if (!regs.some((r) => r.hypothesis === mh || r.id === mh)) {
      addIssue(
        issues,
        'unanalyzed_content',
        `가설 ${mh}에 대한 회귀분석 결과가 존재하지 않으나 문장에서 ${mh} 결과를 서술했습니다.`
      );
    }
  }

  // Partition text by hypothesis blocks when possible so H1 numbers are checked against H1 only!
  const chunks = text.split(/\n+/).filter((c) => c.trim().length > 0);
  const allConstructNames = new Set(constructs.map((c) => c.name));

  for (const reg of regs) {
    // Find chunks specifically belonging to this hypothesis
    const hypRegex = new RegExp(`\\b${escapeRegExp(reg.hypothesis)}\\b`);
    const regChunks = chunks.filter((ch) => hypRegex.test(ch));
    const scopeText = regChunks.length ? regChunks.join('\n') : regs.length === 1 ? text : '';
    if (!scopeText) continue;

    const verdict = getHypothesisVerdict(reg);
    const modelSig = reg.anova.p < 0.05;
    const ctrlSet = new Set(reg.controls ?? []);
    const focalPredictors = reg.coeffs.filter((c) => c.name !== '(상수)' && !ctrlSet.has(c.name));

    // Rule ①: R², adjR2, F, DF
    for (const m of scopeText.matchAll(/\bR²\s*=\s*([+-]?\d*\.?\d+)/g)) {
      // Skip if immediately preceded by "수정된 " or "adj."
      const idx = m.index ?? 0;
      const prefix = scopeText.slice(Math.max(0, idx - 12), idx);
      if (/수정된\s*$|adj\.?\s*$/i.test(prefix)) continue;
      const val = parseStatFloat(m[1]);
      if (Number.isFinite(val) && Math.abs(val - reg.r2) > 0.005) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${reg.hypothesis} R² 불일치: 문장(${m[1]}) ≠ 실제(${fmtNum(reg.r2, 3)})`
        );
      }
    }
    for (const m of scopeText.matchAll(/(?:수정된\s*R²|adj\.?\s*R²)\s*(?:은|는|=)?\s*([+-]?\d*\.?\d+)/gi)) {
      const val = parseStatFloat(m[1]);
      if (Number.isFinite(val) && Math.abs(val - reg.adjR2) > 0.005) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${reg.hypothesis} 수정된 R² 불일치: 문장(${m[1]}) ≠ 실제(${fmtNum(reg.adjR2, 3)})`
        );
      }
    }
    for (const m of scopeText.matchAll(/분산의\s*([+-]?\d+\.?\d*)%를\s*설명/g)) {
      const val = parseStatFloat(m[1]);
      const pct = reg.adjR2 * 100;
      if (Number.isFinite(val) && Math.abs(val - pct) > 0.15) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${reg.hypothesis} 설명력(%) 불일치: 문장(${m[1]}%) ≠ 실제(${pct.toFixed(1)}%)`
        );
      }
    }
    for (const m of scopeText.matchAll(/\bF(?:\(\s*(\d+)\s*,\s*(\d+)\s*\))?\s*=\s*([+-]?[\d,]+\.?\d*)/g)) {
      if (m[1] && parseInt(m[1], 10) !== reg.anova.dfReg) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${reg.hypothesis} F 자유도 df1 불일치: 문장(${m[1]}) ≠ 실제(${reg.anova.dfReg})`
        );
      }
      if (m[2] && parseInt(m[2], 10) !== reg.anova.dfRes) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${reg.hypothesis} F 자유도 df2 불일치: 문장(${m[2]}) ≠ 실제(${reg.anova.dfRes})`
        );
      }
      const val = parseStatFloat(m[3]);
      if (Number.isFinite(val) && Math.abs(val - reg.anova.f) > 0.05) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${reg.hypothesis} F값 불일치: 문장(${m[3]}) ≠ 실제(${fmtNum(reg.anova.f, 2)})`
        );
      }
    }

    // Predictor-scoped B, beta, t, p
    const psInScope = [reg.anova.p, ...focalPredictors.map((c) => c.p)];
    for (const c of focalPredictors) {
      const predRegex = new RegExp(`${escapeRegExp(c.name)}\\(([^)]+)\\)`, 'g');
      let pm: RegExpExecArray | null;
      while ((pm = predRegex.exec(scopeText)) !== null) {
        const inside = pm[1];
        const bM = inside.match(/\bB\s*=\s*([+-]?\d*\.?\d+)/);
        if (bM) {
          const bv = parseStatFloat(bM[1]);
          if (Number.isFinite(bv) && Math.abs(bv - c.b) > 0.005) {
            addIssue(
              issues,
              'numeric_mismatch',
              `${reg.hypothesis} ${c.name} 비표준화계수(B) 불일치: 문장(${bM[1]}) ≠ 실제(${fmtNum(c.b, 3)})`
            );
          }
          if (Number.isFinite(bv) && bv * c.b < 0 && Math.abs(c.b) > 0.005) {
            addIssue(
              issues,
              'direction_sign_error',
              `${reg.hypothesis} ${c.name} 계수(B) 부호 오류: 문장(${bM[1]}) vs 실제(${fmtNum(c.b, 3)})`
            );
          }
        }
        const betaM = inside.match(/β\s*=\s*([+-]?\d*\.?\d+)/);
        if (betaM && c.beta !== null) {
          const betav = parseStatFloat(betaM[1]);
          if (Number.isFinite(betav) && Math.abs(betav - c.beta) > 0.005) {
            addIssue(
              issues,
              'numeric_mismatch',
              `${reg.hypothesis} ${c.name} 표준화계수(β) 불일치: 문장(${betaM[1]}) ≠ 실제(${fmtNum(c.beta, 3)})`
            );
          }
          if (Number.isFinite(betav) && betav * c.beta < 0 && Math.abs(c.beta) > 0.005) {
            addIssue(
              issues,
              'direction_sign_error',
              `${reg.hypothesis} ${c.name} 표준화계수(β) 부호 오류: 문장(${betaM[1]}) vs 실제(${fmtNum(c.beta, 3)})`
            );
          }
        }
        const tM = inside.match(/\bt\s*=\s*([+-]?\d*\.?\d+)/);
        if (tM) {
          const tv = parseStatFloat(tM[1]);
          if (Number.isFinite(tv) && Math.abs(tv - c.t) > 0.05) {
            addIssue(
              issues,
              'numeric_mismatch',
              `${reg.hypothesis} ${c.name} t값 불일치: 문장(${tM[1]}) ≠ 실제(${fmtNum(c.t, 2)})`
            );
          }
        }
        const pM = inside.match(/\bp\s*=\s*([+-]?\d*\.?\d+)/);
        if (pM) {
          const pv = parseStatFloat(pM[1]);
          if (Number.isFinite(pv) && Math.abs(pv - c.p) > 0.005) {
            addIssue(
              issues,
              'numeric_mismatch',
              `${reg.hypothesis} ${c.name} p값 불일치: 문장(${pM[1]}) ≠ 실제(${fmtNum(c.p, 3)})`
            );
          }
        }
        if (/\bp\s*<\s*\.?001\b/.test(inside) && c.p >= 0.001) {
          addIssue(
            issues,
            'significance_error',
            `${reg.hypothesis} ${c.name}에 'p < .001'로 표기했으나 실제 p = ${fmtNum(c.p, 3)}입니다.`
          );
        }
      }

      // Rule ② & ③: check directional/significance claims for sentence clauses mentioning c.name
      const sentences = scopeText.split(/(?<=[.다])\s+/);
      for (const sent of sentences) {
        if (!sent.includes(c.name)) continue;
        // Skip sentences listing multiple variables where non-sig and sig are clearly separated unless single variable clause
        if (/유의한\s*정\(\+\)의\s*영향|정\(\+\)의\s*유의한\s*영향/.test(sent) && !/반면/.test(sent)) {
          if (c.p >= 0.05) {
            addIssue(
              issues,
              'significance_error',
              `${reg.hypothesis}에서 ${c.name}(p = ${fmtNum(c.p, 3)})은 통계적으로 유의하지 않으나 유의한 영향을 미쳤다고 서술했습니다.`
            );
          } else if (c.b < 0 && focalPredictors.filter((fp) => fp.p < 0.05 && sent.includes(fp.name)).every((fp) => fp.b < 0)) {
            addIssue(
              issues,
              'direction_sign_error',
              `${reg.hypothesis} ${c.name}의 계수 부호가 음수(B = ${fmtNum(c.b, 3)})임에도 '정(+)의 영향'으로 반대로 서술했습니다.`
            );
          }
        }
        if (/유의한\s*부\(-\)의\s*영향|부\(-\)의\s*유의한\s*영향/.test(sent) && !/반면/.test(sent)) {
          if (c.p >= 0.05) {
            addIssue(
              issues,
              'significance_error',
              `${reg.hypothesis}에서 ${c.name}(p = ${fmtNum(c.p, 3)})은 통계적으로 유의하지 않으나 유의한 영향을 미쳤다고 서술했습니다.`
            );
          } else if (c.b >= 0 && focalPredictors.filter((fp) => fp.p < 0.05 && sent.includes(fp.name)).every((fp) => fp.b >= 0)) {
            addIssue(
              issues,
              'direction_sign_error',
              `${reg.hypothesis} ${c.name}의 계수 부호가 양수(B = ${fmtNum(c.b, 3)})임에도 '부(-)의 영향'으로 반대로 서술했습니다.`
            );
          }
        }
        if (/반면[^.]{0,120}?유의한\s*영향을\s*미치지\s*않/.test(sent)) {
          const afterBanmyeon = sent.split('반면')[1] ?? '';
          if (afterBanmyeon.includes(c.name) && c.p < 0.05) {
            addIssue(
              issues,
              'significance_error',
              `${reg.hypothesis}에서 ${c.name}(p = ${fmtNum(c.p, 3)})은 통계적으로 유의함에도 비유의 변수로 잘못 분류했습니다.`
            );
          }
        } else if (
          /유의하지\s*않은(?:\s*(?:정\(\+\)|부\(-\))의)?\s*영향|유의한\s*영향을\s*미치지\s*않/.test(sent) &&
          c.p < 0.05 &&
          focalPredictors.filter((fp) => sent.includes(fp.name)).every((fp) => fp.p < 0.05)
        ) {
          addIssue(
            issues,
            'significance_error',
            `${reg.hypothesis}에서 ${c.name}(${c.p < 0.001 ? 'p < .001' : `p = ${fmtNum(c.p, 3)}`})은 통계적으로 유의함에도 유의하지 않다고 서술했습니다.`
          );
        }
      }
    }

    // Rule ② Model-level significance
    if (/회귀모형은\s*통계적으로\s*유의하였으며|영향\s*모형은\s*유의하였으며/.test(scopeText) && !modelSig) {
      addIssue(
        issues,
        'significance_error',
        `${reg.hypothesis} 모형 F값의 유의확률(p = ${fmtNum(reg.anova.p, 3)})이 .05 이상이나 모형이 유의하다고 해석했습니다.`
      );
    }
    if (
      /모형\s*적합도는\s*통계적으로\s*유의하지\s*않(?:았으며|았다)|회귀모형은\s*통계적으로\s*유의하지\s*않(?:았으며|았다)/.test(
        scopeText
      ) &&
      modelSig
    ) {
      addIssue(
        issues,
        'significance_error',
        `${reg.hypothesis} 모형 F값의 유의확률(p = ${fmtNum(reg.anova.p, 3)})이 .05 미만으로 유의함에도 유의하지 않다고 서술했습니다.`
      );
    }

    // Rule ⑤ Hypothesis verdict mismatch
    const verdictMatches = Array.from(
      scopeText.matchAll(
        new RegExp(
          `(?:\\[${escapeRegExp(reg.hypothesis)}\\s*·\\s*(부분\\s*채택|채택|기각)\\]|가설\\s*${escapeRegExp(reg.hypothesis)}[은는이가]?\\s*(부분\\s*채택|채택|기각)되었)`,
          'g'
        )
      )
    );
    for (const vm of verdictMatches) {
      const claimed = (vm[1] || vm[2] || '').replace(/\s+/g, ' ').trim();
      if (claimed && claimed !== verdict) {
        addIssue(
          issues,
          'hypothesis_mismatch',
          `${reg.hypothesis} 가설 판정 오류: 문장은 '${claimed}'으로 서술했으나 실제 통계 기준 판정은 '${verdict}'입니다.`
        );
      }
    }

    // Rule ④ Variable role swap checks
    // Pattern 1: X을/를 독립변수로, Y을/를 종속변수로
    const roleAssign = scopeText.match(/(.+?)[을를]\s*독립변수로,\s*(.+?)[을를]\s*종속변수로/);
    if (roleAssign) {
      const claimedIndep = roleAssign[1];
      const claimedDep = roleAssign[2].trim();
      if (claimedDep !== reg.dependent && allConstructNames.has(claimedDep)) {
        addIssue(
          issues,
          'variable_role_swap',
          `${reg.hypothesis} 변수 역할 오류: 문장은 종속변수를 '${claimedDep}'로 서술했으나 실제 종속변수는 '${reg.dependent}'입니다.`
        );
      }
      if (claimedIndep.includes(reg.dependent) && !reg.independents.includes(reg.dependent)) {
        addIssue(
          issues,
          'variable_role_swap',
          `${reg.hypothesis} 독립·종속변수 위치 오류: 실제 종속변수 '${reg.dependent}'가 독립변수 위치에 서술되었습니다.`
        );
      }
    }
    // Pattern 2: A → B arrow
    for (const arrowM of scopeText.matchAll(/([가-힣A-Za-z0-9_,\s]+?)\s*→\s*([가-힣A-Za-z0-9_]+)/g)) {
      const left = arrowM[1].replace(/\[[^\]]+\]\s*/, '').trim();
      const right = arrowM[2].trim();
      if (allConstructNames.has(right) && right !== reg.dependent && reg.independents.some((ind) => right === ind) && left.includes(reg.dependent)) {
        addIssue(
          issues,
          'variable_role_swap',
          `${reg.hypothesis} 경로 방향 역전: '${left} → ${right}'는 실제 모형('${reg.independents.join(', ')} → ${reg.dependent}')과 독립·종속변수 위치가 반대입니다.`
        );
      }
    }
    // Pattern 3: `Y가 X에 유의한 영향` where Y is dependent and X is an independent
    for (const infM of scopeText.matchAll(/([가-힣A-Za-z0-9_]+)(?:이\(가\)|은\(는\)|[이가은는])\s*([가-힣A-Za-z0-9_]+)에\s*(?:통계적으로\s*)?(?:직접적으로\s*)?(?:유의한|정\(\+\)의|부\(-\)의|미치는)\s*영향/g)) {
      const subj = infM[1].trim();
      const target = infM[2].trim();
      if (subj === reg.dependent && reg.independents.includes(target)) {
        addIssue(
          issues,
          'variable_role_swap',
          `${reg.hypothesis} 독립·종속변수 뒤바뀜: 종속변수 '${subj}'가 독립변수 '${target}'에 영향을 미친다고 반대로 서술했습니다.`
        );
      }
    }

    checkPValueInequalities(scopeText, psInScope, issues);
  }

  return {
    missingStats: false,
    actualSummary: regs
      .map(
        (r) =>
          `${r.hypothesis}(${r.label}): 수정R²=${fmtNum(r.adjR2, 3)}, F=${fmtNum(r.anova.f, 2)}(p=${r.anova.p < 0.001 ? '< .001' : fmtNum(r.anova.p, 3)}), 판정=${getHypothesisVerdict(r)}`
      )
      .join(' | '),
    criteria,
  };
}

function verifyMediationSection(
  text: string,
  bundle: AnalysisBundle,
  hypothesis: HypothesisConfig,
  issues: VerificationIssueDetail[]
): { missingStats: boolean; actualSummary: string; criteria: string[] } {
  const med = bundle.mediation;
  const criteria = [
    '간접효과(a×b) 유의성: p_a < .05, p_b < .05 및 (Sobel p < .05 또는 Boot 95% CI 0 미포함)',
    '완전매개(c 유의 & c’ 비유의) vs 부분매개(c 유의 & c’ 유의) vs 간접효과 유의(c 비유의)',
    '경로 방향: 독립변수(X) → 매개변수(M) → 종속변수(Y) 순서 일치',
  ];

  if (!med || !med.step4Regression || !med.paths.length) {
    if (/매개효과|Sobel|부트스트래핑|간접효과|완전매개|부분매개/i.test(text)) {
      addIssue(
        issues,
        'unanalyzed_content',
        '매개효과 분석이 실행되지 않았음에도(매개변수 미지정 또는 표본 부족) 문장에서 매개검정 결과를 서술했습니다.'
      );
    }
    return {
      missingStats: true,
      actualSummary: '매개효과 분석 결과가 없습니다.',
      criteria,
    };
  }

  const s4 = med.step4Regression;
  const chunks = text.split(/\n+/).filter((c) => c.trim().length > 0);
  const headerChunk = chunks[0] ?? text;

  // Check 4th step model adjR2, F, ΔR2, ΔF, and significance
  const adjM = headerChunk.match(/수정된\s*R²\)\s*은\s*([+-]?\d*\.?\d+)/);
  if (adjM && Math.abs(parseStatFloat(adjM[1]) - s4.adjR2) > 0.005) {
    addIssue(
      issues,
      'numeric_mismatch',
      `매개 4단계 모형 수정 R² 불일치: 문장(${adjM[1]}) ≠ 실제(${fmtNum(s4.adjR2, 3)})`
    );
  }
  if (/4단계\s*모형의?\s*설명력[^.]*으로\s*유의하였/.test(headerChunk) && s4.anova.p >= 0.05) {
    addIssue(
      issues,
      'significance_error',
      `매개 4단계 모형의 유의확률(p = ${fmtNum(s4.anova.p, 3)})이 .05 이상이나 유의하였다고 서술했습니다.`
    );
  }
  if (/4단계\s*모형의?\s*설명력[^.]*유의하지\s*않/.test(headerChunk) && s4.anova.p < 0.05) {
    addIssue(
      issues,
      'significance_error',
      `매개 4단계 모형의 유의확률(${s4.anova.p < 0.001 ? 'p < .001' : `p = ${fmtNum(s4.anova.p, 3)}`})이 .05 미만이나 유의하지 않았다고 서술했습니다.`
    );
  }
  const fM = headerChunk.match(/\bF\s*=\s*([+-]?[\d,]+\.?\d*)/);
  if (fM && Math.abs(parseStatFloat(fM[1]) - s4.anova.f) > 0.05) {
    addIssue(
      issues,
      'numeric_mismatch',
      `매개 4단계 모형 F값 불일치: 문장(${fM[1]}) ≠ 실제(${fmtNum(s4.anova.f, 2)})`
    );
  }
  if (med.r2ChangeFromH3 !== null) {
    const drM = text.match(/ΔR²\s*=\s*([+-]?\d*\.?\d+)/);
    if (drM && Math.abs(parseStatFloat(drM[1]) - med.r2ChangeFromH3) > 0.005) {
      addIssue(
        issues,
        'numeric_mismatch',
        `매개 4단계 ΔR² 불일치: 문장(${drM[1]}) ≠ 실제(${fmtNum(med.r2ChangeFromH3, 3)})`
      );
    }
  }
  const medCoeff = s4.coeffs.find((c) => c.name === hypothesis.mediator);
  const headerPs = [
    s4.anova.p,
    ...(med.pChangeFromH3 !== null ? [med.pChangeFromH3] : []),
    ...(medCoeff ? [medCoeff.p] : []),
  ];
  checkPValueInequalities(headerChunk, headerPs, issues);

  // Rule ④ Mediator/Dependent/Independent order check
  const medOrderM = text.match(/([가-힣A-Za-z0-9_]+)[이이가]\s*([가-힣A-Za-z0-9_]+)[을를]\s*경유하여\s*([가-힣A-Za-z0-9_]+)에\s*미치는/);
  if (medOrderM) {
    const [, claimedX, claimedM, claimedY] = medOrderM;
    if (claimedM.trim() !== hypothesis.mediator) {
      addIssue(
        issues,
        'variable_role_swap',
        `매개변수 위치 오류: 문장은 '${claimedM}'을(를) 매개변수로 서술했으나 실제 매개변수는 '${hypothesis.mediator}'입니다.`
      );
    }
    if (claimedY.trim() !== hypothesis.dependent) {
      addIssue(
        issues,
        'variable_role_swap',
        `종속변수 위치 오류: 문장은 '${claimedY}'을(를) 종속변수로 서술했으나 실제 종속변수는 '${hypothesis.dependent}'입니다.`
      );
    }
    if (claimedX.trim() === hypothesis.dependent) {
      addIssue(
        issues,
        'variable_role_swap',
        `독립·종속변수 위치 오류: 종속변수 '${claimedX}'가 매개모형의 독립변수 위치에 서술되었습니다.`
      );
    }
  }

  // Per-path checks
  const pathPool = chunks.length > 1 ? chunks.slice(1) : chunks;
  for (const p of med.paths) {
    const pathChunks = pathPool.filter((c) => c.includes(p.independent));
    const scope = pathChunks.length ? pathChunks.join('\n') : med.paths.length === 1 ? text : '';
    if (!scope) continue;

    // Indirect effect, Sobel Z, Boot CI
    const indM = scope.match(/(?:간접효과(?:는|\s*\(B\s*=|\s*ab\s*=)\s*)([+-]?\d*\.?\d+)/);
    if (indM) {
      const val = parseStatFloat(indM[1]);
      if (Number.isFinite(val) && Math.abs(val - p.indirectEffect) > 0.005) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${p.independent} 간접효과(a×b) 불일치: 문장(${indM[1]}) ≠ 실제(${fmtNum(p.indirectEffect, 3)})`
        );
      }
    }
    const sobelM = scope.match(/Sobel\s*Z\s*=\s*([+-]?\d*\.?\d+)/i);
    if (sobelM) {
      const val = parseStatFloat(sobelM[1]);
      if (Number.isFinite(val) && Math.abs(val - p.sobelZ) > 0.05) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${p.independent} Sobel Z 불일치: 문장(${sobelM[1]}) ≠ 실제(${fmtNum(p.sobelZ, 2)})`
        );
      }
    }
    const ciM = scope.match(/\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\]/);
    if (ciM) {
      const lo = parseStatFloat(ciM[1]);
      const hi = parseStatFloat(ciM[2]);
      if (
        Number.isFinite(lo) &&
        Number.isFinite(hi) &&
        (Math.abs(lo - p.bootCiLow) > 0.015 || Math.abs(hi - p.bootCiHigh) > 0.015)
      ) {
        addIssue(
          issues,
          'numeric_mismatch',
          `${p.independent} Bootstrap 95% CI 불일치: 문장([${ciM[1]}, ${ciM[2]}]) ≠ 실제([${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}])`
        );
      }
      if (/0을\s*포함하지\s*않아/.test(scope) && p.bootCiLow <= 0 && p.bootCiHigh >= 0) {
        addIssue(
          issues,
          'med_mod_criteria_error',
          `${p.independent} 경로의 실제 Bootstrap 95% 신뢰구간([${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}])이 0을 포함하므로 간접효과가 유의하다고 판정할 수 없습니다.`
        );
      }
    }

    // Rule ⑤ & ⑥ Mediation status criteria
    const statusLabel =
      p.status === 'full'
        ? '완전매개'
        : p.status === 'partial'
          ? '부분매개'
          : p.status === 'indirect_only'
            ? '간접효과 유의'
            : '매개효과 없음';

    if (/완전매개/.test(scope) && p.status !== 'full') {
      addIssue(
        issues,
        'med_mod_criteria_error',
        `${p.independent} 경로를 '완전매개'로 서술했으나 실제 판단 기준(${
          p.status === 'partial'
            ? `직접효과 c' p=${fmtNum(p.pCPrime, 3)} < .05이므로 부분매개`
            : `실제 판정: ${statusLabel}`
        })에 부합하지 않습니다.`
      );
    }
    if (/부분매개/.test(scope) && p.status !== 'partial') {
      addIssue(
        issues,
        'med_mod_criteria_error',
        `${p.independent} 경로를 '부분매개'로 서술했으나 실제 판정은 '${statusLabel}'(c p=${fmtNum(p.pCTotal, 3)}, c' p=${fmtNum(p.pCPrime, 3)})입니다.`
      );
    }
    if (/매개효과가\s*통계적으로\s*유의하지\s*않았다|매개효과\s*없음/.test(scope) && p.status !== 'none') {
      addIssue(
        issues,
        'med_mod_criteria_error',
        `${p.independent} 경로는 Sobel(p=${fmtNum(p.sobelP, 3)}) 및 Boot CI 기준으로 '${statusLabel}'이 확인되었으나 매개효과가 없다고 서술했습니다.`
      );
    }
    if (/매개효과가\s*통계적으로\s*유의한\s*것으로\s*지지/.test(scope) && p.status === 'none') {
      addIssue(
        issues,
        'med_mod_criteria_error',
        `${p.independent} 경로는 간접효과 유의 기준(pA<.05, pB<.05 및 Sobel/Boot CI)을 충족하지 못했으나 매개효과가 지지되었다고 서술했습니다.`
      );
    }

    const pathAllowedPs = [p.pA, p.pB, p.pCTotal, p.pCPrime, p.sobelP];
    if (scope === text || chunks.length <= 1 || pathChunks.length === 0) {
      pathAllowedPs.push(...headerPs);
    }
    checkPValueInequalities(scope, pathAllowedPs, issues);
  }

  return {
    missingStats: false,
    actualSummary: med.paths
      .map(
        (p) =>
          `${p.independent}→${p.mediator}→${p.dependent}: ab=${fmtNum(p.indirectEffect, 3)}, Sobel Z=${fmtNum(p.sobelZ, 2)}(p=${p.sobelP < 0.001 ? '< .001' : fmtNum(p.sobelP, 3)}), CI[${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}], 판정=${p.status}`
      )
      .join(' | '),
    criteria,
  };
}

function verifyModerationSection(
  text: string,
  bundle: AnalysisBundle,
  issues: VerificationIssueDetail[]
): { missingStats: boolean; actualSummary: string; criteria: string[] } {
  const mod = bundle.moderation;
  const criteria = [
    '위계적 2단계 설명력 변화량 ΔR²·ΔF 유의확률(p < .05) 충족',
    '상호작용항(X×W) 회귀계수(B, t, p < .05) 동시 충족',
    '상호작용 계수 부호(+ 강화 / - 완화)와 해석 방향 일치',
  ];

  if (!mod) {
    if (/조절효과|상호작용항|ΔR²|평균중심화|단순기울기/i.test(text)) {
      addIssue(
        issues,
        'unanalyzed_content',
        '조절효과 분석이 실행되지 않았음에도 문장에서 상호작용항·ΔR²·조절효과 결과를 서술했습니다.'
      );
    }
    return {
      missingStats: true,
      actualSummary: '조절효과 분석 결과가 없습니다.',
      criteria,
    };
  }

  const drM = text.match(/ΔR²\s*=?\s*\(?\s*([+-]?\d*\.?\d+)/);
  if (drM && Math.abs(parseStatFloat(drM[1]) - mod.r2Change) > 0.005) {
    addIssue(
      issues,
      'numeric_mismatch',
      `조절효과 ΔR² 불일치: 문장(${drM[1]}) ≠ 실제(${fmtNum(mod.r2Change, 3)})`
    );
  }
  const dfM = text.match(/ΔF\s*=\s*([+-]?[\d,]+\.?\d*)/);
  if (dfM && Math.abs(parseStatFloat(dfM[1]) - mod.fChange) > 0.05) {
    addIssue(
      issues,
      'numeric_mismatch',
      `조절효과 ΔF 불일치: 문장(${dfM[1]}) ≠ 실제(${fmtNum(mod.fChange, 2)})`
    );
  }

  // Interaction B, beta, t
  const interScope = text.match(/상호작용항[^.]*\(([^)]+)\)/)?.[1] ?? text;
  const bM = interScope.match(/\bB\s*=\s*([+-]?\d*\.?\d+)/);
  if (bM) {
    const bv = parseStatFloat(bM[1]);
    if (Number.isFinite(bv) && Math.abs(bv - mod.interactionCoeff.b) > 0.005) {
      addIssue(
        issues,
        'numeric_mismatch',
        `상호작용항 계수(B) 불일치: 문장(${bM[1]}) ≠ 실제(${fmtNum(mod.interactionCoeff.b, 3)})`
      );
    }
    if (Number.isFinite(bv) && bv * mod.interactionCoeff.b < 0 && Math.abs(mod.interactionCoeff.b) > 0.005) {
      addIssue(
        issues,
        'direction_sign_error',
        `상호작용항 계수(B) 부호 오류: 문장(${bM[1]}) vs 실제(${fmtNum(mod.interactionCoeff.b, 3)})`
      );
    }
  }
  const betaM = interScope.match(/β\s*=\s*([+-]?\d*\.?\d+)/);
  if (betaM && mod.interactionCoeff.beta !== null) {
    const betav = parseStatFloat(betaM[1]);
    if (Number.isFinite(betav) && Math.abs(betav - mod.interactionCoeff.beta) > 0.005) {
      addIssue(
        issues,
        'numeric_mismatch',
        `상호작용항 표준화계수(β) 불일치: 문장(${betaM[1]}) ≠ 실제(${fmtNum(mod.interactionCoeff.beta, 3)})`
      );
    }
  }
  const tM = interScope.match(/\bt\s*=\s*([+-]?\d*\.?\d+)/);
  if (tM) {
    const tv = parseStatFloat(tM[1]);
    if (Number.isFinite(tv) && Math.abs(tv - mod.interactionCoeff.t) > 0.05) {
      addIssue(
        issues,
        'numeric_mismatch',
        `상호작용항 t값 불일치: 문장(${tM[1]}) ≠ 실제(${fmtNum(mod.interactionCoeff.t, 2)})`
      );
    }
  }

  // Rule ⑤ & ⑥ Moderation criteria: both ΔR² (pChange < .05) and interactionCoeff.p < .05
  const strictSig = mod.pChange < 0.05 && mod.interactionCoeff.p < 0.05;
  const claimsSig = /조절효과\s*채택|조절역할을\s*수행|조절하는\s*것으로\s*확인|상호작용항이\s*유의하였으며/.test(text);
  const claimsNonSig = /조절효과\s*기각|조절효과는\s*지지되지\s*않았|통계적으로\s*유의하지\s*않았다/.test(text);

  if (claimsSig && !strictSig) {
    addIssue(
      issues,
      'med_mod_criteria_error',
      `2단계 ΔR² 유의확률(p=${fmtNum(mod.pChange, 3)}) 및 상호작용항(p=${fmtNum(mod.interactionCoeff.p, 3)}) 기준을 충족하지 못했으나 조절효과가 유의하다고 서술했습니다.`
    );
  }
  if (claimsNonSig && strictSig) {
    addIssue(
      issues,
      'med_mod_criteria_error',
      `ΔF(p=${fmtNum(mod.pChange, 3)})와 상호작용항(p=${fmtNum(mod.interactionCoeff.p, 3)})이 모두 .05 미만으로 유의하나 조절효과가 기각되었다고 서술했습니다.`
    );
  }

  // Rule ③ Sign / direction check (강화 정(+) vs 완화 부(-))
  if (/강화하는\s*정\(\+\)/.test(text) && mod.interactionCoeff.b < 0) {
    addIssue(
      issues,
      'direction_sign_error',
      `상호작용항 계수가 부(-)의 값(B = ${fmtNum(mod.interactionCoeff.b, 3)})임에도 '강화하는 정(+)' 방향으로 잘못 해석했습니다.`
    );
  }
  if (/완화하는\s*부\(-\)/.test(text) && mod.interactionCoeff.b >= 0) {
    addIssue(
      issues,
      'direction_sign_error',
      `상호작용항 계수가 정(+)의 값(B = ${fmtNum(mod.interactionCoeff.b, 3)})임에도 '완화하는 부(-)' 방향으로 잘못 해석했습니다.`
    );
  }

  // Rule ④ Variable order check in X×W → Y
  const arrowM = text.match(/([가-힣A-Za-z0-9_]+)×([가-힣A-Za-z0-9_]+)\s*→\s*([가-힣A-Za-z0-9_]+)/);
  if (arrowM) {
    const [, cx, cw, cy] = arrowM;
    if (cy !== mod.yName || cx === mod.yName) {
      addIssue(
        issues,
        'variable_role_swap',
        `조절모형 경로 방향 오류: 문장('${cx}×${cw} → ${cy}') ≠ 실제('${mod.xName}×${mod.wName} → ${mod.yName}')`
      );
    }
  }

  checkPValueInequalities(text, [mod.step1.anova.p, mod.pChange, mod.interactionCoeff.p], issues);

  return {
    missingStats: false,
    actualSummary: `${mod.xName}×${mod.wName}→${mod.yName}: ΔR²=${fmtNum(mod.r2Change, 3)}, ΔF=${fmtNum(mod.fChange, 2)}(p=${mod.pChange < 0.001 ? '< .001' : fmtNum(mod.pChange, 3)}), B=${fmtNum(mod.interactionCoeff.b, 3)}(p=${mod.interactionCoeff.p < 0.001 ? '< .001' : fmtNum(mod.interactionCoeff.p, 3)}), 판정=${strictSig ? '채택' : '기각'}`,
    criteria,
  };
}

function verifyConclusionSection(
  text: string,
  bundle: AnalysisBundle,
  hypothesis: HypothesisConfig,
  issues: VerificationIssueDetail[]
): { missingStats: boolean; actualSummary: string; criteria: string[] } {
  const regs = bundle.regressions;
  const criteria = [
    '종합 결론의 H1~H3 가설 채택·부분 채택·기각 여부 일치',
    '매개·조절효과 결론 및 계수 방향(정/부) 일치',
    '미실행 분석 언급 금지 및 인과표현 제한',
  ];

  if (!regs.length) {
    return {
      missingStats: true,
      actualSummary: '회귀/가설 검정 결과가 없어 결론을 검증할 수 없습니다.',
      criteria,
    };
  }

  if (/매개\s*작용|매개경로|완전매개|부분매개/.test(text) && !bundle.mediation) {
    addIssue(
      issues,
      'unanalyzed_content',
      '매개분석이 실행되지 않았으나 종합 결론에 매개효과 결과를 서술했습니다.'
    );
  }
  if (/조절효과/.test(text) && !bundle.moderation) {
    addIssue(
      issues,
      'unanalyzed_content',
      '조절분석이 실행되지 않았으나 종합 결론에 조절효과 결과를 서술했습니다.'
    );
  }

  for (const reg of regs) {
    const verdict = getHypothesisVerdict(reg);
    const pattern = new RegExp(
      `(?:${escapeRegExp(reg.hypothesis)}\\s*(?:이|가)?\\s*(부분\\s*채택|채택|기각)되|\\(${escapeRegExp(reg.hypothesis)}\\s*(부분\\s*채택|채택|기각)\\)|${escapeRegExp(reg.hypothesis)}\\([^)]*,\\s*(부분\\s*채택|채택|기각)\\))`,
      'g'
    );
    for (const m of text.matchAll(pattern)) {
      const claimed = (m[1] || m[2] || m[3] || '').replace(/\s+/g, ' ').trim();
      if (claimed && claimed !== verdict) {
        addIssue(
          issues,
          'hypothesis_mismatch',
          `종합 결론의 ${reg.hypothesis} 판정('${claimed}')이 실제 검정 결과('${verdict}')와 다릅니다.`
        );
      }
    }
  }

  if (bundle.moderation) {
    const modSig = bundle.moderation.pChange < 0.05 && bundle.moderation.interactionCoeff.p < 0.05;
    if (/조절하는\s*것으로\s*확인|조절효과\([^)]*:\s*유의\)/.test(text) && !modSig) {
      addIssue(
        issues,
        'med_mod_criteria_error',
        `실제 조절효과가 비유의(p=${fmtNum(bundle.moderation.pChange, 3)})이나 결론에서 조절효과가 유의하다고 서술했습니다.`
      );
    }
    if (/조절효과[^.]{0,30}유의하지\s*않았|조절효과\([^)]*:\s*비유의\)/.test(text) && modSig) {
      addIssue(
        issues,
        'med_mod_criteria_error',
        `실제 조절효과가 유의(p=${fmtNum(bundle.moderation.pChange, 3)})하나 결론에서 비유의로 서술했습니다.`
      );
    }
  }

  // Check mediator -> dependent direction in H2 conclusion clause
  const h2 = regs.find((r) => r.id === 'H2');
  if (h2) {
    const medCoeff = h2.coeffs.find((c) => c.name !== '(상수)' && !(h2.controls ?? []).includes(c.name));
    if (medCoeff) {
      const h2Clause = text.match(new RegExp(`${escapeRegExp(hypothesis.mediator)}[^.]*?${escapeRegExp(hypothesis.dependent)}[^.]*?\\.`))?.[0];
      if (h2Clause) {
        if (/정\(\+\)의\s*유의한\s*영향/.test(h2Clause) && medCoeff.b < 0) {
          addIssue(issues, 'direction_sign_error', `H2 계수 부호(B=${fmtNum(medCoeff.b, 3)})는 음수이나 결론에서 정(+)의 영향으로 서술했습니다.`);
        }
        if (/부\(-\)의\s*유의한\s*영향/.test(h2Clause) && medCoeff.b >= 0) {
          addIssue(issues, 'direction_sign_error', `H2 계수 부호(B=${fmtNum(medCoeff.b, 3)})는 양수이나 결론에서 부(-)의 영향으로 서술했습니다.`);
        }
      }
    }
  }

  const actualParts = regs.map((r) => `${r.hypothesis}: ${getHypothesisVerdict(r)}`);
  if (bundle.mediation) {
    actualParts.push(
      `매개: ${bundle.mediation.paths.map((p) => `${p.independent}(${p.status})`).join(', ')}`
    );
  }
  if (bundle.moderation) {
    actualParts.push(`조절: ${bundle.moderation.significant ? '유의' : '비유의'}`);
  }

  return {
    missingStats: false,
    actualSummary: actualParts.join(' · '),
    criteria,
  };
}

// ---------- Cross-Check Comparison Builder ----------

function buildIndependentComparisons(
  bundle: AnalysisBundle,
  indep: IndependentComputationResult,
  sectionStatuses: Record<string, VerificationStatus>
): IndependentStatComparisonRow[] {
  const rows: IndependentStatComparisonRow[] = [];
  const tolStrict = 1e-4;

  // 1. EFA
  if (bundle.efa) {
    const appKmo = bundle.efa.kmo;
    const indKmo = indep.efa?.kmo ?? NaN;
    const diff =
      Number.isFinite(appKmo) && Number.isFinite(indKmo) ? Math.abs(appKmo - indKmo) : null;
    const withinTol = diff !== null ? diff <= tolStrict : null;
    const sentStatus = sectionStatuses['efa_rel'] ?? 'unverifiable';
    const finalVerdict: VerificationStatus =
      withinTol === false
        ? 'needs_revision'
        : withinTol === null
          ? 'unverifiable'
          : sentStatus;
    rows.push({
      analysisKey: 'efa',
      analysisLabel: '1. 탐색적 요인분석 (KMO · 요인수)',
      sectionId: 'efa_rel',
      webAppResult: `KMO=${fmtNum(appKmo, 4)}, 요인=${bundle.efa.numFactors}개`,
      independentResult: indep.efa
        ? `KMO=${fmtNum(indKmo, 4)}, 요인=${indep.efa.numFactors}개`
        : '계산 불가',
      differenceSummary: diff !== null ? `ΔKMO = ${diff.toExponential(2)}` : '—',
      maxDiff: diff,
      withinTolerance: withinTol,
      sentenceAccuracy: sentStatus,
      finalVerdict,
    });
  }

  // 2. Reliability
  const finiteRel = bundle.reliability.filter((r) => Number.isFinite(r.alpha));
  if (finiteRel.length > 0) {
    let maxDiff = 0;
    let comparable = 0;
    for (const r of finiteRel) {
      const indR = indep.reliability.find((ir) => ir.name === r.constructName);
      if (indR && Number.isFinite(indR.alpha)) {
        maxDiff = Math.max(maxDiff, Math.abs(r.alpha - indR.alpha));
        comparable++;
      }
    }
    const withinTol = comparable > 0 ? maxDiff <= tolStrict : null;
    const sentStatus = sectionStatuses['efa_rel'] ?? 'unverifiable';
    const finalVerdict: VerificationStatus =
      withinTol === false ? 'needs_revision' : withinTol === null ? 'unverifiable' : sentStatus;
    rows.push({
      analysisKey: 'reliability',
      analysisLabel: '2. 신뢰도 분석 (Cronbach α)',
      sectionId: 'efa_rel',
      webAppResult: finiteRel.map((r) => `${r.constructName}:${fmtNum(r.alpha, 4)}`).join(', '),
      independentResult: indep.reliability
        .filter((r) => Number.isFinite(r.alpha))
        .map((r) => `${r.name}:${fmtNum(r.alpha, 4)}`)
        .join(', '),
      differenceSummary: comparable > 0 ? `최대 Δα = ${maxDiff.toExponential(2)}` : '—',
      maxDiff: comparable > 0 ? maxDiff : null,
      withinTolerance: withinTol,
      sentenceAccuracy: sentStatus,
      finalVerdict,
    });
  }

  // 3. Composites & Correlation
  if (bundle.composites.length > 0 && bundle.correlation.names.length > 1) {
    const pairs: number[] = [];
    for (let i = 0; i < bundle.correlation.names.length; i++) {
      for (let j = i + 1; j < bundle.correlation.names.length; j++) {
        const r = bundle.correlation.matrix[i]?.[j]?.r;
        if (Number.isFinite(r)) pairs.push(Math.abs(r));
      }
    }
    const appMaxR = pairs.length ? Math.max(...pairs) : NaN;
    const diff = Number.isFinite(appMaxR) ? Math.abs(appMaxR - indep.maxAbsR) : null;
    const withinTol = diff !== null ? diff <= tolStrict : null;
    const sentStatus = sectionStatuses['desc_corr'] ?? 'unverifiable';
    const finalVerdict: VerificationStatus =
      withinTol === false ? 'needs_revision' : withinTol === null ? 'unverifiable' : sentStatus;
    rows.push({
      analysisKey: 'correlation',
      analysisLabel: '3~4. 기술통계 · 상관분석 (최대 |r|)',
      sectionId: 'desc_corr',
      webAppResult: `최대 |r| = ${fmtNum(appMaxR, 4)} (N변수=${bundle.composites.length})`,
      independentResult: `최대 |r| = ${fmtNum(indep.maxAbsR, 4)} (N변수=${indep.composites.length})`,
      differenceSummary: diff !== null ? `Δ|r| = ${diff.toExponential(2)}` : '—',
      maxDiff: diff,
      withinTolerance: withinTol,
      sentenceAccuracy: sentStatus,
      finalVerdict,
    });
  }

  // 4. Regressions (per hypothesis)
  for (const reg of bundle.regressions) {
    const indR = indep.regressions[reg.id];
    const r2Diff = indR ? Math.abs(reg.adjR2 - indR.adjR2) : null;
    const fDiff = indR ? Math.abs(reg.anova.f - indR.f) : null;
    const maxDiff =
      r2Diff !== null && fDiff !== null ? Math.max(r2Diff, fDiff) : r2Diff;
    const withinTol = r2Diff !== null && fDiff !== null ? r2Diff <= tolStrict && fDiff <= 1e-3 : null;
    const sentStatus = sectionStatuses['regression'] ?? 'unverifiable';
    const finalVerdict: VerificationStatus =
      withinTol === false ? 'needs_revision' : withinTol === null ? 'unverifiable' : sentStatus;
    rows.push({
      analysisKey: `reg_${reg.id}`,
      analysisLabel: `5. 회귀분석 (${reg.hypothesis}: ${reg.label})`,
      sectionId: 'regression',
      webAppResult: `수정R²=${fmtNum(reg.adjR2, 4)}, F=${fmtNum(reg.anova.f, 3)}`,
      independentResult: indR
        ? `수정R²=${fmtNum(indR.adjR2, 4)}, F=${fmtNum(indR.f, 3)}`
        : '계산 불가',
      differenceSummary:
        r2Diff !== null && fDiff !== null
          ? `ΔadjR²=${r2Diff.toExponential(2)}, ΔF=${fDiff.toExponential(2)}`
          : '—',
      maxDiff,
      withinTolerance: withinTol,
      sentenceAccuracy: sentStatus,
      finalVerdict,
    });
  }

  // 5. Mediation
  if (bundle.mediation && bundle.mediation.paths.length > 0) {
    let maxAbDiff = 0;
    let maxZDiff = 0;
    let comparable = 0;
    for (const p of bundle.mediation.paths) {
      const ip = indep.mediation?.paths.find((x) => x.independent === p.independent);
      if (ip && Number.isFinite(ip.indirectEffect)) {
        maxAbDiff = Math.max(maxAbDiff, Math.abs(p.indirectEffect - ip.indirectEffect));
        if (Number.isFinite(p.sobelZ) && Number.isFinite(ip.sobelZ)) {
          maxZDiff = Math.max(maxZDiff, Math.abs(p.sobelZ - ip.sobelZ));
        }
        comparable++;
      }
    }
    const withinTol = comparable > 0 ? maxAbDiff <= tolStrict && maxZDiff <= 1e-3 : null;
    const sentStatus = sectionStatuses['mediation'] ?? 'unverifiable';
    const finalVerdict: VerificationStatus =
      withinTol === false ? 'needs_revision' : withinTol === null ? 'unverifiable' : sentStatus;
    rows.push({
      analysisKey: 'mediation',
      analysisLabel: '5. 매개효과 검정 (ab · Sobel Z)',
      sectionId: 'mediation',
      webAppResult: bundle.mediation.paths
        .map((p) => `${p.independent}: ab=${fmtNum(p.indirectEffect, 4)}, Z=${fmtNum(p.sobelZ, 3)}`)
        .join(' | '),
      independentResult: indep.mediation
        ? indep.mediation.paths
            .map((p) => `${p.independent}: ab=${fmtNum(p.indirectEffect, 4)}, Z=${fmtNum(p.sobelZ, 3)}`)
            .join(' | ')
        : '계산 불가',
      differenceSummary:
        comparable > 0
          ? `Δab=${maxAbDiff.toExponential(2)}, ΔZ=${maxZDiff.toExponential(2)}`
          : '—',
      maxDiff: comparable > 0 ? Math.max(maxAbDiff, maxZDiff) : null,
      withinTolerance: withinTol,
      sentenceAccuracy: sentStatus,
      finalVerdict,
    });
  }

  // 6. Moderation
  if (bundle.moderation) {
    const appDr = bundle.moderation.r2Change;
    const appB = bundle.moderation.interactionCoeff.b;
    const indM = indep.moderation;
    const drDiff = indM ? Math.abs(appDr - indM.r2Change) : null;
    const bDiff = indM ? Math.abs(appB - indM.interactionB) : null;
    const withinTol = drDiff !== null && bDiff !== null ? drDiff <= tolStrict && bDiff <= tolStrict : null;
    const sentStatus = sectionStatuses['moderation'] ?? 'unverifiable';
    const finalVerdict: VerificationStatus =
      withinTol === false ? 'needs_revision' : withinTol === null ? 'unverifiable' : sentStatus;
    rows.push({
      analysisKey: 'moderation',
      analysisLabel: `5. 조절효과 검정 (${bundle.moderation.xName}×${bundle.moderation.wName})`,
      sectionId: 'moderation',
      webAppResult: `ΔR²=${fmtNum(appDr, 4)}, B=${fmtNum(appB, 4)}`,
      independentResult: indM
        ? `ΔR²=${fmtNum(indM.r2Change, 4)}, B=${fmtNum(indM.interactionB, 4)}`
        : '계산 불가',
      differenceSummary:
        drDiff !== null && bDiff !== null
          ? `Δ(ΔR²)=${drDiff.toExponential(2)}, ΔB=${bDiff.toExponential(2)}`
          : '—',
      maxDiff: drDiff !== null && bDiff !== null ? Math.max(drDiff, bDiff) : null,
      withinTolerance: withinTol,
      sentenceAccuracy: sentStatus,
      finalVerdict,
    });
  }

  return rows;
}

// ---------- Main Public Verification Entry Point ----------

export interface VerifyOptions {
  rows: DataRow[];
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  efaConfig: EFAConfig;
  bundle: AnalysisBundle | null;
  sections: ThesisSection[];
  style?: ThesisStyle;
  editedTexts?: Record<string, string>;
}

export function verifyThesisSections(opts: VerifyOptions): VerificationReportSummary {
  const {
    rows,
    constructs,
    hypothesis,
    efaConfig,
    bundle,
    sections,
    style = 'standard',
    editedTexts = {},
  } = opts;
  const now = Date.now();

  if (!bundle || !rows.length || !sections.length) {
    const emptySectionResults: SectionVerificationResult[] = sections.map((s) => {
      const currentText = editedTexts[s.id] ?? (style === 'standard' ? s.standardText : s.conciseText);
      return {
        sectionId: s.id,
        sectionTitle: s.title,
        stepLabel: s.stepLabel,
        style,
        isUserEdited: editedTexts[s.id] !== undefined,
        status: 'unverifiable',
        originalText: currentText,
        issues: [
          {
            ruleId: 'unanalyzed_content',
            ruleNumber: '⑦',
            ruleTitle: RULE_META.unanalyzed_content.title,
            reason: '원본 설문 데이터 또는 통계 분석 결과(AnalysisBundle)가 누락되어 문장을 검증할 수 없습니다.',
            criterion: RULE_META.unanalyzed_content.defaultCriterion,
          },
        ],
        actualStatsSummary: '필요한 통계값이 누락되어 있습니다.',
        suggestedText: null,
        appliedCriteria: [RULE_META.unanalyzed_content.defaultCriterion],
        checkedAt: now,
      };
    });

    return {
      generatedAt: now,
      totalSections: emptySectionResults.length,
      passCount: 0,
      needsRevisionCount: 0,
      unverifiableCount: emptySectionResults.length,
      passRate: 0,
      errorStats: ALL_RULE_IDS.map((ruleId) => ({
        ruleId,
        ruleNumber: RULE_META[ruleId].number,
        label: RULE_META[ruleId].title,
        count: ruleId === 'unanalyzed_content' ? emptySectionResults.length : 0,
      })),
      sectionResults: emptySectionResults,
      comparisons: [],
    };
  }

  // Reference clean auto-generated prose from real bundle for deterministic suggested fixes
  const referenceSections = generateThesisSections(bundle, hypothesis);
  const independent = computeIndependentStats(rows, constructs, hypothesis, efaConfig, bundle);

  const sectionResults: SectionVerificationResult[] = [];
  const sectionStatuses: Record<string, VerificationStatus> = {};

  for (const section of sections) {
    const isUserEdited = editedTexts[section.id] !== undefined;
    const text = isUserEdited
      ? editedTexts[section.id]
      : style === 'standard'
        ? section.standardText
        : section.conciseText;

    const issues: VerificationIssueDetail[] = [];
    let missingStats = false;
    let actualSummary = '';
    let criteria: string[] = [];

    if (!text.trim() || /\bNaN\b|\bundefined\b|=\s*—/.test(text)) {
      missingStats = true;
    }

    switch (section.id) {
      case 'efa_rel': {
        const res = verifyEfaRelSection(text, bundle, issues);
        missingStats = missingStats || res.missingStats;
        actualSummary = res.actualSummary;
        criteria = res.criteria;
        break;
      }
      case 'desc_corr': {
        const res = verifyDescCorrSection(text, bundle, issues);
        missingStats = missingStats || res.missingStats;
        actualSummary = res.actualSummary;
        criteria = res.criteria;
        break;
      }
      case 'regression': {
        const res = verifyRegressionSection(text, bundle, hypothesis, constructs, issues);
        missingStats = missingStats || res.missingStats;
        actualSummary = res.actualSummary;
        criteria = res.criteria;
        break;
      }
      case 'mediation': {
        const res = verifyMediationSection(text, bundle, hypothesis, issues);
        missingStats = missingStats || res.missingStats;
        actualSummary = res.actualSummary;
        criteria = res.criteria;
        break;
      }
      case 'moderation': {
        const res = verifyModerationSection(text, bundle, issues);
        missingStats = missingStats || res.missingStats;
        actualSummary = res.actualSummary;
        criteria = res.criteria;
        break;
      }
      case 'conclusion': {
        const res = verifyConclusionSection(text, bundle, hypothesis, issues);
        missingStats = missingStats || res.missingStats;
        actualSummary = res.actualSummary;
        criteria = res.criteria;
        break;
      }
    }

    // Rule ⑧ causal expression check on every section
    checkCausalOverstatement(text, issues);

    let status: VerificationStatus = 'pass';
    if (missingStats && issues.length === 0) {
      status = 'unverifiable';
    } else if (issues.length > 0) {
      status = 'needs_revision';
    } else if (missingStats) {
      status = 'unverifiable';
    }

    const ref = referenceSections.find((rs) => rs.id === section.id);
    const suggestedText =
      status === 'pass'
        ? null
        : status === 'unverifiable'
          ? null
          : ref
            ? style === 'standard'
              ? ref.standardText
              : ref.conciseText
            : null;

    sectionStatuses[section.id] = status;
    sectionResults.push({
      sectionId: section.id,
      sectionTitle: section.title,
      stepLabel: section.stepLabel,
      style,
      isUserEdited,
      status,
      originalText: text,
      issues,
      actualStatsSummary: actualSummary || '통계 결과를 확인할 수 없습니다.',
      suggestedText,
      appliedCriteria: Array.from(new Set([...criteria, ...issues.map((i) => i.criterion)])),
      checkedAt: now,
    });
  }

  const comparisons = buildIndependentComparisons(bundle, independent, sectionStatuses);

  const passCount = sectionResults.filter((r) => r.status === 'pass').length;
  const needsRevisionCount = sectionResults.filter((r) => r.status === 'needs_revision').length;
  const unverifiableCount = sectionResults.filter((r) => r.status === 'unverifiable').length;
  const totalSections = sectionResults.length;
  const passRate = totalSections > 0 ? Math.round((passCount / totalSections) * 1000) / 10 : 0;

  const counts = new Map<VerificationRuleId, number>();
  for (const id of ALL_RULE_IDS) counts.set(id, 0);
  for (const sec of sectionResults) {
    for (const iss of sec.issues) {
      counts.set(iss.ruleId, (counts.get(iss.ruleId) ?? 0) + 1);
    }
  }

  const errorStats: VerificationErrorTypeStat[] = ALL_RULE_IDS.map((ruleId) => ({
    ruleId,
    ruleNumber: RULE_META[ruleId].number,
    label: RULE_META[ruleId].title,
    count: counts.get(ruleId) ?? 0,
  }));

  return {
    generatedAt: now,
    totalSections,
    passCount,
    needsRevisionCount,
    unverifiableCount,
    passRate,
    errorStats,
    sectionResults,
    comparisons,
  };
}
