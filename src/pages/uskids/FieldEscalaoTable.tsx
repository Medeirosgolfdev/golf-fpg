import { useMemo } from "react";
import { AutoRivalPlayer, uskTournNames, uskFieldSizes, normName as normNameAuto } from "../KIDSdataLoader";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { fmtToParRivais } from "../../utils/scoreDisplay";
import { displayName } from "../../utils/format";
import { isManuel } from "../../constants/manuel";

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

function tornCanon(s: string): string {
  const low = s.toLowerCase().replace(/['']/g, "").trim();
  const y2 = low.match(/\b20(\d{2})\b/)?.[1] || low.match(/(?:^|\s)(\d{2})$/)?.[1] || "";
  const pc = /parent.child/i.test(low) ? "pc" : ""; // Parent/Child = evento separado
  if (/venice/i.test(low))                           return `venice${pc}-${y2}`;
  if (/rome|roma/i.test(low))                        return `rome${pc}-${y2}`;
  if (/marco\s*simone/i.test(low))                   return `marco${pc}-${y2}`;
  if (/wjgc|bjgt|world.*junior.*golf/i.test(low))    return `wjgc${pc}-${y2}`;
  if (/eu\s*open|european\s*open|eowagr/i.test(low)) return `euopen${pc}-${y2}`;
  if (/world\s*champ/i.test(low))                    return `wc${pc}-${y2}`;
  if (/european\s*champ/i.test(low))                 return `ec${pc}-${y2}`;
  if (/red.*white.*blue|rwb/i.test(low))             return `rwb${pc}-${y2}`;
  if (/doral/i.test(low))                            return `doral${pc}-${y2}`;
  if (/sandestin/i.test(low))                        return `sandestin${pc}-${y2}`;
  if (/desert/i.test(low))                           return `desert${pc}-${y2}`;
  if (/el\s*prat/i.test(low))                        return `elprat${pc}-${y2}`;
  if (/greatgolf/i.test(low))                        return `gg${pc}-${y2}`;
  return `${low.replace(/\W+/g, '')}-${y2}`;
}

function playerSeriesResult(
  ar: AutoRivalPlayer,
  sBase: string,
  year: number,
): { p: number; tp: number | null; fieldSize: number } | null {
  for (const [tid, res] of Object.entries(ar.r)) {
    const uskM = tid.match(/^(usk\d+)/);
    if (!uskM) continue;
    const meta = uskTournNames.get(uskM[1]);
    if (!meta?.name || !meta?.dateExact) continue;
    const metaYear = parseInt(meta.dateExact.slice(0, 4));
    if (metaYear !== year) continue;
    const canon = tornCanon(meta.name).replace(/-\d+$/, "");
    if (canon !== sBase) continue;
    const fs = uskFieldSizes.get(tid) ?? 0;
    return { p: res.p ?? 0, tp: res.tp ?? null, fieldSize: fs };
  }
  return null;
}


function fmtPosRivais(p: number, fieldSize: number): string {
  if (p <= 0) return "—";
  if (p === 1) return "🥇";
  if (p === 2) return "🥈";
  if (p === 3) return "🥉";
  return fieldSize > 0 ? `${p}/${fieldSize}` : `${p}º`;
}

function flag(pais: string): string {
  const CC: Record<string, string> = {
    PT: "🇵🇹", ES: "🇪🇸", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹",
    GB: "🇬🇧", CH: "🇨🇭", SE: "🇸🇪", NL: "🇳🇱", NOR: "🇳🇴",
    DEN: "🇩🇰", BEL: "🇧🇪", UKR: "🇺🇦", RUS: "🇷🇺", USA: "🇺🇸",
    CAN: "🇨🇦", MEX: "🇲🇽", BRA: "🇧🇷", AUS: "🇦🇺", ZA: "🇿🇦",
    JAP: "🇯🇵", CHN: "🇨🇳", IND: "🇮🇳", THA: "🇹🇭", SGP: "🇸🇬",
    KOR: "🇰🇷", TWN: "🇹🇼", PHL: "🇵🇭", MYS: "🇲🇾", VIE: "🇻🇳",
    ARG: "🇦🇷", CHL: "🇨🇱", UY: "🇺🇾", GR: "🇬🇷", POL: "🇵🇱",
    CZE: "🇨🇿", AUT: "🇦🇹", POR: "🇵🇹", ESP: "🇪🇸", FRA: "🇫🇷",
    ALE: "🇩🇪", ITA: "🇮🇹", RUM: "🇷🇴", HUN: "🇭🇺", SRB: "🇷🇸",
    BUL: "🇧🇬", LTU: "🇱🇹", EST: "🇪🇪", SVK: "🇸🇰", SVN: "🇸🇮",
    HRV: "🇭🇷", MNE: "🇲🇪", BIH: "🇧🇦", ALB: "🇦🇱", MAC: "🇲🇦",
    TUN: "🇹🇳", GEO: "🇬🇪", ARM: "🇦🇲", AZE: "🇦🇿", TUR: "🇹🇷",
    ISL: "🇮🇸", IRL: "🇮🇪", FIN: "🇫🇮", ENG: "🇬🇧", SCT: "🇬🇧",
    WLS: "🇬🇧", NIR: "🇬🇧",
  };
  return CC[pais] || "🌍";
}

// ─────────────────────────────────────────────
// RivCell Component
// ─────────────────────────────────────────────
function RivCell({ tp, pos, fieldSize }: { tp: number | null; pos: number; fieldSize: number }) {
  const { text: tpText, color: tpColor } = fmtToParRivais(tp);
  const posText = fmtPosRivais(pos, fieldSize);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, lineHeight:1.2 }}>
      <span style={{ fontSize:13, fontWeight:800, color: tpColor }}>{tpText}</span>
      <span style={{ fontSize:11, color:"var(--text-3)" }}>{posText}</span>
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
                    <td style={{ textAlign:"center", fontSize:14, fontWeight:700 }}>
                      {(p.pos ?? 0) === 1 ? "🥇" : (p.pos ?? 0) === 2 ? "🥈" : (p.pos ?? 0) === 3 ? "🥉" : (p.pos ?? "?")}
                    </td>
                  )}
                  <td style={{ textAlign:"center", fontSize:16 }}>{flag(p.pais)}</td>
                  <td style={{ padding:"7px 10px" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                      <span>{displayName(p.nome)}</span>
                      {kidsName && (
                        <a href="/kids"
                          onClick={e => {
                            e.preventDefault();
                            // Preferir memberId (ID único USKids) — resolve no KIDSPage antes dos 45 ficheiros
                            const memberId = arEntry?.memberId;
                            const hash = memberId ?? encodeURIComponent(kidsName);
                            window.open(`/kids#${hash}`, "_blank");
                          }}
                          title="Ver em Kids"
                          style={{ fontWeight:800, color:"var(--color-good-dark)", fontSize:14, cursor:"pointer", textDecoration:"none", flexShrink:0 }}>
                          ↗
                        </a>
                      )}
                    </span>
                  </td>
                  {!isFuture && (() => {
                    const { text, color } = fmtToParRivais(p.finalToPar ?? null);
                    return (
                      <td style={{ textAlign:"center" }}>
                        <span style={{ fontSize:13, fontWeight:800, color }}>{text}</span>
                      </td>
                    );
                  })()}
                  {histCols.map(c => {
                    if (!arEntry) return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <span style={{ color:"var(--text-muted)", fontSize:13 }}>—</span>
                      </td>
                    );
                    const res = playerSeriesResult(arEntry, sBase, c.year);
                    if (!res || res.p <= 0) return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <span style={{ color:"var(--text-muted)", fontSize:13 }}>—</span>
                      </td>
                    );
                    return (
                      <td key={c.year} style={{ textAlign:"center" }}>
                        <RivCell tp={res.tp} pos={res.p} fieldSize={res.fieldSize} />
                      </td>
                    );
                  })}
                  <td style={{ textAlign:"center", color:"var(--text-3)", fontWeight:700, fontSize:12 }}>
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
              className="p p-sm p-muted" style={{ textDecoration:"none", fontSize:11 }}>
              Resultados ↗
            </a>
          )}
          {urlUskids && (
            <a href={urlUskids} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted" style={{ textDecoration:"none", fontSize:11, marginLeft:6 }}>
              USKids ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
