/**
 * FTMDoralPage.tsx — First Tee Miami Doral Jr. Classic Results
 * Lê ficheiros Golf Genius (sem par[], com divisions[], toPar directo)
 * Boys 8-9: 9 buracos (H10-H18) · Boys 10-11 / 12-13: 18 buracos
 */
import React, { useEffect, useState, useMemo } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import { SC } from "../utils/scoreDisplay";
import { isManuelByName as isM } from "../constants/manuel";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { gf, normPaisDisplay } from "../utils/flagUtils";
import { fmtFieldInfo } from "../utils/format";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import DetailHeader from "../ui/DetailHeader";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import Counter from "../ui/Counter";
import { RoundPill, ManuelPill } from "../ui/PillBadge";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import EvoBadge from "../ui/EvoBadge";
import type { ExtraColumn, MultiRoundRow } from "../ui/multiRoundTypes";
import { IntlTournView } from "../ui/IntlTournView";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { type EvoEntry } from "../hooks/useEvoComparison";
import type { CircuitDivision } from "../ui/circuit/types";

/** EvoEntry estendido para Doral:
 *  - prevYear: ano de origem da comparação (mais recente onde participou)
 *  - history: lista completa de todas as edições anteriores (do mais
 *    recente para o mais antigo) — usada no tooltip da coluna "Ant."
 *  - delta sobrescreve o original: passa a ser MÉDIA DE STROKES VS PAR
 *    POR RONDA (em vez de gross total). Necessário porque alguns escalões
 *    jogam 3 rondas e outros 2, e o par muda entre Red Tiger / Golden
 *    Palm / Silver Fox / Blue Monster — só média toPar/ronda permite
 *    comparação justa cross-escalões.
 *  - deltaIsComparable: true se cur e ant têm o mesmo nº de rondas e mesmo
 *    par (i.e. mesmo escalão/configuração). Quando true, podemos mostrar
 *    o delta como diferença de gross total (mais intuitivo).
 *  - curAvgVsPar / refAvgVsPar: para o tooltip mostrar os valores brutos */
export type EvoEntryD = Omit<EvoEntry, "delta"> & {
  prevYear: number;
  history: { year: number; category: string; total: number; pos: number | null; parTotal: number; nR: number }[];
  /** Diff de avg-strokes-vs-par-por-ronda (negativo = melhorou). 1 decimal. */
  delta: number;
  deltaIsComparable: boolean;
  /** Diff absoluto de gross (só significativo se deltaIsComparable). */
  deltaGross: number;
  curAvgVsPar: number;
  refAvgVsPar: number;
};
import { KidsLinkCtx } from "../ui/KidsLink";

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
export interface Entry {
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
/* Todos os anos disponíveis em GolfGenius. Ficheiros em falta (404) são
   tolerados graciosamente pelo loader — só aparecem na UI os que existirem.
   Para scrapar um ano novo: `node scripts/scrape-golfgenius-v3.js --year YYYY` */
export const DATA_FILES: { url: string; sourceUrl: string }[] = [
  {
    url: "/data/ftm_doral_2025.json",
    sourceUrl: "https://2025firstteemiamidoraljrclassic.golfgenius.com/pages/5506943",
  },
  {
    url: "/data/ftm_doral_2024.json",
    sourceUrl: "https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994",
  },
  {
    url: "/data/ftm_doral_2023.json",
    sourceUrl: "https://tftm-2023firstteemiamidoraljrclassic.golfgenius.com/pages/4282619",
  },
  {
    url: "/data/ftm_doral_2022.json",
    sourceUrl: "https://2022firstteemiamidoral.golfgenius.com/pages/3661172",
  },
  {
    url: "/data/ftm_doral_2021.json",
    sourceUrl: "https://2021firstteemiamidoral.golfgenius.com/pages/3122115",
  },
  {
    url: "/data/ftm_doral_2020.json",
    sourceUrl: "https://www.golfgenius.com/pages/2610251",
  },
  {
    url: "/data/ftm_doral_2019.json",
    sourceUrl: "https://2019doralpublix.golfgenius.com/pages/2050901",
  },
  {
    url: "/data/ftm_doral_2018.json",
    sourceUrl: "https://2018doralpublix.golfgenius.com/pages/1568091",
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

/** Normaliza label de divisão GolfGenius para forma consistente.
 *  O widget mistura "Boys 14 & 15" e "Boys 14-15" entre anos — normalizamos
 *  para "Boys 14-15" sempre (excepto "Boys 7 & Under" que mantém-se).
 *  Sem isto, a comparação ano-a-ano falha em divisões com tipografia diferente. */
function normalizeCategoryLabel(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (/7\s*&\s*Under/i.test(s)) return s.replace(/\s*&\s*/g, " & ");
  // "Boys 14 & 15" → "Boys 14-15"
  return s.replace(/(\d+)\s*&\s*(\d+)/g, "$1-$2");
}


export function normalizeFile(raw: RawGG, sourceUrl: string): Entry[] {
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
    // Lookup do DIVISION_META — normaliza o key porque o scraper guarda
    // "Boys 14 & 15" (com ampersand) mas o DIVISION_META tem "Boys 14-15" (hífen).
    // Tenta primeiro o raw, depois a versão normalizada.
    const metaKeyNorm = normalizeCategoryLabel(div.division);
    const meta = DIVISION_META[div.division] ?? DIVISION_META[metaKeyNorm] ?? { course: "", metres: [], metresTotal: 0 };
    const normCategory = normalizeCategoryLabel(div.division);
    return {
      id: `${raw.year}_${normCategory.replace(/\s+/g,"_")}`,
      label: `${raw.year} // ${normCategory}`,
      year: raw.year,
      category: normCategory,
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

/* ── Evo: presença no ano anterior (via hook unificado) ─────── */

/* AccLB removido — agora usa AccumulatedLB da FPGPage */

/* ── Adaptador Entry → FPGTournament para reutilizar AllRoundsScorecardLB ── */
export function entryToTournament(entry: Entry): FPGTournament {
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
        club: p.country ? `${gf(p.country)} ${normPaisDisplay(p.country)}` : "",
        grossTotal: p.total,
        toPar: p.toPar,
        nholes: entry.par.length || (entry.nineHole ? 9 : 18),
        parTotal: entry.parTotal,
        scores: p.rounds[0]?.scores,
        par: entry.par,
        si: entry.metres,       // metros na linha SI
        meters: entry.metres,
        course: entry.course,   // Red Tiger, Golden Palm, Silver Fox, Blue Monster — usado na linha de stats
        courseRating: entry.cr,
        slope: entry.slope,
        roundScores,
        _wd: incomplete,
        _roundsPlayed: p.rounds.length,
        _isPortuguese: /portugal/i.test(p.country || "") || /^(pt|prt)$/i.test(p.country || ""),
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


/** Opções para ocultar colunas FPG-específicas e adaptar ao contexto Doral */
export function doralScorecardOptions(entry: Entry): ScorecardOptions {
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
  };
}

/* DoralScorecard removido — lógica inline no DivView */

/* ── DivView — usa IntlTournView (abas R1·R2·Resumo·📋 Scorecards) ── */
function DivView({ entry, evo }: { entry: Entry; evo?: Map<string, EvoEntryD> }) {
  const tournament = useMemo(() => entryToTournament(entry), [entry]);
  const hasEvo = evo && evo.size > 0;
  const scOptions = useMemo(() => doralScorecardOptions(entry), [entry]);

  type RowWithPos = MultiRoundRow & { _pos?: number | null };
  const evoCols: ExtraColumn<RowWithPos>[] | undefined = hasEvo ? [
    {
      header: "Ant.",
      className: "ta-l fs-11 fw-600 lb-col-divider",
      headerStyle: { width: 72, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        // Tooltip: histórico completo (ano · gross · escalão)
        const tooltip = ev.history
          .map(h => `${h.year}: ${h.total} (${h.category}${h.pos != null ? ` #${h.pos}` : ""})`)
          .join("\n");
        const nEditions = ev.history.length;
        return (
          <span title={tooltip} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>{ev.otherValue}</span>
            {nEditions > 1 && (
              <span style={{
                fontSize: "var(--fs-9)", fontWeight: 700,
                background: "var(--bg-muted, #eee)", color: "var(--text-2, #666)",
                borderRadius: 8, padding: "0 5px", lineHeight: "14px",
              }}>{nEditions}×</span>
            )}
          </span>
        );
      },
    },
    {
      header: "Δ",
      className: "ta-l fs-11 fw-700",
      headerStyle: { width: 60, textAlign: "left" as const, padding: "0 6px" },
      // Δ comparável (mesmo nº rondas + mesmo par): diferença de gross total
      // Δ cross-escalões: diferença de média strokes-vs-par por ronda, sufixo "/r"
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        const value = ev.deltaIsComparable ? ev.deltaGross : ev.delta;
        const sign  = value > 0 ? "+" : "";
        const suffix = ev.deltaIsComparable ? "" : <span className="c-muted" style={{ fontSize: "var(--fs-9)", marginLeft: 1 }}>/r</span>;
        const tooltip = ev.deltaIsComparable
          ? `Δ vs ${ev.prevYear} (gross ${ev.otherValue}, mesmo escalão e nº de rondas)`
          : `Δ média strokes-vs-par por ronda · ${ev.prevYear}: ${ev.refAvgVsPar.toFixed(1)} vs hoje ${ev.curAvgVsPar.toFixed(1)} (comparação cross-escalões com nº de rondas diferentes)`;
        return (
          <span
            title={tooltip}
            style={{ color: value < 0 ? "var(--good-dark)" : value > 0 ? SC.danger : "var(--text-3)" }}
          >
            {sign}{value}{suffix}
          </span>
        );
      },
    },
    {
      header: "Percurso",
      className: "ta-l",
      headerStyle: { width: 160, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev
          ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} prevPos={ev.prevPos} fieldSize={ev.fieldSize} />
          : <span className="c-muted">novo</span>;
      },
    },
  ] : undefined;

  return (
    <IntlTournView
      tournament={tournament}
      scOptions={scOptions}
      evoCols={evoCols}
      accHeader={hasEvo ? <EvoSummary entry={entry} evo={evo!} /> : undefined}
      siLabel="m"
    />
  );
}

/** Mini-resumo de evolução: jogadores que já passaram pelo Doral, com
 *  distribuição por número de edições anteriores (1x, 2x, 3x+). */
function EvoSummary({ evo }: { entry: Entry; evo: Map<string, EvoEntryD> }) {
  if (!evo.size) return null;
  const entries = [...evo.values()];
  const returning = entries.filter(e => e.delta !== 0);
  const improved  = returning.filter(e => e.delta < 0).length;
  const total     = returning.length;
  // Distribuição: quantos jogadores têm 1, 2, 3+ edições anteriores
  let solo = 0, twice = 0, veteran = 0;
  for (const e of entries) {
    if (e.history.length === 1) solo++;
    else if (e.history.length === 2) twice++;
    else veteran++;
  }
  const breakdown: string[] = [];
  if (solo)    breakdown.push(`${solo} c/ 1 edição`);
  if (twice)   breakdown.push(`${twice} c/ 2`);
  if (veteran) breakdown.push(`${veteran} c/ 3+`);
  return (
    <div className="lb-evo-summary">
      {evo.size} jogadores já passaram pelo Doral{breakdown.length ? ` (${breakdown.join(", ")})` : ""}
      {total > 0 ? ` · ${improved}/${total} melhoraram` : ""}
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
  const { kidsMap } = useKidsLinkMap();
  const md = useMasterDetail();

  const [fileMeta, setFileMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    type FileResult = { entries: Entry[]; meta: DataSource };
    Promise.all(
      DATA_FILES.map(async ({ url, sourceUrl }): Promise<FileResult> => {
        try {
          const raw = await cachedFetchJson<RawGG>(url);  // fetchCache: partilhado com KIDSdataLoader
          if (raw == null) {
            return { entries: [], meta: { path: url, status: "error", error: "Ficheiro não encontrado (404)", group: "doral" } };
          }
          const entries = normalizeFile(raw, sourceUrl);
          return { entries, meta: { path: url, status: "loaded", count: entries.length, group: "doral" } };
        } catch (e) {
          return { entries: [], meta: { path: url, status: "error", error: String(e), group: "doral" } };
        }
      })
    ).then(results => {
      setEntries(results.flatMap(r => r.entries));
      setFileMeta(results.map(r => r.meta));
      setLoading(false);
    });
  }, []);

  // Hook deve ser chamado antes dos early returns (regras dos hooks)
  const safeIdx = entries.length ? Math.min(ti, entries.length - 1) : 0;
  const cur = entries.length ? entries[safeIdx] : null;

  /* ─── Filtros da toolbar (estado local) ─── */
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [filterManuel, setFilterManuel] = useState(false);
  const [onlyReturning, setOnlyReturning] = useState(false);
  const [onlyUp, setOnlyUp] = useState(false);
  const [onlyTop10, setOnlyTop10] = useState(false);
  const [onlyPT, setOnlyPT] = useState(false);
  const [onlyVeterans, setOnlyVeterans] = useState(false);
  const resetFilters = () => {
    setSearch(""); setCountry(""); setFilterManuel(false);
    setOnlyReturning(false); setOnlyUp(false); setOnlyTop10(false);
    setOnlyPT(false); setOnlyVeterans(false);
  };
  const hasActiveFilters = !!search || !!country || filterManuel || onlyReturning || onlyUp || onlyTop10 || onlyPT || onlyVeterans;

  // Países disponíveis na divisão actual (para o dropdown)
  const countries = useMemo(() => {
    if (!cur) return [] as string[];
    return [...new Set(cur.players.map(p => p.country).filter(Boolean))].sort();
  }, [cur]);

  // Matching de nomes — mesma lógica que useEvoComparison (firstName + lastName)
  const nameMatch = (a: string, b: string): boolean => {
    const na = a.toLowerCase().replace(/\s+/g, " ").trim();
    const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
    if (na === nb) return true;
    const aParts = na.split(" ");
    const bParts = nb.split(" ");
    return aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1];
  };

  const { evo, evoYear, manuelEvo } = useMemo<{
    evo: Map<string, EvoEntryD> | undefined;
    evoYear: string | undefined;
    manuelEvo: EvoEntryD | undefined;
  }>(() => {
    if (!cur) return { evo: undefined, evoYear: undefined, manuelEvo: undefined };
    // Anos anteriores ao actual, do mais recente para o mais antigo.
    const earlierYears = [...new Set(entries.map(e => e.year))]
      .filter(y => y < cur.year).sort((a, b) => b - a);
    if (!earlierYears.length) return { evo: undefined, evoYear: undefined, manuelEvo: undefined };

    // Pré-computar fieldSize por (ano, categoria) — para o badge.
    const fieldSizeMap = new Map<string, number>(); // "year|category" → N
    for (const e of entries) {
      if (e.year >= cur.year) continue;
      const eNR = Math.max(...e.players.map(p => p.rounds.length), 0);
      const n = e.players.filter(p => p.rounds.length === eNR && p.total != null).length;
      fieldSizeMap.set(`${e.year}|${e.category}`, n);
    }

    const nR = Math.max(...cur.players.map(p => p.rounds.length), 0);
    const currentPlayers = cur.players.filter(p => p.total != null && p.rounds.length === nR);

    const evoMap = new Map<string, EvoEntryD>();
    let manuelEvo: EvoEntryD | undefined;

    const curNR = nR;
    const curParTotal = cur.parTotal || 71; // fallback razoável (Golden Palm)
    const curAvgVsPar = (total: number) => (total - curParTotal * curNR) / curNR;

    for (const curP of currentPlayers) {
      // Recolher TODAS as participações anteriores.
      const history: { year: number; category: string; total: number; pos: number | null; parTotal: number; nR: number }[] = [];
      for (const y of earlierYears) {
        const yearEntries = entries.filter(e => e.year === y);
        for (const e of yearEntries) {
          const eNR = Math.max(...e.players.map(p => p.rounds.length), 0);
          const refP = e.players.find(p =>
            p.total != null && p.rounds.length === eNR && nameMatch(curP.name, p.name));
          if (refP) {
            history.push({
              year: y, category: e.category, total: refP.total!, pos: refP.pos ?? null,
              parTotal: e.parTotal || 71, nR: eNR,
            });
            break; // 1 entrada por ano
          }
        }
      }
      if (history.length === 0) continue;
      const mostRecent = history[0];

      // Δ = média strokes vs par por ronda (cross-escalões fair)
      const curAvgToPar = curAvgVsPar(curP.total!);
      const refAvgToPar = (mostRecent.total - mostRecent.parTotal * mostRecent.nR) / mostRecent.nR;
      const deltaAvg = Math.round((curAvgToPar - refAvgToPar) * 10) / 10;

      // Δ comparável directo (mesmo nR + mesmo parTotal)?
      const deltaIsComparable = curNR === mostRecent.nR && curParTotal === mostRecent.parTotal;
      const deltaGross = curP.total! - mostRecent.total;

      const entry: EvoEntryD = {
        otherValue: mostRecent.total,
        delta: deltaAvg,
        deltaIsComparable,
        deltaGross,
        curAvgVsPar: curAvgToPar,
        refAvgVsPar: refAvgToPar,
        from: mostRecent.category,
        to: cur.category,
        pill: mostRecent.category === cur.category ? "EQ" : "UP",
        prevPos: mostRecent.pos,
        fieldSize: fieldSizeMap.get(`${mostRecent.year}|${mostRecent.category}`),
        prevYear: mostRecent.year,
        history,
      };
      evoMap.set(curP.name, entry);
      if (isM(curP.name)) manuelEvo = entry;
    }

    return {
      evo: evoMap.size ? evoMap : undefined,
      evoYear: String(cur.year - 1),
      manuelEvo,
    };
  }, [cur, entries]);

  // Aplicar filtros à divisão actual. O `evo` continua a usar o cur completo
  // (para conhecer todos os jogadores e suas histórias) mas o que mostramos
  // na tabela e nos cards passa por este filtro.
  const filteredCur = useMemo(() => {
    if (!cur) return null;
    if (!hasActiveFilters) return cur;
    let players = cur.players;
    if (search) {
      const q = search.toLowerCase().trim();
      players = players.filter(p => p.name.toLowerCase().includes(q));
    }
    if (country)        players = players.filter(p => p.country === country);
    if (filterManuel)   players = players.filter(p => isM(p.name));
    if (onlyReturning)  players = players.filter(p => evo?.has(p.name));
    if (onlyUp)         players = players.filter(p => evo?.get(p.name)?.pill === "UP");
    if (onlyTop10)      players = players.filter(p => p.pos != null && p.pos <= 10);
    if (onlyPT)         players = players.filter(p => p.country === "Portugal" || isM(p.name));
    if (onlyVeterans)   players = players.filter(p => (evo?.get(p.name)?.history.length ?? 0) >= 3);
    return { ...cur, players };
  }, [cur, evo, hasActiveFilters, search, country, filterManuel, onlyReturning, onlyUp, onlyTop10, onlyPT, onlyVeterans]);

  if (loading) return <LoadingState />;
  if (!entries.length || !cur) return (
    <div className="center-msg muted">
      Nenhum ficheiro de dados encontrado.<br />
      <span className="fs-10">Coloca <code>ftm_doral_2025.json</code> em <code>public/data/</code></span>
    </div>
  );

  // Agrupar por ano para o sidebar
  const years = [...new Set(entries.map(e => e.year))].sort((a, b) => b - a);

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
    <DataSourcesProvider tournaments={[]}>
    <div className="tourn-layout">

      {/* Toolbar */}
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>🇺🇸 Doral</ToolbarTitle>
        <DataSourcesChip sources={fileMeta} />
        {cur && <ToolbarMeta>📍 {cur.category}</ToolbarMeta>}
        <ToolbarSep />
        {/* Pesquisa */}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔎 Pesquisar jogador…" className="input fs-12 shrink-0"
          style={{ width: 160, height: 26 }} />
        {/* País */}
        <select className="select fs-11 shrink-0" value={country} onChange={e => setCountry(e.target.value)}
          style={{ height: 26, minWidth: 85 }}>
          <option value="">🌍 País</option>
          {countries.map(c => <option key={c} value={c}>{gf(c)} {c}</option>)}
        </select>
        {/* ★ Manuel */}
        <button
          className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : "")}
          style={filterManuel
            ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)" }
            : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
          onClick={() => setFilterManuel(v => !v)}>★ Manuel</button>
        {/* 🇵🇹 PT */}
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyPT ? " active" : "")}
          style={onlyPT
            ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)" }
            : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
          onClick={() => setOnlyPT(v => !v)}
          title="Só portugueses (e Manuel)">🇵🇹 PT</button>
        {/* ↻ Regressados */}
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyReturning ? " active" : " tourn-tab-muted")}
          style={{ flexShrink: 0 }}
          onClick={() => setOnlyReturning(v => !v)}
          title="Só jogadores que já tinham jogado o Doral noutro ano">↻ Regressados</button>
        {/* ⬆ Subiram de escalão */}
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyUp ? " active" : " tourn-tab-muted")}
          style={{ flexShrink: 0 }}
          onClick={() => setOnlyUp(v => !v)}
          title="Só jogadores que subiram de escalão face à última edição">⬆ Subiram</button>
        {/* 🏆 Top 10 */}
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyTop10 ? " active" : " tourn-tab-muted")}
          style={{ flexShrink: 0 }}
          onClick={() => setOnlyTop10(v => !v)}
          title="Só os 10 melhores classificados">🏆 Top 10</button>
        {/* ★ Veteranos (3+ edições) */}
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyVeterans ? " active" : " tourn-tab-muted")}
          style={{ flexShrink: 0 }}
          onClick={() => setOnlyVeterans(v => !v)}
          title="Jogadores com 3+ edições anteriores">✦ Veteranos</button>
        {/* Reset */}
        {hasActiveFilters && (
          <button onClick={resetFilters} className="tourn-tab tourn-tab-sm"
            style={{ flexShrink: 0, background: "var(--bg-danger)", color: "var(--color-danger-dark)", borderColor: "var(--color-danger)" }}>
            ✕
          </button>
        )}
        {filteredCur && (() => {
          const nR = Math.max(...filteredCur.players.map(p => p.rounds.length), 0);
          const total = cur ? cur.players.filter(p => p.rounds.length === nR).length : 0;
          const shown = filteredCur.players.filter(p => p.rounds.length === nR).length;
          return <Counter ml="auto">{hasActiveFilters ? `${shown}/${total}` : fmtFieldInfo(shown, nR, filteredCur.category)}</Counter>;
        })()}
      </Toolbar>

      {/* Master-detail */}
      <div className="master-detail">

        {/* Sidebar — estilo USKIDS: 1 entrada por ANO (torneio).
            Escalões aparecem como tabs no detalhe. */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          <SidebarSectionTitle dark color="var(--color-doral-dark)" textColor="var(--color-doral-text)" borderColor="var(--color-doral-mid)" letterSpacing="0.08em">
            🇺🇸 First Tee Miami Doral Jr. Classic
          </SidebarSectionTitle>
          {years.map(year => {
            const yearEntries = entries.filter(e => e.year === year);
            const isActiveYear = cur?.year === year;
            const totalPlayers = yearEntries.reduce((acc, e) => {
              const nR = Math.max(...e.players.map(p => p.rounds.length), 0);
              return acc + e.players.filter(p => p.rounds.length === nR).length;
            }, 0);
            const manuelPlayed = yearEntries.some(e => e.players.some(p => isM(p.name)));
            return (
              <div key={year}
                role="button" tabIndex={0}
                className={`course-item ${isActiveYear ? "active" : ""}`}
                onClick={() => {
                  const idx = entries.findIndex(e => e.year === year);
                  if (idx >= 0) { setTi(idx); md.onSelect(); }
                }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") {
                  const idx = entries.findIndex(en => en.year === year);
                  if (idx >= 0) { setTi(idx); md.onSelect(); }
                }}}
                style={{ cursor: "pointer", borderLeft: "4px solid var(--color-doral-mid)", borderRadius: "0 6px 6px 0" }}>
                <div className="course-item-name" style={{ fontSize: "var(--fs-14)" }}>{year}</div>
                <div className="course-item-meta">📍 Trump National Doral</div>
                <div className="course-item-meta" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{yearEntries.length} escalões</span>
                  <span className="muted">·</span>
                  <span>{totalPlayers} jog</span>
                  {manuelPlayed && <ManuelPill />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {cur ? (
            <>
              <DetailHeader
                title={`${cur.year} · ${cur.category}`}
                sub={<><span className="muted">📍 Doral Golf Resort — {cur.divisionName}</span><ExtLink href={cur.sourceUrl} className="tourn-ext-link" style={{ marginLeft:8 }}>🔗 Leaderboard oficial</ExtLink></>}
              />
              {/* Tabs de escalão — estilo USKIDS (.tab-under: sublinhado simples) */}
              {(() => {
                const yearEntries = entries.filter(e => e.year === cur.year);
                if (yearEntries.length <= 1) return null;
                return (
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 10, overflowX: "auto" }}>
                    {yearEntries.map(e => {
                      const idx = entries.indexOf(e);
                      const active = idx === safeIdx;
                      const eNR = Math.max(...e.players.map(p => p.rounds.length), 0);
                      const eNP = e.players.filter(p => p.rounds.length === eNR).length;
                      const eHasManuel = e.players.some(p => isM(p.name));
                      return (
                        <button key={e.id}
                          onClick={() => setTi(idx)}
                          className={"tab-under" + (active ? " active" : "")}
                          title={`${e.category}${e.course ? ` — ${e.course}` : ""}`}>
                          {e.category}
                          <span className="fs-10 muted" style={{ marginLeft: 4 }}>{eNP}</span>
                          {eHasManuel && <span style={{ marginLeft: 4, color: "var(--color-good)" }}>★</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              <DivView entry={filteredCur || cur} evo={evo} />
              {manuelEvo && (() => {
                const manuelCur = cur.players.find(p => isM(p.name));
                const curGross = manuelCur?.total ?? null;
                const dValue = manuelEvo.deltaIsComparable ? manuelEvo.deltaGross : manuelEvo.delta;
                const dSuffix = manuelEvo.deltaIsComparable ? "" : "/r";
                const dLabel = manuelEvo.deltaIsComparable
                  ? `pancadas (${cur.players[0]?.rounds.length ?? 2}R)`
                  : "strokes vs par / ronda";
                return (
                  <div className="card" style={{ background:"var(--bg-success-subtle)", border:"1px solid var(--good)", marginTop:8 }}>
                    <div className="h-md">🇵🇹 Manuel — Evolução Doral</div>
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ textAlign:"center", flex:"1 1 100px" }}>
                        <div className="muted fs-10">{manuelEvo.prevYear} ({manuelEvo.from})</div>
                        <div className="fw-900" style={{ fontSize: "var(--fs-24)" }}>{manuelEvo.otherValue}</div>
                      </div>
                      <div style={{ fontSize: "var(--fs-24)", color:"var(--good-dark)" }}>→</div>
                      <div style={{ textAlign:"center", flex:"1 1 100px" }}>
                        <div className="muted fs-10">{cur.year} ({manuelEvo.to})</div>
                        <div className="fw-900" style={{ fontSize: "var(--fs-24)", color: dValue < 0 ? "var(--good-dark)" : "var(--text-3)" }}>
                          {curGross != null ? curGross : "—"}
                        </div>
                      </div>
                      <div style={{ textAlign:"center", flex:"1 1 80px" }}>
                        <div className="muted fs-10">Δ</div>
                        <div className="fw-900" style={{ fontSize: "var(--fs-24)", color: dValue < 0 ? "var(--good-dark)" : SC.danger }}>
                          {dValue > 0 ? "+" : ""}{dValue}{dSuffix}
                        </div>
                        <div className="muted fs-10">{dLabel}</div>
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
    </DataSourcesProvider>
    </KidsLinkCtx.Provider>
  );
}

export default function DORALPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <Content />;
}

/* ═══════════════════════════════════════════════════════════════
   Helpers para a página MAJOR (CircuitShell) — evolução multi-ano
   própria da Doral + CircuitDivision (results + evoCols + EvoSummary).
   ═══════════════════════════════════════════════════════════════ */

/** Evolução multi-ano da Doral para uma Entry (histórico de edições). Pura. */
export function doralEvoFor(cur: Entry, entries: Entry[]): Map<string, EvoEntryD> | undefined {
  const earlierYears = [...new Set(entries.map((e) => e.year))].filter((y) => y < cur.year).sort((a, b) => b - a);
  if (!earlierYears.length) return undefined;
  const nameMatch = (a: string, b: string): boolean => {
    const na = a.toLowerCase().replace(/\s+/g, " ").trim();
    const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
    if (na === nb) return true;
    const ap = na.split(" "), bp = nb.split(" ");
    return ap[0] === bp[0] && ap[ap.length - 1] === bp[bp.length - 1];
  };
  const fieldSizeMap = new Map<string, number>();
  for (const e of entries) {
    if (e.year >= cur.year) continue;
    const eNR = Math.max(...e.players.map((p) => p.rounds.length), 0);
    const n = e.players.filter((p) => p.rounds.length === eNR && p.total != null).length;
    fieldSizeMap.set(`${e.year}|${e.category}`, n);
  }
  const curNR = Math.max(...cur.players.map((p) => p.rounds.length), 0);
  const currentPlayers = cur.players.filter((p) => p.total != null && p.rounds.length === curNR);
  const curParTotal = cur.parTotal || 71;
  const curAvgVsPar = (total: number) => (total - curParTotal * curNR) / curNR;
  const evoMap = new Map<string, EvoEntryD>();
  for (const curP of currentPlayers) {
    const history: { year: number; category: string; total: number; pos: number | null; parTotal: number; nR: number }[] = [];
    for (const y of earlierYears) {
      const yearEntries = entries.filter((e) => e.year === y);
      for (const e of yearEntries) {
        const eNR = Math.max(...e.players.map((p) => p.rounds.length), 0);
        const refP = e.players.find((p) => p.total != null && p.rounds.length === eNR && nameMatch(curP.name, p.name));
        if (refP) { history.push({ year: y, category: e.category, total: refP.total!, pos: refP.pos ?? null, parTotal: e.parTotal || 71, nR: eNR }); break; }
      }
    }
    if (history.length === 0) continue;
    const mostRecent = history[0];
    const curAvgToPar = curAvgVsPar(curP.total!);
    const refAvgToPar = (mostRecent.total - mostRecent.parTotal * mostRecent.nR) / mostRecent.nR;
    const deltaAvg = Math.round((curAvgToPar - refAvgToPar) * 10) / 10;
    const deltaIsComparable = curNR === mostRecent.nR && curParTotal === mostRecent.parTotal;
    evoMap.set(curP.name, {
      otherValue: mostRecent.total, delta: deltaAvg, deltaIsComparable, deltaGross: curP.total! - mostRecent.total,
      curAvgVsPar: curAvgToPar, refAvgVsPar: refAvgToPar,
      from: mostRecent.category, to: cur.category,
      pill: mostRecent.category === cur.category ? "EQ" : "UP",
      prevPos: mostRecent.pos, fieldSize: fieldSizeMap.get(`${mostRecent.year}|${mostRecent.category}`),
      prevYear: mostRecent.year, history,
    });
  }
  return evoMap.size ? evoMap : undefined;
}

/** CircuitDivision de uma Entry Doral (results + evoCols multi-ano + EvoSummary). */
export function doralMajorDivision(entry: Entry, evo: Map<string, EvoEntryD> | undefined): CircuitDivision {
  const hasEvo = !!evo && evo.size > 0;
  type RowWithPos = MultiRoundRow & { _pos?: number | null };
  const evoCols: ExtraColumn<RowWithPos>[] | undefined = hasEvo ? [
    {
      header: "Ant.", className: "ta-l fs-11 fw-600 lb-col-divider",
      headerStyle: { width: 72, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        const tooltip = ev.history.map((h) => `${h.year}: ${h.total} (${h.category}${h.pos != null ? ` #${h.pos}` : ""})`).join("\n");
        const nEditions = ev.history.length;
        return (
          <span title={tooltip} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>{ev.otherValue}</span>
            {nEditions > 1 && <span style={{ fontSize: "var(--fs-9)", fontWeight: 700, background: "var(--bg-muted, #eee)", color: "var(--text-2, #666)", borderRadius: 8, padding: "0 5px", lineHeight: "14px" }}>{nEditions}×</span>}
          </span>
        );
      },
    },
    {
      header: "Δ", className: "ta-l fs-11 fw-700", headerStyle: { width: 60, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        const value = ev.deltaIsComparable ? ev.deltaGross : ev.delta;
        const sign = value > 0 ? "+" : "";
        const suffix = ev.deltaIsComparable ? "" : <span className="c-muted" style={{ fontSize: "var(--fs-9)", marginLeft: 1 }}>/r</span>;
        const tooltip = ev.deltaIsComparable
          ? `Δ vs ${ev.prevYear} (gross ${ev.otherValue}, mesmo escalão e nº de rondas)`
          : `Δ média strokes-vs-par por ronda · ${ev.prevYear}: ${ev.refAvgVsPar.toFixed(1)} vs hoje ${ev.curAvgVsPar.toFixed(1)}`;
        return <span title={tooltip} style={{ color: value < 0 ? "var(--good-dark)" : value > 0 ? SC.danger : "var(--text-3)" }}>{sign}{value}{suffix}</span>;
      },
    },
    {
      header: "Percurso", className: "ta-l", headerStyle: { width: 160, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} prevPos={ev.prevPos} fieldSize={ev.fieldSize} /> : <span className="c-muted">novo</span>;
      },
    },
  ] : undefined;
  const results = entryToTournament(entry);
  if (hasEvo) for (const pl of results.players) {
    const ev = evo!.get(pl.name);
    if (ev) { (pl as unknown as { _regressado?: boolean })._regressado = true; if (ev.pill === "UP") (pl as unknown as { _subiu?: boolean })._subiu = true; }
  }
  return {
    key: entry.id,
    escalao: entry.category,
    tabLabel: entry.category,
    hasManuel: entry.players.some((p) => isM(p.name)),
    links: entry.sourceUrl ? [{ label: "GolfGenius", url: entry.sourceUrl, icon: "🔗" }] : undefined,
    results,
    scOptions: doralScorecardOptions(entry),
    siLabel: "m",
    evoCols,
    accHeader: hasEvo ? <EvoSummary entry={entry} evo={evo!} /> : undefined,
  };
}
