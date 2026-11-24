import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface ScrollableTableProps {
  children: React.ReactNode;
  bordered?: boolean;
  hintText?: string;
  className?: string;
}

export const ScrollableTable: React.FC<ScrollableTableProps> = ({
  children,
  bordered = true,
  hintText = '좌우로 스크롤하여 전체 열 확인',
  className = '',
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 4;
    setHasOverflow(overflow);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollerRef.current;
    if (!el) return;

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(checkScroll) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) {
        ro.observe(el.firstElementChild);
      }
    }
    window.addEventListener('resize', checkScroll);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, children]);

  return (
    <div
      className={`relative ${
        bordered ? 'border border-slate-200/90 rounded-xl bg-white overflow-hidden' : ''
      } ${className}`}
    >
      {hasOverflow && (
        <div
          className={`flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50/95 border-b border-slate-200 text-xs text-slate-600 no-print ${
            bordered ? '' : 'rounded-t-lg border-x border-t border-slate-200/90'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 font-medium">
            <MoveHorizontal className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <span>{hintText}</span>
          </span>
          <span className="font-mono text-xs text-slate-400 shrink-0">
            {canScrollLeft ? '← ' : ''}
            {canScrollRight ? '→' : '끝'}
          </span>
        </div>
      )}

      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={checkScroll}
          className="overflow-x-auto overscroll-x-contain"
        >
          {children}
        </div>

        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-slate-900/[0.06] to-transparent no-print"
          />
        )}
      </div>
    </div>
  );
};
