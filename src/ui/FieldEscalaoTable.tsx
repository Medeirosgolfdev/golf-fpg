import { useMemo } from "react";
import { AutoRivalPlayer, normName as normNameAuto } from "../data/KIDSdataLoader";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import { fmtToParRivais } from "../utils/scoreDisplay";
import { displayName } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { isManuel } from "../constants/manuel";
import { fmtPosRivais, playerSeriesResult, tornCanon } from "./uskidsHelpers";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface TorneioResult {
  t: number; name: string;
  date_inicio: string; date_fim?: string; campo: string | null;
  rondas_total: number;
  escalao_manuel?: number;
  url_resultados?: string;
  escaloes: EscalaoResult[];
  ultima_atualizacao: string;
}

interface EscalaoResult {
  age_group: number; nome: string; holes: number; is_manuel: boolean; rondas: RondaResult[];
  campo?: string;
}

interface RondaResult {
  ronda: number;
  leaderboard?: Array<{ nome: string; pais: string; score?: number; to_par?: number | null }>;
  jogadores?: Array<{ nome: string; pais: string; score?: number; to_par?: number | null }>;
}

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────

/** Detecta Manuel por nome (wrapper para isManuel com interface de string) */
function isManuelName(nome: string): boolean {
  return isManuel({ name: nome });
}

// ─────────────────────────────────────────────
// RivCell Component
// ─────────────────────────────────────────────
function RivCell({ tp, pos, fieldSize }: { tp: number | null; pos: number; fieldSize: number }) {
  const { text: tpText, color: tpColor } = fmtToParRivais(tp);
  const posText = fmtPosRivais(pos, fieldSize);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, lineHeight:1.2 }}>
      <span style={{ fontSize: "var(--fs-13)", fontWeight:800, color: tpColor }}>{tpText}</span>
      <span style={{ fontSize: "var(--fs-11)", color:"var(--text-3)" }}>{posText}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export function FieldEscalaoTable({ escalaoNome, players, isFuture, torneioT, resultados, sBase, prevYears, tornName, arMap, kidsMap, urlResultados, urlUskids }: {
  escalaoNome: string;
  players: { nome: string; pais: string }[];
  isFuture: boolean;
  torneioT: number;
  resultados: TorneioResult[];
  sBase: string;
  prevYears: number[];
  tornName: string;
  arMap: Map<string, AutoRivalPlayer>;
  kidsMap: Map<string, string>;
  urlResultados?: string;
  urlUskids?: string;
}) {
  type LbRow = { nome: string; pais: string; pos: number; finalToPar: number | null; fieldSize: number };
  const leaderboard: LbRow[] | null = useMemo(() => {
    if (isFuture) return null;
    const resT = resultados.find(r => r.t === torneioT);
    if (!resT) return null;
    const esc = resT.escaloes.find(e => e.nome === escalaoNome);
    if (!esc) return null;
    const rondasValidas = esc.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
    if (rondasValidas.length === 0) return null;
    const totaisMap = new Map<string, { nome: string; pais: string; totalScore: number; toParArr: (number | null)[] }>();
    for (const rd of rondasValidas) {
      for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
        const k = normNameAuto(j.nome);
        if (!totaisMap.has(k)) totaisMap.set(k, { nome: j.nome, pais: j.pais, totalScore: 0, toParArr: [] });
        const entry = totaisMap.get(k)!;
        entry.totalScore += (j.score || 0);
        entry.toParArr.push(j.to_par ?? null);
      }
    }
    const fieldSize = totaisMap.size;
    return [...totaisMap.entries()]
      .sort((a, b) => a[1].totalScore - b[1].totalScore)
      .map(([, v], i) => ({
        nome: v.nome, pais: v.pais,
        pos: i + 1,
        finalToPar: v.toParArr.every(x => x != null) ? v.toParArr.reduce((s, x) => s + x!, 0) : null,
        fieldSize,
      }));
  }, [isFuture, resultados, torneioT, escalaoNome]);

  // Default sort: pos asc for past events, name asc for future
  const defaultSortKey = isFuture ? "nome" : "pos";
  const { sortKey, sortDir, toggleSort } = useSort(defaultSortKey as any, "asc");

  const displayPlayers: { nome: string; pais: string; pos?: number; finalToPar?: number | null; fieldSize?: number }[] = useMemo(() => {
    let result: { nome: string; pais: string; pos?: number; finalToPar?: number | null; fieldSize?: number }[] = [];

    // Pre-sort: if leaderboard exists (past event), use it; otherwise apply pre-sort logic
    if (!isFuture && leaderboard) {
      result = [...leaderboard];
    } else {
      result = [...players].sort((a, b) => {
        if (isManuelName(a.nome)) return 1;
        if (isManuelName(b.nome)) return -1;
        const getBest = (ar: AutoRivalPlayer | undefined) => {
          if (!ar) return 9999;
          let best = 9999;
          for (const yr of prevYears) {
            const res = playerSeriesResult(ar, sBase, yr);
            if (res && res.p > 0 && res.p < best) best = res.p;
          }
          return best;
        };
        return getBest(arMap.get(normNameAuto(a.nome))) - getBest(arMap.get(normNameAuto(b.nome)));
      });
    }

    // Apply sort based on sortKey/sortDir
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "pos") {
        cmp = (a.pos ?? 9999) - (b.pos ?? 9999);
      } else if (sortKey === "nome") {
        cmp = normNameAuto(a.nome).localeCompare(normNameAuto(b.nome));
      } else if (sortKey === "vsPar") {
        const aVal = a.finalToPar ?? 9999;
        const bVal = b.finalToPar ?? 9999;
        cmp = aVal - bVal;
      } else if (sortKey.startsWith("hist-")) {
        // History column: extract year and compare position
        const year = parseInt(sortKey.slice(5));
        const aAr = arMap.get(normNameAuto(a.nome));
        const bAr = arMap.get(normNameAuto(b.nome));
        const aRes = aAr ? playerSeriesResult(aAr, sBase, year) : null;
        const bRes = bAr ? playerSeriesResult(bAr, sBase, year) : null;
        const aPos = aRes?.p ?? 9999;
        const bPos = bRes?.p ?? 9999;
        cmp = aPos - bPos;
      } else if (sortKey === "torn") {
        const aTorn = arMap.get(normNameAuto(a.nome)) ? Object.keys(arMap.get(normNameAuto(a.nome))!.r).length : 0;
        const bTorn = arMap.get(normNameAuto(b.nome)) ? Object.keys(arMap.get(normNameAuto(b.nome))!.r).length : 0;
        cmp = aTorn - bTorn;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [isFuture, leaderboard, players, arMap, sBase, prevYears, sortKey, sortDir]);

  const shortBase = tornName.replace(/\s*\d{4}$/, "");
  const histCols = prevYears.map(y => ({ year: y, label: `${shortBase} '${String(y).slice(2)}` }));

  return (
    <div>
      <div className="h-sm" style={{ marginBottom:8 }}>
        {isFuture ? "Inscritos" : "Resultados"} — {escalaoNome} ({displayPlayers.length})
      </div>
      <div style={{ overflowX:"auto" }}>
        <table className="dtable-lg" style={{ width:"100%" }}>
          <thead>
            <tr>
              {!isFuture && (
                <SortableHdr
                  k="pos"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  style={{ width:40, textAlign:"center" }}
                >
                  #
                </SortableHdr>
              )}
              <th style={{ width:28, textAlign:"center" }}>🌍</th>
              <SortableHdr
                k="nome"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              >
                Jogador
              </SortableHdr>
              {!isFuture && (
                <SortableHdr
                  k="vsPar"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  style={{ width:56, textAlign:"center" }}
                >
                  vs par
                </SortableHdr>
              )}
              {histCols.map(c => (
                <SortableHdr
                  key={c.year}
                  k={`hist-${c.year}`}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  style={{ width:92, textAlign:"center" }}
                >
                  {c.label}
                </SortableHdr>
              ))}
              <SortableHdr
                k="torn"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                style={{ width:44, textAlign:"center" }}
              >
                torn.
              </SortableHdr>
            </tr>
          </thead>
          <tbody>
            {displayPlayers.map((p, i) => {
              const isM = isManuelName(p.nome);
              const arEntry = arMap.get(normNameAuto(p.nome));
              const totalTorn = arEntry ? Object.keys(arEntry.r).length : 0;
              const kidsName = kidsMap.get(normNameAuto(p.nome));
              const rowBg = isM
                ? "var(--bg-success-subtle)"
                : i % 2 === 0 ? "var(--bg-card)" : "var(--bg-detail)";
              return (
                <tr key={p.nome} style={{ background: rowBg, fontWeight: isM ? 700 : 400 }}>
                  {!isFuture && (
                    <td style={{ textAlign:"center", fontSize: "var(--fs-14)", fontWeight:700 }}>
                      {(p.pos ?? 0) === 1 ? "🥇" : (p.pos ?? 0) === 2 ? "🥈" : (p.pos ?? 0) === 3 ? "🥉" : (p.pos ?? "?")}
                    </td>
                  )}
                  <td style={{ textAlign:"center", fontSize: "var(--fs-16)" }}>{flag(p.pais)}</td>
                  <td style={{ padding:"7px 10px" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                      <span>{displayName(p.nome)}</span>
                      {kidsName && (
                        <a href="/kids2"
                          onClick={e => {
                            e.preventDefault();
                            // Preferir memberId (ID único USKids) — KIDS2Page resolve via canonicals
                            const memberId = arEntry?.memberId;
                            const hash = memberId ?? encodeURIComponent(kidsName);
                            window.open(`/kids2#${hash}`, "_blank");
                          }}
                          title="Ver em Kids"
                          style={{ fontWeight:800, color:"var(--color-good-dark)", fontSize: "var(--fs-14)", cursor:"pointer", textDecoration:"none", flexShrink:0 }}>
                          ↗
                        </a>
                      )}
                    </span>
                  </td>
                  {!isFuture && (() => {
                    const { text, color } = fmtToParRivais(p.finalToPar ?? null);
                    return (
                      <td style={{ textAlign:"center" }}>
                        <span style={{ fontSize: "var(--fs-13)", fontWeight:800, color }}>{text}</span>
                      </td>
                    );
                  })()}
                  {histCols.map(c => {
                    if (!arEntry) return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <span style={{ color:"var(--text-muted)", fontSize: "var(--fs-13)" }}>—</span>
                      </td>
                    );
                    const res = playerSeriesResult(arEntry, sBase, c.year);
                    if (!res || res.p <= 0) return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <span style={{ color:"var(--text-muted)", fontSize: "var(--fs-13)" }}>—</span>
                      </td>
                    );
                    return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <RivCell tp={res.tp} pos={res.p} fieldSize={res.fieldSize} />
                      </td>
                    );
                  })}
                  <td style={{ textAlign:"center", color:"var(--text-3)", fontWeight:700, fontSize: "var(--fs-12)" }}>
                    {totalTorn || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(urlResultados || urlUskids) && (
        <div style={{ textAlign:"right", marginTop:6 }}>
          {urlResultados && (
            <a href={urlResultados} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none", fontSize: "var(--fs-11)" }}>
              Resultados ↗
            </a>
          )}
          {urlUskids && (
            <a href={urlUskids} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none", fontSize: "var(--fs-11)", marginLeft:6 }}>
              USKids ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
