/**
 * ScorecardLB.tsx — Single-round scorecard leaderboard
 *
 * Extracted from LeaderboardComponents.tsx
 * Displays leaderboard with hole-by-hole scorecard for a single round.
 *
 * Columns: ESC · FED · CLUBE · HCP · TEE · Tot · ± · SD · 🐦 · Par · ■
 */
import React, { useState, useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Player, Tournament, ScorecardOptions, PlayerFilter } from "../data/fpgTypes";
import { numGross, resolveEsc, computeSD, filterPlayers } from "../data/fpgUtils";
import { useSort } from "../hooks/useSort";
import { scClass } from "../utils/scoreDisplay";
import { fmtToPar, fmtHcp, abreviarNome } from "../utils/format";
import {
  EMPTY_FILTER,
  type ScorecardRow,
} from "./multiRoundTypes";
import { ScorecardLeaderboard } from "./ScorecardLeaderboard";
import { EscPill } from "./PillBadge";
import SortableHdr from "./SortableHdr";
import EmptyState from "./EmptyState";
import PlayerLink from "./PlayerLink";
import {
  isManuel,
  fmtTP,
  TeeDot,
  TournPName,
  SDPill,
  type PlayersDB,
} from "./tournamentPrimitives";
import { PlayerFilterBar } from "./PlayerFilterBar";

/** Score máximo por buraco (regra do torneio) */
const MAX_HOLE_SCORE = 10;

/* PName — alias local */
const PName = ({
  name,
  fedCode,
  playersDB,
}: {
  name: string;
  fedCode?: string;
  playersDB: PlayersDB;
}) => <TournPName name={name} fedCode={fedCode} playersDB={playersDB} />;

/* SortKey — usado pelo ScorecardLB */
type SortKey = "pos" | "name" | "club" | "esc" | "hcp" | "gross" | "toPar" | "tee" | "sd";

export function ScorecardLB({
  tournament,
  escLookup,
  playersDB,
  siLabel,
  parLabelColSpan: parLabelColSpanProp,
  options,
}: {
  tournament: Tournament;
  escLookup: EscLookup;
  playersDB: PlayersDB;
  siLabel?: string;
  parLabelColSpan?: number;
  options?: ScorecardOptions;
}) {
  const hideHCP_ = options?.hideHCP ?? false;
  const hideSD_ = options?.hideSD ?? false;
  const hideEsc = options?.hideEsc ?? false;
  const hideFed = options?.hideFed ?? false;
  const hideTee = options?.hideTee ?? false;
  const clubLabel_ = options?.clubLabel ?? "CLUBE";
  const startHole_ = options?.startHole ?? 1;
  const nameDecorator_ = options?.nameDecorator;
  // Calcular colSpan dinâmico: base 5 (ESC+FED+CLUBE+HCP+TEE) menos as colunas ocultas
  const parLabelColSpan =
    parLabelColSpanProp ??
    (5 - (hideEsc ? 1 : 0) - (hideFed ? 1 : 0) - (hideHCP_ ? 1 : 0) - (hideTee ? 1 : 0));
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<SortKey>("pos");
  const [showScorecard, setShowScorecard] = useState(true);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  // Reset filtros quando muda de torneio
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) {
    setLastTcode(tournament.tcode);
    setFilter(EMPTY_FILTER);
  }

  const rawPlayers = tournament.players.filter((p) => p.scores && p.scores.length > 0);

  // ─── Calcular ref, par, posições ANTES de qualquer early return ───────────
  // (React exige que todos os hooks sejam chamados incondicionalmente)
  const refP = rawPlayers[0];
  const refRs0 = refP?.roundScores?.[0];
  const par = refP?.par?.length ? refP.par : refRs0?.pars || [];
  const nh = par.length;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si = refP?.si?.length ? refP.si : refRs0?.si || [];

  // Colectar metros por tee (cada tee distinto gera uma linha)
  const teeMetersMap = new Map<string, number[]>();
  for (const p of rawPlayers) {
    const prs = p.roundScores?.[0];
    const tn = p.teeName || prs?.teeName;
    const m = prs?.meters?.length ? prs.meters : p.meters;
    if (tn && m?.length && m.length >= nh && !teeMetersMap.has(tn)) {
      teeMetersMap.set(tn, m);
    }
  }
  const teeMeters = Array.from(teeMetersMap.entries()).map(([teeName, meters]) => ({
    teeName,
    meters,
  }));

  const nonWD = rawPlayers.filter((p) => !p._wd);
  const wdOnly = rawPlayers.filter((p) => p._wd);
  const byGross = [...nonWD].sort((a, b) => numGross(a) - numGross(b));
  let posCounter = 1;
  byGross.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(byGross[i - 1])) posCounter = i + 1;
    (p as any)._pos = posCounter;
  });
  wdOnly.forEach((p) => {
    (p as any)._pos = 9999;
  });
  const grosses = byGross.map((p) => numGross(p)).filter((g) => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  // Hooks têm de vir ANTES de qualquer return condicional
  const filteredPlayers = useMemo(
    () => filterPlayers(rawPlayers, filter, escLookup, playersDB, { tournamentDate: tournament.date }),
    [rawPlayers, filter, escLookup, playersDB, tournament.date]
  );

  const sorted = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      // WD players sempre no fim, independentemente do sortKey
      const aWD = a._wd;
      const bWD = b._wd;
      if (aWD && !bWD) return 1;
      if (!aWD && bWD) return -1;
      let av: any, bv: any;
      switch (sortKey) {
        case "pos":
          av = (a as any)._pos ?? 999;
          bv = (b as any)._pos ?? 999;
          break;
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "club":
          av = a.club || "";
          bv = b.club || "";
          break;
        case "esc":
          av = resolveEsc(a, escLookup, { tournamentDate: tournament.date, playersDB }) || "";
          bv = resolveEsc(b, escLookup, { tournamentDate: tournament.date, playersDB }) || "";
          break;
        case "hcp":
          av = a.hcpExact ?? 999;
          bv = b.hcpExact ?? 999;
          break;
        case "gross":
          av = numGross(a);
          bv = numGross(b);
          break;
        case "toPar":
          av = numGross(a) - parTotal;
          bv = numGross(b) - parTotal;
          break;
        case "tee":
          av = a.teeName || "";
          bv = b.teeName || "";
          break;
        case "sd":
          av = computeSD(a).sd ?? 999;
          bv = computeSD(b).sd ?? 999;
          break;
        default:
          av = 0;
          bv = 0;
      }
      if (typeof av === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [filteredPlayers, sortKey, sortDir, parTotal, escLookup]);

  // Agora é seguro fazer early return — todos os hooks já foram chamados
  if (!rawPlayers.length) return <EmptyState size="sm" message="Scorecards não disponíveis." />;

  const rows: ScorecardRow[] = sorted.map((p, idx) => {
    const isWDPlayer = !!p._wd || p.grossTotal == null || numGross(p) >= 999;
    const gross = isWDPlayer ? 0 : numGross(p);
    const dp = (p as any)._pos;
    const showPos = idx === 0 || dp !== (sorted[idx - 1] as any)._pos;
    const medalEmoji = dp === 1 ? "🥇" : dp === 2 ? "🥈" : dp === 3 ? "🥉" : null;
    const posDisplay =
      isWDPlayer ? "WD" : sortKey === "pos" ? (showPos ? medalEmoji ?? dp : "") : medalEmoji ?? dp;
    const esc = resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB }) || tournament.escalao || "";
    const { sd, source } = computeSD(p);
    const rowManuel = isManuel(p);
    const rowBg = rowManuel ? "var(--bg-success-subtle)" : undefined;
    const stickyBg = rowManuel ? "var(--bg-manuel-sticky)" : undefined;

    // Birdies / pars / bogeys
    const scores = p.scores?.length ? p.scores : p.roundScores?.[0]?.scores || [];
    let birds = 0,
      pars = 0,
      bogs = 0;
    for (let i = 0; i < scores.length && i < par.length; i++) {
      const d = scores[i] - par[i];
      if (d <= -1) birds++;
      else if (d === 0) pars++;
      else bogs++;
    }

    return {
      key: p.scoreId || idx,
      pos: posDisplay,
      gross,
      toPar: isWDPlayer ? null : gross - parTotal,
      scores,
      rowBg,
      stickyBg,
      isManuel: rowManuel,
      nameContent: nameDecorator_
        ? nameDecorator_(
            p.name,
            <PName
              name={p.name}
              fedCode={p.fedCode}
              playersDB={playersDB}
              highlight={isManuel(p)}
            />
          )
        : <PName
            name={p.name}
            fedCode={p.fedCode}
            playersDB={playersDB}
            highlight={isManuel(p)}
          />,
      prefixCells: (
        <>
          {!hideEsc && (
            <td className="lb-esc">{esc ? <EscPill esc={esc} /> : <span className="muted">–</span>}</td>
          )}
          {!hideFed && <td className="lb-fed">{p.fedCode || "–"}</td>}
          <td className="lb-club">{p.club || "–"}</td>
          {!hideHCP_ && <td className="lb-hcp">{fmtHcp(p.hcpExact)}</td>}
          {!hideTee && (
            <td className="lb-tee">
              <TeeDot teeName={p.teeName} />
            </td>
          )}
        </>
      ),
      postScorecardCells: (
        <>
          {!hideSD_ && (
            <td className="lb-sd">
              {sd != null ? (
                <SDPill sd={sd} source={source} hcp={p.hcpExact ?? null} />
              ) : (
                <span className="muted">–</span>
              )}
            </td>
          )}
          <td className="lb-bird">{birds || ""}</td>
          <td className="lb-par-stat">{pars || ""}</td>
          <td className="lb-bog">{bogs || ""}</td>
        </>
      ),
    };
  });

  return (
    <ScorecardLeaderboard
      par={par}
      si={si.length >= nh ? si : undefined}
      siLabel={siLabel}
      teeMeters={teeMeters.length ? teeMeters : undefined}
      rows={rows}
      parLabelColSpan={parLabelColSpan}
      postTotalColCount={0}
      startHole={startHole_}
      showScorecard={showScorecard}
      onToggleScorecard={() => setShowScorecard((v) => !v)}
      metaLine={
        <>
          <span>
            {rawPlayers.length} jog · Par {parTotal} · {nh}h
          </span>
          {avg > 0 && (
            <span>
              · Média {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})
            </span>
          )}
          {refP.course && <span>· 📍 {refP.course}</span>}
          {refP.courseRating && <span>· CR {refP.courseRating}</span>}
          {refP.slope && <span>· Slope {refP.slope}</span>}
        </>
      }
      filterBar={
        <PlayerFilterBar
          players={rawPlayers}
          filter={filter}
          onChange={setFilter}
          escLookup={escLookup}
          playersDB={playersDB}
          total={rawPlayers.length}
          tournamentDate={tournament.date}
        />
      }
      prefixHeaderCells={
        <>
          {!hideEsc && (
            <SortableHdr
              k="esc"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-esc"
            >
              ESC.
            </SortableHdr>
          )}
          {!hideFed && <th className="lb-fed">FED</th>}
          <SortableHdr
            k="club"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="lb-club"
          >
            {clubLabel_}
          </SortableHdr>
          {!hideHCP_ && (
            <SortableHdr
              k="hcp"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-hcp"
            >
              HCP
            </SortableHdr>
          )}
          {!hideTee && (
            <SortableHdr
              k="tee"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-tee"
            >
              TEE
            </SortableHdr>
          )}
        </>
      }
      postScorecardHeaderCells={
        <>
          {!hideSD_ && (
            <SortableHdr
              k="sd"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="lb-sd"
            >
              SD
            </SortableHdr>
          )}
          <th className="lb-bird">🐦</th>
          <th className="lb-par-stat">Par</th>
          <th className="lb-bog">■</th>
        </>
      }
      activeSortKey={sortKey}
      activeSortDir={sortDir}
      onSortPos={() => handleSort("pos")}
      onSortName={() => handleSort("name")}
    />
  );
}
