/**
 * src/ui/SectionErrorBoundary.tsx
 *
 * Error boundary reutilizável para secções de páginas.
 * Previne que um crash numa secção derrube a página toda.
 *
 * Usado em: CompararPage, BJGTAnalysisPage, JogadoresPage, TorneioPage
 */

import React from "react";
import { isStaleChunkError, reloadForStaleChunk } from "../utils/staleChunk";

type Props = {
  label: string;
  /** Quando muda (ex.: o caminho do URL), o erro é limpo — sem remontar a página. */
  resetKey?: string;
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

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isStaleChunkError(error) && reloadForStaleChunk()) return;
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
            Repetir
          </button>
        </div>
      );
    return this.props.children;
  }
}
