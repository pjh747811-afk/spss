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
    <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="inline-flex items-center gap-2 bg-slate-900 text-emerald-300 font-mono text-xs px-3.5 py-2 rounded-lg shadow-sm self-start">
          <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="break-words">{menuPath}</span>
        </div>
        <span className="text-xs text-slate-600 font-mono tabular-nums font-semibold">
          SPSS 실습 체크 {doneCount}/{steps.length}
        </span>
      </div>

      <ol className="space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
        {steps.map((step, idx) => {
          const isDone = checked[idx];
          return (
            <li key={idx}>
              <button
                type="button"
                onClick={() => toggle(idx)}
                className="w-full flex items-start gap-2.5 text-left hover:text-slate-950 transition-colors cursor-pointer py-1 rounded-lg px-1.5 -mx-1.5 hover:bg-white/80"
              >
                {isDone ? (
                  <CheckSquare className="w-4 h-4 text-blue-700 shrink-0 mt-1" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                )}
                <span className={isDone ? 'line-through text-slate-400' : 'text-slate-700'}>
                  <span className="font-mono font-semibold text-slate-900 mr-1.5">{idx + 1}.</span>
                  {step}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {note && <p className="text-xs text-slate-600 pt-2.5 border-t border-slate-200/80 leading-relaxed">{note}</p>}
    </div>
  );
};
