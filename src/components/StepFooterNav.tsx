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
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
      <div>
        {onPrev && prevLabel ? (
          <button
            type="button"
            onClick={onPrev}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>{prevLabel}</span>
          </button>
        ) : (
          <span className="text-xs text-slate-500">순서대로 각 분석 단계를 확인하며 진행하세요.</span>
        )}
      </div>

      <div>
        {onNext && nextLabel && (
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{nextLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}
        {isLastStep && onResetToStart && (
          <button
            type="button"
            onClick={onResetToStart}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>0. 개요 및 데이터로 돌아가기</span>
          </button>
        )}
      </div>
    </div>
  );
};
