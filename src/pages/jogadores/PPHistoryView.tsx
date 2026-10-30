/**
 * PPHistoryView.tsx — Histórico Pitch & Putt de um jogador.
 *
 * Lê /data/pp-history/{fed}.json (gerado por scripts/scrape-pp-whs-node.js):
 * voltas WHS P&P + scorecards buraco-a-buraco (par-3 × 18, par 54).
 *
 * Usa a MESMA linguagem visual das vistas de Jogadores (card + table.dtable-lg
 * + roundRow + TeeDate/TeePill + gross com delta + SD em pill colorido). Cada
 * linha expande o scorecard com os buracos em COLUNAS (preferência do projecto).
 *
 * Degrada com elegância: se o ficheiro não existir, mostra aviso + link para a
 * ficha pública P&P (sempre fresca).
 */

import { Fragment, useEffect, useState } from "react";
import { loadPPHistory, ppPlayerUrl, type PPHistory, type PPRound } from "../../data/federadosPPLoader";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { fmtStb, sdClassByHcp } from "../../utils/scoreDisplay";
import { numSafe } from "../../utils/mathUtils";
import { GrossCell as GrossDeltaCell } from "../../ui/tableCells";
import TeeDate from "../../ui/TeeDate";
import TeePill from "../../ui/TeePill";
import { ScorecardTable } from "../../ui/ScorecardTable";
import LoadingState from "../../ui/LoadingState";

type SortKey = "date" | "tourn" | "course" | "holes" | "gross" | "stb" | "sd" | "index";

/* toNum local removido 2026-08-15 — numSafe (utils/mathUtils) é idêntico. */
const toNum = numSafe;

function Scorecard({ r }: { r: PPRound }) {
  const sc = r.scorecard;
  if (!sc) return <div className="muted fs-12" style={{ padding: "6px 10px" }}>Sem scorecard buraco-a-buraco para esta volta.</div>;

  const nh = sc.nholes ?? 18;
  const arr = (v: (number | null)[]) => Array.from({ length: nh }, (_, i) => toNum(v[i]));

  return (
    <div style={{ padding: "8px 10px 12px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        {sc.teeName && <TeePill name={sc.teeName} />}
        {sc.course && <span className="muted fs-12">{sc.course}</span>}
        {sc.courseRating != null && <span className="muted fs-11">CR {sc.courseRating}</span>}
        {sc.slope != null && <span className="muted fs-11">Slope {sc.slope}</span>}
      </div>
      {/* O cartão global (o mesmo das outras vistas), sem cabeçalho — já vem por cima. */}
      <ScorecardTable bare
        holes={{ g: arr(sc.gross), p: arr(sc.par), si: Array(nh).fill(null), m: arr(sc.meters), hc: nh }}
        courseName={sc.course || ""} date={(r.date || "").slice(0, 10).split("-").reverse().join("-")} tee={sc.teeName || ""} />
    </div>
  );
}

function GrossCell({ r }: { r: PPRound }) {
  const g = r.scorecard?.grossTotal ?? null;
  const par = r.scorecard?.parTotal ?? null;
  if (g == null) return <span className="muted">—</span>;
  return <GrossDeltaCell gross={g} par={par} />;
}

export default function PPHistoryView({ fed, name }: { fed: string; name?: string }) {
  const [hist, setHist] = useState<PPHistory | null | undefined>(undefined);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("date", "desc", { tourn: "asc", course: "asc" });

  useEffect(() => {
    let cancelled = false;
    setHist(undefined);
    loadPPHistory(fed).then(h => { if (!cancelled) setHist(h); }).catch(() => { if (!cancelled) setHist(null); });
    return () => { cancelled = true; };
  }, [fed]);

  if (hist === undefined) return <LoadingState message="A carregar histórico P&P…" />;

  if (!hist || !hist.rounds.length) {
    return (
      <div style={{ padding: 20 }}>
        <p className="muted">Sem histórico Pitch &amp; Putt descarregado para este jogador.</p>
        <p className="fs-13">
          Gerado por <code>scrape-pp-whs-node.js</code>. Entretanto:{" "}
          <a href={ppPlayerUrl(fed)} target="_blank" rel="noopener noreferrer">ficha P&amp;P no FPG Scoring ↗</a>
        </p>
      </div>
    );
  }

  const rounds = [...hist.rounds].sort((a, b) => {
    let av: number | string | null, bv: number | string | null;
    switch (sortKey) {
      case "date": av = a.date || ""; bv = b.date || ""; break;
      case "tourn": av = a.tourn || ""; bv = b.tourn || ""; break;
      case "course": av = a.course || ""; bv = b.course || ""; break;
      case "holes": av = a.holes ?? 0; bv = b.holes ?? 0; break;
      case "gross": av = a.scorecard?.grossTotal ?? null; bv = b.scorecard?.grossTotal ?? null; break;
      case "stb": av = toNum(a.stableford); bv = toNum(b.stableford); break;
      case "sd": av = toNum(a.sd); bv = toNum(b.sd); break;
      case "index": av = toNum(a.index); bv = toNum(b.index); break;
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "pt");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggle = (k: string) => setOpen(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="pa-content" style={{ padding: 12 }}>
      <div className="jog-pills" style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          🏑 Pitch &amp; Putt — {name || hist.name || `#${fed}`}
        </h3>
        {hist.index != null && (
          <span className="p" style={{ background: "var(--badge-pp)", color: "#fff", border: "1px solid var(--badge-pp)" }}>
            Index P&amp;P {hist.index}
          </span>
        )}
        <span className="p p-outline">{hist.rounds.length} voltas</span>
        <a href={ppPlayerUrl(fed)} target="_blank" rel="noopener noreferrer" className="fs-12">ficha pública ↗</a>
      </div>

      <div className="card">
        <div className="scroll-x">
          <table className="dtable-lg">
            <thead>
              <tr>
                <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
                <SortableHdr k="tourn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Prova</SortableHdr>
                <SortableHdr k="course" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
                <SortableHdr k="holes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Bur.</SortableHdr>
                <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
                <SortableHdr k="stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Stb</SortableHdr>
                <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD</SortableHdr>
                <SortableHdr k="index" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Index</SortableHdr>
              </tr>
            </thead>
            <tbody>
              {rounds.map(r => {
                const key = String(r.scoreId);
                const isOpen = open.has(key);
                const hasCard = !!r.scorecard;
                const sdCls = r.sd != null ? sdClassByHcp(Number(r.sd), hist.index) : "";
                return (
                  <Fragment key={key}>
                    <tr className={`roundRow${isOpen ? " pa-row-open" : ""}`}
                      onClick={() => hasCard && toggle(key)}
                      style={{ cursor: hasCard ? "pointer" : "default" }}>
                      <td>
                        <TeeDate date={r.date || ""} tee={r.scorecard?.teeName || ""} />
                        <div className="muted fs-10">#{r.scoreId}</div>
                      </td>
                      <td>{r.tourn || "—"}</td>
                      <td className="muted">{r.course || "—"}</td>
                      <td className="r"><span className={r.holes === 9 ? "hb hb9" : "hb hb18"}>{r.holes ?? 18}</span></td>
                      <td className="r"><GrossCell r={r} /></td>
                      <td className="r">{fmtStb(r.stableford, r.holes ?? undefined)}</td>
                      <td className="r">{r.sd != null ? <span className={sdCls ? `p p-${sdCls}` : ""}>{r.sd}</span> : ""}</td>
                      <td className="r">{r.index ?? "—"}</td>
                    </tr>
                    {isOpen && hasCard && (
                      <tr>
                        <td colSpan={8} className="bg-page p-0"><Scorecard r={r} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
