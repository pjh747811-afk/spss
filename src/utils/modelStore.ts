import {
  ConstructMapping,
  DataRow,
  EFAConfig,
  HypothesisConfig,
  VerificationHistoryEntry,
  VerificationReportSummary,
} from '../types/stats';

export const WORKSPACE_STORAGE_KEY = 'spss_research_stats_workspace_v1';
export const VERIFICATION_STORAGE_KEY = 'spss_research_stats_verification_v1';

export type StepId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Step0SubTab = 'overview' | 'model' | 'mapping';

export interface PersistedWorkspace {
  version: 1;
  savedAt: number;
  fileName: string;
  rows: DataRow[];
  columns: string[];
  parseWarnings: string[];
  constructs: ConstructMapping[];
  hypothesis: HypothesisConfig;
  efaConfig: EFAConfig;
  activeStep: StepId;
  step0Tab: Step0SubTab;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore inaccessible storage
  }
  return null;
}

export function loadWorkspace(): PersistedWorkspace | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    if (!parsed || parsed.version !== 1) return null;
    if (!Array.isArray(parsed.constructs) || !parsed.hypothesis || !parsed.efaConfig) {
      return null;
    }
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '',
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      parseWarnings: Array.isArray(parsed.parseWarnings) ? parsed.parseWarnings : [],
      constructs: parsed.constructs,
      hypothesis: parsed.hypothesis,
      efaConfig: parsed.efaConfig,
      activeStep:
        typeof parsed.activeStep === 'number' && parsed.activeStep >= 0 && parsed.activeStep <= 6
          ? (parsed.activeStep as StepId)
          : 0,
      step0Tab:
        parsed.step0Tab === 'overview' || parsed.step0Tab === 'model' || parsed.step0Tab === 'mapping'
          ? parsed.step0Tab
          : 'overview',
    };
  } catch {
    return null;
  }
}

export function saveWorkspace(
  workspace: Omit<PersistedWorkspace, 'version' | 'savedAt'>
): { ok: boolean; quotaExceeded?: boolean } {
  const storage = getStorage();
  if (!storage) return { ok: false };
  const payload: PersistedWorkspace = {
    version: 1,
    savedAt: Date.now(),
    ...workspace,
  };
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch {
    // If large row array exceeds localStorage quota, still persist the research model, constructs, and variable mapping!
    try {
      const compactPayload: PersistedWorkspace = {
        ...payload,
        rows: [],
      };
      storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(compactPayload));
      return { ok: true, quotaExceeded: true };
    } catch {
      return { ok: false, quotaExceeded: true };
    }
  }
}

export function clearWorkspace(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface PersistedVerificationStore {
  version: 1;
  savedAt: number;
  lastSummary: VerificationReportSummary | null;
  history: VerificationHistoryEntry[];
}

export function loadVerificationStore(): {
  lastSummary: VerificationReportSummary | null;
  history: VerificationHistoryEntry[];
} {
  const storage = getStorage();
  if (!storage) return { lastSummary: null, history: [] };
  try {
    const raw = storage.getItem(VERIFICATION_STORAGE_KEY);
    if (!raw) return { lastSummary: null, history: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedVerificationStore>;
    if (!parsed || parsed.version !== 1) return { lastSummary: null, history: [] };
    return {
      lastSummary: parsed.lastSummary ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { lastSummary: null, history: [] };
  }
}

function writeVerificationStore(lastSummary: VerificationReportSummary | null, history: VerificationHistoryEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  const payload: PersistedVerificationStore = {
    version: 1,
    savedAt: Date.now(),
    lastSummary,
    history: history.slice(0, 100),
  };
  try {
    storage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Trim history aggressively if storage is tight
    try {
      const compact: PersistedVerificationStore = {
        version: 1,
        savedAt: Date.now(),
        lastSummary,
        history: history.slice(0, 20),
      };
      storage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // ignore
    }
  }
}

export function saveVerificationSnapshot(summary: VerificationReportSummary): void {
  const current = loadVerificationStore();
  writeVerificationStore(summary, current.history);
}

export function appendVerificationHistory(
  entry: VerificationHistoryEntry
): VerificationHistoryEntry[] {
  const current = loadVerificationStore();
  const nextHistory = [entry, ...current.history].slice(0, 100);
  writeVerificationStore(current.lastSummary, nextHistory);
  return nextHistory;
}

export function clearVerificationHistory(): void {
  const current = loadVerificationStore();
  writeVerificationStore(current.lastSummary, []);
}

