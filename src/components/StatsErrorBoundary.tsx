import React from 'react';
import { AlertOctagon, Database, RefreshCw } from 'lucide-react';
import { classifyRuntimeError, PipelineStage, STAGE_METADATA } from '../utils/pipelineError';

interface StatsErrorBoundaryProps {
  children: React.ReactNode;
  stage?: PipelineStage;
  variables?: string[];
  resetKey?: string | number;
  onGoToData?: () => void;
  onReset?: () => void;
}

interface StatsErrorBoundaryState {
  hasError: boolean;
  error: unknown;
  componentStack: string | null;
  showTechDetails: boolean;
}

export class StatsErrorBoundary extends React.Component<
  StatsErrorBoundaryProps,
  StatsErrorBoundaryState
> {
  constructor(props: StatsErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      showTechDetails: false,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<StatsErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    const stage = this.props.stage ?? 'regression';
    const classified = classifyRuntimeError(error, stage, this.props.variables ?? []);
    console.error('[SPSS 연구통계] ErrorBoundary 런타임 오류 포착:', {
      stage,
      classified,
      error,
      componentStack: errorInfo.componentStack,
    });
    this.setState({
      componentStack: errorInfo.componentStack ?? null,
    });
  }

  componentDidUpdate(prevProps: StatsErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({
        hasError: false,
        error: null,
        componentStack: null,
        showTechDetails: false,
      });
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      showTechDetails: false,
    });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const stage = this.props.stage ?? 'regression';
    const classified = classifyRuntimeError(this.state.error, stage, this.props.variables ?? []);
    const stageMeta = STAGE_METADATA[classified.step];
    const rawDetail =
      this.state.error instanceof Error
        ? `${this.state.error.name}: ${this.state.error.message}`
        : String(this.state.error ?? '');

    return (
      <div
        role="alert"
        className="bg-white border border-red-200 rounded-2xl p-5 sm:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-6px_rgba(220,38,38,0.12)] space-y-5"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-5 h-5 text-red-600" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                통계 연산·화면 처리 중 오류가 감지되었습니다
              </h2>
              {stageMeta && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                  {stageMeta.label}
                </span>
              )}
              {classified.constraint && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200">
                  제약 위반: {classified.constraint}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{classified.message}</p>
          </div>
        </div>

        {classified.variables && classified.variables.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-slate-700">실패와 관련된 변수 · 문항</div>
            <div className="flex flex-wrap gap-1.5">
              {classified.variables.map((v) => (
                <span
                  key={v}
                  className="text-xs font-mono px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-800"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {classified.actionHint && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs sm:text-sm text-amber-900 leading-relaxed">
            <strong className="font-bold">권장 조치: </strong>
            {classified.actionHint}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 min-h-[40px] text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>현재 단계 다시 시도</span>
            </button>
            {this.props.onGoToData && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null, componentStack: null });
                  this.props.onGoToData?.();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4 shrink-0" />
                <span>0단계 데이터·변수 매핑으로 이동</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => this.setState((s) => ({ showTechDetails: !s.showTechDetails }))}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 underline cursor-pointer"
          >
            {this.state.showTechDetails ? '기술 상세 닫기' : '오류 상세 보기'}
          </button>
        </div>

        {this.state.showTechDetails && (
          <pre className="rounded-xl bg-slate-900 text-slate-200 p-3.5 text-[11px] font-mono overflow-x-auto max-h-48 leading-relaxed">
            {rawDetail}
            {this.state.componentStack ? `\n${this.state.componentStack}` : ''}
          </pre>
        )}
      </div>
    );
  }
}
