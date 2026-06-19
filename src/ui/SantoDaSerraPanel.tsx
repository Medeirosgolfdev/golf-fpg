/**
 * SantoDaSerraPanel.tsx
 *
 * Painel especial dedicado aos atletas do Santo da Serra (CGSS) com top-5 em
 * Campeonatos Nacionais de Jovens (Sub-10 a Sub-18) ao longo de 2004-2026.
 *
 * Mostra:
 *  - Tabela de atletas com fed, total de top-5, melhor posição
 *  - Por baixo de cada atleta: lista expandível de cada top-5 (ano, escalão,
 *    posição, gross, ±par, link para o torneio)
 *  - Cada nome é link para `/jogadores/{fed}?view=federado` (nova janela)
 */

import { useMemo, useState } from "react";
import { fmtToPar, fpgScoringUrl } from "../utils/format";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";

interface Player {
  pos: number | string | null;
  name: string;
  club?: string;
  fedCode?: string | null;
  grossTotal?: number | string | null;
  toPar?: number | null;
  dob?: string | null;
  age?: number | null;
}
interface TournamentInput {
  name: string;
  ccode?: string;
  tcode: string;
  date: string;
  campo?: string;
  escalao?: string | null;
  tipo?: string;
  players: Player[];
}
type Tournament = TournamentInput;

interface Top5Entry {
  year: string;
  date: string;
  pos: number;
  tcode: string;
  ccode: string;
  tournamentName: string;
  escalao: string;
  tipo: string;
  gross: number | string | null;
  toPar: number | null;
  isClubes: boolean;
}

interface AthleteSummary {
  fed: string | null;
  name: string;
  dob: string | null;          // ano de nascimento (do federados.json ou synth)
  entries: Top5Entry[];
  best: number;
  championships: number;
  podiums: number;
  totalTop5: number;
}

const SDS_REGEX = /santo\s+da\s+serra|sserra|s\.\s*da\s*serra|s\.serra/i;

function buildAthletes(tournaments: Tournament[]): AthleteSummary[] {
  const map = new Map<string, AthleteSummary>();
  for (const t of tournaments) {
    for (const p of t.players || []) {
      const posNum = typeof p.pos === "number" ? p.pos : (p.pos != null ? parseInt(String(p.pos)) : null);
      if (posNum == null || isNaN(posNum) || posNum > 5) continue;
      if (!SDS_REGEX.test(p.club || "")) continue;
      const key = (p.fedCode || ("name:" + (p.name || "?").toLowerCase())).toString();
      if (!map.has(key)) {
        map.set(key, {
          fed: p.fedCode || null,
          name: p.name || "?",
          dob: p.dob || null,
          entries: [], best: 999, championships: 0, podiums: 0, totalTop5: 0,
        });
      }
      const a = map.get(key)!;
      // Preferir dob real (federados.json) sobre synth (yob-06-01).
      // Se já temos dob synth e este é mais "real" (não acaba em -06-01),
      // substituir.
      if (p.dob && (!a.dob || (a.dob.endsWith("-06-01") && !p.dob.endsWith("-06-01")))) {
        a.dob = p.dob;
      }
      const isClubes = /clubes/i.test(t.name || "");
      a.entries.push({
        year: (t.date || "").slice(0, 4),
        date: t.date,
        pos: posNum,
        tcode: t.tcode,
        ccode: t.ccode || "000",
        tournamentName: t.name,
        escalao: t.escalao || "",
        tipo: t.tipo || (isClubes ? "Clubes" : "Jovens"),
        gross: typeof p.grossTotal === "number" ? p.grossTotal : (p.grossTotal ?? null),
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        isClubes,
      });
      a.totalTop5++;
      if (posNum < a.best) a.best = posNum;
      if (posNum === 1) a.championships++;
      if (posNum <= 3) a.podiums++;
    }
  }
  // Sort entries within athlete by date asc
  for (const a of map.values()) {
    a.entries.sort((x, y) => (x.date || "").localeCompare(y.date || "") || x.pos - y.pos);
  }
  // Sort athletes: most top-5 first, then better best position, then name
  return [...map.values()].sort((a, b) =>
    b.totalTop5 - a.totalTop5 ||
    a.best - b.best ||
    a.name.localeCompare(b.name, "pt"),
  );
}

function PosBadge({ pos }: { pos: number }) {
  const styles: Record<number, { bg: string; fg: string; label: string }> = {
    1: { bg: "var(--medal-gold-bg, #fef3c7)", fg: "var(--medal-gold-fg, var(--color-warn-dark))", label: "🥇 1º" },
    2: { bg: "var(--medal-silver-bg, #f1f5f9)", fg: "var(--medal-silver-fg, #475569)", label: "🥈 2º" },
    3: { bg: "var(--medal-bronze-bg, #fdf2e9)", fg: "var(--medal-bronze-fg, #9a3412)", label: "🥉 3º" },
  };
  const s = styles[pos] || { bg: "var(--bg-muted)", fg: "var(--text-2)", label: pos + "º" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 6px", borderRadius: 4,
      background: s.bg, color: s.fg, fontWeight: 700, fontSize: "var(--fs-11)",
      whiteSpace: "nowrap", letterSpacing: 0.2,
    }}>
      {s.label}
    </span>
  );
}

type SortKey = "name" | "fed" | "dob" | "top5" | "champ" | "podium" | "best" | "years";

export default function SantoDaSerraPanel({ tournaments }: { tournaments: Tournament[] }) {
  const athletes = useMemo(() => buildAthletes(tournaments), [tournaments]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Default sort: top-5 desc (mais top-5 primeiro), depois melhor pos, depois nome
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("top5", "desc", {
    name: "asc", fed: "asc", dob: "asc", best: "asc", years: "desc",
    top5: "desc", champ: "desc", podium: "desc",
  });

  const sorted = useMemo(() => {
    const arr = [...athletes];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name, "pt"); break;
        case "fed": cmp = (a.fed || "").localeCompare(b.fed || ""); break;
        case "dob": cmp = (a.dob || "9999").localeCompare(b.dob || "9999"); break;
        case "top5": cmp = a.totalTop5 - b.totalTop5; break;
        case "champ": cmp = a.championships - b.championships; break;
        case "podium": cmp = a.podiums - b.podiums; break;
        case "best": cmp = a.best - b.best; break;
        case "years": {
          const ay = [...new Set(a.entries.map(e => e.year))].sort();
          const by = [...new Set(b.entries.map(e => e.year))].sort();
          cmp = (ay[ay.length - 1] || "").localeCompare(by[by.length - 1] || "");
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [athletes, sortKey, sortDir]);

  const onSort = (k: string) => toggleSort(k as SortKey);

  if (athletes.length === 0) return null;

  const toggle = (key: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const totalEntries = athletes.reduce((s, a) => s + a.totalTop5, 0);
  const totalChamp = athletes.reduce((s, a) => s + a.championships, 0);
  const totalPodium = athletes.reduce((s, a) => s + a.podiums, 0);

  return (
    <section style={{ margin: "16px 12px 28px", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <header style={{
        padding: "10px 14px", background: "var(--bg-card-strong, var(--bg-muted))",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <h3 className="fs-15 fw-800" style={{ margin: 0 }}>
          🏌️ Santo da Serra · Top-5 em Nacionais
        </h3>
        <span className="muted fs-12">{athletes.length} atletas · {totalEntries} top-5 · {totalChamp} 🥇 · {totalPodium} pódios</span>
      </header>
      <div style={{ overflowX: "auto" }}>
        <table className="dtable">
          <thead>
            <tr>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Atleta</SortableHdr>
              <SortableHdr k="fed" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Fed</SortableHdr>
              <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Nasc.</SortableHdr>
              <SortableHdr k="top5" sortKey={sortKey} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right" }}>Top-5</SortableHdr>
              <SortableHdr k="champ" sortKey={sortKey} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right" }}>🥇</SortableHdr>
              <SortableHdr k="podium" sortKey={sortKey} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right" }}>Pódio</SortableHdr>
              <SortableHdr k="best" sortKey={sortKey} sortDir={sortDir} onSort={onSort} style={{ textAlign: "right" }}>Melhor</SortableHdr>
              <SortableHdr k="years" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>Anos</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const key = (a.fed || a.name);
              const isOpen = expanded.has(key);
              const years = [...new Set(a.entries.map((e) => e.year))].sort();
              return (
                <>
                  <tr key={key}
                    style={{ cursor: "pointer", background: isOpen ? "var(--bg-info-subtle, rgba(59,130,246,0.04))" : undefined }}
                    onClick={() => toggle(key)}
                    title={isOpen ? "Fechar detalhes" : "Ver todos os top-5"}>
                    <td style={{ verticalAlign: "middle" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-11)", opacity: 0.6, width: 10 }}>{isOpen ? "▼" : "▶"}</span>
                        {a.fed ? (
                          <a href={`/jogadores/${a.fed}?view=federado`} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="fw-700"
                            style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted currentColor" }}
                            title={`${a.name} — ver perfil federado (nova janela)`}>
                            {a.name}
                          </a>
                        ) : (
                          <span className="fw-700">{a.name}</span>
                        )}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-12)", color: "var(--text-3)" }}>
                      {a.fed || "—"}
                    </td>
                    <td style={{ fontSize: "var(--fs-12)", color: "var(--text-2)" }}
                        title={a.dob || ""}>
                      {a.dob ? a.dob.slice(0, 4) : "—"}
                    </td>
                    <td className="r" style={{ fontWeight: 700 }}>{a.totalTop5}</td>
                    <td className="r" style={{ color: a.championships > 0 ? "var(--accent)" : "var(--text-3)" }}>
                      {a.championships > 0 ? a.championships : "—"}
                    </td>
                    <td className="r">{a.podiums}</td>
                    <td className="r"><PosBadge pos={a.best} />
                    </td>
                    <td style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
                      {years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`} ({years.length})
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={key + "-details"}>
                      <td colSpan={8} style={{ padding: "0 12px 14px 36px", background: "var(--bg-info-subtle, rgba(59,130,246,0.02))" }}>
                        <table className="dtable-sm" style={{ marginTop: 4 }}>
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Pos</th>
                              <th>Esc</th>
                              <th className="r">Total</th>
                              <th className="r">±Par</th>
                              <th>Torneio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.entries.map((e, i) => (
                              <tr key={i}>
                                <td style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                                <td><PosBadge pos={e.pos} /></td>
                                <td>{e.escalao}{e.isClubes ? " · Clubes" : ""}</td>
                                <td className="r" style={{ fontWeight: 600 }}>{e.gross ?? "\u2014"}</td>
                                <td className="r">{e.toPar != null ? fmtToPar(e.toPar) : "\u2014"}</td>
                                <td ><a href={fpgScoringUrl(e.ccode, e.tcode)} target="_blank" rel="noopener noreferrer"
                                    style={{ color: "var(--accent)", textDecoration: "none" }}
                                    title="Ver torneio na FPG (nova janela)">
                                    {e.tournamentName} ↗
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
