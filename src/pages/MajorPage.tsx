/**
 * MajorPage.tsx — 🏆 MAJOR (Doral + BJGT/EOWAGR + GolfGenius/GolfBox) no CircuitShell.
 *
 * Funde as antigas páginas Doral e BJGT numa única página-mãe assente no
 * CircuitShell, agrupada por série e ano. Cada série/ano é um "torneio" com
 * divisões por categoria (escalão). O detalhe reutiliza os módulos ricos de
 * cada origem (HoleDiff/ManuelDay/Field Stats + evolução ano-a-ano) via os
 * helpers exportados `bjgtMajorDivision` / `doralMajorDivision`.
 *
 * Os dados (catálogo, ficheiros de cada fonte, conversão para o formato FPG,
 * draws, evolução) vivem em src/data/major/ desde 21/10/2026; aqui fica o que
 * se desenha (tabs, colunas, TournamentDetail).
 *
 * As rotas antigas /doral e /bjgt redireccionam para /major (ver App.tsx).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitRenderFullExtras } from "../ui/circuit/types";
import MatchplayView from "../ui/circuit/MatchplayView";
import { bjgtEvoFor, bjgtMajorDivision } from "./BJGTPage";
import { EvoSummary, tagEvo, makeEvoCols } from "../ui/evo";
import { doralEvoFor, doralMajorDivision } from "./DORALPage";
import type { ScorecardOptions } from "./FPGPage";
import { TournamentDetail } from "./fpg/TournamentDetail";
import { EMPTY_ESC_LOOKUP, EMPTY_PLAYERS_DB } from "../ui/tournamentPrimitives";
import { KidsLink } from "../ui/KidsLink";
import MajorVeteransView from "./major/MajorVeteransView";
import type { TDef } from "../data/major/bluegolf";
import type { DoralEntry } from "../data/major/doral";
import { JOB_DIV_LABELS, JOB_DRAW_HIDE_COLS, jobFileDivisions, jobScorecardOptions } from "../data/major/jobFile";
import {
  BLUEGOLF_SOURCE_URL, isBlueGolfSource, loadBlueGolfDefs, loadDoralEntries, loadMajorJobData,
  type MajorCatalog, type MajorCatalogEntry, type MajorJobData,
} from "../data/major/majorLoader";

/** Seta ↗ para a página KIDS2 do jogador, injectada nos nomes do detalhe (via
 *  `nameDecorator`). Resolve pelo KidsLinkCtx que o CircuitShell já fornece — só
 *  aparece para quem existir no agregado de juniores. Os torneios BJGT/Doral
 *  (IntlTournView) já a têm; isto dá-a aos que usam TournamentDetail (FM +
 *  GolfGenius/GolfBox: FSGA, UA, México, Interzonas, avtrophy). */
const kidsNameDecorator: NonNullable<ScorecardOptions["nameDecorator"]> = (name, content) => (
  <span className="inline-flex items-center">{content}<KidsLink nome={name} /></span>
);
const withKidsLink = (opts: ScorecardOptions): ScorecardOptions => ({ ...opts, nameDecorator: kidsNameDecorator });


/** Ordena escalões: Boys antes de Girls, idade crescente (7&U→…→16-18), WAGR no fim. */
function majorDivCompare(a: CircuitDivision, b: CircuitDivision): number {
  const key = (d: CircuitDivision): [number, number] => {
    const lab = d.tabLabel || d.escalao;
    // Boys/Girls no início ("Boys 13-14") ou no FIM ("Under 12 Boys" — CoC).
    const g = /^\s*boys/i.test(lab) ? 0 : /^\s*girls/i.test(lab) ? 1
      : /\bboys\b/i.test(lab) ? 0 : /\bgirls\b/i.test(lab) ? 1 : 2;
    const m = lab.match(/\d+/);
    const age = /wagr/i.test(lab) ? 999 : (m ? parseInt(m[0], 10) : 998);
    return [g, age];
  };
  const ka = key(a), kb = key(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

/* ═══════════════════════════════════════════════════════════════════════
   Divisões do CircuitShell (o que se desenha) a partir dos dados de
   src/data/major/. Carregamento LAZY: a lista sai do major-catalog.json e o
   detalhe de cada torneio só carrega ao clicar (`loadDivisions`).
   ═══════════════════════════════════════════════════════════════════════ */

/** BJGT / EOWAGR / FCG / JWGC: os escalões do ano (os do ano-irmão só entram
 *  na evolução ano-a-ano). */
function blueGolfDivisions(year: number, defs: TDef[]): CircuitDivision[] {
  return defs
    .filter((d) => d.year === year)
    .map((d) => {
      const { evo, evoYear } = bjgtEvoFor(d, defs);
      return bjgtMajorDivision(d, evo, evoYear, BLUEGOLF_SOURCE_URL.get(d.id));
    })
    .sort(majorDivCompare);
}

/** Doral: os escalões do ano, com a evolução sobre todos os anos anteriores. */
function doralDivisions(year: number, entries: DoralEntry[]): CircuitDivision[] {
  return entries
    .filter((e) => e.year === year)
    .map((e) => doralMajorDivision(e, doralEvoFor(e, entries)))
    .sort(majorDivCompare);
}

/** Junior Orange Bowl: Rapazes/Raparigas no leaderboard do shell. */
function jobDivisions({ file, files }: MajorJobData): CircuitDivision[] {
  return jobFileDivisions(file, files, (d, idx) => JOB_DIV_LABELS[idx] || d.division, false).map((d): CircuitDivision => {
    const hasEvo = !!d.evo && d.evo.size > 0;
    tagEvo(d.results, d.evo);
    return {
      key: d.key,
      escalao: d.label,
      tabLabel: d.label,
      hasManuel: d.hasManuel,
      results: d.results,
      scOptions: jobScorecardOptions(),
      evoCols: hasEvo ? makeEvoCols(d.evo!, d.evoYear) : undefined,
      accHeader: hasEvo ? <EvoSummary evo={d.evo!} what={`regressaram de ${d.evoYear}`} metric="±par" /> : undefined,
    };
  });
}

/** FM e eventos GolfGenius/GolfBox em formato JobFile de UMA ou VÁRIAS
 *  divisões (FSGA, Under Armour, México, CoC, Evian, Faldo, ETC, Estónia,
 *  Optimist…). Detalhe IDÊNTICO à FPGPage: TournamentDetail com tabs flat
 *  intercaladas (Draw R{n} · R{n} · Resumo · Scorecards) e a evolução
 *  ano-a-ano. `hideHeader`: o cabeçalho (nome + campo + pills) é o do shell
 *  (`renderFullKeepHeader`). A ordem das divisões é a do ficheiro, excepto no
 *  FM (`sortByAge`: 10 and Under → 11 & 12 → 13 & 14 → 15 …). */
function ggJobDivisions({ def, file: f, files, matchplay }: MajorJobData): CircuitDivision[] {
  const linkLabel = def.linkLabel ?? "Resultados GolfGenius";
  const scOpts = withKidsLink(jobScorecardOptions({ showRatings: def.showRatings, showAges: def.showAges }));
  // Match play (brackets ETC) — tab extra no TournamentDetail.
  const mpBase = matchplay ? [{ key: "matchplay", label: "Match Play", content: <MatchplayView data={matchplay} /> }] : [];
  const shareEvent = def.eventName ? `${def.eventName} ${f.year}` : (f.tournament || `${def.series} ${f.year}`);
  const shareCourse = f.course || def.defaultCourse || undefined;
  const divisions = jobFileDivisions(f, files, (d) => d.division || def.series, true).map((d): CircuitDivision => {
    const dv = d.division;
    const hasEvo = !!d.evo && d.evo.size > 0;
    tagEvo(d.results, d.evo);
    const evoCols = hasEvo ? makeEvoCols(d.evo!, d.evoYear) : undefined;
    return {
      key: d.key,
      escalao: d.label,
      tabLabel: d.label,
      hasManuel: d.hasManuel,
      results: d.results,
      // Link para a página de resultados deste escalão (no FM cada age group
      // tem a sua própria página /pages/{id}). Fica no header do detalhe.
      links: dv.source ? [{ label: linkLabel, icon: "🔗", url: dv.source }] : undefined,
      renderFullKeepHeader: true,
      renderFull: (extras?: CircuitRenderFullExtras) => (
        <TournamentDetail
          tournament={d.results}
          escLookup={EMPTY_ESC_LOOKUP}
          playersDB={EMPTY_PLAYERS_DB}
          options={{ ...scOpts, shareEvent, shareCourse }}
          accShowCols={{ esc: false, fed: false, tee: false, hcp: !!def.showRatings }}
          accExtraColumns={evoCols}
          accHeader={hasEvo ? <EvoSummary evo={d.evo!} what={`regressaram de ${d.evoYear}`} metric="±par" /> : undefined}
          drawHideCols={{
            ...JOB_DRAW_HIDE_COLS,
            ...(dv.players.some((p) => typeof p.hcp === "number") ? { hcp: false } : {}),
            ...(dv.players.some((p) => p.dob || p.birthYear || p.birthYearEst) ? { nasc: false } : {}),
          }}
          hideHeader
          extraTabs={[...mpBase, ...[extras?.pastEditionsTab, extras?.repeatersTab].filter((x): x is NonNullable<typeof x> => !!x)]}
        />
      ),
    };
  });
  return def.sortByAge ? divisions.sort(majorDivCompare) : divisions;
}

const MAJOR_CONFIG: CircuitConfig = {
  routeBase: "/major",
  title: "🎖️ MAJOR",
  color: "#b8860b",
  textColor: "#fff",
  grouping: "year",
  sourceColors: { doral: "#c8102e", bjgt: "#1a7f5a", eowagr: "#0a4d8c", job: "#e8731c", fm: "#1a5276", fsga: "#d97706", uajt: "#111827", mexnacional: "#006341", icopa: "#b45309", interzonas: "#0f766e", avtrophy: "#a51931", ebtc2: "#2a7ab0", egtc: "#b5179e", elg: "#7b2cbf", eatc: "#166534", eatc2: "#4d7c0f", eym: "#0891b2", ejo: "#0072ce", ejt: "#155e9c", fcg: "#1d4ed8", jwgc: "#9333ea", coc: "#0e7490", uaworlds: "#7c2d12", reidtrophy: "#384d9f", optimist: "#d4a017", evianjc: "#0b3d91", faldomadeira: "#1b5e20" },
  sourceLabels: { doral: "DORAL", bjgt: "BJGT", eowagr: "EU", job: "JOB", fm: "FM", fsga: "FSGA", uajt: "UA", mexnacional: "MÉX", icopa: "Bobby Díaz", interzonas: "Interzonas", avtrophy: "BEL U14", ebtc2: "ETC Boys", egtc: "ETC Girls", elg: "ETC Ladies", eatc: "ETC Men", eatc2: "ETC Men 2", eym: "Young Masters", ejo: "EST Jr Open", ejt: "EST Jr Tour", fcg: "FCG", jwgc: "JWGC", coc: "CoC", uaworlds: "UA Worlds", reidtrophy: "Reid Trophy", optimist: "Optimist", evianjc: "Evian JC", faldomadeira: "Faldo Madeira" },
  filters: { search: true, year: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos", "regressados", "subiram"] },
  // Identidade de torneio entre anos = a FONTE (coc, fsga, uajt, bjgt, doral…).
  // O shell constrói a tab "Edições anteriores" das entradas irmãs e entrega-a
  // às divisões do IntlTournView (trailing-tab) E às `renderFull` (via extras).
  // "Edições anteriores" = mesma prova ao longo dos anos. Nos multi-etapa/fase
  // (Estonian Junior Tour, Optimist Phase 1-3) a "mesma prova" é a MESMA
  // etapa/fase (nº no id `{src}:ano:n`) — sem isto as etapas de um ano
  // contavam como N "edições".
  editionKey: (entry) => (entry.source === "ejt" || entry.source === "optimist"
    ? `${entry.source}:${entry.id.split(":")[2] ?? ""}` : entry.source || null),
  // Tab "Época": as etapas/fases do MESMO ANO do circuito.
  seasonKey: (entry) => (entry.source === "ejt" || entry.source === "optimist" ? entry.source : null),
  veteranoThreshold: 3,
  loadingMessage: "A carregar MAJOR…",
  // Tab "✈️ Internacionalizações" (menu ⓘ Info): ranking de jogadores por nº de
  // torneios internacionais / anos / circuitos. Lê major-veterans.json lazy.
  specialItems: [
    {
      key: "internacionalizacoes",
      label: "✈️ Internacionalizações",
      render: () => (
        <MajorVeteransView sourceLabels={MAJOR_CONFIG.sourceLabels} sourceColors={MAJOR_CONFIG.sourceColors} />
      ),
    },
  ],
};

/** Devolve o `loadDivisions` adequado à fonte do torneio do catálogo. */
function loadDivisionsFor(cat: MajorCatalogEntry): () => Promise<CircuitDivision[]> {
  return async () => {
    if (isBlueGolfSource(cat.source)) return blueGolfDivisions(cat.year, await loadBlueGolfDefs(cat.source, cat.year));
    if (cat.source === "doral") return doralDivisions(cat.year, await loadDoralEntries(cat.year));
    const data = await loadMajorJobData(cat);
    if (!data) return [];
    return data.def.layout === "job" ? jobDivisions(data) : ggJobDivisions(data);
  };
}

/** Entry LEVE (só metadata do catálogo) — o detalhe carrega lazy no shell. */
function catalogToEntry(cat: MajorCatalogEntry): CircuitEntry {
  return {
    id: cat.id,
    year: cat.year,
    name: cat.name,
    series: cat.series,
    source: cat.source,
    course: cat.course,
    dateStart: cat.dateStart,
    dateEnd: cat.dateEnd,
    sourceUrl: cat.sourceUrl,
    escalao: cat.escalao,
    playerCount: cat.playerCount,
    roundsCount: cat.roundsCount,
    divisionCount: cat.divisionCount,
    hasManuel: cat.hasManuel,
    hasPt: cat.hasPt,
    loadDivisions: loadDivisionsFor(cat),
  };
}

function MajorContent() {
  const navigate = useNavigate();
  const params = useParams<{ source?: string; year?: string }>();
  const [catalog, setCatalog] = useState<MajorCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cat = await cachedFetchJson<MajorCatalog>("/data/major-catalog.json").catch(() => null);
      if (!alive) return;
      setCatalog(cat);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const entries = useMemo(() => (catalog?.entries ?? []).map(catalogToEntry), [catalog]);

  // Índice de veteranos pré-calculado (o shell não tem os jogadores em memória
  // no modo lazy) — alimenta o toggle ✦ Veteranos.
  const veteranIndex = useMemo(() => {
    const m = new Map<string, number>();
    if (catalog?.veteranIndex) for (const [k, n] of Object.entries(catalog.veteranIndex)) m.set(k, n);
    return m;
  }, [catalog]);

  const config = useMemo<CircuitConfig>(() => ({ ...MAJOR_CONFIG, veteranIndex }), [veteranIndex]);

  // Torneio seleccionado via URL (/major/:source/:year → id "source:year").
  const selectedId = params.source && params.year ? `${params.source}:${params.year}` : undefined;

  if (loading) return <LoadingState message="A carregar MAJOR…" />;
  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={selectedId}
      onSelectEntry={(e) => {
        // Ids têm 2 segmentos ("ejo:2026") ou 3 nas etapas multi-evento do
        // Estonian Junior Tour ("ejt:2026:3"). Partir SÓ na primeira ":" e
        // manter o resto no segmento :year do URL (/major/ejt/2026:3) — split
        // em [src, yr] perdia a etapa e todas as etapas do ano caíam no mesmo
        // URL (só dava para abrir a default).
        const i = e.id.indexOf(":");
        navigate(`/major/${e.id.slice(0, i)}/${e.id.slice(i + 1)}`);
      }}
    />
  );
}

export default function MajorPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <MajorContent />;
}
