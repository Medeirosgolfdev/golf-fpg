/**
 * DriveAllRoundsScorecardLB — Combined multi-round scorecard display (Drive/AQUAPOR)
 *
 * Data logic delegated to useAllRoundsData hook.
 * Drive-specific: SD via calcAGS, SDPill, isDNS filter, per-round CR/slope.
 * Renders via ScorecardLeaderboard (composition pattern).
 */
import React, { useMemo } from "react";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { fmtHcp, medal } from "../utils/format";
import PlayerLink from "./PlayerLink";
import FilterChip from "./FilterChip";
import { SDPill, type PlayersDB } from "./tournamentPrimitives";
import { RoundPill, ESC_STYLE } from "./PillBadge";
import { getTeeHex } from "../utils/teeColors";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import SortableHdr from "./SortableHdr";
import { useSort } from "../hooks/useSort";
import type { Tournament, Player, SDLookup } from "./driveTypes";
import { isDNS } from "./driveUtils";
import {
  useAllRoundsData,
  type ComputeRoundSD,
  type RoundRef,
} from "../hooks/useAllRoundsData";

const RD_LABELS = ["R1", "R2", "R3", "R4"];

function DriveAllRoundsScorecardLB({
  totalTournament,
  playersDB,
  sdLookup,
}: {
  totalTournament: Tournament;
  playersDB: PlayersDB;
  sdLookup: SDLookup;
}) {
  const nRounds = totalTournament._totalRounds || 2;

  // Per-round references (pars/si/cr/slope) — Drive needs per-round CR/slope for SD
  const driveRoundRefs: RoundRef[] = useMemo(
    () =>
      Array.from({ length: nRounds }, (_, ri) => {
        const rdNum = ri + 1;
        for (const p of totalTournament.players) {
          const rs = p.roundScores?.find((r) => r.round === rdNum);
          if (rs?.pars?.length)
            return { pars: rs.pars, si: rs.si || [], cr: rs.courseRating, slope: rs.slope };
        }
        return { pars: [] as number[], si: [] as number[] };
      }),
    [totalTournament, nRounds],
  );

  // Drive SD calculation via calcAGS + expectedSD9
  const driveComputeSD: ComputeRoundSD = useMemo(() => {
    return (player, capped, rs, ref, gross) => {
      const cr = rs.courseRating ?? ref.cr;
      const slope = rs.slope ?? ref.slope;
      const rdNh = capped.length || (ref.pars.length || 18);
      const rdIs9 = rdNh <= 9;
      const hcp = player.hcpExact;
      const rdPars = rs.pars?.length ? rs.pars : ref.pars;
      const rdSi = rs.si?.length ? rs.si : ref.si;

      if (cr && slope && hcp != null && rdSi.length >= rdNh && capped.length >= rdNh && rdPars.length >= rdNh) {
        const ags = calcAGS(capped, rdPars, rdSi, cr, slope, hcp, rdNh);
        const rawSD = (113 / slope) * (ags - cr);
        return Math.round((rdIs9 ? rawSD + expectedSD9(hcp) : rawSD) * 10) / 10;
      } else if (cr && slope) {
        const rawSD = (113 / slope) * (gross - cr);
        if (rdIs9 && hcp != null) return Math.round((rawSD + expectedSD9(hcp)) * 10) / 10;
        if (!rdIs9) return Math.round(rawSD * 10) / 10;
      }
      return null;
    };
  }, []);

  // isDNS filter (stable reference)
  const dnsFilter = useMemo(() => (p: Player) => !isDNS(p), []);

  const d = useAllRoundsData({
    tournament: totalTournament,
    maxHoleScore: 10,
    computeRoundSD: driveComputeSD,
    playerFilter: dnsFilter,
    roundRefs: driveRoundRefs,
  });

  const {
    par, si, playedRounds, parTot,
    gDisplayed, displayed,
    groupMode, setGroupMode, showSC, setShowSC,
    nameQ, setNameQ, clubQ, setClubQ,
    escFilter, toggleEsc,
    teeFilter, toggleTee,
    availClubs, availEsc, availTees, clearFilter,
  } = d;

  /* ── Ordenação (regra do projecto: todas as colunas clicáveis) ──
     Modo agrupado ordena ao nível do jogador (rondas ficam juntas);
     stats de ronda (gross/toPar/sd/…) agregam por soma nesse modo. */
  type SortK = "pos" | "name" | "club" | "hcp" | "rnd" | "gross" | "toPar" | "sd" | "eag" | "bird" | "parstat" | "bog";
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<SortK>("pos");
  const INF = 9999;
  const mult = sortDir === "asc" ? 1 : -1;

  const gSorted = useMemo(() => {
    const sumRd = (rds: (typeof gDisplayed)[number]["rds"], f: (rd: NonNullable<(typeof gDisplayed)[number]["rds"][number]>) => number | null | undefined) => {
      let acc: number | null = null;
      for (const rd of rds) {
        if (rd == null) continue;
        const v = f(rd);
        if (v != null) acc = (acc ?? 0) + v;
      }
      return acc;
    };
    return [...gDisplayed].sort((a, b) => {
      const tie = (a.pos ?? INF) - (b.pos ?? INF);
      if (sortKey === "pos") return mult * tie;
      if (sortKey === "name") { const c = a.name.localeCompare(b.name); return c !== 0 ? mult * c : tie; }
      if (sortKey === "club") { const c = (a.club || "").localeCompare(b.club || ""); return c !== 0 ? mult * c : tie; }
      if (sortKey === "hcp") { const c = (a.hcp ?? INF) - (b.hcp ?? INF); return c !== 0 ? mult * c : tie; }
      const pick = (r: typeof a) =>
        sortKey === "gross" ? sumRd(r.rds, rd => rd.gross)
        : sortKey === "toPar" ? sumRd(r.rds, rd => rd.toPar)
        : sortKey === "sd" ? sumRd(r.rds, rd => rd.sd)
        : sortKey === "eag" ? sumRd(r.rds, rd => rd.eags)
        : sortKey === "bird" ? sumRd(r.rds, rd => rd.birds)
        : sortKey === "parstat" ? sumRd(r.rds, rd => rd.pars)
        : sortKey === "bog" ? sumRd(r.rds, rd => rd.bogs)
        : null;
      const c = (pick(a) ?? INF) - (pick(b) ?? INF);
      return c !== 0 ? mult * c : tie;
    });
  }, [gDisplayed, sortKey, mult]);

  const flatSorted = useMemo(() => {
    return [...displayed].sort((a, b) => {
      const tie = (a.pos ?? INF) - (b.pos ?? INF);
      if (sortKey === "pos") return mult * tie;
      if (sortKey === "name") { const c = a.name.localeCompare(b.name); return c !== 0 ? mult * c : tie; }
      if (sortKey === "club") { const c = (a.club || "").localeCompare(b.club || ""); return c !== 0 ? mult * c : tie; }
      if (sortKey === "hcp") { const c = (a.hcp ?? INF) - (b.hcp ?? INF); return c !== 0 ? mult * c : tie; }
      if (sortKey === "rnd") { const c = (a.rdLabel || "").localeCompare(b.rdLabel || ""); return c !== 0 ? mult * c : tie; }
      const pick = (r: typeof a) =>
        sortKey === "gross" ? r.rd.gross
        : sortKey === "toPar" ? r.rd.toPar
        : sortKey === "sd" ? r.rd.sd
        : sortKey === "eag" ? r.rd.eags
        : sortKey === "bird" ? r.rd.birds
        : sortKey === "parstat" ? r.rd.pars
        : sortKey === "bog" ? r.rd.bogs
        : null;
      const c = ((pick(a) ?? INF) as number) - ((pick(b) ?? INF) as number);
      return c !== 0 ? mult * c : tie;
    });
  }, [displayed, sortKey, mult]);

  // Convert grouped rows → ScorecardRow[] for ScorecardLeaderboard
  const groupedScorecardRows: ScorecardRow[] = useMemo(() => {
    const out: ScorecardRow[] = [];
    for (let playerIdx = 0; playerIdx < gSorted.length; playerIdx++) {
      const row = gSorted[playerIdx];
      const isFirst = playerIdx === 0;
      for (let ri = 0; ri < row.rds.length; ri++) {
        const rd = row.rds[ri];
        if (rd == null) continue;
        const firstRi = row.rds.findIndex((r) => r != null);
        const isFirstRd = ri === firstRi;
        const playerBg = playerIdx % 2 === 0 ? undefined : "var(--bg-muted)";
        const rdBg = isFirstRd
          ? playerBg
          : playerBg
            ? "color-mix(in srgb,var(--bg-muted) 60%,transparent)"
            : "var(--overlay-black-02)";
        const bTop = isFirstRd && !isFirst ? "2px solid var(--border)" : undefined;
        const posStr = !isFirstRd ? "" : row.isWD ? "WD" : row.pos != null ? medal(row.pos) ?? String(row.pos) : "–";

        out.push({
          key: `${row.key}_r${ri}`,
          pos: posStr,
          gross: rd.gross,
          toPar: rd.toPar,
          scores: rd.scores,
          rowBg: rdBg,
          stickyBg: rdBg,
          borderTop: bTop,
          nameContent: isFirstRd ? (
            row.fed ? <PlayerLink fed={row.fed} name={row.name} /> : row.name
          ) : (
            <span className="muted fs-10" style={{ paddingLeft: 8 }}>↳</span>
          ),
          prefixCells: (
            <>
              <td className="lb-club" style={{
                color: isFirstRd ? undefined : "var(--text-muted)",
                fontSize: isFirstRd ? undefined : 11,
              }}>
                {row.club || "–"}
              </td>
              <td className="lb-hcp" style={{
                color: isFirstRd ? undefined : "var(--text-muted)",
              }}>
                {fmtHcp(row.hcp)}
              </td>
              <td className="lb-tee" style={{
                fontWeight: 600,
                fontSize: "var(--fs-10)",
                color: "var(--text-muted)",
              }}>
                {RD_LABELS[ri] ?? `R${ri + 1}`}
              </td>
            </>
          ),
          postScorecardCells: (
            <>
              <td className="lb-sd">
                {rd.sd != null ? (
                  <SDPill sd={rd.sd} source={null} hcp={row.hcp} />
                ) : (
                  <span className="muted">–</span>
                )}
              </td>
              <td className="lb-eag">{rd.eags || ""}</td>
              <td className="lb-bird">{rd.birds || ""}</td>
              <td className="lb-par-stat">{rd.pars || ""}</td>
              <td className="lb-bog">{rd.bogs || ""}</td>
            </>
          ),
          sortName: row.name,
          sortPos: row.pos ?? undefined,
        });
      }
    }
    return out;
  }, [gSorted]);

  // Convert flat rows → ScorecardRow[]
  const flatScorecardRows: ScorecardRow[] = useMemo(() => {
    return flatSorted.map((row, idx) => {
      const posStr = row.isWD ? "WD" : row.pos != null ? medal(row.pos) ?? String(row.pos) : "–";
      const bg = idx % 2 === 0 ? undefined : "var(--bg-muted)";
      return {
        key: row.key,
        pos: posStr,
        gross: row.rd.gross,
        toPar: row.rd.toPar,
        scores: row.rd.scores,
        rowBg: bg,
        stickyBg: bg,
        nameContent: row.fed ? <PlayerLink fed={row.fed} name={row.name} /> : row.name,
        prefixCells: (
          <>
            <td className="lb-club">{row.club || "–"}</td>
            <td className="lb-hcp">{fmtHcp(row.hcp)}</td>
            <td className="lb-tee" style={{ fontWeight: 600, fontSize: "var(--fs-10)", color: "var(--text-muted)" }}>
              {row.rdLabel}
            </td>
          </>
        ),
        postScorecardCells: (
          <>
            <td className="lb-sd">
              {row.rd.sd != null ? (
                <SDPill sd={row.rd.sd} source={null} hcp={row.hcp} />
              ) : (
                <span className="muted">–</span>
              )}
            </td>
            <td className="lb-eag">{row.rd.eags || ""}</td>
            <td className="lb-bird">{row.rd.birds || ""}</td>
            <td className="lb-par-stat">{row.rd.pars || ""}</td>
            <td className="lb-bog">{row.rd.bogs || ""}</td>
          </>
        ),
        sortName: row.name,
        sortPos: row.pos ?? undefined,
      };
    });
  }, [flatSorted]);

  const prefixHeaderCells = (
    <>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-club">Clube</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-hcp">HCP</SortableHdr>
      <SortableHdr k="rnd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-tee">Rnd</SortableHdr>
    </>
  );

  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-sd">SD</SortableHdr>
      <SortableHdr k="eag" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-eag">🦅</SortableHdr>
      <SortableHdr k="bird" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-bird">🐦</SortableHdr>
      <SortableHdr k="parstat" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-par-stat">Par</SortableHdr>
      <SortableHdr k="bog" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-bog">■</SortableHdr>
    </>
  );

  const filterBar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
      <div style={{ position: "relative" }}>
        <span className="search-icon-abs">🔍</span>
        <input
          type="text"
          placeholder="Nome ou clube…"
          value={nameQ}
          onChange={(e) => setNameQ(e.target.value)}
          className="input-search"
          style={{ width: 150 }}
        />
      </div>
      {availEsc.length > 1 && availEsc.map((e) => {
        const k = e.toLowerCase().replace(/[\s-]/g, "");
        const s = ESC_STYLE[k];
        return (
          <FilterChip key={e} active={escFilter.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>
            {e}
          </FilterChip>
        );
      })}
      {availTees.length > 1 && availTees.map((t) => {
        const hex = getTeeHex(t);
        return (
          <FilterChip key={t} active={teeFilter.includes(t)} onClick={() => toggleTee(t)} color={hex}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="tee-dot-sq" style={{ background: hex }} />{t}
            </span>
          </FilterChip>
        );
      })}
      {availClubs.length > 2 && (
        <select
          value={clubQ}
          onChange={(e) => setClubQ(e.target.value)}
          className="select-compact"
          style={{ border: `1px solid ${clubQ ? "var(--accent)" : "var(--border)"}` }}
        >
          <option value="">Todos os clubes</option>
          {availClubs.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
      {(nameQ || clubQ || escFilter.length > 0 || teeFilter.length > 0) && (
        <button onClick={clearFilter} className="filter-clear-btn">✕ limpar</button>
      )}
    </div>
  );

  const metaLine = (
    <span>
      {groupMode ? gDisplayed.length : displayed.length} {groupMode ? "jogadores" : "scorecards"}
      {playedRounds > 1 && <> · <RoundPill nR={playedRounds} /></>}{" "}
      · Par {parTot}
    </span>
  );

  const modeToggle = (
    <span style={{ display: "flex", gap: 2, marginLeft: 4, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      {([true, false] as const).map((g) => (
        <button
          key={String(g)}
          onClick={() => setGroupMode(g)}
          style={{
            fontSize: "var(--fs-10)",
            padding: "2px 9px",
            border: "none",
            cursor: "pointer",
            background: groupMode === g ? "var(--accent)" : "transparent",
            color: groupMode === g ? "#fff" : "var(--text-muted)",
            fontWeight: groupMode === g ? 700 : 400,
          }}
        >
          {g ? "Agrupado" : "Independente"}
        </button>
      ))}
    </span>
  );

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {metaLine}
        {modeToggle}
      </div>

      {filterBar}

      <ScorecardLeaderboard
        par={par}
        si={si}
        rows={groupMode ? groupedScorecardRows : flatScorecardRows}
        prefixHeaderCells={prefixHeaderCells}
        postScorecardHeaderCells={postScorecardHeaderCells}
        parLabelColSpan={3}
        postScorecardColCount={5}
        showScorecard={showSC}
        onToggleScorecard={() => setShowSC((v) => !v)}
        onSortPos={() => handleSort("pos")}
        onSortName={() => handleSort("name")}
        onSortToPar={() => handleSort("toPar")}
        onSortGross={() => handleSort("gross")}
        activeSortKey={sortKey}
        activeSortDir={sortDir}
        filterBar={null}
      />
    </div>
  );
}

export default DriveAllRoundsScorecardLB;
