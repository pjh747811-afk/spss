import React, { useState } from 'react';
import { CheckSquare, Square, Terminal } from 'lucide-react';

interface SPSSGuideBarProps {
  menuPath: string;
  steps: string[];
  note?: string;
}

export const SPSSGuideBar: React.FC<SPSSGuideBarProps> = ({ menuPath, steps, note }) => {
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => false));

  const toggle = (idx: number) => {
    setChecked((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  const doneCount = checked.filter(Boolean).length;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="inline-flex items-center gap-2 bg-slate-900 text-emerald-300 font-mono text-xs px-3 py-1.5 rounded-md self-start">
          <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{menuPath}</span>
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          SPSS 실습 체크 {doneCount}/{steps.length}
        </span>
      </div>

      <ol className="space-y-1.5 text-xs text-slate-700">
        {steps.map((step, idx) => {
          const isDone = checked[idx];
          return (
            <li key={idx}>
              <button
                type="button"
                onClick={() => toggle(idx)}
                className="w-full flex items-start gap-2 text-left hover:text-slate-950 transition-colors cursor-pointer py-0.5"
              >
                {isDone ? (
                  <CheckSquare className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <span className={isDone ? 'line-through text-slate-400' : 'text-slate-700'}>
                  <span className="font-mono font-semibold mr-1.5">{idx + 1}.</span>
                  {step}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {note && <p className="text-xs text-slate-500 pt-1 border-t border-slate-200">{note}</p>}
    </div>
  );
};
