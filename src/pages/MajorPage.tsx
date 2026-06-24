/**
 * MajorPage.tsx — 🏆 MAJOR (Doral + BJGT/EOWAGR) no CircuitShell.
 *
 * Funde as antigas páginas Doral e BJGT numa única página-mãe assente no
 * CircuitShell, agrupada por série (Doral / BJGT / EOWAGR) e ano. Cada série/ano
 * é um "torneio" com divisões por categoria (escalão). O detalhe reutiliza os
 * módulos ricos de cada origem (HoleDiff/ManuelDay/Field Stats + evolução
 * ano-a-ano) via os helpers exportados `bjgtMajorDivision` / `doralMajorDivision`.
 *
 * As rotas antigas /doral e /bjgt redireccionam para /major (ver App.tsx).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision } from "../ui/circuit/types";
import { URLS as BJGT_URLS, loadT as bjgtLoadT, bjgtEvoFor, bjgtMajorDivision, makeEvoCols, EvoSummary, type TDef } from "./BJGTPage";
import { DATA_FILES as DORAL_FILES, normalizeFile, doralEvoFor, doralMajorDivision, type Entry } from "./DORALPage";
import { buildEvoMap, type EvoEntry } from "../hooks/useEvoComparison";
import { gf, normPaisDisplay } from "../utils/flagUtils";
import type { Tournament as FPGTournament, Player as FPGPlayer, ScorecardOptions } from "./FPGPage";
import type { FpgDraw } from "../data/nacional2026Loader";
import { TournamentDetail } from "./fpg/TournamentDetail";
import { EMPTY_ESC_LOOKUP, EMPTY_PLAYERS_DB } from "../ui/tournamentPrimitives";

/** id do torneio BJGT/EOWAGR → URL de origem (BlueGolf), para os links do header. */
const BJGT_SRC = new Map<string, string>(BJGT_URLS.map((m) => [m.id, m.sourceUrl]));

/** Ordena escalões: Boys antes de Girls, idade crescente (7&U→…→16-18), WAGR no fim. */
function majorDivCompare(a: CircuitDivision, b: CircuitDivision): number {
  const key = (d: CircuitDivision): [number, number] => {
    const lab = d.tabLabel || d.escalao;
    const g = /^\s*boys/i.test(lab) ? 0 : /^\s*girls/i.test(lab) ? 1 : 2;
    const m = lab.match(/\d+/);
    const age = /wagr/i.test(lab) ? 999 : (m ? parseInt(m[0], 10) : 998);
    return [g, age];
  };
  const ka = key(a), kb = key(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

/** Constrói os entries do CircuitShell a partir dos dados BJGT + Doral. */
function buildMajorEntries(bjgtDefs: TDef[], doralEntries: Entry[], doralNames: Map<number, string>): CircuitEntry[] {
  const out: CircuitEntry[] = [];

  // BJGT + EOWAGR: agrupar por (série, ano) → entry com divisões por categoria.
  const groups = new Map<string, TDef[]>();
  for (const d of bjgtDefs) {
    const k = `${d.series}|${d.year}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  for (const [k, defs] of groups) {
    const [series, yearStr] = k.split("|");
    const year = Number(yearStr);
    const seriesLabel = series === "eowagr" ? "EU" : "BJGT";
    const divisions: CircuitDivision[] = defs
      .map((d) => {
        const { evo, evoYear } = bjgtEvoFor(d, bjgtDefs);
        return bjgtMajorDivision(d, evo, evoYear, BJGT_SRC.get(d.id));
      })
      .sort(majorDivCompare);
    const country = series === "eowagr" ? "França" : "Espanha";
    const courses = [...new Set(divisions.map((dv) => dv.results?.campo).filter((c): c is string => !!c))];
    // Nome real do evento (do JSON), sem o sufixo do escalão (" - Boys 10-11").
    const evName = (defs[0]?.data.tournament || "").replace(/\s*[-–]\s*(boys|girls|u\d|sub).*$/i, "").trim();
    const roundDates = defs[0]?.roundDates;
    const roundsCount = roundDates?.length || defs[0]?.data.players[0]?.rounds?.length || undefined;
    const dateStart = roundDates?.[0] ? `${roundDates[0]} ${year}` : undefined;
    const dateEnd = roundDates && roundDates.length > 1 ? `${roundDates[roundDates.length - 1]} ${year}` : undefined;
    out.push({
      id: `${series}:${year}`,
      year,
      name: evName || `${seriesLabel} ${year}`,
      series: seriesLabel,
      source: series,
      course: courses.length === 1 ? courses[0] : country,
      dateStart,
      dateEnd,
      roundsCount,
      playerCount: defs.reduce((s, d) => s + d.data.players.filter((p) => p.total != null).length, 0),
      divisionCount: divisions.length,
      hasManuel: defs.some((d) => d.data.players.some((p) => isM(p.name))),
      divisions,
    });
  }

  // Doral: agrupar por ano → entry com divisões por categoria.
  const doralByYear = new Map<number, Entry[]>();
  for (const e of doralEntries) {
    if (!doralByYear.has(e.year)) doralByYear.set(e.year, []);
    doralByYear.get(e.year)!.push(e);
  }
  for (const [year, ents] of doralByYear) {
    const divisions: CircuitDivision[] = ents
      .map((e) => doralMajorDivision(e, doralEvoFor(e, doralEntries)))
      .sort(majorDivCompare);
    const dCourses = [...new Set(ents.map((e) => e.course).filter((c): c is string => !!c))];
    const doralRounds = Math.max(...ents.map((e) => Math.max(...e.players.map((p) => p.rounds.length), 0)), 0) || undefined;
    out.push({
      id: `doral:${year}`,
      year,
      name: doralNames.get(year) || `Doral ${year}`,
      series: "Doral",
      source: "doral",
      course: dCourses.length === 1 ? dCourses[0] : "USA",
      roundsCount: doralRounds,
      playerCount: ents.reduce((s, e) => s + e.players.filter((p) => p.total != null).length, 0),
      divisionCount: divisions.length,
      hasManuel: ents.some((e) => e.players.some((p) => isM(p.name))),
      divisions,
    });
  }

  return out;
}

/* ─── Junior Orange Bowl — ficheiros orangebowl_<ano>.json (scrape-junior-orange-bowl.js) ─── */
interface JobPlayer { pos: string; name: string; country: string; location?: string; detailId?: string | null; toPar: number | null; total: number | null; roundGross: number[]; rounds: { day: number; scores: number[]; f9?: number; b9?: number; gross: number; startingHole?: number }[]; }
interface JobDrawGroup { time?: string; startHole?: number | null; players: { name: string; tee?: string }[]; }
interface JobDivision { division: string; source?: string; tid?: string; par?: (number | null)[] | null; parTotal?: number | null; meters?: (number | null)[] | null; si?: (number | null)[] | null; teeName?: string | null; metersTotal?: number | null; players: JobPlayer[]; draws?: Record<string, { round: number; label?: string; date?: string; groups: JobDrawGroup[] }>; }
interface JobFile { tournament: string; year: number; source?: string; course?: string | null; divisions: JobDivision[]; }

// Divisão 1 = Rapazes, Divisão 2 = Raparigas (consistente em todas as edições JOB).
const JOB_DIV_LABELS = ["Rapazes", "Raparigas"];

function jobScorecardOptions(): ScorecardOptions {
  return { hideHCP: true, hideSD: true, hideEsc: true, hideFed: true, hideTee: true, clubLabel: "País" };
}

function jobDivisionToTournament(div: JobDivision, name: string): FPGTournament {
  // Incluir quem tem total OU rondas com scores — em torneios a DECORRER o
  // GolfGenius ainda não publica o `total` agregado (fica null), mas há já
  // scorecards por ronda que queremos mostrar.
  const players = div.players.filter((p) => p.total != null || (p.rounds || []).some((r) => (r.scores || []).length > 0));
  const nR = Math.max(...players.map((p) => (p.rounds ? p.rounds.length : 0) || p.roundGross.length), 0);

  // Detectar divisão de 9 buracos (ex: FM "10 and Under"). ⚠ Os mais novos
  // jogam 9 buracos e ALTERNAM o nine por dia: um dia o FRONT-9 (startingHole=1),
  // outro o BACK-9 (startingHole=10). O par/metros/SI vêm do course_analytics com
  // 18 buracos → é preciso fatiar para os 9 jogados POR RONDA (consoante o
  // startingHole dessa ronda), senão a coloração buraco-a-buraco fica errada.
  // ⚠ Decidir pela MAIORIA das rondas, não por `some`: numa divisão de 18
  // buracos basta UM jogador que desistiu a meio (uma ronda de 9 scores) para
  // `some` marcar a divisão inteira como 9 buracos e fatiar todos os cartões
  // a 9 (ex: FM 2026 "13 & 14" tem 328 rondas de 18 + 1 de 9 por desistência).
  let n9 = 0, n18 = 0;
  for (const p of players) for (const r of p.rounds || []) {
    const L = r.scores?.length;
    if (L === 9) n9++; else if (L === 18) n18++;
  }
  const nineHole = n9 > n18;
  const holes = nineHole ? 9 : 18;

  // Arrays do campo completo (18 buracos), quando válidos.
  const full18 = (arr?: (number | null)[] | null): number[] | null =>
    Array.isArray(arr) && arr.length === 18 && arr.every((x) => x != null) ? (arr as number[]) : null;
  const par18 = full18(div.par);
  const meters18 = full18(div.meters);
  const si18 = full18(div.si);

  // Fatia um array de 18 para os 9 buracos de uma ronda (back-9 → offset 9).
  const sliceFor = (arr18: number[] | null, startHole?: number): number[] => {
    if (!arr18) return [];
    if (!nineHole) return arr18;
    const off = startHole === 10 ? 9 : 0;
    return arr18.slice(off, off + 9);
  };

  // Par derivado (fallback para ficheiros sem par[18]): par "chato" de `holes`.
  let parDerived: number[] | null = null;
  if (!par18) {
    const ref = players.find((p) => p.toPar != null && p.total != null && (p.rounds?.length || p.roundGross.length));
    const refR = ref ? (ref.rounds?.length || ref.roundGross.length) : nR;
    const pt = ref && refR ? Math.round((ref.total! - ref.toPar!) / refR) : (nineHole ? 36 : 72);
    const hi = Math.ceil(pt / holes), lo = Math.floor(pt / holes), rem = pt % holes;
    parDerived = Array.from({ length: holes }, (_, i) => (i < rem ? hi : lo));
  }

  // Par/SI/metros por ronda em função do seu startingHole.
  const parForRound = (sh?: number) => (par18 ? sliceFor(par18, sh) : (parDerived || []));
  const metersForRound = (sh?: number) => sliceFor(meters18, sh);
  const siForRound = (sh?: number) => sliceFor(si18, sh);

  // Representativo (cabeçalho/stats): a 1ª ronda jogada na divisão.
  const repSH = players.find((p) => p.rounds?.length)?.rounds?.[0]?.startingHole;
  const par = parForRound(repSH);
  const parTotal = par.reduce((a, b) => a + b, 0) || (nineHole ? 36 : 72);
  // A linha de metros no scorecard só aparece quando há teeName.
  const teeName = meters18 ? (div.teeName || "Tee") : undefined;

  const fpg: FPGPlayer[] = players.map((p) => {
    const rounds = (p.rounds || []).map((r, ri) => {
      // Preferir a soma dos scores quando a ronda está completa (mais fiável que
      // o `gross` do leaderboard, que pode divergir em ficheiros antigos).
      const sc = r.scores || [];
      const gross = sc.length === holes ? sc.reduce((a, b) => a + b, 0) : r.gross;
      return { round: ri + 1, gross, scores: sc, pars: parForRound(r.startingHole), si: siForRound(r.startingHole), meters: metersForRound(r.startingHole), teeName };
    });
    // Em torneios a DECORRER o GolfGenius dá o to-par corrente mas ainda não o
    // `total` agregado (null). Reconstruir o gross/to-par acumulado das rondas
    // jogadas — senão o jogador aparece como WD e a média fica 999.
    const playedGross = rounds.reduce((s, r) => s + (r.gross || 0), 0);
    const grossTotal = p.total ?? (rounds.length ? playedGross : null);
    const toPar = p.toPar ?? (rounds.length ? playedGross - parTotal * rounds.length : null);
    return {
      scoreId: p.detailId || p.name,
      pos: parseInt(String(p.pos).replace(/^T/i, ""), 10) || null,
      name: p.name,
      club: p.country ? `${gf(p.country)} ${normPaisDisplay(p.country)}` : "",
      grossTotal,
      toPar,
      nholes: holes,
      parTotal,
      scores: p.rounds?.[0]?.scores,
      par,
      roundScores: rounds,
      _roundsPlayed: rounds.length || p.roundGross.length,
      _isPortuguese: /portugal/i.test(p.country || "") || /^(pt|prt)$/i.test(p.country || ""),
    } as FPGPlayer;
  });
  return { name, tcode: `job-${name}`, date: "", campo: "", rounds: nR, playerCount: fpg.length, players: fpg };
}

/** Evolução ano-a-ano do JOB/FM: marca quem regressou da edição do ano anterior
 *  e em que escalão estava, usando o to-par total como valor comparável.
 *
 *  ⚠ A referência é o conjunto de TODOS os escalões do ano anterior — não o
 *  mesmo escalão (nem, pior, o mesmo ÍNDICE de divisão, que muda de ano para
 *  ano e dava 0 correspondências). Num torneio júnior os miúdos SOBEM de
 *  escalão a cada ano, por isso o regressado típico estava num escalão mais
 *  novo na edição anterior. Cada jogador da referência traz o seu escalão de
 *  origem (`from`) para o badge "11 & 12 → 13 & 14" funcionar; o `divLabel`
 *  resolve o label de forma idêntica para actual e referência (senão o mesmo
 *  escalão apareceria sempre como "subiu"). */
function jobEvoFor(
  file: JobFile, all: JobFile[], divIndex: number,
  divLabel: (dv: JobDivision, idx: number) => string,
): { evo?: Map<string, EvoEntry>; evoYear?: string } {
  const prev = all.find((f) => f.year === file.year - 1);
  if (!prev) return {};
  const curDiv = file.divisions[divIndex];
  if (!curDiv) return {};
  const completos = (d: JobDivision, idx: number) => d.players
    .filter((p) => p.toPar != null && p.total != null)
    .map((p) => ({ name: p.name, value: p.toPar as number, category: divLabel(d, idx) }));
  const raw = buildEvoMap({
    currentPlayers: completos(curDiv, divIndex),
    referencePlayers: prev.divisions.flatMap((d, idx) => completos(d, idx)),
    referenceYear: String(file.year - 1),
    isManuel: isM,
  });
  return { evo: raw.evoMap, evoYear: raw.evoYear };
}

// Colunas do DrawTab sem dados na fonte GolfGenius/internacional (FED/HCP/Nasc.
// não existem; ESC é uniforme = o escalão; TEE não vem por jogador). Escondidas
// para o draw do FM não ter 5 colunas vazias. O CLUBE preenche-se com o país.
const FM_DRAW_HIDE_COLS = { esc: true, fed: true, hcp: true, tee: true, nasc: true } as const;

/** Converte os draws scraped (FM) para o formato FpgDraw que o TournamentDetail
 *  consome via `tournament._draws`. Preenche `clube` com o país do jogador
 *  (cruzando o nome com o leaderboard), já que o tee sheet só traz o nome. */
function fmDrawsToFpg(draws: NonNullable<JobDivision["draws"]>, players: JobPlayer[]): Record<string, FpgDraw> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const countryByName = new Map<string, string>();
  for (const p of players) {
    if (p.name && p.country) countryByName.set(norm(p.name), `${gf(p.country)} ${normPaisDisplay(p.country)}`.trim());
  }
  return Object.fromEntries(Object.entries(draws).map(([rn, info]) => [rn, {
    groups: (info.groups || []).map((g) => ({
      teeTime: g.time || "",
      startHole: g.startHole ?? null,
      tee: null,
      players: g.players.map((p) => ({ nome: p.name, clube: countryByName.get(norm(p.name)) ?? null, tee: p.tee ?? null })),
    })),
  } as FpgDraw]));
}

function buildFmEntries(files: JobFile[]): CircuitEntry[] {
  return files.map((f): CircuitEntry => {
    const divisions: CircuitDivision[] = f.divisions.map((dv, i) => {
      const label = dv.division; // FM: usar o nome do age group directamente ("10 and Under", "11 & 12", …)
      const { evo, evoYear } = jobEvoFor(f, files, i, (d) => d.division);
      const hasEvo = !!evo && evo.size > 0;
      const results = jobDivisionToTournament(dv, label);
      if (hasEvo) for (const pl of results.players) {
        const ev = evo!.get(pl.name);
        if (ev) { (pl as unknown as { _regressado?: boolean })._regressado = true; if (ev.pill === "UP") (pl as unknown as { _subiu?: boolean })._subiu = true; }
      }
      // Anexar os draws ao torneio → o TournamentDetail monta as tabs flat
      // intercaladas (Draw R1 · R1 · Draw R2 · R2 · … · Resumo · Scorecards).
      if (dv.draws && Object.keys(dv.draws).length) {
        (results as unknown as { _draws?: Record<string, FpgDraw> })._draws = fmDrawsToFpg(dv.draws, dv.players);
      }
      // Limpar o tcode placeholder (`job-…`) para o TournamentDetail não mostrar
      // o pill/link FPG (o FM não tem ccode/tcode).
      (results as unknown as { ccode?: string; tcode?: string }).ccode = undefined;
      (results as unknown as { ccode?: string; tcode?: string }).tcode = undefined;
      const evoCols = hasEvo ? makeEvoCols(evo!, evoYear) : undefined;
      return {
        key: `d${i}`,
        escalao: label,
        tabLabel: label,
        hasManuel: dv.players.some((p) => isM(p.name)),
        results,
        // Link para a página de resultados GolfGenius deste escalão (cada age
        // group tem a sua própria página /pages/{id}). Fica no header do detalhe.
        links: dv.source ? [{ label: "Resultados GolfGenius", icon: "🔗", url: dv.source }] : undefined,
        // Mantém o DetailHeader do shell (nome do torneio "Future Masters Golf
        // {ano}" + campo + pills), igual aos restantes torneios (JOB/Doral/BJGT).
        renderFullKeepHeader: true,
        // Detalhe IDÊNTICO à FPGPage: tabs flat intercaladas via TournamentDetail
        // (em vez das section-tabs Resultados/Draw do shell). Passa as scOptions
        // do FM (esconder HCP/SD/Fed/Tee, clube="País") e a evolução ano-a-ano.
        // `hideHeader` evita o header próprio do TournamentDetail (que mostraria
        // só o escalão "13 & 14") — quem desenha o cabeçalho é o shell.
        renderFull: () => (
          <TournamentDetail
            tournament={results}
            escLookup={EMPTY_ESC_LOOKUP}
            playersDB={EMPTY_PLAYERS_DB}
            options={jobScorecardOptions()}
            accShowCols={{ esc: false, fed: false, tee: false, hcp: false }}
            accExtraColumns={evoCols}
            accHeader={hasEvo ? <EvoSummary evo={evo!} evoYear={evoYear!} /> : undefined}
            drawHideCols={FM_DRAW_HIDE_COLS}
            hideHeader
          />
        ),
      };
    }).sort(majorDivCompare); // tabs por idade crescente: 10 and Under → 11 & 12 → 13 & 14 → 15 …
    const all = f.divisions.flatMap((d) => d.players);
    return {
      id: `fm:${f.year}`,
      year: f.year,
      name: `Future Masters Golf ${f.year}`,
      course: f.course || "Dothan Country Club",
      series: "FM",
      source: "fm",
      // Conta quem jogou (total OU rondas com scores) — em torneios a decorrer
      // o `total` agregado ainda é null.
      playerCount: all.filter((p) => p.total != null || (p.rounds || []).some((r) => (r.scores || []).length > 0)).length,
      divisionCount: divisions.length,
      hasManuel: all.some((p) => isM(p.name)),
      hasPt: all.some((p) => /portugal/i.test(p.country || "") || isM(p.name)),
      divisions,
    };
  });
}

function buildJobEntries(files: JobFile[]): CircuitEntry[] {
  return files.map((f): CircuitEntry => {
    const divisions: CircuitDivision[] = f.divisions.map((dv, i) => {
      const label = JOB_DIV_LABELS[i] || dv.division;
      const { evo, evoYear } = jobEvoFor(f, files, i, (d, idx) => JOB_DIV_LABELS[idx] || d.division);
      const hasEvo = !!evo && evo.size > 0;
      const results = jobDivisionToTournament(dv, label);
      if (hasEvo) for (const pl of results.players) {
        const ev = evo!.get(pl.name);
        if (ev) { (pl as unknown as { _regressado?: boolean })._regressado = true; if (ev.pill === "UP") (pl as unknown as { _subiu?: boolean })._subiu = true; }
      }
      return {
        key: `d${i}`,
        escalao: label,
        tabLabel: label,
        hasManuel: dv.players.some((p) => isM(p.name)),
        results,
        scOptions: jobScorecardOptions(),
        evoCols: hasEvo ? makeEvoCols(evo!, evoYear) : undefined,
        accHeader: hasEvo ? <EvoSummary evo={evo!} evoYear={evoYear!} /> : undefined,
      };
    });
    const all = f.divisions.flatMap((d) => d.players);
    return {
      id: `job:${f.year}`,
      year: f.year,
      name: `Junior Orange Bowl ${f.year}`,
      course: f.course || undefined,
      series: "JOB",
      source: "job",
      sourceUrl: f.source,
      playerCount: all.filter((p) => p.total != null).length,
      divisionCount: divisions.length,
      hasManuel: all.some((p) => isM(p.name)),
      hasPt: all.some((p) => /portugal/i.test(p.country || "") || isM(p.name)),
      divisions,
    };
  });
}

const MAJOR_CONFIG: CircuitConfig = {
  routeBase: "/major",
  title: "🎖️ MAJOR",
  color: "#b8860b",
  textColor: "#fff",
  grouping: "year",
  sourceColors: { doral: "#c8102e", bjgt: "#1a7f5a", eowagr: "#0a4d8c", job: "#e8731c", fm: "#1a5276" },
  sourceLabels: { doral: "DORAL", bjgt: "BJGT", eowagr: "EU", job: "JOB", fm: "FM" },
  filters: { search: true, year: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos", "regressados", "subiram"] },
  veteranoThreshold: 3,
  loadingMessage: "A carregar MAJOR…",
};

// Anos a tentar para os ficheiros Junior Orange Bowl (orangebowl_<ano>.json).
const JOB_YEARS = Array.from({ length: 16 }, (_, i) => 2012 + i); // 2012..2027

// Anos disponíveis do Future Masters Golf (ftm_fm_<ano>.json).
const FM_YEARS = [2019, 2021, 2022, 2023, 2024, 2025, 2026];

function MajorContent() {
  const navigate = useNavigate();
  const params = useParams<{ source?: string; year?: string }>();
  const [bjgtDefs, setBjgtDefs] = useState<TDef[]>([]);
  const [doralEntries, setDoralEntries] = useState<Entry[]>([]);
  const [doralNames, setDoralNames] = useState<Map<number, string>>(new Map());
  const [jobFiles, setJobFiles] = useState<JobFile[]>([]);
  const [fmFiles, setFmFiles] = useState<JobFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [defs, dorals] = await Promise.all([
        Promise.all(BJGT_URLS.map(async (m): Promise<TDef | null> => {
          try {
            const raw = await cachedFetchJson<unknown>(m.url);
            if (raw == null) return null;
            return {
              id: m.id, label: m.label, shortLabel: m.shortLabel,
              data: bjgtLoadT(raw), manuelName: m.manuelName, year: m.year,
              category: m.category, roundDates: m.roundDates, series: m.series,
            } as TDef;
          } catch { return null; }
        })),
        Promise.all(DORAL_FILES.map(async ({ url, sourceUrl }): Promise<{ entries: Entry[]; name: string | null; year: number | null }> => {
          try {
            const raw = await cachedFetchJson<Parameters<typeof normalizeFile>[0]>(url);
            if (!raw) return { entries: [], name: null, year: null };
            const meta = raw as unknown as { tournament?: string; year?: number };
            return { entries: normalizeFile(raw, sourceUrl), name: meta.tournament ?? null, year: meta.year ?? null };
          } catch { return { entries: [], name: null, year: null }; }
        })),
      ]);
      if (!alive) return;
      setBjgtDefs(defs.filter((d): d is TDef => d != null));
      setDoralEntries(dorals.flatMap((d) => d.entries));
      const names = new Map<number, string>();
      for (const d of dorals) if (d.year != null && d.name) names.set(d.year, d.name);
      setDoralNames(names);
      setLoading(false);

      // Junior Orange Bowl — tenta cada ano (404 ignorado).
      const jobs = (await Promise.all(JOB_YEARS.map((y) =>
        cachedFetchJson<JobFile>(`/data/orangebowl_${y}.json`).catch(() => null),
      ))).filter((f): f is JobFile => !!f && Array.isArray(f.divisions));
      if (alive) setJobFiles(jobs);

      // Future Masters Golf — tenta cada ano (404 ignorado).
      const fms = (await Promise.all(FM_YEARS.map((y) =>
        cachedFetchJson<JobFile>(`/data/ftm_fm_${y}.json`).catch(() => null),
      ))).filter((f): f is JobFile => !!f && Array.isArray(f.divisions));
      if (alive) setFmFiles(fms);
    })();
    return () => { alive = false; };
  }, []);

  const entries = useMemo(
    () => [
      ...buildMajorEntries(bjgtDefs, doralEntries, doralNames),
      ...buildJobEntries(jobFiles),
      ...buildFmEntries(fmFiles),
    ],
    [bjgtDefs, doralEntries, doralNames, jobFiles, fmFiles],
  );

  // Torneio seleccionado via URL (/major/:source/:year → id "source:year").
  const selectedId = params.source && params.year ? `${params.source}:${params.year}` : undefined;

  if (loading) return <LoadingState message="A carregar MAJOR…" />;
  return (
    <CircuitShell
      entries={entries}
      config={MAJOR_CONFIG}
      selectedId={selectedId}
      onSelectEntry={(e) => {
        const [src, yr] = e.id.split(":");
        navigate(`/major/${src}/${yr}`);
      }}
    />
  );
}

export default function MajorPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <MajorContent />;
}
