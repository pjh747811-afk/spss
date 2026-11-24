import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AnalysisBundle, ConstructMapping, DataRow } from '../types/stats';
import { fmtNum, fmtP, profileColumns, sigStars } from './statistics';

export interface ParsedSurveyResult {
  rows: DataRow[];
  columns: string[];
  fileName: string;
  warnings: string[];
}

function decodeTextBuffer(buf: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf), encoding: 'utf-16be' };
  }
  let text = new TextDecoder('utf-8').decode(buf);
  let encoding = 'utf-8';
  if (text.includes('\uFFFD')) {
    try {
      const euc = new TextDecoder('euc-kr').decode(buf);
      if (!euc.includes('\uFFFD') || euc.split('\uFFFD').length < text.split('\uFFFD').length) {
        text = euc;
        encoding = 'euc-kr';
      }
    } catch {
      // keep utf-8 fallback
    }
  }
  return { text: text.replace(/^\uFEFF/, ''), encoding };
}

function formatCellValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const str = String(val).replace(/[\u00A0\u3000]/g, ' ').trim();
  if (!str) return null;

  // Convert clean numeric strings (including comma-formatted numbers like "1,234.5")
  if (/^[+-]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(str)) {
    const parsed = Number(str.replace(/,/g, '').replace(/\s+/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return str;
}

function isRowEmpty(row: unknown[]): boolean {
  return !row || row.every((cell) => formatCellValue(cell) === null);
}

export function normalizeTabularData(rawMatrix: unknown[][]): {
  rows: DataRow[];
  columns: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const nonEmptyRows = rawMatrix.filter((r) => Array.isArray(r) && !isRowEmpty(r));
  if (nonEmptyRows.length < 2) {
    return { rows: [], columns: [], warnings };
  }

  // Detect if Row 0 is a single-cell title banner above the real header row
  let headerIdx = 0;
  const countNonEmpty = (r: unknown[]) => r.filter((c) => formatCellValue(c) !== null).length;
  if (
    nonEmptyRows.length >= 3 &&
    countNonEmpty(nonEmptyRows[0]) === 1 &&
    countNonEmpty(nonEmptyRows[1]) >= 2
  ) {
    headerIdx = 1;
    warnings.push('첫 번째 행이 제목 배너로 감지되어 두 번째 행을 변수명(헤더)으로 인식했습니다.');
  }

  const rawHeaderRow = nonEmptyRows[headerIdx];
  const dataMatrix = nonEmptyRows.slice(headerIdx + 1);
  const maxWidth = Math.max(
    rawHeaderRow.length,
    ...dataMatrix.map((r) => r.length)
  );

  // Determine which column indices actually have a header or data
  const activeIndices: number[] = [];
  for (let colIdx = 0; colIdx < maxWidth; colIdx++) {
    const rawH = rawHeaderRow[colIdx];
    const headerText =
      rawH === null || rawH === undefined ? '' : String(rawH).replace(/[\u00A0\u3000]/g, ' ').trim();
    const isAutoEmpty = /^__EMPTY(_\d+)?$/i.test(headerText);
    const hasData = dataMatrix.some((r) => formatCellValue(r[colIdx]) !== null);
    if ((headerText && !isAutoEmpty) || hasData) {
      activeIndices.push(colIdx);
    }
  }

  // Build deduplicated column names
  const usedNames = new Map<string, number>();
  const duplicateNames: string[] = [];
  let unnamedCount = 0;
  const colMapping: { colIdx: number; name: string }[] = activeIndices.map((colIdx, seqIdx) => {
    const rawH = rawHeaderRow[colIdx];
    let baseName =
      rawH === null || rawH === undefined
        ? ''
        : String(rawH).replace(/^\uFEFF/, '').replace(/[\u00A0\u3000]/g, ' ').trim();

    if (!baseName || /^__EMPTY(_\d+)?$/i.test(baseName)) {
      unnamedCount++;
      baseName = `변수${seqIdx + 1}`;
    }

    const prevCount = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, prevCount + 1);
    let finalName = baseName;
    if (prevCount > 0) {
      finalName = `${baseName} (${prevCount + 1})`;
      while (usedNames.has(finalName)) {
        finalName = `${finalName}_dup`;
      }
      usedNames.set(finalName, 1);
      duplicateNames.push(baseName);
    }
    return { colIdx, name: finalName };
  });

  if (unnamedCount > 0) {
    warnings.push(`헤더가 비어 있는 ${unnamedCount}개 열에 임시 변수명(변수N)을 부여했습니다.`);
  }
  if (duplicateNames.length > 0) {
    warnings.push(
      `중복된 변수명(${Array.from(new Set(duplicateNames)).join(', ')})을 구분하기 위해 번호를 붙였습니다.`
    );
  }

  const columns = colMapping.map((m) => m.name);
  const rows: DataRow[] = [];
  for (const rawRow of dataMatrix) {
    const obj: DataRow = {};
    let rowHasValue = false;
    for (const { colIdx, name } of colMapping) {
      const cleanedVal = formatCellValue(rawRow[colIdx]);
      obj[name] = cleanedVal;
      if (cleanedVal !== null) rowHasValue = true;
    }
    if (rowHasValue) rows.push(obj);
  }

  return { rows, columns, warnings };
}

export async function parseSurveyFile(file: File): Promise<ParsedSurveyResult> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) {
      throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
    }

    let bestRows: DataRow[] = [];
    let bestCols: string[] = [];
    let bestWarnings: string[] = [];
    let usedSheet = wb.SheetNames[0];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        raw: true,
      });
      const normalized = normalizeTabularData(aoa);
      if (normalized.rows.length > 0 && normalized.columns.length > 0) {
        bestRows = normalized.rows;
        bestCols = normalized.columns;
        bestWarnings = normalized.warnings;
        usedSheet = sheetName;
        break;
      }
    }

    if (usedSheet !== wb.SheetNames[0]) {
      bestWarnings.unshift(`첫 번째 시트가 비어 있어 '${usedSheet}' 시트를 불러왔습니다.`);
    }
    return { rows: bestRows, columns: bestCols, fileName: file.name, warnings: bestWarnings };
  }

  if (lower.endsWith('.json')) {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(text);
    let aoa: unknown[][] = [];

    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      const keySet = new Set<string>();
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((k) => keySet.add(k));
        }
      }
      const keys = Array.from(keySet);
      aoa = [keys, ...parsed.map((r) => keys.map((k) => (r as Record<string, unknown>)?.[k] ?? null))];
    } else if (parsed && typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      const len = keys.length && Array.isArray(parsed[keys[0]]) ? parsed[keys[0]].length : 0;
      aoa = [keys];
      for (let i = 0; i < len; i++) {
        aoa.push(keys.map((k) => parsed[k]?.[i] ?? null));
      }
    }
    const normalized = normalizeTabularData(aoa);
    return { ...normalized, fileName: file.name };
  }

  // CSV / TSV / TXT with UTF-16, UTF-8, EUC-KR encoding resilience
  const buf = await file.arrayBuffer();
  const { text } = decodeTextBuffer(buf);

  const parsed = Papa.parse<unknown[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', '\t', ';', '|'],
  });

  const normalized = normalizeTabularData(parsed.data || []);
  return { ...normalized, fileName: file.name };
}

const ID_LIKE_PATTERN =
  /^(id|no|num|index|seq|resp(?:ondent)?|timestamp|time|date|연번|번호|순번|응답자(?:id|번호)?|타임스탬프|응답일시|응답시간)$/i;

const DEMOGRAPHIC_LIKE_PATTERN =
  /^(gender|sex|age|birth|edu(?:cation)?|tenure|career|position|rank|title|dept|department|income|salary|marri(?:ed|tal)|성별|연령|나이|출생|학력|근속(?:연수|년수)?|경력|직급|직위|직책|부서|소득|연봉|급여|결혼|혼인)$/i;

const SUMMARY_COL_PATTERN = /(?:합계|합|_mean|_avg|_total|_sum|^FAC\d+(?:_\d+)?)$/i;

function extractScalePrefix(colName: string): string | null {
  const trimmed = colName.trim();
  // Match delimiter + number: Q1_1, 만족도-1, 만족도(1), 만족도 1, A1.2
  const delimMatch = trimmed.match(/^(.+?)[_\-.\s(]+(\d+)\)?$/);
  if (delimMatch && delimMatch[1].trim()) {
    return delimMatch[1].trim();
  }
  // Match non-digit prefix + trailing digits: 카리스마1, X1, IV2
  const numMatch = trimmed.match(/^([^\d]+?)(\d+)$/);
  if (numMatch && numMatch[1].trim()) {
    return numMatch[1].trim();
  }
  return null;
}

export function autoDetectConstructs(columns: string[], rows?: DataRow[]): ConstructMapping[] {
  const profiles = rows && rows.length > 0 ? profileColumns(rows, columns) : null;
  const profileMap = profiles ? new Map(profiles.map((p) => [p.name, p])) : null;

  // Step 1: Select numeric (non-constant, non-ID, non-demographic) columns when data profiles are available
  let candidateCols = columns.filter((col) => {
    const trimmed = col.trim();
    if (ID_LIKE_PATTERN.test(trimmed) || DEMOGRAPHIC_LIKE_PATTERN.test(trimmed)) return false;
    if (profileMap) {
      const prof = profileMap.get(col);
      if (!prof || prof.kind !== 'numeric') return false;
    }
    return true;
  });

  // Fallback if all numeric cols were filtered or profile wasn't available
  if (!candidateCols.length) {
    candidateCols = columns.filter((col) => {
      if (profileMap) {
        const prof = profileMap.get(col);
        return prof?.kind === 'numeric' || prof?.kind === 'categorical';
      }
      return !ID_LIKE_PATTERN.test(col.trim());
    });
  }

  // Exclude summary/composite columns (e.g., 카리스마합, FAC1_1) ONLY if non-summary scale items exist
  const nonSummaryCols = candidateCols.filter((c) => !SUMMARY_COL_PATTERN.test(c.trim()));
  const itemCols = nonSummaryCols.length >= 2 ? nonSummaryCols : candidateCols;

  // Step 2: Check sample/known Korean domain construct patterns first
  const defaults: { name: string; patterns: RegExp[] }[] = [
    { name: '혁신행동', patterns: [/^혁신행동/i, /^innov/i] },
    { name: '카리스마', patterns: [/^카리스마/i, /^charisma/i] },
    { name: '개별배려', patterns: [/^배려/i, /^개별배려/i, /^consider/i] },
    { name: '심리적자본', patterns: [/^심리적자본/i, /^심리자본/i, /^psycap/i] },
    { name: '지적자극', patterns: [/^지적자극/i, /^지적/i, /^intel/i] },
    { name: '동기부여', patterns: [/^동기/i, /^motiv/i, /^inspir/i] },
  ];

  const detected: ConstructMapping[] = defaults
    .map((d, idx) => {
      const items = itemCols.filter((c) => d.patterns.some((p) => p.test(c)));
      items.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      return {
        id: `c-${idx}-${d.name}`,
        name: d.name,
        items,
      };
    })
    .filter((c) => c.items.length > 0);

  if (detected.length > 0) return detected;

  // Step 3: Generic prefix grouping (handles Q1_1..Q1_3, 만족도1..만족도3, X1..X3, etc.)
  const groups = new Map<string, string[]>();
  const ungrouped: string[] = [];
  for (const col of itemCols) {
    const prefix = extractScalePrefix(col);
    if (prefix) {
      const list = groups.get(prefix) || [];
      list.push(col);
      groups.set(prefix, list);
    } else {
      ungrouped.push(col);
    }
  }

  const generic: ConstructMapping[] = [];
  let idx = 0;
  for (const [prefix, items] of groups.entries()) {
    if (items.length >= 2) {
      const sorted = [...items].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      generic.push({ id: `c-${idx++}`, name: prefix, items: sorted });
    } else {
      ungrouped.push(...items);
    }
  }

  // Include remaining ungrouped numeric columns as single-item constructs when multi-construct model exists
  if (generic.length > 0) {
    for (const col of ungrouped) {
      if (generic.length < 8) {
        generic.push({ id: `c-${idx++}`, name: col, items: [col] });
      }
    }
    return generic;
  }

  // Step 4: Pre-aggregated / distinct numeric variables (e.g. 직무만족, 조직몰입, 이직의도)
  if (itemCols.length >= 2 && itemCols.length <= 10) {
    return itemCols.map((col, i) => ({
      id: `c-${i}`,
      name: col,
      items: [col],
    }));
  }

  return itemCols.length
    ? [{ id: 'c-0', name: '구성개념 1', items: itemCols.slice(0, Math.min(12, itemCols.length)) }]
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
  warnings: string[];
} {
  const trimmed = rawText.trim().replace(/^\uFEFF/, '');
  if (!trimmed) return { rows: [], columns: [], warnings: [] };
  const parsed = Papa.parse<unknown[]>(trimmed, {
    header: false,
    skipEmptyLines: 'greedy',
    delimitersToGuess: ['\t', ',', ';', '|'],
  });
  return normalizeTabularData(parsed.data || []);
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

