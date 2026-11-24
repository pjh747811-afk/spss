import React, { useMemo, useState } from 'react';
import { EFAConfig, EFAResult } from '../../types/stats';
import { fmtNum, fmtP } from '../../utils/statistics';
import { ThesisSection } from '../../utils/thesisWriter';
import { CopyTableButton } from '../CopyTableButton';
import { ScreePlot } from '../ScreePlot';
import { SPSSGuideBar } from '../SPSSGuideBar';
import { StepFooterNav } from '../StepFooterNav';
import { ThesisSentenceCard } from '../ThesisSentenceCard';

interface StepFactorAnalysisProps {
  efa: EFAResult | null;
  efaConfig: EFAConfig;
  thesisSection?: ThesisSection;
  onUpdateConfig: (next: EFAConfig) => void;
  onPrev: () => void;
  onNext: () => void;
}

const SPSS_EFA_STEPS = [
  '변수 1번을 클릭하고 마지막 변수까지 Shift를 눌러 전체 선택한 뒤, 화살표로 오른쪽 [변수] 칸에 옮깁니다.',
  '기술통계: KMO와 Bartlett의 구형성 검정을 체크합니다.',
  '요인추출: 스크리 도표 체크 → 계속 (고유값 1.0 이상 기준 주성분 추출).',
  '요인회전: 베리맥스(Varimax) 체크 → 계속.',
  '점수: 변수로 저장, 요인점수 계수행렬 표시 체크 → 계속.',
  '옵션: 크기순 정렬 체크 → 계속 → 확인.',
];

export const StepFactorAnalysis: React.FC<StepFactorAnalysisProps> = ({
  efa,
  efaConfig,
  thesisSection,
  onUpdateConfig,
  onPrev,
  onNext,
}) => {
  const [showScoreMatrix, setShowScoreMatrix] = useState(false);

  const factorSummary = useMemo(() => {
    if (!efa) return [];
    const groups: { factorIdx: number; items: string[] }[] = Array.from(
      { length: efa.numFactors },
      (_, idx) => ({ factorIdx: idx, items: [] })
    );
    efa.rotatedMatrix.forEach((row) => {
      const dom = row.dominantFactor;
      if (dom >= 0 && dom < efa.numFactors && Math.abs(row.loadings[dom]) >= efaConfig.loadingThreshold) {
        groups[dom].items.push(row.item);
      }
    });
    return groups;
  }, [efa, efaConfig.loadingThreshold]);

  if (!efa) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-slate-700">요인분석 결과가 없습니다.</p>
          <p className="text-xs text-slate-500 mt-1">
            0단계 개요 및 데이터에서 설문 데이터를 불러온 뒤 문항이 2개 이상 매핑되었는지 확인하세요.
          </p>
        </div>
        <StepFooterNav prevLabel="0. 개요 & 데이터" onPrev={onPrev} />
      </div>
    );
  }

  const kmoOk = efa.kmo >= 0.6;
  const bartlettOk = efa.bartlettP < 0.05;
  const factorIndices = Array.from({ length: efa.numFactors }, (_, i) => i);

  const rotatedHeaders = ['문항', '공통성(h²)', ...factorIndices.map((i) => `요인 ${i + 1}`)];
  const rotatedCopyRows = efa.rotatedMatrix.map((row) => [
    row.item,
    fmtNum(row.communality, 3),
    ...row.loadings.map((l) =>
      Math.abs(l) < efaConfig.loadingThreshold ? '' : fmtNum(l, 3)
    ),
  ]);

  return (
    <div className="space-y-6">
      {/* Header, SPSS Guide & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">1. 요인분석 (타당성)</h2>
            <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              주성분 추출(PCA) · 베리맥스(Varimax) 회전 · N = {efa.n} · 문항 {efa.p}개 · 추출 요인 {efa.numFactors}개
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={efaConfig.loadingThreshold}
              onChange={(e) =>
                onUpdateConfig({ ...efaConfig, loadingThreshold: Number(e.target.value) })
              }
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-mono"
            >
              <option value={0.5}>0.5 이하 값 숨김</option>
              <option value={0.4}>0.4 이하 값 숨김</option>
              <option value={0}>전체 적재값 표시</option>
            </select>
            <button
              type="button"
              onClick={() => onUpdateConfig({ ...efaConfig, sortBySize: !efaConfig.sortBySize })}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                efaConfig.sortBySize
                  ? 'border-blue-700 bg-blue-50 text-blue-800'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              크기순 정렬 {efaConfig.sortBySize ? '켜짐' : '꺼짐'}
            </button>
          </div>
        </div>

        <SPSSGuideBar
          menuPath="분석 → 차원 축소 → 요인분석"
          steps={SPSS_EFA_STEPS}
          note="※ 회전된 성분 행렬에서 0.5 이하 값은 삭제한 뒤 해석합니다. 우측 복사 버튼으로 엑셀에 붙여넣어 정리하세요."
        />

        {/* KMO, Bartlett & Scree */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">KMO와 Bartlett 구형성 검정</h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="px-3 py-2.5 font-medium text-slate-700 bg-slate-50">
                      표본적합도(KMO)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                      {fmtNum(efa.kmo, 3)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${
                        kmoOk ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {kmoOk ? '적합 (≥ 0.6)' : efa.kmo >= 0.5 ? '보통 (≥ 0.5)' : '부적합 (< 0.5)'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 font-medium text-slate-700 bg-slate-50">
                      Bartlett 근사 카이제곱
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                      {fmtNum(efa.bartlettChi2, 3)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500 font-mono tabular-nums">
                      df = {efa.bartlettDf}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 font-medium text-slate-700 bg-slate-50">
                      유의확률 (p)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fmtP(efa.bartlettP)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${
                        bartlettOk ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {bartlettOk ? '유의 (p < .05)' : '비유의'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 font-medium text-slate-700 bg-slate-50">
                      공통방법편의 (Harman 1요인)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fmtNum(efa.harmanSingleFactorPct, 2)}%
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${
                        efa.harmanSingleFactorPct < 50 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {efa.harmanSingleFactorPct < 50 ? '적합 (< 50%)' : '주의 (≥ 50%)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-semibold text-slate-800">
                요인 해석 요약 (고유값 ≥ 1.0 기준 {efa.numFactors}개 요인)
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {factorSummary.map((g) => (
                  <div key={g.factorIdx} className="px-3 py-2 flex items-start gap-3">
                    <span className="font-mono font-semibold text-blue-700 shrink-0 w-12">
                      요인 {g.factorIdx + 1}
                    </span>
                    <span className="text-slate-700">
                      {g.items.length ? g.items.join(', ') : '기준 이상 문항 없음'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ScreePlot eigenvalues={efa.eigenvalues} numFactors={efa.numFactors} />
        </div>
      </div>

      {/* Rotated Component Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              회전된 성분 행렬 (Rotated Component Matrix · 추출 요인 {efa.numFactors}개)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              요인별 최대 적재값은 굵게 표시됩니다. 설정 기준({efaConfig.loadingThreshold.toFixed(2)}) 이하 값은 숨겨져 요인 구조를 바로 확인할 수 있습니다.
            </p>
          </div>
          <CopyTableButton headers={rotatedHeaders} rows={rotatedCopyRows} />
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">측정 문항</th>
                <th className="px-3 py-2.5 text-right font-semibold">공통성</th>
                {factorIndices.map((fIdx) => (
                  <th key={fIdx} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    요인 {fIdx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {efa.rotatedMatrix.map((row) => (
                <tr key={row.item} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{row.item}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {fmtNum(row.communality, 3)}
                  </td>
                  {row.loadings.map((val, fIdx) => {
                    const abs = Math.abs(val);
                    const hidden = abs < efaConfig.loadingThreshold;
                    const isPrimary = fIdx === row.dominantFactor && !hidden;
                    return (
                      <td
                        key={fIdx}
                        className={`px-3 py-2 text-right font-mono tabular-nums ${
                          hidden
                            ? 'text-slate-300'
                            : isPrimary
                              ? 'font-bold text-blue-800 bg-blue-50/60'
                              : 'text-slate-600'
                        }`}
                      >
                        {hidden ? '·' : fmtNum(val, 3)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variance Explained & Score Coefficient Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">
            설명된 총 분산 (추출된 {efa.numFactors}개 요인)
          </h3>
          <button
            type="button"
            onClick={() => setShowScoreMatrix((s) => !s)}
            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
          >
            {showScoreMatrix ? '요인점수 계수행렬 닫기' : '요인점수 계수행렬 보기'}
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">성분</th>
                <th className="px-3 py-2 text-right font-semibold">초기 고유값</th>
                <th className="px-3 py-2 text-right font-semibold">초기 분산 %</th>
                <th className="px-3 py-2 text-right font-semibold">초기 누적 %</th>
                <th className="px-3 py-2 text-right font-semibold">회전 제곱합</th>
                <th className="px-3 py-2 text-right font-semibold">회전 분산 %</th>
                <th className="px-3 py-2 text-right font-semibold">회전 누적 %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {efa.varianceExplained.slice(0, Math.max(efa.numFactors + 2, 8)).map((row) => (
                <tr
                  key={row.component}
                  className={row.component <= efa.numFactors ? 'bg-white' : 'bg-slate-50/50 text-slate-500'}
                >
                  <td className="px-3 py-2 font-mono tabular-nums font-medium">{row.component}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {fmtNum(row.initialEigenvalue, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {fmtNum(row.initialPctVar, 2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {fmtNum(row.initialCumPct, 2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.rotSS > 0 ? fmtNum(row.rotSS, 3) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.rotPctVar > 0 ? `${fmtNum(row.rotPctVar, 2)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                    {row.rotCumPct > 0 ? `${fmtNum(row.rotCumPct, 2)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showScoreMatrix && efa.scoreCoeffMatrix.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-900 mb-2">
              성분 점수 계수행렬 (Component Score Coefficient Matrix)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">문항</th>
                    {factorIndices.map((fIdx) => (
                      <th key={fIdx} className="px-3 py-2 text-right font-semibold">
                        요인 {fIdx + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {efa.scoreCoeffMatrix.map((row) => (
                    <tr key={row.item}>
                      <td className="px-3 py-1.5 font-medium text-slate-900">{row.item}</td>
                      {row.coeffs.map((c, idx) => (
                        <td
                          key={idx}
                          className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-700"
                        >
                          {fmtNum(c, 3)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {thesisSection && <ThesisSentenceCard section={thesisSection} />}

      <StepFooterNav
        prevLabel="0. 개요 & 데이터"
        nextLabel="2. 신뢰도 분석 (α) 진행"
        onPrev={onPrev}
        onNext={onNext}
      />
    </div>
  );
};
