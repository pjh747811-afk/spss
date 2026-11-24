import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 min-h-[42px] text-xs font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 text-blue-700 shrink-0" />
        <span>앱으로 설치 (오프라인 지원)</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 min-h-[42px] text-xs font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-4 h-4 text-blue-700 shrink-0" />
          <span>iOS 홈 화면에 추가</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 id="ios-install-title" className="text-lg font-bold text-slate-900">
                  iPhone / iPad 앱 설치
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-4 text-sm text-slate-600 space-y-2.5 list-decimal list-inside leading-relaxed">
                <li>
                  Safari 하단 또는 상단의 <strong className="text-slate-900">공유</strong> 버튼을 누릅니다.
                </li>
                <li>
                  아래로 스크롤해 <strong className="text-slate-900">홈 화면에 추가</strong>를 선택합니다.
                </li>
                <li>오른쪽 상단 추가를 누르면 오프라인에서도 실행됩니다.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-slate-900 py-2.5 min-h-[44px] text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
