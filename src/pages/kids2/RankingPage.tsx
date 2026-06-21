/**
 * kids2/RankingPage.tsx
 *
 * /kids2/ranking/:year — ranking da coorte por ano de nascimento.
 */

import React, { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useJuniorsCanonical,
  computeRanking,
  computeCareerScore,
  getTierLabel,
  getTierColors,
  countWins,
  countTop3,
  type Junior,
  type Tournament,
  type RankingEntry,
  type TierKey,
} from "./data";
import { getTournWeight, formatStars } from "./tournWeight";
import { flag as flagOf } from "../../utils/flagUtils";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import Kids2SubNav from "./Kids2SubNav";
import { MANUEL_FED, MANUEL_BIRTH_YEAR } from "../../constants/manuel";

// ── Constantes ────────────────────────────────────────────────────────────────

const YEARS = Array.from({ length: 12 }, (_, i) => 2019 - i); // 2019..2008
type SexFilter = "M" | "F";
type SortKey = "rank" | "name" | "score" | "tourneys" | "wins";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  if (n === 1) return "1.º";
  if (n === 2) return "2.º";
  if (n === 3) return "3.º";
  return `${n}.º`;
}

function shortName(name: string): string {
  return name
    .replace("European Championship", "EC")
    .replace("World Championship", "WC")
    .replace("Venice Open", "Venice")
    .replace("Marco Simone Invitational", "Marco Simone")
    .replace("Rome Classic", "Rome")
    .replace("Red White & Blue Invitational", "RWB")
    .replace("Sandestin Championship", "Sandestin")
    .replace("Desert Shootout", "Desert")
    .replace("Mississippi State Invitational", "MS State")
    .replace("South Carolina State Invitational", "SC State")
    .replace(/Real Club de Golf\s+/, "")
    .replace(/20(\d{2})\b/, "'$1");
}

function posColor(pos: number | null | undefined): string {
  if (pos === 1) return "#b45309";
  if (pos === 2) return "#6b7280";
  if (pos === 3) return "#92400e";
  if (pos != null && pos <= 10) return "var(--color-info-dark, #1e3a8a)";
  return "var(--text-3)";
}

function posBg(pos: number | null | undefined): string {
  if (pos === 1) return "#fef3c7";
  if (pos === 2) return "#f3f4f6";
  if (pos === 3) return "#fde68a";
  if (pos != null && pos <= 10) return "var(--bg-info-subtle, #eff6ff)";
  return "transparent";
}

interface JourneyItem {
  tid: string;
  name: string;
  shortName: string;
  date: string;
  stars: number;
  pos: number | null;
  toPar: number | null;
  flightLabel: string;
}

function buildJourney(j: Junior, tournamentById: Map<string, Tournament>): JourneyItem[] {
  const items: JourneyItem[] = [];
  for (const tid of j.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === j.id);
      if (!r) continue;
      // Usar fieldSize do flight específico (igual a computeCareerScore)
      // para evitar inflação pela soma de todos os escalões do torneio.
      const flightFs = typeof f.fieldSize === "number" && f.fieldSize > 0
        ? f.fieldSize
        : f.results.length;
      const { stars } = getTournWeight(t, flightFs);
      items.push({
        tid,
        name: t.name || tid,
        shortName: shortName(t.name || tid),
        date: t.date || t.startDate || "",
        stars,
        pos: typeof r.pos === "number" ? r.pos : null,
        toPar: typeof r.toPar === "number" ? r.toPar : null,
        flightLabel: f.label || "",
      });
    }
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: TierKey }) {
  const c = getTierColors(tier);
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12,
      fontSize: "var(--fs-11)", fontWeight: 700,
      background: c.bg, color: c.fg, whiteSpace: "nowrap",
    }}>
      {getTierLabel(tier)}
    </span>
  );
}

function JourneyChip({ item }: { item: JourneyItem }) {
  return (
    <span
      title={`${item.name} | ${item.flightLabel} | ${formatStars(item.stars)}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "2px 7px", borderRadius: 8, fontSize: "var(--fs-11)",
        background: posBg(item.pos),
        color: posColor(item.pos),
        fontWeight: item.pos != null && item.pos <= 3 ? 700 : 500,
        border: "1px solid var(--border-subtle, #e5e7eb)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: 0.65, fontSize: "var(--fs-10)" }}>{item.shortName}</span>
      {item.pos != null && <span style={{ fontWeight: 700 }}>{ordinal(item.pos)}</span>}
      {item.toPar != null && item.toPar < 0 && (
        <span style={{ fontSize: "var(--fs-10)", opacity: 0.8 }}>{item.toPar}</span>
      )}
    </span>
  );
}

// ── Linha de jogador ──────────────────────────────────────────────────────────

function PlayerRow({
  rank, junior, entry, score, wins, top3, journey, isManuel,
}: {
  rank: number;
  junior: Junior;
  entry: RankingEntry;
  score: number;
  wins: number;
  top3: number;
  journey: JourneyItem[];
  isManuel: boolean;
}) {
  const country = junior.country || junior.nationality || "";
  const fl = flagOf(country) || "";
  const MEDALS = ["🥇", "🥈", "🥉"];

  // journey já vem ordenado desc por data (buildJourney); só torneios >3★
  const topItems = journey.filter((i) => i.stars > 3).slice(0, 8);

  return (
    <tr style={{ background: isManuel ? "var(--bg-success-subtle, #f0fdf4)" : undefined }}>
      {/* rank */}
      <td style={{ fontWeight: 800, fontSize: rank <= 3 ? "var(--fs-18)" : "var(--fs-14)", textAlign: "right", paddingRight: 6, whiteSpace: "nowrap" }}>
        {rank <= 3 ? MEDALS[rank - 1] : `#${rank}`}
      </td>

      {/* bandeira */}
      <td style={{ textAlign: "center", fontSize: "var(--fs-16)" }}>{fl}</td>

      {/* nome + tier + percurso */}
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          <Link
            to={`/kids2/${junior.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontWeight: 700, fontSize: "var(--fs-13)",
              color: isManuel ? "var(--color-good-dark)" : "var(--color-info)",
              textDecoration: "none",
            }}
          >
            {junior.canonicalName || junior.id}
            {isManuel && (
              <span style={{ marginLeft: 5, fontSize: "var(--fs-10)", fontWeight: 600, color: "var(--color-good-dark)" }}>← tu</span>
            )}
          </Link>
          <TierBadge tier={entry.tier} />
          {wins > 0 && (
            <span style={{ fontSize: "var(--fs-11)", color: "#b45309", fontWeight: 600 }}>{wins}× 🏆</span>
          )}
          {top3 > wins && (
            <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>Top3: {top3}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {topItems.length === 0 && (
            <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>sem resultados</span>
          )}
          {topItems.map((item, i) => <JourneyChip key={i} item={item} />)}
          {journey.length > topItems.length && (
            <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", alignSelf: "center" }}>
              +{journey.length - topItems.length}
            </span>
          )}
        </div>
      </td>

      {/* torneios */}
      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{journey.length}</td>

      {/* vitórias */}
      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{wins > 0 ? wins : "—"}</td>

      {/* score */}
      <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {score.toFixed(1)}
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 400 }}>p{entry.percentile}</div>
      </td>
    </tr>
  );
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CohortRow = {
  junior: Junior; entry: RankingEntry; score: number;
  wins: number; top3: number; journey: JourneyItem[]; isManuel: boolean;
};

// ── Página principal ──────────────────────────────────────────────────────────

export default function RankingPage() {
  const { year: yearParam } = useParams<{ year: string }>();
  const navigate = useNavigate();

  const yearStr = (yearParam || "").replace(/\D/g, "");
  const year = yearStr ? parseInt(yearStr, 10) : MANUEL_BIRTH_YEAR;

  const [sex, setSex] = React.useState<SexFilter>("M");
  const [q, setQ] = useState("");

  const status = useJuniorsCanonical();

  const rankingMap = useMemo(() => {
    if (status.kind !== "ready") return new Map<string, RankingEntry>();
    return computeRanking(status.data.juniors, status.data.tournamentById);
  }, [status]);

  const cohort = useMemo((): CohortRow[] => {
    if (status.kind !== "ready") return [];
    const { juniors, tournamentById } = status.data;
    const rows: CohortRow[] = [];
    const seenNames = new Set<string>();
    for (const j of juniors) {
      const entry = rankingMap.get(j.id);
      if (!entry || entry.birthYear !== year || entry.sex !== sex) continue;
      const nameKey = (j.canonicalName || j.id).toLowerCase().trim();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
      const score = computeCareerScore(j, tournamentById) ?? 0;
      rows.push({
        junior: j,
        entry,
        score,
        wins: countWins(j, tournamentById),
        top3: countTop3(j, tournamentById),
        journey: buildJourney(j, tournamentById),
        isManuel: j.id === "u630106" || (j.sources as any)?.fpg?.fedCode === MANUEL_FED,
      });
    }
    return rows;
  }, [status, rankingMap, year, sex]);

  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("rank", "desc");

  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = needle
      ? cohort.filter((r) => (r.junior.canonicalName || "").toLowerCase().includes(needle))
      : [...cohort];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "rank" || sortKey === "score") cmp = b.score - a.score;
      else if (sortKey === "name") cmp = (a.junior.canonicalName || "").localeCompare(b.junior.canonicalName || "");
      else if (sortKey === "tourneys") cmp = b.journey.length - a.journey.length;
      else if (sortKey === "wins") cmp = b.wins - a.wins;
      return sortDir === "asc" ? -cmp : cmp;
    });
    return arr;
  }, [cohort, sortKey, sortDir, q]);

  const manuelRow = cohort.find((r) => r.isManuel);

  const tierDist = useMemo(() => {
    const d: Partial<Record<TierKey, number>> = {};
    for (const r of cohort) d[r.entry.tier] = (d[r.entry.tier] || 0) + 1;
    return d;
  }, [cohort]);

  return (
    <>
      <Kids2SubNav />

      <div style={{ padding: "16px 20px" }}>

        {/* cabeçalho */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "var(--fs-18)", fontWeight: 600, color: "var(--text)" }}>
            🏆 Ranking {year} — {sex === "M" ? "Rapazes" : "Raparigas"}
          </h1>
          <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>
            {sorted.length}{q ? ` de ${cohort.length}` : ""} jogadores
          </span>
          {manuelRow && sex === "M" && (
            <span style={{ fontSize: "var(--fs-12)", color: "var(--color-good-dark)", fontWeight: 600 }}>
              Manuel: #{manuelRow.entry.rank} · p{manuelRow.entry.percentile}
            </span>
          )}
        </div>

        {/* filtros */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* sexo */}
          {(["M", "F"] as SexFilter[]).map((s) => (
            <span
              key={s}
              onClick={() => setSex(s)}
              className="p p-sm"
              style={{
                cursor: "pointer",
                background: sex === s ? "var(--accent)" : "var(--bg-muted)",
                color: sex === s ? "#fff" : "var(--text-2)",
                borderColor: sex === s ? "var(--accent)" : "var(--border-light)",
              }}
            >
              {s === "M" ? "Rapazes" : "Raparigas"}
            </span>
          ))}

          {/* separador */}
          <span style={{ width: 1, height: 20, background: "var(--border-light)", margin: "0 2px" }} />

          {/* anos */}
          {YEARS.map((y) => (
            <span
              key={y}
              onClick={() => navigate(`/kids2/ranking/${y}`)}
              className="p p-sm"
              style={{
                cursor: "pointer",
                background: y === year ? "var(--accent)" : "var(--bg-muted)",
                color: y === year ? "#fff" : "var(--text-2)",
                borderColor: y === year ? "var(--accent)" : "var(--border-light)",
              }}
            >
              {y}
            </span>
          ))}

          {/* search */}
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Nome do jogador…"
            style={{
              marginLeft: "auto", padding: "5px 10px", fontSize: "var(--fs-13)",
              border: "1px solid var(--border-light)", borderRadius: 6,
              background: "var(--bg-card)", color: "var(--text)", minWidth: 200,
            }}
          />
        </div>

        {/* tier pills */}
        {status.kind === "ready" && cohort.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {(["elite", "strong", "solid", "developing", "beginner"] as TierKey[]).map((t) => {
              const count = tierDist[t] || 0;
              if (count === 0) return null;
              const c = getTierColors(t);
              return (
                <span key={t} style={{
                  padding: "1px 8px", borderRadius: 10,
                  fontSize: "var(--fs-11)", fontWeight: 600,
                  background: c.bg, color: c.fg,
                }}>
                  {getTierLabel(t)} {count}
                </span>
              );
            })}
          </div>
        )}

        {/* estados */}
        {status.kind === "loading" && <LoadingState />}
        {status.kind === "error" && <EmptyState icon="⚠️" message={status.error} />}
        {status.kind === "ready" && cohort.length === 0 && (
          <EmptyState icon="🏌️" message={`Sem jogadores ranqueados na coorte ${year}.`} />
        )}
        {status.kind === "ready" && cohort.length > 0 && sorted.length === 0 && (
          <EmptyState icon="🔍" message={`Nenhum jogador encontrado para "${q}".`} />
        )}

        {/* tabela */}
        {status.kind === "ready" && sorted.length > 0 && (
          <>
            <table className="dtable">
              <thead>
                <tr>
                  <SortableHdr<SortKey> k="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right", width: 48 }}>#</SortableHdr>
                  <th style={{ width: 28 }} />
                  <SortableHdr<SortKey> k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  <SortableHdr<SortKey> k="tourneys" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center", width: 64 }}>Torn.</SortableHdr>
                  <SortableHdr<SortKey> k="wins" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center", width: 52 }}>Vit.</SortableHdr>
                  <SortableHdr<SortKey> k="score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right", width: 72 }}>Score</SortableHdr>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <PlayerRow
                    key={row.junior.id}
                    rank={row.entry.rank}
                    junior={row.junior}
                    entry={row.entry}
                    score={row.score}
                    wins={row.wins}
                    top3={row.top3}
                    journey={row.journey}
                    isManuel={row.isManuel}
                  />
                ))}
              </tbody>
            </table>

            <p style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginTop: 8, lineHeight: 1.5 }}>
              Score = top-5 resultados ponderados por qualidade do torneio (★1–5 × campo × posição × distância).
              Bónus de até ×1.5 quando score abaixo do par. Tier por percentil na coorte.
              Hover nos chips para ver nome completo + estrelas do torneio.
            </p>
          </>
        )}
      </div>
    </>
  );
}
