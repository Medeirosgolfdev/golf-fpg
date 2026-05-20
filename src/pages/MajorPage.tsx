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
    out.push({
      id: `${series}:${year}`,
      year,
      name: evName || `${seriesLabel} ${year}`,
      series: seriesLabel,
      source: series,
      course: courses.length === 1 ? courses[0] : country,
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
    out.push({
      id: `doral:${year}`,
      year,
      name: doralNames.get(year) || `Doral ${year}`,
      series: "Doral",
      source: "doral",
      course: dCourses.length === 1 ? dCourses[0] : "USA",
      playerCount: ents.reduce((s, e) => s + e.players.filter((p) => p.total != null).length, 0),
      divisionCount: divisions.length,
      hasManuel: ents.some((e) => e.players.some((p) => isM(p.name))),
      divisions,
    });
  }

  return out;
}

/* ─── Junior Orange Bowl — ficheiros orangebowl_<ano>.json (scrape-junior-orange-bowl.js) ─── */
interface JobPlayer { pos: string; name: string; country: string; location?: string; detailId?: string | null; toPar: number | null; total: number | null; roundGross: number[]; rounds: { day: number; scores: number[]; f9?: number; b9?: number; gross: number }[]; }
interface JobDivision { division: string; tid?: string; par?: (number | null)[] | null; parTotal?: number | null; meters?: (number | null)[] | null; si?: (number | null)[] | null; teeName?: string | null; metersTotal?: number | null; players: JobPlayer[]; }
interface JobFile { tournament: string; year: number; source?: string; course?: string | null; divisions: JobDivision[]; }

// Divisão 1 = Rapazes, Divisão 2 = Raparigas (consistente em todas as edições JOB).
const JOB_DIV_LABELS = ["Rapazes", "Raparigas"];

function jobScorecardOptions(): ScorecardOptions {
  return { hideHCP: true, hideSD: true, hideEsc: true, hideFed: true, hideTee: true, clubLabel: "País" };
}

function jobDivisionToTournament(div: JobDivision, name: string): FPGTournament {
  const players = div.players.filter((p) => p.total != null);
  const nR = Math.max(...players.map((p) => (p.rounds ? p.rounds.length : 0) || p.roundGross.length), 0);
  // Par REAL do campo (derivado dos marcadores pelo scraper). Fallback para
  // ficheiros antigos sem par: derivar parTotal de (total − toPar) / nº rondas.
  let par18: number[];
  let parTotal: number;
  if (Array.isArray(div.par) && div.par.length === 18 && div.par.every((x) => x != null)) {
    par18 = div.par as number[];
    parTotal = div.parTotal ?? par18.reduce((a, b) => a + b, 0);
  } else {
    const ref = players.find((p) => p.toPar != null && p.total != null && (p.rounds?.length || p.roundGross.length));
    const refR = ref ? (ref.rounds?.length || ref.roundGross.length) : nR;
    parTotal = ref && refR ? Math.round((ref.total! - ref.toPar!) / refR) : 72;
    const hi = Math.ceil(parTotal / 18), lo = Math.floor(parTotal / 18), rem = parTotal % 18;
    par18 = Array.from({ length: 18 }, (_, i) => (i < rem ? hi : lo));
  }
  // Metros/SI reais por buraco (course_analytics). Só usar se 18 valores válidos.
  const meters18 = Array.isArray(div.meters) && div.meters.length === 18 && div.meters.every((x) => x != null) ? (div.meters as number[]) : [];
  const si18 = Array.isArray(div.si) && div.si.length === 18 && div.si.every((x) => x != null) ? (div.si as number[]) : [];
  // A linha de metros no scorecard só aparece quando há teeName. O course_analytics
  // do JOB nem sempre dá nome de tee → usar "Tee" como rótulo quando há metros.
  const teeName = meters18.length ? (div.teeName || "Tee") : undefined;
  const fpg: FPGPlayer[] = players.map((p) => {
    const rounds = (p.rounds || []).map((r, ri) => ({ round: ri + 1, gross: r.gross, scores: r.scores || [], pars: par18, si: si18, meters: meters18, teeName }));
    return {
      scoreId: p.detailId || p.name,
      pos: parseInt(String(p.pos).replace(/^T/i, ""), 10) || null,
      name: p.name,
      club: p.country ? `${gf(p.country)} ${normPaisDisplay(p.country)}` : "",
      grossTotal: p.total,
      toPar: p.toPar,
      nholes: 18,
      parTotal,
      scores: p.rounds?.[0]?.scores,
      par: par18,
      roundScores: rounds,
      _roundsPlayed: rounds.length || p.roundGross.length,
      _isPortuguese: /portugal/i.test(p.country || "") || /^(pt|prt)$/i.test(p.country || ""),
    } as FPGPlayer;
  });
  return { name, tcode: `job-${name}`, date: "", campo: "", rounds: nR, playerCount: fpg.length, players: fpg };
}

/** Evolução ano-a-ano do JOB: compara cada divisão com a edição do ano anterior
 *  (mesma divisão), usando o to-par total como valor comparável. */
function jobEvoFor(file: JobFile, all: JobFile[], divIndex: number, label: string): { evo?: Map<string, EvoEntry>; evoYear?: string } {
  const prev = all.find((f) => f.year === file.year - 1);
  if (!prev) return {};
  const curDiv = file.divisions[divIndex];
  const prevDiv = prev.divisions[divIndex];
  if (!curDiv || !prevDiv) return {};
  const toEvo = (d: JobDivision) => d.players
    .filter((p) => p.toPar != null && p.total != null)
    .map((p) => ({ name: p.name, value: p.toPar as number, category: label }));
  const raw = buildEvoMap({
    currentPlayers: toEvo(curDiv),
    referencePlayers: toEvo(prevDiv),
    referenceYear: String(file.year - 1),
    isManuel: isM,
  });
  return { evo: raw.evoMap, evoYear: raw.evoYear };
}

function buildJobEntries(files: JobFile[]): CircuitEntry[] {
  return files.map((f): CircuitEntry => {
    const divisions: CircuitDivision[] = f.divisions.map((dv, i) => {
      const label = JOB_DIV_LABELS[i] || dv.division;
      const { evo, evoYear } = jobEvoFor(f, files, i, label);
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
  sourceColors: { doral: "#c8102e", bjgt: "#1a7f5a", eowagr: "#0a4d8c", job: "#e8731c" },
  sourceLabels: { doral: "DORAL", bjgt: "BJGT", eowagr: "EU", job: "JOB" },
  filters: { search: true, year: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos", "regressados", "subiram"] },
  veteranoThreshold: 3,
  loadingMessage: "A carregar MAJOR…",
};

// Anos a tentar para os ficheiros Junior Orange Bowl (orangebowl_<ano>.json).
const JOB_YEARS = Array.from({ length: 16 }, (_, i) => 2012 + i); // 2012..2027

function MajorContent() {
  const [bjgtDefs, setBjgtDefs] = useState<TDef[]>([]);
  const [doralEntries, setDoralEntries] = useState<Entry[]>([]);
  const [doralNames, setDoralNames] = useState<Map<number, string>>(new Map());
  const [jobFiles, setJobFiles] = useState<JobFile[]>([]);
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
    })();
    return () => { alive = false; };
  }, []);

  const entries = useMemo(
    () => [...buildMajorEntries(bjgtDefs, doralEntries, doralNames), ...buildJobEntries(jobFiles)],
    [bjgtDefs, doralEntries, doralNames, jobFiles],
  );

  if (loading) return <LoadingState message="A carregar MAJOR…" />;
  return <CircuitShell entries={entries} config={MAJOR_CONFIG} />;
}

export default function MajorPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <MajorContent />;
}
