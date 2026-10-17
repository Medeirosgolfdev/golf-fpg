/**
 * PlayerFilterBar.tsx — a barra de filtros de jogadores (pesquisa · escalões ·
 * tees · clube · M/F · Nasc.) de todas as tabelas: Scorecards, Resumo
 * multi-ronda, Inscrições e Draw. Uma só barra visual (`FilterBarView`) e duas
 * entradas que só calculam as opções disponíveis:
 *   • `PlayerFilterBar` — jogadores FPG do ScorecardLB (escalão histórico à data)
 *   • `RowsFilterBar`   — linhas `MultiRoundRow` (MultiRoundLeaderboard, Inscrições,
 *                         Draw, Scorecards de todas as voltas)
 */
import { useMemo } from "react";
import { normLoose } from "../utils/normName";
import { birthYearOf } from "../utils/format";
import type { EscLookup } from "../utils/playerUtils";
import type { Player, PlayerFilter } from "../data/fpgTypes";
import { resolveEsc, filterPlayers } from "../data/fpgUtils";
import { toggleArr } from "../utils/mathUtils";
import { EMPTY_FILTER, type MultiRoundRow } from "./multiRoundTypes";
import { ESC_STYLE } from "./PillBadge";
import FilterChip from "./FilterChip";
import { getTeeHex } from "../utils/teeColors";
import type { PlayersDB } from "./tournamentPrimitives";
import { useFedBirthdates } from "./InscricoesComponents";

/* ── Sexo por nome (entradas kids:* do playersDB com sex) ── */

export function buildSexByName(playersDB?: PlayersDB): Map<string, string> {
  const m = new Map<string, string>();
  if (!playersDB) return m;
  for (const k in playersDB) {
    const e = (playersDB as any)[k];
    if ((e?.sex === "M" || e?.sex === "F") && e?.name) {
      const nn = normLoose(e.name);
      if (!m.has(nn)) m.set(nn, e.sex);
    }
  }
  return m;
}

/** Sexo de um jogador: o do próprio (adapter da página), o do federado no
 *  playersDB, ou por nome no playersDB. */
function sexOf(own: string | null | undefined, fed: string | null | undefined, name: string | null | undefined,
  playersDB?: PlayersDB, byName?: Map<string, string>): "M" | "F" | undefined {
  const s = own || (fed && playersDB?.[fed]?.sex);
  if (s === "M" || s === "F") return s;
  const v = name && byName ? byName.get(normLoose(name)) : undefined;
  return v === "M" || v === "F" ? v : undefined;
}

/* ── Linhas (MultiRoundRow, ou só os campos que o filtro lê) ── */

export type FilterableRow = Pick<MultiRoundRow, "name" | "club" | "esc" | "teeName" | "sex" | "fed" | "dob">;

function rowBirthYear(row: FilterableRow, playersDB?: PlayersDB): number | null {
  return birthYearOf(row.dob || (row.fed ? (playersDB?.[row.fed] as any)?.dob ?? null : null));
}

export function filterRows<T extends FilterableRow>(rows: T[], f: PlayerFilter, playersDB?: PlayersDB, byName?: Map<string, string>): T[] {
  let ps = rows;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(r => r.name.toLowerCase().includes(q) || (r.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(r => r.esc != null && f.escs.includes(r.esc));
  if (f.tees.length) ps = ps.filter(r => r.teeName != null && f.tees.includes(r.teeName));
  if (f.club) ps = ps.filter(r => r.club === f.club);
  if (f.sex) ps = ps.filter(r => sexOf(r.sex, r.fed, r.name, playersDB, byName) === f.sex);
  if (f.birthYears && f.birthYears.length) ps = ps.filter(r => { const y = rowBirthYear(r, playersDB); return y != null && f.birthYears!.includes(y); });
  return ps;
}

const sortedStr = (it: Iterable<string>, locale?: string) => [...new Set(it)].sort((a, b) => a.localeCompare(b, locale));

export function RowsFilterBar({ rows, filter, onChange, total, playersDB }: {
  rows: FilterableRow[]; filter: PlayerFilter; onChange: (f: PlayerFilter) => void; total: number; playersDB?: PlayersDB;
}) {
  const sexByName = useMemo(() => buildSexByName(playersDB), [playersDB]);
  const opts = useMemo(() => ({
    escs: sortedStr(rows.flatMap(r => r.esc ? [r.esc] : [])),
    tees: [...new Set(rows.flatMap(r => r.teeName ? [r.teeName] : []))].sort(),
    clubs: sortedStr(rows.flatMap(r => r.club ? [r.club] : []), "pt"),
    sexes: [...new Set(rows.flatMap(r => { const s = sexOf(r.sex, r.fed, r.name, playersDB, sexByName); return s ? [s] : []; }))],
    years: [...new Set(rows.flatMap(r => { const y = rowBirthYear(r, playersDB); return y != null ? [y] : []; }))].sort((a, b) => a - b),
  }), [rows, playersDB, sexByName]);
  const shown = useMemo(() => filterRows(rows, filter, playersDB, sexByName).length, [rows, filter, playersDB, sexByName]);
  return <FilterBarView filter={filter} onChange={onChange} total={total} shown={shown} {...opts} />;
}

/* ── Jogadores FPG (ScorecardLB) ── */

export function PlayerFilterBar({ players, filter, onChange, escLookup, playersDB, total, tournamentDate }: {
  players: Player[];
  filter: PlayerFilter;
  onChange: (f: PlayerFilter) => void;
  escLookup: EscLookup;
  playersDB: PlayersDB;
  total: number;
  /** Data do torneio — para calcular escalão histórico na data. */
  tournamentDate?: string | null;
}) {
  const fedBirthdates = useFedBirthdates();
  const sexByName = useMemo(() => buildSexByName(playersDB), [playersDB]);
  const opts = useMemo(() => ({
    escs: sortedStr(players.flatMap(p => { const e = resolveEsc(p, escLookup, { tournamentDate, playersDB, fedBirthdates }); return e ? [e] : []; })),
    tees: [...new Set(players.flatMap(p => p.teeName ? [p.teeName] : []))].sort(),
    clubs: sortedStr(players.flatMap(p => p.club ? [p.club] : []), "pt"),
    sexes: [...new Set(players.flatMap(p => { const s = sexOf((p as any)._sex, p.fedCode, p.name, playersDB, sexByName); return s ? [s] : []; }))],
    years: [] as number[],
  }), [players, escLookup, playersDB, tournamentDate, fedBirthdates, sexByName]);
  const shown = useMemo(
    () => filterPlayers(players, filter, escLookup, playersDB, { tournamentDate, fedBirthdates }).length,
    [players, filter, escLookup, playersDB, tournamentDate, fedBirthdates]);
  return <FilterBarView filter={filter} onChange={onChange} total={total} shown={shown} {...opts} />;
}

/* ── A barra ── */

function FilterBarView({ filter, onChange, total, shown, escs, tees, clubs, sexes, years }: {
  filter: PlayerFilter; onChange: (f: PlayerFilter) => void; total: number; shown: number;
  escs: string[]; tees: string[]; clubs: string[]; sexes: ("M" | "F")[]; years: number[];
}) {
  const selYears = filter.birthYears || [];
  const isActive = !!(filter.name || filter.escs.length || filter.tees.length || filter.club || filter.sex || selYears.length);
  const hasOpts = clubs.length > 1 || escs.length > 1 || tees.length > 1 || sexes.length === 2 || years.length > 1;
  if (total < 8 && !isActive) return null;
  const sep = <span className="fs-11" style={{ color: "var(--border)" }}>|</span>;

  return (
    <div className="filter-bar">
      <div className="search-wrap">
        <span className="search-icon-abs">🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={filter.name}
          onChange={(e) => onChange({ ...filter, name: e.target.value })}
          className="input-search" style={{ width: 140 }} />
      </div>
      {hasOpts && sep}
      {escs.length > 1 && escs.map((e) => (
        <FilterChip key={e} active={filter.escs.includes(e)} color={ESC_STYLE[e.toLowerCase().replace(/[\s-]/g, "")]?.bg}
          onClick={() => onChange({ ...filter, escs: toggleArr(filter.escs, e) })}>{e}</FilterChip>
      ))}
      {tees.length > 1 && tees.map((t) => {
        const hex = getTeeHex(t);
        return (
          <FilterChip key={t} active={filter.tees.includes(t)} color={hex}
            onClick={() => onChange({ ...filter, tees: toggleArr(filter.tees, t) })}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="tee-dot-sq" style={{ background: hex }} />{t}
            </span>
          </FilterChip>
        );
      })}
      {clubs.length > 2 && (
        <select value={filter.club} onChange={(e) => onChange({ ...filter, club: e.target.value })} className="select-compact"
          style={{ border: `1px solid ${filter.club ? "var(--accent)" : "var(--border)"}`, fontWeight: filter.club ? 700 : 400 }}>
          <option value="">Todos os clubes</option>
          {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {sexes.length === 2 && (
        <>
          <FilterChip active={filter.sex === "M"} onClick={() => onChange({ ...filter, sex: filter.sex === "M" ? "" : "M" })} color="var(--badge-male, #2563eb)">M</FilterChip>
          <FilterChip active={filter.sex === "F"} onClick={() => onChange({ ...filter, sex: filter.sex === "F" ? "" : "F" })} color="var(--badge-female, #ec4899)">F</FilterChip>
        </>
      )}
      {years.length > 1 && (
        <>
          {sep}
          <span className="fs-10 c-muted fw-600">Nasc.</span>
          {years.map((y) => (
            <FilterChip key={y} active={selYears.includes(y)} onClick={() => onChange({ ...filter, birthYears: toggleArr(selYears, y) })}>{y}</FilterChip>
          ))}
        </>
      )}
      {isActive && (
        <>
          <span className="fs-10 c-muted" style={{ marginLeft: 2 }}>{shown} de {total}</span>
          <button onClick={() => onChange(EMPTY_FILTER)} className="filter-clear-btn fs-10 c-muted">✕ limpar</button>
        </>
      )}
    </div>
  );
}
