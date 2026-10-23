/**
 * kids2/RankingPage.tsx
 *
 * /kids2/ranking/:year — ranking da coorte por ano de nascimento.
 */

import TabRow from "../../ui/TabRow";
import React, { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useJuniorsCanonical,
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
import { RankingTable, type RankingCol } from "../../ui/ranking/RankingPage";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import Kids2SubNav from "./Kids2SubNav";
import { MANUEL_BIRTH_YEAR, isManuel } from "../../constants/manuel";
import { useScoutRanking } from "./useScoutRanking";

// ── Constantes ────────────────────────────────────────────────────────────────

const YEARS = Array.from({ length: 12 }, (_, i) => 2019 - i); // 2019..2008
type SexFilter = "M" | "F";

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
  if (pos === 1) return "var(--medal-gold-fg)";
  if (pos === 2) return "var(--medal-silver-fg)";
  if (pos === 3) return "var(--medal-bronze-fg)";
  if (pos != null && pos <= 10) return "var(--color-info-dark, #1e3a8a)";
  return "var(--text-3)";
}

function posBg(pos: number | null | undefined): string {
  if (pos === 1) return "var(--medal-gold-bg)";
  if (pos === 2) return "var(--medal-silver-bg)";
  if (pos === 3) return "var(--medal-bronze-bg)";
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

// ── Colunas (a RankingTable partilhada, a do EGR/WAGR/Drive/FPG) ─────────────

const MEDALS = ["🥇", "🥈", "🥉"];

/** Nome + tier + vitórias + o percurso (chips dos torneios >3★). */
function NameCell({ row }: { row: CohortRow }) {
  const { junior, entry, wins, top3, journey, isManuel } = row;
  // journey já vem ordenado desc por data (buildJourney); só torneios >3★
  const topItems = journey.filter((i) => i.stars > 3).slice(0, 8);
  return (
    <>
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
    </>
  );
}

const COLS: RankingCol<CohortRow>[] = [
  { key: "rank", label: "#", className: "num", sort: (r) => r.entry.rank, firstDir: "asc",
    cell: (r) => <span style={{ fontWeight: 800, fontSize: r.entry.rank <= 3 ? "var(--fs-18)" : "var(--fs-14)", whiteSpace: "nowrap" }}>
      {r.entry.rank <= 3 ? MEDALS[r.entry.rank - 1] : r.entry.rank}</span> },
  { key: "flag", label: "", cell: (r) => flagOf(r.junior.country || r.junior.nationality || "") || "",
    tdStyle: { textAlign: "center", fontSize: "var(--fs-16)" } },
  { key: "name", label: "Nome", sort: (r) => (r.junior.canonicalName || "").toLowerCase(), firstDir: "asc", cell: (r) => <NameCell row={r} /> },
  { key: "tourneys", label: "Torn.", className: "num", sort: (r) => r.journey.length, firstDir: "desc", cell: (r) => r.journey.length },
  { key: "wins", label: "Vit.", className: "num", sort: (r) => r.wins, firstDir: "desc", cell: (r) => r.wins > 0 ? r.wins : "—" },
  { key: "score", label: "Score", className: "num", sort: (r) => r.score, firstDir: "desc",
    cell: (r) => <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {r.score.toFixed(1)}
      <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 400 }}>p{r.entry.percentile}</div>
    </span> },
];

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
  // Ranking por coorte — calculado pelo agregador (juniors-scout.json, campo `r`).
  const rankingMap = useScoutRanking();

  const cohort = useMemo((): CohortRow[] => {
    if (status.kind !== "ready" || !rankingMap) return [];
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
        isManuel: isManuel({ fed: j.sources.fpg?.fed, memberId: j.sources.uskids?.memberId }),
      });
    }
    return rows;
  }, [status, rankingMap, year, sex]);

  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? cohort.filter((r) => (r.junior.canonicalName || "").toLowerCase().includes(needle))
      : cohort;
  }, [cohort, q]);

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
          {/* Sexo e ano: o interruptor segmentado do resto do site (14/10/2026). */}
          <TabRow active={sex} onChange={setSex}
            tabs={(["M", "F"] as SexFilter[]).map((s) => ({ key: s, label: s === "M" ? "Rapazes" : "Raparigas" }))} />
          <TabRow active={year} onChange={(y) => navigate(`/kids2/ranking/${y}`)}
            tabs={YEARS.map((y) => ({ key: y, label: String(y) }))} />

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
        {(status.kind === "loading" || (status.kind === "ready" && !rankingMap)) && <LoadingState />}
        {status.kind === "error" && <EmptyState icon="⚠️" message={status.error} />}
        {status.kind === "ready" && rankingMap && cohort.length === 0 && (
          <EmptyState icon="🏌️" message={`Sem jogadores ranqueados na coorte ${year}.`} />
        )}
        {status.kind === "ready" && cohort.length > 0 && sorted.length === 0 && (
          <EmptyState icon="🔍" message={`Nenhum jogador encontrado para "${q}".`} />
        )}

        {/* tabela */}
        {status.kind === "ready" && sorted.length > 0 && (
          <>
            <RankingTable rows={sorted} cols={COLS} rowKey={(r) => r.junior.id}
              defaultSort="score" defaultDir="desc"
              rowClassName={(r) => r.isManuel ? "row-manuel" : undefined} />

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
