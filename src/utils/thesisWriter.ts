import {
  AnalysisBundle,
  HypothesisConfig,
  MediationPathResult,
  ModerationResult,
  RegressionCoeff,
  RegressionResult,
} from '../types/stats';
import { fmtNum, getHypothesisVerdict } from './statistics';

export type ThesisStyle = 'standard' | 'concise';

export interface ThesisSection {
  id: 'efa_rel' | 'desc_corr' | 'regression' | 'mediation' | 'moderation' | 'conclusion';
  stepLabel: string;
  title: string;
  readingGuide: string[];
  standardText: string;
  conciseText: string;
}

// ---------- Korean Particle (조사) & Academic Number Formatting ----------

function stripTrailingParen(word: string): string {
  return word.trim().replace(/[\])}\s]+$/g, '');
}

function lastDigitOrCharHasBatchim(clean: string, forEuro: boolean): boolean {
  if (!clean) return false;
  const ch = clean.charCodeAt(clean.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) {
    const jong = (ch - 0xac00) % 28;
    if (forEuro) return jong !== 0 && jong !== 8;
    return jong !== 0;
  }
  const lastChar = clean[clean.length - 1];
  if (/[0-9]/.test(lastChar)) {
    // 0(영), 1(일), 3(삼), 6(육), 7(칠), 8(팔) have batchim; 1,7,8 have ㄹ batchim (use 로)
    if (forEuro) return lastChar === '0' || lastChar === '3' || lastChar === '6';
    return ['0', '1', '3', '6', '7', '8'].includes(lastChar);
  }
  return false;
}

export function josa(
  word: string,
  pair: '이/가' | '은/는' | '을/를' | '과/와' | '으로/로',
  pronounceTarget?: string
): string {
  const target = stripTrailingParen(pronounceTarget ?? word);
  if (pair === '으로/로') {
    return `${word}${lastDigitOrCharHasBatchim(target, true) ? '으로' : '로'}`;
  }
  const [withB, withoutB] = pair.split('/');
  return `${word}${lastDigitOrCharHasBatchim(target, false) ? withB : withoutB}`;
}

function fmtBound(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return s.replace(/^(-?)0\./, '$1.');
}

function fmtAcademicP(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 0.001) return 'p < .001';
  if (p < 0.01) return `p = ${fmtBound(p, 3)} (p < .01)`;
  return `p = ${fmtBound(p, 3)}`;
}

function fmtShortP(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 0.001) return 'p < .001';
  return `p = ${fmtBound(p, 3)}`;
}

function formatPredictorPhrase(c: RegressionCoeff): string {
  return `${c.name}(B = ${fmtNum(c.b, 3)}, β = ${fmtBound(c.beta, 3)}, t = ${fmtNum(c.t, 2)}, ${fmtShortP(c.p)})`;
}

function formatRegressionSentence(reg: RegressionResult, concise: boolean): string {
  const ctrlSet = new Set(reg.controls ?? []);
  const predictors = reg.coeffs.filter((c) => c.name !== '(상수)' && !ctrlSet.has(c.name));
  const allNonConst = reg.coeffs.filter((c) => c.name !== '(상수)');
  const sigs = predictors.filter((c) => c.p < 0.05);
  const nonSigs = predictors.filter((c) => c.p >= 0.05);
  const vifs = allNonConst
    .map((c) => c.vif)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const maxVif = vifs.length ? Math.max(...vifs) : null;
  const minTol = allNonConst
    .map((c) => c.tolerance)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const minTolVal = minTol.length ? Math.min(...minTol) : null;

  const indepList = reg.independents.join(', ');
  const modelSig = reg.anova.p < 0.05;
  const verdict = getHypothesisVerdict(reg);
  const ctrlClause =
    reg.controls && reg.controls.length > 0
      ? `통제변수(${reg.controls.join(', ')})를 통제한 상태에서 `
      : '';

  if (concise) {
    if (!modelSig) {
      return `[${reg.hypothesis} · ${verdict}] ${indepList} → ${reg.dependent} 회귀모형은 통계적으로 유의하지 않았다(F = ${fmtNum(reg.anova.f, 2)}, ${fmtShortP(reg.anova.p)}).`;
    }
    const sigStr = sigs.length
      ? sigs.map((c) => `${c.name}(β = ${fmtBound(c.beta, 3)}, ${fmtShortP(c.p)})`).join(', ')
      : '유의한 독립변수 없음';
    return `[${reg.hypothesis} · ${verdict}] ${ctrlClause}${josa(indepList, '이/가')} ${reg.dependent}에 미치는 영향 모형은 유의하였으며(R² = ${fmtBound(reg.r2, 3)}, adj.R² = ${fmtBound(reg.adjR2, 3)}, F = ${fmtNum(reg.anova.f, 2)}, ${fmtShortP(reg.anova.p)}), ${sigStr}.`;
  }

  const parts: string[] = [];
  const lastIndep = reg.independents[reg.independents.length - 1] ?? indepList;
  parts.push(
    `가설 ${reg.hypothesis} 검증을 위해 ${ctrlClause}${josa(indepList, '을/를', lastIndep)} 독립변수로, ${josa(reg.dependent, '을/를')} 종속변수로 투입하여 다중선형회귀분석을 실시하였다.`
  );

  if (!modelSig) {
    parts.push(
      `분석 결과, 회귀모형의 설명력(수정된 R²)은 ${fmtBound(reg.adjR2, 3)}이었으나 모형 적합도는 통계적으로 유의하지 않았다(F(${reg.anova.dfReg}, ${reg.anova.dfRes}) = ${fmtNum(reg.anova.f, 2)}, ${fmtShortP(reg.anova.p)}). 따라서 가설 ${josa(reg.hypothesis, '은/는')} 기각되었다.`
    );
    return parts.join(' ');
  }

  const dwOk = reg.durbinWatson >= 1.5 && reg.durbinWatson <= 2.5;
  const dwClause = dwOk
    ? `Durbin-Watson 통계량은 ${fmtNum(reg.durbinWatson, 3)}으로 잔차 간 자기상관이 없었으며`
    : `Durbin-Watson 통계량은 ${fmtNum(reg.durbinWatson, 3)}으로 나타났으며`;

  const colinearityNote =
    maxVif !== null && minTolVal !== null
      ? ` ${dwClause}, 공차한계(Tolerance ≥ ${fmtNum(minTolVal, 3)})와 분산팽창계수(VIF ≤ ${fmtNum(maxVif, 3)}) 모두 다중공선성 기준(VIF < 10)을 충족하였다.`
      : ` ${dwClause}.`;

  parts.push(
    `분석 결과, 회귀모형은 통계적으로 유의하였으며(F(${reg.anova.dfReg}, ${reg.anova.dfRes}) = ${fmtNum(reg.anova.f, 2)}, ${fmtAcademicP(reg.anova.p)}), 종속변수 분산의 ${(reg.adjR2 * 100).toFixed(1)}%를 설명하는 것으로 나타났다(R² = ${fmtBound(reg.r2, 3)}, 수정된 R² = ${fmtBound(reg.adjR2, 3)}).${colinearityNote}`
  );

  if (sigs.length > 0) {
    const posSigs = sigs.filter((c) => c.b >= 0);
    const negSigs = sigs.filter((c) => c.b < 0);
    const clauses: string[] = [];
    if (posSigs.length) {
      const phrase = posSigs.map(formatPredictorPhrase).join(', ');
      const lastPos = posSigs[posSigs.length - 1].name;
      clauses.push(
        `${josa(phrase, '은/는', lastPos)} ${reg.dependent}에 통계적으로 유의한 정(+)의 영향을 미쳤다`
      );
    }
    if (negSigs.length) {
      const phrase = negSigs.map(formatPredictorPhrase).join(', ');
      const lastNeg = negSigs[negSigs.length - 1].name;
      clauses.push(
        `${josa(phrase, '은/는', lastNeg)} ${reg.dependent}에 통계적으로 유의한 부(-)의 영향을 미쳤다`
      );
    }
    if (sigs.length > 1) {
      const top = [...sigs].sort((a, b) => Math.abs(b.beta ?? 0) - Math.abs(a.beta ?? 0))[0];
      clauses.push(
        `이 중 표준화 계수 기준 ${josa(top.name, '이/가')} 가장 큰 상대적 영향력(β = ${fmtBound(top.beta, 3)})을 보였다`
      );
    }
    if (nonSigs.length) {
      const nsPhrase = nonSigs.map((c) => `${c.name}(t = ${fmtNum(c.t, 2)}, ${fmtShortP(c.p)})`).join(', ');
      const lastNs = nonSigs[nonSigs.length - 1].name;
      clauses.push(
        `반면 ${josa(nsPhrase, '은/는', lastNs)} 통계적으로 유의한 영향을 미치지 않는 것으로 나타났다`
      );
    }
    parts.push(`${clauses.join('. ')}. 따라서 가설 ${josa(reg.hypothesis, '은/는')} ${verdict}되었다.`);
  } else {
    parts.push(
      `모형 전체는 유의하였으나 개별 독립변수 중 유의수준 .05 미만에서 유의한 변수는 확인되지 않아 가설 ${josa(reg.hypothesis, '은/는')} 기각되었다.`
    );
  }

  return parts.join(' ');
}

function formatMediationPath(p: MediationPathResult, concise: boolean): string {
  const statusKor =
    p.status === 'full'
      ? '완전매개'
      : p.status === 'partial'
        ? '부분매개'
        : p.status === 'indirect_only'
          ? '간접효과 유의(매개 작용)'
          : '매개효과 없음';

  if (concise) {
    return `${p.independent} → ${p.mediator} → ${p.dependent}: 간접효과 ab = ${fmtNum(p.indirectEffect, 3)}, Sobel Z = ${fmtNum(p.sobelZ, 2)} (${fmtShortP(p.sobelP)}), Boot 95% CI [${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}] → ${statusKor}.`;
  }

  if (p.status === 'none') {
    const ciStr = `[${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}]`;
    return `${p.independent} → ${p.mediator} → ${p.dependent} 경로의 경우 간접효과는 ${josa(fmtNum(p.indirectEffect, 3), '으로/로')} 나타났으며(Sobel Z = ${fmtNum(p.sobelZ, 2)}, ${fmtShortP(p.sobelP)}; Bootstrap 95% CI ${ciStr}), 매개효과가 통계적으로 유의하지 않았다.`;
  }

  const effectDetail =
    p.status === 'full'
      ? `독립변수가 종속변수에 미치는 직접효과(c' = ${fmtNum(p.cPrime, 3)}, ${fmtShortP(p.pCPrime)})가 매개변수 투입 후 통계적으로 유의하지 않게 되어 완전매개효과가 확인되었다`
      : p.status === 'partial'
        ? `매개변수를 통제한 상태에서도 직접효과(c' = ${fmtNum(p.cPrime, 3)}, ${fmtShortP(p.pCPrime)})가 총효과(c = ${fmtNum(p.cTotal, 3)}, ${fmtShortP(p.pCTotal)}) 대비 감소하면서도 유의하게 유지되어 부분매개효과가 확인되었다`
        : `총효과(c = ${fmtNum(p.cTotal, 3)}, ${fmtShortP(p.pCTotal)})는 비유의적이었으나 경로 a(${fmtNum(p.a, 3)}, ${fmtShortP(p.pA)})와 경로 b(${fmtNum(p.b, 3)}, ${fmtShortP(p.pB)})를 통한 간접효과가 유의한 것으로 확인되었다`;

  const ciStr = `[${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}]`;
  return `${josa(p.independent, '이/가')} ${josa(p.mediator, '을/를')} 경유하여 ${p.dependent}에 미치는 경로를 검증한 결과, ${effectDetail}. 간접효과(B = ${fmtNum(p.indirectEffect, 3)})의 유의성 검증에서도 Sobel Z = ${fmtNum(p.sobelZ, 2)}(${fmtShortP(p.sobelP)})이며, 1,000회 부트스트래핑 95% 신뢰구간이 ${josa(ciStr, '으로/로')} 0을 포함하지 않아 매개효과가 통계적으로 유의한 것으로 지지되었다(${statusKor}).`;
}

function formatModerationSection(mod: ModerationResult): ThesisSection {
  const { xName, wName, yName, step1, step2, r2Change, fChange, pChange, interactionCoeff, significant, simpleSlopes } =
    mod;
  const dirLabel = interactionCoeff.b >= 0 ? '강화하는 정(+)' : '완화하는 부(-)';
  const slopeSummary = simpleSlopes
    .map(
      (s) =>
        `${s.level}(B = ${fmtNum(s.slope, 3)}, SE = ${fmtNum(s.se, 3)}, t = ${fmtNum(s.t, 2)}, ${fmtShortP(s.p)})`
    )
    .join(', ');

  const stdText = significant
    ? `${josa(xName, '과/와')} ${yName} 간의 관계에서 ${josa(wName, '이/가')} 조절역할을 수행하는지 검증하기 위해 독립변수와 조절변수를 평균중심화(mean-centering)한 뒤 위계적 다중회귀분석을 실시하였다. 1단계에서 주효과(${xName}, ${wName})를 투입한 모형의 설명력은 R² = ${fmtBound(step1.r2, 3)}(수정된 R² = ${fmtBound(step1.adjR2, 3)}, F = ${fmtNum(step1.anova.f, 2)}, ${fmtShortP(step1.anova.p)})였으며, 2단계에서 상호작용항(${xName}×${wName})을 추가 투입한 결과 설명력이 ΔR² = ${fmtBound(r2Change, 3)}만큼 통계적으로 유의하게 증가하였다(ΔF = ${fmtNum(fChange, 2)}, ${fmtAcademicP(pChange)}). 상호작용항의 회귀계수 역시 유의한 것으로 나타나(B = ${fmtNum(interactionCoeff.b, 3)}, β = ${fmtBound(interactionCoeff.beta, 3)}, t = ${fmtNum(interactionCoeff.t, 2)}, ${fmtAcademicP(interactionCoeff.p)}), ${josa(wName, '은/는')} ${josa(xName, '이/가')} ${yName}에 미치는 영향을 ${dirLabel} 방향으로 조절하는 것으로 확인되었다. 이어서 단순기울기(Simple Slopes) 분석을 실시한 결과, ${slopeSummary}로 나타났다.`
    : `${josa(xName, '과/와')} ${yName} 간의 관계에서 ${wName}의 조절효과를 검증하기 위해 평균중심화 후 위계적 다중회귀분석을 실시하였다. 1단계 모형(R² = ${fmtBound(step1.r2, 3)})에 상호작용항(${xName}×${wName})을 추가한 2단계 모형의 설명력 변화량은 ΔR² = ${fmtBound(r2Change, 3)}(ΔF = ${fmtNum(fChange, 2)}, ${fmtShortP(pChange)})로 통계적으로 유의하지 않았으며, 상호작용항 회귀계수(B = ${fmtNum(interactionCoeff.b, 3)}, t = ${fmtNum(interactionCoeff.t, 2)}, ${fmtShortP(interactionCoeff.p)}) 또한 유의수준 .05에서 유의하지 않아 ${wName}의 조절효과는 지지되지 않았다.`;

  const conciseText = significant
    ? `[조절효과 채택] ${xName}×${wName} → ${yName} 상호작용항이 유의하였으며(B = ${fmtNum(interactionCoeff.b, 3)}, β = ${fmtBound(interactionCoeff.beta, 3)}, t = ${fmtNum(interactionCoeff.t, 2)}, ${fmtShortP(interactionCoeff.p)}), 모형 설명력이 ΔR² = ${fmtBound(r2Change, 3)}(ΔF = ${fmtNum(fChange, 2)}, ${fmtShortP(pChange)}) 증가하였다.`
    : `[조절효과 기각] ${xName}×${wName} → ${yName} 상호작용항(B = ${fmtNum(interactionCoeff.b, 3)}, ${fmtShortP(interactionCoeff.p)}) 및 ΔR²(${fmtBound(r2Change, 3)})가 통계적으로 유의하지 않았다.`;

  return {
    id: 'moderation',
    stepLabel: '5단계 · 조절효과 검증',
    title: `조절효과 검증 결과 (${xName} × ${wName} → ${yName})`,
    readingGuide: [
      '다중공선성 방지를 위해 독립변수(X)와 조절변수(W)를 평균중심화한 뒤 상호작용항(X×W)을 생성하여 위계적으로 투입합니다.',
      '2단계에서 R² 변화량(ΔR²)과 ΔF 유의확률(p < .05), 그리고 상호작용항(X×W)의 p < .05 여부를 동시에 확인합니다.',
      `조절효과가 유의하면 조절변수 수준(-1 SD, 평균, +1 SD)에 따른 단순기울기(Simple Slopes) 변화로 상호작용 패턴을 해석합니다.`,
    ],
    standardText: stdText,
    conciseText,
  };
}

// ---------- Main Thesis Sentence Generator ----------

export function generateThesisSections(
  bundle: AnalysisBundle,
  hypothesis: HypothesisConfig
): ThesisSection[] {
  const sections: ThesisSection[] = [];

  // 1. EFA & Reliability
  const efa = bundle.efa;
  const rel = bundle.reliability;
  if (efa || rel.length > 0) {
    const cumVar =
      efa && efa.numFactors > 0
        ? efa.varianceExplained[efa.numFactors - 1]?.rotCumPct ?? 0
        : 0;
    const minAlpha = rel.length ? Math.min(...rel.map((r) => r.alpha)) : NaN;
    const maxAlpha = rel.length ? Math.max(...rel.map((r) => r.alpha)) : NaN;
    const allRelOk = rel.every((r) => r.alpha >= 0.6);

    const loadings = efa
      ? efa.rotatedMatrix.map((r) => r.maxAbsLoading).filter((v) => Number.isFinite(v))
      : [];
    const minLoad = loadings.length ? Math.min(...loadings) : NaN;
    const maxLoad = loadings.length ? Math.max(...loadings) : NaN;

    const harmanPct = efa?.harmanSingleFactorPct ?? NaN;
    const harmanOk = Number.isFinite(harmanPct) && harmanPct < 50;
    const harmanSentence =
      efa && Number.isFinite(harmanPct)
        ? ` 또한 동일방법편의(Common Method Bias)를 점검하기 위해 Harman의 단일요인 검정을 실시한 결과, 비회전 제1요인의 분산 설명력이 ${fmtNum(harmanPct, 2)}%로 기준치(50%) ${
            harmanOk ? '미만으로 나타나 동일방법편의의 심각한 우려가 없는 것으로 확인되었다.' : '이상으로 나타나 해석 시 유의할 필요가 있다.'
          }`
        : '';

    const efaSentenceStd = efa
      ? `측정 도구의 구성타당성을 검증하기 위해 총 ${efa.n}명의 응답(측정 문항 ${efa.p}개)을 대상으로 주성분분석(PCA)과 베리맥스(Varimax) 직각회전을 이용한 탐색적 요인분석을 실시하였다. 분석 결과 표본적합도(KMO)는 ${josa(fmtBound(efa.kmo, 3), '으로/로')} 기준치(.60)를 상회하였으며, Bartlett의 구형성 검정 결과 역시 통계적으로 유의하여(χ² = ${fmtNum(efa.bartlettChi2, 2)}, df = ${efa.bartlettDf}, ${fmtAcademicP(efa.bartlettP)}) 요인분석에 적합한 자료임이 확인되었다. 고유값 1.0 이상을 기준으로 총 ${efa.numFactors}개의 요인이 추출되었으며, 전체 분산의 ${fmtNum(cumVar, 2)}%를 설명하였다. 모든 측정 문항의 요인적재량은 ${fmtBound(minLoad, 3)}~${fmtBound(maxLoad, 3)} 범위로 나타났다.${harmanSentence}`
      : '';

    const relDetailStr = rel
      .map((r) => `${r.constructName}(${r.nItems}문항, α = ${fmtBound(r.alpha, 3)})`)
      .join(', ');

    const relSentenceStd = rel.length
      ? `다음으로 내적 일관성을 검증하기 위해 Cronbach’s α 계수를 산출한 결과, ${relDetailStr}로 나타나 모든 변수의 신뢰도 계수가 ${fmtBound(minAlpha, 3)}~${fmtBound(maxAlpha, 3)} 범위에 분포하여 ${
          allRelOk ? '수용 기준(.60 이상)을 충족하는 양호한 수준으로 확인되었다.' : '일부 척도의 문항 정제 여부를 점검할 필요가 있다.'
        }`
      : '';

    const efaSentenceConcise = efa
      ? `탐색적 요인분석(PCA · Varimax) 결과 KMO = ${fmtBound(efa.kmo, 3)}, Bartlett χ² = ${fmtNum(efa.bartlettChi2, 2)}(${fmtShortP(efa.bartlettP)})로 나타났으며, 고유값 1.0 이상 ${efa.numFactors}개 요인이 총 분산의 ${fmtNum(cumVar, 1)}%를 설명하였다(Harman 단일요인 ${fmtNum(harmanPct, 1)}%).`
      : '';

    const relSentenceConcise = rel.length
      ? `신뢰도(Cronbach’s α)는 ${fmtBound(minAlpha, 3)}~${fmtBound(maxAlpha, 3)}로 ${relDetailStr} 모두 기준치(.60)를 상회하였다.`
      : '';

    const readingGuide: string[] = [];
    if (efa) {
      readingGuide.push(
        `표본적합도: KMO(${fmtBound(efa.kmo, 3)})가 0.6 이상이고 Bartlett 유의확률(${fmtShortP(efa.bartlettP)})이 0.05 미만이면 요인분석에 적합합니다.`
      );
      readingGuide.push(
        `요인 추출: 고유값 1.0 이상인 요인이 ${efa.numFactors}개 추출되었고 누적 설명력은 ${fmtNum(cumVar, 2)}%입니다. 회전된 성분 행렬에서 동일 개념 문항끼리 묶였는지 확인합니다.`
      );
      if (Number.isFinite(harmanPct)) {
        readingGuide.push(
          `공통방법편의(Harman’s Test): 비회전 제1요인 설명분산(${fmtNum(harmanPct, 2)}%)이 50% 미만이면 단일 응답원천 편향 우려가 낮습니다.`
        );
      }
    }
    if (rel.length) {
      readingGuide.push(
        `신뢰도: Cronbach’s α가 0.6 이상(학술 권장 0.7 이상)이면 내적 일관성이 확보된 것으로 해석합니다(현재 ${fmtBound(minAlpha, 3)}~${fmtBound(maxAlpha, 3)}).`
      );
    }

    sections.push({
      id: 'efa_rel',
      stepLabel: '1~2단계 · 타당성 및 신뢰도',
      title: '측정 도구의 타당성 및 신뢰도 검증 결과',
      readingGuide,
      standardText: [efaSentenceStd, relSentenceStd].filter(Boolean).join('\n\n'),
      conciseText: [efaSentenceConcise, relSentenceConcise].filter(Boolean).join(' '),
    });
  }

  // 2. Descriptives & Correlation
  if (bundle.composites.length > 0 && bundle.correlation.names.length > 0) {
    const descList = bundle.composites
      .map((c) => `${c.name}(M = ${fmtNum(c.mean, 2)}, SD = ${fmtNum(c.sd, 2)})`)
      .join(', ');
    const maxSkew = Math.max(...bundle.composites.map((c) => Math.abs(c.skewness || 0)));
    const maxKurt = Math.max(...bundle.composites.map((c) => Math.abs(c.kurtosis || 0)));

    const pairs: { a: string; b: string; r: number; p: number }[] = [];
    const { names, matrix } = bundle.correlation;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const cell = matrix[i][j];
        if (Number.isFinite(cell.r)) {
          pairs.push({ a: names[i], b: names[j], r: cell.r, p: cell.p });
        }
      }
    }
    const maxAbsR = pairs.length ? Math.max(...pairs.map((x) => Math.abs(x.r))) : 0;
    const sigPairs = pairs
      .filter((x) => x.p < 0.05)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const depPairs = sigPairs
      .filter(
        (x) =>
          x.a === hypothesis.dependent ||
          x.b === hypothesis.dependent ||
          x.a === hypothesis.mediator ||
          x.b === hypothesis.mediator
      )
      .slice(0, 4);

    const corrHighlight = depPairs.length
      ? depPairs
          .map((x) => `${josa(x.a, '과/와')} ${x.b}(r = ${fmtBound(x.r, 3)}, ${fmtShortP(x.p)})`)
          .join(', ')
      : sigPairs
          .slice(0, 3)
          .map((x) => `${josa(x.a, '과/와')} ${x.b}(r = ${fmtBound(x.r, 3)}, ${fmtShortP(x.p)})`)
          .join(', ');

    const normalSentence =
      maxSkew < 2 && maxKurt < 7
        ? `또한 왜도(|Skew| ≤ ${fmtNum(maxSkew, 2)} < 2)와 첨도(|Kurt| ≤ ${fmtNum(maxKurt, 2)} < 7)가 모두 정규분포 가정 기준을 충족하였다.`
        : `왜도 최댓값은 ${fmtNum(maxSkew, 2)}, 첨도 최댓값은 ${fmtNum(maxKurt, 2)}으로 확인되었다.`;

    const stdText = `연구에 투입된 주요 변수의 기술통계량을 산출한 결과, ${descList}로 나타났다. ${normalSentence}\n\n변수 간 관련성과 판별타당성을 확인하기 위해 Pearson 이변량 상관분석을 실시한 결과, ${
      corrHighlight
        ? `${corrHighlight} 등 주요 연구변수 간에 유의한 상관관계가 확인되었다.`
        : '변수 간 상관계수를 산출하였다.'
    } 모든 상관계수의 절댓값 최댓값은 ${josa(fmtBound(maxAbsR, 3), '으로/로')} 기준치(.85) 미만으로 나타나 변수 간 판별타당성이 확보되었으며 다중공선성의 우려가 낮은 것으로 판단된다.`;

    const conciseText = `기술통계 결과 ${descList}였으며 정규성 기준(|왜도| < 2, |첨도| < 7)을 충족하였다. Pearson 상관분석 결과 ${
      corrHighlight ? `${corrHighlight} 등이 유의하였으며` : ''
    } 모든 상관계수가 ${fmtBound(maxAbsR, 3)} 이하로 다중공선성 우려가 없었다.`;

    sections.push({
      id: 'desc_corr',
      stepLabel: '3~4단계 · 기술통계 및 상관분석',
      title: '주요 변수의 기술통계 및 상관관계 분석 결과',
      readingGuide: [
        `평균(M)과 표준편차(SD)로 응답 분포의 중심과 퍼짐 정도를 확인하고, 왜도(< 2)·첨도(< 7)로 정규성을 점검합니다.`,
        `상관계수(r)의 부호(+/-)로 관계의 방향을, 유의확률(p < .05)로 통계적 유의성을 확인합니다.`,
        `상관계수 절댓값이 0.85 미만(최대 ${fmtBound(maxAbsR, 3)})이므로 독립변수 간 지나친 중복(다중공선성) 위험이 낮습니다.`,
      ],
      standardText: stdText,
      conciseText,
    });
  }

  // 3. Regression H1~H3
  if (bundle.regressions.length > 0) {
    const stdParagraphs = bundle.regressions.map((reg) => formatRegressionSentence(reg, false));
    const conciseParagraphs = bundle.regressions.map((reg) => formatRegressionSentence(reg, true));

    const guide = bundle.regressions.map((reg) => {
      const ctrlSet = new Set(reg.controls ?? []);
      const sigs = reg.coeffs.filter(
        (c) => c.name !== '(상수)' && !ctrlSet.has(c.name) && c.p < 0.05
      );
      const top = [...sigs].sort((a, b) => Math.abs(b.beta ?? 0) - Math.abs(a.beta ?? 0))[0];
      const verdict = getHypothesisVerdict(reg);
      return `${reg.hypothesis} (${reg.label}) → [${verdict}]: 설명력(수정 R²) ${(reg.adjR2 * 100).toFixed(1)}%, F = ${fmtNum(reg.anova.f, 2)}(${fmtShortP(reg.anova.p)}) · ${
        top
          ? `유의한 변수 ${sigs.length}개 (가장 큰 영향: ${top.name}, β = ${fmtBound(top.beta, 3)})`
          : '유의한 독립변수 없음'
      }`;
    });

    sections.push({
      id: 'regression',
      stepLabel: '5단계 · 가설검정 (H1~H3)',
      title: '연구가설(H1~H3) 다중회귀분석 검증 결과',
      readingGuide: [
        '모형 요약(수정된 R²)으로 설명력을 확인하고, ANOVA(F, p)로 회귀모형 전체의 유의성을 먼저 판정합니다.',
        '계수표에서 각 독립변수의 p < .05 여부와 표준화 계수(β) 크기, VIF(< 10)를 확인합니다.',
        ...guide,
      ],
      standardText: stdParagraphs.join('\n\n'),
      conciseText: conciseParagraphs.join('\n'),
    });
  }

  // 4. Mediation
  const med = bundle.mediation;
  const s4 = med?.step4Regression;
  if (med && s4 && med.paths.length > 0) {
    const medCoeff = s4.coeffs.find((c) => c.name === hypothesis.mediator);
    const indepStr = hypothesis.independents.join(', ');
    const lastIndep = hypothesis.independents[hypothesis.independents.length - 1] ?? indepStr;

    const headerStd = `${josa(hypothesis.mediator, '이/가')} ${josa(indepStr, '과/와', lastIndep)} ${hypothesis.dependent} 간의 관계를 매개하는지 검증하기 위해 Baron과 Kenny의 3단계 회귀절차와 Sobel 검정 및 부트스트래핑(1,000회)을 실시하였다. 앞서 H1(독립→매개)과 H2(매개→종속) 모형이 검증된 데 이어, 독립변수와 매개변수(${hypothesis.mediator})를 동시에 투입한 4단계 모형의 설명력(수정된 R²)은 ${fmtBound(s4.adjR2, 3)}(${(s4.adjR2 * 100).toFixed(1)}%)으로 유의하였으며(F = ${fmtNum(s4.anova.f, 2)}, ${fmtShortP(s4.anova.p)})${
      med.r2ChangeFromH3 !== null
        ? `, H3 모형 대비 R² 변화량(ΔR² = ${fmtBound(med.r2ChangeFromH3, 3)}, ΔF = ${fmtNum(med.fChangeFromH3, 2)}, ${fmtShortP(med.pChangeFromH3)})을 보였다.`
        : '.'
    }${
      medCoeff
        ? ` 이 모형에서 매개변수 ${josa(hypothesis.mediator, '은/는')} 종속변수 ${hypothesis.dependent}에 ${
            medCoeff.p < 0.05 ? '통계적으로 유의한' : '유의하지 않은'
          } 영향(B = ${fmtNum(medCoeff.b, 3)}, β = ${fmtBound(medCoeff.beta, 3)}, ${fmtShortP(medCoeff.p)})을 미쳤다.`
        : ''
    }`;

    const pathStd = med.paths.map((p) => formatMediationPath(p, false)).join('\n\n');
    const pathConcise = med.paths.map((p) => formatMediationPath(p, true)).join('\n');

    const sigPaths = med.paths.filter((p) => p.status !== 'none');

    sections.push({
      id: 'mediation',
      stepLabel: '5단계 · 매개효과 검증',
      title: '매개효과 검증 결과 (Baron & Kenny · Sobel · Bootstrap)',
      readingGuide: [
        '4단계 회귀모형에서 매개변수(M) 투입 후 독립변수(X)의 직접효과(c’)가 사라지면 완전매개, 감소하면서 유의하면 부분매개입니다.',
        '간접효과(a×b)는 Sobel Z p < .05 또는 Bootstrap 95% 신뢰구간([LLCI, ULCI])이 0을 포함하지 않을 때 통계적으로 유의합니다.',
        `현재 매개 경로 ${med.paths.length}개 중 유의한 매개효과가 확인된 경로는 ${sigPaths.length}개입니다.`,
      ],
      standardText: `${headerStd}\n\n${pathStd}`,
      conciseText: `4단계 모형(R² = ${fmtBound(s4.r2, 3)}, ΔR² = ${fmtBound(med.r2ChangeFromH3, 3)}, ${fmtShortP(med.pChangeFromH3)}) 검증 결과:\n${pathConcise}`,
    });
  }

  // 4.5. Moderation (if configured)
  if (bundle.moderation) {
    sections.push(formatModerationSection(bundle.moderation));
  }

  // 5. Overall Conclusion Draft
  if (bundle.regressions.length > 0) {
    const h1 = bundle.regressions.find((r) => r.id === 'H1');
    const h2 = bundle.regressions.find((r) => r.id === 'H2');
    const h3 = bundle.regressions.find((r) => r.id === 'H3');

    const h1Ctrl = new Set(h1?.controls ?? []);
    const h1Sigs = (h1?.coeffs.filter((c) => c.name !== '(상수)' && !h1Ctrl.has(c.name) && c.p < 0.05) ?? []).map(
      (c) => c.name
    );
    const h1Verdict = h1 ? getHypothesisVerdict(h1) : '기각';

    const h3Ctrl = new Set(h3?.controls ?? []);
    const h3Sigs = (h3?.coeffs.filter((c) => c.name !== '(상수)' && !h3Ctrl.has(c.name) && c.p < 0.05) ?? []).map(
      (c) => c.name
    );
    const h3Verdict = h3 ? getHypothesisVerdict(h3) : '기각';

    const medSigs =
      bundle.mediation?.paths
        .filter((p) => p.status !== 'none')
        .map(
          (p) =>
            `${p.independent}(${p.status === 'full' ? '완전매개' : p.status === 'partial' ? '부분매개' : '간접효과 유의'})`
        ) ?? [];

    const modClause = bundle.moderation
      ? bundle.moderation.significant
        ? `조절효과 검증 결과 ${josa(bundle.moderation.wName, '은/는')} ${bundle.moderation.xName}→${bundle.moderation.yName} 관계를 통계적으로 유의하게 조절하는 것으로 확인되었다(ΔR² = ${fmtBound(bundle.moderation.r2Change, 3)}, ${fmtShortP(bundle.moderation.pChange)}).`
        : `${bundle.moderation.wName}의 조절효과(${bundle.moderation.xName}×${bundle.moderation.wName})는 통계적으로 유의하지 않았다(${fmtShortP(bundle.moderation.pChange)}).`
      : '';

    const parts: string[] = [];
    if (h1) {
      parts.push(
        h1Sigs.length
          ? `${josa(h1Sigs.join(', '), '은/는', h1Sigs[h1Sigs.length - 1])} ${josa(hypothesis.mediator, '을/를')} 통계적으로 유의하게 향상시키는 핵심 선행요인으로 확인되었다(H1 ${h1Verdict}).`
          : `H1 모형에서 독립변수가 ${hypothesis.mediator}에 미치는 영향을 검증하였으나 유의한 변수가 확인되지 않았다(H1 ${h1Verdict}).`
      );
    }
    if (h2) {
      parts.push(
        h2.anova.p < 0.05
          ? `${josa(hypothesis.mediator, '은/는')} ${hypothesis.dependent}에 유의한 영향을 미쳐(β = ${fmtBound(h2.coeffs.find((c) => c.name !== '(상수)' && !(h2.controls ?? []).includes(c.name))?.beta, 3)}, ${fmtShortP(h2.anova.p)}) H2가 채택되었다.`
          : `H2 모형에서 ${josa(hypothesis.mediator, '이/가')} ${hypothesis.dependent}에 미치는 영향은 통계적으로 유의하지 않았다(H2 ${getHypothesisVerdict(h2)}).`
      );
    }
    if (h3) {
      parts.push(
        h3Sigs.length
          ? `${hypothesis.dependent}에 직접적으로 유의한 영향을 미치는 요인은 ${josa(h3Sigs.join(', '), '으로/로', h3Sigs[h3Sigs.length - 1])} 확인되었다(H3 ${h3Verdict}).`
          : `${hypothesis.dependent}에 대한 H3 직접모형에서 통계적으로 유의한 독립변수가 확인되지 않았다(H3 ${h3Verdict}).`
      );
    }
    if (medSigs.length) {
      parts.push(
        `매개효과 검증 결과 ${medSigs.join(', ')} 경로에서 ${hypothesis.mediator}의 유의한 매개 작용이 입증되어, 선행요인이 ${josa(hypothesis.mediator, '을/를')} 통해 ${hypothesis.dependent}으로 이어지는 과정적 메커니즘을 실증적으로 확인하였다.`
      );
    }
    if (modClause) {
      parts.push(modClause.trim());
    }

    const ordinals = ['첫째, ', '둘째, ', '셋째, ', '넷째, ', '다섯째, '];
    const stdConclusion = `이상의 실증분석 결과를 종합하면 다음과 같다. ${parts
      .map((p, idx) => `${ordinals[idx] ?? ''}${p}`)
      .join(' ')}`;

    const conciseParts: string[] = [];
    if (h1) conciseParts.push(`H1(${h1Sigs.join(', ') || '검증'} → ${hypothesis.mediator}, ${h1Verdict})`);
    if (h2) conciseParts.push(`H2(${hypothesis.mediator} → ${hypothesis.dependent}, ${getHypothesisVerdict(h2)})`);
    if (h3) conciseParts.push(`H3(${h3Sigs.join(', ') || '검증'} → ${hypothesis.dependent}, ${h3Verdict})`);
    if (medSigs.length) conciseParts.push(`매개경로(${medSigs.join(', ')})`);
    if (bundle.moderation) {
      conciseParts.push(
        `조절효과(${bundle.moderation.xName}×${bundle.moderation.wName}: ${bundle.moderation.significant ? '유의' : '비유의'})`
      );
    }
    const conciseConclusion = `요약: ${conciseParts.join(', ')} 결과를 확인하였다.`;

    sections.push({
      id: 'conclusion',
      stepLabel: '종합 결론 초안',
      title: '논문 논의 및 결론 요약 문단',
      readingGuide: [
        '각 단계의 가설 채택 여부와 매개·조절 메커니즘을 한 문단으로 요약하여 논문 ‘결론 및 시사점’ 절의 도입부로 활용할 수 있습니다.',
      ],
      standardText: stdConclusion,
      conciseText: conciseConclusion,
    });
  }

  return sections;
}

