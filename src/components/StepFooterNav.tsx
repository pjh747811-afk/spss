import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

interface StepFooterNavProps {
  prevLabel?: string;
  nextLabel?: string;
  onPrev?: () => void;
  onNext?: () => void;
  isLastStep?: boolean;
  onResetToStart?: () => void;
}

export const StepFooterNav: React.FC<StepFooterNavProps> = ({
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  isLastStep,
  onResetToStart,
}) => {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
      <div className="w-full sm:w-auto">
        {onPrev && prevLabel ? (
          <button
            type="button"
            onClick={onPrev}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/90 bg-white px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>{prevLabel}</span>
          </button>
        ) : (
          <span className="block text-center sm:text-left text-xs text-slate-500">
            순서대로 각 분석 단계를 확인하며 진행하세요.
          </span>
        )}
      </div>

      <div className="w-full sm:w-auto">
        {onNext && nextLabel && (
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 min-h-[44px] text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{nextLabel}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        )}
        {isLastStep && onResetToStart && (
          <button
            type="button"
            onClick={onResetToStart}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 min-h-[44px] text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>0. 개요 및 데이터로 돌아가기</span>
          </button>
        )}
      </div>
    </div>
  );
};
