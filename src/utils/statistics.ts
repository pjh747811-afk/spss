import {
  CompositeSummary,
  ConstructMapping,
  CorrelationCell,
  CorrelationResult,
  DataRow,
  EFAConfig,
  EFALoadingRow,
  EFAResult,
  EFAVarianceRow,
  HypothesisConfig,
  ItemTotalStat,
  MediationAnalysisResult,
  MediationPathResult,
  ModerationResult,
  RegressionCoeff,
  RegressionResult,
  ReliabilityRow,
  SimpleSlopePoint,
} from '../types/stats';

// ---------- Basic Numeric Helpers ----------

export function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const parsed = Number(String(val).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractNumericColumn(rows: DataRow[], colName: string): (number | null)[] {
  const raw = rows.map((r) => r[colName]);
  const numericVals = raw.map((v) => toNum(v));
  const validNumericCount = numericVals.filter((v) => v !== null).length;
  const nonEmptyCount = raw.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;

  // If mostly numeric, return numeric conversion
  if (nonEmptyCount === 0 || validNumericCount / nonEmptyCount >= 0.5) {
    return numericVals;
  }

  // Deterministic categorical encoding (0, 1, 2...) for text demographic columns used as controls
  const categories = Array.from(
    new Set(
      raw
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
        .map((v) => String(v).trim())
    )
  ).sort((a, b) => a.localeCompare(b, 'ko'));

  const map = new Map(categories.map((cat, idx) => [cat, idx]));
  return raw.map((v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    return map.get(String(v).trim()) ?? null;
  });
}

export function mean(arr: number[]): number {
  if (!arr.length) return NaN;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function variance(arr: number[], ddof = 1): number {
  if (arr.length <= ddof) return NaN;
  const m = mean(arr);
  let ss = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    ss += d * d;
  }
  return ss / (arr.length - ddof);
}

export function std(arr: number[], ddof = 1): number {
  const v = variance(arr, ddof);
  return Number.isFinite(v) ? Math.sqrt(Math.max(0, v)) : NaN;
}

export function skewness(arr: number[]): number {
  const n = arr.length;
  if (n < 3) return NaN;
  const m = mean(arr);
  const s = std(arr, 1);
  if (!s) return 0;
  let sum3 = 0;
  for (let i = 0; i < n; i++) sum3 += ((arr[i] - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * sum3;
}

export function kurtosis(arr: number[]): number {
  const n = arr.length;
  if (n < 4) return NaN;
  const m = mean(arr);
  const s = std(arr, 1);
  if (!s) return 0;
  let sum4 = 0;
  for (let i = 0; i < n; i++) sum4 += ((arr[i] - m) / s) ** 4;
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum4 - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

// ---------- Special Functions & Probability Distributions ----------

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
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

function betacf(a: number, b: number, x: number): number {
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

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return Math.min(1, Math.max(0, (bt * betacf(a, b, x)) / a));
  }
  return Math.min(1, Math.max(0, 1 - (bt * betacf(b, a, 1 - x)) / b));
}

export function tDistP(t: number, df: number): number {
  if (!Number.isFinite(t) || df < 1) return 1;
  if (t === 0) return 1;
  const x = df / (df + t * t);
  const bt = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, bt));
}

export function fDistP(f: number, df1: number, df2: number): number {
  if (!Number.isFinite(f) || f <= 0 || df1 < 1 || df2 < 1) return 1;
  const x = df2 / (df2 + df1 * f);
  return Math.min(1, Math.max(0, incompleteBeta(x, df2 / 2, df1 / 2)));
}

// Regularized upper incomplete gamma Q(a, x) for chi-square p-value
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (a <= 0) return 0;
  const gln = logGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 300; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    const p = sum * Math.exp(-x + a * Math.log(x) - gln);
    return Math.min(1, Math.max(0, 1 - p));
  } else {
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 300; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return Math.min(1, Math.max(0, Math.exp(-x + a * Math.log(x) - gln) * h));
  }
}

export function chiSquareP(chi2: number, df: number): number {
  if (!Number.isFinite(chi2) || chi2 <= 0 || df < 1) return 1;
  return gammaQ(df / 2, chi2 / 2);
}

// Standard normal two-tailed p-value
export function normalP(z: number): number {
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

// ---------- Matrix Operations ----------

function invertMatrix(M: number[][]): { inv: number[][]; det: number } | null {
  const k = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  let det = 1;
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (piv !== col) {
      [A[col], A[piv]] = [A[piv], A[col]];
      det *= -1;
    }
    const div = A[col][col];
    if (Math.abs(div) < 1e-12) return null;
    det *= div;
    for (let j = 0; j < 2 * k; j++) A[col][j] /= div;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = 0; j < 2 * k; j++) A[r][j] -= f * A[col][j];
    }
  }
  return { inv: A.map((r) => r.slice(k)), det };
}

function jacobiEigen(A_in: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = A_in.length;
  const A = A_in.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
  );

  const maxIter = 100 * n * n;
  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0;
    let q = 1;
    let maxVal = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(A[i][j]);
        if (v > maxVal) {
          maxVal = v;
          p = i;
          q = j;
        }
      }
    }
    if (maxVal < 1e-12) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    const tau = (aqq - app) / (2 * apq);
    const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    A[p][p] = app - t * apq;
    A[q][q] = aqq + t * apq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let r = 0; r < n; r++) {
      if (r !== p && r !== q) {
        const arp = A[r][p];
        const arq = A[r][q];
        A[r][p] = c * arp - s * arq;
        A[p][r] = A[r][p];
        A[r][q] = s * arp + c * arq;
        A[q][r] = A[r][q];
      }
    }

    for (let r = 0; r < n; r++) {
      const vrp = V[r][p];
      const vrq = V[r][q];
      V[r][p] = c * vrp - s * vrq;
      V[r][q] = s * vrp + c * vrq;
    }
  }

  const pairs = Array.from({ length: n }, (_, i) => ({
    val: A[i][i],
    vec: V.map((row) => row[i]),
  })).sort((a, b) => b.val - a.val);

  return {
    eigenvalues: pairs.map((p) => p.val),
    eigenvectors: pairs.map((p) => p.vec),
  };
}

// ---------- 1. Exploratory Factor Analysis (PCA + Varimax) ----------

export function runEFA(rows: DataRow[], config: EFAConfig): EFAResult | null {
  const items = config.items;
  const p = items.length;
  if (p < 2 || rows.length < 3) return null;

  // Listwise deletion across selected items
  const matrix: number[][] = [];
  for (let r = 0; r < rows.length; r++) {
    const vals: number[] = [];
    let ok = true;
    for (let c = 0; c < p; c++) {
      const v = toNum(rows[r][items[c]]);
      if (v === null) {
        ok = false;
        break;
      }
      vals.push(v);
    }
    if (ok) matrix.push(vals);
  }

  const n = matrix.length;
  if (n < p + 2) return null;

  // Means and SDs
  const means = Array(p).fill(0);
  const sds = Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    const col = matrix.map((r) => r[j]);
    means[j] = mean(col);
    sds[j] = std(col, 1);
    if (!sds[j] || sds[j] === 0) return null;
  }

  // Correlation Matrix R
  const R = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    R[i][i] = 1;
    for (let j = i + 1; j < p; j++) {
      let s = 0;
      for (let r = 0; r < n; r++) {
        s += ((matrix[r][i] - means[i]) / sds[i]) * ((matrix[r][j] - means[j]) / sds[j]);
      }
      const corr = Math.max(-1, Math.min(1, s / (n - 1)));
      R[i][j] = corr;
      R[j][i] = corr;
    }
  }

  // KMO & Bartlett's Test
  const invResult = invertMatrix(R);
  let kmo = NaN;
  let bartlettChi2 = NaN;
  const bartlettDf = (p * (p - 1)) / 2;
  let bartlettP = NaN;

  if (invResult) {
    const { inv, det } = invResult;
    let sumR2 = 0;
    let sumA2 = 0;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        if (i === j) continue;
        sumR2 += R[i][j] * R[i][j];
        const denom = Math.sqrt(Math.max(1e-12, inv[i][i] * inv[j][j]));
        const aij = -inv[i][j] / denom;
        sumA2 += aij * aij;
      }
    }
    kmo = sumR2 + sumA2 > 0 ? sumR2 / (sumR2 + sumA2) : NaN;
    if (det > 0) {
      bartlettChi2 = -(n - 1 - (2 * p + 5) / 6) * Math.log(det);
      bartlettP = chiSquareP(bartlettChi2, bartlettDf);
    }
  }

  // Eigen decomposition
  const { eigenvalues, eigenvectors } = jacobiEigen(R);
  let numFactors =
    config.extractionMode === 'fixed'
      ? Math.max(1, Math.min(p, config.fixedFactors))
      : eigenvalues.filter((ev) => ev > 1.0).length;
  if (numFactors < 1) numFactors = 1;

  // Initial loading matrix L (p x m)
  const L = Array.from({ length: p }, (_, i) =>
    Array.from({ length: numFactors }, (__, j) => {
      const ev = Math.max(0, eigenvalues[j]);
      return eigenvectors[j][i] * Math.sqrt(ev);
    })
  );

  // Communalities
  const communalities = L.map((row) => row.reduce((s, v) => s + v * v, 0));

  // Varimax rotation with Kaiser normalization
  const H = communalities.map((h) => (h > 1e-12 ? Math.sqrt(h) : 1));
  const Rmat = L.map((row, i) => row.map((v) => v / H[i]));

  if (numFactors > 1) {
    for (let sweep = 0; sweep < 60; sweep++) {
      let maxAngle = 0;
      for (let j = 0; j < numFactors; j++) {
        for (let k = j + 1; k < numFactors; k++) {
          let u = 0;
          let v = 0;
          let a = 0;
          let b = 0;
          for (let i = 0; i < p; i++) {
            const x = Rmat[i][j];
            const y = Rmat[i][k];
            const ui = x * x - y * y;
            const vi = 2 * x * y;
            u += ui;
            v += vi;
            a += ui * ui - vi * vi;
            b += 2 * ui * vi;
          }
          const num = b - (2 * u * v) / p;
          const den = a - (u * u - v * v) / p;
          const angle = 0.25 * Math.atan2(num, den);
          if (Math.abs(angle) > maxAngle) maxAngle = Math.abs(angle);
          if (Math.abs(angle) > 1e-10) {
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            for (let i = 0; i < p; i++) {
              const x = Rmat[i][j];
              const y = Rmat[i][k];
              Rmat[i][j] = x * cosA + y * sinA;
              Rmat[i][k] = -x * sinA + y * cosA;
            }
          }
        }
      }
      if (maxAngle < 1e-7) break;
    }
  }

  // Denormalize
  let rotated = Rmat.map((row, i) => row.map((v) => v * H[i]));

  // Flip sign so each factor's largest-magnitude loading is positive, and sort factors by SS descending
  const factorInfos = Array.from({ length: numFactors }, (_, j) => {
    let ss = 0;
    let maxIdx = 0;
    let maxAbs = 0;
    for (let i = 0; i < p; i++) {
      ss += rotated[i][j] ** 2;
      if (Math.abs(rotated[i][j]) > maxAbs) {
        maxAbs = Math.abs(rotated[i][j]);
        maxIdx = i;
      }
    }
    const sign = rotated[maxIdx][j] < 0 ? -1 : 1;
    return { origIdx: j, ss, sign };
  }).sort((a, b) => b.ss - a.ss);

  rotated = rotated.map((row) => factorInfos.map((fi) => row[fi.origIdx] * fi.sign));

  // Variance Explained Table
  const totalVar = p;
  let initCum = 0;
  let rotCum = 0;
  const varianceExplained: EFAVarianceRow[] = [];
  for (let i = 0; i < p; i++) {
    const initEv = Math.max(0, eigenvalues[i]);
    const initPct = (initEv / totalVar) * 100;
    initCum += initPct;

    let rotSS = 0;
    let rotPct = 0;
    if (i < numFactors) {
      rotSS = factorInfos[i].ss;
      rotPct = (rotSS / totalVar) * 100;
      rotCum += rotPct;
    }
    varianceExplained.push({
      component: i + 1,
      initialEigenvalue: initEv,
      initialPctVar: initPct,
      initialCumPct: initCum,
      rotSS: i < numFactors ? rotSS : 0,
      rotPctVar: i < numFactors ? rotPct : 0,
      rotCumPct: i < numFactors ? rotCum : 0,
    });
  }

  // Build Rotated Component Matrix Rows
  let rotatedMatrix: EFALoadingRow[] = items.map((item, i) => {
    const loadings = rotated[i];
    let dominantFactor = 0;
    let maxAbsLoading = 0;
    for (let j = 0; j < numFactors; j++) {
      const a = Math.abs(loadings[j]);
      if (a > maxAbsLoading) {
        maxAbsLoading = a;
        dominantFactor = j;
      }
    }
    return {
      item,
      communality: communalities[i],
      loadings,
      dominantFactor,
      maxAbsLoading,
    };
  });

  if (config.sortBySize) {
    rotatedMatrix = rotatedMatrix.sort((a, b) => {
      if (a.dominantFactor !== b.dominantFactor) return a.dominantFactor - b.dominantFactor;
      return b.maxAbsLoading - a.maxAbsLoading;
    });
  }

  // Component Score Coefficient Matrix: B = R^{-1} * L_rot
  const scoreCoeffMatrix: { item: string; coeffs: number[] }[] = [];
  if (invResult) {
    const { inv } = invResult;
    for (let i = 0; i < p; i++) {
      const coeffs: number[] = [];
      for (let f = 0; f < numFactors; f++) {
        let sum = 0;
        for (let k = 0; k < p; k++) {
          sum += inv[i][k] * rotated[k][f];
        }
        coeffs.push(sum);
      }
      scoreCoeffMatrix.push({ item: items[i], coeffs });
    }
  }

  const harmanSingleFactorPct = varianceExplained[0]?.initialPctVar ?? NaN;

  return {
    n,
    p,
    numFactors,
    kmo,
    bartlettChi2,
    bartlettDf,
    bartlettP,
    harmanSingleFactorPct,
    eigenvalues,
    varianceExplained,
    rotatedMatrix,
    scoreCoeffMatrix,
    itemNames: items,
  };
}

// ---------- 2. Reliability Analysis (Cronbach's Alpha) ----------

export function computeCronbachAlpha(matrix: number[][]): number {
  const n = matrix.length;
  const k = matrix[0]?.length || 0;
  if (n < 2 || k < 2) return NaN;

  const itemVars: number[] = [];
  for (let j = 0; j < k; j++) {
    itemVars.push(variance(matrix.map((r) => r[j]), 1));
  }
  const totals = matrix.map((r) => r.reduce((s, v) => s + v, 0));
  const totalVar = variance(totals, 1);
  if (!totalVar || totalVar === 0) return NaN;
  return (k / (k - 1)) * (1 - itemVars.reduce((s, v) => s + v, 0) / totalVar);
}

export function pearsonPair(x: number[], y: number[]): { r: number; p: number; n: number } {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let c = 0;
  const len = Math.min(x.length, y.length);
  for (let i = 0; i < len; i++) {
    const a = x[i];
    const b = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    sx += a;
    sy += b;
    sxx += a * a;
    syy += b * b;
    sxy += a * b;
    c++;
  }
  if (c < 3) return { r: NaN, p: NaN, n: c };
  const num = c * sxy - sx * sy;
  const den = Math.sqrt(Math.max(0, (c * sxx - sx * sx) * (c * syy - sy * sy)));
  if (den === 0) return { r: NaN, p: NaN, n: c };
  const r = Math.max(-1, Math.min(1, num / den));
  const p = Math.abs(r) >= 1 - 1e-12 ? 0 : tDistP(Math.abs(r) * Math.sqrt((c - 2) / (1 - r * r)), c - 2);
  return { r, p, n: c };
}

export function runReliability(rows: DataRow[], constructs: ConstructMapping[]): ReliabilityRow[] {
  const results: ReliabilityRow[] = [];

  for (const c of constructs) {
    const k = c.items.length;
    if (k === 0) continue;

    const matrix: number[][] = [];
    for (let i = 0; i < rows.length; i++) {
      const vals: number[] = [];
      let ok = true;
      for (let j = 0; j < k; j++) {
        const v = toNum(rows[i][c.items[j]]);
        if (v === null) {
          ok = false;
          break;
        }
        vals.push(v);
      }
      if (ok) matrix.push(vals);
    }

    const nValid = matrix.length;
    const alpha = computeCronbachAlpha(matrix);

    // Standardized Alpha
    let sumCorr = 0;
    let pairs = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const colI = matrix.map((r) => r[i]);
        const colJ = matrix.map((r) => r[j]);
        const { r } = pearsonPair(colI, colJ);
        if (Number.isFinite(r)) {
          sumCorr += r;
          pairs++;
        }
      }
    }
    const meanCorr = pairs > 0 ? sumCorr / pairs : NaN;
    const standardizedAlpha =
      k >= 2 && Number.isFinite(meanCorr) ? (k * meanCorr) / (1 + (k - 1) * meanCorr) : NaN;

    // Item-Total Statistics
    const itemStats: ItemTotalStat[] = [];
    const totals = matrix.map((r) => r.reduce((s, v) => s + v, 0));
    for (let j = 0; j < k; j++) {
      const itemCol = matrix.map((r) => r[j]);
      const restTotals = matrix.map((r, idx) => totals[idx] - r[j]);
      const subMatrix = matrix.map((r) => r.filter((_, idx) => idx !== j));
      const { r: citc } = pearsonPair(itemCol, restTotals);
      itemStats.push({
        item: c.items[j],
        scaleMeanIfDeleted: mean(restTotals),
        scaleVarIfDeleted: variance(restTotals, 1),
        correctedItemTotalCorr: citc,
        alphaIfDeleted: k > 2 ? computeCronbachAlpha(subMatrix) : NaN,
      });
    }

    results.push({
      constructName: c.name,
      items: c.items,
      nValid,
      nItems: k,
      alpha,
      standardizedAlpha,
      itemStats,
    });
  }

  return results;
}

// ---------- 3. Composite Variables (Mean) ----------

export function computeComposites(rows: DataRow[], constructs: ConstructMapping[]): CompositeSummary[] {
  return constructs
    .filter((c) => c.items.length > 0)
    .map((c) => {
      const values: (number | null)[] = rows.map((r) => {
        const validVals: number[] = [];
        for (const item of c.items) {
          const v = toNum(r[item]);
          if (v !== null) validVals.push(v);
        }
        return validVals.length ? validVals.reduce((s, v) => s + v, 0) / validVals.length : null;
      });

      const valid = values.filter((v): v is number => v !== null);
      const formula =
        c.items.length === 1 ? c.items[0] : `(${c.items.join(' + ')}) / ${c.items.length}`;

      return {
        name: c.name,
        items: c.items,
        formula,
        n: valid.length,
        mean: mean(valid),
        sd: std(valid, 1),
        min: valid.length ? Math.min(...valid) : NaN,
        max: valid.length ? Math.max(...valid) : NaN,
        skewness: skewness(valid),
        kurtosis: kurtosis(valid),
        values,
      };
    });
}

// ---------- 4. Pearson Correlation Matrix ----------

export function runCorrelation(composites: CompositeSummary[]): CorrelationResult {
  const names = composites.map((c) => c.name);
  const k = names.length;
  const matrix: CorrelationCell[][] = Array.from({ length: k }, () =>
    Array.from({ length: k }, () => ({ r: NaN, p: NaN, n: 0 }))
  );

  for (let i = 0; i < k; i++) {
    const validI = composites[i].values.filter((v): v is number => v !== null);
    matrix[i][i] = { r: 1, p: 0, n: validI.length };
    for (let j = i + 1; j < k; j++) {
      const xi: number[] = [];
      const xj: number[] = [];
      for (let r = 0; r < composites[i].values.length; r++) {
        const vi = composites[i].values[r];
        const vj = composites[j].values[r];
        if (vi !== null && vj !== null) {
          xi.push(vi);
          xj.push(vj);
        }
      }
      const res = pearsonPair(xi, xj);
      matrix[i][j] = res;
      matrix[j][i] = res;
    }
  }

  return { names, matrix };
}

// ---------- 5. OLS Linear Regression (SPSS Format) ----------

export function runOLS(
  id: string,
  hypothesis: string,
  label: string,
  dependentName: string,
  yRaw: (number | null)[],
  xCols: { name: string; values: (number | null)[] }[],
  controls: string[] = []
): RegressionResult | null {
  if (!xCols.length) return null;

  const rows: { y: number; x: number[] }[] = [];
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
    if (ok) rows.push({ y: yv, x: row });
  }

  const n = rows.length;
  const k = xCols.length;
  const p = k + 1;
  if (n <= p) return null;

  // Build X'X and X'y
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (const r of rows) {
    for (let i = 0; i < p; i++) {
      Xty[i] += r.x[i] * r.y;
      for (let j = 0; j < p; j++) {
        XtX[i][j] += r.x[i] * r.x[j];
      }
    }
  }

  const invRes = invertMatrix(XtX);
  if (!invRes) return null;
  const { inv } = invRes;

  const b = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) b[i] += inv[i][j] * Xty[j];
  }

  const yMean = rows.reduce((s, r) => s + r.y, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  const residuals: number[] = [];
  for (const r of rows) {
    let yh = 0;
    for (let i = 0; i < p; i++) yh += b[i] * r.x[i];
    const res = r.y - yh;
    residuals.push(res);
    ssRes += res * res;
    ssTot += (r.y - yMean) ** 2;
  }

  const ssReg = Math.max(0, ssTot - ssRes);
  const dfReg = k;
  const dfRes = n - k - 1;
  const dfTot = n - 1;
  const msReg = ssReg / dfReg;
  const msRes = ssRes / dfRes;
  const stdErrorEst = Math.sqrt(Math.max(0, msRes));

  const r2 = ssTot > 0 ? Math.min(1, Math.max(0, 1 - ssRes / ssTot)) : 0;
  const r = Math.sqrt(r2);
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / dfRes;
  const f = msRes > 0 ? msReg / msRes : 0;
  const modelP = fDistP(f, dfReg, dfRes);

  // Durbin-Watson
  let dwNum = 0;
  for (let i = 1; i < residuals.length; i++) {
    dwNum += (residuals[i] - residuals[i - 1]) ** 2;
  }
  const durbinWatson = ssRes > 0 ? dwNum / ssRes : NaN;

  // Predictor SDs on the exact regression sample (for exact standardized beta & VIF)
  const ySd = Math.sqrt(ssTot / (n - 1));
  const xSampleCols = Array.from({ length: k }, (_, j) => rows.map((row) => row.x[j + 1]));

  // Collinearity diagnostics (VIF & Tolerance)
  const vifs: (number | null)[] = Array(k).fill(null);
  if (k === 1) {
    vifs[0] = 1;
  } else {
    // Standardize X predictors -> correlation matrix Rxx -> diagonal of Rxx^{-1} = VIF!
    const Rxx = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      Rxx[i][i] = 1;
      for (let j = i + 1; j < k; j++) {
        const { r: corr } = pearsonPair(xSampleCols[i], xSampleCols[j]);
        Rxx[i][j] = Number.isFinite(corr) ? corr : 0;
        Rxx[j][i] = Rxx[i][j];
      }
    }
    const rxxInv = invertMatrix(Rxx);
    if (rxxInv) {
      for (let j = 0; j < k; j++) {
        vifs[j] = rxxInv.inv[j][j];
      }
    }
  }

  const coeffs: RegressionCoeff[] = [];
  for (let i = 0; i < p; i++) {
    const se = Math.sqrt(Math.max(0, inv[i][i] * msRes));
    const t = se > 0 ? b[i] / se : NaN;
    const pval = tDistP(Math.abs(t), dfRes);
    if (i === 0) {
      coeffs.push({
        name: '(상수)',
        b: b[i],
        se,
        beta: null,
        t,
        p: pval,
        tolerance: null,
        vif: null,
      });
    } else {
      const xSd = std(xSampleCols[i - 1], 1);
      const beta = xSd && ySd ? (b[i] * xSd) / ySd : NaN;
      const vifVal = vifs[i - 1];
      const tolVal = vifVal && vifVal > 0 ? 1 / vifVal : null;
      coeffs.push({
        name: xCols[i - 1].name,
        b: b[i],
        se,
        beta,
        t,
        p: pval,
        tolerance: tolVal,
        vif: vifVal,
      });
    }
  }

  return {
    id,
    hypothesis,
    label,
    dependent: dependentName,
    independents: xCols.map((c) => c.name).filter((n) => !controls.includes(n)),
    controls,
    n,
    k,
    r,
    r2,
    adjR2,
    stdErrorEst,
    durbinWatson,
    anova: {
      ssReg,
      dfReg,
      msReg,
      ssRes,
      dfRes,
      msRes,
      ssTot,
      dfTot,
      f,
      p: modelP,
    },
    coeffs,
  };
}

// ---------- 6. Mediation Analysis (Baron & Kenny + Sobel + Bootstrap 95% CI) ----------

// Deterministic PRNG (Mulberry32) so bootstrap CI is reproducible across re-renders
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runMediation(
  composites: CompositeSummary[],
  hyp: HypothesisConfig,
  h1Reg: RegressionResult | null,
  h3Reg: RegressionResult | null,
  bootstrapSamples = 1000,
  controlCols: { name: string; values: (number | null)[] }[] = []
): MediationAnalysisResult | null {
  const medComp = composites.find((c) => c.name === hyp.mediator);
  const depComp = composites.find((c) => c.name === hyp.dependent);
  const indepComps = hyp.independents
    .map((name) => composites.find((c) => c.name === name))
    .filter((c): c is CompositeSummary => !!c && c.name !== hyp.mediator && c.name !== hyp.dependent);

  if (!medComp || !depComp || !indepComps.length || medComp.name === depComp.name) {
    return null;
  }

  const controlNames = controlCols.map((c) => c.name);

  // Step 4 regression: Y <- Controls + X1..Xk + Mediator
  const step4X = [
    ...controlCols,
    ...indepComps.map((c) => ({ name: c.name, values: c.values })),
    { name: medComp.name, values: medComp.values },
  ];
  const step4Regression = runOLS(
    'H4',
    '매개검증 (4단계)',
    `${depComp.name} ← ${indepComps.map((c) => c.name).join(' + ')} + ${medComp.name}`,
    depComp.name,
    depComp.values,
    step4X,
    controlNames
  );

  if (!step4Regression || !h1Reg || !h3Reg) return null;

  // R2 change from H3 -> H4
  const r2ChangeFromH3 = step4Regression.r2 - h3Reg.r2;
  const dfNum = 1;
  const dfDen = step4Regression.anova.dfRes;
  const fChangeFromH3 =
    dfDen > 0 && step4Regression.r2 < 1
      ? (r2ChangeFromH3 / dfNum) / ((1 - step4Regression.r2) / dfDen)
      : null;
  const pChangeFromH3 = fChangeFromH3 !== null ? fDistP(fChangeFromH3, dfNum, dfDen) : null;

  const medInH4 = step4Regression.coeffs.find((c) => c.name === medComp.name);
  if (!medInH4) return null;

  // Build aligned complete-case dataset for bootstrap
  const completeRows: { x: number[]; ctrl: number[]; m: number; y: number }[] = [];
  for (let i = 0; i < depComp.values.length; i++) {
    const mv = medComp.values[i];
    const yv = depComp.values[i];
    if (mv === null || yv === null) continue;
    const xRow: number[] = [];
    const ctrlRow: number[] = [];
    let ok = true;
    for (const ic of indepComps) {
      const xv = ic.values[i];
      if (xv === null) {
        ok = false;
        break;
      }
      xRow.push(xv);
    }
    if (!ok) continue;
    for (const cc of controlCols) {
      const cv = cc.values[i];
      if (cv === null) {
        ok = false;
        break;
      }
      ctrlRow.push(cv);
    }
    if (ok) completeRows.push({ x: xRow, ctrl: ctrlRow, m: mv, y: yv });
  }

  const paths: MediationPathResult[] = [];
  const n = completeRows.length;
  const rand = mulberry32(20261121);

  // Pre-generate bootstrap indirect effect matrix [boot][indepIdx]
  const bootIndirects: number[][] = Array.from({ length: indepComps.length }, () => []);

  if (n > indepComps.length + controlCols.length + 4) {
    for (let bIdx = 0; bIdx < bootstrapSamples; bIdx++) {
      const sampleX = Array.from({ length: indepComps.length }, () => [] as (number | null)[]);
      const sampleCtrl = Array.from({ length: controlCols.length }, () => [] as (number | null)[]);
      const sampleM: (number | null)[] = [];
      const sampleY: (number | null)[] = [];
      for (let i = 0; i < n; i++) {
        const pick = Math.floor(rand() * n);
        const row = completeRows[pick];
        sampleM.push(row.m);
        sampleY.push(row.y);
        for (let j = 0; j < indepComps.length; j++) {
          sampleX[j].push(row.x[j]);
        }
        for (let cIdx = 0; cIdx < controlCols.length; cIdx++) {
          sampleCtrl[cIdx].push(row.ctrl[cIdx]);
        }
      }

      const bCtrlCols = controlCols.map((c, cIdx) => ({ name: c.name, values: sampleCtrl[cIdx] }));
      const bH1 = runOLS(
        'b1',
        '',
        '',
        'M',
        sampleM,
        [...bCtrlCols, ...indepComps.map((c, j) => ({ name: c.name, values: sampleX[j] }))],
        controlNames
      );
      const bH4 = runOLS(
        'b4',
        '',
        '',
        'Y',
        sampleY,
        [
          ...bCtrlCols,
          ...indepComps.map((c, j) => ({ name: c.name, values: sampleX[j] })),
          { name: medComp.name, values: sampleM },
        ],
        controlNames
      );

      if (bH1 && bH4) {
        const bCoeff = bH4.coeffs.find((c) => c.name === medComp.name)?.b ?? NaN;
        for (let j = 0; j < indepComps.length; j++) {
          const aCoeff = bH1.coeffs.find((c) => c.name === indepComps[j].name)?.b ?? NaN;
          if (Number.isFinite(aCoeff) && Number.isFinite(bCoeff)) {
            bootIndirects[j].push(aCoeff * bCoeff);
          }
        }
      }
    }
  }

  for (let j = 0; j < indepComps.length; j++) {
    const xName = indepComps[j].name;
    const xInH1 = h1Reg.coeffs.find((c) => c.name === xName);
    const xInH3 = h3Reg.coeffs.find((c) => c.name === xName);
    const xInH4 = step4Regression.coeffs.find((c) => c.name === xName);

    const a = xInH1?.b ?? NaN;
    const seA = xInH1?.se ?? NaN;
    const pA = xInH1?.p ?? NaN;
    const b = medInH4.b;
    const seB = medInH4.se;
    const pB = medInH4.p;
    const cTotal = xInH3?.b ?? NaN;
    const pCTotal = xInH3?.p ?? NaN;
    const cPrime = xInH4?.b ?? NaN;
    const pCPrime = xInH4?.p ?? NaN;

    const indirectEffect = a * b;
    const sobelSE = Math.sqrt(Math.max(0, b * b * seA * seA + a * a * seB * seB));
    const sobelZ = sobelSE > 0 ? indirectEffect / sobelSE : NaN;
    const sobelP = normalP(sobelZ);

    const dist = [...bootIndirects[j]].sort((u, v) => u - v);
    const bootMean = dist.length ? mean(dist) : NaN;
    const bootSE = dist.length > 1 ? std(dist, 1) : NaN;
    const bootCiLow = dist.length ? dist[Math.floor(0.025 * dist.length)] : NaN;
    const bootCiHigh = dist.length
      ? dist[Math.min(dist.length - 1, Math.floor(0.975 * dist.length))]
      : NaN;

    const ciExcludesZero =
      Number.isFinite(bootCiLow) && Number.isFinite(bootCiHigh) && (bootCiLow > 0 || bootCiHigh < 0);
    const indirectSig = pA < 0.05 && pB < 0.05 && (sobelP < 0.05 || ciExcludesZero);

    let status: MediationPathResult['status'] = 'none';
    if (indirectSig) {
      if (pCTotal < 0.05 && pCPrime >= 0.05) {
        status = 'full';
      } else if (pCTotal < 0.05 && pCPrime < 0.05) {
        status = 'partial';
      } else if (pCTotal >= 0.05) {
        status = 'indirect_only';
      }
    }

    paths.push({
      independent: xName,
      mediator: medComp.name,
      dependent: depComp.name,
      a,
      seA,
      pA,
      b,
      seB,
      pB,
      cTotal,
      pCTotal,
      cPrime,
      pCPrime,
      indirectEffect,
      sobelZ,
      sobelSE,
      sobelP,
      bootMean,
      bootSE,
      bootCiLow,
      bootCiHigh,
      status,
    });
  }

  return {
    step4Regression,
    r2ChangeFromH3,
    fChangeFromH3,
    pChangeFromH3,
    paths,
    bootstrapSamples,
  };
}

// ---------- 7. Hierarchical Moderation Analysis (Mean-Centered + Simple Slopes) ----------

export function runModeration(
  xName: string,
  xValues: (number | null)[],
  wName: string,
  wValues: (number | null)[],
  yName: string,
  yValues: (number | null)[],
  controlCols: { name: string; values: (number | null)[] }[] = []
): ModerationResult | null {
  if (xName === wName || xName === yName || wName === yName) return null;

  // Complete-case alignment
  const validIndices: number[] = [];
  for (let i = 0; i < yValues.length; i++) {
    const xv = xValues[i];
    const wv = wValues[i];
    const yv = yValues[i];
    if (xv === null || wv === null || yv === null) continue;
    let ok = true;
    for (const cc of controlCols) {
      if (cc.values[i] === null) {
        ok = false;
        break;
      }
    }
    if (ok) validIndices.push(i);
  }

  const n = validIndices.length;
  const kTotal = controlCols.length + 3;
  if (n <= kTotal + 2) return null;

  const validX = validIndices.map((idx) => xValues[idx] as number);
  const validW = validIndices.map((idx) => wValues[idx] as number);
  const xMean = mean(validX);
  const wMean = mean(validW);
  const wSd = std(validW, 1);

  const xCentered: (number | null)[] = xValues.map((v) => (v !== null ? v - xMean : null));
  const wCentered: (number | null)[] = wValues.map((v) => (v !== null ? v - wMean : null));
  const interactionVals: (number | null)[] = xCentered.map((xc, idx) => {
    const wc = wCentered[idx];
    return xc !== null && wc !== null ? xc * wc : null;
  });

  const interName = `${xName}×${wName}`;
  const ctrlNames = controlCols.map((c) => c.name);

  const step1 = runOLS(
    'MOD1',
    '조절 1단계',
    `${yName} ← ${xName} + ${wName}`,
    yName,
    yValues,
    [...controlCols, { name: xName, values: xCentered }, { name: wName, values: wCentered }],
    ctrlNames
  );
  const step2 = runOLS(
    'MOD2',
    '조절 2단계 (상호작용)',
    `${yName} ← ${xName} + ${wName} + ${interName}`,
    yName,
    yValues,
    [
      ...controlCols,
      { name: xName, values: xCentered },
      { name: wName, values: wCentered },
      { name: interName, values: interactionVals },
    ],
    ctrlNames
  );

  if (!step1 || !step2) return null;
  const interCoeff = step2.coeffs.find((c) => c.name === interName);
  if (!interCoeff) return null;

  const r2Change = Math.max(0, step2.r2 - step1.r2);
  const dfRes = step2.anova.dfRes;
  const fChange =
    dfRes > 0 && step2.r2 < 1 ? r2Change / ((1 - step2.r2) / dfRes) : 0;
  const pChange = fDistP(fChange, 1, dfRes);

  // Compute exact covariance matrix (X'X)^-1 * msRes for simple slope SEs
  const p = kTotal + 1; // intercept + controls + X + W + X*W
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  for (const idx of validIndices) {
    const rowVec = [
      1,
      ...controlCols.map((c) => c.values[idx] as number),
      xCentered[idx] as number,
      wCentered[idx] as number,
      interactionVals[idx] as number,
    ];
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        XtX[r][c] += rowVec[r] * rowVec[c];
      }
    }
  }

  const invRes = invertMatrix(XtX);
  const xIdx = 1 + controlCols.length;
  const interIdx = 3 + controlCols.length;
  const b1 = step2.coeffs.find((c) => c.name === xName)?.b ?? 0;
  const b3 = interCoeff.b;
  const msRes = step2.anova.msRes;

  const levels: { label: SimpleSlopePoint['level']; wCenteredVal: number; wActualVal: number }[] = [
    { label: '저집단 (-1 SD)', wCenteredVal: -wSd, wActualVal: wMean - wSd },
    { label: '평균 (Mean)', wCenteredVal: 0, wActualVal: wMean },
    { label: '고집단 (+1 SD)', wCenteredVal: wSd, wActualVal: wMean + wSd },
  ];

  const simpleSlopes: SimpleSlopePoint[] = levels.map((lv) => {
    const slope = b1 + b3 * lv.wCenteredVal;
    let se = NaN;
    if (invRes) {
      const varB1 = invRes.inv[xIdx][xIdx] * msRes;
      const varB3 = invRes.inv[interIdx][interIdx] * msRes;
      const covB1B3 = invRes.inv[xIdx][interIdx] * msRes;
      const varSlope = varB1 + lv.wCenteredVal * lv.wCenteredVal * varB3 + 2 * lv.wCenteredVal * covB1B3;
      se = Math.sqrt(Math.max(0, varSlope));
    }
    const t = se > 0 ? slope / se : NaN;
    const pVal = tDistP(Math.abs(t), dfRes);
    return {
      level: lv.label,
      wValue: lv.wActualVal,
      slope,
      se,
      t,
      p: pVal,
    };
  });

  return {
    xName,
    wName,
    yName,
    n,
    step1,
    step2,
    r2Change,
    fChange,
    pChange,
    interactionCoeff: interCoeff,
    significant: interCoeff.p < 0.05,
    simpleSlopes,
  };
}

// ---------- Hypothesis Verdict & Formatting Helpers ----------

export function getHypothesisVerdict(reg: RegressionResult): '채택' | '부분 채택' | '기각' {
  if (reg.anova.p >= 0.05) return '기각';
  const ctrlSet = new Set(reg.controls ?? []);
  const focalPredictors = reg.coeffs.filter((c) => c.name !== '(상수)' && !ctrlSet.has(c.name));
  if (!focalPredictors.length) return '기각';
  const sigCount = focalPredictors.filter((c) => c.p < 0.05).length;
  if (sigCount === focalPredictors.length) return '채택';
  if (sigCount > 0) return '부분 채택';
  return '기각';
}

export function fmtNum(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 0.001) return '< .001';
  return p.toFixed(3);
}

export function sigStars(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}
