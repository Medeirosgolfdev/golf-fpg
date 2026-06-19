import { useMemo, useState, useEffect, Fragment } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import KpiCard from "../ui/KpiCard";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import Counter from "../ui/Counter";
import { Toolbar, ToolbarTitle } from "../ui/Toolbar";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { useParams, useNavigate } from "react-router-dom";
import type { Course, Tee, SexFilter, CoursePlayerRound } from "../data/types";
import { useAppContext } from "../context/AppContext";
import TeeBadge from "../ui/TeeBadge";
import SexBadge from "../ui/SexBadge";
import { teeCanonicalLabel, teeGroupHex } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase, sumRange, fmtToPar } from "../utils/format";
import { fixMojibake } from "../utils/fixEncoding";
import { sortTees, filterTees } from "../utils/teeUtils";
import { PillBadge } from "../ui/PillBadge";
import ExtLink from "../ui/ExternalLink";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import { cachedFetchJson } from "../data/fetchCache";
import { isTournamentCourse } from "../constants/tournamentCourses";
import { loadPlayerData } from "../data/playerDataLoader";
import type { PlayerPageData } from "../data/playerDataLoader";
import { MANUEL_FED } from "../constants/manuel";
import { canonicalCourseName } from "../utils/courseAliases";
import { SC } from "../utils/scoreDisplay";
import { physicalTeeGroups, physicalTeeKey, sexesIn, type SexKey, type PhysTeeGroup } from "../utils/teeGroups";
import TeeBars from "../ui/TeeBars";
import DetailHeader from "../ui/DetailHeader";

/* Mapa fed-code → nome para jogadores que não estão em players.json.
   Gerado por scripts/build-course-player-names.js a partir de federados.json.
   Carregado uma única vez ao nível do módulo. */
let _coursePlayerNames: Record<string, string> | null = null;
let _coursePlayerNamesPromise: Promise<Record<string, string>> | null = null;
function loadCoursePlayerNames(): Promise<Record<string, string>> {
  if (_coursePlayerNames) return Promise.resolve(_coursePlayerNames);
  if (!_coursePlayerNamesPromise) {
    _coursePlayerNamesPromise = cachedFetchJson<{ names?: Record<string, string> }>(
      "/data/course-player-names.json"
    )
      .then((d) => {
        _coursePlayerNames = d?.names ?? {};
        return _coursePlayerNames;
      })
      .catch(() => {
        _coursePlayerNames = {};
        return _coursePlayerNames;
      });
  }
  return _coursePlayerNamesPromise;
}



type OriginFilter = "ALL" | "PT" | "INTL" | "TOURN";

/* ——— Helpers ——— */

/** Mapa de paises conhecidos — fallback para quando country nao vem nos dados */
const KNOWN_AWAY: Record<string, { country: string; flag: string }> = {
  "away-villa-padierna-flamingos":           { country: "Espanha",  flag: "\ud83c\uddea\ud83c\uddf8" },
  "away-le-touquet-golf-club-la-for-t":      { country: "França",   flag: "\ud83c\uddeb\ud83c\uddf7" },
  "away-golf-della-montecchia-white-red":    { country: "Itália",   flag: "\ud83c\uddee\ud83c\uddf9" },
  "away-golden-palm":                        { country: "EUA",      flag: "\ud83c\uddfa\ud83c\uddf8" },
  "away-real-club-de-golf-el-prat":          { country: "Espanha",  flag: "\ud83c\uddea\ud83c\uddf8" },
  "away-terre-dei-consoli-golf-club":        { country: "Itália",   flag: "\ud83c\uddee\ud83c\uddf9" },
  "away-marco-simone":                       { country: "Itália",   flag: "\ud83c\uddee\ud83c\uddf9" },
};

const COUNTRY_FLAGS: Record<string, string> = {
  "portugal": "🇵🇹", "espanha": "🇪🇸",
  "italia": "🇮🇹", "franca": "🇫🇷",
  "eua": "🇺🇸", "reino unido": "🇬🇧",
  "inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "irlanda": "🇮🇪", "irlanda do norte": "🇬🇧",
  "alemanha": "🇩🇪", "holanda": "🇳🇱", "suica": "🇨🇭",
  "belgica": "🇧🇪", "turquia": "🇹🇷",
  "marrocos": "🇲🇦", "brasil": "🇧🇷",
  "africa do sul": "🇿🇦", "grecia": "🇬🇷",
  "suecia": "🇸🇪", "noruega": "🇳🇴", "dinamarca": "🇩🇰",
  "finlandia": "🇫🇮", "polonia": "🇵🇱",
  "eslovaquia": "🇸🇰", "rep checa": "🇨🇿", "republica checa": "🇨🇿",
  "hungria": "🇭🇺", "austria": "🇦🇹", "bulgaria": "🇧🇬",
  "estonia": "🇪🇪", "ucrania": "🇺🇦", "islandia": "🇮🇸",
  "canada": "🇨🇦", "porto rico": "🇵🇷",
  "pais de gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "rep dominicana": "🇩🇴",
};

function normalizeCountryKey(raw: string): string {
  const s = fixMojibake(raw);
  return s.trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveFlag(c: Course): string {
  // Só campos ESTRANGEIROS mostram bandeira — campos PT ("casa") não.
  const _ck = c.master.country ? normalizeCountryKey(c.master.country) : "";
  if (!c.courseKey.startsWith("away-") || _ck === "portugal") return "";
  // 1) Tentar pelo country dos dados
  if (c.master.country) {
    const key = normalizeCountryKey(c.master.country);
    const flag = COUNTRY_FLAGS[key];
    if (flag) return flag;
  }
  // 2) Fallback: mapa de campos conhecidos
  const known = KNOWN_AWAY[c.courseKey];
  if (known) return known.flag;
  // Campo away estrangeiro desconhecido — bandeira genérica
  if (c.courseKey.startsWith("away-")) return "\ud83c\udff3\ufe0f";
  return "";
}

function resolveCountryName(c: Course): string {
  // Só campos estrangeiros mostram país — PT não.
  if (!c.courseKey.startsWith("away-")) return "";
  if (c.master.country) {
    const n = fixMojibake(c.master.country).trim();
    return normalizeCountryKey(n) === "portugal" ? "" : n;
  }
  return KNOWN_AWAY[c.courseKey]?.country || "";
}

/** Referência do campo para mostrar por baixo do nome: o nº FPG (ncourse-XXX-Y)
 *  quando existe; senão o courseKey (combos e campos away não têm nº). */
function courseRef(c: Course): string {
  const sc = (c.master.numbers as { scorecards?: string } | undefined)?.scorecards;
  return sc ? `ncourse-${sc}` : c.courseKey;
}

function isAway(c: Course): boolean {
  return c.courseKey.startsWith("away-");
}


/* ——— Componente: Grelha Scorecard Multi-Tee ——— */

function ScorecardGrid({ tees, selKey }: { tees: Tee[]; selKey?: string | null }) {
  const groups = useMemo(() => physicalTeeGroups(tees), [tees]);
  const sexes = useMemo<SexKey[]>(() => sexesIn(groups, (g) => g.h18), [groups]);

  // Tee seleccionado para comparação de distâncias (coluna Δm no fim)
  const selGroup = selKey ? groups.find((g) => g.key === selKey) : null;
  const selTot = selGroup?.teeHoles.distances?.total ?? null;
  const showDelta = !!selGroup && selTot != null;

  const refTee = useMemo(
    () => groups.map((g) => g.teeHoles).find((t) => (t.holes?.length ?? 0) >= 18) ?? groups[0]?.teeHoles,
    [groups]
  );
  const refByHole = useMemo(() => {
    const m = new Map<number, NonNullable<Tee["holes"]>[0]>();
    for (const h of refTee?.holes ?? []) {
      if (h.hole >= 1 && h.hole <= 18) m.set(h.hole, h);
    }
    return m;
  }, [refTee]);

  if (!groups.length) return <div className="muted">Sem tees disponíveis</div>;

  const sepL = "1px solid var(--border)";        // separa cada par de tee
  const sepThin = "1px solid var(--border-light)"; // separa CR de Slope
  // PAR/SI não têm CR/Slope: o rótulo abrange (merge) a coluna Tee + as colunas
  // de rating, alinhado à direita, junto ao início dos dados (sem riscos).
  const labelSpan = 1 + sexes.length * 2;

  return (
    <div className="sc-wrap">
      <table className="sc-table sc-grid">
        <thead>
          {/* PAR e SI — acima da linha de cabeçalho, para o cabeçalho ficar
              colado aos tees (sem interrupção). */}
          <tr className="sc-meta-row sc-par-row">
            <td className="sc-sticky sc-meta-label" colSpan={labelSpan} style={{ textAlign: "right", paddingRight: 12 }}>PAR</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="ta-c" style={i === 0 ? { borderLeft: sepL } : undefined}>{refByHole.get(i + 1)?.par ?? "–"}</td>
            ))}
            <td className="ta-c sc-tot-val sc-col-out">{fmt(sumRange(1, 9, (i) => refByHole.get(i)?.par ?? null))}</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="ta-c">{refByHole.get(i + 10)?.par ?? "–"}</td>
            ))}
            <td className="ta-c sc-tot-val sc-col-in">{fmt(sumRange(10, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
            <td className="ta-c sc-tot-val">{fmt(sumRange(1, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
            {showDelta && <td className="ta-c sc-tot-val" style={{ borderLeft: sepL }} />}
          </tr>
          <tr className="sc-meta-row sc-hcp-row">
            <td className="sc-sticky sc-meta-label" colSpan={labelSpan} style={{ textAlign: "right", paddingRight: 12 }}>SI</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="ta-c" style={i === 0 ? { borderLeft: sepL } : undefined}>{refByHole.get(i + 1)?.si ?? "–"}</td>
            ))}
            <td className="ta-c sc-tot-val sc-col-out" />
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="ta-c">{refByHole.get(i + 10)?.si ?? "–"}</td>
            ))}
            <td className="ta-c sc-tot-val" colSpan={2} />
            {showDelta && <td className="ta-c sc-tot-val" style={{ borderLeft: sepL }} />}
          </tr>
          {/* Linha 1: Tee + grupos M/F (cada um abrange CR+Slope) + buracos */}
          <tr>
            <th className="sc-sticky" rowSpan={2}>Tee</th>
            {sexes.map((s) => (
              <th key={`g-${s}`} colSpan={2} className="sc-h" style={{ borderLeft: sepL, borderBottom: "none", textAlign: "center", padding: "1px 6px" }}>
                {(s === "M" || s === "F") ? <SexBadge sex={s} /> : "—"}
              </th>
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i + 1} rowSpan={2} className="sc-h" style={i === 0 ? { borderLeft: sepL } : undefined}>{i + 1}</th>
            ))}
            <th className="sc-h sc-tot sc-col-out" rowSpan={2}>OUT</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i + 10} rowSpan={2} className="sc-h">{i + 10}</th>
            ))}
            <th className="sc-h sc-tot sc-col-in" rowSpan={2}>IN</th>
            <th className="sc-h sc-tot" rowSpan={2}>TOT</th>
            {showDelta && (
              <th className="sc-h sc-tot" rowSpan={2} style={{ borderLeft: sepL }} title={`Diferença de metros para ${selGroup!.label}`}>
                Δm
              </th>
            )}
          </tr>
          {/* Linha 2: sub-cabeçalhos CR / Slope por sexo */}
          <tr>
            {sexes.flatMap((s) => [
              <th key={`h-${s}-cr`} className="sc-h" style={{ borderLeft: sepL, padding: "2px 6px", fontWeight: 400, color: "var(--text-3)" }}>CR</th>,
              <th key={`h-${s}-sl`} className="sc-h" style={{ padding: "2px 6px", fontWeight: 400, color: "var(--text-3)" }}>Slope</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {/* Linhas por tee físico: CR/Slope (por sexo) + distâncias por buraco */}
          {groups.map((g) => {
            const byHole = new Map<number, NonNullable<Tee["holes"]>[0]>();
            for (const h of g.teeHoles.holes ?? []) byHole.set(h.hole, h);

            const out = sumRange(1, 9, (i) => byHole.get(i)?.distance ?? null);
            const inn = sumRange(10, 18, (i) => byHole.get(i)?.distance ?? null);
            const tot = (out ?? 0) + (inn ?? 0);
            const isSel = showDelta && g.key === selKey;
            const myTot = g.teeHoles.distances?.total ?? null;
            const deltaM = showDelta && myTot != null && selTot != null ? myTot - selTot : null;

            return (
              <tr key={g.key} className="sc-tee-row" style={isSel ? { background: "var(--accent-light)" } : undefined}>
                <td className="sc-sticky sc-tee-cell" style={isSel ? { background: "var(--accent-light)" } : undefined}>
                  <TeeBadge label={g.label} colorHex={g.colorHex} />
                </td>
                {sexes.flatMap((s) => {
                  const r = g.h18[s];
                  return [
                    <td key={`r-${s}-cr`} className="ta-c" style={{ fontSize: "var(--fs-12)", borderLeft: sepL }}>
                      {r ? fmtCR(r.cr) : ""}
                    </td>,
                    <td key={`r-${s}-sl`} className="ta-c" style={{ fontSize: "var(--fs-12)", borderLeft: sepThin }}>
                      {r ? r.sl : ""}
                    </td>,
                  ];
                })}
                {Array.from({ length: 9 }, (_, i) => (
                  <td key={i + 1} className="ta-c" style={i === 0 ? { borderLeft: sepL } : undefined}>{fmt(byHole.get(i + 1)?.distance ?? null)}</td>
                ))}
                <td className="ta-c sc-tot-val sc-col-out">{fmt(out)}</td>
                {Array.from({ length: 9 }, (_, i) => (
                  <td key={i + 10} className="ta-c">{fmt(byHole.get(i + 10)?.distance ?? null)}</td>
                ))}
                <td className="ta-c sc-tot-val sc-col-in">{fmt(inn)}</td>
                <td className="ta-c sc-tot-val">{fmt(tot || null)}</td>
                {showDelta && (
                  <td
                    className="ta-c sc-tot-val"
                    style={{ borderLeft: sepL, fontWeight: 700, color: "var(--text-2)" }}
                  >
                    {isSel ? "—" : deltaM == null ? "–" : `${deltaM > 0 ? "+" : ""}${deltaM}`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ——— Componente: Ratings de 9 buracos (F9 / B9) — bloco à parte ———
 * Mesma grelha limpa do scorecard. Por tee físico, agrupa F9 e B9; dentro de
 * cada um, CR/Slope por sexo. O CR/Slope de 18 buracos vive na tabela principal. */
function CourseNineRatings({ tees }: { tees: Tee[] }) {
  const groups = useMemo(() => physicalTeeGroups(tees), [tees]);
  const nines = useMemo(
    () => ([
      { id: "f9" as const, label: "Front 9 (1–9)", sexes: sexesIn(groups, (g) => g.f9), get: (g: PhysTeeGroup) => g.f9 },
      { id: "b9" as const, label: "Back 9 (10–18)", sexes: sexesIn(groups, (g) => g.b9), get: (g: PhysTeeGroup) => g.b9 },
    ].filter((n) => n.sexes.length > 0)),
    [groups]
  );
  if (!groups.length || nines.length === 0) return null;

  const sepL = "1px solid var(--border)";
  const sepThin = "1px solid var(--border-light)";
  const sexBadge = (s: SexKey) => (s === "M" || s === "F") ? <SexBadge sex={s} /> : "—";

  return (
    <details className="m-14-0" open>
      <summary className="h-xs" style={{ margin: "0 0 8px", cursor: "pointer" }}>Ratings por 9 buracos</summary>
      <div className="sc-wrap">
        <table className="sc-table sc-grid">
          <thead>
            {/* Linha 1: Front 9 / Back 9 */}
            <tr>
              <th className="sc-sticky" rowSpan={3}>Tee</th>
              {nines.map((n) => (
                <th key={n.id} className="sc-h" colSpan={n.sexes.length * 2} style={{ borderLeft: sepL, textAlign: "center", padding: "2px 6px" }}>{n.label}</th>
              ))}
            </tr>
            {/* Linha 2: sexo (abrange CR+Slope) — caixa sem linhas internas */}
            <tr>
              {nines.flatMap((n) => n.sexes.map((s, i) => (
                <th key={`${n.id}-${s}`} className="sc-h" colSpan={2} style={{ borderLeft: i === 0 ? sepL : sepThin, borderBottom: "none", textAlign: "center", padding: "1px 6px" }}>
                  {sexBadge(s)}
                </th>
              )))}
            </tr>
            {/* Linha 3: CR / Slope (sem linha interna entre eles) */}
            <tr>
              {nines.flatMap((n) => n.sexes.flatMap((s, i) => [
                <th key={`${n.id}-${s}-cr`} className="sc-h" style={{ borderLeft: i === 0 ? sepL : sepThin, padding: "2px 6px", fontWeight: 400, color: "var(--text-3)" }}>CR</th>,
                <th key={`${n.id}-${s}-sl`} className="sc-h" style={{ padding: "2px 6px", fontWeight: 400, color: "var(--text-3)" }}>Slope</th>,
              ]))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="sc-tee-row">
                <td className="sc-sticky sc-tee-cell"><TeeBadge label={g.label} colorHex={g.colorHex} /></td>
                {nines.flatMap((n) => n.sexes.flatMap((s, i) => {
                  const r = n.get(g)[s];
                  return [
                    <td key={`${n.id}-${s}-cr`} className="ta-c" style={{ fontSize: "var(--fs-12)", borderLeft: i === 0 ? sepL : sepThin }}>{r ? fmtCR(r.cr) : ""}</td>,
                    <td key={`${n.id}-${s}-sl`} className="ta-c" style={{ fontSize: "var(--fs-12)", borderLeft: sepThin }}>{r ? r.sl : ""}</td>,
                  ];
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
/* ——— Componente: Quem jogou neste campo ——— */

/** Cor de TEXTO (subtil) para o to-par de uma volta. Sem fundos berrantes. */
function tpTextColor(tp: number | null): string {
  if (tp == null) return "var(--text-muted)";
  if (tp <= 0) return "var(--color-good-dark)";
  if (tp <= 6) return "var(--color-warn-dark)";
  return "var(--color-danger-dark)";
}

/** "2026-02-27" → "27/02"; "" se a data não for ISO. */
function fmtDM(d: string | null): string {
  const m = d && d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : "";
}
/** "2026-02-27" → "27/02/2026"; "" se a data não for ISO. */
function fmtDMYfull(d: string | null): string {
  const m = d && d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
/** Número com vírgula decimal (pt). */
function dec1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

type CPBucket = {
  n: number;
  bestGross: number | null;
  bestToPar: number | null;
  avgGross: number | null;
  avgToPar: number | null;
  last: string | null;
};
type PlayerSummary = {
  nfed: string;
  name: string;
  isM: boolean;
  rounds: CoursePlayerRound[];
  total: number;
  b18: CPBucket;
  b9: CPBucket;
};

type CPSortKey = "name" | "n" | "best" | "avg" | "last";

const EMPTY_BUCKET: CPBucket = { n: 0, bestGross: null, bestToPar: null, avgGross: null, avgToPar: null, last: null };

/** Score válido para estatística? Exclui sentinelas: gross 0/negativo e os
 *  placeholders 998/999 ("não entregou cartão / WD") que inflavam as médias. */
function validGross(g: number | null | undefined): g is number {
  return g != null && g > 0 && g < 200;
}
/** Buracos da volta: 18 ou 9 (derivado do par = gross − toPar), ou null se
 *  inválida. Permite separar meias-voltas (incomparáveis) das voltas completas. */
function roundHoles(r: CoursePlayerRound): 18 | 9 | null {
  if (!validGross(r.gross)) return null;
  // Preferir o nº de buracos guardado (course-players.json novo); senão derivar.
  if (r.holes === 18 || r.holes === 9) return r.holes;
  if (r.toPar != null) {
    const par = r.gross - r.toPar;
    if (par < 26 || par > 120) return null; // par implausível → sentinela
    return par >= 50 ? 18 : 9;
  }
  return r.gross >= 55 ? 18 : 9;
}
/** Estatística de um conjunto de voltas (já filtradas como válidas). */
function buildBucket(rounds: CoursePlayerRound[]): CPBucket {
  if (rounds.length === 0) return EMPTY_BUCKET;
  let bestGross: number | null = null, bestToPar: number | null = null;
  let sumG = 0, sumTp = 0, nTp = 0, last: string | null = null;
  for (const r of rounds) {
    const g = r.gross as number;
    if (bestGross == null || g < bestGross) { bestGross = g; bestToPar = r.toPar ?? null; }
    sumG += g;
    if (r.toPar != null) { sumTp += r.toPar; nTp++; }
    if (r.date && (last == null || r.date > last)) last = r.date;
  }
  return { n: rounds.length, bestGross, bestToPar, avgGross: sumG / rounds.length, avgToPar: nTp ? sumTp / nTp : null, last };
}
/** Bucket principal (linha de cima): prefere 18 buracos. */
function headline(s: PlayerSummary): CPBucket {
  return s.b18.n > 0 ? s.b18 : s.b9;
}

function CoursePlayersSection({ course, onSelectPlayer }: { course: Course; onSelectPlayer?: (fed: string) => void }) {
  const { players } = useAppContext();
  const [nameMap, setNameMap] = useState<Record<string, string>>(_coursePlayerNames ?? {});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Default: mais voltas primeiro. Por coluna: melhor/média ascendente (menor = melhor),
  // última descendente (mais recente primeiro), nome ascendente.
  const { sortKey, sortDir, toggleSort } = useSort<CPSortKey>("n", "desc", {
    name: "asc", best: "asc", avg: "asc",
  });

  useEffect(() => {
    let alive = true;
    loadCoursePlayerNames().then((m) => { if (alive) setNameMap(m); });
    return () => { alive = false; };
  }, []);

  const entries = useMemo<PlayerSummary[]>(() => {
    const raw = course.master._players;
    if (!raw || Object.keys(raw).length === 0) return [];
    return Object.entries(raw).map(([nfed, val]) => {
      const p = players[nfed];
      // Nome SEMPRE: players.json → mapa de federados → (último recurso) número.
      const realName = p?.name && p.name !== nfed ? p.name : null;
      const fromMap = nameMap[nfed] && nameMap[nfed] !== nfed ? nameMap[nfed] : null;
      const name = realName ?? fromMap ?? nfed;
      // Retro-compat: formato antigo = string (só data); novo = array de rondas
      const rounds: CoursePlayerRound[] = Array.isArray(val)
        ? val
        : typeof val === "string"
          ? [{ date: val, gross: null, toPar: null, tee: null, event: null, sd: null }]
          : [];
      const sortedRounds = [...rounds].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      const r18: CoursePlayerRound[] = [];
      const r9: CoursePlayerRound[] = [];
      for (const r of sortedRounds) {
        const h = roundHoles(r);
        if (h === 18) r18.push(r);
        else if (h === 9) r9.push(r);
      }
      return {
        nfed, name, isM: nfed === MANUEL_FED,
        rounds: sortedRounds, total: rounds.length,
        b18: buildBucket(r18), b9: buildBucket(r9),
      };
    });
  }, [course, players, nameMap]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: PlayerSummary, b: PlayerSummary): number => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name, "pt") * dir;
        case "best": return ((headline(a).bestGross ?? Infinity) - (headline(b).bestGross ?? Infinity)) * dir;
        case "avg":  return ((headline(a).avgGross ?? Infinity) - (headline(b).avgGross ?? Infinity)) * dir;
        case "last": return ((a.b18.last ?? a.b9.last ?? "").localeCompare(b.b18.last ?? b.b9.last ?? "")) * dir;
        case "n":
        default:     return ((a.total - b.total) || 0) * dir;
      }
    };
    const rest = entries.filter((e) => !e.isM).sort(cmp);
    const manuel = entries.filter((e) => e.isM); // fixo no topo, fora do sort
    return [...manuel, ...rest];
  }, [entries, sortKey, sortDir]);

  if (entries.length === 0) return null;

  const toggle = (nfed: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(nfed) ? next.delete(nfed) : next.add(nfed);
      return next;
    });

  const nameCell = (s: PlayerSummary) =>
    onSelectPlayer ? (
      <button type="button" onClick={() => onSelectPlayer(s.nfed)} className="tourn-pname tourn-pname-link cp-name">
        {s.name}
      </button>
    ) : (
      <a href={`/jogadores/${s.nfed}`} target="_blank" rel="noopener noreferrer" className="tourn-pname tourn-pname-link cp-name">
        {s.name}
      </a>
    );

  /** Células de estatística (Voltas/Melhor/Média/Última) de um bucket. */
  const statCells = (b: CPBucket, tag: string | null) => (
    <>
      <td className="cp-num cp-strong">
        {tag && <span className="cp-tag">{tag}</span>}
        {b.n}
      </td>
      <td className="cp-num">
        {b.bestGross != null ? (
          <>
            <span className="cp-strong">{b.bestGross}</span>
            {b.bestToPar != null && (
              <span className="cp-tp" style={{ color: tpTextColor(b.bestToPar) }}> {fmtToPar(b.bestToPar)}</span>
            )}
          </>
        ) : <span className="muted">–</span>}
      </td>
      <td className="cp-num">
        {b.avgGross != null ? (
          <>
            {dec1(b.avgGross)}
            {b.avgToPar != null && (
              <span className="cp-tp" style={{ color: tpTextColor(Math.round(b.avgToPar)) }}> ({b.avgToPar >= 0 ? "+" : ""}{dec1(b.avgToPar)})</span>
            )}
          </>
        ) : <span className="muted">–</span>}
      </td>
      <td className="cp-num cp-muted">{fmtDM(b.last) || "–"}</td>
    </>
  );

  return (
    <div className="course-players-section">
      <h4 className="course-players-title">Jogadores ({entries.length})</h4>
      <div className="sc-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th className="cp-th-exp" />
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Jogador</SortableHdr>
              <SortableHdr k="n"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="cp-num">Voltas</SortableHdr>
              <SortableHdr k="best" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="cp-num">Melhor</SortableHdr>
              <SortableHdr k="avg"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="cp-num">Média</SortableHdr>
              <SortableHdr k="last" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="cp-num">Última</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const isOpen = expanded.has(s.nfed);
              const both = s.b18.n > 0 && s.b9.n > 0;
              const primary = s.b18.n > 0 ? s.b18 : s.b9;
              // Só rotular quando há ambíguidade: 18b+9b (linha de cima = 18b),
              // ou só-9b (marcar "9b" para não confundir com volta completa).
              const primaryTag = both ? "18b" : (s.b18.n > 0 ? null : (s.b9.n > 0 ? "9b" : null));
              const secondary = both ? s.b9 : null;
              const rowCls = `${s.isM ? " cp-row-manuel" : ""}${isOpen ? " cp-row-open" : ""}`;
              return (
                <Fragment key={s.nfed}>
                  <tr
                    className={`cp-row${rowCls}${secondary ? " cp-row-paired" : ""}`}
                    onClick={() => toggle(s.nfed)}
                  >
                    <td className="cp-exp" rowSpan={secondary ? 2 : 1}>
                      <span className={`cp-chev${isOpen ? " cp-chev-open" : ""}`} aria-hidden>›</span>
                    </td>
                    <td className="cp-name-cell" rowSpan={secondary ? 2 : 1} onClick={(e) => e.stopPropagation()}>
                      {nameCell(s)}
                    </td>
                    {statCells(primary, primaryTag)}
                  </tr>
                  {secondary && (
                    <tr className={`cp-row-sub${rowCls}`} onClick={() => toggle(s.nfed)}>
                      {statCells(secondary, "9b")}
                    </tr>
                  )}
                  {isOpen && (
                    <tr className="cp-detail-row">
                      <td />
                      <td colSpan={5}>
                        <div className="cp-rounds">
                          {s.rounds.map((r, i) => {
                            const dia = fmtDM(r.date);
                            const ok = validGross(r.gross);
                            if (!ok && !dia) return null;
                            const h = roundHoles(r);
                            const title = [
                              fmtDMYfull(r.date),
                              h ? `${h} buracos` : (r.gross != null && !ok ? "sem cartão" : null),
                              r.event, r.tee, r.sd != null ? `SD ${r.sd}` : null,
                            ].filter(Boolean).join(" · ");
                            return (
                              <span key={i} className="cp-round" title={title || undefined}>
                                {dia && <span className="cp-round-date">{dia}</span>}
                                {ok ? (
                                  <span className="cp-round-score">
                                    {r.gross}
                                    {r.toPar != null && (
                                      <span style={{ color: tpTextColor(r.toPar) }}> {fmtToPar(r.toPar)}</span>
                                    )}
                                    {h === 9 && <span className="cp-round-9"> 9b</span>}
                                  </span>
                                ) : (r.gross != null && <span className="cp-round-nc">s/ cartão</span>)}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ——— Componente: "Como jogou" — média por buraco do Manuel neste campo ———
 * Cruza as voltas do Manuel (data.json) com o campo seleccionado por nome
 * canónico e calcula a média de pancadas por buraco (formato scorecard,
 * buracos em colunas). Só conta voltas de 18 buracos com scorecard completo. */
const _ckey = (s: string) => norm(canonicalCourseName(s) || s);

function avgColor(avg: number | null, par: number | null): string {
  if (avg == null || par == null) return "var(--text-3)";
  const d = avg - par;
  if (d <= -0.25) return SC.good;
  if (d <= 0.25) return "var(--text-1)";
  if (d <= 1.25) return SC.warn;
  return SC.danger;
}

function CourseHoleAverages({ course }: { course: Course }) {
  const [data, setData] = useState<PlayerPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPlayerData(MANUEL_FED)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const target = _ckey(course.master.name);
    // Voltas do Manuel cujo campo (canónico) bate com o campo seleccionado
    const scoreIds: string[] = [];
    for (const c of data.DATA) {
      if (_ckey(c.course) !== target) continue;
      for (const r of c.rounds) {
        if (r.holeCount === 18 && data.HOLES[r.scoreId]) scoreIds.push(r.scoreId);
      }
    }
    if (scoreIds.length === 0) return { nRounds: 0, holes: [] as { hole: number; par: number | null; si: number | null; avg: number | null; n: number }[] };

    const sum = new Array(18).fill(0);
    const cnt = new Array(18).fill(0);
    const parArr = new Array<number | null>(18).fill(null);
    const siArr = new Array<number | null>(18).fill(null);
    for (const sid of scoreIds) {
      const h = data.HOLES[sid];
      for (let i = 0; i < 18; i++) {
        const g = h.g?.[i];
        if (g != null && Number(g) > 0) { sum[i] += Number(g); cnt[i]++; }
        if (parArr[i] == null && h.p?.[i] != null) parArr[i] = Number(h.p[i]);
        if (siArr[i] == null && h.si?.[i] != null) siArr[i] = Number(h.si[i]);
      }
    }
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: parArr[i],
      si: siArr[i],
      avg: cnt[i] > 0 ? sum[i] / cnt[i] : null,
      n: cnt[i],
    }));
    return { nRounds: scoreIds.length, holes };
  }, [data, course]);

  if (loading) return <LoadingState size="sm" message="A carregar voltas do Manuel…" />;
  if (!stats || stats.nRounds === 0) {
    return (
      <div className="notice notice-info" style={{ marginTop: 14 }}>
        O Manuel ainda não tem voltas de 18 buracos com scorecard registadas neste campo.
      </div>
    );
  }

  const { holes } = stats;
  const sumPar = (a: number, b: number) => holes.slice(a, b).reduce((s, h) => s + (h.par ?? 0), 0);
  const sumAvg = (a: number, b: number) => {
    const slice = holes.slice(a, b);
    if (slice.some((h) => h.avg == null)) return null;
    return slice.reduce((s, h) => s + (h.avg ?? 0), 0);
  };
  const cell = (h: typeof holes[number]) => (
    <td key={h.hole} className="ta-c" style={{ color: avgColor(h.avg, h.par), fontWeight: 600 }}>
      {h.avg != null ? h.avg.toFixed(1) : "–"}
    </td>
  );
  const vsParCell = (h: typeof holes[number]) => {
    if (h.avg == null || h.par == null) return <td key={h.hole} className="ta-c muted">–</td>;
    const d = h.avg - h.par;
    const txt = d === 0 ? "E" : d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
    return <td key={h.hole} className="ta-c" style={{ color: avgColor(h.avg, h.par) }}>{txt}</td>;
  };
  const outAvg = sumAvg(0, 9), inAvg = sumAvg(9, 18), totAvg = sumAvg(0, 18);
  const outPar = sumPar(0, 9), inPar = sumPar(9, 18), totPar = sumPar(0, 18);

  return (
    <div>
      <div className="muted fs-11" style={{ margin: "4px 0 8px" }}>
        Média de {stats.nRounds} volta{stats.nRounds !== 1 ? "s" : ""} de 18 buracos do Manuel neste campo.
        Cor: <span style={{ color: SC.good }}>abaixo</span> · <span style={{ color: SC.warn }}>acima</span> · <span style={{ color: SC.danger }}>bem acima</span> do par.
      </div>
      <div className="sc-wrap">
        <table className="sc-table sc-grid">
          <thead>
            <tr>
              <th className="sc-sticky">Buraco</th>
              {Array.from({ length: 9 }, (_, i) => <th key={i + 1} className="sc-h">{i + 1}</th>)}
              <th className="sc-h sc-tot">OUT</th>
              {Array.from({ length: 9 }, (_, i) => <th key={i + 10} className="sc-h">{i + 10}</th>)}
              <th className="sc-h sc-tot">IN</th>
              <th className="sc-h sc-tot">TOT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="sc-meta-row sc-par-row">
              <td className="sc-sticky sc-meta-label">PAR</td>
              {holes.slice(0, 9).map((h) => <td key={h.hole} className="ta-c">{h.par ?? "–"}</td>)}
              <td className="ta-c sc-tot-val">{outPar || "–"}</td>
              {holes.slice(9, 18).map((h) => <td key={h.hole} className="ta-c">{h.par ?? "–"}</td>)}
              <td className="ta-c sc-tot-val">{inPar || "–"}</td>
              <td className="ta-c sc-tot-val">{totPar || "–"}</td>
            </tr>
            <tr className="sc-meta-row sc-hcp-row">
              <td className="sc-sticky sc-meta-label">S.I.</td>
              {holes.slice(0, 9).map((h) => <td key={h.hole} className="ta-c">{h.si ?? "–"}</td>)}
              <td className="ta-c">–</td>
              {holes.slice(9, 18).map((h) => <td key={h.hole} className="ta-c">{h.si ?? "–"}</td>)}
              <td className="ta-c">–</td>
              <td className="ta-c">–</td>
            </tr>
            <tr className="sc-tee-row">
              <td className="sc-sticky sc-meta-label">Média</td>
              {holes.slice(0, 9).map(cell)}
              <td className="ta-c sc-tot-val">{outAvg != null ? outAvg.toFixed(1) : "–"}</td>
              {holes.slice(9, 18).map(cell)}
              <td className="ta-c sc-tot-val">{inAvg != null ? inAvg.toFixed(1) : "–"}</td>
              <td className="ta-c sc-tot-val">{totAvg != null ? totAvg.toFixed(1) : "–"}</td>
            </tr>
            <tr className="sc-meta-row">
              <td className="sc-sticky sc-meta-label">vs Par</td>
              {holes.slice(0, 9).map(vsParCell)}
              <td className="ta-c sc-tot-val">{outAvg != null ? (outAvg - outPar >= 0 ? "+" : "") + (outAvg - outPar).toFixed(1) : "–"}</td>
              {holes.slice(9, 18).map(vsParCell)}
              <td className="ta-c sc-tot-val">{inAvg != null ? (inAvg - inPar >= 0 ? "+" : "") + (inAvg - inPar).toFixed(1) : "–"}</td>
              <td className="ta-c sc-tot-val">{totAvg != null ? (totAvg - totPar >= 0 ? "+" : "") + (totAvg - totPar).toFixed(1) : "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CamposPage() {
  const { simCourses, tournamentCourses, players } = useAppContext();
  // Base = campos reais + torneios. O filtro de origem decide o que mostrar:
  // por defeito (ALL/PT/INTL) os torneios ficam escondidos; só aparecem em "Torneios".
  const courses = useMemo(
    () => [...simCourses, ...tournamentCourses],
    [simCourses, tournamentCourses]
  );
  const { courseKey: urlCourseKey } = useParams<{ courseKey?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [playerQ, setPlayerQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [teeFilter, setTeeFilter] = useState<string>("ALL");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("ALL");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(urlCourseKey ?? null);
  const [detailView, setDetailView] = useState<"scorecard" | "manuel">("scorecard");
  /* Tee seleccionado para comparação de distâncias na tabela (Campos) */
  const [selTeeKey, setSelTeeKey] = useState<string | null>(null);
    const isMobileInit = typeof window !== "undefined" && window.innerWidth <= 768;
  const md = useMasterDetail(!(isMobileInit && urlCourseKey));
  /* Sync URL param → selectedKey */
  useEffect(() => {
    if (urlCourseKey && courses.some(c => c.courseKey === urlCourseKey)) {
      setSelectedKey(urlCourseKey);
    }
  }, [urlCourseKey, courses]);

  /* Helper: select course and update URL */
  const selectCourse = (key: string | null) => {
    setSelectedKey(key);
    if (key) {
      navigate(`/campos/${key}`, { replace: true });
    } else {
      navigate("/campos", { replace: true });
    }
  };

  /* Lista de países únicos dos campos INTL */
  const intlCountries = useMemo(() => {
    const seen = new Map<string, string>(); // normKey → display
    for (const c of courses) {
      if (!c.courseKey.startsWith("away-")) continue;
      const name = resolveCountryName(c);
      if (!name) continue;
      const key = normalizeCountryKey(name);
      if (!seen.has(key)) seen.set(key, name);
    }
    return [...seen.entries()]
      .map(([k, v]) => ({ key: k, label: v, flag: COUNTRY_FLAGS[k] ?? "🌍" }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [courses]);

  /* Pesquisa por jogador — calcular nfeds que correspondem */
  const playerNfeds = useMemo<Set<string> | null>(() => {
    const pq = playerQ.trim();
    if (!pq) return null;
    const pqn = norm(pq);
    const matched = new Set<string>();
    for (const [nfed, p] of Object.entries(players)) {
      if (norm(p.name ?? "").includes(pqn)) matched.add(nfed);
    }
    return matched;
  }, [playerQ, players]);

  /* Unique tee color groups across all courses (for filter dropdown) */
  const uniqueTees = useMemo(() => {
    const map = new Map<string, { label: string; hex: string }>();
    for (const c of courses) {
      for (const t of c.master.tees) {
        const hex = teeGroupHex(t.teeName, t.scorecardMeta?.teeColor);
        if (!map.has(hex)) {
          map.set(hex, {
            label: teeCanonicalLabel(t.teeName, t.scorecardMeta?.teeColor),
            hex,
          });
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [courses]);

  /* Filtrar e ordenar campos */
  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = courses;
    if (qq) {
      list = list.filter((c) => {
        const name = norm(c.master.name);
        const key = norm(c.courseKey);
        return name.includes(qq) || key.includes(qq);
      });
    }
    if (originFilter === "PT") {
      list = list.filter((c) => !c.courseKey.startsWith("away-"));
    } else if (originFilter === "INTL") {
      // Internacional = campos away que NÃO são torneios/organizações
      list = list.filter((c) => c.courseKey.startsWith("away-") && !isTournamentCourse(c.courseKey));
    } else if (originFilter === "TOURN") {
      list = list.filter((c) => isTournamentCourse(c.courseKey));
    } else {
      // ALL: esconde os torneios (só visíveis no separador "Torneios")
      list = list.filter((c) => !isTournamentCourse(c.courseKey));
    }
    if (countryFilter !== "ALL") {
      list = list.filter((c) => {
        const cn = resolveCountryName(c);
        return normalizeCountryKey(cn) === countryFilter;
      });
    }
    if (teeFilter !== "ALL") {
      list = list.filter((c) =>
        c.master.tees.some((t) => teeGroupHex(t.teeName, t.scorecardMeta?.teeColor) === teeFilter)
      );
    }
    // Filtro por jogador — só campos onde o jogador jogou
    if (playerNfeds && playerNfeds.size > 0) {
      list = list.filter((c) => {
        const p = c.master._players;
        if (!p) return false;
        return Object.keys(p).some((nfed) => playerNfeds.has(nfed));
      });
    } else if (playerQ.trim()) {
      // Pesquisa activa mas sem jogador encontrado
      list = [];
    }
    // Ordenação: campos PT primeiro (A→Z), depois INTL (A→Z)
    list = [...list].sort((a, b) => {
      const aPT = !a.courseKey.startsWith("away-");
      const bPT = !b.courseKey.startsWith("away-");
      if (aPT !== bPT) return aPT ? -1 : 1;
      return a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" });
    });
    return list;
  }, [courses, q, originFilter, countryFilter, teeFilter, playerNfeds, playerQ]);

  /* Campo selecionado */
  const selected = useMemo(() => {
    if (!selectedKey) return filtered[0] ?? null;
    return courses.find((c) => c.courseKey === selectedKey) ?? filtered[0] ?? null;
  }, [courses, filtered, selectedKey]);

  const selectedTees = useMemo(() => {
    if (!selected) return [];
    const tees = sortTees(filterTees(selected.master.tees, sexFilter));
    // Ignorar tees sem qualquer dado útil (sem buracos e sem distância)
    return tees.filter(t => {
      const holes = t.distances?.holesCount ?? 0;
      const dist = t.distances?.total ?? 0;
      const cr = t.ratings?.holes18?.courseRating;
      // Manter se tem buracos, ou distância, ou pelo menos CR válido
      return holes > 0 || dist > 0 || (cr != null && cr > 0);
    });
  }, [selected, sexFilter]);

  const scorecardLink = selected?.master.links?.scorecards;
  const selectedFlag = selected ? resolveFlag(selected) : "";

  /* KPIs do campo seleccionado (par, distância, ratings, nº tees, nº jogadores) */
  const heroStats = useMemo(() => {
    if (!selected) return null;
    const tees = selected.master.tees;
    // Tees FÍSICOS distintos: o mesmo tee (cor + distância) aparece como
    // entradas separadas para M e F (CR/Slope diferentes). Contar só uma vez.
    const physKey = (t: Tee) => `${teeGroupHex(t.teeName, t.scorecardMeta?.teeColor)}|${Math.round(t.distances?.total ?? 0)}`;
    const nTees = new Set(tees.map(physKey)).size;
    // Tee de referência: o mais longo com 18 buracos (ou o mais longo)
    const ref = [...tees]
      .filter((t) => (t.ratings?.holes18?.courseRating ?? 0) > 0)
      .sort((a, b) => (b.distances?.total ?? 0) - (a.distances?.total ?? 0))[0]
      ?? [...tees].sort((a, b) => (b.distances?.total ?? 0) - (a.distances?.total ?? 0))[0];
    const par = ref?.ratings?.holes18?.par ?? null;
    const nPlayers = selected.master._players ? Object.keys(selected.master._players).length : 0;
    return { par, nTees, nPlayers };
  }, [selected]);

  /* Stats globais */
  const totalTees = useMemo(() => courses.reduce((n, c) => n + new Set(c.master.tees.map(physicalTeeKey)).size, 0), [courses]);
  const intlCount = useMemo(() => courses.filter(c => c.courseKey.startsWith("away-")).length, [courses]);

  return (
    <div className="campos-page">
      {/* Toolbar */}
      <Toolbar>
                <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Campos" />
        <ToolbarTitle>⛳ Campos</ToolbarTitle>
        <input
          className="input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPlayerQ(""); selectCourse(null); }}
          placeholder="Nome do campo…"
        />
        <input
          className="input"
          value={playerQ}
          onChange={(e) => { setPlayerQ(e.target.value); setQ(""); selectCourse(null); }}
          placeholder="Jogador…"
          title="Mostra os campos onde este jogador já jogou"
        />
        <select
          className="select"
          value={originFilter}
          onChange={(e) => { setOriginFilter(e.target.value as OriginFilter); setCountryFilter("ALL"); selectCourse(null); }}
        >
          <option value="ALL">Origem</option>
          <option value="PT">{"\ud83c\uddf5\ud83c\uddf9"} Portugal</option>
          <option value="INTL">{"\ud83c\udf0d"} Internacional</option>
          <option value="TOURN">{"\ud83c\udfc6"} Torneios</option>
        </select>
        {(originFilter === "INTL" || originFilter === "ALL" || originFilter === "TOURN") && (
          <select
            className="select"
            value={countryFilter}
            onChange={(e) => { setCountryFilter(e.target.value); selectCourse(null); }}
          >
            <option value="ALL">País</option>
            {intlCountries.map(({ key, label, flag }) => (
              <option key={key} value={key}>{flag} {label}</option>
            ))}
          </select>
        )}
        <select className="select" value={sexFilter} onChange={(e) => setSexFilter(e.target.value as SexFilter)}>
          <option value="ALL">Sexo</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
        </select>
        <select
          className="select"
          value={teeFilter}
          onChange={(e) => { setTeeFilter(e.target.value); selectCourse(null); }}
        >
          <option value="ALL">Todos os tees</option>
          {uniqueTees.map((t) => (
            <option key={t.hex} value={t.hex}>{t.label}</option>
          ))}
        </select>
        <Counter ml="auto">{filtered.length} campos</Counter>
        <Counter>{totalTees} tees</Counter>
        {intlCount > 0 && <Counter icon={"\ud83c\udf0d"}>{intlCount} intl</Counter>}
      </Toolbar>

      {/* Master-detail */}
      <div className="master-detail">
        {/* Lista de campos */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {filtered.map((c) => {
            const active = selected?.courseKey === c.courseKey;
            const nTees = new Set(filterTees(c.master.tees, sexFilter).map(physicalTeeKey)).size;
            const flag = resolveFlag(c);
            return (
              <a
                key={c.courseKey}
                href={`/campos/${c.courseKey}`}
                className={`course-item ${active ? "active" : ""}`}
                onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); selectCourse(c.courseKey); md.onSelect(); } }}
              >
                <div className="course-item-name">
                  {flag && <span className="course-flag">{flag}</span>}
                  <span>{c.master.name}</span>
                  {c.courseKey.startsWith("away-") && <PillBadge pill="INTL" />}
                </div>
                <div className="course-item-meta">
                  {nTees} tee{nTees !== 1 ? "s" : ""}
                </div>
              </a>
            );
          })}
          {filtered.length === 0 && (
            <EmptyState size="sm" message="Nenhum campo encontrado" />
          )}
        </div>

        {/* Detalhe */}
        <div className="course-detail" ref={md.detailRef}>
          {selected ? (
            <>
              <DetailHeader
                title={<>
                  {selected.master.name}
                  {selectedFlag && (
                    <span className="course-country-badge">
                      {selectedFlag} {resolveCountryName(selected)}
                    </span>
                  )}
                  {isAway(selected) && <PillBadge pill="INTL" />}
                </>}
                sub={<>
                  <span className="muted" title={isAway(selected) ? "Campo internacional" : isTournamentCourse(selected.courseKey) ? "Torneio" : "Campo de Portugal"}>
                    {courseRef(selected)}
                  </span>
                  {scorecardLink && (
                    <>
                      {" · "}
                      <ExtLink href={scorecardLink} className="detail-link">
                        Ver scorecard ↗
                      </ExtLink>
                    </>
                  )}
                  {selected.master.links?.extra?.map((lnk) => (
                    <span key={lnk.url}>
                      {" · "}
                      <ExtLink href={lnk.url} className="detail-link">
                        {lnk.label} ↗
                      </ExtLink>
                    </span>
                  ))}
                </>}
                actions={
                  <div className="segmented-toggle" role="tablist" aria-label="Vista do campo">
                    <button
                      role="tab"
                      aria-selected={detailView === "scorecard"}
                      className={`seg-btn${detailView === "scorecard" ? " active" : ""}`}
                      onClick={() => setDetailView("scorecard")}
                    >
                      <span className="seg-label">Scorecard</span>
                    </button>
                    <button
                      role="tab"
                      aria-selected={detailView === "manuel"}
                      className={`seg-btn${detailView === "manuel" ? " active" : ""}`}
                      onClick={() => setDetailView("manuel")}
                      title="Média por buraco do Manuel neste campo"
                    >
                      <span className="seg-label">Como jogou</span>
                    </button>
                  </div>
                }
              />

              {/* KPIs do campo */}
              {heroStats && (
                <div className="kpi-row">
                  <KpiCard label="Par" value={heroStats.par ?? "–"} />
                  <KpiCard label="Tees" value={heroStats.nTees} />
                  {heroStats.nPlayers > 0 && (
                    <KpiCard label="Jogadores" value={heroStats.nPlayers} sub="já jogaram" />
                  )}
                </div>
              )}

              {/* Vista */}
              {detailView === "scorecard" ? (
                <>
                  <TeeBars
                    tees={selectedTees}
                    selectedGroupKey={selTeeKey}
                    onSelectGroup={(key) => setSelTeeKey((prev) => (prev === key ? null : key))}
                  />
                  <ScorecardGrid tees={selectedTees} selKey={selTeeKey} />
                  <CourseNineRatings tees={selectedTees} />
                </>
              ) : (
                <CourseHoleAverages course={selected} />
              )}

              {/* Jogadores que já jogaram aqui */}
              <CoursePlayersSection
                course={selected}
                onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)}
              />
            </>
          ) : (
            <EmptyState icon="⛳" message="Selecciona um campo" />
          )}
        </div>
      </div>
    </div>
  );
}
