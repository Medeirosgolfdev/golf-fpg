/**
 * RoundAnalysisPanel — «🧠 Análise das voltas» nos torneios de várias voltas:
 * as frases do analisador (src/utils/roundAnalysis.ts) para o jogador escolhido
 * (o Manuel por omissão). Usa as mesmas opções do «Partilhar volta» (Torneio),
 * que já trazem as voltas de cada jogador; o campo são todas essas opções.
 */
import { useMemo, useState } from "react";
import type { ShareOption } from "./ShareRoundPanel";
import { analyzeRounds, type Insight } from "../utils/roundAnalysis";
import Select from "./Select";
import SectionTitle from "./SectionTitle";

const TONE_CLS: Record<Insight["tone"], string> = {
  good: "u-c-color-good", bad: "u-c-color-danger", neutral: "u-c-text-3",
};
const TONE_ICON: Record<Insight["tone"], string> = { good: "▲", bad: "▼", neutral: "•" };

function Line({ i }: { i: Insight }) {
  return (
    <li className="fs-13 u-d-flex u-gap-8px u-ai-baseline u-lh-1_45">
      <span className={"u-fs-fs-10 u-fsh-0 u-w-10px " + TONE_CLS[i.tone]}>{TONE_ICON[i.tone]}</span>
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
      <div className="mt-8 u-maxw-760px">
        {options.length > 1 && (
          <label className="fs-12 mb-8 u-d-flex u-ai-center u-gap-8px">
            Jogador
            <Select className="u-minw-280px" value={cur.key} onChange={setSel}>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label.replace(/^Torneio · /, "")}</option>)}
            </Select>
          </label>
        )}
        {an.rounds.filter((b) => !only || b.round === only).reverse().map((b) => (
          <div key={b.round} className="mb-8">
            {!only && <SectionTitle as="div">R{b.round} vs R{b.prev}</SectionTitle>}
            <ul className="u-list-style-none u-p-0 u-m-0 u-d-flex u-fd-column u-gap-3px">
              {b.insights.map((x, k) => <Line key={k} i={x} />)}
            </ul>
          </div>
        ))}
        {!only && <>
          <SectionTitle as="div">No torneio</SectionTitle>
          <ul className="u-list-style-none u-p-0 u-m-0 u-d-flex u-fd-column u-gap-3px">
            {an.tournament.map((x, k) => <Line key={k} i={x} />)}
          </ul>
        </>}
      </div>
    </details>
  );
}
