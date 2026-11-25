import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info, X } from 'lucide-react';
import { StepIssue } from '../types/stats';
import { getIssueKey, STAGE_METADATA } from '../utils/pipelineError';

export interface NavigateOptions {
  step0Tab?: 'overview' | 'model' | 'mapping';
  highlightVariables?: boolean;
}

export interface ToastItem {
  id: string;
  dedupKey?: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  constraint?: string;
  variables?: string[];
  actionHint?: string;
  stepIndex?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  target?: 'mapping-vars' | 'model' | 'default';
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  notifyIssues: (issues: StepIssue[]) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  registerNavigate: (
    fn: (stepIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6, opts?: NavigateOptions) => void
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const navRef = useRef<
    ((stepIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6, opts?: NavigateOptions) => void) | null
  >(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id: string, severity: ToastItem['severity']) => {
      const durationMs = severity === 'success' ? 4000 : severity === 'info' ? 5500 : 0;
      if (durationMs > 0) {
        const timer = setTimeout(() => {
          dismissToast(id);
        }, durationMs);
        timersRef.current.set(id, timer);
      }
    },
    [dismissToast]
  );

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => {
        if (toast.dedupKey && prev.some((t) => t.dedupKey === toast.dedupKey)) {
          return prev;
        }
        const next = [...prev, { ...toast, id }];
        return next.slice(-5);
      });
      scheduleAutoDismiss(id, toast.severity);
    },
    [scheduleAutoDismiss]
  );

  const notifyIssues = useCallback(
    (issues: StepIssue[]) => {
      // Only raise toasts for actionable calculation errors & warnings (keep routine info inline)
      const actionable = issues.filter(
        (i) => i.severity === 'error' || i.severity === 'warning'
      );

      setToasts((prev) => {
        const preservedManual = prev.filter((t) => !t.dedupKey?.startsWith('issue:'));
        if (!actionable.length) return preservedManual;

        const nextIssueToasts: ToastItem[] = [];
        const seen = new Set<string>();
        for (const issue of actionable) {
          const dedupKey = `issue:${getIssueKey(issue)}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          const meta = STAGE_METADATA[issue.step];
          const isMappingJump =
            issue.step === 'mapping' ||
            Boolean(
              issue.constraint &&
                /미지정|문항|매핑|변수 중복|불일치|누락/.test(issue.constraint)
            );
          nextIssueToasts.push({
            id: `toast-${dedupKey}`,
            dedupKey,
            severity: issue.severity,
            title: meta ? `${meta.label} 진단` : '통계 분석 알림',
            message: issue.message,
            constraint: issue.constraint,
            variables: issue.variables,
            actionHint: issue.actionHint,
            stepIndex: isMappingJump ? 0 : meta?.stepIndex,
            target: isMappingJump ? 'mapping-vars' : 'default',
          });
        }

        return [...preservedManual, ...nextIssueToasts].slice(-5);
      });
    },
    []
  );

  const registerNavigate = useCallback(
    (fn: (stepIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6, opts?: NavigateOptions) => void) => {
      navRef.current = fn;
    },
    []
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{ toasts, pushToast, notifyIssues, dismissToast, clearToasts, registerNavigate }}
    >
      {children}
      {toasts.length > 0 && (
        <aside
          aria-live="polite"
          aria-label="통계 분석 알림"
          className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md space-y-2.5 pointer-events-none no-print"
        >
          {toasts.map((toast) => {
            const style =
              toast.severity === 'error'
                ? {
                    card: 'border-red-300 bg-white text-slate-900 shadow-[0_10px_30px_-5px_rgba(220,38,38,0.2)]',
                    bar: 'bg-red-600',
                    badge: 'bg-red-50 text-red-700 border-red-200',
                    Icon: AlertCircle,
                    iconCls: 'text-red-600',
                  }
                : toast.severity === 'warning'
                  ? {
                      card: 'border-amber-300 bg-white text-slate-900 shadow-[0_10px_30px_-5px_rgba(217,119,6,0.18)]',
                      bar: 'bg-amber-500',
                      badge: 'bg-amber-50 text-amber-800 border-amber-200',
                      Icon: AlertTriangle,
                      iconCls: 'text-amber-600',
                    }
                  : toast.severity === 'success'
                    ? {
                        card: 'border-emerald-300 bg-white text-slate-900 shadow-lg',
                        bar: 'bg-emerald-600',
                        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        Icon: CheckCircle2,
                        iconCls: 'text-emerald-600',
                      }
                    : {
                        card: 'border-blue-300 bg-white text-slate-900 shadow-lg',
                        bar: 'bg-blue-600',
                        badge: 'bg-blue-50 text-blue-700 border-blue-200',
                        Icon: Info,
                        iconCls: 'text-blue-600',
                      };

            const Icon = style.Icon;

            return (
              <div
                key={toast.id}
                role="alert"
                className={`pointer-events-auto relative overflow-hidden rounded-2xl border p-4 transition-all ${style.card}`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.bar}`} />
                <div className="pl-2 flex items-start gap-3">
                  <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.iconCls}`} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-slate-900">{toast.title}</span>
                        {toast.constraint && (
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${style.badge}`}
                          >
                            {toast.constraint}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissToast(toast.id)}
                        aria-label="알림 닫기"
                        className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{toast.message}</p>

                    {toast.variables && toast.variables.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[11px] font-semibold text-slate-500">대상 변수:</span>
                        {toast.variables.slice(0, 6).map((v) => (
                          <span
                            key={v}
                            className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {v}
                          </span>
                        ))}
                        {toast.variables.length > 6 && (
                          <span className="text-[11px] text-slate-500">
                            외 {toast.variables.length - 6}개
                          </span>
                        )}
                      </div>
                    )}

                    {toast.actionHint && (
                      <p className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/80 leading-relaxed">
                        {toast.actionHint}
                      </p>
                    )}

                    {toast.stepIndex !== undefined && navRef.current && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            navRef.current?.(
                              toast.stepIndex!,
                              toast.target === 'mapping-vars'
                                ? { step0Tab: 'mapping', highlightVariables: true }
                                : undefined
                            );
                            dismissToast(toast.id);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          <span>해당 단계 확인하기</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </aside>
      )}
    </ToastContext.Provider>
  );
};
