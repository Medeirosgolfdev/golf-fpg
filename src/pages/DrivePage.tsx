// @refresh reset
/**
 * DrivePage.tsx — DRIVE Tour & Challenge + AQUAPOR Results 2026
 * v10: Reads scraper v7 format directly (fedCode, roundScores)
 *      + multi-round support (R1/R2/Total tabs)
 */
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { ESCALOES_DRIVE as ESCALOES } from "../constants/escaloes";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { fmtToPar, fmtHcp, medal, shortDateSlash, tournamentUrl, parseTournKey } from "../utils/format";
import TabRow from "../ui/TabRow";
import { FilterPills } from "../ui/FilterPills";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import { resolveFedsInTournaments, buildEscLookup } from "../utils/playerUtils";
import { buildTemporalEscLookup } from "../data/fpgUtils";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { CircuitToolbarSlotCtx } from "../ui/circuit/toolbarSlot";
import PlayerLink from "../ui/PlayerLink";
import { useFedBirthdates } from "../ui/InscricoesComponents";
import {
  availEscaloes, buildSub12Data, countEvents, dateToSort, filterBySub12Series, filterTournByEsc,
  sub12Kpis, sub12SeriesCounts, sub12Tournaments, uniquePC, type Sub12SeriesTab,
} from "../data/drive/driveSub12";
import { useMasterDetail } from "../hooks/useMasterDetail";
import KpiCard from "../ui/KpiCard";
import LoadingState from "../ui/LoadingState";
import SexBadge from "../ui/SexBadge";
import { C } from "../utils/colors";
import {
  isManuel,
  tpColor,
  type PlayersDB,
} from "../ui/tournamentPrimitives";
import DriveEquipasTab, { type DriveEquipasData } from "./drive/DriveEquipasTab";
import TournamentGrid from "../ui/TournamentGrid";
import CircuitShell from "../ui/circuit/CircuitShell";
import { buildDriveEntries, DRIVE_CONFIG, shortCampo } from "../data/drive/driveCircuitData";
import { TournamentDetail } from "./fpg/TournamentDetail";
import MasterDetail from "../ui/MasterDetail";
import { loadDriveAdmissions, loadDriveData, loadDriveEquipas } from "../data/drive/driveLoader";
import { attachDriveAdmissions, buildDriveSource, filterDriveSource, type DriveAdmissionsIndex } from "../data/drive/driveSource";

import type {
  Tournament,
  Player,
  DriveData,
  Sub12Row,
} from "../ui/driveTypes";

/* ── Constants ── */
const REGIONS = [
  { id: "norte",   label: "Norte",   emoji: "📍" },
  { id: "tejo",    label: "Tejo",    emoji: "📍" },
  { id: "sul",     label: "Sul",     emoji: "📍" },
  { id: "madeira", label: "Madeira", emoji: "📍" },
  { id: "acores",  label: "Açores",  emoji: "📍" },
];
/** Remove o sufixo de ronda/total do tcode ("X_R2"/"X_Total" → "X"). */
const stripRoundSuffix = (tc: string | null | undefined) => (tc || "").replace(/_R\d+$|_Total$/, "");

/** A display group: either a single tournament or a multi-round set (R1+R2+Total) */
interface TournGroup {
  key: string;
  label: string;       // tab label
  campo?: string;
  num?: number;
  date: string;
  escalao: string | null | undefined; // para Challenge single-escalão ou null quando evento agrupa vários
  isMulti: boolean;    // multi-ronda (R1/R2/Total)
  isEvent: boolean;    // Challenge: vários escalões no mesmo dia/campo → tabs por escalão
  totalRounds: number;
  entries: Tournament[];  // 1 para single, N+1 para multi-ronda, N escalões para isEvent
}

function buildGroups(tournaments: Tournament[]): TournGroup[] {
  const escIdx = (esc: string | null | undefined) => {
    const i = ESCALOES.indexOf(esc || "");
    return i >= 0 ? i : 99;
  };
  const sorted = [...tournaments].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return escIdx(a.escalao) - escIdx(b.escalao);
  });
  const groups: TournGroup[] = [];
  const multiMap   = new Map<string, Tournament[]>();   // Tour multi-ronda (sem escalão de evento)
  const eventMap   = new Map<string, Tournament[]>();   // Challenge: date+ccode → TODAS as entries (single/R1/R2/Resumo)
  const singles: Tournament[] = [];

  // ── 1ª passagem: bucketizar ───────────────────────────────────────────
  // Challenge agrupa SEMPRE por evento (data+campo), juntando escalões — mesmo
  // quando multi-ronda. As entries R1/R2/Resumo entram aqui e são consolidadas
  // por escalão na 2ª passagem (antes, a expansão multi-ronda fragmentava o
  // evento num cartão por escalão).
  for (const t of sorted) {
    if (t.series === "challenge" && t.escalao) {
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (!eventMap.has(eventKey)) eventMap.set(eventKey, []);
      eventMap.get(eventKey)!.push(t);
    } else if (t._multiGroup) {
      if (!multiMap.has(t._multiGroup)) multiMap.set(t._multiGroup, []);
      multiMap.get(t._multiGroup)!.push(t);
    } else {
      singles.push(t);
    }
  }

  const roundSort = (a: Tournament, b: Tournament) => {
    if (a._roundLabel === "Resumo") return 1;
    if (b._roundLabel === "Resumo") return -1;
    return (a._roundLabel || "").localeCompare(b._roundLabel || "");
  };

  const seen = new Set<string>();
  for (const t of sorted) {
    if (t.series === "challenge" && t.escalao) {
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const bucket = eventMap.get(eventKey) || [];

      // Agrupar por escalão e escolher um representante por escalão:
      //   multi-ronda → entry "Resumo" (acumulado, renderiza via DriveAccumulatedLB)
      //   1 ronda     → a própria entry
      const byEsc = new Map<string, Tournament[]>();
      for (const e of bucket) {
        const k = e.escalao || "?";
        if (!byEsc.has(k)) byEsc.set(k, []);
        byEsc.get(k)!.push(e);
      }
      const reps: { escalao: string; rep: Tournament; rounds: Tournament[]; totalRounds: number }[] = [];
      for (const [esc, ents] of byEsc) {
        const resumo = ents.find(e => e._roundLabel === "Resumo");
        const rdEnts = ents.filter(e => e._roundLabel && e._roundLabel !== "Resumo");
        if (resumo) {
          reps.push({ escalao: esc, rep: resumo, rounds: rdEnts, totalRounds: resumo._totalRounds || (rdEnts.length || 2) });
        } else {
          reps.push({ escalao: esc, rep: ents[0], rounds: [], totalRounds: 1 });
        }
      }
      reps.sort((a, b) => escIdx(a.escalao) - escIdx(b.escalao));

      if (reps.length === 1) {
        const r = reps[0];
        if (r.rounds.length > 0) {
          // 1 escalão multi-ronda → cartão multi-ronda (tabs R1/R2/Resumo) — preserva drill-down por ronda
          const entries = [...r.rounds, r.rep].sort(roundSort);
          groups.push({
            key: r.rep._multiGroup || eventKey,
            label: shortCampo(r.rep.campo), campo: r.rep.campo, num: r.rep.num, date: r.rep.date,
            escalao: r.escalao, isMulti: true, isEvent: false, totalRounds: r.totalRounds, entries,
          });
        } else {
          groups.push({
            key: eventKey,
            label: shortCampo(r.rep.campo), campo: r.rep.campo, num: r.rep.num, date: r.rep.date,
            escalao: r.escalao, isMulti: false, isEvent: false, totalRounds: 1, entries: [r.rep],
          });
        }
      } else {
        // Vários escalões no mesmo evento → cartão de evento, 1 tab por escalão.
        const entries = reps.map(r => r.rep);
        const maxRounds = Math.max(1, ...reps.map(r => r.totalRounds));
        groups.push({
          key: eventKey,
          label: shortCampo(t.campo), campo: t.campo, num: t.num, date: t.date,
          escalao: null, isMulti: false, isEvent: true, totalRounds: maxRounds, entries,
        });
      }
    } else if (t._multiGroup) {
      if (seen.has(t._multiGroup)) continue;
      seen.add(t._multiGroup);
      const entries = multiMap.get(t._multiGroup)!;
      entries.sort(roundSort);
      groups.push({
        key: t._multiGroup,
        label: shortCampo(t.campo),
        campo: t.campo,
        num: t.num,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: true,
        isEvent: false,
        totalRounds: t._totalRounds || 2,
        entries,
      });
    } else {
      groups.push({
        key: t.tcode + "_" + t.date,
        label: shortCampo(t.campo),
        campo: t.campo,
        num: t.num,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: false,
        isEvent: false,
        totalRounds: 1,
        entries: [t],
      });
    }
  }
  return groups;
}


/* ═══════════════════════════════════════════════════════
   MAIN — DriveContent com sidebar coerente
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   SUB-12: Types & Data
   ═══════════════════════════════════════════════════════ */
type Sub12ViewTab = "grid" | "ranking" | "evolucao";

const SUB12_SERIES_TABS: { key: Sub12SeriesTab; label: string; emoji: string; holes: string }[] = [
  { key: "tour",      label: "Tour",      emoji: "🏌️", holes: "18h" },
  { key: "challenge", label: "Challenge", emoji: "⚡",  holes: "9h"  },
  { key: "aquapor",   label: "AQUAPOR",   emoji: "💧", holes: "18h" },
];
const CHART_COLORS = C.charts;
const SERIE_COLORS: Record<string, string> = { tour: "var(--color-teal)", challenge: C.chartPurple, aquapor: "var(--chart-5)" };
const SERIE_LABELS: Record<string, string>  = { tour: "Tour",   challenge: "Challenge",  aquapor: "AQUAPOR" };
const REGION_EMOJI: Record<string, string>  = { norte: "🔵", tejo: "🟡", sul: "🟢", madeira: "🟣", acores: "🔴", nacional: "⚪" };
/** Labels legíveis das zonas Drive (chaves canónicas em minúsculas). */
const REGION_LABEL: Record<string, string>  = { norte: "Norte", tejo: "Tejo", sul: "Sul", madeira: "Madeira", acores: "Açores", nacional: "Nacional" };
const regionLabel = (r: string): string => REGION_LABEL[r.toLowerCase()] || r;


const shortDate = shortDateSlash;

/* ─ Sub-12 Calendar ─ */
const fmtCalDate = (d: Date, end?: Date): string => {
  const dd = (n: number) => String(n).padStart(2, "0");
  const base = dd(d.getDate()) + "/" + dd(d.getMonth() + 1);
  return end ? base + "–" + dd(end.getDate()) + "/" + dd(end.getMonth() + 1) : base;
};
interface CalEntry { name: string; date: Date; endDate?: Date; campo: string; region: string; series: "tour"|"challenge"|"aquapor"; }
const CAL_ENTRIES: CalEntry[] = [
  { name: "1º DT Sul",     date: new Date(2026,0,11), campo: "Laguna GC",        region: "sul",     series: "tour" },
  { name: "2º DT Sul",     date: new Date(2026,1,1),  campo: "Vila Sol",          region: "sul",     series: "tour" },
  { name: "3º DT Sul",     date: new Date(2026,3,4),  campo: "Penina (TBC)",      region: "sul",     series: "tour" },
  { name: "4º DT Sul",     date: new Date(2026,5,10), campo: "Boavista",          region: "sul",     series: "tour" },
  { name: "1º DT Norte",   date: new Date(2026,0,4),  campo: "Estela GC",         region: "norte",   series: "tour" },
  { name: "2º DT Norte",   date: new Date(2026,1,1),  campo: "Amarante",          region: "norte",   series: "tour" },
  { name: "3º DT Norte",   date: new Date(2026,1,28), endDate: new Date(2026,2,1), campo: "Vale Pisão", region: "norte", series: "tour" },
  { name: "4º DT Norte",   date: new Date(2026,3,19), campo: "Ponte de Lima",     region: "norte",   series: "tour" },
  { name: "1º DT Tejo",    date: new Date(2026,0,4),  campo: "Montado",           region: "tejo",    series: "tour" },
  { name: "2º DT Tejo",    date: new Date(2026,0,31), campo: "Belas",             region: "tejo",    series: "tour" },
  { name: "3º DT Tejo",    date: new Date(2026,2,28), endDate: new Date(2026,2,29), campo: "St. Estêvão", region: "tejo", series: "tour" },
  { name: "4º DT Tejo",    date: new Date(2026,3,12), campo: "Lisbon SC",         region: "tejo",    series: "tour" },
  { name: "1º DT Madeira", date: new Date(2026,0,3),  campo: "Palheiro Golf",     region: "madeira", series: "tour" },
  { name: "2º DT Madeira", date: new Date(2026,1,7),  campo: "Santo da Serra",    region: "madeira", series: "tour" },
  { name: "3º DT Madeira", date: new Date(2026,2,7),  campo: "Palheiro Golf",     region: "madeira", series: "tour" },
  { name: "4º DT Madeira", date: new Date(2026,3,11), campo: "Porto Santo Golfe", region: "madeira", series: "tour" },
  { name: "1º DC Madeira", date: new Date(2026,0,4),  campo: "Palheiro",          region: "madeira", series: "challenge" },
  { name: "2º DC Madeira", date: new Date(2026,1,8),  campo: "Santo da Serra",    region: "madeira", series: "challenge" },
  { name: "3º DC Madeira", date: new Date(2026,2,8),  campo: "Santo da Serra",    region: "madeira", series: "challenge" },
  { name: "4º DC Madeira", date: new Date(2026,3,12), campo: "Porto Santo",       region: "madeira", series: "challenge" },
  { name: "1º DC Açores",  date: new Date(2026,0,24), campo: "Terceira Island GC",region: "acores",  series: "challenge" },
  { name: "2º DC Açores",  date: new Date(2026,1,28), campo: "Terceira Island GC",region: "acores",  series: "challenge" },
  { name: "AQUAPOR",       date: new Date(2026,0,17), endDate: new Date(2026,0,18), campo: "Vidago Palace", region: "nacional", series: "aquapor" },
];

/* ═══════════════════════════════════════════════════════
   SUB-12: UI Components
   ═══════════════════════════════════════════════════════ */
function UpcomingSchedule({ series }: { series: Sub12SeriesTab }) {
  const now = new Date(); now.setHours(0,0,0,0);
  const entries = CAL_ENTRIES.filter(e => e.series === series).sort((a,b) => a.date.getTime()-b.date.getTime());
  if (!entries.length) return null;
  return (
    <div className="card p-8-12">
      <div className="h-xs mb-6">📅 Calendário {SERIE_LABELS[series]} 2026</div>
      <div className="flex-wrap gap-4" style={{ display: "flex" }}>
        {entries.map((e, i) => {
          const endRef = e.endDate || e.date;
          const isPast = endRef.getTime() < now.getTime();
          const isNext = !isPast && entries.slice(0,i).every(prev => (prev.endDate||prev.date).getTime() < now.getTime());
          const col = SERIE_COLORS[series];
          return (
            <div key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: "var(--radius-pill)", fontSize: "var(--fs-10)",
              fontWeight: isNext ? 800 : isPast ? 400 : 600,
              background: isNext ? col + "18" : isPast ? "transparent" : "var(--bg-card)",
              color: isPast ? "var(--text-muted)" : isNext ? col : "var(--text-2)",
              border: isNext ? `2px solid ${col}` : isPast ? "1px solid var(--border-light)" : "1px solid var(--border)",
              textDecoration: isPast ? "line-through" : "none", opacity: isPast ? 0.6 : 1,
            }}>
              {REGION_EMOJI[e.region] || ""} <span className="fw-700">{fmtCalDate(e.date, e.endDate)}</span> {e.name} <span className="c-muted">{e.campo}</span>
              {isNext && <span className="badge-next" style={{ background: col }}>PRÓXIMO</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function SdSpan({ sd, hcp }: { sd: number | null; hcp?: number | null }) {
  if (sd == null) return <span className="c-muted">–</span>;
  return <span className={"p p-sm fs-11 p-" + sdClassByHcp(sd, hcp ?? null)}>{sd.toFixed(1)}</span>;
}
function ToParSpan({ tp }: { tp: number | null }) {
  if (tp == null) return <span className="c-muted">–</span>;
  const color = tpColor(tp);
  return <span className="fw-700 fs-11" style={{ color }}>{fmtToPar(tp)}</span>;
}

function RankingView({ rows, onPlayerClick }: { rows: Sub12Row[]; onPlayerClick: (fed: string) => void }) {
  const ranked = [...rows].filter(p => p.totalPts > 0).sort((a, b) => b.totalPts - a.totalPts);
  const zeroPts = rows.filter(p => p.totalPts === 0);
  return (
    <div>
      {ranked.length === 0 ? (
        <div className="card"><div className="muted">Nenhum jogador com pontos ainda</div></div>
      ) : (
        <div className="bjgt-chart-scroll">
          <table className="dtable fs-12" >
            <thead><tr>
              <th className="r" style={{ width: 36 }}>#</th>
              <th className="ta-left" style={{ paddingLeft: 6 }}>Jogador</th>
              <th>Clube</th>
              <th className="r">HCP</th>
              <th className="r">T</th>
              <th className="r" style={{ fontWeight: 800, color: "var(--color-warn-dark)" }}>Pts</th>
              <th className="r">Best SD</th>
              <th className="r">Melhor</th>
            </tr></thead>
            <tbody>
              {ranked.map((p, i) => (
                <tr key={p.fed} className={`pointer${p.sex === "F" ? " tourn-female-row" : ""}`} onClick={() => onPlayerClick(p.fed)}>
                  <td className="r" style={{ fontSize: "var(--fs-16)" }}>{medal(i + 1) ?? <span className="mono fw-700">{i+1}</span>}</td>
                  <td>
                    <a href={`/jogadores/${p.fed}`} target="_blank" rel="noopener noreferrer"
                      className="fw-700"
                      onClick={e => e.stopPropagation()}
                      style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 }}>
                      {p.name}
                    </a>
                    <SexBadge sex={p.sex} size="sm" className="ml-4" />
                  </td>
                  <td className="c-muted fs-11">{p.club}</td>
                  <td className="r mono">{fmtHcp(p.hcp)}</td>
                  <td className="r mono">{p.tourneiosPlayed}</td>
                  <td className="r fw-800" style={{ color: "var(--color-warn-dark)" }}>{p.totalPts}</td>
                  <td className="r"><SdSpan sd={p.bestSD} hcp={p.hcp} /></td>
                  <td className="r mono fw-700 c-good-dark">{p.bestGross ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {zeroPts.length > 0 && (
        <div className="card mt-14">
          <div className="h-xs">Sem pontos ({zeroPts.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
            {zeroPts.map(p => {
              const r = p.results[0];
              return (
                <a key={p.fed}
                  href={`/jogadores/${p.fed}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--bg)", borderRadius: "var(--radius)", fontSize: "var(--fs-11)", color: "inherit", textDecoration: "none" }}
                  onClick={e => { e.stopPropagation(); }}>
                  <span className="fw-600">{p.name}</span>
                  <span className="mono">{r?.gross ?? "–"} <span className="c-muted">({r?.tournShort})</span></span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EvolutionChart({ rows }: { rows: Sub12Row[] }) {
  const eligible = rows.filter(p => p.results.filter(r => r.sd != null).length >= 2);
  if (!eligible.length) {
    return <div className="card"><div className="h-xs">Evolução SD</div><div className="muted">Dados insuficientes (mínimo 2 torneios por jogador)</div></div>;
  }
  const top = [...eligible].sort((a,b) => b.results.filter(r=>r.sd!=null).length - a.results.filter(r=>r.sd!=null).length).slice(0,10);
  const allDates = [...new Set(top.flatMap(p => p.results.filter(r=>r.sd!=null).map(r=>r.date)))].sort((a,b)=>dateToSort(a)-dateToSort(b));
  const chartData = allDates.map(d => {
    const point: Record<string, any> = { date: shortDate(d) };
    for (const p of top) { const res = p.results.find(r => r.date===d && r.sd!=null); if (res) point[p.fed] = res.sd; }
    return point;
  });
  return (
    <div className="card">
      <div className="h-xs">Evolução SD ao longo da época</div>
      <div className="w-full mt-8" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              formatter={(((value: number | undefined, name: string) => { const p = top.find(x => x.fed===name); return [value != null ? value.toFixed(1) : "", p?.name||name]; }) as any)} />
            <Legend formatter={(value: string) => { const p = top.find(x => x.fed===value); return <span className="fs-10">{p?.name||value}</span>; }} />
            <ReferenceLine y={36} stroke="var(--color-danger)" strokeDasharray="4 4" strokeWidth={1} />
            {top.map((p, i) => (
              <Line key={p.fed} type="monotone" dataKey={p.fed} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PlayerDetail({ row, onClose }: { row: Sub12Row; onClose: () => void }) {
  return (
    <div className="card" style={{ border: "2px solid var(--accent)", position: "relative" }}>
      <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: "var(--fs-18)", color: "var(--text-3)" }}>✕</button>
      <div className="mb-8" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="fw-800" style={{ fontSize: "var(--fs-16)" }}>{row.name}</span>
        <span className="muted fs-11">{row.club} · {regionLabel(row.region)} · HCP {fmtHcp(row.hcp)}</span>
        <PlayerLink fed={row.fed} name="Ver perfil →" style={{ fontSize: "var(--fs-11)", color: "var(--accent)", textDecoration: "underline" }} />
      </div>
      <div className="mb-10 flex-wrap d-flex gap-6">
        <KpiCard label="Torneios"  value={String(row.tourneiosPlayed)} />
        <KpiCard label="Pts"       value={row.totalPts > 0 ? String(row.totalPts) : "–"} color="var(--color-warn-dark)" />
        <KpiCard label="Best SD"   value={row.bestSD?.toFixed(1) ?? "–"} color={row.bestSD != null && row.bestSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor"    value={row.bestGross != null ? String(row.bestGross) : "–"} color="var(--color-good-dark)" />
      </div>
      <div className="scroll-x">
        <table className="dtable fs-11">
          <thead><tr><th>Data</th><th>Torneio</th><th>Campo</th><th className="r">Pos</th><th className="r">Gross</th><th className="r">±Par</th><th className="r">SD</th></tr></thead>
          <tbody>
            {row.results.map((r, i) => (
              <tr key={i}>
                <td className="mono fs-10">{r.date}</td>
                <td>
                  <span className="fw-600">{r.tournName}</span>
                  <span className="badge-serie ml-4" style={{ background: (SERIE_COLORS[r.series]||"var(--text-muted)")+"22", color: SERIE_COLORS[r.series], border: `1px solid ${SERIE_COLORS[r.series]}44` }}>
                    {SERIE_LABELS[r.series]}
                  </span>
                </td>
                <td className="c-muted fs-10">{r.campo}</td>
                <td className="r mono">{r.pos ?? "–"}<span className="c-muted fs-10">/{r.totalPlayers}</span></td>
                <td className="r mono fw-700">{r.gross}</td>
                <td className="r"><ToParSpan tp={r.toPar} /></td>
                <td className="r"><SdSpan sd={r.sd} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN — DriveContent unificado (Tour + Challenge + AQUAPOR + Sub-12)
   ═══════════════════════════════════════════════════════ */
function DriveContent() {
  const [data, setData]           = useState<DriveData | null>(null);
  const [pdb, setPdb]             = useState<PlayersDB>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // Fallback DOB p/ federados fora de players.json curado.
  const fedBirthdates = useFedBirthdates();
  // Deep-link canónico: /drive/torneio/{ccode}-{tcode}
  const { tkey: urlTkey } = useParams<{ tkey?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Filtros sincronizados com URL query params para partilha directa.
  // Formato: `/drive?nav=ranking-sub12&series=aquapor&year=2026&region=Norte&esc=Sub+12,Sub+14&manuel=0`.
  const [searchParams, setSearchParams] = useSearchParams();
  const getQP = (key: string) => searchParams.get(key);

  const [navMode, setNavMode]   = useState<"torneios"|"ranking-sub12">(() => {
    const v = getQP("nav");
    return (v === "ranking-sub12") ? v : "torneios";
  });
  const [series, setSeries]     = useState<"all"|"tour"|"challenge"|"aquapor">(() => {
    const v = getQP("series");
    return (v === "all" || v === "tour" || v === "challenge" || v === "aquapor") ? v : "tour";
  });
  const [filterManuel, setFilterManuel] = useState(() => getQP("manuel") === "1");
    const md = useMasterDetail();
  const [regionFilter, setRegionFilter]         = useState<string | null>(() => getQP("region"));
  const [escFilter, setEscFilter]               = useState<string[]>(() => {
    const v = getQP("esc");
    return v ? v.split(",").map(s => s.trim()).filter(Boolean) : [];
  });
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [roundIdx, setRoundIdx]                 = useState(0);

  // Filtro de ano (null = todos)
  const [yearFilter, setYearFilter]             = useState<string | null>(() => getQP("year"));

  // Estado específico Sub-12
  const [sub12Series, setSub12Series]   = useState<Sub12SeriesTab>(() => {
    const v = getQP("s12s"); return (v === "tour" || v === "aquapor") ? v as Sub12SeriesTab : "tour";
  });
  const [sub12View, setSub12View]       = useState<Sub12ViewTab>(() => {
    const v = getQP("s12v"); return (v === "grid" || v === "list") ? v as Sub12ViewTab : "grid";
  });
  // Região: `s12r` é o param próprio; `region` (do modo torneios) serve de
  // fallback — assim `?nav=ranking-sub12&region=acores` filtra o ranking em
  // vez de ficar um param fantasma sem efeito (bug 2026-07-10).
  const [sub12Region, setSub12Region]   = useState(() => getQP("s12r") || getQP("region") || "all");
  const [sub12Sex, setSub12Sex]         = useState(() => getQP("s12x") || "all");
  // Escalão do ranking (generalização 2026-07-10 — deixou de ser fixo Sub-12).
  // "all" = todos os escalões jovens (Sub 10-18), como "Todas as zonas".
  const [sub12Esc, setSub12Esc]         = useState<string>(() => {
    const v = getQP("s12e");
    return v && (v === "all" || ESCALOES.includes(v)) ? v : "Sub 12";
  });
  const [sub12Search, setSub12Search]   = useState("");
  const [sub12Player, setSub12Player]   = useState<Sub12Row | null>(null);

  // Torneio seleccionado — vem do URL (?t=) para que o link seja partilhável.
  // Sem isto, /drive?series=aquapor abria sempre o torneio MAIS RECENTE da
  // série e não aquele que se estava a ver: partilhar o link mandava a outra
  // pessoa para outro torneio (e mudava sozinho à medida que novos torneios
  // fossem scrapados). Declarado aqui, acima do efeito state→URL, porque esse
  // efeito passou a lê-lo.
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(() => getQP("t"));

  // Sincronização state → URL (query string). Constrói params só com valores
  // não-default para manter URLs limpas. `replace: true` não pollui histórico.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (navMode !== "torneios") sp.set("nav", navMode);
    if (series !== "tour") sp.set("series", series);
    if (filterManuel) sp.set("manuel", "1");
    if (regionFilter) sp.set("region", regionFilter);
    if (escFilter.length) sp.set("esc", escFilter.join(","));
    if (yearFilter) sp.set("year", yearFilter);
    // Torneio aberto — torna o link partilhável ("estamos a ver ESTE").
    // Só na vista de torneios: nos rankings não há torneio seleccionado.
    if (navMode === "torneios" && selectedDriveId) sp.set("t", selectedDriveId);
    if (navMode === "ranking-sub12") {
      if (sub12Series !== "tour") sp.set("s12s", sub12Series);
      if (sub12View !== "grid") sp.set("s12v", sub12View);
      if (sub12Region !== "all") sp.set("s12r", sub12Region);
      if (sub12Sex !== "all") sp.set("s12x", sub12Sex);
      if (sub12Esc !== "Sub 12") sp.set("s12e", sub12Esc);
    }
    // Não mexer se o URL já é igual (evita push inútil ao histórico)
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMode, series, filterManuel, regionFilter, escFilter, yearFilter, selectedDriveId, sub12Series, sub12View, sub12Region, sub12Sex, sub12Esc]);

  const [monthlyMeta, setMonthlyMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    loadDriveData().then(({ raw: rawTournaments, tournaments: allTourns, meta, players: pp }) => {
      setMonthlyMeta(meta);
      setRaw(rawTournaments);
      const driveData: DriveData = {
        lastUpdated: "",
        source: "scoring.datagolf.pt",
        totalTournaments: allTourns.length,
        totalPlayers: allTourns.reduce((s, t) => s + t.playerCount, 0),
        totalScorecards: 0,
        tournaments: allTourns,
      };
      setData(driveData); setPdb(pp); setLoading(false);
      // Fed por nome (mexe nos jogadores) só depois do 1.º desenho.
      setTimeout(() => {
        resolveFedsInTournaments(driveData.tournaments, pp);
        setData({ ...driveData });
      }, 0);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Classificação por equipas (regiões) das Finais. Opcional: sem o ficheiro a
  // página funciona igual, só não aparece o separador «Equipas».
  const [equipasIdx, setEquipasIdx] = useState<Record<string, DriveEquipasData | null>>({});
  useEffect(() => {
    loadDriveEquipas().then((d) => { if (d) setEquipasIdx(d); });
  }, []);

  // Inscrições + draws da FPG (uma vez), por ccode-tcode.
  const [admDrawsIdx, setAdmDrawsIdx] = useState<DriveAdmissionsIndex>(new Map());
  const [raw, setRaw] = useState<Tournament[]>([]);
  const [admissionsMeta, setAdmissionsMeta] = useState<DataSource[]>([]);
  useEffect(() => {
    loadDriveAdmissions().then(({ idx, meta }) => {
      if (meta.status === "loaded") setAdmDrawsIdx(idx);
      setAdmissionsMeta([meta]);
    });
  }, []);

  // ── CircuitShell: entries a partir da lista CRUA (não-expandida) ─────────
  // O IntlTournView desenha as tabs de ronda a partir de results.players[].roundScores;
  // as secções Inscritos/Draw vêm de _admissions/_draws (anexados por tcode base).
  const escLookup = useMemo(() => buildEscLookup(pdb, (data?.tournaments ?? []) as any /* tipo local diferente do playerUtils */), [pdb, data]);
  const driveEntries = useMemo(() => {
    if (raw.length === 0) return [];
    attachDriveAdmissions(raw, admDrawsIdx);
    const src = filterDriveSource(buildDriveSource(raw, admDrawsIdx), { series, year: yearFilter, region: regionFilter });
    const ents = buildDriveEntries(src);
    // Detalhe IDÊNTICO à FPGPage: cada divisão (escalão) renderiza o TournamentDetail
    // da FPGPage — tabs flat (Inscrições·Draw·R1·R2·Resumo·Scorecards), que busca
    // inscrições/draws sozinho por ccode-tcode.
    for (const e of ents) {
      for (const d of e.divisions ?? []) {
        const t = d.results as any;
        const eqData = equipasIdx[`${t?.ccode}-${t?.tcode}`];
        const equipasTab = eqData ? { key: "equipas", label: "Equipas", content: <DriveEquipasTab data={eqData} /> } : null;
        d.renderFull = (extras) => <TournamentDetail tournament={t} escLookup={escLookup as any} playersDB={pdb as any}
          extraTabs={[equipasTab, extras?.seasonTab, extras?.pastEditionsTab, extras?.repeatersTab].filter(Boolean) as { key: string; label: string; content: React.ReactNode }[]} />;
      }
    }
    // Filtros entry-level — preservam TODOS os escalões do evento: Manuel / escalão.
    let out = ents;
    if (filterManuel) out = out.filter(e => e.hasManuel);
    if (escFilter.length > 0) out = out.filter(e => (e.divisions ?? []).some(d => escFilter.includes(d.escalao as any)));
    return out;
  }, [raw, admDrawsIdx, series, yearFilter, regionFilter, filterManuel, escFilter, pdb, escLookup, equipasIdx]);

  // Pool INTEGRAL para a tab "Edições anteriores" — TODOS os torneios (todos os
  // anos/séries/regiões), sem os filtros da sidebar nem os sintéticos futuros.
  // O Drive repete o mesmo evento várias vezes por ano (etapas), por vezes no
  // mesmo campo; a tab mostra-os todos como colunas. Sem este pool integral, as
  // irmãs ficavam limitadas ao ano/série/região filtrados na sidebar.
  const driveEditionsPool = useMemo(() => (raw.length === 0 ? [] : buildDriveEntries(raw as any)), [raw]);

  // Auto-seleccionar o torneio mais recente (e re-seleccionar quando a selecção
  // actual deixa de estar visível depois de mudar filtros).
  const tkeyConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (driveEntries.length === 0) return;
    const exists = selectedDriveId && driveEntries.some(e => e.id === selectedDriveId);
    if (exists) return;
    // Esperar pelas inscrições/draws: os torneios ainda por jogar (a Final de
    // 07/11) só entram na lista quando elas chegam. Com os meses a carregar em
    // paralelo, escolher antes disso abria sempre o penúltimo (22/10/2026).
    if (admissionsMeta.length === 0) return;
    // Deep-link /drive/torneio/{ccode}-{tcode}: abrir ESSE torneio e não o mais
    // recente. Se existe nos dados mas ainda não está visível, o efeito de
    // deep-link está a ajustar série/ano/Manuel — esperar pela próxima corrida.
    // Consome-se UMA vez: depois disso, mudar filtros volta ao comportamento normal.
    const parsed = tkeyConsumedRef.current === urlTkey ? null : parseTournKey(urlTkey);
    if (parsed) {
      const hit = (t: any) => !!t && String(t.ccode) === parsed.ccode
        && stripRoundSuffix(String(t.tcode ?? "")).split("+").includes(parsed.tcode);
      const entry = driveEntries.find(e => (e.divisions ?? []).some(d => hit(d.results)));
      if (entry) { tkeyConsumedRef.current = urlTkey ?? null; setSelectedDriveId(entry.id); return; }
      if (raw.some(hit)) return;
      tkeyConsumedRef.current = urlTkey ?? null;
    }
    const latest = [...driveEntries].sort((a, b) => (b.dateStart || "").localeCompare(a.dateStart || ""))[0];
    setSelectedDriveId(latest?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveEntries, selectedDriveId, urlTkey, admissionsMeta]);


  // Anos disponíveis — só os que têm torneios reais na série activa (exclui sub-rondas expandidas)
  const availYears = useMemo(() => {
    const s = new Set<string>();
    for (const t of data?.tournaments ?? []) {
      if ((series === "all" || t.series === series) && (!t._roundLabel || t._roundLabel === "Resumo")) {
        const y = t.date?.split("-")[0];
        if (y) s.add(y);
      }
    }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [data, series]);

  // Ano activo: por omissão o mais recente disponível
  const activeYear = yearFilter ?? availYears[0] ?? null;
  const inYear = (t: Tournament) => !activeYear || t.date?.startsWith(activeYear);

  const tourT    = useMemo(() => data?.tournaments.filter(t => t.series === "tour"      && inYear(t)) ?? [], [data, activeYear]);
  const allT     = useMemo(() => data?.tournaments.filter(t => inYear(t)) ?? [], [data, activeYear]);
  const challT   = useMemo(() => data?.tournaments.filter(t => t.series === "challenge" && inYear(t)) ?? [], [data, activeYear]);
  const aquaporT = useMemo(() => data?.tournaments.filter(t => t.series === "aquapor"   && inYear(t)) ?? [], [data, activeYear]);
  // escLookup definido acima (antes de driveEntries).

  // Lookup temporal: fedCode → Map<year, escalão> — construído dos torneios Challenge históricos
  const temporalEscLookup = useMemo(
    () => buildTemporalEscLookup(data?.tournaments ?? []),
    [data]
  );



  // Sub-12: só calcular quando a tab é activada pela primeira vez
  const [sub12Ready, setSub12Ready] = useState(false);
  useEffect(() => { if (navMode === "ranking-sub12" && !sub12Ready) setSub12Ready(true); }, [navMode, sub12Ready]);

  const sub12Data = useMemo(() => {
    if (!sub12Ready || !data) return [];
    const tourns = activeYear
      ? data.tournaments.filter(t => t.date?.startsWith(activeYear))
      : data.tournaments;
    return buildSub12Data(tourns, pdb, escLookup, temporalEscLookup, fedBirthdates, sub12Esc);
  }, [sub12Ready, data, pdb, escLookup, temporalEscLookup, activeYear, fedBirthdates, sub12Esc]);

  const sub12SeriesRows = useMemo(() => filterBySub12Series(sub12Data, sub12Series), [sub12Data, sub12Series]);

  const sub12Filtered = useMemo(() => {
    let list = sub12SeriesRows;
    if (sub12Region !== "all") list = list.filter(p => p.region.toLowerCase().includes(sub12Region.toLowerCase()));
    if (sub12Sex !== "all")    list = list.filter(p => p.sex === sub12Sex);
    if (sub12Search.trim()) {
      const q = sub12Search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q) || p.fed.includes(q));
    }
    return list;
  }, [sub12SeriesRows, sub12Region, sub12Sex, sub12Search]);

  // Colunas da grid = torneios onde os jogadores VISÍVEIS jogaram (derivadas
  // das linhas já filtradas) — com o filtro Madeira activo, as colunas das
  // outras zonas desaparecem em vez de consumir espaço vazio (2026-07-10).
  const sub12Tourns = useMemo(() => sub12Tournaments(sub12Filtered), [sub12Filtered]);

  // Zonas disponíveis: derivadas de TODOS os dados do escalão (não só da série
  // corrente) — senão o select desaparecia em séries pequenas (AQUAPOR com 1
  // jogador → 1 zona) e a lista "saltava" ao trocar de série.
  const sub12AvailRegions = useMemo(() => [...new Set(sub12Data.map(p => p.region).filter(Boolean))].sort(), [sub12Data]);

  const sub12Counts = useMemo(() => sub12SeriesCounts(sub12Data, SUB12_SERIES_TABS.map(s => s.key)), [sub12Data]);

  const sub12EscLabel = sub12Esc === "all" ? "Todos os escalões" : sub12Esc;
  const { players: sub12KpiPlayers, rounds: sub12KpiRounds, bestSD: sub12KpiBestSD, best: sub12KpiBest } = sub12Kpis(sub12Filtered);

  const handleSub12PlayerClick = useCallback((fed: string) => {
    const p = sub12SeriesRows.find(x => x.fed === fed);
    if (p) setSub12Player(prev => prev?.fed === fed ? null : p);
  }, [sub12SeriesRows]);

  // Série normal (tour/challenge/aquapor)
  const seriesT = series === "all" ? allT : series === "tour" ? tourT : series === "challenge" ? challT : aquaporT;
  const availRegions = useMemo(() => {
    const s = new Set(seriesT.map(t => t.region));
    return REGIONS.filter(r => s.has(r.id));
  }, [series, seriesT]);

  // Para series="all": aplicar filtros a cada série e combinar os grupos
  // Mais eficiente que um único buildGroups(allT) com centenas de entries
  const filteredT = useMemo(() => {
    let ts = seriesT;
    if (regionFilter) ts = ts.filter(t => t.region === regionFilter);
    // Aplicar escFilter. Challenge: cada tcode é um único escalão (t.escalao
    // definido), por isso filtra-se ao nível do torneio — caso contrário a
    // ResumoTable (painel Temporada) mostrava todos os escalões juntos.
    // Outras séries: filtro por jogador (DOB) com recálculo de posições.
    if (escFilter.length > 0) {
      ts = series === "challenge"
        ? ts.filter(t => t.escalao != null && escFilter.includes(t.escalao))
        : filterTournByEsc(ts, escFilter, escLookup, pdb, temporalEscLookup, fedBirthdates);
    }
    if (filterManuel) ts = ts.filter(t => t.players.some((p: Player) => isManuel(p)));
    return ts;
  }, [series, seriesT, regionFilter, escFilter, escLookup, pdb, temporalEscLookup, filterManuel, fedBirthdates]);

  const filteredGroups = useMemo(() => {
    const applyFilters = (ts: Tournament[]) => {
      let r = ts;
      if (regionFilter) r = r.filter(t => t.region === regionFilter);
      if (escFilter.length > 0 && series !== "challenge") r = filterTournByEsc(r, escFilter, escLookup, pdb, temporalEscLookup, fedBirthdates);
      if (filterManuel) r = r.filter(t => t.players.some(p => isManuel(p)));
      return r;
    };

    let groups: TournGroup[];
    if (series === "all") {
      groups = [
        ...buildGroups(applyFilters(tourT)),
        ...buildGroups(applyFilters(challT)),
        ...buildGroups(applyFilters(aquaporT)),
      ];
    } else {
      groups = buildGroups(filteredT);
    }

    // Para isEvent (Challenge agrupado): filtrar entries pelo escFilter
    // O evento continua visível se tiver pelo menos 1 escalão que corresponde
    if (escFilter.length > 0) {
      groups = groups.map(g => {
        if (!g.isEvent) return g;
        const matchEntries = g.entries.filter(e => e.escalao && escFilter.includes(e.escalao));
        if (matchEntries.length === 0) return null;
        return { ...g, entries: matchEntries, escalao: matchEntries.length === 1 ? matchEntries[0].escalao : null };
      }).filter(Boolean) as TournGroup[];
    }

    return groups;
  }, [series, filteredT, tourT, challT, aquaporT, regionFilter, escFilter, filterManuel, escLookup, pdb, temporalEscLookup, fedBirthdates]);

  const regionT = useMemo(() => regionFilter ? seriesT.filter(t => t.region === regionFilter) : seriesT, [seriesT, regionFilter]);
  const uniquePCRegion    = useMemo(() => uniquePC(regionT), [regionT]);
  const countTour         = useMemo(() => countEvents(tourT), [tourT]);
  const countChall        = useMemo(() => countEvents(challT), [challT]);
  const countAquapor      = useMemo(() => countEvents(aquaporT), [aquaporT]);

  // Para series="all" mostramos sempre todos os escalões (fixo) — evita iterar todos os jogadores
  const availEscs = useMemo(() => {
    if (series === "all") return ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"];
    return availEscaloes(regionT, escLookup, pdb, temporalEscLookup, fedBirthdates);
  }, [series, regionT, escLookup, pdb, temporalEscLookup, fedBirthdates]);

  useEffect(() => { setRegionFilter(null); setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); }, [series]);
  // Se o ano activo não existe na nova série, resetar para o mais recente disponível
  useEffect(() => {
    if (yearFilter && !availYears.includes(yearFilter)) setYearFilter(null);
  }, [availYears]);
  useEffect(() => { setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); }, [regionFilter]);
  useEffect(() => { setSub12Player(null); }, [sub12Series]);

  const selectedGroup = useMemo(
    () => filteredGroups.find(g => g.key === selectedGroupKey) ?? null,
    [filteredGroups, selectedGroupKey]
  );
  const curTournament = selectedGroup ? (selectedGroup.entries[roundIdx] || selectedGroup.entries[0]) : null;

  // ── Deep-link: ajustar filtros para que o torneio seja visível ──────────
  // Quando há `/drive/torneio/{ccode}-{tcode}` na URL, detectar em que série
  // (tour/challenge/aquapor) o torneio está e mudar `series` para essa antes
  // de procurar. Também desliga `filterManuel` se o Manuel não jogou no
  // torneio apontado pelo deep-link. Corre só uma vez por deep-link (e
  // quando a data chega).
  useEffect(() => {
    if (!urlTkey) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    const matchesT = (t: Tournament) => t.ccode === ccode && (
      t.tcode === tcode || (t.tcode || "").split("+").includes(tcode)
    );
    // ⚠ Procurar em TODOS os anos (data.tournaments) — tourT/challT/aquaporT já
    // vêm cortados ao ano activo, e um deep-link de outro ano nunca era achado.
    const found: Tournament | null = data?.tournaments.find(matchesT) ?? null;
    const detectedSeries = found ? ((found.series || "tour") as "tour" | "challenge" | "aquapor") : null;
    if (!found || !detectedSeries) return;  // ainda não carregado — próxima corrida apanha
    if (series !== detectedSeries && series !== "all") setSeries(detectedSeries);
    // Desligar filterManuel se o Manuel não está neste torneio — caso contrário o
    // filtro esconde-o e nunca aparece.
    if (filterManuel && !found.players.some(p => isManuel(p))) setFilterManuel(false);
    // Limpar filtros regionais/escalão que possam estar a esconder o torneio
    if (regionFilter && found.region !== regionFilter) setRegionFilter(null);
    if (escFilter.length > 0) setEscFilter([]);
    // O ano por defeito é o mais recente: um deep-link para outro ano ficava
    // escondido e a página abria outro torneio (ex.: links da /draws para 2023).
    const fYear = (found.date || "").slice(0, 4);
    if (fYear && activeYear !== fYear) setYearFilter(fYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, data]);

  // ── Deep-link: sync URL (:tkey) → selectedGroupKey + roundIdx ──────────
  // `/drive/torneio/{ccode}-{tcode}` → procura o torneio na lista filtrada
  // e selecciona o grupo/entry correspondente. Corre quando `filteredGroups`
  // termina de carregar e sempre que o tkey da URL muda.
  useEffect(() => {
    if (!urlTkey || filteredGroups.length === 0) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    for (const g of filteredGroups) {
      // Match exacto primeiro (preserva ronda/escalão específico no URL).
      let entryIdx = g.entries.findIndex(e =>
        e.ccode === ccode && (
          e.tcode === tcode ||
          (e.tcode || "").split("+").includes(tcode)
        )
      );
      // Fallback por tcode base (sem sufixo _R{n}/_Total) — para hrefs canónicos
      // da sidebar de eventos multi-ronda, onde as entries são "_Total".
      if (entryIdx < 0) {
        entryIdx = g.entries.findIndex(e => {
          const base = stripRoundSuffix(e.tcode);
          return e.ccode === ccode && (base === tcode || base.split("+").includes(tcode));
        });
      }
      if (entryIdx >= 0) {
        if (selectedGroupKey !== g.key) setSelectedGroupKey(g.key);
        if (roundIdx !== entryIdx) setRoundIdx(entryIdx);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, filteredGroups]);

  // ── Deep-link: sync estado (torneio seleccionado) → URL ────────────────
  // Quando o utilizador muda de torneio (clica na sidebar ou nas tabs de
  // ronda/escalão), actualizar a URL para `/drive/torneio/{ccode}-{tcode}`
  // com `replace: true` (não pollui o histórico). Não há loop: o useEffect
  // URL→estado acima só dispara setters quando `idx !== selected`, e
  // navegar para a URL actual é no-op.
  useEffect(() => {
    if (!curTournament || !curTournament.ccode || !curTournament.tcode) return;
    const target = tournamentUrl("drive", curTournament.ccode, curTournament.tcode);
    if (target && location.pathname !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curTournament]);

  if (loading) return <LoadingState />;
  if (error)   return <div className="jogadores-page"><div className="notice-error" style={{ margin: 16 }}>Erro: {error}</div></div>;
  if (!data)   return null;

  const allSources: DataSource[] = [...monthlyMeta, ...admissionsMeta];
  const providerTournaments = (data?.tournaments ?? []).map(t => ({
    _sourceFile: (t as any)._sourceFile,
    name: t.name,
    date: t.date,
    tcode: t.tcode,
    ccode: t.ccode,
  }));
  // Controlos da barra — partilhados entre a barra do CircuitShell (Torneios)
  // e a barra própria (Rankings Sub-12).
  const driveLead = (<>
          <ToolbarTitle>🏁 DRIVE</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          <a href="https://competicoes.fpg.pt/ranking/" target="_blank" rel="noopener noreferrer"
            className="p p-sm" style={{ textDecoration: "none", background: "var(--bg-muted)", color: "var(--accent)", border: "1px solid var(--border)" }}
            title="Rankings oficiais da FPG (competicoes.fpg.pt)">🏆 Rankings FPG</a>
          <ToolbarSep />
          <TabRow
            style={{ marginBottom: 0 }}
            tabs={[
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-sub12", label: "🏅 Rankings" },
            ]}
            active={navMode}
            onChange={(k) => { setNavMode(k as typeof navMode); setSeries("tour"); setYearFilter(null); setSelectedGroupKey(null); setRoundIdx(0); }}
          />
          {navMode === "torneios" && (<>
            <ToolbarSep />
            <TabRow
              style={{ marginBottom: 0 }}
              tabs={[
                { key: "all",       label: "Todos" },
                { key: "tour",      label: "🏌️ Tour", count: countTour },
                { key: "challenge", label: "⚡ Challenge", count: countChall },
                { key: "aquapor",   label: "💧 AQUAPOR", count: countAquapor },
              ]}
              active={series}
              onChange={(k) => { const kk = k as typeof series; setSeries(kk); setRegionFilter(null); setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); if (kk === "all" && !yearFilter) setYearFilter(availYears[0] ?? null); }}
            />
            {availYears.length > 1 && (<>
              <ToolbarSep />
              {/* Anos: o mesmo interruptor segmentado das vistas. */}
              <div className="segmented-toggle" role="tablist" aria-label="Ano">
                {availYears.map(y => (
                  <button key={y} role="tab" aria-selected={activeYear === y}
                    className={"seg-btn" + (activeYear === y ? " active" : "")}
                    onClick={() => { setYearFilter(y === activeYear && availYears.length > 1 ? null : y); setSelectedGroupKey(null); setRoundIdx(0); }}>
                    <span className="seg-label">{y}</span>
                  </button>
                ))}
              </div>
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : " tourn-tab-muted")}
                onClick={() => setFilterManuel(v => !v)}
                style={filterManuel
                  ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" }
                  : { flexShrink: 0, whiteSpace: "nowrap" }}>
                ★ Manuel
              </button>
            </>)}
          </>)}
  </>);
  const driveBelow = (<>
        {/* Linha 2: regiões + escalões. Quebra para a linha seguinte (todos os
            botões ao mesmo nível, alinhados à esquerda) — antes, em desktop,
            a linha não quebrava e os escalões embrulhavam-se sozinhos no meio
            do ecrã ao estreitar a janela (14/10/2026). */}
        {navMode === "torneios" && (availRegions.length > 1 || availEscs.length > 0) && (
          <div style={{
            display: "flex", alignItems: "center", gap: md.isMobile ? 4 : 6,
            padding: "4px 12px 6px",
            flexWrap: "wrap", rowGap: 4,
            borderTop: "1px solid var(--border-light)",
          }}>
            {availRegions.length > 1 && (<>
              <button className={"tourn-tab tourn-tab-sm shrink-0" + (regionFilter === null ? " active" : "")}
                onClick={() => setRegionFilter(null)}>
                {md.isMobile ? `Todas ${countEvents(seriesT)}` : `Todas (${countEvents(seriesT)})`}
              </button>
              {availRegions.map(reg => {
                const rt = seriesT.filter(t => t.region === reg.id);
                const nT = countEvents(rt);
                const nJ = uniquePC(rt);
                return (
                  <button key={reg.id}
                    className={"tourn-tab tourn-tab-sm" + (regionFilter === reg.id ? " active" : " tourn-tab-muted")}
                    onClick={() => setRegionFilter(reg.id)}
                    style={{ flexShrink: 0 }}>
                    {md.isMobile
                      ? `${reg.label} ${nT}·${nJ}`
                      : `${reg.emoji} ${reg.label} (${nT}T · ${nJ} jog)`}
                  </button>
                );
              })}
              <ToolbarSep />
            </>)}
            {/* Não é o mesmo que o filtro da tabela: este refaz a classificação
                só com o(s) escalão(ões) escolhido(s). */}
            <span className="fs-11 muted shrink-0" title="Classificação só com estes escalões (as posições são recalculadas)">Classificação:</span>
            <button className={"tourn-tab tourn-tab-sm shrink-0" + (escFilter.length === 0 ? " active" : " tourn-tab-muted")}
              onClick={() => setEscFilter([])}>
              {md.isMobile ? `Todos ${uniquePCRegion}` : `Todos (${uniquePCRegion} jog)`}
            </button>
            <FilterPills
              items={(["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"] as const).map(e => ({
                key: e,
                label: e,
                disabled: !availEscs.includes(e),
              }))}
              active={escFilter}
              onToggle={(e) => setEscFilter(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
              style={{ display: "contents" }}
            />
          </div>
        )}
  </>);

  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="jogadores-page">

      {/* Uma só barra (13/10/2026): em «Torneios» os controlos da página entram
          na barra do CircuitShell (CircuitToolbarSlotCtx); nos Rankings Sub-12
          a página mantém a sua barra. */}
      {navMode !== "torneios" && (
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
          {driveLead}
          <div className="flex-1" style={{ minWidth: 8 }} />
        </Toolbar>
      </div>
      )}

      {/* ══════════════════════════════════════════
          MODO SUB-12
          ══════════════════════════════════════════ */}
      {navMode === "ranking-sub12" && (
        <MasterDetail md={md} sidebar={<>
            {/* Séries */}
            <div className="sidebar-section-title">Série</div>
            {SUB12_SERIES_TABS.map(s => {
              const c = sub12Counts[s.key];
              // Série sem jogadores no escalão escolhido: mostrar ESBATIDA em
              // vez de esconder — esconder fazia parecer que a série tinha
              // sido removida ao trocar de escalão (ex: AQUAPOR sem Sub 14).
              const empty = !c || c.players === 0;
              const active = sub12Series === s.key;
              return (
                <button key={s.key}
                  className={`course-item ${active ? "active" : ""}`}
                  style={empty ? { opacity: 0.45 } : undefined}
                  onClick={() => { setSub12Series(s.key); setSub12View("grid"); setSub12Player(null); md.onSelect(); }}>
                  <div className="course-item-name">{s.emoji} {s.label}</div>
                  <div className="course-item-sub">
                    {empty ? `sem jogadores${sub12Esc === "all" ? "" : ` ${sub12Esc}`}` : `${c.tourns} torneios · ${c.players} jog · ${s.holes}`}
                  </div>
                </button>
              );
            })}

            {/* Vistas */}
            <div className="sidebar-section-title mt-8">Vista</div>
            {(["grid", "ranking", "evolucao"] as Sub12ViewTab[]).map(v => {
              const labels: Record<Sub12ViewTab, string> = { grid: "📊 Tabela", ranking: "🏆 Ranking", evolucao: "📈 Evolução" };
              return (
                <button key={v}
                  className={`course-item ${sub12View === v ? "active" : ""}`}
                  onClick={() => { setSub12View(v); md.onSelect(); }}>
                  <div className="course-item-name">{labels[v]}</div>
                </button>
              );
            })}

            {/* Filtros compactos */}
            <div className="sidebar-section-title mt-8">Filtros</div>
            <div className="flex-col gap-4" style={{ padding: "4px 8px", display: "flex" }}>
              <select className="select w-full fs-11" value={sub12Esc}
                onChange={e => { setSub12Esc(e.target.value); setSub12Player(null); }}>
                <option value="all">Todos os escalões</option>
                {ESCALOES.map(esc => <option key={esc} value={esc}>{esc}</option>)}
              </select>
              {sub12AvailRegions.length > 0 && (
                <select className="select w-full fs-11" value={sub12Region} onChange={e => setSub12Region(e.target.value)}>
                  <option value="all">Todas as zonas</option>
                  {sub12AvailRegions.map(z => <option key={z} value={z}>{regionLabel(z)}</option>)}
                </select>
              )}
              <select className="select w-full fs-11" value={sub12Sex} onChange={e => setSub12Sex(e.target.value)}>
                <option value="all">Ambos os sexos</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
              <input className="input w-full fs-11"  style={{ boxSizing: "border-box" }}
                value={sub12Search} onChange={e => setSub12Search(e.target.value)} placeholder="Nome, clube…" />
            </div>

            <div className="muted fs-10" style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)", marginTop: 8 }}>
              {sub12EscLabel} · scoring.datagolf.pt
            </div>
        </>}>
            <div>

              {/* Detalhe jogador (se aberto) */}
              {sub12Player && (
                <div className="mt-12">
                  <PlayerDetail row={sub12Player} onClose={() => setSub12Player(null)} />
                </div>
              )}

              {/* Calendário no topo */}
              <div className="mt-12">
                <UpcomingSchedule series={sub12Series} />
              </div>

              <div className="card mt-8">
                {/* Header do card igual ao Resumo */}
                <div className="h-md">
                  {sub12View === "grid" ? "📊" : sub12View === "ranking" ? "🏆" : "📈"}{" "}
                  {sub12View === "grid" ? "Tabela" : sub12View === "ranking" ? "Ranking" : "Evolução SD"}{" "}
                  — {sub12EscLabel} {SUB12_SERIES_TABS.find(s => s.key === sub12Series)?.label} {activeYear ?? ""}
                </div>
                <div className="muted fs-11 mb-8">
                  {sub12KpiPlayers} jogadores · {sub12KpiRounds} rondas
                  {sub12KpiBestSD != null && <> · Best SD <span style={{ fontWeight: 700, color: sub12KpiBestSD <= 25 ? "var(--color-good)" : "var(--text)" }}>{sub12KpiBestSD.toFixed(1)}</span></>}
                  {sub12KpiBest != null && <> · Melhor gross <span style={{ fontWeight: 700, color: "var(--color-good-dark)" }}>{sub12KpiBest}</span></>}
                </div>

                {/* Conteúdo */}
                {sub12View === "grid"     && <TournamentGrid rows={sub12Filtered} allTournaments={sub12Tourns} onPlayerClick={handleSub12PlayerClick} playersDB={pdb} escLookup={escLookup} />}
                {sub12View === "ranking"  && <RankingView    rows={sub12Filtered} onPlayerClick={handleSub12PlayerClick} />}
                {sub12View === "evolucao" && <EvolutionChart rows={sub12Filtered} />}
              </div>
            </div>
        </MasterDetail>
      )}

      {/* ══════════════════════════════════════════
          MODO NORMAL (Tour / Challenge / AQUAPOR)
          ══════════════════════════════════════════ */}
      {navMode === "torneios" && (
        <CircuitToolbarSlotCtx.Provider value={{ lead: driveLead, below: driveBelow, hideTitle: true }}>
        <CircuitShell entries={driveEntries} pastEditionsPool={driveEditionsPool} config={{ ...DRIVE_CONFIG, color: "var(--color-good-dark)", textColor: "#fff", filters: { search: true } }} loading={loading}
          selectedId={selectedDriveId ?? undefined}
          onSelectEntry={(e) => setSelectedDriveId(e.id)} />
        </CircuitToolbarSlotCtx.Provider>
      )}


    </div>
    </DataSourcesProvider>
  );
}

export default function DrivePage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <DriveContent />;
}
