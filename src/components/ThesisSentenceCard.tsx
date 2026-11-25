import React, { useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { SectionVerificationResult } from '../types/stats';
import { ThesisSection, ThesisStyle } from '../utils/thesisWriter';
import { StatusBadge } from './ThesisVerificationReport';

interface ThesisSentenceCardProps {
  section: ThesisSection;
  verification?: SectionVerificationResult;
}

export const ThesisSentenceCard: React.FC<ThesisSentenceCardProps> = ({
  section,
  verification,
}) => {
  const [style, setStyle] = useState<ThesisStyle>('standard');
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const text = style === 'standard' ? section.standardText : section.conciseText;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-4px_rgba(15,23,42,0.03)] space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <BookOpen className="w-5 h-5 text-blue-700 shrink-0" />
          <h3 className="text-base font-bold text-slate-900">
            결과표 읽기 &amp; 논문에 쓰는 문장 ({section.title})
          </h3>
          {verification && <StatusBadge status={verification.status} />}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setStyle('standard')}
              className={`px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                style === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              논문 본문형
            </button>
            <button
              type="button"
              onClick={() => setStyle('concise')}
              className={`px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer text-center ${
                style === 'concise' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              핵심 요약형
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-700">문장 복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                <span>논문 문장 복사</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reading Guide */}
      <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-4 sm:p-5 space-y-2">
        <div className="text-xs font-bold text-slate-900">결과표 읽는 법</div>
        <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {section.readingGuide.map((line, idx) => (
            <li key={idx}>· {line}</li>
          ))}
        </ul>
      </div>

      {/* Generated Thesis Sentence */}
      <div className="bg-blue-50/40 border border-blue-200/80 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-blue-800">
            논문 본문 서술 예시 (수치 자동 반영 · 8항목 검증 연동)
          </div>
          {verification && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <span>검증 근거 {showDetails ? '접기' : '확인'}</span>
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        <p className="text-sm sm:text-base text-slate-800 leading-relaxed whitespace-pre-line select-all">
          {text}
        </p>

        {verification && showDetails && (
          <div className="border-t border-blue-200/80 pt-3 text-xs space-y-1.5 text-slate-700">
            <div>
              <span className="font-bold text-slate-900">실제 통계 결과: </span>
              <span className="font-mono">{verification.actualStatsSummary}</span>
            </div>
            {verification.issues.length > 0 && (
              <div className="text-rose-800 space-y-0.5">
                {verification.issues.map((iss, idx) => (
                  <div key={idx}>
                    · [{iss.ruleNumber} {iss.ruleTitle}] {iss.reason}
                  </div>
                ))}
              </div>
            )}
            <div className="text-slate-500">
              적용 기준: {verification.appliedCriteria.join(' / ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

