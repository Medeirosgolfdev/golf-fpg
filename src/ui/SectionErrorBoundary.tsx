/**
 * src/ui/SectionErrorBoundary.tsx
 *
 * Error boundary reutilizável para secções de páginas.
 * Previne que um crash numa secção derrube a página toda.
 *
 * Usado em: CompararPage, BJGTAnalysisPage, JogadoresPage, TorneioPage
 */

import React from "react";

type Props = {
  label: string;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export default class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] Crash em "${this.props.label}":`, error, info.componentStack);
  }

  render() {
    if (this.state.error)
      return (
        <div className="notice-error">
          <div className="fw-700 mb-4 c-danger">Erro em: {this.props.label}</div>
          <div className="muted fs-11 mono error-boundary-msg">
            {this.state.error.message}
          </div>
          <button className="btn mt-8" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    return this.props.children;
  }
}
