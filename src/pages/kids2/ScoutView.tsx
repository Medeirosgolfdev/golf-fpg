/**
 * kids2/ScoutView.tsx
 *
 * /kids2/scout/:tid — "field scout" view. Lista todos os juniors num torneio
 * (passado ou futuro), cruzados com Manuel. Mostra: bandeira, nome, idade
 * actual, tier, melhor pos histórica, último resultado, confrontos prévios
 * com Manuel.
 *
 * O torneio pode ser:
 *   - histórico: já tem flights/results no canónico
 *   - futuro: pode ter field/inscritos via FPG admissions ou USKids field
 *
 * Para a v1, lê só do canónico. Quando integrarmos admissions/field, mostra
 * inscritos confirmados também.
 */

import React, { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useJuniorsCanonical, computeTier, getTierLabel, getTierColors, getSharedTournamentIds } from "./data";
import type { CanonicalData, Junior, Tournament, Result, Flight } from "./data";
import { flag as flagOf } from "../../utils/flagUtils";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";

type ScoutKey = "name" | "country" | "age" | "tier" | "pos" | "vsM" | "form";

interface ScoutRow {
  junior: Junior;
  flight: Flight;
  result: Result | null;     // se já tem resultado (passado)
  age: number | null;
  tier: ReturnType<typeof computeTier>;
  bestPos: number | null;
  recentPos: number | null;
  vsMTotal: number | null;   // soma de margens vs Manuel em torneios partilhados
  vsMCount: number;          // confrontos vs Manuel
}

export default function ScoutView() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <ScoutViewContent />;
}

function ScoutViewContent() {
  const status = useJuniorsCanonical();
  const params = useParams<{ tid: string }>();
  const navigate = useNavigate();

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={`Falhou: ${status.error}`} />;

  const data = status.data;
  const tid = params.tid || "";
  const tournament = data.tournamentById.get(tid);

  if (!tournament) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ color: "var(--text-3)" }}>Torneio <code>{tid}</code> não encontrado.</p>
        <Link to="/kids2" style={{ color: "var(--color-info)" }}>← voltar</Link>
      </div>
    );
  }

  return <ScoutContent data={data} tournament={tournament} onSelect={(jid) => navigate(`/kids2/${jid}`)} />;
}

function ScoutContent({ data, tournament, onSelect }: {
  data: CanonicalData; tournament: Tournament; onSelect: (jid: string) => void;
}) {
  const manuel = data.manuel;
  const today = new Date().toISOString().slice(0, 10);
  const tDate = tournament.date || tournament.startDate || "";
  const isFuture = tDate > today;

  // Flight do Manuel (para filtro default)
  const manuelFlightKey = useMemo(() => {
    if (!manuel) return null;
    const f = tournament.flights.find((ff) => ff.results.some((r) => r.juniorId === manuel.id));
    return f?.flightKey || null;
  }, [tournament, manuel]);

  // Filtro de flight (default: flight do Manuel se ele estiver, senão todos)
  const [flightFilter, setFlightFilter] = useState<string>(manuelFlightKey || "all");

  // Compor rows a partir dos flights
  const rows = useMemo<ScoutRow[]>(() => {
    const out: ScoutRow[] = [];
    for (const f of tournament.flights) {
      if (flightFilter !== "all" && f.flightKey !== flightFilter) continue;
      for (const r of f.results) {
        const junior = data.juniorById.get(r.juniorId);
        if (!junior) continue;
        if (manuel && junior.id === manuel.id) continue; // não nos listamos a nós

        // age
        let age: number | null = null;
        if (junior.dob) {
          const [y, m, d] = junior.dob.split("-").map(Number);
          if (y && m && d) {
            const today = new Date();
            age = today.getFullYear() - y;
            if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
          }
        }

        // best pos / recent pos (excluindo este torneio se for futuro)
        let bestPos: number | null = null;
        let recentPos: number | null = null;
        let recentDate = "";
        for (const tid2 of junior.tournamentIds) {
          if (tid2 === tournament.id) continue;
          const t2 = data.tournamentById.get(tid2);
          if (!t2) continue;
          for (const f2 of t2.flights) {
            const r2 = f2.results.find((x) => x.juniorId === junior.id);
            if (!r2 || typeof r2.pos !== "number") continue;
            if (bestPos === null || r2.pos < bestPos) bestPos = r2.pos;
            const d2 = t2.date || t2.startDate || "";
            if (d2 > recentDate) { recentDate = d2; recentPos = r2.pos; }
          }
        }

        // vs Manuel: soma de margens em torneios partilhados
        let vsMTotal: number | null = null;
        let vsMCount = 0;
        if (manuel) {
          const shared = getSharedTournamentIds(junior, manuel);
          let sum = 0; let n = 0;
          for (const stid of shared) {
            const t2 = data.tournamentById.get(stid);
            if (!t2) continue;
            for (const f2 of t2.flights) {
              const rJ = f2.results.find((x) => x.juniorId === junior.id);
              const rM = f2.results.find((x) => x.juniorId === manuel.id);
              if (rJ?.totalGross != null && rM?.totalGross != null) {
                sum += rJ.totalGross - rM.totalGross;
                n++;
              }
            }
          }
          if (n > 0) { vsMTotal = sum / n; vsMCount = n; }
        }

        out.push({
          junior, flight: f,
          result: isFuture ? null : r,
          age,
          tier: computeTier(junior, data.tournamentById),
          bestPos, recentPos,
          vsMTotal, vsMCount,
        });
      }
    }
    // dedup por junior id (caso esteja em múltiplos flights — raro)
    const seen = new Set<string>();
    return out.filter((r) => {
      if (seen.has(r.junior.id)) return false;
      seen.add(r.junior.id);
      return true;
    });
  }, [data, tournament, manuel, isFuture, flightFilter]);

  // Manuel card + 3 KPIs (Acima/Mesmo/Abaixo nível)
  const manuelStats = useMemo(() => {
    if (!manuel) return null;
    // best round avg do Manuel para comparar com rivais
    let manuelAvg: number | null = null;
    const grossList: number[] = [];
    for (const tid of manuel.tournamentIds) {
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === manuel.id);
        if (typeof r?.totalGross === "number" && r.rounds?.length) {
          grossList.push(r.totalGross / r.rounds.length);
        }
      }
    }
    if (grossList.length >= 3) {
      grossList.sort((a, b) => a - b);
      // mediana
      manuelAvg = grossList[Math.floor(grossList.length / 2)];
    }

    // tee time do Manuel neste torneio (se disponível em rounds — não temos pairings ainda)
    const inTournament = tournament.flights.some((f) => f.results.some((r) => r.juniorId === manuel.id));

    return { manuelAvg, inTournament };
  }, [data, manuel, tournament]);

  const levelKPIs = useMemo(() => {
    if (!manuel || !manuelStats?.manuelAvg) return null;
    const m = manuelStats.manuelAvg;
    let above = 0, same = 0, below = 0;
    for (const row of rows) {
      // Avg do rival
      const grossList: number[] = [];
      for (const tid of row.junior.tournamentIds) {
        const t = data.tournamentById.get(tid);
        if (!t) continue;
        for (const f of t.flights) {
          const r = f.results.find((x) => x.juniorId === row.junior.id);
          if (typeof r?.totalGross === "number" && r.rounds?.length) {
            grossList.push(r.totalGross / r.rounds.length);
          }
        }
      }
      if (grossList.length < 3) continue;
      grossList.sort((a, b) => a - b);
      const avg = grossList[Math.floor(grossList.length / 2)];
      const delta = avg - m;
      if (delta < -3) above++;
      else if (delta > 3) below++;
      else same++;
    }
    return { above, same, below };
  }, [data, manuel, manuelStats, rows]);

  // Ordenação
  const { sortKey, sortDir, toggleSort } = useSort<ScoutKey>(isFuture ? "tier" : "pos", "asc", {
    name: "asc", country: "asc", age: "asc", tier: "asc", pos: "asc", vsM: "asc", form: "asc",
  });

  const sorted = useMemo(() => {
    const arr = [...rows];
    const sign = sortDir === "asc" ? 1 : -1;
    const TIER_RANK: Record<string, number> = { elite: 0, strong: 1, solid: 2, developing: 3, beginner: 4 };
    const safe = (v: any) => (typeof v === "number" ? v : Number.POSITIVE_INFINITY);
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":    return sign * a.junior.canonicalName.localeCompare(b.junior.canonicalName);
        case "country": return sign * ((a.junior.country || "").localeCompare(b.junior.country || ""));
        case "age":     return sign * (safe(a.age) - safe(b.age));
        case "tier":    return sign * ((TIER_RANK[a.tier || "beginner"] ?? 5) - (TIER_RANK[b.tier || "beginner"] ?? 5));
        case "pos":     return sign * (safe(a.result?.pos) - safe(b.result?.pos));
        case "vsM":     return sign * (safe(a.vsMTotal) - safe(b.vsMTotal));
        case "form":    return sign * (safe(a.recentPos) - safe(b.recentPos));
        default: return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const manuelInTournament = !!manuel && tournament.flights.some((f) => f.results.some((r) => r.juniorId === manuel.id));

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Link to="/kids2" style={{ fontSize: 13, color: "var(--color-info)" }}>← KIDS2</Link>
        <span style={{ color: "var(--text-3)" }}>·</span>
        <Link to="/kids2/next-t" style={{ fontSize: 13, color: "var(--color-info)" }}>Próximos torneios</Link>
      </div>

      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--text)" }}>
        🔭 Field Scout
      </h2>
      <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 14 }}>
        <strong>{tournament.name || tournament.shortName || tournament.id}</strong>
        {tDate && <span> · {fmtDate(tDate)}</span>}
        {tournament.course && <span> · {tournament.course}</span>}
        {isFuture && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--bg-info-subtle, #eff6ff)", color: "var(--color-info-dark, #1e3a8a)" }}>FUTURO</span>}
      </div>

      {/* Pills por flight */}
      {tournament.flights.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          <button onClick={() => setFlightFilter("all")} style={flightPillStyle(flightFilter === "all")}>
            Todos · {tournament.flights.reduce((acc, f) => acc + f.results.length, 0)}
          </button>
          {tournament.flights.map((f) => {
            const isManuelFlight = !!manuel && f.results.some((r) => r.juniorId === manuel.id);
            return (
              <button key={f.flightKey} onClick={() => setFlightFilter(f.flightKey)} style={flightPillStyle(flightFilter === f.flightKey, isManuelFlight)}>
                {f.label} · {f.results.length}{isManuelFlight && " · ⚔️ Manuel"}
              </button>
            );
          })}
        </div>
      )}

      {/* Card verde com Manuel */}
      {manuel && manuelInTournament && (() => {
        const mFlight = tournament.flights.find((f) => f.results.some((r) => r.juniorId === manuel.id));
        const mResult = mFlight?.results.find((r) => r.juniorId === manuel.id);
        return (
          <div style={{
            background: "var(--bg-success-subtle, #ecfdf5)",
            border: "1px solid var(--border-success, #97c459)",
            borderRadius: 8, padding: "10px 12px", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 18 }}>⚔️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-good-darker, #173404)" }}>
                Manuel inscrito em {mFlight?.label || "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-good-dark)", marginTop: 2 }}>
                {isFuture
                  ? `${rows.length} ${rows.length === 1 ? "rival" : "rivais"} neste escalão`
                  : `Posição final #${mResult?.pos ?? "—"}${mResult?.totalGross ? ` · ${mResult.totalGross} gross` : ""}`}
              </div>
            </div>
            {manuelStats?.manuelAvg && (
              <div style={{ fontSize: 10, color: "var(--color-good-dark)", textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{manuelStats.manuelAvg.toFixed(1)}</div>
                <div>gross médio (mediana)</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 3 KPIs Acima / Mesmo / Abaixo */}
      {levelKPIs && manuel && manuelInTournament && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
          <KpiCard label="Acima do nível" value={levelKPIs.above} sub="≥ 3 strokes melhor (mediana)" tone="danger" />
          <KpiCard label="Mesmo nível" value={levelKPIs.same} sub="±3 strokes" tone="info" />
          <KpiCard label="Abaixo do nível" value={levelKPIs.below} sub="≥ 3 strokes pior" tone="good" />
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
        {rows.length} {isFuture ? "inscritos" : "participantes"}
        {flightFilter !== "all" && tournament.flights.length > 1 && <span> no escalão filtrado</span>}
        {manuelInTournament && manuel && flightFilter === "all" && <span style={{ marginLeft: 8, color: "var(--color-good-dark)" }}>· ⚔️ Manuel está no field</span>}
      </div>

      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <SortableHdr<ScoutKey> k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>País</SortableHdr>
              <SortableHdr<ScoutKey> k="name"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Nome</SortableHdr>
              <SortableHdr<ScoutKey> k="age"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, textAlign: "center", width: 50 }}>Idade</SortableHdr>
              <SortableHdr<ScoutKey> k="tier"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 110 }}>Tier</SortableHdr>
              <th style={{ ...thStyle, width: 56, textAlign: "center" }}>Best pos</th>
              <SortableHdr<ScoutKey> k="form"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 80, textAlign: "center" }}>Última pos</SortableHdr>
              {!isFuture && <SortableHdr<ScoutKey> k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 60, textAlign: "center" }}>Pos</SortableHdr>}
              {manuel && <SortableHdr<ScoutKey> k="vsM" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 70, textAlign: "right" }}>diff M (média)</SortableHdr>}
              {manuel && <th style={{ ...thStyle, width: 36, textAlign: "center" }}>×M</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.junior.id}
                style={{ borderBottom: "1px solid var(--border-light)", cursor: "pointer" }}
                onClick={() => onSelect(row.junior.id)}
                title="Abrir perfil"
              >
                <td style={tdStyle}>{flagOf(row.junior.country || row.junior.nationality || "")} {row.junior.country || row.junior.nationality || "—"}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text)" }}>
                  {row.junior.canonicalName}
                  {row.flight && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>· {row.flight.label}</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-2)" }}>{row.age != null ? row.age : "—"}</td>
                <td style={tdStyle}>
                  {row.tier ? (() => {
                    const c = getTierColors(row.tier);
                    return <span style={{ background: c.bg, color: c.fg, fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 700, border: `1px solid ${c.fg}` }}>{getTierLabel(row.tier)}</span>;
                  })() : <span style={{ color: "var(--text-3)", fontSize: 10 }}>—</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{row.bestPos != null ? `#${row.bestPos}` : "—"}</td>
                <td style={{ ...tdStyle, textAlign: "center", color: row.recentPos != null && row.recentPos <= 3 ? "var(--medal-gold-strong)" : undefined }}>
                  {row.recentPos != null ? `#${row.recentPos}` : "—"}
                </td>
                {!isFuture && (
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                    {row.result?.pos != null ? `#${row.result.pos}` : "—"}
                  </td>
                )}
                {manuel && (
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: row.vsMTotal == null ? "var(--text-3)" : row.vsMTotal > 0 ? "var(--color-danger-dark)" : row.vsMTotal < 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                    {row.vsMTotal == null ? "—" : row.vsMTotal === 0 ? "0" : row.vsMTotal > 0 ? `+${row.vsMTotal.toFixed(1)}` : row.vsMTotal.toFixed(1)}
                  </td>
                )}
                {manuel && <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-3)" }}>{row.vsMCount || "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer" };
const tdStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: "var(--text-2)" };

function flightPillStyle(active: boolean, isManuelFlight = false): React.CSSProperties {
  const accent = isManuelFlight ? "var(--color-good-dark)" : "var(--color-info-dark, #1e3a8a)";
  return {
    fontSize: 11, fontWeight: 600,
    padding: "4px 10px", borderRadius: 999,
    border: `1px solid ${active ? accent : "var(--border)"}`,
    background: active ? accent : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer", lineHeight: 1.4,
  };
}

function KpiCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "good" | "info" | "danger" }) {
  // tone="good" NÃO usa --color-good-dark (verde — reservado ao Manuel).
  // Usa medal-gold-strong sobre bg-muted para indicar "stat positivo" do junior.
  const bg = tone === "danger" ? "var(--bg-warn-subtle, #fffbeb)" : tone === "info" ? "var(--bg-info-subtle, #eff6ff)" : "var(--bg-muted)";
  const fg = tone === "danger" ? "var(--color-warn-dark, #92400e)" : tone === "info" ? "var(--color-info-dark, #1e3a8a)" : "var(--medal-gold-strong)";
  return (
    <div style={{ background: bg, padding: "8px 10px", borderRadius: 6, border: `1px solid ${fg}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: fg, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: fg, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: fg, opacity: 0.7, marginTop: 1 }}>{sub}</div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}
