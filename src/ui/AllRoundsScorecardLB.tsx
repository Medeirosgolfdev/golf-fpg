/**
 * AllRoundsScorecardLB.tsx — All-rounds combined scorecard leaderboard
 *
 * Extracted from LeaderboardComponents.tsx.
 * Data logic delegated to useAllRoundsData hook.
 * Displays hole-by-hole scorecards for all rounds side-by-side, with both
 * grouped mode (rounds per player) and independent mode (one row per round).
 */
import React, { useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
import { resolveEsc, computeSD } from "../data/fpgUtils";
import { scClass } from "../utils/scoreDisplay";
import { fmtToPar, fmtHcp, abreviarNome, medal } from "../utils/format";
import SortableHdr from "./SortableHdr";
import EmptyState from "./EmptyState";
import PlayerLink from "./PlayerLink";
import FilterChip from "./FilterChip";
import { ESC_STYLE } from "./PillBadge";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { isManuel, SDPill, type PlayersDB } from "./tournamentPrimitives";
import { useFedBirthdates } from "./InscricoesComponents";
import {
  useAllRoundsData,
  type ComputeRoundSD,
  type PRow,
  type FlatRow,
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
  const hideHCP = options?.hideHCP ?? false;
  const hideSD = options?.hideSD ?? false;
  const startHole = options?.startHole ?? 1;
  const nameDecorator = options?.nameDecorator;

  // SD calculation via computeSD (FPG style)
  const fpgComputeSD: ComputeRoundSD = useMemo(() => {
    return (player, capped, rs, _ref, gross) => {
      const sdP: Player = {
        ...player,
        scores: capped,
        par: rs.pars,
        si: rs.si,
        courseRating: rs.courseRating,
        slope: rs.slope,
        nholes: rs.pars?.length,
        grossTotal: gross,
      };
      const { sd } = computeSD(sdP);
      return sd;
    };
  }, []);

  const fedBirthdates = useFedBirthdates();
  const resolveEscFn = useMemo(
    () => (p: Player) => resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || tournament.escalao || "",
    [escLookup, tournament.escalao, tournament.date, playersDB, fedBirthdates],
  );

  const d = useAllRoundsData({
    tournament,
    computeRoundSD: fpgComputeSD,
    resolveEsc: resolveEscFn,
  });

  const {
    par, si, meters, teeMeters, nh, is9, parF9, parB9, parTot, hasSI, hasMeters, playedRounds,
    gDisplayed, displayed,
    groupMode, setGroupMode, showSC, setShowSC,
    nameQ, setNameQ, clubQ, setClubQ,
    escFilter, toggleEsc,
    teeFilter, toggleTee,
    sortKey, sortDir, toggleSort,
    availClubs, availEsc, availTees, clearFilter,
  } = d;

  /* Marca de tee — só o quadrado colorido (substitui a coluna de clube no scorecard) */
  function TeeLabel({ tee }: { tee?: string }) {
    if (!tee) return <span className="muted">–</span>;
    const hex = getTeeHex(tee);
    const bdr = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
    return (
      <span
        title={tee}
        style={{ display: "inline-block", width: 12, height: 12, borderRadius: "var(--radius-xs)", background: hex, border: bdr }}
      />
    );
  }

  /* Renderizar células de score buraco-a-buraco */
  function ScoreCells({ scores, pars }: { scores: number[]; pars: number[] }) {
    const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
    const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
    return (
      <>
        {scores.slice(0, 9).map((sc, i) => (
          <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
            <span className={"sc-score " + scClass(sc, pars[i] ?? par[i])}>
              {sc || ""}
            </span>
          </td>
        ))}
        <td className="lb-halftot">
          {f9} <span className="fs-10 c-text-3">({fmtToPar(f9 - parF9)})</span>
        </td>
        {!is9 && (
          <>
            {scores.slice(9, 18).map((sc, i) => (
              <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                <span className={"sc-score " + scClass(sc, pars[9 + i] ?? par[9 + i])}>
                  {sc || ""}
                </span>
              </td>
            ))}
            <td className="lb-halftot">
              {b9} <span className="fs-10 c-text-3">({fmtToPar(b9 - parB9)})</span>
            </td>
          </>
        )}
      </>
    );
  }

  const postCols = (hideSD ? 0 : 1) + 4; // SD(opcional) 🦅 🐦 Par ■
  const headerSpan = 2 + (hideHCP ? 0 : 1) + 1;

  if (!tournament.players.length) return <EmptyState size="sm" message="Sem dados." />;

  return (
    <div>
      {/* Info + toggles */}
      <div
        className="muted fs-11 mb-8 p-0-4px gap-8 flex-wrap"
        style={{ display: "flex", alignItems: "center" }}
      >
        <span>
          {groupMode ? gDisplayed.length : displayed.length} {groupMode ? "jogadores" : "scorecards"} ·{" "}
          {playedRounds}R · Par {parTot}
        </span>
        {/* Toggle modo */}
        <div className="segmented-toggle seg-sm" style={{ marginLeft: 4 }}>
          {([true, false] as const).map((g) => (
            <button
              key={String(g)}
              onClick={() => setGroupMode(g)}
              className={"seg-btn fs-10" + (groupMode === g ? " active" : "")}
            >
              {g ? "Agrupado" : "Independente"}
            </button>
          ))}
        </div>
        <span onClick={() => setShowSC((v) => !v)} className="btn ml-auto">
          {showSC ? "Ocultar scorecard" : "Ver scorecard"}
        </span>
      </div>

      {/* Barra de filtro compacta */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
          marginBottom: 8,
        }}
      >
        <div style={{ position: "relative" }}>
          <span
            className="fs-11 c-muted"
            style={{
              position: "absolute",
              left: 7,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            🔍
          </span>
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
            style={{
              border: `1px solid ${clubQ ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <option value="">Todos os clubes</option>
            {availClubs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {(nameQ || clubQ || escFilter.length > 0 || teeFilter.length > 0) && (
          <button
            onClick={clearFilter}
            className="fs-10 c-muted"
            style={{
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              cursor: "pointer",
            }}
          >
            ✕ limpar
          </button>
        )}
      </div>

      <div className="bjgt-chart-scroll">
        <table className={"sc-lb" + (showSC ? " sc-lb-with-sc" : "")} data-sc-table="1">
          <thead>
            {/* Linhas Metros — uma por cada tee distinto jogado (rapazes/raparigas
                /escalões jogam tees diferentes), com a respectiva distância. Cai
                para uma única linha "Metros" quando só existe a referência da ronda. */}
            {showSC && hasMeters &&
              (teeMeters.length ? teeMeters : [{ teeName: "", meters }]).map((tm) => {
                const mArr = tm.meters.slice(0, nh);
                const hex = tm.teeName ? getTeeHex(tm.teeName) : null;
                const bdr = hex ? teeBorder(hex) || "1px solid rgba(0,0,0,.18)" : undefined;
                const mTot = mArr.reduce((a, b) => a + (Number(b) || 0), 0);
                const mF9 = mArr.slice(0, 9).reduce((a, b) => a + (Number(b) || 0), 0);
                const mB9 = mArr.slice(9).reduce((a, b) => a + (Number(b) || 0), 0);
                return (
                  <tr key={tm.teeName || "metros"} className="lb-si-row">
                    <td className="sticky-col-0" />
                    <td className="lb-par-lbl sticky-col-1" colSpan={headerSpan}>
                      {tm.teeName ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "var(--radius-xs)", background: hex!, border: bdr, flexShrink: 0 }} />
                          <span>{tm.teeName}</span>
                        </span>
                      ) : (
                        "Metros"
                      )}
                    </td>
                    <td className="lb-topar" />
                    <td className="lb-gross">{mTot || ""}</td>
                    {mArr.slice(0, 9).map((v, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        {v || ""}
                      </td>
                    ))}
                    <td className="lb-halftot">{mF9 || ""}</td>
                    {!is9 &&
                      mArr.slice(9, 18).map((v, i) => (
                        <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                          {v || ""}
                        </td>
                      ))}
                    {!is9 && <td className="lb-halftot">{mB9 || ""}</td>}
                    {Array.from({ length: postCols }, (_, i) => (
                      <td key={i} />
                    ))}
                  </tr>
                );
              })}
            {/* Linha S.I. */}
            {showSC && hasSI && (
              <tr className="lb-si-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={headerSpan}>
                  S.I.
                </td>
                <td className="lb-topar" />
                {/* O S.I. é um identificador por buraco (1-18), não um valor
                    somável → totais/subtotais (TOT/OUT/IN) ficam em branco. */}
                <td className="lb-gross" />
                {si.slice(0, 9).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                    {v || ""}
                  </td>
                ))}
                <td className="lb-halftot" />
                {!is9 &&
                  si.slice(9, 18).map((v, i) => (
                    <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                      {v || ""}
                    </td>
                  ))}
                {!is9 && <td className="lb-halftot" />}
                {Array.from({ length: postCols }, (_, i) => (
                  <td key={i} />
                ))}
              </tr>
            )}
            {/* Linha PAR */}
            {showSC && (
              <tr className="lb-par-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={headerSpan}>
                  PAR
                </td>
                <td className="lb-topar" />
                <td className="lb-gross">{parTot}</td>
                {par.slice(0, 9).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                    {v}
                  </td>
                ))}
                <td className="lb-halftot">{parF9}</td>
                {!is9 &&
                  par.slice(9, 18).map((v, i) => (
                    <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                      {v}
                    </td>
                  ))}
                {!is9 && <td className="lb-halftot">{parB9}</td>}
                {Array.from({ length: postCols }, (_, i) => (
                  <td key={i} />
                ))}
              </tr>
            )}
            {/* Headers */}
            <tr>
              <th className="lb-pos sticky-col-0">#</th>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-name sticky-col-1">Jogador</SortableHdr>
              <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-club">Tee</SortableHdr>
              {!hideHCP && (
                <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-hcp">HCP</SortableHdr>
              )}
              <th className="lb-tee fs-10 c-muted fw-600">Rnd</th>
              <SortableHdr k="topar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-topar">±</SortableHdr>
              <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-gross">Tot</SortableHdr>
              {showSC && (
                <>
                  {Array.from({ length: 9 }, (_, h) => (
                    <SortableHdr key={h} k={`h${h}`} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={"lb-hole" + (h === 0 ? " lb-hole-first" : "") + " fs-10"}>{startHole + h}</SortableHdr>
                  ))}
                  <SortableHdr k="out" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-halftot">{is9 ? "Tot" : "Out"}</SortableHdr>
                  {!is9 &&
                    Array.from({ length: 9 }, (_, h) => (
                      <SortableHdr key={h + 9} k={`h${h + 9}`} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={"lb-hole" + (h === 0 ? " lb-hole-first" : "") + " fs-10"}>{startHole + 9 + h}</SortableHdr>
                    ))}
                  {!is9 && <SortableHdr k="in" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-halftot">In</SortableHdr>}
                </>
              )}
              {!hideSD && <th className="lb-sd">SD</th>}
              <SortableHdr k="eag" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-eag">🦅</SortableHdr>
              <SortableHdr k="bird" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-bird">🐦</SortableHdr>
              <SortableHdr k="par" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-par-stat">Par</SortableHdr>
              <SortableHdr k="bog" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-bog">■</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {groupMode
              ? /* ── MODO AGRUPADO ── */
                gDisplayed.map((row, playerIdx) => {
                  const prevPos = playerIdx > 0 ? gDisplayed[playerIdx - 1].pos : undefined;
                  const showPos = row.pos !== prevPos || row.isWD;
                  const mdl = row.pos != null ? medal(row.pos) : null;
                  const posStr = row.isWD ? "WD" : row.pos != null ? mdl ?? String(row.pos) : "–";
                  const playerBg = playerIdx % 2 === 0 ? undefined : "var(--bg-muted)";
                  const isFirst = playerIdx === 0;
                  return (
                    <React.Fragment key={row.key}>
                      {row.rds.map((rd, ri) => {
                        if (rd == null) return null;
                        const firstRi = row.rds.findIndex((r) => r != null);
                        const isFirstRd = ri === firstRi;
                        const rdBg = isFirstRd
                          ? playerBg
                          : playerBg
                            ? "color-mix(in srgb,var(--bg-muted) 60%,transparent)"
                            : "var(--overlay-black-02)";
                        const bTop = isFirstRd && !isFirst ? "2px solid var(--border)" : undefined;
                        return (
                          <tr key={ri} style={{ background: rdBg, borderTop: bTop }}>
                            <td className="lb-pos sticky-col-0" style={{ background: rdBg, borderTop: bTop }}>
                              {isFirstRd ? (showPos ? posStr : "") : ""}
                            </td>
                            <td className="lb-name sticky-col-1" style={{ background: rdBg, fontWeight: isFirstRd ? 600 : 400, borderTop: bTop }}>
                              {isFirstRd ? (
                                nameDecorator ? (
                                  nameDecorator(
                                    row.name,
                                    row.fed ? <PlayerLink fed={row.fed} name={abreviarNome(row.name)} /> : abreviarNome(row.name),
                                  )
                                ) : row.fed ? (
                                  <PlayerLink fed={row.fed} name={abreviarNome(row.name)} />
                                ) : (
                                  abreviarNome(row.name)
                                )
                              ) : (
                                <span className="muted fs-10" style={{ paddingLeft: 8 }}>↳</span>
                              )}
                            </td>
                            <td className="lb-club" style={{ borderTop: bTop }}>
                              {isFirstRd ? <TeeLabel tee={row.teeName} /> : ""}
                            </td>
                            {!hideHCP && (
                              <td className="lb-hcp" style={{ borderTop: bTop, color: isFirstRd ? undefined : "var(--text-muted)" }}>
                                {fmtHcp(row.hcp)}
                              </td>
                            )}
                            <td className="lb-tee fw-600 fs-10 c-muted" style={{ borderTop: bTop }}>{`R${ri + 1}`}</td>
                            <td className="lb-topar" style={{ color: rd.toPar < 0 ? "var(--color-good)" : rd.toPar > 0 ? "var(--color-danger)" : "var(--text)", borderTop: bTop }}>
                              {fmtToPar(rd.toPar)}
                            </td>
                            <td className="lb-gross" style={{ borderTop: bTop }}>{rd.gross}</td>
                            {showSC && <ScoreCells scores={rd.scores} pars={rd.holePars.length ? rd.holePars : par} />}
                            {!hideSD && (
                              <td className="lb-sd" style={{ borderTop: bTop }}>
                                {rd.sd != null ? <SDPill sd={rd.sd} source={null} hcp={row.hcp} /> : <span className="muted">–</span>}
                              </td>
                            )}
                            <td className="lb-eag" style={{ borderTop: bTop }}>{rd.eags || ""}</td>
                            <td className="lb-bird" style={{ borderTop: bTop }}>{rd.birds || ""}</td>
                            <td className="lb-par-stat" style={{ borderTop: bTop }}>{rd.pars || ""}</td>
                            <td className="lb-bog" style={{ borderTop: bTop }}>{rd.bogs || ""}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              : /* ── MODO INDEPENDENTE ── */
                displayed.map((row, idx) => {
                  const prevPos = idx > 0 ? displayed[idx - 1].pos : undefined;
                  const showPos = row.pos !== prevPos || row.isWD;
                  const mdl = row.pos != null ? medal(row.pos) : null;
                  const posStr = row.isWD ? "WD" : row.pos != null ? mdl ?? String(row.pos) : "–";
                  const bg = idx % 2 === 0 ? undefined : "var(--bg-muted)";
                  const bTop = idx > 0 ? "1px solid var(--border-light)" : undefined;
                  const rd = row.rd;
                  return (
                    <tr key={row.key} style={{ background: bg, borderTop: bTop }}>
                      <td className="lb-pos sticky-col-0" style={{ background: bg }}>{showPos ? posStr : ""}</td>
                      <td className="lb-name sticky-col-1 fw-600" style={{ background: bg }}>
                        {nameDecorator
                          ? nameDecorator(
                              row.name,
                              row.fed ? <PlayerLink fed={row.fed} name={abreviarNome(row.name)} /> : abreviarNome(row.name),
                            )
                          : row.fed ? <PlayerLink fed={row.fed} name={abreviarNome(row.name)} /> : abreviarNome(row.name)}
                      </td>
                      <td className="lb-club"><TeeLabel tee={row.teeName} /></td>
                      {!hideHCP && <td className="lb-hcp">{fmtHcp(row.hcp)}</td>}
                      <td className="lb-tee fw-600 fs-10 c-muted">{row.rdLabel}</td>
                      <td className="lb-topar" style={{ color: rd.toPar < 0 ? "var(--color-good)" : rd.toPar > 0 ? "var(--color-danger)" : "var(--text)" }}>
                        {fmtToPar(rd.toPar)}
                      </td>
                      <td className="lb-gross">{rd.gross}</td>
                      {showSC && <ScoreCells scores={rd.scores} pars={rd.holePars.length ? rd.holePars : par} />}
                      {!hideSD && (
                        <td className="lb-sd">
                          {rd.sd != null ? <SDPill sd={rd.sd} source={null} hcp={row.hcp} /> : <span className="muted">–</span>}
                        </td>
                      )}
                      <td className="lb-eag">{rd.eags || ""}</td>
                      <td className="lb-bird">{rd.birds || ""}</td>
                      <td className="lb-par-stat">{rd.pars || ""}</td>
                      <td className="lb-bog">{rd.bogs || ""}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
