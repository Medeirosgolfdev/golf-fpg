/**
 * src/ui/ScoreCircle.tsx
 *
 * Badge visual de score com cor semântica vs par.
 * Usa classes CSS .sc-score de App.css + scClass de scoreDisplay.
 *
 * Usado em: JogadoresPage, BJGTAnalysisPage
 */

import { scClass } from "../utils/scoreDisplay";

type Props = {
  gross: number | null;
  par: number | null;
  size?: "normal" | "small";
};

export default function ScoreCircle({ gross, par, size = "normal" }: Props) {
  if (gross == null || gross <= 0)
    return <span className="c-border fs-9">NR</span>;
  const cls = par != null ? scClass(gross, par) : "";
  return (
    <span
      className={`sc-score ${cls}${size === "small" ? " sc-score-sm" : ""}`}
    >
      {gross}
    </span>
  );
}
