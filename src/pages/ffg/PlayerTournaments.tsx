/**
 * PlayerTournaments.tsx — Adaptador FFG do painel "torneios de um jogador".
 *
 * Lê `public/data/ffgolf-player-tournaments.json` (gerado no MESMO passo que o
 * france-players.json, por isso o nº de linhas bate certo com a coluna 📊 Tot)
 * e entrega o formato comum ao `ui/PlayerTournamentsPanel`.
 *
 * Formato do ficheiro (compacto de propósito: ~95k participações):
 *   tournaments[] — catálogo partilhado (com `np` = nº de jogadores da prova);
 *                   o `ti` de cada linha indexa aqui
 *   series[]      — labels de série internados; `si` indexa aqui (-1 = nenhum)
 *   byLicense     — lic → linhas [ti, pos, total, [gross/volta], si], já
 *                   ordenadas por data DESC
 *
 * Cada torneio linka para `/ffg/t/{entryId}` — o mesmo id que a sidebar usa.
 */
import { useMemo } from "react";
import PlayerTournamentsPanel, { type PlayerTournItem } from "../../ui/PlayerTournamentsPanel";
import { displayName } from "../../utils/format";

export interface FfgTournMeta {
  /** entryId da /ffg: `ffgres:{trnId}` ou `gg:{ano}_{slug}`. */
  id: string;
  name: string;
  date: string | null;
  year: number | null;
  course?: string | null;
  ligue?: string | null;
  /** Nº de jogadores da prova (todas as séries) — o `pos` do portal é a
   *  classificação do torneio inteiro, não da série. */
  np?: number | null;
  /** 1 = veio do GolfGenius (Champ. de France, Internationaux). */
  gg?: 1;
  /** 1 = sem página na /ffg (não está no índice de resultats) → sem link. */
  noLink?: 1;
}
/** [ti, pos, total, grossPorVolta, si] */
export type FfgTournRow = [number, number | null, number | null, number[], number];
export interface FfgPlayerTournamentsFile {
  generatedAt: string;
  totalPlayers: number;
  totalAppearances: number;
  series: string[];
  tournaments: FfgTournMeta[];
  byLicense: Record<string, FfgTournRow[]>;
}

export function PlayerTournaments({ file, license }: { file: FfgPlayerTournamentsFile; license: string }) {
  const items = useMemo<PlayerTournItem[]>(() => {
    const rows = file.byLicense[license] || [];
    return rows.map(([ti, pos, total, rounds, si], n) => {
      const t = file.tournaments[ti];
      if (!t) return null;
      // Só dizemos "de N" quando o N é coerente: em ~1% das provas o scrape só
      // apanhou parte das séries e o campo fica menor que a última posição.
      const np = t.np ?? null;
      return {
        key: `${t.id}-${n}`,
        url: t.noLink ? null : `/ffg/t/${encodeURIComponent(t.id)}`,
        name: t.name,
        date: t.date,
        year: t.year,
        sub: si >= 0 ? (file.series[si] || null) : null,
        badge: t.gg ? "GolfGenius" : null,
        course: t.course ? displayName(t.course) : null,
        pos,
        field: np && pos != null && pos <= np ? np : null,
        total,
        rounds: rounds || [],
      } as PlayerTournItem;
    }).filter((x): x is PlayerTournItem => !!x);
  }, [file, license]);

  return <PlayerTournamentsPanel items={items} subLabel="Série" emptyMessage="Sem torneios registados para esta licença." />;
}
