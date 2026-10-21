/**
 * AllRoundsScorecardLB.tsx — All-rounds combined scorecard leaderboard
 *
 * Os dados vêm do useAllRoundsData; a tabela é a ScorecardLeaderboard partilhada
 * (as mesmas linhas de metros/S.I./Par, cores e ordenação) e a barra de filtros
 * é a RowsFilterBar. Dois modos: agrupado (as voltas de cada jogador seguidas)
 * e independente (uma linha por volta).
 */
import React, { useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
import { resolveEsc, computeSD } from "../data/fpgUtils";
import { fmtHcp, abreviarNome, medal, fmtDobPt } from "../utils/format";
import SortableHdr from "./SortableHdr";
import EmptyState from "./EmptyState";
import PlayerLink from "./PlayerLink";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { RowsFilterBar } from "./PlayerFilterBar";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { SDPill, type PlayersDB } from "./tournamentPrimitives";
import { useFedBirthdates } from "./InscricoesComponents";
import {
  useAllRoundsData,
  type ComputeRoundSD,
  type RdData,
} from "../hooks/useAllRoundsData";

export function AllRoundsScorecardLB({
  tournament,
  escLookup,
  playersDB,
  options,
}: {
  tournament: Tournament;
  escLookup: EscLookup;
  playersDB: PlayersDB;
  options?: ScorecardOptions;
}) {
  // Como no ScorecardLB: com HCP nos dados, a coluna aparece.
  const hideHCP = (options?.hideHCP ?? false) && !tournament.players.some((p) => p.hcpExact != null);
  const hideSD = options?.hideSD ?? false;
  const showAge = options?.showAge ?? false;
  const startHole = options?.startHole ?? 1;
  const nameDecorator = options?.nameDecorator;

  // SD de cada ronda: o oficial da FPG ou, sem ele, o calculado com o HCP da
  // inscrição (ver computeSD).
  const fpgComputeSD: ComputeRoundSD = useMemo(() => {
    return (player, capped, rs, _ref, gross) => computeSD({
      ...player,
      sd: undefined,
      roundScores: [rs],
      scores: capped,
      par: rs.pars,
      si: rs.si,
      courseRating: rs.courseRating,
      slope: rs.slope,
      // ⚠ PCC é POR RONDA (por dia de jogo) — nunca cair no do jogador, que
      // vem da R1 via normalizePlayer: aplicava o PCC do dia 1 aos dias
      // seguintes ainda sem PCC publicado (visto no Amendoeira 2026 R2).
      pcc: rs.pcc,
      nholes: rs.pars?.length,
      grossTotal: gross,
    }, tournament.date).sd;
  }, [tournament.date]);

  const fedBirthdates = useFedBirthdates();
  const resolveEscFn = useMemo(
    () => (p: Player) => resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || tournament.escalao || "",
    [escLookup, tournament.escalao, tournament.date, playersDB, fedBirthdates],
  );

  const d = useAllRoundsData({
    tournament,
    computeRoundSD: fpgComputeSD,
    resolveEsc: resolveEscFn,
    playersDB,
  });

  const {
    par, si, meters, teeMeters, hasSI, hasMeters, playedRounds, parTot,
    gDisplayed, displayed, allGrouped,
    groupMode, setGroupMode, showSC, setShowSC,
    filter, setFilter,
    sortKey, sortDir, toggleSort,
  } = d;

  /* Marca de tee — só o quadrado colorido (substitui a coluna de clube no scorecard) */
  function TeeLabel({ tee }: { tee?: string }) {
    if (!tee) return <span className="muted">–</span>;
    const hex = getTeeHex(tee);
    const bdr = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
    return (
      <span
        title={tee}
        style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: hex, border: bdr }}
      />
    );
  }

  /** Pill de idade (coluna IDADE) — tooltip com a DOB completa quando existe. */
  function AgePill({ age, dob }: { age: number | null; dob: string | null }) {
    if (age == null || age < 0) return <span className="muted">–</span>;
    const d = fmtDobPt(dob);
    return (
      <span className="p p-sm" title={d ? `Nascido a ${d}` : undefined}
        style={{ background: "var(--bg-muted, #e5e7eb)", color: "var(--text-2)", borderColor: "transparent", cursor: d ? "help" : undefined }}>{age}a</span>
    );
  }

  const prefixCols = (showAge ? 1 : 0) + 1 + (hideHCP ? 0 : 1) + 1; // IDADE · Tee · HCP · Rnd
  const postCols = (hideSD ? 0 : 1) + 4; // SD(opcional) 🦅 🐦 Par ■

  type Line = {
    name: string; fed?: string; age: number | null; dob: string | null; teeName?: string;
    hcp: number | null; hcpEst?: boolean; isWD: boolean; pos: number | null;
  };
  const posStr = (r: Line) => (r.isWD ? "WD" : r.pos != null ? medal(r.pos) ?? String(r.pos) : "–");
  const nameOf = (r: Line) => {
    const inner = r.fed ? <PlayerLink fed={r.fed} name={abreviarNome(r.name)} /> : abreviarNome(r.name);
    return <span className="fw-600">{nameDecorator ? nameDecorator(r.name, inner) : inner}</span>;
  };
  /** Células entre o nome e o ±: IDADE · Tee · HCP · Rnd. Nas voltas seguintes
   *  do mesmo jogador (modo agrupado) só o HCP e a volta se repetem. */
  const prefixCells = (r: Line, rdLabel: string, first: boolean, bTop?: string) => (
    <>
      {showAge && <td className="lb-age" style={{ borderTop: bTop, textAlign: "center" }}>{first ? <AgePill age={r.age} dob={r.dob} /> : ""}</td>}
      <td className="lb-club" style={{ borderTop: bTop }}>{first ? <TeeLabel tee={r.teeName} /> : ""}</td>
      {!hideHCP && (
        <td className="lb-hcp" style={{ borderTop: bTop, color: first ? undefined : "var(--text-muted)" }}>
          {r.hcpEst ? <span className="est-value">{fmtHcp(r.hcp)}</span> : fmtHcp(r.hcp)}
        </td>
      )}
      <td className="lb-tee fw-600 fs-10 c-muted" style={{ borderTop: bTop }}>{rdLabel}</td>
    </>
  );
  const postCells = (rd: RdData, hcp: number | null, bTop?: string) => (
    <>
      {!hideSD && (
        <td className="lb-sd" style={{ borderTop: bTop }}>
          {rd.sd != null ? <SDPill sd={rd.sd} hcp={hcp} /> : <span className="muted">–</span>}
        </td>
      )}
      <td className="lb-eag" style={{ borderTop: bTop }}>{rd.eags || ""}</td>
      <td className="lb-bird" style={{ borderTop: bTop }}>{rd.birds || ""}</td>
      <td className="lb-par-stat" style={{ borderTop: bTop }}>{rd.pars || ""}</td>
      <td className="lb-bog" style={{ borderTop: bTop }}>{rd.bogs || ""}</td>
    </>
  );

  const rows: ScorecardRow[] = useMemo(() => {
    if (groupMode) {
      // ── Agrupado: as voltas de cada jogador seguidas, a 1ª com o nome ──
      return gDisplayed.flatMap((row, playerIdx) => {
        const showPos = playerIdx === 0 || row.pos !== gDisplayed[playerIdx - 1].pos || row.isWD;
        const playerBg = playerIdx % 2 === 0 ? undefined : "var(--bg-muted)";
        const firstRi = row.rds.findIndex((r) => r != null);
        return row.rds.flatMap((rd, ri): ScorecardRow[] => {
          if (rd == null) return [];
          const first = ri === firstRi;
          const bg = first ? playerBg
            : playerBg ? "color-mix(in srgb,var(--bg-muted) 60%,transparent)" : "var(--bg-stripe)";
          const bTop = first && playerIdx > 0 ? "2px solid var(--border)" : undefined;
          return [{
            key: `${row.key}:${ri}`, fedCode: row.fed,
            pos: first && showPos ? posStr(row) : "",
            gross: rd.gross, toPar: rd.toPar, scores: rd.scores,
            holePars: rd.holePars.length ? rd.holePars : par,
            rowBg: bg, stickyBg: bg, borderTop: bTop,
            nameContent: first ? nameOf(row) : <span className="muted fs-10" style={{ paddingLeft: 8 }}>↳</span>,
            prefixCells: prefixCells(row, `R${ri + 1}`, first, bTop),
            postScorecardCells: postCells(rd, row.hcp, bTop),
          }];
        });
      });
    }
    // ── Independente: uma linha por volta ──
    return displayed.map((row, idx): ScorecardRow => {
      const showPos = idx === 0 || row.pos !== displayed[idx - 1].pos || row.isWD;
      const bg = idx % 2 === 0 ? undefined : "var(--bg-muted)";
      const bTop = idx > 0 ? "1px solid var(--border-light)" : undefined;
      return {
        key: row.key, fedCode: row.fed,
        pos: showPos ? posStr(row) : "",
        gross: row.rd.gross, toPar: row.rd.toPar, scores: row.rd.scores,
        holePars: row.rd.holePars.length ? row.rd.holePars : par,
        rowBg: bg, stickyBg: bg, borderTop: bTop,
        nameContent: nameOf(row),
        prefixCells: prefixCells(row, row.rdLabel, true, bTop),
        postScorecardCells: postCells(row.rd, row.hcp, bTop),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, gDisplayed, displayed, par, showAge, hideHCP, hideSD, nameDecorator]);

  if (!tournament.players.length) return <EmptyState size="sm" message="Sem dados." />;

  const hdr = (k: string, cls: string, label: React.ReactNode) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls}>{label}</SortableHdr>;
  // As chaves do hook (topar · h0..h17 · out · in) no vocabulário da tabela partilhada.
  const activeSortKey = sortKey === "topar" ? "toPar" : sortKey === "out" ? "f9" : sortKey === "in" ? "b9"
    : /^h\d+$/.test(sortKey) ? `hole:${sortKey.slice(1)}` : sortKey;

  return (
    <ScorecardLeaderboard
      par={par}
      si={hasSI ? si : undefined}
      teeMeters={hasMeters ? (teeMeters.length ? teeMeters : [{ teeName: "", meters }]) : undefined}
      rows={rows}
      startHole={startHole}
      showScorecard={showSC}
      onToggleScorecard={() => setShowSC((v) => !v)}
      metaLine={
        <span className="muted fs-11" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>
            {groupMode ? gDisplayed.length : displayed.length} {groupMode ? "jogadores" : "scorecards"} · {playedRounds}R · Par {parTot}
          </span>
          <span className="segmented-toggle seg-sm">
            {([true, false] as const).map((g) => (
              <button key={String(g)} onClick={() => setGroupMode(g)} className={"seg-btn fs-10" + (groupMode === g ? " active" : "")}>
                {g ? "Agrupado" : "Independente"}
              </button>
            ))}
          </span>
        </span>
      }
      filterBar={<RowsFilterBar rows={allGrouped} filter={filter} onChange={setFilter} total={allGrouped.length} playersDB={playersDB} />}
      parLabelColSpan={prefixCols}
      prefixHeaderCells={
        <>
          {showAge && hdr("age", "lb-age", "IDADE")}
          {hdr("tee", "lb-club", "Tee")}
          {!hideHCP && hdr("hcp", "lb-hcp", "HCP")}
          <th className="lb-tee fs-10 c-muted fw-600">Rnd</th>
        </>
      }
      postScorecardColCount={postCols}
      postScorecardHeaderCells={
        <>
          {!hideSD && <th className="lb-sd">SD</th>}
          {hdr("eag", "lb-eag", "🦅")}
          {hdr("bird", "lb-bird", "🐦")}
          {hdr("par", "lb-par-stat", "Par")}
          {hdr("bog", "lb-bog", "■")}
        </>
      }
      onSortName={() => toggleSort("name")}
      onSortToPar={() => toggleSort("topar")}
      onSortGross={() => toggleSort("gross")}
      onSortHole={(i) => toggleSort(`h${i}`)}
      onSortF9={() => toggleSort("out")}
      onSortB9={() => toggleSort("in")}
      activeSortKey={activeSortKey}
      activeSortDir={sortDir}
    />
  );
}
