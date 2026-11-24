import React, { useState } from 'react';
import { BookOpen, Check, Copy } from 'lucide-react';
import { ThesisSection, ThesisStyle } from '../utils/thesisWriter';

interface ThesisSentenceCardProps {
  section: ThesisSection;
}

export const ThesisSentenceCard: React.FC<ThesisSentenceCardProps> = ({ section }) => {
  const [style, setStyle] = useState<ThesisStyle>('standard');
  const [copied, setCopied] = useState(false);

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
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
          <h3 className="text-sm font-bold text-slate-900">
            결과표 읽기 &amp; 논문에 쓰는 문장 ({section.title})
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setStyle('standard')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                style === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              논문 본문형
            </button>
            <button
              type="button"
              onClick={() => setStyle('concise')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                style === 'concise' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              핵심 요약형
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-emerald-700">문장 복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>논문 문장 복사</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reading Guide */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5">
        <div className="text-xs font-semibold text-slate-800">결과표 읽는 법</div>
        <ul className="space-y-1 text-xs text-slate-600 leading-relaxed">
          {section.readingGuide.map((line, idx) => (
            <li key={idx}>· {line}</li>
          ))}
        </ul>
      </div>

      {/* Generated Thesis Sentence */}
      <div className="bg-blue-50/40 border border-blue-200/80 rounded-lg p-4">
        <div className="text-[11px] font-semibold text-blue-800 mb-1.5">
          논문 본문 서술 예시 (수치 자동 반영)
        </div>
        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line select-all">
          {text}
        </p>
      </div>
    </div>
  );
};
