/**
 * PastEditionsTable.tsx — "Edições anteriores" de um torneio internacional.
 *
 * Porta para as fontes JobFile (GolfGenius/GolfBox — CoC, FSGA, UA, México,
 * ETC…) a vista que o `HistoricTopNTable` do FieldRivaisDashboard dá aos
 * torneios USKids (`/kids2/next-t?…&tab=scores`): uma coluna por EDIÇÃO do
 * mesmo torneio+escalão, linhas = posição, células = nome · total · ±par ·
 * pancadas de cada ronda. Serve para ver "que score é preciso para ganhar /
 * entrar no top-10 neste escalão" ao longo dos anos.
 *
 * O `HistoricTopNTable` não é reutilizável aqui: lê o
 * `uskids-member-history-slim.json` + `autoRivals` (mundo USKids). Este recebe
 * as edições já normalizadas — quem as carrega é a página (ver
 * `PastEditionsTab` na MajorPage, que faz lazy-load dos `{slug}_{ano}.json`).
 */
import { useMemo, useState } from "react";
import { fmtToPar } from "../../utils/format";
import { clubFlagPrefix } from "../../utils/flagUtils";
import { tpColorDark } from "../../utils/scoreDisplay";
import EmptyState from "../EmptyState";

export interface PastEditionPlayer {
  pos: number | null;
  name: string;
  /** Clube/país já formatado pela página (ex: "🇿🇼 Zimbabwe") — mostra-se só a bandeira. */
  club?: string | null;
  total: number | null;
  /** ±par do torneio (soma das rondas jogadas). */
  toPar: number | null;
  /** Gross de cada ronda, por ordem (buracos por jogar → null). */
  rounds: (number | null)[];
  /** Buracos com score (informativo). */
  holesPlayed: number;
  /** Voltas completas — ordena finishers à frente de WD/DNF/em curso. */
  fullRounds: number;
  isManuel?: boolean;
  isPt?: boolean;
}

export interface PastEdition {
  /** Id ÚNICO da coluna. Normalmente o ano chega, mas há fontes com VÁRIAS
   *  edições no mesmo ano (Drive: as etapas de um tour repetem-se, por vezes no
   *  mesmo campo) → o ano não serve de chave/ordenação. */
  id: string;
  year: number;
  /** Rótulo específico desta edição (ex: "3º DT Norte") — mostrado por baixo do
   *  ano só quando há várias edições no mesmo ano, para as distinguir. */
  label?: string | null;
  /** Escalão desta edição (pode diferir no nome: "Under 15 Girls" ↔ "Under 14 Girls"). */
  division: string;
  course?: string | null;
  nRounds: number;
  /** Par de UMA ronda (para a coluna ±). */
  parPerRound?: number | null;
  players: PastEditionPlayer[];
  /** Link para a fonte oficial (leaderboard). */
  url?: string | null;
}

/** Ordenação: "pos" (default) ou `{ano}_{T|TP|R{n}}` — cada edição é uma lista
 *  independente, por isso ordenar por uma coluna só reordena ESSA edição. */
type SortDir = "asc" | "desc";

export default function PastEditionsTable({ editions, title }: { editions: PastEdition[]; title?: string }) {
  const [sortKey, setSortKey] = useState<string>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const onSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };
  const arrow = (k: string) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕");

  const cols = useMemo(() => editions.map((e) => {
    const metric = sortKey.startsWith(`${e.id}_`) ? sortKey.slice(e.id.length + 1) : null;
    const val = (p: PastEditionPlayer): number | null => {
      if (!metric) return null;
      if (metric === "T") return p.total;
      if (metric === "TP") return p.toPar;
      const m = /^R(\d+)$/.exec(metric);
      return m ? (p.rounds[+m[1] - 1] ?? null) : null;
    };
    const list = [...e.players];
    if (metric) {
      list.sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;           // sem valor sempre no fim
        if (vb == null) return -1;
        return sortDir === "asc" ? va - vb : vb - va;
      });
    }
    return { ...e, players: list };
  }), [editions, sortKey, sortDir]);

  const maxRows = Math.max(0, ...cols.map((e) => e.players.length));
  /** Voltas completas de quem terminou (para marcar quem não acabou). */
  const maxFull = useMemo(
    () => new Map(cols.map((e) => [e.id, Math.max(0, ...e.players.map((p) => p.fullRounds))])),
    [cols],
  );
  if (!cols.length || !maxRows) return <EmptyState size="md" message="Sem edições anteriores com resultados." />;

  // Separador entre edições — a mesma linha fina das colunas do scorecard.
  const bl = (_i: number) => "1px solid var(--border)";

  return (
    <div>
      {title && (
        <div className="fs-12 muted u-m-2px-0-10px">
          {title} · {cols.length} edi{cols.length === 1 ? "ção" : "ções"}
        </div>
      )}
      <div className="u-ox-auto">
        {/* Mesmo aspecto do scorecard (.sc-lb): cabeçalho, letra, espaçamento e
            linhas finas — pedido da Mariana (13/10/2026: «tudo homogéneo»). */}
        <table className="sc-lb sc-lb-dense u-fvn-tabular-nums u-w-max-content">
          <thead>
            <tr>
              <th rowSpan={2} onClick={() => onSort("pos")}
                  className="u-p-6px-8px u-fs-fs-11 u-pos-sticky u-left-0 u-z-z-raised u-cur-pointer u-user-select-none u-w-50px u-minw-50px">
                Pos{arrow("pos")}
              </th>
              {cols.map((e, ei) => (
                <th key={e.id} colSpan={2 + (e.parPerRound ? 1 : 0) + e.nRounds}
                    style={{ padding: "10px 10px 8px", fontSize: "var(--fs-11)", borderLeft: bl(ei) }}>
                  <div className="u-d-flex u-fd-column u-ai-center u-gap-3px">
                    <div className="u-d-flex u-ai-baseline u-gap-8px u-c-text">
                      <span className="u-fs-fs-16 u-fw-700">{e.year}</span>
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noreferrer" title="Leaderboard oficial"
                           className="u-fs-fs-11 u-c-color-info u-td-none u-fw-700">↗</a>
                      )}
                      <span className="u-fs-fs-10 u-c-text-3 u-fw-500">(n={e.players.length})</span>
                    </div>
                    {/* Rótulo da edição (ex: "3º DT Norte") — só quando há várias
                        edições no mesmo ano, para as distinguir. */}
                    {e.label && cols.some((o) => o !== e && o.year === e.year) && (
                      <div className="fs-11 u-c-text-2 u-fw-700">{e.label}</div>
                    )}
                    {/* Escalão só quando o nome mudou entre edições (ex: Under 15 → Under 14 Girls) */}
                    {cols.some((o) => o.division !== e.division) && (
                      <div className="fs-10 u-c-text-3 u-fw-600">{e.division}</div>
                    )}
                    {e.course && (
                      // Nome do campo nunca alarga a coluna (USKids World: 11 campos numa
                      // string) — corta com reticências, o nome todo no tooltip.
                      <div title={e.course} className="u-fs-fs-12 u-c-text-3 u-fw-500 u-lh-1_2 u-fst-italic u-maxw-280px u-ov-hidden u-tov-ellipsis u-ws-nowrap">{e.course}</div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              {cols.flatMap((e, ei) => {
                const cells = [
                  <th key={`${e.id}_n`} style={{ textAlign: "left", borderLeft: bl(ei), width: 150, minWidth: 150 }}>Jogador</th>,
                  <th key={`${e.id}_T`} onClick={() => onSort(`${e.id}_T`)}
                      className="u-cur-pointer u-user-select-none u-w-46px u-minw-46px">
                    Tot{arrow(`${e.id}_T`)}
                  </th>,
                ];
                if (e.parPerRound) cells.push(
                  <th key={`${e.id}_TP`} onClick={() => onSort(`${e.id}_TP`)}
                      className="u-cur-pointer u-user-select-none u-w-42px u-minw-42px">
                    ±{arrow(`${e.id}_TP`)}
                  </th>,
                );
                for (let r = 1; r <= e.nRounds; r++) cells.push(
                  <th key={`${e.id}_R${r}`} onClick={() => onSort(`${e.id}_R${r}`)}
                      className="u-cur-pointer u-user-select-none u-w-38px u-minw-38px">
                    R{r}{arrow(`${e.id}_R${r}`)}
                  </th>,
                );
                return cells;
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, ri) => {
              // Pódio como no scorecard: medalha na coluna da posição, sem fundo de cor.
              const medal = ri === 0 ? "🥇" : ri === 1 ? "🥈" : ri === 2 ? "🥉" : null;
              return (
                <tr key={ri}>
                  <td className="lb-pos u-pos-sticky u-left-0 u-bg-bg-card u-z-z-base u-ws-nowrap">
                    {medal ?? ri + 1}
                  </td>
                  {cols.flatMap((e, ei) => {
                    const p = e.players[ri];
                    const cells = [
                      // Destaque com as classes GLOBAIS do projecto (versão por
                      // célula) — cada coluna é um torneio diferente, por isso
                      // não dá para usar .row-manuel/.row-portuguese na linha.
                      <td key={`${e.id}_n`}
                          className={[p?.isManuel ? "cell-manuel fw-700" : p?.isPt ? "cell-portuguese" : ""].filter(Boolean).join(" ") || undefined}
                          style={{ textAlign: "left", borderLeft: bl(ei), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}
                          title={p ? `${p.name}${p.club ? ` · ${p.club}` : ""}${p.pos ? ` · ${p.pos}º oficial` : ""}` : undefined}>
                        {p ? <>{clubFlagPrefix(p.club) }{p.name}</> : <span className="c-muted">–</span>}
                      </td>,
                      // Total de quem NÃO completou (WD/DNF ou volta a decorrer)
                      // fica esbatido — 2 voltas somam menos que 3 e um total
                      // baixo aí não é um bom resultado.
                      <td key={`${e.id}_T`}
                          title={p && p.fullRounds < (maxFull.get(e.id) ?? 0) ? "Não completou o torneio" : undefined}
                          style={{ fontWeight: 700,
                                   fontStyle: p && p.fullRounds < (maxFull.get(e.id) ?? 0) ? "italic" : undefined,
                                   color: p?.total == null || (p && p.fullRounds < (maxFull.get(e.id) ?? 0)) ? "var(--text-3)" : "var(--text)" }}>
                        {p?.total ?? "–"}
                      </td>,
                    ];
                    if (e.parPerRound) cells.push(
                      <td key={`${e.id}_TP`} style={{ fontWeight: 600, color: p?.toPar != null ? (tpColorDark(p.toPar) ?? "var(--text-3)") : "var(--text-3)" }}>
                        {p?.toPar != null ? fmtToPar(p.toPar) : "–"}
                      </td>,
                    );
                    for (let r = 0; r < e.nRounds; r++) {
                      const v = p?.rounds[r] ?? null;
                      cells.push(
                        <td key={`${e.id}_R${r + 1}`} style={{ color: v ? "var(--text)" : "var(--text-3)" }}>
                          {v || "–"}
                        </td>,
                      );
                    }
                    return cells;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
