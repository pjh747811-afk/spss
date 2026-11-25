import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { StepIssue } from '../types/stats';

interface StepIssuesAlertProps {
  issues?: StepIssue[];
  title?: string;
}

export const StepIssuesAlert: React.FC<StepIssuesAlertProps> = ({ issues = [], title }) => {
  if (!issues.length) return null;

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');

  const containerCls = hasError
    ? 'border-red-200 bg-red-50/90 text-red-900'
    : hasWarning
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : 'border-blue-200 bg-blue-50/80 text-slate-800';

  const Icon = hasError ? AlertCircle : hasWarning ? AlertTriangle : Info;
  const iconCls = hasError
    ? 'text-red-600'
    : hasWarning
      ? 'text-amber-600'
      : 'text-blue-600';

  return (
    <div className={`rounded-xl border px-4 py-3.5 text-xs sm:text-sm space-y-2 ${containerCls}`}>
      {title && (
        <div className="flex items-center gap-2 font-bold">
          <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
          <span>{title}</span>
        </div>
      )}
      <ul className="space-y-1.5 leading-relaxed">
        {issues.map((issue, idx) => {
          const ItemIcon =
            issue.severity === 'error'
              ? AlertCircle
              : issue.severity === 'warning'
                ? AlertTriangle
                : Info;
          const itemIconCls =
            issue.severity === 'error'
              ? 'text-red-600'
              : issue.severity === 'warning'
                ? 'text-amber-600'
                : 'text-blue-600';
          return (
            <li key={idx} className="flex items-start gap-2">
              {!title && <ItemIcon className={`w-4 h-4 shrink-0 mt-0.5 ${itemIconCls}`} />}
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {issue.constraint && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/80 border border-current/20">
                      {issue.constraint}
                    </span>
                  )}
                  <span className="font-medium">{issue.message}</span>
                </div>
                {issue.variables && issue.variables.length > 0 && (
                  <div className="text-xs opacity-80 font-mono break-all">
                    관련 변수: {issue.variables.join(', ')}
                  </div>
                )}
                {issue.actionHint && (
                  <div className="text-xs opacity-90">해결 안내: {issue.actionHint}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
