import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-white p-8 font-mono text-sm">
          <h1 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h1>
          <pre className="bg-slate-900 p-4 rounded overflow-auto text-red-300">
            {this.state.error.message}
          </pre>
          <pre className="mt-4 bg-slate-900 p-4 rounded overflow-auto text-slate-400 text-xs">
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
