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
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-emerald-700">엑셀에 붙여넣기 가능 (복사됨)</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};
