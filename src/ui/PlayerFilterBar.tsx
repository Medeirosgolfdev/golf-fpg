/**
 * PlayerFilterBar.tsx — Filter bar for player lists
 *
 * Extracted from LeaderboardComponents.tsx
 */
import React, { useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Player, PlayerFilter } from "../data/fpgTypes";
import { resolveEsc, filterPlayers } from "../data/fpgUtils";
import { toggleArr } from "../utils/mathUtils";
import { EMPTY_FILTER } from "./multiRoundTypes";
import { ESC_STYLE } from "./PillBadge";
import FilterChip from "./FilterChip";
import { getTeeHex } from "../utils/teeColors";
import type { PlayersDB } from "./tournamentPrimitives";
import { useFedBirthdates } from "./InscricoesComponents";

export function PlayerFilterBar({
  players,
  filter,
  onChange,
  escLookup,
  playersDB,
  total,
  tournamentDate,
}: {
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
  const availEsc = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) {
      const e = resolveEsc(p, escLookup, { tournamentDate, playersDB, fedBirthdates });
      if (e) s.add(e);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [players, escLookup, playersDB, tournamentDate, fedBirthdates]);
  const availTees = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) if (p.teeName) s.add(p.teeName);
    return [...s].sort();
  }, [players]);
  const availClubs = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) if (p.club) s.add(p.club);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [players]);
  const isActive = filter.name || filter.escs.length || filter.tees.length || filter.club;
  const filtered = useMemo(
    () => filterPlayers(players, filter, escLookup, playersDB, { tournamentDate, fedBirthdates }),
    [players, filter, escLookup, playersDB, tournamentDate, fedBirthdates]
  );
  const hasOpts = availClubs.length > 1 || availEsc.length > 1 || availTees.length > 1;
  if (total < 8 && !isActive) return null;

  return (
    <div className="filter-bar">
      <div className="search-wrap">
        <span className="search-icon-abs">🔍</span>
        <input
          type="text"
          placeholder="Nome ou clube…"
          value={filter.name}
          onChange={(e) => onChange({ ...filter, name: e.target.value })}
          className="input-search"
          style={{ width: 140 }}
        />
      </div>
      {hasOpts && <span className="fs-11" style={{ color: "var(--border)" }}>|</span>}
      {availEsc.length > 1 &&
        availEsc.map((e) => {
          const k = e.toLowerCase().replace(/[\s-]/g, "");
          const s = ESC_STYLE[k];
          return (
            <FilterChip
              key={e}
              active={filter.escs.includes(e)}
              onClick={() => onChange({ ...filter, escs: toggleArr(filter.escs, e) })}
              color={s?.bg}
            >
              {e}
            </FilterChip>
          );
        })}
      {availTees.length > 1 &&
        availTees.map((t) => {
          const hex = getTeeHex(t);
          return (
            <FilterChip
              key={t}
              active={filter.tees.includes(t)}
              onClick={() => onChange({ ...filter, tees: toggleArr(filter.tees, t) })}
              color={hex}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className="tee-dot-sq" style={{ background: hex }} />
                {t}
              </span>
            </FilterChip>
          );
        })}
      {availClubs.length > 2 && (
        <select
          value={filter.club}
          onChange={(e) => onChange({ ...filter, club: e.target.value })}
          className="select-compact"
          style={{
            border: `1px solid ${filter.club ? "var(--accent)" : "var(--border)"}`,
            fontWeight: filter.club ? 700 : 400,
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
      {isActive && (
        <>
          <span className="fs-10 c-muted" style={{ marginLeft: 2 }}>
            {filtered.length} de {total}
          </span>
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="filter-clear-btn fs-10 c-muted"
          >
            ✕ limpar
          </button>
        </>
      )}
    </div>
  );
}
