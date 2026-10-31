/**
 * MatchplayView — vista partilhada de MATCH PLAY (brackets) para o CircuitShell.
 *
 * Consome o schema `MatchplayFile` (matchplayTypes.ts) gerado por
 * `scripts/scrape-golfbox-matchplay.js` (European Team Championships no
 * GolfBox: rondas Quarter/Semi/Final, confrontos de equipas com pontos, e os
 * jogos individuais foursome/single com nomes + resultado + hole-by-hole).
 *
 * Linguagem da casa: secção por ronda (título uppercase estilo Regional),
 * tabela de confrontos `player-list-table` ORDENÁVEL, equipas PT em
 * `.row-portuguese`, e expansão em linha (`row-expanded` + colSpan — o mesmo
 * padrão da RecentTournamentsPage/CoursePlayersSection) com a tabela de jogos
 * num cartão com header band (o idioma dos scorecards de match play da FPG).
 *
 * Opcional, pelos dados ou por props (usado no 3-way match play dos Clubes da
 * FPG — adaptador em src/data/clubesMatchplayAdapter.ts):
 *   - confrontos a N lados (`MatchplayTeamMatch.sides`): uma coluna por lado,
 *     com os pontos; os jogos são os duelos de cada par de lados;
 *   - jogadores com identidade (`playerRefs`): link para /jogadores/:fed e
 *     gross (±par) ao lado do nome;
 *   - `pendingNote` no ficheiro: aviso dos confrontos sem resultado;
 *   - `label` por confronto (coluna «Disputa», ex. «1 - 2 Puesto») e
 *     `standings` (classificação final) — campeonatos por equipas do
 *     mitarjeta, `scripts/scrape-lgs-matchplay.js` (/rfeg);
 *   - prop `roundPicker`: selector das rondas (ex.: Dia 1 / Dia 2 / Total).
 */
import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import ResultMark from "../ResultMark";
import { KidsLink } from "../KidsLink";
import { flag } from "../../utils/flagUtils";
import {
  type MatchplayFile, type MatchplayFlight, type MatchplayRound,
  type MatchplayTeamMatch, type MatchplayGame, type MatchplayGameSide,
  type MatchplaySide, type MatchplayPlayerRef, sideIsPt,
} from "./matchplayTypes";
import { fmtPoints } from "./teamPointsTypes";
import { fmtToPar } from "../../utils/format";
import { isManuel } from "../../constants/manuel";

/** Nome de um jogador: com federado liga à ficha /jogadores/:fed; ↗ kids2 se
 *  existir no roster; gross (±par) ao lado quando a fonte o dá. */
function PlayerName({ name, info: r }: { name: string; info?: MatchplayPlayerRef }) {
  const fed = r?.fed ?? null;
  return (
    <>
      {fed ? <a href={`/jogadores/${fed}`} className="mp-player-link">{name}</a> : name}
      <KidsLink nome={name} fed={fed} />
      {r?.gross != null && (
        <span className="mp-gross">{r.gross}{r.toPar != null ? ` (${fmtToPar(r.toPar)})` : ""}</span>
      )}
    </>
  );
}

/** Nomes de um lado (foursomes têm 2 — cada um com a sua seta). */
function SideNames({ players, refs }: { players: string[] | undefined; refs?: MatchplayPlayerRef[] }) {
  if (!players?.length) return <>—</>;
  return (
    <>
      {players.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <PlayerName name={p} info={refs?.[i]} />
        </Fragment>
      ))}
    </>
  );
}

const fmtFormat = (f: string | null): string =>
  f ? f.charAt(0).toUpperCase() + f.slice(1) : "—";

/** Bandeira de um lado (iso "PT" → 🇵🇹; fallback nome do país). Sem dados não
 *  há bandeira nenhuma — o 🏳️ branco do fallback só sujava (caso FFG, em que
 *  o GolfGenius não publica país). */
const sideFlag = (iso: string | null, country: string | null): string =>
  iso || country ? flag(iso || country || "") : "";

/** Um jogo tem hole-by-hole? (estados "A/S"/"1UP"/"2DN" nos buracos jogados) */
const hasHoles = (g: MatchplayGame): boolean => (g.holes ?? []).some(h => !!h.status);

/** Alinha um jogo pelos lados do CONFRONTO: o GolfBox troca casa/fora de jogo
 *  para jogo — sem normalizar, a coluna "Casa" ora era a Finlândia ora Portugal
 *  e só olhando aos nomes se adivinhava o país. Devolve o lado da EQUIPA DA
 *  ESQUERDA do confronto como `left`; `flipped` indica que o jogo veio virado
 *  (e o UP/DN do buraco-a-buraco tem de ser invertido — os estados do GolfBox
 *  são na perspectiva da casa DO JOGO). */
function orientGame(g: MatchplayGame, matchHome: MatchplaySide | null): { left: MatchplayGameSide | null; right: MatchplayGameSide | null; flipped: boolean } {
  const gh = g.home, ga = g.away;
  if (!matchHome || !gh || !ga) return { left: gh, right: ga, flipped: false };
  const isMatchHome = (s: MatchplayGameSide) =>
    s.teamId != null && matchHome.teamId != null
      ? s.teamId === matchHome.teamId
      : (s.name ?? "") === (matchHome.name ?? "");
  if (isMatchHome(gh)) return { left: gh, right: ga, flipped: false };
  if (isMatchHome(ga)) return { left: ga, right: gh, flipped: true };
  return { left: gh, right: ga, flipped: false };
}

/** "2DN" ↔ "2UP" quando o jogo foi virado para alinhar com a equipa da esquerda. */
const flipStatus = (s: string): string =>
  /UP$/i.test(s) ? s.replace(/UP$/i, "DN") : /DN$/i.test(s) ? s.replace(/DN$/i, "UP") : s;

/** Faixa buraco-a-buraco de UM jogo — estado corrido por buraco (estilo do
 *  scorecard de match play da FPGPage: só o resultado, sem pancadas). Suporta
 *  playoff (buraco 19+); separador visual após o 9 e após o 18. Os lados vêm
 *  JÁ orientados pelo confronto (left = equipa da esquerda); `flipped` inverte
 *  o UP/DN dos estados do GolfBox. */
function GameHolesStrip({ g, flipped }: { g: MatchplayGame; flipped: boolean }) {
  const holes = (g.holes ?? []);
  const lastPlayed = holes.reduce((acc, h, i) => (h.status ? i : acc), -1);
  const cLbl: CSSProperties = { padding: "4px 10px", fontSize: "var(--fs-10)", color: "var(--text-3)", textAlign: "left", width: "1%", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.4px" };
  const cSc: CSSProperties = { padding: "4px 2px", textAlign: "center", fontSize: "var(--fs-10)", minWidth: 30, whiteSpace: "nowrap" };
  const sep = (i: number): CSSProperties => (i === 9 || i === 18 ? { borderLeft: "2px solid var(--sc-par-border)" } : {});
  const disp = (s: string | null): string => (s ? (flipped ? flipStatus(s) : s).replace("A/S", "AS") : "");
  return (
    // Sem header próprio: os nomes e o badge do resultado estão na linha do jogo
    // logo acima — repeti-los aqui era ruído (visto no ETC Boys 2026).
    <div className="u-bd-1px-solid-border u-br-radius u-ov-hidden u-bs-0-1px-3px-rgba-0-0-0-_06 u-m-2px-0-6pxx">
      <div className="u-ox-auto">
        {/* Grelha estilo scorecard da casa: banda verde nos buracos, banda PAR
            subtil, estados por baixo. 100% de largura — sem coluna filler morta. */}
        <table className="u-border-collapse-collapse u-w-100pc u-fs-fs-11">
          <thead>
            <tr className="u-bg-accent-light">
              <th style={cLbl}>Buraco</th>
              {holes.map((h, i) => <th key={i} style={{ ...cSc, ...sep(i), color: "var(--accent-text)", fontWeight: 700 }}>{h.hole}</th>)}
            </tr>
            {holes.some(h => h.par != null) && (
              <tr className="u-bg-sc-par-bg">
                <th style={{ ...cLbl, fontWeight: 400 }}>Par</th>
                {holes.map((h, i) => <td key={i} style={{ ...cSc, ...sep(i), color: "var(--text-2)" }}>{h.par ?? ""}</td>)}
              </tr>
            )}
          </thead>
          <tbody>
            <tr>
              <td style={cLbl}>Estado</td>
              {holes.map((h, i) => {
                const label = disp(h.status);
                // All square é o estado "nada a assinalar" — um ponto discreto.
                // Chips só quando alguém está à frente (UP/DN) e no buraco final
                // (aí o AS interessa: é um jogo halved / decidido no último).
                const isAS = label === "AS";
                const showChip = label && (!isAS || i === lastPlayed);
                const kind = /UP$/i.test(label) ? "mp-up" : /DN$/i.test(label) ? "mp-dn" : "mp-as";
                return (
                  <td key={i} style={{ ...cSc, ...sep(i), padding: "5px 2px" }}>
                    {showChip ? (
                      <span className={`mp-hole-chip ${kind}`} style={i === lastPlayed ? { fontWeight: 800, boxShadow: "inset 0 0 0 1px currentColor" } : undefined}>{label}</span>
                    ) : label ? (
                      <span className="u-c-text-4">·</span>
                    ) : ""}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "2026-07-09" → "09/07" (curto, o ano está no título do torneio). */
function fmtRoundDate(d: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "");
  return m ? `${m[3]}/${m[2]}` : d;
}

type GameSortKey = "order" | "format" | "result";

/** Tabela de jogos (foursomes/singles) de UM confronto — dentro da expansão.
 *  As colunas são as EQUIPAS do confronto (nome no cabeçalho), não o casa/fora
 *  cru do GolfBox — cada jogo é orientado via `orientGame`. */
function GamesTable({ games, home, away, multi = false }: { games: MatchplayGame[]; home: MatchplaySide | null; away: MatchplaySide | null; /** Confronto a N: cada jogo é um par de lados diferente — o lado vai em cada célula, não no cabeçalho. */ multi?: boolean }) {
  const { sortKey, sortDir, toggleSort } = useSort<GameSortKey>("order");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleGame = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (g: MatchplayGame): string | number => {
      switch (sortKey) {
        case "order": return g.order ?? g.matchNo ?? 999;
        case "format": return g.format ?? "";
        case "result": return g.result ?? "";
      }
    };
    return [...games].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [games, sortKey, sortDir]);

  const names = (s: MatchplayGameSide | null, side: "left" | "right") => {
    const ns = <SideNames players={s?.players} refs={s?.playerRefs} />;
    if (!multi) return ns;
    const pill = <span className="p p-sm p-muted">{s?.name ?? "?"}</span>;
    return side === "left" ? <>{ns} {pill}</> : <>{pill} {ns}</>;
  };

  return (
    <div className="u-bd-1px-solid-border u-br-radius u-ov-hidden u-bs-0-1px-3px-rgba-0-0-0-_06">
      <table className="player-list-table u-fs-fs-12 u-w-100pc">
        <thead>
          <tr>
            <SortableHdr k="order" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">#</SortableHdr>
            <SortableHdr k="format" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Formato</SortableHdr>
            <th className="u-ta-right u-w-32pc">{multi ? "" : <>{sideFlag(home?.iso ?? null, home?.country ?? null)} {home?.name ?? "Casa"}</>}</th>
            <SortableHdr k="result" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Resultado</SortableHdr>
            <th className="u-w-32pc">{multi ? "" : <>{sideFlag(away?.iso ?? null, away?.country ?? null)} {away?.name ?? "Fora"}</>}</th>
            <th className="tight" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((g, i) => {
            const id = g.matchNo ?? g.order ?? i;
            const expandable = hasHoles(g);
            const isOpen = expanded.has(id);
            const { left, right, flipped } = multi ? { left: g.home, right: g.away, flipped: false } : orientGame(g, home);
            const settled = !!left?.won || !!right?.won;
            return (
              <Fragment key={id}>
                <tr
                  className="player-list-row"
                  style={{ cursor: expandable ? "pointer" : "default" }}
                  onClick={() => expandable && toggleGame(id)}
                  title={expandable ? "Clicar para ver o buraco-a-buraco" : undefined}
                >
                  <td className="num u-c-text-muted">{g.order ?? g.matchNo ?? i + 1}</td>
                  {/* isFinal do GolfBox = jogo TERMINADO (true em todos após o evento) — não rotular */}
                  <td className="tight"><span className="p p-sm p-muted">{fmtFormat(g.format)}</span></td>
                  {/* Sem 🏆/✗/½ aqui: o badge com seta + bold/esbatido já dizem quem venceu;
                      as marcas por cima disso eram ruído (½ dos dois lados, ✗ solto). */}
                  <td style={{ textAlign: "right", whiteSpace: "normal", fontWeight: left?.won ? 700 : 400, color: settled && !left?.won ? "var(--text-3)" : undefined }}>
                    {names(left, "left")}
                  </td>
                  <td className="u-ta-center u-ws-nowrap u-p-4px-14px">
                    {g.result ? (
                      <span className={`mp-res${left?.won ? " mp-arr-l" : right?.won ? " mp-arr-r" : ""}`}>{g.result}</span>
                    ) : (
                      <span className="u-c-text-muted">—</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "normal", fontWeight: right?.won ? 700 : 400, color: settled && !right?.won ? "var(--text-3)" : undefined }}>
                    {names(right, "right")}
                  </td>
                  <td className="tight u-c-text-muted u-ws-nowrap">
                    {expandable ? `${g.playedHoles ?? ""}${g.playedHoles ? "b " : ""}${isOpen ? "▴" : "▾"}` : ""}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="row-expanded">
                    <td colSpan={6} className="u-bg-bg-card u-p-4px-8px-6px">
                      <GameHolesStrip g={g} flipped={flipped} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type MatchSortKey = "no" | "home" | "res" | "away" | "label" | "time";

/** Tabela de confrontos de UMA ronda (Quarter/Semi/Final). */
function RoundTable({ round }: { round: MatchplayRound }) {
  const { sortKey, sortDir, toggleSort } = useSort<MatchSortKey>("no");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (m: MatchplayTeamMatch): string | number => {
      switch (sortKey) {
        case "no": return m.matchNo ?? 999;
        case "home": return m.home?.name ?? "";
        case "res": return m.result ?? "";
        case "away": return m.away?.name ?? "";
        case "label": return m.label ?? "";
        case "time": return m.startTime ?? "";
      }
    };
    return [...round.matches].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [round.matches, sortKey, sortDir]);

  // Nomes encostados ao centro (estilo GolfBox/R&A): a Casa alinha à direita,
  // a Fora à esquerda, e o badge de resultado fica entre eles com a seta a
  // apontar ao vencedor. Vencedor a bold, vencido esbatido.
  // Ordem espelhada à volta do badge: Casa = "Nome ↗ 🏆" e Fora = "🏆 ↗ Nome".
  // Flex com slots de largura FIXA para o ↗ e a marca — inline, os símbolos
  // andavam com o comprimento do nome e nunca ficavam em coluna.
  // O ↗ kids2 só aparece se o jogador existir no roster (equipas ETC não batem).
  // `.mp-slot` (App.css) anula o margin próprio do <KidsLink>/<ResultMark> — o
  // espaçamento vem todo do slot + gap, igual dos dois lados do badge.
  const teamCell = (s: MatchplayTeamMatch["home"], won: boolean, settled: boolean, align: "right" | "left") => {
    const link = <span className="mp-slot u-w-18px">{s?.name ? <KidsLink nome={s.name} /> : null}</span>;
    // O 🏆 é bem mais largo que o ✗. Em vez de os encostar a um dos lados (o que
    // alinha um bordo e desalinha o outro), dá-se A MESMA largura à marca e
    // centra-se o glifo lá dentro: ambos os bordos ficam em coluna e a folga
    // para a seta é igual em todas as linhas.
    const mark = (
      <span className="mp-slot u-w-18px">
        {settled ? <ResultMark kind={won ? "win" : "loss"} gap={0} style={{ width: 18, textAlign: "center" }} /> : null}
      </span>
    );
    const fl = sideFlag(s?.iso ?? null, s?.country ?? null);
    const name = (
      // Sem bandeira não há espaço a separar nada — o espaço literal empurrava o
      // nome e desequilibrava a folga face à seta do lado Fora.
      <span style={{ fontWeight: won ? 700 : 400, color: !settled || won ? undefined : "var(--text-3)" }}>
        {fl ? `${fl} ` : ""}{s?.name ?? "?"}
        {s?.seed ? <span className="u-fw-400 u-c-text-muted"> ({s.seed})</span> : null}
      </span>
    );
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {align === "left" ? <>{mark}{link}{name}</> : <>{name}{link}{mark}</>}
      </span>
    );
  };

  // «Disputa» (mitarjeta: «1 - 2 Puesto») só quando a fonte a dá; a Hora só
  // quando há horas — sem nenhuma das duas a tabela fica como era.
  const hasLabel = round.matches.some(m => m.label);
  const hasTime = !hasLabel || round.matches.some(m => m.startTime);
  const nCols = 5 + (hasLabel ? 1 : 0) + (hasTime ? 1 : 0);   // # Casa Resultado Fora Jogos (+ Disputa, Hora)

  return (
    <div className="u-ox-auto">
      <table className="player-list-table u-fs-fs-12 u-w-100pc">
        <thead>
          <tr>
            <SortableHdr k="no" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">#</SortableHdr>
            <SortableHdr k="home" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right", width: "34%" }}>Casa</SortableHdr>
            <SortableHdr k="res" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Resultado</SortableHdr>
            <SortableHdr k="away" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: "34%" }}>Fora</SortableHdr>
            {hasLabel && <SortableHdr k="label" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Disputa</SortableHdr>}
            {hasTime && <SortableHdr k="time" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Hora</SortableHdr>}
            <th className="tight">Jogos</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            const id = m.teamMatchId ?? i;
            const isPt = sideIsPt(m.home) || sideIsPt(m.away);
            const isExpanded = expanded.has(id);
            const settled = m.winner != null;
            return (
              <Fragment key={id}>
                <tr
                  className={`player-list-row${isPt ? " row-portuguese" : ""}`}
                  style={{ cursor: m.games.length ? "pointer" : "default" }}
                  onClick={() => m.games.length && toggle(id)}
                  title={m.games.length ? "Clicar para ver os jogos (foursomes/singles)" : undefined}
                >
                  <td className="num u-c-text-muted">{m.matchNo ?? i + 1}</td>
                  <td className="u-ta-right">{teamCell(m.home, m.winner === "home", settled, "right")}</td>
                  <td className="u-ta-center u-ws-nowrap u-p-4px-10px">
                    {m.result || settled ? (
                      <span className={`mp-res${m.winner === "home" ? " mp-arr-l" : m.winner === "away" ? " mp-arr-r" : ""}`}>
                        {m.result || "✓"}
                      </span>
                    ) : m.isStarted ? (
                      <span className="mp-res mp-res-open">em curso</span>
                    ) : (
                      <span className="u-c-text-muted">—</span>
                    )}
                  </td>
                  <td>{teamCell(m.away, m.winner === "away", settled, "left")}</td>
                  {hasLabel && <td className="tight u-c-text-muted u-ws-nowrap">{m.label ?? "—"}</td>}
                  {hasTime && <td className="tight u-c-text-muted">{m.startTime ?? "—"}</td>}
                  <td className="tight u-c-text-muted">
                    {m.games.length ? `${m.games.length} ${isExpanded ? "▴" : "▾"}` : "—"}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="row-expanded">
                    <td colSpan={nCols} className="u-bg-bg-card u-p-8px-12px-12px">
                      <GamesTable games={m.games} home={m.home} away={m.away} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Chave de um lado num confronto a N (a mesma equipa em todas as linhas). */
const sideKey = (s: MatchplaySide): string => (s.teamId != null ? `t${s.teamId}` : `n${s.name ?? ""}`);

/** O confronto tem o Manuel? (destaque da linha, como nas outras tabelas). */
const matchHasManuel = (m: MatchplayTeamMatch): boolean =>
  (m.sides ?? []).some(s => (s.playerRefs ?? []).some(r => isManuel({ fed: r.fed ?? undefined, name: r.name })));

/** Tabela de confrontos de UMA ronda com N lados por confronto (3-way): uma
 *  coluna por lado (equipa), com os jogadores e os pontos; ordenável por
 *  qualquer coluna. Expandir mostra os duelos de cada par de lados. */
function MultiWayRoundTable({ round }: { round: MatchplayRound }) {
  const cols = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of round.matches) for (const s of m.sides ?? []) {
      const k = sideKey(s);
      if (!seen.has(k)) seen.set(k, s.name ?? "?");
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [round.matches]);
  const { sortKey, sortDir, toggleSort } = useSort<string>("no");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (m: MatchplayTeamMatch): string | number => {
      if (sortKey === "no") return m.matchNo ?? 999;
      if (sortKey === "time") return m.startTime ?? "";
      const s = (m.sides ?? []).find(x => sideKey(x) === sortKey);
      return s?.points ?? -1;
    };
    return [...round.matches].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [round.matches, sortKey, sortDir]);

  return (
    <div className="u-ox-auto">
      <table className="player-list-table u-fs-fs-12 u-w-100pc">
        <thead>
          <tr>
            <SortableHdr k="no" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">#</SortableHdr>
            {cols.map(c => (
              <SortableHdr key={c.key} k={c.key} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Ordenar pelos pontos deste lado">{c.label}</SortableHdr>
            ))}
            <SortableHdr k="time" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Hora</SortableHdr>
            <th className="tight">Jogos</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            const id = m.teamMatchId ?? i;
            const isOpen = expanded.has(id);
            return (
              <Fragment key={id}>
                <tr
                  className={`player-list-row${matchHasManuel(m) ? " row-manuel" : ""}`}
                  style={{ cursor: m.games.length ? "pointer" : "default" }}
                  onClick={() => m.games.length && toggle(id)}
                  title={m.games.length ? "Clicar para ver os duelos de cada par" : undefined}
                >
                  <td className="num c-muted">{m.matchNo ?? i + 1}</td>
                  {cols.map(c => {
                    const s = (m.sides ?? []).find(x => sideKey(x) === c.key);
                    if (!s) return <td key={c.key} className="c-muted">—</td>;
                    const cls = !m.isSettled ? "" : s.isLead ? "fw-700" : "c-muted";
                    return (
                      <td key={c.key} className="u-ws-normal">
                        <span className="mp-nway-cell">
                          <span className={cls}>
                            <SideNames players={(s.playerRefs ?? []).map(r => r.name)} refs={s.playerRefs} />
                          </span>
                          <span className={`mp-pts${m.isSettled && s.isLead ? " mp-pts-lead" : ""}`}
                            title={m.isSettled ? "Pontos neste confronto" : "Sem resultado publicado"}>
                            {m.isSettled ? fmtPoints(s.points) : "—"}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="tight c-muted">{m.startTime ?? "—"}</td>
                  <td className="tight c-muted">{m.games.length ? `${m.games.length} ${isOpen ? "▴" : "▾"}` : "—"}</td>
                </tr>
                {isOpen && (
                  <tr className="row-expanded">
                    <td colSpan={cols.length + 3} className="u-bg-bg-card u-p-8px-12px-12px">
                      <GamesTable games={m.games} home={null} away={null} multi />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Classificação final por equipas (quando a fonte a publica — mitarjeta). */
function StandingsTable({ rows }: { rows: { pos: number; name: string }[] }) {
  const { sortKey, sortDir, toggleSort } = useSort<"pos" | "name">("pos");
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => (sortKey === "pos" ? a.pos - b.pos : a.name.localeCompare(b.name, "pt")) * dir);
  }, [rows, sortKey, sortDir]);
  return (
    <div className="u-mb-20px">
      <div className="fw-700 u-mb-4px">Classificação final</div>
      <table className="player-list-table u-fs-fs-12 u-w-auto u-minw-260px">
        <thead>
          <tr>
            <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">#</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Equipa</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={`${r.pos}-${r.name}`} className={`player-list-row${sideIsPt({ teamId: null, name: r.name, iso: null, country: null, points: null, isLead: false }) ? " row-portuguese" : ""}`}>
              <td className="num">{r.pos}</td>
              <td style={{ fontWeight: r.pos <= 3 ? 700 : 400 }}>{r.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlightSection({ fl, showTitle, roundFilter }: { fl: MatchplayFlight; showTitle: boolean; /** Só esta ronda (null = todas). */ roundFilter: number | null }) {
  const rounds = useMemo(
    () => [...fl.rounds].filter(r => roundFilter == null || r.number === roundFilter).sort((a, b) => a.number - b.number),
    [fl.rounds, roundFilter],
  );
  if (!rounds.length) return null;
  return (
    <div className="u-mb-20px">
      {showTitle && (
        <div className="fw-700 u-mb-4px">
          {fl.name}
          {fl.format && <span className="p p-sm p-muted u-ml-6px">{fl.format}</span>}
          {!fl.isCompleted && <span className="p p-sm u-ml-6px">em curso</span>}
        </div>
      )}
      {rounds.map(r => (
        <div key={r.number} className="u-mb-12px">
          <div className="u-fs-fs-12 u-fw-700 u-c-text-2 u-m-12px-0-6px u-tt-uppercase u-ls-0_4px">
            {r.name || `Ronda ${r.number}`}
            {r.date && <span className="u-fw-400 u-c-text-muted"> · {fmtRoundDate(r.date)}</span>}
          </div>
          {!r.matches.length ? <div className="muted">Sem confrontos.</div>
            : r.matches.some(m => m.sides) ? <MultiWayRoundTable round={r} />
            : <RoundTable round={r} />}
        </div>
      ))}
    </div>
  );
}

export default function MatchplayView({ data, roundPicker = false }: {
  data: MatchplayFile;
  /** Selector das rondas (ex.: Dia 1 / Dia 2 / Total) em vez de as mostrar todas empilhadas. */
  roundPicker?: boolean;
}) {
  const roundOpts = useMemo(() => {
    const m = new Map<number, string>();
    for (const fl of data.flights) for (const r of fl.rounds) if (!m.has(r.number)) m.set(r.number, r.name || `Ronda ${r.number}`);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, label]) => ({ n, label }));
  }, [data]);
  const showPicker = roundPicker && roundOpts.length > 1;
  const [selRound, setSelRound] = useState<number | null>(roundOpts[0]?.n ?? null);
  const roundFilter = showPicker ? selRound : null;
  if (!data.flights.length) return <div className="muted">Sem brackets de match play.</div>;
  const multiFlight = data.flights.length > 1;
  const visRounds = data.flights.flatMap(fl => fl.rounds.filter(r => roundFilter == null || r.number === roundFilter));
  const pendentes = data.pendingNote ? visRounds.reduce((s, r) => s + r.matches.filter(m => !m.isSettled).length, 0) : 0;
  const anyGames = visRounds.some(r => r.matches.some(m => m.games.length));
  const nway = visRounds.some(r => r.matches.some(m => m.sides));
  return (
    // Largura contida: um confronto são 2 nomes + um badge — esticar isto pela
    // página toda afastava os nomes do resultado e perdia-se a leitura.
    <div className="u-maxw-880px">
      {showPicker && (
        <div className="mp-round-picker">
          <div className="segmented-toggle" role="tablist" aria-label="Ronda">
            {roundOpts.map(o => (
              <button key={o.n} role="tab" aria-selected={selRound === o.n}
                className={`seg-btn${selRound === o.n ? " active" : ""}`} onClick={() => setSelRound(o.n)}>
                <span className="seg-label">{o.label}</span>
              </button>
            ))}
            <button role="tab" aria-selected={selRound == null}
              className={`seg-btn${selRound == null ? " active" : ""}`} onClick={() => setSelRound(null)} title="Todas as rondas">
              <span className="seg-label">Total</span>
            </button>
          </div>
        </div>
      )}
      {pendentes > 0 && (
        <div className="notice notice-warn">
          ⚠ <strong>{pendentes}</strong> {pendentes === 1 ? "confronto sem resultado publicado" : "confrontos sem resultado publicado"} — {data.pendingNote}
        </div>
      )}
      {data.standings?.length ? <StandingsTable rows={data.standings} /> : null}
      {/* Chave com o nome: no mitarjeta os flights partilham o id do torneio. */}
      {data.flights.map(fl => <FlightSection key={`${fl.competitionId}-${fl.name}`} fl={fl} roundFilter={roundFilter} showTitle={multiFlight || !!(fl.format && fl.format !== "KnockOut")} />)}
      {/* Só faz sentido com confrontos de equipas (quadros individuais não têm jogos). */}
      {anyGames && <div className="u-fs-fs-11 u-c-text-muted">
        {nway
          ? <>Clica num confronto para ver os duelos de cada par de lados, e num duelo com cartão para o buraco-a-buraco</>
          : <>Clica num confronto para ver os jogos (foursomes e singles), e num jogo para o buraco-a-buraco</>}
        {" "}· estado corrido na perspectiva {nway ? "do jogador" : "da equipa"} da coluna ESQUERDA
        (<span className="u-c-accent u-fw-700">UP</span> à frente,{" "}
        <span className="u-c-medal-bronze u-fw-700">DN</span> atrás).
      </div>}
    </div>
  );
}
