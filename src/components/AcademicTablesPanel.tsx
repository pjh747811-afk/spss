import React, { useState } from 'react';
import { Check, Copy, Table2 } from 'lucide-react';
import { AnalysisBundle } from '../types/stats';
import { fmtNum, fmtP, getHypothesisVerdict, sigStars } from '../utils/statistics';
import { ScrollableTable } from './ScrollableTable';

interface AcademicTablesPanelProps {
  bundle: AnalysisBundle;
}

async function copyAcademicTable(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  note: string
): Promise<boolean> {
  const tsv = [
    title,
    headers.join('\t'),
    ...rows.map((r) => r.map((c) => String(c ?? '')).join('\t')),
    note,
  ].join('\n');

  const escapeHtml = (val: string | number) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const html = `
    <div style="font-family: 'Malgun Gothic', sans-serif; font-size: 10pt;">
      <p style="font-weight: bold; margin: 0 0 6px 0;">${escapeHtml(title)}</p>
      <table style="border-collapse: collapse; width: 100%; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">
        <thead>
          <tr style="border-bottom: 1px solid #64748b; background-color: #f8fafc;">
            ${headers
              .map(
                (h, idx) =>
                  `<th style="padding: 6px 8px; text-align: ${idx === 0 ? 'left' : 'right'}; font-weight: 600;">${escapeHtml(h)}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr>${r
                  .map(
                    (c, idx) =>
                      `<td style="padding: 5px 8px; text-align: ${idx === 0 ? 'left' : 'right'}; border-top: 1px solid #f1f5f9;">${escapeHtml(c)}</td>`
                  )
                  .join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p style="font-size: 9pt; color: #475569; margin: 4px 0 0 0;">${escapeHtml(note)}</p>
    </div>
  `;

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch {
      return false;
    }
  }
}

const TableCopyButton: React.FC<{
  title: string;
  headers: string[];
  rows: (string | number)[][];
  note: string;
}> = ({ title, headers, rows, note }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyAcademicTable(title, headers, rows, note);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer no-print"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-emerald-700">논문 표 복사됨 (한글/워드/엑셀)</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 text-slate-500 shrink-0" />
          <span>논문용 3선표 복사</span>
        </>
      )}
    </button>
  );
};

export const AcademicTablesPanel: React.FC<AcademicTablesPanelProps> = ({ bundle }) => {
  // Table 1: Reliability + EFA Summary by Construct
  const t1Title = '<표 1> 측정 도구의 타당성 및 신뢰도 분석 결과';
  const t1Headers = ['구성개념', '문항 수', '요인적재량 범위', '공통성 범위', 'Cronbach’s α', '표준화 α', '판정'];
  const t1Rows = bundle.reliability.map((rel) => {
    const itemRows =
      bundle.efa?.rotatedMatrix.filter((er) => rel.items.includes(er.item)) ?? [];
    const loads = itemRows.map((r) => r.maxAbsLoading).filter((v) => Number.isFinite(v));
    const comms = itemRows.map((r) => r.communality).filter((v) => Number.isFinite(v));
    const loadRange = loads.length
      ? `${fmtNum(Math.min(...loads), 3)} ~ ${fmtNum(Math.max(...loads), 3)}`
      : '—';
    const commRange = comms.length
      ? `${fmtNum(Math.min(...comms), 3)} ~ ${fmtNum(Math.max(...comms), 3)}`
      : '—';
    return [
      rel.constructName,
      rel.nItems,
      loadRange,
      commRange,
      fmtNum(rel.alpha, 3),
      fmtNum(rel.standardizedAlpha, 3),
      rel.nItems < 2
        ? '단일 문항'
        : !Number.isFinite(rel.alpha)
          ? '계산 불가'
          : rel.alpha >= 0.7
            ? '우수 (≥ .70)'
            : rel.alpha >= 0.6
              ? '양호 (≥ .60)'
              : '재검토',
    ];
  });
  const t1Note = bundle.efa
    ? `주) N = ${bundle.efa.n}, KMO = ${fmtNum(bundle.efa.kmo, 3)}, Bartlett χ² = ${fmtNum(bundle.efa.bartlettChi2, 2)}(df = ${bundle.efa.bartlettDf}, ${fmtP(bundle.efa.bartlettP)}), 누적 분산설명률 = ${fmtNum(bundle.efa.varianceExplained[bundle.efa.numFactors - 1]?.rotCumPct ?? 0, 2)}%, Harman 단일요인 분산 = ${fmtNum(bundle.efa.harmanSingleFactorPct, 2)}%.`
    : '주) 내적 일관성 기준 Cronbach’s α ≥ .60.';

  // Table 2: Descriptives + Lower-Triangle Correlation Matrix
  const { names, matrix } = bundle.correlation;
  const t2Title = '<표 2> 주요 변수의 기술통계 및 상관관계 분석 결과';
  const t2Headers = [
    '변수',
    'M',
    'SD',
    '왜도',
    '첨도',
    ...names.map((_, i) => String(i + 1)),
  ];
  const t2Rows = names.map((name, i) => {
    const comp = bundle.composites.find((c) => c.name === name);
    return [
      `${i + 1}. ${name}`,
      fmtNum(comp?.mean, 2),
      fmtNum(comp?.sd, 2),
      fmtNum(comp?.skewness, 2),
      fmtNum(comp?.kurtosis, 2),
      ...names.map((_, j) => {
        if (j > i) return '';
        if (j === i) return '1';
        const cell = matrix[i][j];
        return `${fmtNum(cell.r, 3)}${sigStars(cell.p)}`;
      }),
    ];
  });
  const t2Note = '주) *p < .05, **p < .01, ***p < .001 (양측검정). M = 평균, SD = 표준편차.';

  // Table 3: Regression Results (H1~H3 + Step 4)
  const allRegs = [
    ...bundle.regressions,
    ...(bundle.mediation?.step4Regression ? [bundle.mediation.step4Regression] : []),
  ];
  const t3Title = '<표 3> 연구가설 다중회귀분석 검증 결과';
  const t3Headers = [
    '모형(종속변수)',
    '독립·통제변수',
    'B',
    'SE',
    'β',
    't',
    'p',
    'VIF',
    '수정 R²',
    'F',
    '판정',
  ];
  const t3Rows: (string | number)[][] = [];
  for (const reg of allRegs) {
    const verdict = reg.id === 'H4' ? '4단계 모형' : getHypothesisVerdict(reg);
    const nonConsts = reg.coeffs.filter((c) => c.name !== '(상수)');
    nonConsts.forEach((c, idx) => {
      t3Rows.push([
        idx === 0 ? `${reg.hypothesis} (${reg.dependent})` : '',
        c.name,
        fmtNum(c.b, 3),
        fmtNum(c.se, 3),
        c.beta !== null ? fmtNum(c.beta, 3) : '—',
        fmtNum(c.t, 2),
        `${fmtP(c.p)}${sigStars(c.p)}`,
        c.vif !== null ? fmtNum(c.vif, 2) : '—',
        idx === 0 ? fmtNum(reg.adjR2, 3) : '',
        idx === 0 ? `${fmtNum(reg.anova.f, 2)}${sigStars(reg.anova.p)}` : '',
        idx === 0 ? verdict : '',
      ]);
    });
  }
  const t3Note =
    '주) *p < .05, **p < .01, ***p < .001. 비표준화계수(B), 표준오차(SE), 표준화계수(β) 기준.';

  // Table 4: Moderation Results (if present)
  const mod = bundle.moderation;
  const t4Title = '<표 4> 위계적 회귀분석을 통한 조절효과 검증 결과';
  const t4Headers = ['단계(모형)', '투입변수', 'B', 'SE', 'β', 't', 'p', 'R²', 'ΔR²', 'ΔF'];
  const t4Rows: (string | number)[][] = [];
  if (mod) {
    const s1NonConst = mod.step1.coeffs.filter((c) => c.name !== '(상수)');
    s1NonConst.forEach((c, idx) => {
      t4Rows.push([
        idx === 0 ? '1단계 (주효과)' : '',
        c.name,
        fmtNum(c.b, 3),
        fmtNum(c.se, 3),
        c.beta !== null ? fmtNum(c.beta, 3) : '—',
        fmtNum(c.t, 2),
        `${fmtP(c.p)}${sigStars(c.p)}`,
        idx === 0 ? fmtNum(mod.step1.r2, 3) : '',
        idx === 0 ? '—' : '',
        idx === 0 ? `${fmtNum(mod.step1.anova.f, 2)}${sigStars(mod.step1.anova.p)}` : '',
      ]);
    });
    const s2NonConst = mod.step2.coeffs.filter((c) => c.name !== '(상수)');
    s2NonConst.forEach((c, idx) => {
      t4Rows.push([
        idx === 0 ? '2단계 (상호작용)' : '',
        c.name,
        fmtNum(c.b, 3),
        fmtNum(c.se, 3),
        c.beta !== null ? fmtNum(c.beta, 3) : '—',
        fmtNum(c.t, 2),
        `${fmtP(c.p)}${sigStars(c.p)}`,
        idx === 0 ? fmtNum(mod.step2.r2, 3) : '',
        idx === 0 ? `+${fmtNum(mod.r2Change, 3)}` : '',
        idx === 0 ? `${fmtNum(mod.fChange, 2)}${sigStars(mod.pChange)}` : '',
      ]);
    });
  }
  const t4Note = mod
    ? `주) *p < .05, **p < .01, ***p < .001. 종속변수: ${mod.yName}, 평균중심화(mean-centering) 적용.`
    : '';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-8">
      <div className="flex items-start gap-3 pb-4 border-b border-slate-200">
        <Table2 className="w-5 h-5 text-blue-700 shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            논문용 표 자동 생성 (KCI · APA 3선표 양식)
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
            학술지 및 학위논문 표준 3선표 형식으로 정리되었습니다. ‘논문용 3선표 복사’를 누르면 한글(HWP)·MS Word·엑셀에 서식 그대로 붙여넣을 수 있습니다.
          </p>
        </div>
      </div>

      {/* Table 1 */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <h4 className="text-sm sm:text-base font-bold text-slate-900">{t1Title}</h4>
          <TableCopyButton title={t1Title} headers={t1Headers} rows={t1Rows} note={t1Note} />
        </div>
        <ScrollableTable bordered={false} hintText="좌우로 스크롤하여 전체 3선표 확인">
          <table className="w-full min-w-[640px] text-xs border-t-2 border-b-2 border-slate-900">
            <thead>
              <tr className="border-b border-slate-400 bg-slate-50/80 text-slate-800">
                {t1Headers.map((h, i) => (
                  <th
                    key={h}
                    className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                      i === 0 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t1Rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-3.5 py-2.5 whitespace-nowrap ${
                        cIdx === 0
                          ? 'text-left font-semibold text-slate-900'
                          : 'text-right font-mono tabular-nums text-slate-700'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
        <p className="text-xs text-slate-600 leading-relaxed">{t1Note}</p>
      </div>

      {/* Table 2 */}
      {names.length > 0 && (
        <div className="space-y-3 pt-5 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <h4 className="text-sm sm:text-base font-bold text-slate-900">{t2Title}</h4>
            <TableCopyButton title={t2Title} headers={t2Headers} rows={t2Rows} note={t2Note} />
          </div>
          <ScrollableTable bordered={false} hintText="좌우로 스크롤하여 전체 3선표 확인">
            <table className="w-full min-w-[680px] text-xs border-t-2 border-b-2 border-slate-900">
              <thead>
                <tr className="border-b border-slate-400 bg-slate-50/80 text-slate-800">
                  {t2Headers.map((h, i) => (
                    <th
                      key={h}
                      className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t2Rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2.5 whitespace-nowrap ${
                          cIdx === 0
                            ? 'text-left font-semibold text-slate-900'
                            : 'text-right font-mono tabular-nums text-slate-700'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <p className="text-xs text-slate-600 leading-relaxed">{t2Note}</p>
        </div>
      )}

      {/* Table 3 */}
      {allRegs.length > 0 && (
        <div className="space-y-3 pt-5 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <h4 className="text-sm sm:text-base font-bold text-slate-900">{t3Title}</h4>
            <TableCopyButton title={t3Title} headers={t3Headers} rows={t3Rows} note={t3Note} />
          </div>
          <ScrollableTable bordered={false} hintText="좌우로 스크롤하여 전체 3선표 확인">
            <table className="w-full min-w-[820px] text-xs border-t-2 border-b-2 border-slate-900">
              <thead>
                <tr className="border-b border-slate-400 bg-slate-50/80 text-slate-800">
                  {t3Headers.map((h, i) => (
                    <th
                      key={h}
                      className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                        i <= 1 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t3Rows.map((row, idx) => (
                  <tr key={idx} className={row[0] ? 'border-t border-slate-300 hover:bg-slate-50/70' : 'hover:bg-slate-50/70'}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2.5 whitespace-nowrap ${
                          cIdx === 0
                            ? 'text-left font-bold text-blue-800'
                            : cIdx === 1
                              ? 'text-left font-semibold text-slate-900'
                              : 'text-right font-mono tabular-nums text-slate-700'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <p className="text-xs text-slate-600 leading-relaxed">{t3Note}</p>
        </div>
      )}

      {/* Table 4 */}
      {mod && t4Rows.length > 0 && (
        <div className="space-y-3 pt-5 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <h4 className="text-sm sm:text-base font-bold text-slate-900">{t4Title}</h4>
            <TableCopyButton title={t4Title} headers={t4Headers} rows={t4Rows} note={t4Note} />
          </div>
          <ScrollableTable bordered={false} hintText="좌우로 스크롤하여 전체 3선표 확인">
            <table className="w-full min-w-[780px] text-xs border-t-2 border-b-2 border-slate-900">
              <thead>
                <tr className="border-b border-slate-400 bg-slate-50/80 text-slate-800">
                  {t4Headers.map((h, i) => (
                    <th
                      key={h}
                      className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${
                        i <= 1 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t4Rows.map((row, idx) => (
                  <tr key={idx} className={row[0] ? 'border-t border-slate-300 hover:bg-slate-50/70' : 'hover:bg-slate-50/70'}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2.5 whitespace-nowrap ${
                          cIdx === 0
                            ? 'text-left font-bold text-blue-800'
                            : cIdx === 1
                              ? 'text-left font-semibold text-slate-900'
                              : 'text-right font-mono tabular-nums text-slate-700'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <p className="text-xs text-slate-600 leading-relaxed">{t4Note}</p>
        </div>
      )}
    </div>
  );
};
