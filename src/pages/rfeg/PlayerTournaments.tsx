/**
 * PlayerTournaments.tsx — Adaptador RFEG do painel "torneios de um jogador".
 *
 * Lê `public/data/spain-player-tournaments.json` (build-spain-player-tournaments.js,
 * que também baka os `counts` usados na coluna 📊 Tot — os dois números são
 * sempre o mesmo) e entrega o formato comum ao `ui/PlayerTournamentsPanel`.
 *
 * ⚠ Recebe TODAS as licenças do jogador (a lista agrupa quem mudou de clube —
 * a licença muda, a pessoa não). As linhas são unidas e deduplicadas por prova.
 *
 * Formato do ficheiro:
 *   tournaments[] — catálogo: {id:"{source}/{id}", name, date, year, cat, sex,
 *                   course}; o `ti` de cada linha indexa aqui
 *   status[]      — estados de inscrição internados; `st` indexa aqui (-1 = nenhum)
 *   byLicencia    — lic → linhas [ti, pos, total, [gross/volta], st, nCampo],
 *                   ordenadas por data DESC
 */
import { useMemo } from "react";
import PlayerTournamentsPanel, { type PlayerTournItem } from "../../ui/PlayerTournamentsPanel";
import { displayName } from "../../utils/format";

export interface EsTournMeta {
  /** `{source}/{id}` — a rota da /rfeg é /rfeg/{source}/{id}. */
  id: string;
  name: string;
  date: string | null;
  year: number | null;
  cat?: string | null;
  sex?: string | null;
  course?: string | null;
  /** 1 = a prova não aparece na sidebar da /rfeg → sem link. */
  noLink?: 1;
}
/** [ti, pos, total, grossPorVolta, st, nCampo] — o campo é POR LINHA: o `pos`
 *  é dentro da categoria, e um tour NextCaddy junta várias num só torneio. */
export type EsTournRow = [number, number | null, number | null, number[], number, number | null];
export interface EsPlayerTournamentsFile {
  generatedAt: string;
  totalPlayers: number;
  totalAppearances: number;
  status: string[];
  tournaments: EsTournMeta[];
  byLicencia: Record<string, EsTournRow[]>;
  counts: Record<string, [number, number]>;
}

/** Estados que valem a pena mostrar — "admitido" é o normal, não é notícia. */
const STATUS_LABEL: Record<string, string> = {
  reservas: "reserva",
  bajas: "baja",
  invitados: "invitado",
  noAdmitidos: "no admitido",
  provisional: "provisional",
};

/** O `course` do índice arrasta a morada do microsite ("… Dirección Camino
 *  General 12") e às vezes uma lista de federações — cortamos no primeiro
 *  marcador de morada e limitamos o comprimento. */
function shortCourse(c: string): string {
  const cut = c.split(/\s+(?:Direcci[oó]n|Tel[eé]fono|Web)\b/i)[0].trim();
  return cut.length > 46 ? cut.slice(0, 45).trimEnd() + "…" : cut;
}

/** Plataforma → etiqueta discreta a seguir ao nome da prova. */
const SOURCE_LABEL: Record<string, string> = {
  nextcaddy: "NextCaddy",
  livegolfscoring: "LiveScoring",
  golfdirecto: "GolfDirecto",
};

export function PlayerTournaments({ file, licencias }: { file: EsPlayerTournamentsFile; licencias: string[] }) {
  const items = useMemo<PlayerTournItem[]>(() => {
    // Um jogador com várias licenças (mudança de clube) pode ter a mesma prova
    // em duas — fica a linha com resultado.
    const byTi = new Map<number, PlayerTournItem>();
    for (const lic of licencias) {
      for (const [ti, pos, total, rounds, st, field] of (file.byLicencia[lic] || [])) {
        const t = file.tournaments[ti];
        if (!t) continue;
        const statusKey = st >= 0 ? file.status[st] : null;
        const item: PlayerTournItem = {
          key: t.id,
          url: t.noLink ? null : `/rfeg/${t.id}`,
          name: t.name,
          date: t.date,
          year: t.year,
          sub: [t.cat, t.sex].filter(Boolean).join(" ") || null,
          badge: SOURCE_LABEL[t.id.split("/")[0]] ?? null,
          course: t.course ? shortCourse(displayName(t.course)) : null,
          pos,
          field: field ?? null,
          total,
          rounds: rounds || [],
          status: statusKey ? STATUS_LABEL[statusKey] ?? null : null,
        };
        const cur = byTi.get(ti);
        if (!cur || (cur.pos == null && item.pos != null)) byTi.set(ti, item);
      }
    }
    return [...byTi.values()];
  }, [file, licencias]);

  return <PlayerTournamentsPanel items={items} subLabel="Categoría" emptyMessage="Sin torneos registrados para esta licencia." />;
}
