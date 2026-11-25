import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Play, SlidersHorizontal } from 'lucide-react';
import {
  CompositeSummary,
  HypothesisConfig,
  MediationAnalysisResult,
  ModerationResult,
  RegressionResult,
  SectionVerificationResult,
  StepIssue,
} from '../../types/stats';
import { buildDefaultPaths } from '../../utils/researchModel';
import { fmtNum, fmtP, getHypothesisVerdict, sigStars } from '../../utils/statistics';
import { ThesisSection } from '../../utils/thesisWriter';
import { CopyTableButton } from '../CopyTableButton';
import { PathDiagram } from '../PathDiagram';
import { ScrollableTable } from '../ScrollableTable';
import { SPSSGuideBar } from '../SPSSGuideBar';
import { StepFooterNav } from '../StepFooterNav';
import { StepIssuesAlert } from '../StepIssuesAlert';
import { ThesisSentenceCard } from '../ThesisSentenceCard';

interface StepRegressionProps {
  regressions: RegressionResult[];
  mediation: MediationAnalysisResult | null;
  moderation: ModerationResult | null;
  composites: CompositeSummary[];
  hypothesis: HypothesisConfig;
  issues?: StepIssue[];
  regressionThesis?: ThesisSection;
  mediationThesis?: ThesisSection;
  moderationThesis?: ThesisSection;
  regressionVerification?: SectionVerificationResult;
  mediationVerification?: SectionVerificationResult;
  moderationVerification?: SectionVerificationResult;
  onUpdateModeration: (x?: string, w?: string, y?: string) => void;
  onGoToMapping?: () => void;
  onRunRegression?: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const SPSS_REG_STEPS = [
  '가설 표대로 종속변수와 독립변수를 각각 입력합니다 (H1 → H2 → H3 순서대로 실행).',
  '[통계량] 창에서 R 제곱 변화량, 공선성 진단(VIF), Durbin-Watson 3개를 체크 → 계속 → 확인.',
  '결과 읽기 순서: 모형 요약(수정된 R²) → ANOVA(F 유의확률) → 계수(유의확률 p & 표준화 계수 β).',
];

const RegressionBlock: React.FC<{ reg: RegressionResult }> = ({ reg }) => {
  const [showAnova, setShowAnova] = useState(false);

  const coeffHeaders = ['변수', 'B', '표준오차(SE)', '표준화(β)', 't', '유의확률(p)', '공차(Tolerance)', 'VIF'];
  const coeffRows = reg.coeffs.map((c) => [
    c.name,
    fmtNum(c.b, 3),
    fmtNum(c.se, 3),
    c.beta !== null ? fmtNum(c.beta, 3) : '',
    fmtNum(c.t, 3),
    fmtP(c.p),
    c.tolerance !== null ? fmtNum(c.tolerance, 3) : '',
    c.vif !== null ? fmtNum(c.vif, 3) : '',
  ]);

  const ctrlSet = new Set(reg.controls ?? []);
  const predictors = reg.coeffs.filter((c) => c.name !== '(상수)' && !ctrlSet.has(c.name));
  const sigPredictors = predictors
    .filter((c) => c.p < 0.05)
    .sort((a, b) => Math.abs(b.beta ?? 0) - Math.abs(a.beta ?? 0));
  const modelSig = reg.anova.p < 0.05;
  const verdict = reg.id === 'H4' || reg.id.startsWith('MOD') ? null : getHypothesisVerdict(reg);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pb-4 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-700">{reg.hypothesis}</span>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">{reg.label}</h3>
            {verdict && (
              <span
                className={`text-xs font-bold ${
                  verdict === '채택'
                    ? 'text-emerald-700'
                    : verdict === '부분 채택'
                      ? 'text-blue-700'
                      : 'text-slate-500'
                }`}
              >
                · {verdict}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
            N = {reg.n} · 투입변수 {reg.k}개 · Durbin-Watson = {fmtNum(reg.durbinWatson, 3)}
            {reg.controls && reg.controls.length > 0 && ` · 통제: ${reg.controls.join(', ')}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAnova((v) => !v)}
            className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300/90 bg-white text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showAnova ? 'ANOVA 숨기기' : 'ANOVA 표 보기'}
          </button>
          <CopyTableButton headers={coeffHeaders} rows={coeffRows} />
        </div>
      </div>

      {/* Model Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 py-4 border-b border-slate-200 text-left">
        <div>
          <div className="text-xs text-slate-600">수정된 R² (설명력)</div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {fmtNum(reg.adjR2, 3)}{' '}
            <span className="text-xs font-normal text-slate-500">({(reg.adjR2 * 100).toFixed(1)}%)</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600">R²</div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-800 mt-0.5">
            {fmtNum(reg.r2, 3)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600">F 통계량</div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-800 mt-0.5">
            {fmtNum(reg.anova.f, 2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600">모형 유의확률 (p)</div>
          <div
            className={`text-lg sm:text-xl font-bold font-mono tabular-nums mt-0.5 ${
              modelSig ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {fmtP(reg.anova.p)}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 flex items-center justify-between sm:block">
          <div className="text-xs text-slate-600">Durbin-Watson</div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-800 sm:mt-0.5">
            {fmtNum(reg.durbinWatson, 3)}
          </div>
        </div>
      </div>

      {/* Optional ANOVA table */}
      {showAnova && (
        <ScrollableTable className="mt-4">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">ANOVA 모형</th>
                <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">제곱합</th>
                <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">자유도</th>
                <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">평균제곱</th>
                <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">F</th>
                <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">유의확률(p)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3.5 py-2.5 font-medium text-slate-800 whitespace-nowrap">회귀모형</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(reg.anova.ssReg, 3)}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{reg.anova.dfReg}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(reg.anova.msReg, 3)}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap">{fmtNum(reg.anova.f, 3)}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap">{fmtP(reg.anova.p)}</td>
              </tr>
              <tr>
                <td className="px-3.5 py-2.5 font-medium text-slate-800 whitespace-nowrap">잔차</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(reg.anova.ssRes, 3)}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{reg.anova.dfRes}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(reg.anova.msRes, 3)}</td>
                <td className="px-3.5 py-2.5 text-right text-slate-300">—</td>
                <td className="px-3.5 py-2.5 text-right text-slate-300">—</td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">합계</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(reg.anova.ssTot, 3)}</td>
                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{reg.anova.dfTot}</td>
                <td className="px-3.5 py-2.5 text-right text-slate-300">—</td>
                <td className="px-3.5 py-2.5 text-right text-slate-300">—</td>
                <td className="px-3.5 py-2.5 text-right text-slate-300">—</td>
              </tr>
            </tbody>
          </table>
        </ScrollableTable>
      )}

      {/* Coefficients Table */}
      <ScrollableTable className="mt-4">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
            <tr>
              <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap min-w-[120px]">변수</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">비표준화 B</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">표준오차</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">표준화 β</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">t</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">유의확률(p)</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">공차</th>
              <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">VIF</th>
              <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">판정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {reg.coeffs.map((c) => {
              const isConst = c.name === '(상수)';
              const isCtrl = ctrlSet.has(c.name);
              const sig = c.p < 0.05;
              const dir = c.b > 0 ? '정(+) 영향' : '부(-) 영향';
              const vifWarn = c.vif !== null && c.vif >= 10;
              return (
                <tr
                  key={c.name}
                  className={
                    isConst
                      ? 'bg-slate-50/40 text-slate-500'
                      : isCtrl
                        ? 'bg-slate-50/20 text-slate-700'
                        : 'hover:bg-slate-50/80'
                  }
                >
                  <td className="px-3.5 py-3 font-semibold text-slate-900 whitespace-nowrap">
                    {c.name}
                    {isCtrl && <span className="ml-1.5 text-xs font-normal text-slate-500">(통제)</span>}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(c.b, 3)}</td>
                  <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">{fmtNum(c.se, 3)}</td>
                  <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                    {c.beta !== null ? fmtNum(c.beta, 3) : '—'}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(c.t, 2)}</td>
                  <td
                    className={`px-3.5 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                      !isConst && sig ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {fmtP(c.p)}
                    {!isConst && sigStars(c.p)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {c.tolerance !== null ? fmtNum(c.tolerance, 3) : '—'}
                  </td>
                  <td
                    className={`px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      vifWarn ? 'text-red-700 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {c.vif !== null ? fmtNum(c.vif, 3) : '—'}
                  </td>
                  <td
                    className={`px-3.5 py-3 font-semibold whitespace-nowrap ${
                      isConst ? 'text-slate-400' : sig ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {isConst ? '—' : sig ? `${isCtrl ? '통제 유의 ' : '유의한 '}${dir}` : '영향 없음'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollableTable>

      {/* Interpretation line */}
      <div className="mt-4 text-xs sm:text-sm text-slate-700 leading-relaxed space-y-1.5">
        <div>
          <span className="font-bold text-slate-900">해석 요약: </span>
          {modelSig ? (
            sigPredictors.length ? (
              <>
                모형은 통계적으로 유의하며(F={fmtNum(reg.anova.f, 2)}, {fmtP(reg.anova.p)}), 설명력은{' '}
                <span className="font-mono font-semibold">{(reg.adjR2 * 100).toFixed(1)}%</span>입니다.{' '}
                {sigPredictors.map((sp) => `${sp.name}(β=${fmtNum(sp.beta, 3)})`).join(', ')}이(가) 유의한 영향을 미치며,{' '}
                <span className="font-semibold text-blue-800">{sigPredictors[0].name}</span>의 영향력이 가장 큽니다.
                {verdict && (
                  <span className="ml-1 font-semibold text-slate-900">
                    (가설 {reg.hypothesis}: {verdict})
                  </span>
                )}
              </>
            ) : (
              <>모형 F값은 유의하나 개별 독립변수 중 p &lt; .05 수준에서 유의한 변수는 없습니다 (기각).</>
            )
          ) : (
            <>회귀모형이 통계적으로 유의하지 않습니다(p ≥ .05 · 기각).</>
          )}
        </div>
        {reg.id === 'H3' && (
          <p className="text-xs text-slate-600">
            ※ H3에서 변수 계산 시 괄호를 누락하면 상이한 결과가 나올 수 있습니다. 본 앱은 괄호를 자동 적용하여 정확한 합변수로 계산합니다.
          </p>
        )}
      </div>
    </div>
  );
};

const MappingDiagnosticBanner: React.FC<{
  hypothesis: HypothesisConfig;
  composites: CompositeSummary[];
  regressionsCount: number;
  onGoToMapping?: () => void;
  onRunRegression?: () => void;
}> = ({ hypothesis, composites, regressionsCount, onGoToMapping, onRunRegression }) => {
  const compSet = new Set(composites.filter((c) => c.n > 0).map((c) => c.name));
  const missingItems: string[] = [];
  if (!hypothesis.independents.length) {
    missingItems.push('독립변수(X)가 지정되지 않았습니다.');
  } else {
    const invalidX = hypothesis.independents.filter((n) => !compSet.has(n));
    if (invalidX.length) {
      missingItems.push(`독립변수 [${invalidX.join(', ')}]의 유효 수치 합변수가 없습니다.`);
    }
  }
  if (!hypothesis.dependent) {
    missingItems.push('종속변수(Y)가 지정되지 않았습니다.');
  } else if (!compSet.has(hypothesis.dependent)) {
    missingItems.push(`종속변수 [${hypothesis.dependent}]의 유효 수치 합변수가 없습니다.`);
  }
  if (hypothesis.dependent && hypothesis.independents.includes(hypothesis.dependent)) {
    missingItems.push('독립변수(X)와 종속변수(Y)가 동일한 변수로 지정되었습니다.');
  }

  const canRun = missingItems.length === 0;
  const paths =
    hypothesis.paths && hypothesis.paths.length > 0
      ? hypothesis.paths
      : buildDefaultPaths(hypothesis);

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${
        canRun
          ? 'bg-slate-50/90 border-slate-200/90'
          : 'bg-amber-50/70 border-amber-300'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {canRun ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">
              회귀분석 변수 매핑 · 모형 진단 상태
              {hypothesis.modelName ? ` (${hypothesis.modelName})` : ''}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {canRun
                ? `0단계에서 매핑한 X·Y 변수가 정상 연결되어 ${regressionsCount}개 회귀 모형이 준비되었습니다.`
                : '아래 누락 항목을 확인하고 0단계 변수 매핑에서 변수를 지정해 주세요.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onGoToMapping && (
            <button
              type="button"
              onClick={onGoToMapping}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 min-h-[38px] text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>0단계 변수 매핑 확인하기</span>
            </button>
          )}
          {onRunRegression && (
            <button
              type="button"
              onClick={onRunRegression}
              disabled={!canRun}
              title={canRun ? '현재 매핑으로 회귀분석 실행' : missingItems.join(' ')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 min-h-[38px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>회귀분석 실행</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
          <span className="text-slate-500 font-medium">독립변수(X): </span>
          <span className={hypothesis.independents.length ? 'font-bold text-slate-900' : 'font-bold text-red-600'}>
            {hypothesis.independents.length ? hypothesis.independents.join(', ') : '미지정 (누락)'}
          </span>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
          <span className="text-slate-500 font-medium">매개변수(M): </span>
          <span className="font-semibold text-blue-700">
            {hypothesis.mediator || '선택 안 함 (직접회귀)'}
          </span>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
          <span className="text-slate-500 font-medium">종속변수(Y): </span>
          <span className={hypothesis.dependent ? 'font-bold text-emerald-700' : 'font-bold text-red-600'}>
            {hypothesis.dependent || '미지정 (누락)'}
          </span>
        </div>
      </div>

      {paths.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-600">연결된 가설 경로:</span>
          {paths.map((p) => (
            <span
              key={`${p.id}-${p.from}-${p.to}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 font-medium"
            >
              <span className="font-mono font-bold text-blue-700">{p.id}</span>
              <span>{p.from} → {p.to}</span>
            </span>
          ))}
        </div>
      )}

      {missingItems.length > 0 && (
        <ul className="text-xs text-amber-900 space-y-1 list-disc list-inside bg-white/80 rounded-xl px-3.5 py-2.5 border border-amber-200">
          {missingItems.map((msg) => (
            <li key={msg} className="font-medium">
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const StepRegression: React.FC<StepRegressionProps> = ({
  regressions,
  mediation,
  moderation,
  composites,
  hypothesis,
  issues = [],
  regressionThesis,
  mediationThesis,
  moderationThesis,
  regressionVerification,
  mediationVerification,
  moderationVerification,
  onUpdateModeration,
  onGoToMapping,
  onRunRegression,
  onPrev,
  onNext,
}) => {
  if (!regressions.length) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              5. 회귀분석 (H1~H3) · 매개 및 조절효과 검증
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              0단계 변수 매핑이 완료되면 회귀분석과 매개·조절효과가 자동으로 실행됩니다.
            </p>
          </div>
          <MappingDiagnosticBanner
            hypothesis={hypothesis}
            composites={composites}
            regressionsCount={0}
            onGoToMapping={onGoToMapping}
            onRunRegression={onRunRegression}
          />
          {issues.length > 0 && <StepIssuesAlert issues={issues} title="회귀·매개분석 진단" />}
        </div>
        <StepFooterNav prevLabel="4. 상관분석" nextLabel="6. 결과 요약 & 논문 문장 작성" onPrev={onPrev} onNext={onNext} />
      </div>
    );
  }

  const h1 = regressions.find((r) => r.id === 'H1');
  const h2 = regressions.find((r) => r.id === 'H2');
  const h3 = regressions.find((r) => r.id === 'H3');

  const medHeaders = [
    '독립변수(X)',
    'a (X→M)',
    'b (M→Y)',
    '총효과 c',
    "직접효과 c'",
    '간접효과 (a×b)',
    'Sobel Z',
    'Sobel p',
    'Boot 95% CI',
    '매개 판정',
  ];
  const medRows =
    mediation?.paths.map((p) => [
      p.independent,
      `${fmtNum(p.a, 3)}${sigStars(p.pA)}`,
      `${fmtNum(p.b, 3)}${sigStars(p.pB)}`,
      `${fmtNum(p.cTotal, 3)}${sigStars(p.pCTotal)}`,
      `${fmtNum(p.cPrime, 3)}${sigStars(p.pCPrime)}`,
      fmtNum(p.indirectEffect, 3),
      fmtNum(p.sobelZ, 3),
      fmtP(p.sobelP),
      `[${fmtNum(p.bootCiLow, 3)}, ${fmtNum(p.bootCiHigh, 3)}]`,
      p.status === 'full'
        ? '완전매개'
        : p.status === 'partial'
          ? '부분매개'
          : p.status === 'indirect_only'
            ? '간접효과 유의'
            : '매개 없음',
    ]) ?? [];

  const compNames = composites.map((c) => c.name);
  const modX = hypothesis.moderationX ?? '';
  const modW = hypothesis.moderator ?? '';
  const modY = hypothesis.moderationY ?? '';
  const hasSameVarError = Boolean(
    modX && modW && modY && (modX === modW || modX === modY || modW === modY)
  );

  const modCoeffHeaders = ['변수', 'B', 'SE', 'β', 't', 'p', 'VIF'];
  const modCoeffRows =
    moderation?.step2.coeffs.map((c) => [
      c.name,
      fmtNum(c.b, 3),
      fmtNum(c.se, 3),
      c.beta !== null ? fmtNum(c.beta, 3) : '',
      fmtNum(c.t, 3),
      fmtP(c.p),
      c.vif !== null ? fmtNum(c.vif, 3) : '',
    ]) ?? [];

  return (
    <div className="space-y-6">
      {/* Header, SPSS Guide & Path Diagram */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
        <div className="pb-4 border-b border-slate-200">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">5. 회귀분석 (H1~H3) · 매개 및 조절효과 검증</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
            다중선형회귀분석으로 가설 H1~H3을 순차 검정하고, Baron &amp; Kenny · Sobel · Bootstrap 매개효과 및 위계적 조절효과를 검증합니다.
          </p>
        </div>

        <SPSSGuideBar
          menuPath="분석 → 회귀분석 → 선형 · 통계량: R제곱 변화량, 공선성 진단, Durbin-Watson"
          steps={SPSS_REG_STEPS}
        />

        <MappingDiagnosticBanner
          hypothesis={hypothesis}
          composites={composites}
          regressionsCount={regressions.length}
          onGoToMapping={onGoToMapping}
          onRunRegression={onRunRegression}
        />

        {issues.length > 0 && <StepIssuesAlert issues={issues} />}

        <PathDiagram
          h1={h1}
          h2={h2}
          h3={h3}
          mediation={mediation}
          mediatorName={hypothesis.mediator}
          dependentName={hypothesis.dependent}
          independents={hypothesis.independents}
        />
      </div>

      {/* H1, H2, H3 Regression Blocks */}
      {regressions.map((reg) => (
        <RegressionBlock key={reg.id} reg={reg} />
      ))}

      {regressionThesis && (
        <ThesisSentenceCard section={regressionThesis} verification={regressionVerification} />
      )}

      {/* Mediation Analysis Block (Step 4 + Sobel + Bootstrap) */}
      {mediation && mediation.step4Regression && (
        <div className="space-y-6">
          <RegressionBlock reg={mediation.step4Regression} />

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  매개효과 검증 요약 (Baron &amp; Kenny · Sobel 검정 · Bootstrap {mediation.bootstrapSamples}회)
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 font-mono tabular-nums">
                  {mediation.r2ChangeFromH3 !== null && (
                    <>
                      H3 → 4단계 ΔR² = {fmtNum(mediation.r2ChangeFromH3, 3)} · ΔF ={' '}
                      {fmtNum(mediation.fChangeFromH3, 2)} ({fmtP(mediation.pChangeFromH3)})
                    </>
                  )}
                </p>
              </div>
              <CopyTableButton headers={medHeaders} rows={medRows} />
            </div>

            <ScrollableTable className="mt-4">
              <table className="w-full min-w-[840px] text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap min-w-[120px]">독립변수 (X)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">a (X→M)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">b (M→Y)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">총효과 (c)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">직접효과 (c’)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">간접효과 (a×b)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">Sobel Z (p)</th>
                    <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">Boot 95% CI</th>
                    <th className="px-3.5 py-3 text-left font-semibold whitespace-nowrap">매개 판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {mediation.paths.map((p) => {
                    const ciSig =
                      Number.isFinite(p.bootCiLow) &&
                      Number.isFinite(p.bootCiHigh) &&
                      (p.bootCiLow > 0 || p.bootCiHigh < 0);
                    const statusLabel =
                      p.status === 'full'
                        ? '완전매개'
                        : p.status === 'partial'
                          ? '부분매개'
                          : p.status === 'indirect_only'
                            ? '간접효과 유의'
                            : '매개 없음';
                    const statusCls =
                      p.status === 'full' || p.status === 'partial'
                        ? 'text-emerald-700 font-semibold'
                        : p.status === 'indirect_only'
                          ? 'text-blue-700 font-semibold'
                          : 'text-slate-400';

                    return (
                      <tr key={p.independent} className="hover:bg-slate-50/80">
                        <td className="px-3.5 py-3 font-semibold text-slate-900 whitespace-nowrap">
                          {p.independent}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                          {fmtNum(p.a, 3)}
                          {sigStars(p.pA)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                          {fmtNum(p.b, 3)}
                          {sigStars(p.pB)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                          {fmtNum(p.cTotal, 3)}
                          {sigStars(p.pCTotal)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                          {fmtNum(p.cPrime, 3)}
                          {sigStars(p.pCPrime)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {fmtNum(p.indirectEffect, 3)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {fmtNum(p.sobelZ, 2)} ({fmtP(p.sobelP)})
                        </td>
                        <td
                          className={`px-3.5 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                            ciSig ? 'text-blue-800 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          [{fmtNum(p.bootCiLow, 3)}, {fmtNum(p.bootCiHigh, 3)}]
                        </td>
                        <td className={`px-3.5 py-3 whitespace-nowrap ${statusCls}`}>{statusLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollableTable>
            <p className="mt-3.5 text-xs text-slate-600 leading-relaxed">
              비표준화 회귀계수(B) 기준. Bootstrap 95% 신뢰구간([LLCI, ULCI])에 0이 포함되지 않으면 간접효과가 통계적으로 유의합니다.
            </p>
          </div>

          {mediationThesis && (
            <ThesisSentenceCard section={mediationThesis} verification={mediationVerification} />
          )}
        </div>
      )}

      {/* Hierarchical Moderation Analysis Block */}
      {compNames.length >= 3 && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  조절효과 검증 (평균중심화 위계적 회귀 · 단순기울기 Simple Slopes)
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  독립변수(X)와 조절변수(W)를 평균중심화하여 상호작용항(X×W)의 ΔR² 및 조건부 단순기울기를 검증합니다.
                </p>
              </div>
              {moderation && (
                <CopyTableButton headers={modCoeffHeaders} rows={modCoeffRows} />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end bg-slate-50/80 border border-slate-200/90 rounded-xl p-4">
              <div>
                <label htmlFor="mod-x" className="block text-xs font-bold text-slate-700 mb-1.5">
                  독립변수 (X)
                </label>
                <select
                  id="mod-x"
                  value={modX}
                  onChange={(e) => onUpdateModeration(e.target.value || undefined, modW || undefined, modY || undefined)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900"
                >
                  <option value="">선택하세요</option>
                  {compNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mod-w" className="block text-xs font-bold text-slate-700 mb-1.5">
                  조절변수 (W)
                </label>
                <select
                  id="mod-w"
                  value={modW}
                  onChange={(e) => onUpdateModeration(modX || undefined, e.target.value || undefined, modY || undefined)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900"
                >
                  <option value="">선택하세요</option>
                  {compNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mod-y" className="block text-xs font-bold text-slate-700 mb-1.5">
                  종속변수 (Y)
                </label>
                <select
                  id="mod-y"
                  value={modY}
                  onChange={(e) => onUpdateModeration(modX || undefined, modW || undefined, e.target.value || undefined)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 min-h-[40px] text-xs bg-white text-slate-900"
                >
                  <option value="">선택하세요</option>
                  {compNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateModeration(
                      hypothesis.independents[0] || compNames[0],
                      hypothesis.mediator || compNames[1],
                      hypothesis.dependent || compNames[2]
                    )
                  }
                  className="px-3.5 py-2 min-h-[40px] rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors whitespace-nowrap cursor-pointer"
                >
                  연구모형 자동채움
                </button>
                {(modX || modW || modY) && (
                  <button
                    type="button"
                    onClick={() => onUpdateModeration(undefined, undefined, undefined)}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {hasSameVarError && (
              <p className="text-xs sm:text-sm text-amber-700 font-medium">
                독립변수(X), 조절변수(W), 종속변수(Y)는 서로 다른 구성개념으로 지정해야 합니다.
              </p>
            )}

            {moderation ? (
              <div className="space-y-5">
                {/* Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 py-4 border-y border-slate-200">
                  <div>
                    <div className="text-xs text-slate-600">1단계 → 2단계 ΔR²</div>
                    <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      +{fmtNum(moderation.r2Change, 3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-600">ΔF (유의확률 p)</div>
                    <div
                      className={`text-lg sm:text-xl font-bold font-mono tabular-nums mt-0.5 ${
                        moderation.pChange < 0.05 ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {fmtNum(moderation.fChange, 2)} ({fmtP(moderation.pChange)})
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-600">상호작용항 B (β)</div>
                    <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {fmtNum(moderation.interactionCoeff.b, 3)}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({fmtNum(moderation.interactionCoeff.beta, 3)})
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-600">상호작용항 t (p)</div>
                    <div
                      className={`text-lg sm:text-xl font-bold font-mono tabular-nums mt-0.5 ${
                        moderation.significant ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {fmtNum(moderation.interactionCoeff.t, 2)} ({fmtP(moderation.interactionCoeff.p)})
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 flex items-center justify-between sm:block">
                    <div className="text-xs text-slate-600">조절효과 판정</div>
                    <div
                      className={`text-lg sm:text-xl font-bold sm:mt-0.5 ${
                        moderation.significant ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {moderation.significant ? '유의 (조절 채택)' : '비유의 (기각)'}
                    </div>
                  </div>
                </div>

                {/* Step 2 Coefficients */}
                <ScrollableTable>
                  <table className="w-full min-w-[620px] text-xs">
                    <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                      <tr>
                        <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap min-w-[140px]">2단계 위계적 회귀 변수</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">B</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">SE</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">β</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">t</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">p</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">VIF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {moderation.step2.coeffs.map((c) => {
                        const isInter = c.name === `${moderation.xName}×${moderation.wName}`;
                        return (
                          <tr
                            key={c.name}
                            className={isInter ? 'bg-blue-50/50 font-semibold' : 'hover:bg-slate-50/70'}
                          >
                            <td className="px-3.5 py-2.5 text-slate-900 whitespace-nowrap">{c.name}</td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">{fmtNum(c.b, 3)}</td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-500">
                              {fmtNum(c.se, 3)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                              {c.beta !== null ? fmtNum(c.beta, 3) : '—'}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">{fmtNum(c.t, 2)}</td>
                            <td
                              className={`px-3.5 py-2.5 text-right font-mono tabular-nums ${
                                c.name !== '(상수)' && c.p < 0.05 ? 'text-emerald-700 font-semibold' : 'text-slate-600'
                              }`}
                            >
                              {fmtP(c.p)}
                              {c.name !== '(상수)' && sigStars(c.p)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-600">
                              {c.vif !== null ? fmtNum(c.vif, 3) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollableTable>

                {/* Simple Slopes Table */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2.5">
                    조절변수({moderation.wName}) 수준별 단순기울기 (Aiken &amp; West Simple Slopes)
                  </h4>
                  <ScrollableTable>
                    <table className="w-full min-w-[580px] text-xs">
                      <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                        <tr>
                          <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">조절변수 수준</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">{moderation.wName} 값</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">단순기울기 (B)</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">표준오차 (SE)</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">t</th>
                          <th className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">유의확률 (p)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {moderation.simpleSlopes.map((s) => (
                          <tr key={s.level} className="hover:bg-slate-50/70">
                            <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{s.level}</td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {fmtNum(s.wValue, 2)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                              {fmtNum(s.slope, 3)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                              {fmtNum(s.se, 3)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{fmtNum(s.t, 2)}</td>
                            <td
                              className={`px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                s.p < 0.05 ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {fmtP(s.p)}
                              {sigStars(s.p)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollableTable>
                </div>
              </div>
            ) : (
              !hasSameVarError && (
                <p className="text-xs sm:text-sm text-slate-600">
                  위 선택란에서 서로 다른 독립변수(X), 조절변수(W), 종속변수(Y)를 선택하거나 ‘연구모형 자동채움’을 누르면 즉시 조절효과를 검증합니다.
                </p>
              )
            )}
          </div>

          {moderationThesis && (
            <ThesisSentenceCard section={moderationThesis} verification={moderationVerification} />
          )}
        </div>
      )}

      <StepFooterNav
        prevLabel="4. 상관분석"
        nextLabel="6. 결과 요약 & 논문 문장 작성"
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  );
};

