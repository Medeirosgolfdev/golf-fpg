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
 */
import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import ResultMark from "../ResultMark";
import { flag } from "../../utils/flagUtils";
import {
  type MatchplayFile, type MatchplayFlight, type MatchplayRound,
  type MatchplayTeamMatch, type MatchplayGame, type MatchplayGameSide,
  type MatchplaySide, sideIsPt,
} from "./matchplayTypes";

const fmtFormat = (f: string | null): string =>
  f ? f.charAt(0).toUpperCase() + f.slice(1) : "—";

/** Bandeira de um lado (iso "PT" → 🇵🇹; fallback nome do país). */
const sideFlag = (iso: string | null, country: string | null): string =>
  flag(iso || country || "") || "";

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

/** 🏆 no vencedor, ✗ vermelho no vencido, ½ nos jogos empatados (resultado
 *  publicado sem vencedor de nenhum dos lados) — via <ResultMark> partilhado. */
function gameMark(side: MatchplayGameSide | null, other: MatchplayGameSide | null, hasResult: boolean) {
  if (side?.won) return <ResultMark kind="win" />;
  if (other?.won) return <ResultMark kind="loss" />;
  if (hasResult && side && other) return <ResultMark kind="half" />;
  return null;
}

/** Cor do estado corrido: casa à frente → accent, fora à frente → bronze
 *  (a mesma convenção do scorecard de match play do Regional na FPGPage). */
function statusColor(s: string | null): string {
  if (!s) return "var(--text-3)";
  if (/UP$/i.test(s)) return "var(--accent)";
  if (/DN$/i.test(s)) return "var(--medal-bronze)";
  return "var(--text-3)"; // A/S
}

/** Faixa buraco-a-buraco de UM jogo — estado corrido por buraco (estilo do
 *  scorecard de match play da FPGPage: só o resultado, sem pancadas). Suporta
 *  playoff (buraco 19+); separador visual após o 9 e após o 18. Os lados vêm
 *  JÁ orientados pelo confronto (left = equipa da esquerda); `flipped` inverte
 *  o UP/DN dos estados do GolfBox. */
function GameHolesStrip({ g, left, right, flipped }: { g: MatchplayGame; left: MatchplayGameSide | null; right: MatchplayGameSide | null; flipped: boolean }) {
  const holes = (g.holes ?? []);
  const lastPlayed = holes.reduce((acc, h, i) => (h.status ? i : acc), -1);
  // Coluna dos rótulos encolhida ao conteúdo (width 1%); a folga da largura da
  // tabela vai toda para a célula filler no fim, não para os rótulos.
  const cLbl: CSSProperties = { padding: "3px 8px", fontSize: "var(--fs-10)", color: "var(--text-3)", textAlign: "left", width: "1%", whiteSpace: "nowrap" };
  const cSc: CSSProperties = { padding: "3px 2px", textAlign: "center", fontSize: "var(--fs-9)", width: 30, minWidth: 30, whiteSpace: "nowrap" };
  const sep = (i: number): CSSProperties => (i === 9 || i === 18 ? { borderLeft: "2px solid var(--border)" } : {});
  const names = (ps: string[] | undefined): string => (ps && ps.length ? ps.join(" · ") : "—");
  const disp = (s: string | null): string => (s ? (flipped ? flipStatus(s) : s).replace("A/S", "AS") : "");
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)", margin: "2px 0 6px" }}>
      <div style={{ padding: "5px 8px 2px", fontSize: "var(--fs-10)" }}>
        <span style={{ color: "var(--accent)", fontWeight: 700 }}>{names(left?.players)}</span>
        <span style={{ color: "var(--text-3)", margin: "0 5px" }}>vs</span>
        <span style={{ color: "var(--medal-bronze)", fontWeight: 700 }}>{names(right?.players)}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: "var(--fs-11)" }}>
          <thead>
            <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
              <th style={cLbl}>Buraco</th>
              {holes.map((h, i) => <th key={i} style={{ ...cSc, ...sep(i), color: "var(--text-2)", fontWeight: 600 }}>{h.hole}</th>)}
              <th style={{ width: "auto" }} />
            </tr>
            {holes.some(h => h.par != null) && (
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...cLbl, fontWeight: 400 }}>Par</th>
                {holes.map((h, i) => <td key={i} style={{ ...cSc, ...sep(i), color: "var(--text-3)" }}>{h.par ?? ""}</td>)}
                <td />
              </tr>
            )}
          </thead>
          <tbody>
            <tr>
              <td style={cLbl}>Estado</td>
              {holes.map((h, i) => {
                const label = disp(h.status);
                return (
                  <td key={i} style={{ ...cSc, ...sep(i), color: statusColor(label || null), fontWeight: i === lastPlayed ? 700 : 500 }}>
                    {label}
                  </td>
                );
              })}
              <td />
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
function GamesTable({ games, home, away }: { games: MatchplayGame[]; home: MatchplaySide | null; away: MatchplaySide | null }) {
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

  const names = (ps: string[] | undefined): string => (ps && ps.length ? ps.join(" · ") : "—");

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
      <table className="player-list-table" style={{ fontSize: "var(--fs-12)" }}>
        <thead>
          <tr>
            <SortableHdr k="order" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">#</SortableHdr>
            <SortableHdr k="format" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Formato</SortableHdr>
            <th>{sideFlag(home?.iso ?? null, home?.country ?? null)} {home?.name ?? "Casa"}</th>
            <SortableHdr k="result" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Resultado</SortableHdr>
            <th>{sideFlag(away?.iso ?? null, away?.country ?? null)} {away?.name ?? "Fora"}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g, i) => {
            const id = g.matchNo ?? g.order ?? i;
            const expandable = hasHoles(g);
            const isOpen = expanded.has(id);
            const { left, right, flipped } = orientGame(g, home);
            return (
              <Fragment key={id}>
                <tr
                  className="player-list-row"
                  style={{ cursor: expandable ? "pointer" : "default" }}
                  onClick={() => expandable && toggleGame(id)}
                  title={expandable ? "Clicar para ver o buraco-a-buraco" : undefined}
                >
                  <td className="num" style={{ color: "var(--text-muted)" }}>{g.order ?? g.matchNo ?? i + 1}</td>
                  {/* isFinal do GolfBox = jogo TERMINADO (true em todos após o evento) — não rotular */}
                  <td className="tight"><span className="p p-sm p-muted">{fmtFormat(g.format)}</span></td>
                  <td style={{ fontWeight: left?.won ? 700 : 400, whiteSpace: "normal" }}>{gameMark(left, right, !!g.result)}{names(left?.players)}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {g.result || "—"}
                    {g.playedHoles ? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {g.playedHoles}b</span> : null}
                    {expandable && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> {isOpen ? "▴" : "▾"}</span>}
                  </td>
                  <td style={{ fontWeight: right?.won ? 700 : 400, whiteSpace: "normal" }}>{gameMark(right, left, !!g.result)}{names(right?.players)}</td>
                </tr>
                {isOpen && (
                  <tr className="row-expanded">
                    <td colSpan={5} style={{ background: "var(--bg-card)", padding: "4px 8px 6px" }}>
                      <GameHolesStrip g={g} left={left} right={right} flipped={flipped} />
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

type MatchSortKey = "no" | "home" | "res" | "away" | "time";

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
        case "time": return m.startTime ?? "";
      }
    };
    return [...round.matches].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [round.matches, sortKey, sortDir]);

  // 🏆 no vencedor / ✗ vermelho no vencido (só com o confronto decidido).
  const teamCell = (s: MatchplayTeamMatch["home"], won: boolean, settled: boolean) => (
    <span style={{ fontWeight: won ? 700 : 400, color: won ? undefined : "var(--text-2)" }}>
      {settled && <ResultMark kind={won ? "win" : "loss"} />}
      {sideFlag(s?.iso ?? null, s?.country ?? null)} {s?.name ?? "?"}
    </span>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="player-list-table" style={{ fontSize: "var(--fs-12)" }}>
        <thead>
          <tr>
            <SortableHdr k="no" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">#</SortableHdr>
            <SortableHdr k="home" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Casa</SortableHdr>
            <SortableHdr k="res" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Resultado</SortableHdr>
            <SortableHdr k="away" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Fora</SortableHdr>
            <SortableHdr k="time" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Hora</SortableHdr>
            <th className="tight">Jogos</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            const id = m.teamMatchId ?? i;
            const isPt = sideIsPt(m.home) || sideIsPt(m.away);
            const isExpanded = expanded.has(id);
            return (
              <Fragment key={id}>
                <tr
                  className={`player-list-row${isPt ? " row-portuguese" : ""}`}
                  style={{ cursor: m.games.length ? "pointer" : "default" }}
                  onClick={() => m.games.length && toggle(id)}
                  title={m.games.length ? "Clicar para ver os jogos (foursomes/singles)" : undefined}
                >
                  <td className="num" style={{ color: "var(--text-muted)" }}>{m.matchNo ?? i + 1}</td>
                  <td>{teamCell(m.home, m.winner === "home", m.winner != null)}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {m.result || (m.isStarted ? <span className="p p-sm">em curso</span> : "—")}
                  </td>
                  <td>{teamCell(m.away, m.winner === "away", m.winner != null)}</td>
                  <td className="tight" style={{ color: "var(--text-muted)" }}>{m.startTime ?? "—"}</td>
                  <td className="tight" style={{ color: "var(--text-muted)" }}>
                    {m.games.length ? `${m.games.length} ${isExpanded ? "▴" : "▾"}` : "—"}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="row-expanded">
                    <td colSpan={6} style={{ background: "var(--bg-card)", padding: "8px 12px 12px" }}>
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

function FlightSection({ fl, showTitle }: { fl: MatchplayFlight; showTitle: boolean }) {
  const rounds = useMemo(() => [...fl.rounds].sort((a, b) => a.number - b.number), [fl.rounds]);
  return (
    <div style={{ marginBottom: 20 }}>
      {showTitle && (
        <div className="fw-700" style={{ marginBottom: 4 }}>
          {fl.name}
          {fl.format && <span className="p p-sm p-muted" style={{ marginLeft: 6 }}>{fl.format}</span>}
          {!fl.isCompleted && <span className="p p-sm" style={{ marginLeft: 6 }}>em curso</span>}
        </div>
      )}
      {rounds.map(r => (
        <div key={r.number} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--text-2)", margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {r.name || `Ronda ${r.number}`}
            {r.date && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {fmtRoundDate(r.date)}</span>}
          </div>
          {r.matches.length ? <RoundTable round={r} /> : <div className="muted">Sem confrontos.</div>}
        </div>
      ))}
    </div>
  );
}

export default function MatchplayView({ data }: { data: MatchplayFile }) {
  if (!data.flights.length) return <div className="muted">Sem brackets de match play.</div>;
  const multiFlight = data.flights.length > 1;
  return (
    <div>
      {data.flights.map(fl => <FlightSection key={fl.competitionId} fl={fl} showTitle={multiFlight || !!(fl.format && fl.format !== "KnockOut")} />)}
      <div style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>
        Clica num confronto para ver os jogos (foursomes e singles), e num jogo para o
        buraco-a-buraco · estado corrido na perspectiva da equipa da coluna ESQUERDA
        (<span style={{ color: "var(--accent)", fontWeight: 700 }}>UP</span> à frente,{" "}
        <span style={{ color: "var(--medal-bronze)", fontWeight: 700 }}>DN</span> atrás).
      </div>
    </div>
  );
}
