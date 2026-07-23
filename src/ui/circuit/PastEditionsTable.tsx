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

/** Só a bandeira do rótulo de clube ("🇿🇼 Zimbabwe" → "🇿🇼 "), para a coluna
 *  do nome não estourar. Rótulos sem emoji não mostram nada. */
function flagOf(club?: string | null): string {
  const first = (club || "").trim().split(/\s+/)[0] || "";
  return /^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}]/u.test(first) ? first + " " : "";
}

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

  const bl = (i: number) => (i === 0 ? "1px solid var(--border)" : "2px solid var(--border)");

  return (
    <div>
      {title && (
        <div className="fs-12 muted" style={{ margin: "2px 0 10px" }}>
          {title} · {cols.length} edi{cols.length === 1 ? "ção" : "ções"}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="bc-collapse" style={{ fontSize: "var(--fs-11)", fontVariantNumeric: "tabular-nums", width: "max-content" }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
              <th rowSpan={2} onClick={() => onSort("pos")}
                  style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, position: "sticky", left: 0, background: "var(--bg-muted)", zIndex: "var(--z-raised)", cursor: "pointer", userSelect: "none", width: 50, minWidth: 50 }}>
                Pos{arrow("pos")}
              </th>
              {cols.map((e, ei) => (
                <th key={e.id} colSpan={2 + (e.parPerRound ? 1 : 0) + e.nRounds}
                    style={{ padding: "10px 10px 8px", textAlign: "center", fontWeight: 700, borderLeft: bl(ei) }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, color: "var(--text)" }}>
                      <span style={{ fontSize: "var(--fs-16)", fontWeight: 700 }}>{e.year}</span>
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noreferrer" title="Leaderboard oficial"
                           style={{ fontSize: "var(--fs-11)", color: "var(--color-info)", textDecoration: "none", fontWeight: 700 }}>↗</a>
                      )}
                      <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 500 }}>(n={e.players.length})</span>
                    </div>
                    {/* Rótulo da edição (ex: "3º DT Norte") — só quando há várias
                        edições no mesmo ano, para as distinguir. */}
                    {e.label && cols.some((o) => o !== e && o.year === e.year) && (
                      <div className="fs-11" style={{ color: "var(--text-2)", fontWeight: 700 }}>{e.label}</div>
                    )}
                    {/* Escalão só quando o nome mudou entre edições (ex: Under 15 → Under 14 Girls) */}
                    {cols.some((o) => o.division !== e.division) && (
                      <div className="fs-10" style={{ color: "var(--text-3)", fontWeight: 600 }}>{e.division}</div>
                    )}
                    {e.course && (
                      <div style={{ fontSize: "var(--fs-12)", color: "var(--text-2)", fontWeight: 500, lineHeight: 1.2, fontStyle: "italic" }}>{e.course}</div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            <tr style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
              {cols.flatMap((e, ei) => {
                const cells = [
                  <th key={`${e.id}_n`} style={{ padding: "3px 6px", textAlign: "left", fontWeight: 600, fontSize: "var(--fs-10)", borderLeft: bl(ei), width: 150, minWidth: 150 }}>Nome</th>,
                  <th key={`${e.id}_T`} onClick={() => onSort(`${e.id}_T`)}
                      style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700, fontSize: "var(--fs-10)", background: "var(--bg-card, var(--bg))", cursor: "pointer", userSelect: "none", width: 46, minWidth: 46 }}>
                    T{arrow(`${e.id}_T`)}
                  </th>,
                ];
                if (e.parPerRound) cells.push(
                  <th key={`${e.id}_TP`} onClick={() => onSort(`${e.id}_TP`)}
                      style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: "var(--fs-10)", cursor: "pointer", userSelect: "none", width: 42, minWidth: 42 }}>
                    ±{arrow(`${e.id}_TP`)}
                  </th>,
                );
                for (let r = 1; r <= e.nRounds; r++) cells.push(
                  <th key={`${e.id}_R${r}`} onClick={() => onSort(`${e.id}_R${r}`)}
                      style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: "var(--fs-10)", cursor: "pointer", userSelect: "none", width: 38, minWidth: 38 }}>
                    R{r}{arrow(`${e.id}_R${r}`)}
                  </th>,
                );
                return cells;
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, ri) => {
              const medal = ri === 0 ? "var(--medal-gold-bg, #fde68a)" : ri === 1 ? "var(--medal-silver-bg, #e5e7eb)" : ri === 2 ? "var(--medal-bronze-bg, #f5d0a9)" : null;
              return (
                <tr key={ri} style={{ borderBottom: "1px solid var(--border-subtle, var(--border))" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 700, textAlign: "center", position: "sticky", left: 0, background: medal || "var(--bg)", zIndex: "var(--z-base)", whiteSpace: "nowrap" }}>
                    {ri + 1}
                  </td>
                  {cols.flatMap((e, ei) => {
                    const p = e.players[ri];
                    const cells = [
                      // Destaque com as classes GLOBAIS do projecto (versão por
                      // célula) — cada coluna é um torneio diferente, por isso
                      // não dá para usar .row-manuel/.row-portuguese na linha.
                      <td key={`${e.id}_n`}
                          className={[p?.isManuel ? "cell-manuel fw-700" : p?.isPt ? "cell-portuguese" : ""].filter(Boolean).join(" ") || undefined}
                          style={{ padding: "4px 6px", borderLeft: bl(ei), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}
                          title={p ? `${p.name}${p.club ? ` · ${p.club}` : ""}${p.pos ? ` · ${p.pos}º oficial` : ""}` : undefined}>
                        {p ? <>{flagOf(p.club) }{p.name}</> : <span className="c-muted">–</span>}
                      </td>,
                      // Total de quem NÃO completou (WD/DNF ou volta a decorrer)
                      // fica esbatido — 2 voltas somam menos que 3 e um total
                      // baixo aí não é um bom resultado.
                      <td key={`${e.id}_T`}
                          title={p && p.fullRounds < (maxFull.get(e.id) ?? 0) ? "Não completou o torneio" : undefined}
                          style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, background: "var(--bg-card, var(--bg))",
                                   fontStyle: p && p.fullRounds < (maxFull.get(e.id) ?? 0) ? "italic" : undefined,
                                   color: p?.total == null || (p && p.fullRounds < (maxFull.get(e.id) ?? 0)) ? "var(--text-3)" : "var(--text)" }}>
                        {p?.total ?? "–"}
                      </td>,
                    ];
                    if (e.parPerRound) cells.push(
                      <td key={`${e.id}_TP`} style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: p?.toPar != null ? (tpColorDark(p.toPar) ?? "var(--text-3)") : "var(--text-3)" }}>
                        {p?.toPar != null ? fmtToPar(p.toPar) : "–"}
                      </td>,
                    );
                    for (let r = 0; r < e.nRounds; r++) {
                      const v = p?.rounds[r] ?? null;
                      cells.push(
                        <td key={`${e.id}_R${r + 1}`} style={{ padding: "4px 6px", textAlign: "center", color: v ? "var(--text)" : "var(--text-3)" }}>
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
