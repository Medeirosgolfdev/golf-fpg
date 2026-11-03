/**
 * pages/kids/HistoricScorecardsTab.tsx
 *
 * Tab "Scorecards" do FieldRivaisDashboard.
 *
 * UMA tabela contínua (não uma por ano) que mostra, para cada edição passada
 * do MESMO torneio+escalão, os top-N finishers com strokes hole-by-hole por
 * ronda. As tabelas são o `ScorecardLeaderboard` global (como FPG/Drive).
 *
 * Controlos globais:
 *   • Top-N: 5 / 10 / 20 / Todos (default 10)
 *   • Modo:  Agrupado (1 jogador × N rondas, as seguintes com ↳) |
 *            Independente (1 linha por (jogador, ronda), ordenado por ±par)
 *
 * Colunas: # | Jogador | Ano | País | Rnd | ± | Tot | 1..9 | Out | 10..18 | In | 🐦 | Par | ■
 * Cada edição traz o seu par (`holePars`); sem par completo a linha fica sem
 * cores e o ± fica «—». SD não aparece porque o slim não tem slope/CR.
 *
 * Dados: uskids-member-history-slim.json (apenas USKids; WJGC/Doral/EOWAGR
 * mostram mensagem porque os tids correspondentes não têm strokes[]).
 */
import { useMemo, useState, type ReactNode } from "react";
import ToPar from "../../ui/ToPar";
import SortableHdr from "../../ui/SortableHdr";
import { compareNullsLast, compareTextNullsLast, compareValuesNullsLast } from "../../hooks/useSort";
import TabRow from "../../ui/TabRow";
import LoadingState from "../../ui/LoadingState";
import { kidsUrl } from "../../ui/KidsLink";
import { ScorecardLeaderboard, type ScorecardRow } from "../../ui/ScorecardLeaderboard";
import EmptyState from "../../ui/EmptyState";
import ExtLink from "../../ui/ExternalLink";

interface FieldEscalao { nome: string; jogadores?: unknown[] }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }

interface MHRound { gross: number; strokes?: number[] }
interface MHTorn { ageGroup: string; place: number | null; rounds: Record<string, MHRound> }
interface MHPlr { name: string; country: string; torneios: Record<string, MHTorn> }
interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }
interface MHSlim {
  torneios: Record<string, {
    name: string;
    startDate: string;
    holesPerRound: number;
    par: number[] | null;
    yards?: number[] | null;
    byEscalao?: Record<string, MHEscalaoMeta>;
  }>;
  jogadores: Record<string, MHPlr>;
}

interface PlayerRound {
  rn: number;
  gross: number;
  strokes: number[];
  toPar: number;     // gross - parPerRound
  birds: number;
  pars: number;
  bogeys: number;    // bogey strokes-only (NOT including double+)
  worse: number;     // double bogey ou pior (qualquer +2 ou mais)
  out: number;       // soma front 9
  inn: number;       // soma back 9 (0 se torneio 9H)
}
interface PlayerCard {
  memberId: string;
  name: string;
  country: string;
  officialPlace: number | null;
  total: number;
  rounds: PlayerRound[];
}
interface Edition {
  tcode: string;
  name: string;
  year: string;
  course?: string;
  par: number[] | null;
  /** Metros por buraco (yards * 0.9144), arredondado. null se não houver yards. */
  metersPerHole: number[] | null;
  parPerRound: number;
  parF9: number;
  parB9: number;
  holesPerRound: number;
  is9: boolean;
  nRoundsMax: number;
  fieldSize: number;
  /** Total em metros (somatório de metersPerHole). */
  meters?: number;
  players: PlayerCard[];
}

const MIN_FIELD_SIZE = 3;
/** Abaixo disto o gross é erro de dados (cartão incompleto), não uma volta. */
export const MIN_GROSS_18H = 55;
export const MIN_GROSS_9H = 28;

type SortKey = "pos" | "year" | "name" | "country" | "rnd" | "topar" | "gross" | "birds" | "pars" | "bogeys" | `h${number}`;

/** Conta birdies/pars/bogeys/worse num scorecard. */
function tallyHoles(strokes: number[], par: number[] | null): { birds: number; pars: number; bogeys: number; worse: number } {
  let birds = 0, pars = 0, bogeys = 0, worse = 0;
  if (!par) return { birds, pars, bogeys, worse };
  for (let i = 0; i < strokes.length; i++) {
    const g = strokes[i];
    const p = par[i];
    if (!g || g <= 0 || !p || p <= 0) continue;
    const d = g - p;
    if (d <= -1) birds++;
    else if (d === 0) pars++;
    else if (d === 1) bogeys++;
    else worse++;
  }
  return { birds, pars, bogeys, worse };
}

export default function HistoricScorecardsTab({ mh, torneio, escalaoNome }: {
  mh: MHSlim | null;
  torneio: FieldTorneio | null;
  escalaoNome: string;
}) {
  const [topN, setTopN] = useState<5 | 10 | 20 | 0>(10); // 0 = todos
  const [groupMode, setGroupMode] = useState<boolean>(true); // true = Agrupado
  // Sort state — default por posição oficial (pos) ASC. Em modo Agrupado,
  // agrega por jogador (best/min para buracos e para gross/toPar; total
  // para birds/pars/bogeys). Em modo Independente actua sobre a ronda individual.
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      // Defaults sensatos: jogador/país/ano DESC para anos primeiro, gross/topar ASC
      const ascByDefault = new Set(["topar", "gross", "name", "country", "rnd"]);
      if (k.startsWith("h")) { setSortDir("asc"); return; }
      setSortDir(ascByDefault.has(k) ? "asc" : "desc");
    }
  }

  const editions: Edition[] | null = useMemo(() => {
    if (!mh || !torneio) return null;
    if (torneio.t < 0) return [];
    const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
    if (!baseName) return [];

    const out: Edition[] = [];
    for (const [tcode, meta] of Object.entries(mh.torneios)) {
      if (!meta?.name) continue;
      if (/Parent\/Child/i.test(meta.name)) continue;
      const mBase = meta.name.replace(/\s+\d{4}\s*$/, "").trim();
      if (mBase !== baseName) continue;
      const yearMatch = meta.name.match(/(\d{4})/);
      if (!yearMatch) continue;
      const year = yearMatch[1];
      const hpr = (meta as any).holesPerRound || 18;
      const is9 = hpr === 9;
      const minGross = is9 ? MIN_GROSS_9H : MIN_GROSS_18H;

      const escMeta = (meta as any).byEscalao?.[escalaoNome] as MHEscalaoMeta | undefined;
      const par = escMeta?.par || (meta as any).par || null;
      const yards = escMeta?.yards || (meta as any).yards || null;
      const parPerRound = Array.isArray(par)
        ? par.slice(0, hpr).reduce((a: number, b: number) => a + (b || 0), 0)
        : 0;
      const parF9 = Array.isArray(par) ? par.slice(0, Math.min(9, hpr)).reduce((a, b) => a + (b || 0), 0) : 0;
      const parB9 = Array.isArray(par) && !is9 ? par.slice(9, 18).reduce((a, b) => a + (b || 0), 0) : 0;

      const yardsTotal = Array.isArray(yards)
        ? yards.slice(0, hpr).reduce((a: number, b: number) => a + (b || 0), 0)
        : 0;
      const meters = yardsTotal > 0 ? Math.round(yardsTotal * 0.9144) : undefined;
      const metersPerHole: number[] | null = Array.isArray(yards)
        ? yards.slice(0, hpr).map((y: number) => y > 0 ? Math.round(y * 0.9144) : 0)
        : null;

      const players: PlayerCard[] = [];
      let nRoundsMax = 0;
      for (const [mid, p] of Object.entries(mh.jogadores)) {
        const tEntry = p.torneios[tcode];
        if (!tEntry) continue;
        if (tEntry.ageGroup !== escalaoNome) continue;
        const officialPlace = (typeof tEntry.place === "number" && tEntry.place > 0) ? tEntry.place : null;
        const rds: PlayerRound[] = [];
        let total = 0;
        for (const [rn, r] of Object.entries(tEntry.rounds || {})) {
          if (!r || r.gross <= 0) continue;
          if (r.gross < minGross) continue;
          const strokes = Array.isArray(r.strokes) ? r.strokes.slice() : [];
          const t = tallyHoles(strokes, par);
          const out9 = strokes.slice(0, Math.min(9, hpr)).reduce((a, b) => a + (b || 0), 0);
          const in9 = !is9 ? strokes.slice(9, 18).reduce((a, b) => a + (b || 0), 0) : 0;
          rds.push({
            rn: parseInt(rn, 10),
            gross: r.gross,
            strokes,
            toPar: parPerRound > 0 ? r.gross - parPerRound : 0,
            birds: t.birds,
            pars: t.pars,
            bogeys: t.bogeys,
            worse: t.worse,
            out: out9,
            inn: in9,
          });
          total += r.gross;
        }
        if (rds.length === 0) continue;
        rds.sort((a, b) => a.rn - b.rn);
        if (rds.length > nRoundsMax) nRoundsMax = rds.length;
        players.push({
          memberId: mid,
          name: p.name || "?",
          country: p.country || "",
          officialPlace,
          total,
          rounds: rds,
        });
      }
      const completed = players.filter(pl => pl.rounds.length === nRoundsMax);
      if (completed.length < MIN_FIELD_SIZE) continue;

      const placedEntries = completed.filter(e => e.officialPlace != null);
      if (placedEntries.length > 0) {
        const maxOfficialPlace = Math.max(...placedEntries.map(e => e.officialPlace!));
        const coverage = placedEntries.length / maxOfficialPlace;
        if (coverage < 0.8) continue;
      }

      completed.sort((a, b) => {
        const aOff = a.officialPlace ?? Number.POSITIVE_INFINITY;
        const bOff = b.officialPlace ?? Number.POSITIVE_INFINITY;
        if (aOff !== bOff) return aOff - bOff;
        return a.total - b.total;
      });

      out.push({
        tcode, name: meta.name, year,
        course: escMeta?.course,
        par: Array.isArray(par) ? par : null,
        metersPerHole,
        parPerRound, parF9, parB9,
        holesPerRound: hpr,
        is9,
        nRoundsMax,
        fieldSize: completed.length,
        meters,
        players: completed,
      });
    }
    out.sort((a, b) => b.year.localeCompare(a.year));
    return out;
  }, [mh, torneio, escalaoNome]);

  if (!torneio) {
    return <EmptyState size="sm" message="Sem torneio seleccionado." />;
  }
  if (editions === null) {
    return <LoadingState message="A carregar histórico…" />;
  }
  if (editions.length === 0) {
    return (
      <div className="muted p-16">
        Sem scorecards hole-by-hole disponíveis para esta combinação. Esta vista
        funciona apenas com edições USKids cobertas pelo member-history-slim
        (≥ {MIN_FIELD_SIZE} finishers, ≥ 80% de cobertura do field oficial).
      </div>
    );
  }

  // Nº de buracos da edição mais recente (misturar 9H+18H não acontece neste
  // contexto — same torneio = same nº de buracos)
  const hpr = editions[0]?.holesPerRound ?? 18;

  // Total de scorecards/jogadores mostrados (respeitando top-N)
  const limit = topN === 0 ? Infinity : topN;
  const totalPlayers = editions.reduce((a, e) => a + Math.min(limit, e.players.length), 0);
  const totalScorecards = editions.reduce((a, e) => a + Math.min(limit, e.players.length) * e.nRoundsMax, 0);

  // Linhas Metros e PAR da tabela — do tee da edição mais recente.
  const ref = editions[0];
  const refTip = `Metros e par do tee da edição ${ref.year}${ref.course ? " (" + ref.course + ")" : ""} — anos anteriores podem ter ligeiras diferenças.`;

  const rows: ScorecardRow[] = groupMode ? groupedRows() : independentRows();

  function groupedRows(): ScorecardRow[] {
    // Modo agrupado: aplicar sort que opera sobre as métricas
    // agregadas de cada jogador. Edições ordenam pelo seu year.
    const dir = sortDir === "asc" ? 1 : -1;
    // Métricas agregadas por jogador (na ronda "best" para gross/toPar)
    const playerMetric = (pl: PlayerCard, key: SortKey): number | string | null => {
      if (key.startsWith("h")) {
        const hi = parseInt(key.slice(1), 10) - 1;
        // melhor (menor) resultado nesse buraco entre TODAS as
        // rondas do jogador.
        let best: number | null = null;
        for (const r of pl.rounds) {
          const v = r.strokes[hi];
          if (v && v > 0 && (best == null || v < best)) best = v;
        }
        return best;
      }
      switch (key) {
        case "name":    return pl.name;
        case "country": return pl.country || null;
        case "topar":   return Math.min(...pl.rounds.map(r => r.toPar));
        case "gross":   return Math.min(...pl.rounds.map(r => r.gross));
        case "birds":   return pl.rounds.reduce((a, r) => a + r.birds, 0);
        case "pars":    return pl.rounds.reduce((a, r) => a + r.pars,  0);
        case "bogeys":  return pl.rounds.reduce((a, r) => a + r.bogeys,0);
        case "rnd":     return pl.rounds.length;
        case "year":    return 0; // year sort ordena edições, não players
        case "pos":
        default:        return pl.officialPlace ?? null;
      }
    };

    // Ordenar lista de edições — só faz sentido para sortKey "year".
    // Para os outros, mantemos ano desc (mais recente primeiro), mas
    // ordenamos players DENTRO.
    let orderedEditions = editions!;
    if (sortKey === "year") {
      orderedEditions = [...orderedEditions].sort((a, b) => a.year.localeCompare(b.year) * dir);
    }

    const out: ScorecardRow[] = [];
    let idx = 0;
    for (const ed of orderedEditions) {
      let players = ed.players.slice(0, limit);
      // Aplicar sort aos players dentro da edição.
      if (sortKey !== "year" && sortKey !== "pos") {
        players = [...players].sort((a, b) => {
          const va = playerMetric(a, sortKey);
          const vb = playerMetric(b, sortKey);
          if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
          return compareValuesNullsLast(va, vb, dir);
        });
      }
      for (const pl of players) {
        const rowBg = idx % 2 === 0 ? undefined : "var(--bg-muted)";
        const subBg = rowBg ? "color-mix(in srgb,var(--bg-muted) 60%,transparent)" : "var(--bg-stripe)";
        const posStr = String(pl.officialPlace ?? idx + 1);
        pl.rounds.forEach((r, ri) => {
          const first = ri === 0;
          const bg = first ? rowBg : subBg;
          const bt = first ? "u-bt-2px-solid-border" : "";
          out.push({
            key: `${ed.tcode}_${pl.memberId}_${r.rn}`,
            pos: first ? posStr : "",
            gross: r.gross,
            toPar: ed.parPerRound > 0 ? r.toPar : null,
            scores: r.strokes,
            ...rowPar(ed),
            rowBg: bg, stickyBg: bg,
            borderTop: first ? "2px solid var(--border)" : undefined,
            nameContent: first
              ? <PlayerName name={pl.name} title={`Abrir ${pl.name} em Kids2`} />
              : <span className="muted fs-10 u-pl-8px">↳</span>,
            prefixCells: (
              <>
                <YearCell ed={ed} bt={bt} show={first} />
                <td className={"lb-club " + bt}>{first ? fmtCountry(pl.country) : ""}</td>
                <td className={"lb-tee fw-600 fs-10 c-muted " + bt}>R{r.rn}</td>
              </>
            ),
            postScorecardCells: <StatCells r={r} bt={bt} />,
          });
        });
        idx++;
      }
    }
    return out;
  }

  function independentRows(): ScorecardRow[] {
    // Modo independente: aplanar TODAS as rondas de TODAS as
    // edições e ordenar globalmente. Permite misturar anos para
    // comparar melhores scores.
    const flat: FlatRow[] = [];
    for (const ed of editions!) {
      for (const pl of ed.players.slice(0, limit)) {
        for (const r of pl.rounds) flat.push({ pl, r, ed });
      }
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: FlatRow, b: FlatRow): number => {
      if (sortKey.startsWith("h")) {
        const hi = parseInt(sortKey.slice(1), 10) - 1;
        return compareNullsLast(a.r.strokes[hi] || null, b.r.strokes[hi] || null, dir);
      }
      switch (sortKey) {
        case "year":    return (a.ed.year.localeCompare(b.ed.year)) * dir;
        case "name":    return a.pl.name.localeCompare(b.pl.name) * dir;
        case "country": return compareTextNullsLast(a.pl.country, b.pl.country, dir);
        case "rnd":     return (a.r.rn - b.r.rn) * dir;
        case "topar":   return (a.r.toPar - b.r.toPar) * dir;
        case "gross":   return (a.r.gross - b.r.gross) * dir;
        case "birds":   return (a.r.birds - b.r.birds) * dir;
        case "pars":    return (a.r.pars  - b.r.pars)  * dir;
        case "bogeys":  return (a.r.bogeys - b.r.bogeys) * dir;
        case "pos":
        default: {
          // pos: fallback para ordem oficial (ano desc, place asc)
          const yr = b.ed.year.localeCompare(a.ed.year);
          if (yr !== 0) return yr;
          return compareNullsLast(a.pl.officialPlace, b.pl.officialPlace, dir);
        }
      }
    };
    flat.sort((a, b) => {
      const v = cmp(a, b);
      if (v !== 0) return v;
      // Tiebreaks: melhor (menor) toPar, depois gross
      return (a.r.toPar - b.r.toPar) || (a.r.gross - b.r.gross);
    });
    const bt = "u-bt-1px-solid-border-light";
    return flat.map(({ pl, r, ed }, i): ScorecardRow => {
      const bg = i % 2 === 0 ? undefined : "var(--bg-muted)";
      return {
        key: `${ed.tcode}_${pl.memberId}_${r.rn}`,
        pos: i + 1,
        gross: r.gross,
        toPar: ed.parPerRound > 0 ? r.toPar : null,
        scores: r.strokes,
        ...rowPar(ed),
        rowBg: bg, stickyBg: bg,
        borderTop: "1px solid var(--border-light)",
        nameContent: <PlayerName name={pl.name} />,
        prefixCells: (
          <>
            <YearCell ed={ed} bt={bt} show />
            <td className={"lb-club " + bt}>{fmtCountry(pl.country)}</td>
            <td className={"lb-tee fw-600 fs-10 c-muted " + bt}>R{r.rn}</td>
          </>
        ),
        postScorecardCells: <StatCells r={r} bt={bt} />,
      };
    });
  }

  const hdr = (k: SortKey, cls: string, label: ReactNode) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls}>{label}</SortableHdr>;

  return (
    <div>
      {/* Toolbar topo: top-N + Agrupado/Independente */}
      <div className="muted fs-11 mb-8 p-0-4px gap-8 flex-wrap u-d-flex u-ai-center">
        <span>
          {groupMode ? totalPlayers : totalScorecards} {groupMode ? "jogadores" : "scorecards"} ·
          {" "}{editions.length} edi{editions.length === 1 ? "ção" : "ções"}
        </span>

        {/* Top-N selector */}
        <span className="u-d-flex u-ai-center u-gap-4px u-ml-8px">
          <span className="c-muted fs-10">Top:</span>
          <TabRow<typeof topN> className="seg-sm" active={topN} onChange={setTopN}
            tabs={([5, 10, 20, 0] as const).map(n => ({ key: n, label: n === 0 ? "Todos" : String(n) }))} />
        </span>

        {/* Toggle Agrupado/Independente — copia visual exacto de AllRoundsScorecardLB */}
        <TabRow<boolean> className="seg-sm u-ml-4px" active={groupMode} onChange={setGroupMode}
          tabs={[{ key: true, label: "Agrupado" }, { key: false, label: "Independente" }]} />

        {(ref.metersPerHole || refPar(ref)) && (
          <span className="c-muted fs-10" title={refTip}>m e PAR: edição {ref.year}</span>
        )}
      </div>

      <ScorecardLeaderboard
        par={refPar(ref) ?? []}
        holes={hpr}
        si={ref.metersPerHole ?? undefined}
        siLabel="m"
        rows={rows}
        showScorecard
        parLabelColSpan={3}
        prefixHeaderCells={
          <>
            {hdr("year", "lb-tee fs-10 fw-600 u-minw-38px", "Ano")}
            {hdr("country", "lb-club", "País")}
            {hdr("rnd", "lb-tee fs-10 fw-600", "Rnd")}
          </>
        }
        postScorecardColCount={3}
        postScorecardHeaderCells={
          <>
            {hdr("birds", "lb-bird", "🐦")}
            {hdr("pars", "lb-par-stat", "Par")}
            {hdr("bogeys", "lb-bog", "■")}
          </>
        }
        onSortPos={() => toggleSort("pos")}
        onSortName={() => toggleSort("name")}
        onSortToPar={() => toggleSort("topar")}
        onSortGross={() => toggleSort("gross")}
        onSortHole={(i) => toggleSort(`h${i + 1}`)}
        activeSortKey={lbSortKey(sortKey)}
        activeSortDir={sortDir}
      />

      {/* ── Linha ecléctica por jogador ── */}
      <EcleticTable editions={editions} limit={limit} hpr={hpr} />
    </div>
  );
}

interface FlatRow { pl: PlayerCard; r: PlayerRound; ed: Edition }

/** Chaves locais (topar · h1..h18) no vocabulário do ScorecardLeaderboard. */
function lbSortKey(k: string): string {
  if (k === "topar") return "toPar";
  if (/^h\d+$/.test(k)) return `hole:${parseInt(k.slice(1), 10) - 1}`;
  return k;
}

/** Par completo da edição (um valor > 0 por buraco), ou null = SEM PAR. */
function refPar(ed: Edition): number[] | null {
  const p = ed.par?.slice(0, ed.holesPerRound);
  return p && p.length === ed.holesPerRound && p.every((v) => v > 0) ? p : null;
}

/** Par da linha: cada edição tem o seu; sem par completo, a linha fica sem cores. */
function rowPar(ed: Edition): Pick<ScorecardRow, "holePars" | "noPar"> {
  const p = refPar(ed);
  return p ? { holePars: p } : { noPar: true };
}

function edTitle(ed: Edition, withMeters: boolean): string {
  return `${ed.year}${ed.course ? " · " + ed.course : ""}${withMeters && ed.meters ? " · " + ed.meters + "m" : ""}${ed.parPerRound ? " · Par " + ed.parPerRound : ""}`;
}

function fmtCountry(c: string): string {
  if (!c) return "—";
  // Strings curtas (2-3 chars) já estão no formato ISO, mostrar uppercase.
  if (c.length <= 3) return c.toUpperCase();
  return c;
}

function PlayerName({ name, title }: { name: string; title?: string }) {
  return (
    <span className="u-d-block u-maxw-140px u-ov-hidden u-tov-ellipsis u-ws-nowrap u-fw-600">
      <ExtLink href={kidsUrl({ name })} className="u-c-text u-td-none" title={title}>{name}</ExtLink>
    </span>
  );
}

function YearCell({ ed, bt, show, withMeters = true }: { ed: Edition; bt: string; show: boolean; withMeters?: boolean }) {
  return (
    <td className={"lb-tee fs-10 fw-600 u-c-text-2 " + bt} title={edTitle(ed, withMeters)}>
      {show ? ed.year : ""}
    </td>
  );
}

function StatCells({ r, bt }: { r: PlayerRound; bt: string }) {
  return (
    <>
      <td className={"lb-bird " + bt}>{r.birds || ""}</td>
      <td className={"lb-par-stat " + bt}>{r.pars || ""}</td>
      <td className={"lb-bog " + bt}>{r.bogeys || ""}</td>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Linha ecléctica ("ringer score")
   Para cada jogador, o MELHOR resultado em cada buraco ao longo de todas as
   voltas dessa edição, somado. Mostra o "teto" do jogador — o que faria se
   juntasse os seus melhores buracos. Só faz sentido com ≥ 2 voltas, e a
   comparação justa é entre jogadores com o mesmo nº de voltas (garantido por
   `completed` na edição).
   ────────────────────────────────────────────────────────────────────────── */

export interface EcleticLine {
  /** Melhor resultado em cada buraco (0 = buraco nunca jogado). */
  best: number[];
  total: number;
  toPar: number;
  out: number;
  inn: number;
  /** Melhor volta real (menor gross numa só volta). */
  bestRound: number;
  /** Quanto o ecléctico bate a melhor volta real (≥ 0 = pancadas "deixadas na mesa"). */
  delta: number;
  birds: number;
  pars: number;
}

/** Calcula a linha ecléctica de um jogador numa edição. */
export function buildEclectic(pl: PlayerCard, ed: Edition): EcleticLine {
  const hpr = ed.holesPerRound;
  const best: number[] = new Array(hpr).fill(0);
  for (let h = 0; h < hpr; h++) {
    let m = 0;
    for (const r of pl.rounds) {
      const v = r.strokes[h];
      if (v && v > 0 && (m === 0 || v < m)) m = v;
    }
    best[h] = m;
  }
  const total = best.reduce((a, b) => a + (b || 0), 0);
  const out = best.slice(0, Math.min(9, hpr)).reduce((a, b) => a + (b || 0), 0);
  const inn = !ed.is9 ? best.slice(9, 18).reduce((a, b) => a + (b || 0), 0) : 0;
  const t = tallyHoles(best, ed.par);
  const bestRound = Math.min(...pl.rounds.map((r) => r.gross));
  return {
    best,
    total,
    toPar: ed.parPerRound > 0 ? total - ed.parPerRound : 0,
    out,
    inn,
    bestRound,
    delta: bestRound - total,
    birds: t.birds,
    pars: t.pars,
  };
}

type EclSortKey = "pos" | "year" | "name" | "country" | "topar" | "gross" | "best" | "delta" | `h${number}`;

interface EclRow {
  ed: Edition;
  pl: PlayerCard;
  ecl: EcleticLine;
}

function EcleticTable({ editions, limit, hpr }: {
  editions: Edition[];
  limit: number;
  hpr: number;
}) {
  const [sortKey, setSortKey] = useState<EclSortKey>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(k: EclSortKey) {
    if (sortKey === k) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(k);
    // delta DESC (mais potencial por libertar primeiro); ano DESC; resto ASC.
    if (k === "delta" || k === "year") setSortDir("desc");
    else setSortDir("asc");
  }

  const rows: EclRow[] = useMemo(() => {
    const out: EclRow[] = [];
    for (const ed of editions) {
      for (const pl of ed.players.slice(0, limit)) {
        if (pl.rounds.length < 2) continue; // ecléctico exige ≥ 2 voltas
        out.push({ ed, pl, ecl: buildEclectic(pl, ed) });
      }
    }
    return out;
  }, [editions, limit]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const metric = (row: EclRow): number | string | null => {
      if (sortKey.startsWith("h")) {
        const v = row.ecl.best[parseInt(sortKey.slice(1), 10) - 1];
        return v && v > 0 ? v : null;
      }
      switch (sortKey) {
        case "year":    return row.ed.year;
        case "name":    return row.pl.name;
        case "country": return row.pl.country || null;
        case "topar":   return row.ecl.toPar;
        case "gross":   return row.ecl.total;
        case "delta":   return row.ecl.delta;
        case "best":    return row.ecl.bestRound;
        case "pos":
        default:        return row.ecl.total;
      }
    };
    return [...rows].sort((a, b) => {
      // "pos" = ordem natural (ano desc, depois melhor ecléctico).
      if (sortKey === "pos") {
        const yr = b.ed.year.localeCompare(a.ed.year);
        if (yr !== 0) return yr;
        return a.ecl.total - b.ecl.total;
      }
      return compareValuesNullsLast(metric(a), metric(b), dir)
        || (a.ecl.total - b.ecl.total) * dir; // tiebreak
    });
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) return null;

  const ref = editions[0];
  const bt = "u-bt-1px-solid-border-light";
  const lbRows = sorted.map(({ ed, pl, ecl }, i): ScorecardRow => {
    const bg = i % 2 === 0 ? undefined : "var(--bg-muted)";
    return {
      key: `${ed.tcode}_${pl.memberId}`,
      pos: i + 1,
      gross: ecl.total,
      toPar: ed.parPerRound > 0 ? ecl.toPar : null,
      scores: ecl.best,
      ...rowPar(ed),
      rowBg: bg, stickyBg: bg,
      borderTop: "1px solid var(--border-light)",
      nameContent: <PlayerName name={pl.name} />,
      prefixCells: (
        <>
          <YearCell ed={ed} bt={bt} show withMeters={false} />
          <td className={"lb-club " + bt}>{fmtCountry(pl.country)}</td>
          <td className={"lb-tee fw-600 fs-10 u-c-accent " + bt} title={`Ecléctico de ${pl.rounds.length} voltas`}>Ecl</td>
        </>
      ),
      postScorecardCells: (
        <>
          <td className={"lb-gross u-c-text-muted " + bt} title="Melhor volta real">{ecl.bestRound}</td>
          <td className={"lb-topar " + bt}><ToPar v={-ecl.delta} kind="delta" title="Pancadas deixadas na mesa (melhor volta − ecléctico)" /></td>
        </>
      ),
    };
  });
  const hdr = (k: EclSortKey, cls: string, label: ReactNode) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls}>{label}</SortableHdr>;

  return (
    <details className="u-mt-24px">
      <summary className="fs-13 fw-600 u-c-text u-cur-pointer u-user-select-none u-mb-4px">
        Linha ecléctica{" "}
        <span className="c-muted fw-400 fs-11">({rows.length} jogador{rows.length === 1 ? "" : "es"})</span>
      </summary>
      <div className="muted fs-11 mb-8 u-maxw-720px u-lh-1_45 u-mt-6pxx">
        O <b>melhor resultado de cada jogador em cada buraco</b>, somado nas voltas
        da edição — o teto de cada um se juntasse os seus melhores buracos.{" "}
        <b>Δ</b> = quanto o ecléctico bate a melhor volta real (quanto maior, mais
        ficou por encaixar). Só jogadores com ≥ 2 voltas.
      </div>

      <ScorecardLeaderboard
        par={refPar(ref) ?? []}
        holes={hpr}
        rows={lbRows}
        showScorecard
        parLabelColSpan={3}
        prefixHeaderCells={
          <>
            {hdr("year", "lb-tee fs-10 fw-600 u-minw-38px", "Ano")}
            {hdr("country", "lb-club", "País")}
            <th className="lb-tee fs-10 fw-600 c-muted">Ecl</th>
          </>
        }
        postScorecardColCount={2}
        postScorecardHeaderCells={
          <>
            {hdr("best", "lb-gross", "Melhor")}
            {hdr("delta", "lb-topar", "Δ")}
          </>
        }
        onSortPos={() => toggleSort("pos")}
        onSortName={() => toggleSort("name")}
        onSortToPar={() => toggleSort("topar")}
        onSortGross={() => toggleSort("gross")}
        onSortHole={(i) => toggleSort(`h${i + 1}`)}
        activeSortKey={lbSortKey(sortKey)}
        activeSortDir={sortDir}
      />
    </details>
  );
}
