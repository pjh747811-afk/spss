import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AnalysisBundle, ConstructMapping, DataRow } from '../types/stats';
import { fmtNum, fmtP, sigStars } from './statistics';

export async function parseSurveyFile(
  file: File
): Promise<{ rows: DataRow[]; columns: string[]; fileName: string }> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const firstSheet = wb.SheetNames[0];
    const sheet = wb.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json<DataRow>(sheet, { defval: null });
    const cleaned = json.filter((r) =>
      Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
    );
    const columns = Object.keys(cleaned[0] || {}).filter((c) => c && String(c).trim() !== '');
    return { rows: cleaned, columns, fileName: file.name };
  }

  if (lower.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    let rows: DataRow[] = [];
    if (Array.isArray(parsed)) {
      rows = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // Columnar JSON format like data_0e7bd093.json
      const keys = Object.keys(parsed);
      const len = Array.isArray(parsed[keys[0]]) ? parsed[keys[0]].length : 0;
      for (let i = 0; i < len; i++) {
        const row: DataRow = {};
        for (const k of keys) row[k] = parsed[k]?.[i] ?? null;
        rows.push(row);
      }
    }
    const cleaned = rows.filter((r) =>
      Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
    );
    const columns = Object.keys(cleaned[0] || {}).filter((c) => c && String(c).trim() !== '');
    return { rows: cleaned, columns, fileName: file.name };
  }

  // CSV / TSV with UTF-8 + EUC-KR Korean encoding resilience
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) {
    try {
      text = new TextDecoder('euc-kr').decode(buf);
    } catch {
      // keep utf-8 fallback
    }
  }
  text = text.replace(/^\uFEFF/, '');

  const parsed = Papa.parse<DataRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const cleaned = parsed.data.filter((r) =>
    Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
  );
  const columns = (parsed.meta.fields || Object.keys(cleaned[0] || {})).filter(
    (c) => c && String(c).trim() !== ''
  );
  return { rows: cleaned, columns, fileName: file.name };
}

export function autoDetectConstructs(columns: string[]): ConstructMapping[] {
  const defaults: { name: string; patterns: RegExp[] }[] = [
    { name: '혁신행동', patterns: [/^혁신행동/i, /^innov/i] },
    { name: '카리스마', patterns: [/^카리스마/i, /^charisma/i] },
    { name: '개별배려', patterns: [/^배려/i, /^개별배려/i, /^consider/i] },
    { name: '심리적자본', patterns: [/^심리적자본/i, /^심리자본/i, /^psycap/i] },
    { name: '지적자극', patterns: [/^지적자극/i, /^지적/i, /^intel/i] },
    { name: '동기부여', patterns: [/^동기/i, /^motiv/i, /^inspir/i] },
  ];

  // Exclude already-computed composite columns like 카리스마합, 개별배려합, mean, avg, FAC
  const itemCols = columns.filter(
    (c) => !/합$|합계|mean|avg|total|FAC|_1$|_2$/i.test(c.trim())
  );

  const detected: ConstructMapping[] = defaults
    .map((d, idx) => {
      const items = itemCols.filter((c) => d.patterns.some((p) => p.test(c)));
      // Sort items naturally (e.g. 카리스마1, 카리스마2, 카리스마3)
      items.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      return {
        id: `c-${idx}-${d.name}`,
        name: d.name,
        items,
      };
    })
    .filter((c) => c.items.length > 0);

  if (detected.length > 0) return detected;

  // Generic prefix grouping fallback for arbitrary research survey CSVs
  const groups = new Map<string, string[]>();
  for (const col of itemCols) {
    const match = col.match(/^([^\d_]+)[_\s]*\d+$/);
    const prefix = match ? match[1].trim() : col;
    const list = groups.get(prefix) || [];
    list.push(col);
    groups.set(prefix, list);
  }

  const generic: ConstructMapping[] = [];
  let idx = 0;
  for (const [prefix, items] of groups.entries()) {
    if (items.length >= 2) {
      generic.push({ id: `c-${idx++}`, name: prefix, items });
    }
  }

  if (generic.length > 0) return generic;
  return itemCols.length
    ? [{ id: 'c-0', name: '구성개념 1', items: itemCols.slice(0, Math.min(6, itemCols.length)) }]
    : [];
}

export async function copyTableTSV(headers: string[], rows: (string | number)[][]): Promise<boolean> {
  const tsv = [
    headers.join('\t'),
    ...rows.map((r) => r.map((cell) => String(cell ?? '')).join('\t')),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    return false;
  }
}

export function downloadSummaryCSV(bundle: AnalysisBundle): void {
  const lines: string[] = [];

  if (bundle.efa) {
    lines.push('1. 탐색적 요인분석 (KMO 및 Bartlett)');
    lines.push(`KMO,${fmtNum(bundle.efa.kmo, 3)}`);
    lines.push(`Bartlett Chi2,${fmtNum(bundle.efa.bartlettChi2, 3)}`);
    lines.push(`df,${bundle.efa.bartlettDf}`);
    lines.push(`p,${fmtP(bundle.efa.bartlettP)}`);
    lines.push('');
    lines.push(
      ['문항', '공통성', ...Array.from({ length: bundle.efa.numFactors }, (_, i) => `요인${i + 1}`)].join(',')
    );
    for (const row of bundle.efa.rotatedMatrix) {
      lines.push([row.item, fmtNum(row.communality, 3), ...row.loadings.map((l) => fmtNum(l, 3))].join(','));
    }
    lines.push('');
  }

  lines.push('2. 신뢰도 분석 (Cronbach alpha)');
  lines.push('구성개념,문항수,유효케이스,Cronbach_alpha,표준화_alpha');
  for (const r of bundle.reliability) {
    lines.push([r.constructName, r.nItems, r.nValid, fmtNum(r.alpha, 3), fmtNum(r.standardizedAlpha, 3)].join(','));
  }
  lines.push('');

  lines.push('3. 합변수 기술통계');
  lines.push('합변수,문항수,N,평균,표준편차,최솟값,최댓값,수식');
  for (const c of bundle.composites) {
    lines.push(
      [c.name, c.items.length, c.n, fmtNum(c.mean, 3), fmtNum(c.sd, 3), fmtNum(c.min, 3), fmtNum(c.max, 3), `"${c.formula}"`].join(',')
    );
  }
  lines.push('');

  lines.push('4. 상관분석 (Pearson r)');
  lines.push(['변수', ...bundle.correlation.names].join(','));
  bundle.correlation.names.forEach((name, i) => {
    const vals = bundle.correlation.matrix[i].map((cell, j) => (j > i ? '' : fmtNum(cell.r, 3)));
    lines.push([name, ...vals].join(','));
  });
  lines.push('');

  lines.push('5. 회귀분석');
  for (const reg of bundle.regressions) {
    lines.push(`${reg.hypothesis}: ${reg.label}`);
    lines.push(`N=${reg.n},R2=${fmtNum(reg.r2, 3)},수정R2=${fmtNum(reg.adjR2, 3)},F=${fmtNum(reg.anova.f, 3)},p=${fmtP(reg.anova.p)},Durbin-Watson=${fmtNum(reg.durbinWatson, 3)}`);
    lines.push('변수,B,SE,beta,t,p,유의성,공차,VIF');
    for (const c of reg.coeffs) {
      lines.push(
        [
          c.name,
          fmtNum(c.b, 3),
          fmtNum(c.se, 3),
          c.beta !== null ? fmtNum(c.beta, 3) : '',
          fmtNum(c.t, 3),
          fmtP(c.p),
          sigStars(c.p),
          c.tolerance !== null ? fmtNum(c.tolerance, 3) : '',
          c.vif !== null ? fmtNum(c.vif, 3) : '',
        ].join(',')
      );
    }
    lines.push('');
  }

  if (bundle.mediation) {
    lines.push('6. 매개효과 검증 (Baron & Kenny / Sobel / Bootstrap)');
    lines.push('독립변수,매개변수,종속변수,a,b,총효과(c),직접효과(c_prime),간접효과(ab),Sobel_Z,Sobel_p,Boot_95CI_Low,Boot_95CI_High,판정');
    for (const p of bundle.mediation.paths) {
      lines.push(
        [
          p.independent,
          p.mediator,
          p.dependent,
          fmtNum(p.a, 3),
          fmtNum(p.b, 3),
          fmtNum(p.cTotal, 3),
          fmtNum(p.cPrime, 3),
          fmtNum(p.indirectEffect, 3),
          fmtNum(p.sobelZ, 3),
          fmtP(p.sobelP),
          fmtNum(p.bootCiLow, 3),
          fmtNum(p.bootCiHigh, 3),
          p.status,
        ].join(',')
      );
    }
  }

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SPSS연구통계_통계분석결과.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCompositesCSV(bundle: AnalysisBundle): void {
  if (!bundle.composites.length) return;
  const names = bundle.composites.map((c) => `${c.name}합`);
  const nRows = bundle.composites[0].values.length;
  const rows: string[] = [names.join(',')];
  for (let i = 0; i < nRows; i++) {
    rows.push(
      bundle.composites
        .map((c) => {
          const v = c.values[i];
          return v === null ? '' : Number(v.toFixed(6));
        })
        .join(',')
    );
  }
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SPSS연구통계_합변수데이터.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelWorkbook(
  bundle: AnalysisBundle,
  thesisSections?: { stepLabel: string; title: string; text: string }[]
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows = bundle.regressions.map((reg) => ({
    가설: reg.hypothesis,
    모형: reg.label,
    N: reg.n,
    'R²': Number(reg.r2.toFixed(3)),
    '수정된 R²': Number(reg.adjR2.toFixed(3)),
    F: Number(reg.anova.f.toFixed(3)),
    '모형 p': fmtP(reg.anova.p),
    'Durbin-Watson': Number(reg.durbinWatson.toFixed(3)),
    '유의한 독립변수': reg.coeffs
      .filter((c) => c.name !== '(상수)' && c.p < 0.05)
      .map((c) => `${c.name}(β=${fmtNum(c.beta, 3)})`)
      .join(', '),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '분석요약');

  // Sheet 2: EFA
  if (bundle.efa) {
    const efaRows = bundle.efa.rotatedMatrix.map((row) => {
      const obj: Record<string, string | number> = {
        문항: row.item,
        공통성: Number(row.communality.toFixed(3)),
      };
      row.loadings.forEach((l, idx) => {
        obj[`요인${idx + 1}`] = Number(l.toFixed(3));
      });
      return obj;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(efaRows), '요인분석');
  }

  // Sheet 3: Reliability
  const relRows = bundle.reliability.map((r) => ({
    구성개념: r.constructName,
    문항수: r.nItems,
    유효케이스: r.nValid,
    'Cronbach α': Number(r.alpha.toFixed(3)),
    '표준화 α': Number(r.standardizedAlpha.toFixed(3)),
    판정: r.alpha >= 0.7 ? '우수' : r.alpha >= 0.6 ? '양호' : '재검토',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(relRows), '신뢰도분석');

  // Sheet 4: Correlation (Lower triangle)
  const corrHeader = ['변수', ...bundle.correlation.names];
  const corrData = bundle.correlation.names.map((name, i) => [
    name,
    ...bundle.correlation.matrix[i].map((cell, j) =>
      j > i ? '' : Number.isFinite(cell.r) ? Number(cell.r.toFixed(3)) : ''
    ),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([corrHeader, ...corrData]), '상관행렬');

  // Sheet 5: Regression Coefficients
  const regCoeffRows: Record<string, string | number>[] = [];
  for (const reg of bundle.regressions) {
    for (const c of reg.coeffs) {
      regCoeffRows.push({
        가설: reg.hypothesis,
        종속변수: reg.dependent,
        변수: c.name,
        B: Number(c.b.toFixed(3)),
        SE: Number(c.se.toFixed(3)),
        '표준화 β': c.beta !== null ? Number(c.beta.toFixed(3)) : '',
        t: Number(c.t.toFixed(3)),
        p: fmtP(c.p),
        공차: c.tolerance !== null ? Number(c.tolerance.toFixed(3)) : '',
        VIF: c.vif !== null ? Number(c.vif.toFixed(3)) : '',
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regCoeffRows), '회귀계수');

  // Sheet 6: Mediation
  if (bundle.mediation) {
    const medRows = bundle.mediation.paths.map((p) => ({
      독립변수: p.independent,
      매개변수: p.mediator,
      종속변수: p.dependent,
      '경로 a': Number(p.a.toFixed(3)),
      '경로 b': Number(p.b.toFixed(3)),
      '총효과(c)': Number(p.cTotal.toFixed(3)),
      '직접효과(c\')': Number(p.cPrime.toFixed(3)),
      '간접효과(a×b)': Number(p.indirectEffect.toFixed(3)),
      'Sobel Z': Number(p.sobelZ.toFixed(3)),
      'Sobel p': fmtP(p.sobelP),
      'Boot 95% LLCI': Number(p.bootCiLow.toFixed(3)),
      'Boot 95% ULCI': Number(p.bootCiHigh.toFixed(3)),
      매개판정:
        p.status === 'full'
          ? '완전매개'
          : p.status === 'partial'
            ? '부분매개'
            : p.status === 'indirect_only'
              ? '간접효과 유의'
              : '매개효과 없음',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(medRows), '매개효과검증');
  }

  // Sheet 7: Composites Data
  if (bundle.composites.length) {
    const compNames = bundle.composites.map((c) => `${c.name}합`);
    const nRows = bundle.composites[0].values.length;
    const compAoa: (string | number)[][] = [compNames];
    for (let i = 0; i < nRows; i++) {
      compAoa.push(
        bundle.composites.map((c) => {
          const v = c.values[i];
          return v === null ? '' : Number(v.toFixed(4));
        })
      );
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compAoa), '합변수데이터');
  }

  // Sheet 8: Thesis Prose Sentences
  if (thesisSections && thesisSections.length > 0) {
    const proseRows = thesisSections.map((s) => ({
      절차구분: s.stepLabel,
      제목: s.title,
      논문서술문장: s.text,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(proseRows), '논문문장');
  }

  XLSX.writeFile(wb, 'SPSS연구통계_분석결과.xlsx');
}

export function parsePastedSurveyText(rawText: string): {
  rows: DataRow[];
  columns: string[];
} {
  const trimmed = rawText.trim().replace(/^\uFEFF/, '');
  if (!trimmed) return { rows: [], columns: [] };
  const parsed = Papa.parse<DataRow>(trimmed, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  const cleaned = parsed.data.filter((r) =>
    Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
  );
  const columns = (parsed.meta.fields || Object.keys(cleaned[0] || {})).filter(
    (c) => c && String(c).trim() !== ''
  );
  return { rows: cleaned, columns };
}

export function downloadThesisText(title: string, content: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

