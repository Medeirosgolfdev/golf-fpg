/**
 * src/ui/RoundScorecard.tsx — o cartão de buracos de UMA VOLTA do jogador.
 *
 * As quatro tabelas de voltas da ficha (por data, por campo, por torneio e
 * «Últimas 20») abriam o `ScorecardTable` com a mesma lista de props tirada da
 * volta (data, tee, HCP, links, gross oficial). Um só sítio (10/11/2026): cada
 * tabela dá a volta e os buracos; o que varia — nome do campo, pílula de origem
 * e eclético — são props.
 */
import type { RoundData, HoleScores, EclecticEntry } from "../data/playerDataLoader";
import { ScorecardTable } from "./ScorecardTable";

interface Props {
  r: RoundData & { course?: string | null };
  holes: HoleScores;
  /** Nome do campo; por omissão, o da própria volta. */
  courseName?: string;
  /** Pílula de origem (`effectivePill`) — as tabelas que não a mostram omitem. */
  pill?: string;
  /** Eclético da mesma volta/tee, quando a tabela o compara. */
  eclecticEntry?: EclecticEntry | null;
}

export default function RoundScorecard({ r, holes, courseName, pill, eclecticEntry = null }: Props) {
  return (
    <ScorecardTable
      holes={holes}
      courseName={courseName ?? r.course ?? ""}
      date={r.date}
      tee={r.tee || ""}
      hi={r.hi}
      links={r._links}
      pill={pill}
      eclecticEntry={eclecticEntry}
      grossOficial={r.gross}
    />
  );
}
