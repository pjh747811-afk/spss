import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTableTSV } from '../utils/fileIO';

interface CopyTableButtonProps {
  label?: string;
  headers: string[];
  rows: (string | number)[][];
}

export const CopyTableButton: React.FC<CopyTableButtonProps> = ({
  label = '엑셀용 표 복사',
  headers,
  rows,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyTableTSV(headers, rows);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2 min-h-[40px] text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-emerald-700">엑셀에 붙여넣기 가능 (복사됨)</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 text-slate-500 shrink-0" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};
