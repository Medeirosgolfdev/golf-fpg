/**
 * FTMDoralPage.tsx — First Tee Miami Doral Jr. Classic Results
 * Lê ficheiros Golf Genius (sem par[], com divisions[], toPar directo)
 * Boys 8-9: 9 buracos (H10-H18) · Boys 10-11 / 12-13: 18 buracos
 */
import React, { useEffect, useState, useMemo } from "react";
import { cachedFetch } from "../data/fetchCache";
import { SC } from "../utils/scoreDisplay";
import { isManuel } from "../ui/tournamentPrimitives";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { gf } from "../utils/flagUtils";
const isM = (name: string) => isManuel({ name });
import { norm, fmtFieldInfo } from "../utils/format";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../ui/Toolbar";
import DetailHeader from "../ui/DetailHeader";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import { RoundPill } from "../ui/PillBadge";
import { AllRoundsScorecardLB, AccumulatedLB, ScorecardLB, expandMultiRound, type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import EvoBadge from "../ui/EvoBadge";
import type { ExtraColumn, MultiRoundRow } from "../ui/multiRoundTypes";
import { buildAutoRivals, normName as normNameAuto, type AutoRivalPlayer } from "./KIDSdataLoader";
import { KidsLink, KidsLinkCtx, type KidsLinkEntry } from "../ui/KidsLink";

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
  course: string;
  cr?: number;
  slope?: number;
  metres: number[];
  metresF9?: number;
  metresB9?: number;
  metresTotal?: number;
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


/* ── Metadados por divisão: campo, CR/Slope, metros por buraco ── */
interface DivMeta { course: string; cr?: number; slope?: number; metres: number[]; metresF9?: number; metresB9?: number; metresTotal: number }
const DIVISION_META: Record<string, DivMeta> = {
  // RED TIGER — 9H (H10-H18)
  "Boys 7 & Under": { course:"Red Tiger", metres:[215,79,210,160,84,155,78,165,210], metresTotal:1356 },
  "Boys 8-9":       { course:"Red Tiger", metres:[247,79,261,192,84,183,107,198,274], metresTotal:1625 },
  // RED TIGER — 9H (H1-H9)
  "Girls 7 & Under":{ course:"Red Tiger", metres:[215,73,210,160,210,55,165,102,174], metresTotal:1364 },
  "Girls 8-9":      { course:"Red Tiger", metres:[247,138,238,192,229,104,197,102,197], metresTotal:1644 },
  "Girls 10-11":    { course:"Red Tiger", metres:[362,137,343,192,312,104,210,102,248], metresTotal:2010 },
  // RED TIGER — 18H
  "Girls 14-15":    { course:"Red Tiger", metres:[467,146,428,248,445,142,316,117,329,428,145,411,294,129,315,146,255,447], metresF9:2638, metresB9:2570, metresTotal:5208 },
  "Girls 16-18":    { course:"Red Tiger", cr:75.0, slope:140, metres:[467,146,445,259,445,152,327,138,345,433,163,443,318,151,333,155,275,447], metresF9:2724, metresB9:2718, metresTotal:5442 },
  // GOLDEN PALM — 18H
  "Boys 10-11":     { course:"Golden Palm", cr:69.0, slope:130, metres:[275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273], metresF9:2571, metresB9:2315, metresTotal:4886 },
  "Girls 12-13":    { course:"Golden Palm", cr:71.0, slope:134, metres:[275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273], metresF9:2571, metresB9:2315, metresTotal:4886 },
  "Boys 14-15":     { course:"Golden Palm", cr:72.0, slope:136, metres:[354,475,354,493,356,353,133,361,164,302,494,137,314,367,134,487,159,356], metresF9:3043, metresB9:2750, metresTotal:5793 },
  // SILVER FOX — 18H
  "Boys 12-13":     { course:"Silver Fox", cr:74.0, slope:140, metres:[321,311,455,130,293,317,123,311,306,314,425,300,281,279,125,428,121,304], metresF9:2567, metresB9:2577, metresTotal:5144 },
  // BLUE MONSTER — 18H
  "Boys 16-18":     { course:"Blue Monster", cr:74.0, slope:140, metres:[511,348,359,161,346,368,398,483,169,512,298,539,180,401,122,286,375,396], metresF9:3143, metresB9:3109, metresTotal:6252 },
};

/* ── Normalização de nomes ──────────────────────────────────── */
/** Golf Genius devolve "Sobrenome, Nome" → converter para "Nome Sobrenome" */
function normalizeName(raw: string): string {
  const comma = raw.indexOf(",");
  if (comma === -1) return raw.trim();
  const last  = raw.slice(0, comma).trim();
  const first = raw.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

/** Manuel Medeiros — mesmo critério que BJGTPage */
/* gradToBirth removido — não usado directamente, birthYear vem no entryToTournament */


function normalizeFile(raw: RawGG, sourceUrl: string): Entry[] {
  return raw.divisions.map((div): Entry => {
    const nineHole = div.players.some(p => p.rounds.some(r => r.startingHole === 10 && r.scores.length === 9));
    // Reordenar rondas por data (mais antiga = R1)
    const players = div.players
      .filter(p => p.rounds.length > 0)
      .map(p => ({
        ...p,
        name: normalizeName(p.name),
        rounds: [...p.rounds].sort((a, b) => {
          // Ordenar por data real (o campo day pode estar errado no scraper)
          if (a.date && b.date) {
            const months: Record<string,number> = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
              January:1,February:2,March:3,April:4,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
            const parse = (d: string) => {
              const parts = d.replace(/^[A-Za-z]+,\s+/, "").split(" ");
              return (months[parts[0]] ?? 0) * 100 + (parseInt(parts[1]) || 0);
            };
            return parse(a.date) - parse(b.date);
          }
          return a.day - b.day;
        }),
      }))
      .sort((a, b) => {
        const nR = Math.max(...div.players.map(p => p.rounds.length));
        const af = a.rounds.length === nR ? 0 : 1;
        const bf = b.rounds.length === nR ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.total ?? 999) - (b.total ?? 999);
      });
    const meta = DIVISION_META[div.division] ?? { course: "", metres: [], metresTotal: 0 };
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
      course: meta.course,
      cr: meta.cr,
      slope: meta.slope,
      metres: meta.metres,
      metresF9: meta.metresF9,
      metresB9: meta.metresB9,
      metresTotal: meta.metresTotal || undefined,
      sourceUrl,
      players,
    };
  });
}

/* ── Evo: presença no ano anterior ─────────────────────────── */
interface EvoEntry { prevTotal: number; delta: number; from: string; to: string; pill: "UP" | "EQ"; prevPos: number | null; fieldSize: number }

function buildEvo(cur: Entry, all: Entry[]): Map<string, EvoEntry> {
  const evo = new Map<string, EvoEntry>();
  const prevYear = cur.year - 1;
  const prevEntries = all.filter(e => e.year === prevYear);
  if (!prevEntries.length) return evo;

  for (const p of cur.players) {
    if (!p.total) continue;
    for (const prev of prevEntries) {
      const match = prev.players.find(q => {
        const n1 = norm(p.name), n2 = norm(q.name);
        return n1 === n2 ||
          (n1.split(" ")[0] === n2.split(" ")[0] &&
           n1.split(" ")[n1.split(" ").length - 1] === n2.split(" ")[n2.split(" ").length - 1]);
      });
      if (!match?.total) continue;
      const nR = Math.max(...prev.players.map(q => q.rounds.length));
      const fieldSize = prev.players.filter(q => q.rounds.length === nR).length;
      evo.set(p.name, {
        prevTotal: match.total,
        delta: p.total - match.total,
        from: prev.category,
        to: cur.category,
        pill: prev.category === cur.category ? "EQ" : "UP",
        prevPos: match.pos,
        fieldSize,
      });
      break;
    }
  }
  return evo;
}

/* AccLB removido — agora usa AccumulatedLB da FPGPage */

/* ── Adaptador Entry → FPGTournament para reutilizar AllRoundsScorecardLB ── */
function entryToTournament(entry: Entry): FPGTournament {
  const nR = Math.max(...entry.players.map(p => p.rounds.length), 0);
  const players: FPGPlayer[] = entry.players
    .filter(p => p.rounds.length > 0)
    .map(p => {
      const roundScores: FPGRoundScore[] = p.rounds.map((r, ri) => ({
        round: ri + 1,
        gross: r.gross,
        scores: r.scores,
        pars: entry.par,
        si: entry.metres,       // metros na linha SI (siLabel="m")
        meters: entry.metres,
        courseRating: entry.cr,
        slope: entry.slope,
      }));
      const incomplete = p.rounds.length < nR;
      return {
        scoreId: p.id,
        pos: p.pos,
        name: p.name,
        club: p.country ? `${gf(p.country)} ${p.country}` : "",
        grossTotal: p.total,
        toPar: p.toPar,
        nholes: entry.par.length || (entry.nineHole ? 9 : 18),
        parTotal: entry.parTotal,
        scores: p.rounds[0]?.scores,
        par: entry.par,
        si: entry.metres,       // metros na linha SI
        meters: entry.metres,
        courseRating: entry.cr,
        slope: entry.slope,
        roundScores,
        _wd: incomplete,
        _roundsPlayed: p.rounds.length,
      } as FPGPlayer;
    });
  return {
    name: entry.label,
    tcode: entry.id,
    date: "",
    campo: entry.course,
    rounds: nR,
    playerCount: players.length,
    players,
  };
}

const EMPTY_ESC_LOOKUP = new Map<string, string>();
const EMPTY_PLAYERS_DB = {} as Record<string, any>;

/** Opções para ocultar colunas FPG-específicas e adaptar ao contexto Doral */
function doralScorecardOptions(entry: Entry, nameDecorator?: ScorecardOptions["nameDecorator"]): ScorecardOptions {
  // Boys 8-9 (e Girls 7 & Under, etc.) começam no buraco 10 (back-9)
  const startHole = entry.players[0]?.rounds[0]?.startingHole === 10 ? 10 : 1;
  // SD só se esconde quando não há CR/slope
  const hasRating = entry.cr != null && entry.slope != null;
  return {
    hideHCP: true,
    hideSD: !hasRating,
    hideEsc: true,
    hideFed: true,
    hideTee: true,
    clubLabel: "País",
    startHole,
    nameDecorator,
  };
}

/* DoralScorecard removido — lógica inline no DivView */

/* ── FStats — resumo do field ───────────────────────────────── */
function FStats({ entry, ri }: { entry: Entry; ri: number | "all" }) {
  const { players } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const full = players.filter(p => p.rounds.length === nR);
  if (ri === "all") {
    const avg = full.length ? full.reduce((s, p) => s + (p.total ?? 0), 0) / full.length : 0;
    return (
      <div className="muted fs-10 mb-8">
        {full.length} jogadores{nR > 1 && <> (<RoundPill nR={nR} />)</>}{players.length > full.length ? ` + ${players.length - full.length} WD` : ""}
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

/* ── DivView — abas R1 · R2 · Resumo · 📋 Scorecards (idêntico ao FPGPage) ── */
function DivView({ entry, evo }: { entry: Entry; evo?: Map<string, EvoEntry> }) {
  const tournament = useMemo(() => entryToTournament(entry), [entry]);
  const nR = Math.max(...entry.players.map(p => p.rounds.length), 0);
  const isMulti = nR > 1;
  const hasEvo = evo && evo.size > 0;

  /** Decorador de nome: adiciona ↗ KidsLink */
  const nameDecoratorFn: ScorecardOptions["nameDecorator"] = React.useCallback(
    (name: string, content: React.ReactNode) => (
      <span style={{ display: "inline-flex", alignItems: "center" }}>{content}<KidsLink nome={name} /></span>
    ), []);
  const renderNameFn = React.useCallback(
    (row: MultiRoundRow) => (
      <span className="fw-700" style={{ display: "inline-flex", alignItems: "center" }}>
        {row.countryFlag} {row.name}<KidsLink nome={row.name} />
      </span>
    ), []);

  const scOptions = useMemo(() => doralScorecardOptions(entry, nameDecoratorFn), [entry, nameDecoratorFn]);

  // expandMultiRound produz: [R1_tourn, R2_tourn, ..., Resumo_tourn]
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

  // Tabs: R1 · R2 · Resumo · 📋 Scorecards  (como FPGPage TournamentDetail)
  const COMBINED_TAB = "📋 Scorecards";
  const tabs = useMemo(() => {
    if (!isMulti) return ["Scorecard"];
    return [...expanded.map((t: any) => t._roundLabel || "?"), COMBINED_TAB];
  }, [isMulti, expanded]);

  const [tab, setTab] = useState(0);

  const curT       = isMulti ? expanded[Math.min(tab, expanded.length - 1)] : tournament;
  const isAcc      = isMulti && !!(curT as any)?._isTotal;
  const isCombined = isMulti && tabs[tab] === COMBINED_TAB;

  const prevYear = entry.year - 1;
  type RowWithPos = MultiRoundRow & { _pos?: number | null };
  const evoCols: ExtraColumn<RowWithPos>[] | undefined = hasEvo ? [
    {
      header: String(prevYear),
      className: "ta-c fs-11 fw-600",
      headerStyle: { width: 36, textAlign: "center" as const, padding: "0 3px", borderLeft: "2px solid var(--border)" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev
          ? <span style={{ borderLeft: "2px solid var(--border)", padding: "0 3px", display: "inline-block" }}>{ev.prevTotal}</span>
          : <span className="c-muted" style={{ borderLeft: "2px solid var(--border)", padding: "0 3px", display: "inline-block" }}>–</span>;
      },
    },
    {
      header: "Δ",
      className: "ta-c fs-11 fw-700",
      headerStyle: { width: 34, textAlign: "center" as const, padding: "0 3px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        return <span style={{ color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>{ev.delta > 0 ? "+" : ""}{ev.delta}</span>;
      },
    },
    {
      header: "Percurso",
      className: "ta-c",
      headerStyle: { width: 140, textAlign: "center" as const, padding: "0 4px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev
          ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} prevPos={ev.prevPos} fieldSize={ev.fieldSize} />
          : <EvoBadge pill="NEW" />;
      },
    },
  ] : undefined;

  return (
    <div>
      {/* Tabs tab-under como FPGPage */}
      {isMulti && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 12, gap: 2, overflowX: "auto" }}>
          {tabs.map((label, i) => (
            <button key={i} className={`tab-under${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>{label}</button>
          ))}
        </div>
      )}

      {hasEvo && isAcc && <EvoSummary entry={entry} evo={evo!} />}

      {/* Conteúdo — mesma lógica que TournamentDetail de FPGPage */}
      {isCombined
        ? <AllRoundsScorecardLB tournament={tournament} escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB} options={scOptions} />
        : isAcc
          ? <AccumulatedLB tournament={curT} nRounds={nR} escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB} showCols={{ esc: false, fed: false, tee: false }} extraColumns={evoCols} renderName={renderNameFn} />
          : <ScorecardLB tournament={curT} escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB} siLabel="m" options={scOptions} />
      }
    </div>
  );
}

/** Mini-resumo de evolução ano-a-ano (preserva info do Evo sem o AccLB custom) */
function EvoSummary({ entry, evo }: { entry: Entry; evo: Map<string, EvoEntry> }) {
  if (!evo.size) return null;
  const prevYear = entry.year - 1;
  const returning = [...evo.values()].filter(e => e.delta !== 0);
  const improved  = returning.filter(e => e.delta < 0).length;
  const total     = returning.length;
  return (
    <div className="muted fs-10 mb-8">
      {evo.size} jogadores regressaram de {prevYear}{total > 0 ? ` · ${improved}/${total} melhoraram` : ""}
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
  const [autoRivals, setAutoRivals] = useState<AutoRivalPlayer[]>([]);
  const md = useMasterDetail();

  useEffect(() => {
    Promise.all(
      DATA_FILES.map(async ({ url, sourceUrl }) => {
        try {
          const res = await cachedFetch(url);  // fetchCache: partilhado com KIDSdataLoader
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
    // Carregar autoRivals em background para KidsLinks
    buildAutoRivals(undefined, {
      onUpdate: (rivals) => setAutoRivals(rivals),
    }).catch(() => {});
  }, []);

  // Mapa normName → KidsLinkEntry para o contexto ↗
  const kidsMap = useMemo(() => {
    const m = new Map<string, KidsLinkEntry>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), { n: r.n, memberId: (r as any).memberId });
    return m;
  }, [autoRivals]);

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
  const evo = cur ? buildEvo(cur, entries) : undefined;

  // Agrupar por ano para o sidebar
  const years = [...new Set(entries.map(e => e.year))].sort((a, b) => b - a);

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
    <div className="tourn-layout">

      {/* Toolbar */}
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>🇺🇸 Doral</ToolbarTitle>
        {cur && <ToolbarMeta>📍 Doral Golf Resort</ToolbarMeta>}
        {cur && (() => {
          const nR = Math.max(...cur.players.map(p => p.rounds.length));
          return <span className="chip ml-auto" >{fmtFieldInfo(cur.players.filter(p => p.rounds.length === nR).length, nR, cur.category)}</span>;
        })()}
      </Toolbar>

      {/* Master-detail */}
      <div className="master-detail">

        {/* Sidebar */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {years.map(year => {
            const yearEntries = entries.filter(e => e.year === year);
            return (
              <React.Fragment key={year}>
                <SidebarSectionTitle dark color="var(--color-doral-dark)" textColor="var(--color-doral-text)" borderColor="var(--color-doral-mid)" letterSpacing="0.08em">
                  🇺🇸 First Tee Miami Doral Jr. Classic
                </SidebarSectionTitle>
                <div className="sidebar-year-label" style={{
                  padding: "2px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "#ffffff",
                  textTransform: "uppercase",
                  marginTop: 4,
                  background: "var(--color-doral-dark)",
                }}>
                  {year}
                </div>
                {yearEntries.map(entry => {
                  const idx = entries.indexOf(entry);
                  const nR = Math.max(...entry.players.map(p => p.rounds.length), 0);
                  const nP = entry.players.filter(p => p.rounds.length === nR).length;
                  const manuelPlayed = entry.players.some(p => isM(p.name));
                  return (
                    <button key={entry.id}
                      className={`course-item ${safeIdx === idx ? "active" : ""}`}
                      onClick={() => { setTi(idx); md.onSelect(); }}>
                      <div className="course-item-name">{entry.category}</div>
                      {entry.course && (
                        <div className="course-item-meta" style={{ fontWeight:600, color:"var(--text-2)" }}>
                          ⛳ {entry.course}
                        </div>
                      )}
                      <div className="course-item-meta">
                        {nP} jog{nR > 1 && <> · <RoundPill nR={nR} /></>}{entry.nineHole ? " · 9H" : ""}
                        {entry.metresTotal ? ` · ${entry.metresTotal.toLocaleString("pt-PT")} m` : ""}
                      </div>
                      {(entry.cr != null || entry.slope != null) && (
                        <div className="course-item-meta" style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:10, color:"var(--text-3)" }}>
                          CR {entry.cr?.toFixed(1)} · Slope {entry.slope}
                        </div>
                      )}
                      {manuelPlayed && (
                        <span style={{
                          display: "inline-block", marginTop: 4,
                          fontSize: 11, fontWeight: 700,
                          background: "var(--bg-success-subtle)", color: "var(--color-good-dark)",
                          borderRadius: 6, padding: "2px 8px",
                          border: "1px solid var(--color-good)",
                        }}>★ Manuel</span>
                      )}
                      <ExtLink href={entry.sourceUrl} className="tourn-ext-link" style={{ marginTop:4 }}
                        onClick={e => e.stopPropagation()}>
                        🔗 Leaderboard oficial
                      </ExtLink>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {cur ? (
            <>
              <DetailHeader
                title={cur.label}
                sub={<><span className="muted">📍 Doral Golf Resort — {cur.divisionName}</span><ExtLink href={cur.sourceUrl} className="tourn-ext-link" style={{ marginLeft:8 }}>🔗 Leaderboard oficial</ExtLink></>}
              />
              <DivView entry={cur} evo={evo} />
              {(() => {
                const manuelEvo = evo?.get([...evo.keys()].find(k => isM(k)) ?? "");
                if (!manuelEvo) return null;
                return (
                  <div className="card" style={{ background:"var(--bg-success-subtle)", border:"1px solid var(--good)", marginTop:8 }}>
                    <div className="h-md fs-14">🇵🇹 Manuel — Evolução Doral</div>
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ textAlign:"center", flex:"1 1 100px" }}>
                        <div className="muted fs-10">{cur.year - 1} ({manuelEvo.from})</div>
                        <div className="fw-900" style={{ fontSize:24 }}>{manuelEvo.prevTotal}</div>
                      </div>
                      <div style={{ fontSize:24, color:"var(--good-dark)" }}>→</div>
                      <div style={{ textAlign:"center", flex:"1 1 100px" }}>
                        <div className="muted fs-10">{cur.year} ({manuelEvo.to})</div>
                        <div className="fw-900" style={{ fontSize:24, color: manuelEvo.delta < 0 ? "var(--good-dark)" : "var(--text-3)" }}>
                          {manuelEvo.prevTotal + manuelEvo.delta}
                        </div>
                      </div>
                      <div style={{ textAlign:"center", flex:"1 1 80px" }}>
                        <div className="muted fs-10">Δ</div>
                        <div className="fw-900" style={{ fontSize:24, color: manuelEvo.delta < 0 ? "var(--good-dark)" : SC.danger }}>
                          {manuelEvo.delta > 0 ? "+" : ""}{manuelEvo.delta}
                        </div>
                        <div className="muted fs-10">pancadas (2R)</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="center-msg muted">Dados não disponíveis</div>
          )}
        </div>

      </div>
    </div>
    </KidsLinkCtx.Provider>
  );
}

export default function FTMDoralPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Content />;
}