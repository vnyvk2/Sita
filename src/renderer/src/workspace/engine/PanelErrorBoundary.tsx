import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  panelId: string;
  panelTitle: string;
  canClose?: boolean;
  onClose?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[PanelErrorBoundary] Panel '${this.props.panelTitle}' (${this.props.panelId}) crashed:`,
      error,
      errorInfo
    );
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="text-font-color-black dark:text-font-color-white flex h-full w-full flex-col items-center justify-center p-6 text-center">
          <span className="material-symbols-rounded mb-2 text-4xl text-rose-500">error</span>
          <h3 className="text-base font-semibold">Panel Error</h3>
          <p className="text-font-color-dimmed mt-1 max-w-[85%] truncate text-xs">
            {this.state.error?.message || 'An unexpected error occurred in this panel.'}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="bg-background-color-3 dark:bg-dark-background-color-3 flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            >
              <span className="material-symbols-rounded text-sm">refresh</span>
              Reload Panel
            </button>
            {this.props.canClose && this.props.onClose && (
              <button
                type="button"
                onClick={this.props.onClose}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
              >
                Close
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
