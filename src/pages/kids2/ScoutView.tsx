/**
 * kids2/ScoutView.tsx
 *
 * /kids2/scout/:tid - field scout. 2 fontes:
 *
 *   1. Torneios canonicos (tid = tournament.id): junior history + tier + vsM
 *      calculados a partir do canonico.
 *   2. Torneios "field-only" (tid = "usk{tcode}"): le directamente
 *      /data/uskids-field.json e cruza nomes dos inscritos com os juniors
 *      canonicos (match por normName + aliases).
 *
 *      Jogadores do field que nao tem perfil canonico aparecem na lista com
 *      info basica (nome, pais, cidade) mas sem tier/history (gerados como
 *      synthetic stubs).
 */

import React, { useEffect, useMemo, useState } from "react";
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
import { cachedFetchJson } from "../../data/fetchCache";

const ICON_SCOPE = "🔭";
const ICON_BACK = "←";
const ICON_DOT = "·";
const ICON_SWORDS = "⚔️";

type ScoutKey = "name" | "country" | "age" | "tier" | "pos" | "vsM" | "form";

interface ScoutRow {
  junior: Junior;
  flight: Flight;
  result: Result | null;
  age: number | null;
  tier: ReturnType<typeof computeTier>;
  bestPos: number | null;
  recentPos: number | null;
  vsMTotal: number | null;
  vsMCount: number;
  /** True quando o junior nao tem perfil canonico (vem so do field). */
  fieldOnly?: boolean;
  /** Cidade vinda do field (so para field-only). */
  cidade?: string;
}

// uskids-field.json types

interface FieldPlayer { nome: string; pais?: string; cidade?: string; firstSeen?: string }
interface FieldEscalao {
  nome: string;
  age_group?: number;
  flight_id?: number;
  inscritos?: number;
  maximo?: number;
  jogadores?: FieldPlayer[] | null;
}
interface FieldTournament {
  t: number;
  name: string;
  date_inicio?: string;
  date_fim?: string;
  rondas?: number;
  campo?: string;
  total_inscritos?: number;
  escaloes?: FieldEscalao[];
}
interface FieldData { gerado_em?: string; torneios?: FieldTournament[] }

function useUskidsField(): FieldData | null {
  const [d, setD] = useState<FieldData | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson("/data/uskids-field.json")
      .then((data) => { if (alive) setD(data as FieldData); })
      .catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, []);
  return d;
}

function normName(s: string): string {
  return (s || "").trim().toLowerCase()
    .replace(/[-'’.·\/]+/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function usToIso(s: string | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
}

// Pagina

export default function ScoutView() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <ScoutViewContent />;
}

function ScoutViewContent() {
  const status = useJuniorsCanonical();
  const field = useUskidsField();
  const params = useParams<{ tid: string }>();
  const navigate = useNavigate();

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={"Falhou: " + status.error} />;

  const data = status.data;
  const tid = params.tid || "";

  // 1) Tentar canonico directo
  const canonical = data.tournamentById.get(tid);
  if (canonical) {
    return <ScoutContent data={data} tournament={canonical} onSelect={(jid) => navigate("/kids2/" + jid)} />;
  }

  // 2) Tentar field USKids: tid = "usk{tcode}"
  const uskMatch = tid.match(/^usk(\d+)$/);
  if (uskMatch && field?.torneios) {
    const tcode = parseInt(uskMatch[1], 10);
    const ft = field.torneios.find((x) => x.t === tcode);
    if (ft) {
      const built = buildFieldTournament(ft, data);
      return <ScoutContent
        data={built.data}
        tournament={built.tournament}
        onSelect={(jid) => navigate("/kids2/" + jid)}
      />;
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <p style={{ color: "var(--text-3)" }}>Torneio <code>{tid}</code> nao encontrado.</p>
      <Link to="/kids2" style={{ color: "var(--color-info)" }}>{ICON_BACK} voltar</Link>
    </div>
  );
}

/** Constroi um Tournament sintetico a partir de FieldTournament + cruza jogadores
 *  com os juniors canonicos por normName. Devolve um `data` aumentado com
 *  synthetic juniors para os inscritos sem match canonico (para o juniorById
 *  resolver). */
function buildFieldTournament(ft: FieldTournament, data: CanonicalData): { tournament: Tournament; data: CanonicalData } {
  const dateIso = usToIso(ft.date_inicio);
  const endIso = usToIso(ft.date_fim);

  // Augmentar o juniorById com synthetic juniors para inscritos sem match
  const augmentedJuniorById = new Map(data.juniorById);
  const flights: Flight[] = [];

  for (const esc of ft.escaloes || []) {
    const results: Result[] = [];
    const players = esc.jogadores || [];
    for (const p of players) {
      const k = normName(p.nome);
      if (!k) continue;
      // Procurar junior canonico
      const candidates = data.juniorByNormName.get(k) || [];
      let junior: Junior | null = candidates.length > 0 ? candidates[0] : null;
      if (!junior) {
        // Synthetic junior stub (sem tournamentIds, sem sources)
        const syntheticId = "_field:" + ft.t + ":" + k;
        junior = {
          id: syntheticId,
          canonicalName: p.nome,
          country: p.pais || undefined,
          nationality: p.pais || undefined,
          sources: {},
          tournamentIds: [],
          _match: { confidence: "manual", evidence: ["uskids-field"], mergedFromSources: ["uskids-field"] },
        } as Junior;
        augmentedJuniorById.set(syntheticId, junior);
      }
      results.push({
        juniorId: junior.id,
        playerNameInSource: p.nome,
        pos: null,
        status: "OK",
        // Para o ScoutContent saber a cidade
        // (Result nao tem campo cidade, mas guardamos como extra via type assertion)
      } as Result);
      // Guardar cidade do field num side-map (chave = synthetic juniorId / canonical id)
      _fieldExtras.set(junior.id, { cidade: p.cidade });
    }
    flights.push({
      flightKey: "esc_" + (esc.flight_id ?? esc.age_group ?? esc.nome),
      label: esc.nome,
      ageMin: null,
      ageMax: null,
      sex: "M",
      par: [],
      yards: [],
      fieldSize: typeof esc.inscritos === "number" ? esc.inscritos : results.length,
      results,
    });
  }

  const tournament: Tournament = {
    id: "usk" + ft.t,
    sourceId: "uskids",
    sourceKey: String(ft.t),
    name: ft.name,
    shortName: ft.name,
    date: dateIso,
    startDate: dateIso,
    endDate: endIso,
    course: ft.campo || "",
    parTotal: 0,
    holesPerRound: 18,
    rounds: ft.rondas || 1,
    flights,
    links: [{ label: "USKids", url: "https://www.signupanytime.com/plugins/links/admin/Links.aspx?ax=1129&t=" + ft.t }],
  };

  return {
    tournament,
    data: { ...data, juniorById: augmentedJuniorById },
  };
}

/** Side-map global para cidade dos field-only players (Result nao tem este campo). */
const _fieldExtras = new Map<string, { cidade?: string }>();

function ScoutContent({ data, tournament, onSelect }: {
  data: CanonicalData; tournament: Tournament; onSelect: (jid: string) => void;
}) {
  const manuel = data.manuel;
  const today = new Date().toISOString().slice(0, 10);
  const tDate = tournament.date || tournament.startDate || "";
  const isFuture = tDate > today;
  const isFieldOnlySource = tournament.id.startsWith("usk");

  const manuelFlightKey = useMemo(() => {
    if (!manuel) return null;
    const f = tournament.flights.find((ff) => ff.results.some((r) => r.juniorId === manuel.id));
    return f?.flightKey || null;
  }, [tournament, manuel]);

  const [flightFilter, setFlightFilter] = useState<string>(manuelFlightKey || "all");

  const rows = useMemo<ScoutRow[]>(() => {
    const out: ScoutRow[] = [];
    for (const f of tournament.flights) {
      if (flightFilter !== "all" && f.flightKey !== flightFilter) continue;
      for (const r of f.results) {
        const junior = data.juniorById.get(r.juniorId);
        if (!junior) continue;
        if (manuel && junior.id === manuel.id) continue;

        const isFieldOnly = junior.id.startsWith("_field:");
        const cidade = isFieldOnly ? _fieldExtras.get(junior.id)?.cidade : undefined;

        let age: number | null = null;
        if (junior.dob) {
          const [y, m, d] = junior.dob.split("-").map(Number);
          if (y && m && d) {
            const tNow = new Date();
            age = tNow.getFullYear() - y;
            if (tNow.getMonth() + 1 < m || (tNow.getMonth() + 1 === m && tNow.getDate() < d)) age--;
          }
        }

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

        let vsMTotal: number | null = null;
        let vsMCount = 0;
        if (manuel && !isFieldOnly) {
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
          tier: isFieldOnly ? null : computeTier(junior, data.tournamentById),
          bestPos, recentPos,
          vsMTotal, vsMCount,
          fieldOnly: isFieldOnly,
          cidade,
        });
      }
    }
    const seen = new Set<string>();
    return out.filter((r) => {
      if (seen.has(r.junior.id)) return false;
      seen.add(r.junior.id);
      return true;
    });
  }, [data, tournament, manuel, isFuture, flightFilter]);

  const fieldOnlyCount = rows.filter((r) => r.fieldOnly).length;
  const matchedCount = rows.length - fieldOnlyCount;

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
    <div style={{ padding: "16px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Link to="/kids2" style={{ fontSize: 13, color: "var(--color-info)" }}>{ICON_BACK} KIDS2</Link>
        <span style={{ color: "var(--text-3)" }}>{ICON_DOT}</span>
        <Link to="/kids2/next-t" style={{ fontSize: 13, color: "var(--color-info)" }}>Proximos torneios</Link>
      </div>

      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--text)" }}>
        {ICON_SCOPE} Field Scout
      </h2>
      <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 14 }}>
        <strong>{tournament.name || tournament.shortName || tournament.id}</strong>
        {tDate && <span> {ICON_DOT} {fmtDate(tDate)}</span>}
        {tournament.course && <span> {ICON_DOT} {tournament.course}</span>}
        {isFuture && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--bg-info-subtle, #eff6ff)", color: "var(--color-info-dark, #1e3a8a)" }}>FUTURO</span>}
        {isFieldOnlySource && <span title="Inscricoes do uskids-field.json - alguns jogadores podem nao ter perfil canonico" style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--bg-muted)", color: "var(--text-3)", border: "1px solid var(--border-light)" }}>USKids field</span>}
      </div>

      {isFieldOnlySource && (
        <div style={{ background: "var(--bg-info-subtle, #eff6ff)", color: "var(--color-info-dark, #1e3a8a)", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          {matchedCount} inscritos com perfil canonico {ICON_DOT} {fieldOnlyCount} sem historico nos dados (apenas nome + pais)
        </div>
      )}

      {tournament.flights.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          <button onClick={() => setFlightFilter("all")} style={flightPillStyle(flightFilter === "all")}>
            Todos {ICON_DOT} {tournament.flights.reduce((acc, f) => acc + f.results.length, 0)}
          </button>
          {tournament.flights.map((f) => {
            const isManuelFlight = !!manuel && f.results.some((r) => r.juniorId === manuel.id);
            return (
              <button key={f.flightKey} onClick={() => setFlightFilter(f.flightKey)} style={flightPillStyle(flightFilter === f.flightKey, isManuelFlight)}>
                {f.label} {ICON_DOT} {f.results.length}{isManuelFlight ? " " + ICON_DOT + " " + ICON_SWORDS + " Manuel" : ""}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
        {rows.length} {isFuture ? "inscritos" : "participantes"}
        {flightFilter !== "all" && tournament.flights.length > 1 && <span> no escalao filtrado</span>}
      </div>

      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <SortableHdr<ScoutKey> k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Pais</SortableHdr>
              <SortableHdr<ScoutKey> k="name"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Nome</SortableHdr>
              <SortableHdr<ScoutKey> k="age"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, textAlign: "center", width: 50 }}>Idade</SortableHdr>
              <SortableHdr<ScoutKey> k="tier"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 110 }}>Tier</SortableHdr>
              <th style={{ ...thStyle, width: 56, textAlign: "center" }}>Best pos</th>
              <SortableHdr<ScoutKey> k="form"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 80, textAlign: "center" }}>Ultima pos</SortableHdr>
              {!isFuture && <SortableHdr<ScoutKey> k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 60, textAlign: "center" }}>Pos</SortableHdr>}
              {manuel && <SortableHdr<ScoutKey> k="vsM" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 90, textAlign: "right" }}>diff M (media)</SortableHdr>}
              {manuel && <th style={{ ...thStyle, width: 36, textAlign: "center" }}>{ICON_SWORDS}M</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const clickable = !row.fieldOnly;
              return (
                <tr
                  key={row.junior.id}
                  style={{ borderBottom: "1px solid var(--border-light)", cursor: clickable ? "pointer" : "default", opacity: row.fieldOnly ? 0.7 : 1 }}
                  onClick={clickable ? () => onSelect(row.junior.id) : undefined}
                  title={clickable ? "Abrir perfil" : "Sem perfil canonico"}
                >
                  <td style={tdStyle}>{flagOf(row.junior.country || row.junior.nationality || "")} {row.junior.country || row.junior.nationality || "—"}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text)" }}>
                    {row.junior.canonicalName}
                    {row.flight && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>{ICON_DOT} {row.flight.label}</span>}
                    {row.cidade && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{row.cidade}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-2)" }}>{row.age != null ? row.age : "—"}</td>
                  <td style={tdStyle}>
                    {row.tier ? (() => {
                      const c = getTierColors(row.tier);
                      return <span style={{ background: c.bg, color: c.fg, fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 700, border: "1px solid " + c.fg }}>{getTierLabel(row.tier)}</span>;
                    })() : <span style={{ color: "var(--text-3)", fontSize: 10 }}>{row.fieldOnly ? "sem dados" : "—"}</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{row.bestPos != null ? "#" + row.bestPos : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: row.recentPos != null && row.recentPos <= 3 ? "var(--medal-gold-strong)" : undefined }}>
                    {row.recentPos != null ? "#" + row.recentPos : "—"}
                  </td>
                  {!isFuture && (
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                      {row.result?.pos != null ? "#" + row.result.pos : "—"}
                    </td>
                  )}
                  {manuel && (
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: row.vsMTotal == null ? "var(--text-3)" : row.vsMTotal > 0 ? "var(--color-danger-dark)" : row.vsMTotal < 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                      {row.vsMTotal == null ? "—" : row.vsMTotal === 0 ? "0" : row.vsMTotal > 0 ? "+" + row.vsMTotal.toFixed(1) : row.vsMTotal.toFixed(1)}
                    </td>
                  )}
                  {manuel && <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-3)" }}>{row.vsMCount || "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {manuelInTournament && manuel && (
        <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--bg-success-subtle, #ecfdf5)", border: "1px solid var(--border-success, #97c459)", borderRadius: 6, fontSize: 12, color: "var(--color-good-dark)" }}>
          {ICON_SWORDS} Manuel esta inscrito neste torneio.
        </div>
      )}
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
    border: "1px solid " + (active ? accent : "var(--border)"),
    background: active ? accent : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer", lineHeight: 1.4,
  };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return d + " " + months[parseInt(m, 10) - 1] + " " + y;
}
