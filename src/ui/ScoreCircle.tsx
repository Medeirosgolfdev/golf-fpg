/**
 * src/ui/ScoreCircle.tsx
 *
 * Badge visual de score com cor semântica vs par.
 * Usa classes CSS .sc-score de App.css + scClass de scoreDisplay.
 *
 * Usado em: JogadoresPage, BJGTAnalysisPage, TorneioPage
 */

import { scClass } from "../utils/scoreDisplay";

type Props = {
  gross: number | null;
  par: number | null;
  size?: "normal" | "small";
  /** Conteúdo quando gross é null/inválido. Default: "NR" com estilo muted. */
  empty?: "nr" | "dot";
};

export default function ScoreCircle({ gross, par, size = "normal", empty = "nr" }: Props) {
  if (gross == null || gross <= 0) {
    if (empty === "dot") return <span className="sc-score sc-empty">·</span>;
    return <span className="sc-score sc-nr">NR</span>;
  }
  const cls = par != null ? scClass(gross, par) : "";
  return (
    <span
      className={`sc-score ${cls}${size === "small" ? " sc-score-sm" : ""}`}
    >
      {gross}
    </span>
  );
}
