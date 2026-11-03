/**
 * HcpPill — pílula «HCP 12.3» com 3 níveis de destaque relativamente ao escalão:
 *   - TOP 25%    → verde (dos melhores do escalão)
 *   - MEIO 50%   → neutra (o estado normal)
 *   - FUNDO 25%  → só texto esbatido
 * Sem estatísticas do escalão (ou com menos de 5 jogadores) fica neutra.
 * HCP ≥ 54 = HI ainda não estabelecido (em formação): esbatida.
 *
 * Percentis dentro do mesmo escalão, para tirar a falsa hierarquia do «HCP baixo
 * = melhor em absoluto» (um Sub-10 com 25 pode ser dos melhores do escalão).
 * Experimentámos 4 níveis (quartis) mas era confuso — 11.8 e 11.9 mudavam de cor
 * por ruído; com 3, só o topo e o fundo têm sinal.
 */
import { fmtHcp } from "../utils/format";

/** HCP a partir do qual o HI ainda não está estabelecido (fica fora das estatísticas do escalão). */
export const HCP_UNESTABLISHED_THRESHOLD = 54;

/** Percentis do HCP num escalão (computeHcpStatsByEscalao). */
export interface HcpBand { p25: number; p75: number; count: number }

export default function HcpPill({ hcp, band }: { hcp: number | null; band?: HcpBand }) {
  if (hcp == null || !isFinite(hcp)) return null;
  const txt = `HCP ${fmtHcp(hcp)}`;
  if (hcp >= HCP_UNESTABLISHED_THRESHOLD) {
    return <span className="p p-sm p-hcp-low"
      title={`${txt} — HI ainda não estabelecido (jogador em formação, excluído das stats do escalão)`}>{txt}</span>;
  }
  let cls = "p-hcp-mid";
  let tooltip = txt;
  if (band && band.count >= 5) {
    const { p25, p75, count } = band;
    if (hcp <= p25) { cls = "p-hcp-top"; tooltip += ` · TOP 25% do escalão (entre ${count} jogadores)`; }
    else if (hcp > p75) { cls = "p-hcp-low"; tooltip += ` · Bottom 25% do escalão (entre ${count} jogadores)`; }
    else tooltip += ` · típico do escalão (entre ${count} jogadores)`;
  } else if (band) {
    tooltip += ` · escalão com poucos jogadores (${band.count})`;
  }
  return <span className={`p p-sm ${cls}`} title={tooltip}>{txt}</span>;
}

/** O HCP em texto, a negrito, com o «plus» a dourado («+1.2») — as listas de
 *  «melhores HCP» dos federados (03/11/2026: eram 4 cópias com a cor em `style`).
 *  O tamanho vai em `className` (fs-13, fs-14…). */
export function HcpText({ hcp, className }: { hcp: number | null | undefined; className?: string }) {
  const plus = hcp != null && hcp < 0;
  return <span className={`hcp-text${plus ? " hcp-plus" : ""}${className ? " " + className : ""}`}>{fmtHcp(hcp)}</span>;
}
