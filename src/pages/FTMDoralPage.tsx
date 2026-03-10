/**
 * FTMDoralPage.tsx — First Tee Miami Doral Jr. Classic Results
 * Lê ficheiros Golf Genius (sem par[], com divisions[], toPar directo)
 * Boys 8-9: 9 buracos (H10-H18) · Boys 10-11 / 12-13: 18 buracos
 */
import React, { useEffect, useState } from "react";
import { scClass, SC } from "../utils/scoreDisplay";
import { fmtToPar } from "../utils/format";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";

/* ── Types ─────────────────────────────────────────────────── */
interface RoundGG {
  day: number;
  date: string;
  course: string;
  startingHole?: number;
  scores: number[];
  f9?: number;
  b9?: number;
  gross: number;
}
interface PlayerGG {
  id: string;
  name: string;
  country: string;
  birthYear?: number;
  pos: number | null;
  toPar: number | null;
  total: number | null;
  r1Gross?: number;
  r2Gross?: number;
  rounds: RoundGG[];
}
interface DivisionGG {
  division: string;
  name: string;
  par?: number[];
  parF9?: number;
  parB9?: number;
  parTotal?: number;
  startingHole?: number;
  players: PlayerGG[];
}
interface RawGG {
  tournament: string;
  year: number;
  source: string;
  divisions: DivisionGG[];
}

/* Entrada normalizada para uma divisão específica */
interface Entry {
  id: string;
  label: string;
  year: number;
  category: string;
  divisionName: string;
  nineHole: boolean;
  par: number[];
  parF9: number;
  parB9: number;
  parTotal: number;
  sourceUrl: string;
  players: PlayerGG[];
}

/* ── Ficheiros de dados ─────────────────────────────────────── */
const DATA_FILES: { url: string; sourceUrl: string }[] = [
  {
    url: "/data/ftm_doral_2025.json",
    sourceUrl: "https://2025firstteemiamidoraljrclassic.golfgenius.com/pages/5506943",
  },
  {
    url: "/data/ftm_doral_2024.json",
    sourceUrl: "https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994",
  },
];

/* ── Flags ──────────────────────────────────────────────────── */
const FL: Record<string, string> = {
  Portugal:"🇵🇹",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",Inglaterra:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",França:"🇫🇷",
  Spain:"🇪🇸",Espanha:"🇪🇸",Germany:"🇩🇪",Alemanha:"🇩🇪",Italy:"🇮🇹",Itália:"🇮🇹",
  "United States":"🇺🇸","Estados Unidos":"🇺🇸",Canada:"🇨🇦",Canadá:"🇨🇦",
  Brazil:"🇧🇷",Brasil:"🇧🇷","Colombia":"🇨🇴","Colômbia":"🇨🇴","Mexico":"🇲🇽","México":"🇲🇽",
  "Puerto Rico":"🇵🇷","Porto Rico":"🇵🇷","Costa Rica":"🇨🇷",Chile:"🇨🇱",Peru:"🇵🇪",
  Argentina:"🇦🇷","Dominican Republic":"🇩🇴",Venezuela:"🇻🇪",Panama:"🇵🇦",
  China:"🇨🇳",Japan:"🇯🇵",Japão:"🇯🇵",Korea:"🇰🇷","South Korea":"🇰🇷",Thailand:"🇹🇭",
  Tailândia:"🇹🇭",Vietnam:"🇻🇳","Viet Nam":"🇻🇳",Philippines:"🇵🇭",Filipinas:"🇵🇭",
  India:"🇮🇳",Índia:"🇮🇳",Singapore:"🇸🇬",Singapura:"🇸🇬","Hong Kong":"🇭🇰",
  Australia:"🇦🇺",Austrália:"🇦🇺","New Zealand":"🇳🇿","Nova Zelândia":"🇳🇿",
  Sweden:"🇸🇪",Suécia:"🇸🇪",Norway:"🇳🇴",Noruega:"🇳🇴",Denmark:"🇩🇰",Dinamarca:"🇩🇰",
  Netherlands:"🇳🇱",Holanda:"🇳🇱",Belgium:"🇧🇪",Bélgica:"🇧🇪",Switzerland:"🇨🇭",Suíça:"🇨🇭",
  Austria:"🇦🇹",Áustria:"🇦🇹",Poland:"🇵🇱",Polónia:"🇵🇱","Czech Republic":"🇨🇿",
  "República Checa":"🇨🇿",Hungary:"🇭🇺",Hungria:"🇭🇺",Romania:"🇷🇴",Roménia:"🇷🇴",
  Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Escócia:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",Gales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  Ireland:"🇮🇪",Irlanda:"🇮🇪","South Africa":"🇿🇦","África do Sul":"🇿🇦",
  Morocco:"🇲🇦",Marrocos:"🇲🇦",Nigeria:"🇳🇬",Nigéria:"🇳🇬",
  "United Arab Emirates":"🇦🇪","Emirados Árabes":"🇦🇪",Turkey:"🇹🇷",Turquia:"🇹🇷",
  Russia:"🇷🇺","Russian Federation":"🇷🇺","Federação Russa":"🇷🇺",Ukraine:"🇺🇦",Ucrânia:"🇺🇦",
};
const gf = (co: string) => FL[co] ?? "🏳️";

/* ── Normalizar dados brutos → Entry[] ──────────────────────── */
function normalizeFile(raw: RawGG, sourceUrl: string): Entry[] {
  return raw.divisions.map((div): Entry => {
    const nineHole = div.players.some(p => p.rounds.some(r => r.startingHole === 10 && r.scores.length === 9));
    // Reordenar rondas por data (mais antiga = R1)
    const players = div.players
      .filter(p => p.rounds.length > 0)
      .map(p => ({
        ...p,
        rounds: [...p.rounds].sort((a, b) => a.day - b.day),
      }))
      .sort((a, b) => {
        const nR = Math.max(...div.players.map(p => p.rounds.length));
        const af = a.rounds.length === nR ? 0 : 1;
        const bf = b.rounds.length === nR ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.total ?? 999) - (b.total ?? 999);
      });
    return {
      id: `${raw.year}_${div.division.replace(/\s+/g,"_")}`,
      label: `${raw.year} // ${div.division}`,
      year: raw.year,
      category: div.division,
      divisionName: div.name,
      nineHole,
      par: div.par ?? [],
      parF9: div.parF9 ?? 0,
      parB9: div.parB9 ?? 0,
      parTotal: div.parTotal ?? 0,
      sourceUrl,
      players,
    };
  });
}

/* ── AccLB — Leaderboard acumulado ─────────────────────────── */
function AccLB({ entry }: { entry: Entry }) {
  const { players, nineHole } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);

  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1" style={{ width: "auto" }}>
        <thead><tr>
          <th className="hole-header" style={{ textAlign:"center", width:26, padding:"0 2px" }}>#</th>
          <th className="hole-header" style={{ textAlign:"left", paddingLeft:6, paddingRight:8 }}>Jogador</th>
          <th className="hole-header" style={{ width:38, textAlign:"center" }}>País</th>
          {!nineHole && <th className="hole-header" style={{ width:30, textAlign:"center" }}>Ano</th>}
          {Array.from({ length: nR }, (_, i) => (
            <th key={i} className="hole-header" style={{ width:38, textAlign:"center", padding:"0 2px" }}>R{i+1}</th>
          ))}
          <th className="hole-header col-total" style={{ width:36, padding:"0 3px" }}>Tot</th>
          <th className="hole-header" style={{ width:40, textAlign:"center", padding:"0 3px" }}>±Par</th>
        </tr></thead>
        <tbody>
          {players.map((p, idx) => {
            const incomplete = p.rounds.length < nR;
            const showPos = idx === 0 || p.pos !== players[idx-1]?.pos;
            const tp = p.toPar;
            return (
              <tr key={p.id} style={incomplete ? { opacity:0.5 } : undefined}>
                <td className="fw-800 ta-center" style={{ color:"var(--text-3)", fontSize:11, padding:"0 2px" }}>
                  {incomplete ? "WD" : (showPos ? p.pos : "")}
                </td>
                <td style={{ whiteSpace:"nowrap", paddingLeft:6, paddingRight:8, fontSize:12 }}>
                  <span className="fw-700">{p.name}</span>
                </td>
                <td style={{ textAlign:"center", fontSize:14 }}>{gf(p.country)}</td>
                {!nineHole && <td style={{ textAlign:"center", fontSize:10, color:"var(--text-3)" }}>{p.birthYear ?? "–"}</td>}
                {Array.from({ length: nR }, (_, i) => {
                  const r = p.rounds[i];
                  if (!r) return <td key={i} className="c-muted" style={{ textAlign:"center", fontSize:12 }}>–</td>;
                  return <td key={i} style={{ textAlign:"center", fontSize:12, fontWeight:600 }}>{r.gross}</td>;
                })}
                <td className="col-total fw-800" style={{ fontSize:13, padding:"0 3px" }}>{p.total ?? "–"}</td>
                <td className="fw-700" style={{
                  textAlign:"center", fontSize:12, padding:"0 3px",
                  color: tp != null && tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)",
                }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── SCTable 9H — scorecard 9 buracos (H10-H18) ────────────── */
function SCTable9H({ entry, ri }: { entry: Entry; ri: number }) {
  const { par, parTotal } = entry;
  const ws = entry.players.filter(p => p.rounds[ri]?.scores?.length === 9);
  if (!ws.length) return <EmptyState size="sm" message="Scorecards não disponíveis para esta ronda." />;
  const sorted = [...ws].sort((a, b) => a.rounds[ri].gross - b.rounds[ri].gross);
  let pos = 1;
  sorted.forEach((p, i) => {
    if (i > 0 && p.rounds[ri].gross > sorted[i-1].rounds[ri].gross) pos = i + 1;
    (p as any)._dp = pos;
  });
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header" style={{ textAlign:"center", width:26 }}>#</th>
          <th className="hole-header" style={{ textAlign:"left", paddingLeft:6 }}>Jogador</th>
          <th className="hole-header col-total" style={{ width:32 }}>Tot</th>
          <th className="hole-header" style={{ width:30 }}>±</th>
          {[10,11,12,13,14,15,16,17,18].map(h => <th key={h} className="hole-header">{h}</th>)}
        </tr></thead>
        <tbody>
          {par.length > 0 && (
            <tr className="sep-row">
              <td></td>
              <td className="row-label par-label">PAR</td>
              <td className="col-total">{parTotal}</td>
              <td></td>
              {par.map((p, i) => <td key={i}>{p}</td>)}
            </tr>
          )}
          {sorted.map((p, idx) => {
            const r = p.rounds[ri];
            const dp = (p as any)._dp;
            const showP = idx === 0 || dp !== (sorted[idx-1] as any)._dp;
            const tp = parTotal > 0 ? r.gross - parTotal : null;
            return (
              <tr key={p.id}>
                <td className="fw-800 ta-center" style={{ color:"var(--text-3)", fontSize:11 }}>{showP ? dp : ""}</td>
                <td className="row-label fw-700" style={{ whiteSpace:"nowrap", fontSize:11 }}>
                  {gf(p.country)} {p.name.length > 22 ? p.name.substring(0,20)+"…" : p.name}
                </td>
                <td className="col-total fw-700">{r.gross}</td>
                <td className="fw-700" style={{ fontSize:11, color: tp != null && tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)" }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
                {r.scores.map((sc, i) => (
                  <td key={i}><span className={`sc-score ${par[i] ? scClass(sc, par[i]) : ""}`}>{sc}</span></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── SCTable 18H — scorecard 18 buracos com par ─────────────── */
function SCTable18H({ entry, ri }: { entry: Entry; ri: number }) {
  const { par, parF9, parB9, parTotal } = entry;
  const hasPar = par.length >= 18;
  const ws = entry.players.filter(p => p.rounds[ri]?.scores?.length === 18);
  if (!ws.length) return <EmptyState size="sm" message="Scorecards não disponíveis para esta ronda." />;
  const sorted = [...ws].sort((a, b) => a.rounds[ri].gross - b.rounds[ri].gross);
  let pos = 1;
  sorted.forEach((p, i) => {
    if (i > 0 && p.rounds[ri].gross > sorted[i-1].rounds[ri].gross) pos = i + 1;
    (p as any)._dp = pos;
  });
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header" style={{ textAlign:"center", width:26 }}>#</th>
          <th className="hole-header" style={{ textAlign:"left", paddingLeft:6 }}>Jogador</th>
          <th className="hole-header col-total" style={{ width:32 }}>Tot</th>
          <th className="hole-header" style={{ width:30 }}>±</th>
          {[1,2,3,4,5,6,7,8,9].map(h => <th key={h} className="hole-header">{h}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {[10,11,12,13,14,15,16,17,18].map(h => <th key={h} className="hole-header">{h}</th>)}
          <th className="hole-header col-in fs-10">In</th>
        </tr></thead>
        <tbody>
          {hasPar && (
            <tr className="sep-row">
              <td></td>
              <td className="row-label par-label">PAR</td>
              <td className="col-total">{parTotal}</td>
              <td></td>
              {par.slice(0,9).map((p,i) => <td key={i}>{p}</td>)}
              <td className="col-out fw-600">{parF9}</td>
              {par.slice(9,18).map((p,i) => <td key={i}>{p}</td>)}
              <td className="col-in fw-600">{parB9}</td>
            </tr>
          )}
          {sorted.map((p, idx) => {
            const r = p.rounds[ri];
            const f9 = r.f9 ?? r.scores.slice(0,9).reduce((a,b)=>a+b,0);
            const b9 = r.b9 ?? r.scores.slice(9).reduce((a,b)=>a+b,0);
            const tp = hasPar ? r.gross - parTotal : null;
            const dp = (p as any)._dp;
            const showP = idx === 0 || dp !== (sorted[idx-1] as any)._dp;
            return (
              <tr key={p.id}>
                <td className="fw-800 ta-center" style={{ color:"var(--text-3)", fontSize:11 }}>{showP ? dp : ""}</td>
                <td className="row-label fw-700" style={{ whiteSpace:"nowrap", fontSize:11 }}>
                  {gf(p.country)} {p.name.length > 22 ? p.name.substring(0,20)+"…" : p.name}
                </td>
                <td className="col-total fw-700">{r.gross}</td>
                <td className="fw-700" style={{ fontSize:11, color: tp != null && tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)" }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
                {r.scores.slice(0,9).map((sc,i) => (
                  <td key={i}><span className={`sc-score ${hasPar ? scClass(sc, par[i]) : ""}`}>{sc}</span></td>
                ))}
                <td className="col-out fw-600">{f9}{hasPar && <span className="fs-8 c-text-3"> ({f9-parF9 > 0 ? "+" : ""}{f9-parF9 === 0 ? "E" : f9-parF9})</span>}</td>
                {r.scores.slice(9,18).map((sc,i) => (
                  <td key={i}><span className={`sc-score ${hasPar ? scClass(sc, par[9+i]) : ""}`}>{sc}</span></td>
                ))}
                <td className="col-in fw-600">{b9}{hasPar && <span className="fs-8 c-text-3"> ({b9-parB9 > 0 ? "+" : ""}{b9-parB9 === 0 ? "E" : b9-parB9})</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── FStats — resumo do field ───────────────────────────────── */
function FStats({ entry, ri }: { entry: Entry; ri: number | "all" }) {
  const { players } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const full = players.filter(p => p.rounds.length === nR);
  if (ri === "all") {
    const avg = full.length ? full.reduce((s, p) => s + (p.total ?? 0), 0) / full.length : 0;
    return (
      <div className="muted fs-10 mb-8">
        {full.length} jogadores ({nR}R){players.length > full.length ? ` + ${players.length - full.length} WD` : ""}
        {" · "}Média total: {avg.toFixed(1)}
        {" · "}Líder: {full[0]?.name} ({full[0]?.total})
      </div>
    );
  }
  const scores = players.filter(p => p.rounds[ri as number]).map(p => p.rounds[ri as number].gross);
  if (!scores.length) return null;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  return (
    <div className="muted fs-10 mb-8">
      {scores.length} jogadores{" · "}Média R{(ri as number)+1}: {avg.toFixed(1)}
    </div>
  );
}

/* ── DivView — abas por ronda ───────────────────────────────── */
function DivView({ entry }: { entry: Entry }) {
  const { players, nineHole } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const [dt, setDt] = useState<number | "all">("all");

  // Etiqueta de data para cada ronda (do 1º jogador com scorecards)
  const roundLabel = (i: number) => {
    const sample = players.find(p => p.rounds[i]);
    if (sample?.rounds[i]?.date) {
      const d = sample.rounds[i].date.replace(/^[A-Za-z]+,\s+/, ""); // "December 19"
      return `R${i+1} · ${d}`;
    }
    return `R${i+1}`;
  };

  return (
    <div>
      <div className="escalao-pills mb-8" style={{ gap:4 }}>
        <button onClick={() => setDt("all")} className={`tourn-tab tourn-tab-sm${dt === "all" ? " active" : ""}`}>
          Acumulado
        </button>
        {Array.from({ length: nR }, (_, i) => (
          <button key={i} onClick={() => setDt(i)} className={`tourn-tab tourn-tab-sm${dt === i ? " active" : ""}`}>
            {roundLabel(i)}
          </button>
        ))}
      </div>

      {dt === "all" && (
        <div className="card">
          <div className="h-md fs-14">🏆 Leaderboard — {entry.label}</div>
          <FStats entry={entry} ri="all" />
          <AccLB entry={entry} />
        </div>
      )}

      {typeof dt === "number" && (
        <div className="card">
          <div className="h-md fs-14">🏆 {roundLabel(dt)} — Scorecards</div>
          <FStats entry={entry} ri={dt} />
          {nineHole
            ? <SCTable9H entry={entry} ri={dt} />
            : <SCTable18H entry={entry} ri={dt} />
          }
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN CONTENT
   ═══════════════════════════════════════════════════════════════ */
function Content() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ti, setTi] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    Promise.all(
      DATA_FILES.map(async ({ url, sourceUrl }) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return [] as Entry[];
          const raw: RawGG = await res.json();
          return normalizeFile(raw, sourceUrl);
        } catch {
          return [] as Entry[];
        }
      })
    ).then(results => {
      const all = results.flat();
      setEntries(all);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;
  if (!entries.length) return (
    <div className="center-msg muted">
      Nenhum ficheiro de dados encontrado.<br />
      <span className="fs-10">Coloca <code>ftm_doral_2025.json</code> em <code>public/data/</code></span>
    </div>
  );

  // Selecção válida
  const safeIdx = Math.min(ti, entries.length - 1);
  const cur = entries[safeIdx];

  // Agrupar por ano para o sidebar
  const years = [...new Set(entries.map(e => e.year))].sort((a, b) => b - a);

  return (
    <div className="tourn-layout">

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="toolbar-title">🇺🇸 Doral</span>
          {cur && <span className="toolbar-meta">📍 Doral Golf Resort</span>}
        </div>
        <div className="toolbar-right">
          {cur && (
            <span className="chip">
              {cur.players.filter(p => p.rounds.length === Math.max(...cur.players.map(q => q.rounds.length))).length} field
              {" · "}{Math.max(...cur.players.map(p => p.rounds.length))}R
              {" · "}{cur.category}
            </span>
          )}
        </div>
      </div>

      {/* Master-detail */}
      <div className="master-detail">

        {/* Sidebar */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {years.map(year => {
            const yearEntries = entries.filter(e => e.year === year);
            return (
              <React.Fragment key={year}>
                <div className="sidebar-section-title-dark" style={{
                  background: "#1a5276",
                  color: "#d6eaf8",
                  borderBottom: "1px solid #2980b9",
                  letterSpacing: "0.08em",
                }}>
                  🇺🇸 Doral {year}
                </div>
                {yearEntries.map(entry => {
                  const idx = entries.indexOf(entry);
                  const nR = Math.max(...entry.players.map(p => p.rounds.length), 0);
                  const nP = entry.players.filter(p => p.rounds.length === nR).length;
                  return (
                    <button key={entry.id}
                      className={`course-item ${safeIdx === idx ? "active" : ""}`}
                      onClick={() => setTi(idx)}>
                      <div className="course-item-name">{entry.category}</div>
                      <div className="course-item-meta">
                        {nP} jog · {nR}R{entry.nineHole ? " · 9H" : ""}
                      </div>
                      <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="tourn-ext-link" style={{ marginTop:4 }}
                        onClick={e => e.stopPropagation()}>
                        🔗 Leaderboard oficial
                      </a>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Detail */}
        <div className="course-detail">
          {cur ? (
            <>
              <div className="detail-header">
                <h2 className="detail-title">{cur.label}</h2>
                <div className="detail-sub">
                  <span className="muted">📍 Doral Golf Resort — {cur.divisionName}</span>
                  <a href={cur.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="tourn-ext-link" style={{ marginLeft:8 }}>
                    🔗 Leaderboard oficial
                  </a>
                </div>
              </div>
              <DivView entry={cur} />
            </>
          ) : (
            <div className="center-msg muted">Dados não disponíveis</div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function FTMDoralPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Content />;
}
