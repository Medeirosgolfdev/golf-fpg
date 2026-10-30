/**
 * RoundAnalysisPanel — «🧠 Análise das voltas» nos torneios de várias voltas:
 * as frases do analisador (src/utils/roundAnalysis.ts) para o jogador escolhido
 * (o Manuel por omissão). Usa as mesmas opções do «Partilhar volta» (Torneio),
 * que já trazem as voltas de cada jogador; o campo são todas essas opções.
 */
import { useMemo, useState } from "react";
import type { ShareOption } from "./ShareRoundPanel";
import { analyzeRounds, type Insight } from "../utils/roundAnalysis";

const TONE_COLOR: Record<Insight["tone"], string> = {
  good: "var(--color-good)", bad: "var(--color-danger)", neutral: "var(--text-3)",
};
const TONE_ICON: Record<Insight["tone"], string> = { good: "▲", bad: "▼", neutral: "•" };

function Line({ i }: { i: Insight }) {
  return (
    <li className="fs-13" style={{ display: "flex", gap: 8, alignItems: "baseline", lineHeight: 1.45 }}>
      <span style={{ color: TONE_COLOR[i.tone], fontSize: "var(--fs-10)", flexShrink: 0, width: 10 }}>{TONE_ICON[i.tone]}</span>
      <span>{i.text}</span>
    </li>
  );
}

/** `only`: mostra só a comparação dessa volta com a anterior (separador da volta);
 *  sem ele, todas as comparações e o resumo do torneio (separador Resumo). */
export default function RoundAnalysisPanel({ options, defaultKey, only }: { options: ShareOption[]; defaultKey?: string; only?: number }) {
  const [sel, setSel] = useState(defaultKey);
  const cur = options.find((o) => o.key === sel) ?? options.find((o) => o.key === defaultKey) ?? options[0];
  const field = useMemo(() => options.map((o) => o.data.rounds ?? []), [options]);
  const an = useMemo(() => (cur?.data.rounds ? analyzeRounds(cur.data.rounds, field) : null), [cur, field]);
  if (!cur || !an) return null;
  return (
    <details className="mt-12" open>
      <summary className="sim-section-toggle">{only ? `🧠 Análise R${only} vs R${only - 1}` : "🧠 Análise das voltas"}</summary>
      <div className="mt-8" style={{ maxWidth: 760 }}>
        {options.length > 1 && (
          <label className="fs-12 mb-8" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Jogador
            <select className="input" style={{ minWidth: 280 }} value={cur.key} onChange={(e) => setSel(e.target.value)}>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label.replace(/^Torneio · /, "")}</option>)}
            </select>
          </label>
        )}
        {an.rounds.filter((b) => !only || b.round === only).reverse().map((b) => (
          <div key={b.round} className="mb-8">
            {!only && <div className="fw-700 fs-13 mb-4">R{b.round} vs R{b.prev}</div>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              {b.insights.map((x, k) => <Line key={k} i={x} />)}
            </ul>
          </div>
        ))}
        {!only && <>
          <div className="fw-700 fs-13 mb-4">No torneio</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {an.tournament.map((x, k) => <Line key={k} i={x} />)}
          </ul>
        </>}
      </div>
    </details>
  );
}
