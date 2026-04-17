import React, { useMemo, useState } from "react";
import { useSort } from "../hooks/useSort";
import { escPillCls, type EscLookup } from "../utils/playerUtils";
import { ESC_STYLE, PillBadge, RoundPill } from "./PillBadge";
import SexBadge from "./SexBadge";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import FilterChip from "./FilterChip";
import { CrossSeasonTable, SortTh as CSortTh } from "./CrossSeasonTable";
import { isManuel, fmtTP, tpColor, TournPName, type PlayersDB } from "./tournamentPrimitives";
import { fmtDate, escalaoAtDate } from "../utils/format";
import type { RoundScore, Player, Tournament } from "../data/fpgTypes";

/* ─────────────────────────────────────────────
   RANKING PJA
   Tabela simples de ranking: # · Jogador · Esc · Clube · Voltas · Pts
   Filtros: escalão + pesquisa nome
   Pontos: par=25, −1 por pancada acima, +1 abaixo (mín 0); GF×1.5
   Top 14 voltas por ano contam para o total.
   ───────────────────────────────────────────── */

interface PJARound {
  roundKey: string;
  label: string;
  date: string;
}

interface PJATournCol {
  tournKey: string;
  name: string;
  date: string;
  campo: string;
  isGF: boolean;
  rounds: PJARound[];
  colSpan: number;
}

interface PJARoundResult {
  toPar: number;
  pts: number;
  inTop14: boolean;
}

interface PJAPRow {
  key: string;
  name: string;
  fedCode?: string;
  club: string;
  escalao: string;
  sex: string;
  hcp: number | null;
  results: Map<string, PJARoundResult>;
  allRounds: { roundKey: string; pts: number }[];
  total: number;
  voltas: number;
  eligible: boolean;
}

/* ─────────────────────────────────────────────
   Helper Functions
   ───────────────────────────────────────────── */

function pjaPts(toPar: number, gf: boolean): number {
  return Math.max(0, 25 - toPar) * (gf ? 1.5 : 1);
}

function fmtPts(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1);
}

function isGFTournament(t: Tournament): boolean {
  return /dunas/i.test(t.name) || /grande\s*final/i.test(t.name);
}

/* ─────────────────────────────────────────────
   Local Components
   ───────────────────────────────────────────── */

const PName = ({ name, fedCode, playersDB }: { name: string; fedCode?: string; playersDB: PlayersDB }) =>
  <TournPName name={name} fedCode={fedCode} playersDB={playersDB} />;

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */

export function PJARankingView({
  pjaList, playersDB, loading,
}: {
  pjaList: Tournament[];
  playersDB: PlayersDB;
  loading: boolean;
}) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const t of pjaList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [pjaList]);

  const [activeYear, setActiveYear] = useState<string>("");
  const year = activeYear || years[0] || "";

  const { sortKey, sortDir, toggleSort: handleSort, resetSort: resetYearSort } = useSort<string>("total", "desc");
  const [filterEsc, setFilterEsc] = useState<string[]>([]);
  const [filterName, setFilterName] = useState("");


  function toggleEsc(e: string) {
    setFilterEsc(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const yearTournaments: Tournament[] = useMemo(() =>
    pjaList
      .filter(t => (t.date || "").startsWith(year))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
  , [pjaList, year]);

  const tournCols: PJATournCol[] = useMemo(() => {
    const cols: PJATournCol[] = [];
    for (const t of yearTournaments) {
      const isSynth = !!t._isSynthetic;
      const subRounds: Tournament[] = t._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      if (isSynth && subRounds.length > 1) {
        const rounds: PJARound[] = subRounds.map((sr, i) => ({
          roundKey: tournKey + "_r" + (i + 1),
          label: "R" + (i + 1),
          date: sr.date || t.date,
        }));
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds, colSpan: rounds.length * 2 });
      } else {
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds: [{ roundKey: tournKey + "_r1", label: "", date: t.date || "" }], colSpan: 2 });
      }
    }
    return cols;
  }, [yearTournaments]);

  const allRows: PJAPRow[] = useMemo(() => {
    const map = new Map<string, PJAPRow>();

    for (const t of yearTournaments) {
      const isSynth = !!t._isSynthetic;
      const subRounds: Tournament[] = t._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      for (const p of t.players) {
        const playerKey = p.fedCode || ("name:" + p.name.toLowerCase().trim());

        if (!map.has(playerKey)) {
          const db = p.fedCode ? playersDB[p.fedCode] : null;
          const clubRaw = db?.club;
          const club = clubRaw
            ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
            : (p.club || "");
          // Escalão no ANO do ranking (year-based FPG).
          // Prioridade: DOB+year → histórico (scrape) → actual (último recurso, pode estar errado).
          const dob = (db as any)?.dob;
          const escByYear = dob && year ? escalaoAtDate(dob, year) : null;
          const historic = (p as any).escalao;
          const esc = escByYear
            || (historic ? String(historic).replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim() : "")
            || db?.escalao
            || "";
          map.set(playerKey, {
            key: playerKey, name: p.name, fedCode: p.fedCode,
            club, escalao: esc,
            sex: db?.sex || "", hcp: p.hcpExact ?? null,
            results: new Map(), allRounds: [], total: 0, voltas: 0, eligible: false,
          });
        }
        const row = map.get(playerKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;

        if (isSynth && subRounds.length > 1 && p.roundScores && p.roundScores.length > 0) {
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0);
            if (!parR || !rs.gross) return;
            const tp = rs.gross - parR;
            const pts = pjaPts(tp, isGF);
            const roundKey = tournKey + "_r" + (i + 1);
            row.results.set(roundKey, { toPar: tp, pts, inTop14: false });
            row.allRounds.push({ roundKey, pts });
          });
        } else {
          const tp = typeof p.toPar === "string" ? parseInt(p.toPar) : p.toPar as number;
          const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal as number;
          if (tp == null || isNaN(tp) || gross == null || isNaN(gross) || gross >= 900) continue;
          const pts = pjaPts(tp, isGF);
          const roundKey = tournKey + "_r1";
          row.results.set(roundKey, { toPar: tp, pts, inTop14: false });
          row.allRounds.push({ roundKey, pts });
        }
      }
    }

    for (const row of map.values()) {
      const sorted = [...row.allRounds].sort((a, b) => b.pts - a.pts);
      const top14Keys = new Set(sorted.slice(0, 14).map(r => r.roundKey));
      for (const [rk, res] of row.results.entries()) {
        res.inTop14 = top14Keys.has(rk);
      }
      row.total = sorted.slice(0, 14).reduce((s, r) => s + r.pts, 0);
      row.voltas = row.allRounds.length;
      row.eligible = row.voltas >= 14;
    }

    return [...map.values()].filter(r => r.voltas > 0);
  }, [yearTournaments, playersDB]);

  const availEscs = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.escalao) s.add(r.escalao);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const sortedRows = useMemo(() => {
    let rows = allRows;
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    const INF = 99999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name")    return mult * a.name.localeCompare(b.name, "pt");
      if (sortKey === "club")    return mult * a.club.localeCompare(b.club, "pt");
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao, "pt");
      if (sortKey === "voltas")  return mult * (a.voltas - b.voltas);
      if (sortKey.startsWith("toPar_")) {
        const rk = sortKey.slice(6);
        return mult * ((a.results.get(rk)?.toPar ?? INF) - (b.results.get(rk)?.toPar ?? INF));
      }
      if (sortKey.startsWith("pts_")) {
        const rk = sortKey.slice(4);
        return mult * ((a.results.get(rk)?.pts ?? -1) - (b.results.get(rk)?.pts ?? -1));
      }
      return mult * (a.total - b.total);
    });
  }, [allRows, filterEsc, filterName, sortKey, sortDir]);



  if (loading && pjaList.length === 0) return <LoadingState size="sm" />;
  if (!year) return <div className="muted fs-11" style={{ padding: 24 }}>Sem torneios PJA.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 10px", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <span className="fw-800 fs-14">Ranking PJA</span>
        <div style={{ display: "flex", gap: 6 }}>
          {years.map(yr => (
            <button key={yr}
              className={"tourn-tab tourn-tab-sm" + (yr === year ? " active" : "")}
              onClick={() => { setActiveYear(yr); setFilterEsc([]); setFilterName(""); resetYearSort(); }}
              style={yr === year ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
              {yr}
            </button>
          ))}
        </div>
        <span className="muted fs-11 ml-4" >Par=25pts · top 14 rondas · GF×1,5</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="shrink-0" style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
          <input type="text" placeholder="Nome ou clube…" value={filterName}
            onChange={e => setFilterName(e.target.value)}
            className="input-search" style={{ width: 150 }} />
        </div>
        {availEscs.length > 1 && <span style={{ color: "var(--border)" }}>|</span>}
        {availEscs.map(e => {
          const k = e.toLowerCase().replace(/[\s-]/g, "");
          const s = ESC_STYLE[k];
          return <FilterChip key={e} active={filterEsc.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>{e}</FilterChip>;
        })}
        {(filterEsc.length > 0 || filterName) && <>
          <span className="muted fs-10">{sortedRows.length} de {allRows.length}</span>
          <FilterChip active={false} onClick={() => { setFilterEsc([]); setFilterName(""); }}>✕ limpar</FilterChip>
        </>}
        <span className="chip ml-auto" >{allRows.length} jogadores · {tournCols.length} torneios</span>
      </div>

      {sortedRows.length === 0
        ? <EmptyState size="sm" message={`Sem dados para ${year}.`} />
        : (
          <CrossSeasonTable
            identityHeaders={<>
              <CSortTh k="rank"    s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">#</CSortTh>
              <CSortTh k="name"    s={sortKey} d={sortDir} on={handleSort} className="cs-name sticky-col-1">Jogador</CSortTh>
              <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">Esc.</CSortTh>
              <CSortTh k="club"    s={sortKey} d={sortDir} on={handleSort} className="cs-club cs-id-end">Clube</CSortTh>
            </>}
            groups={tournCols.map(tc => ({
              key: tc.tournKey,
              headerTh: (
                <th key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" style={{ lineHeight: 1.3 }}>
                  <div className="fw-800 fs-12" >
                    {tc.name}
                    {tc.isGF && <span className="badge-gf">★ GF×1.5</span>}
                  </div>
                  <div className="c-muted fs-10-fw5">
                    {fmtDate(tc.date)}{tc.campo ? " · " + tc.campo : ""}{tc.rounds.length > 1 && <> · <RoundPill nR={tc.rounds.length} /></>}
                  </div>
                </th>
              ),
              subHeaderThs: (
                <>
                  {tc.rounds.map(r => (
                    <React.Fragment key={r.roundKey}>
                      <CSortTh k={"toPar_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-grp">
                        {r.label ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--color-good-dark)" }}>{r.label}</span> : "±Par"}
                      </CSortTh>
                      <CSortTh k={"pts_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>Pts</CSortTh>
                    </React.Fragment>
                  ))}
                </>
              ),
            }))}
            summaryGroupTh={<th className="cs-grp u-fw8-fs12" colSpan={2}>Ranking</th>}
            summarySubHeaders={<>
              <CSortTh k="voltas" s={sortKey} d={sortDir} on={handleSort} className="cs-s-games cs-grp">Voltas</CSortTh>
              <CSortTh k="total"  s={sortKey} d={sortDir} on={handleSort} className="cs-s-pts cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 800 }}>Total</CSortTh>
            </>}
          >
            {sortedRows.map((row, idx) => {
              return (
                <tr key={row.key} className={isManuel(row) ? "row-manuel" : undefined}>
                  <td className="cs-pos sticky-col-0">{idx + 1}</td>
                  <td className="cs-name sticky-col-1">
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} />
                    {row.sex === "F" && <SexBadge sex="F" className="ml-4" />}
                  </td>
                  <td className="cs-esc">
                    {row.escalao ? <span className={escPillCls(row.escalao) + " fs-10"}>{row.escalao}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="cs-club cs-id-end">{row.club || "–"}</td>

                  {tournCols.map(tc => {
                    const hasAny = tc.rounds.some(r => row.results.has(r.roundKey));
                    if (!hasAny) return <td key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" />;
                    return (
                      <React.Fragment key={tc.tournKey}>
                        {tc.rounds.map(r => {
                          const res = row.results.get(r.roundKey);
                          if (!res) return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" />
                              <td className="cs-t-gross cs-col" />
                            </React.Fragment>
                          );
                          const tpStr = fmtTP(res.toPar);
                          const tpCol = tpColor(res.toPar);
                          return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" style={{ color: tpCol }}>{tpStr}</td>
                              <td className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)" }}>{fmtPts(res.pts)}</td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="cs-s-games cs-grp">
                    {row.voltas}
                    {!row.eligible && <span title="< 14 rondas — não elegível para GF" className="badge-warn-sm ml-3">⚠</span>}
                  </td>
                  <td className="cs-s-pts cs-col" style={{ fontWeight: 800, color: "var(--color-warn-dark)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtPts(row.total)}
                  </td>
                </tr>
              );
            })}
          </CrossSeasonTable>
        )
      }
    </div>
  );
}
