import { useMemo, useState, useEffect, Fragment, type ReactNode, type CSSProperties } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import KpiCard from "../ui/KpiCard";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import Counter from "../ui/Counter";
import { Toolbar, ToolbarTitle } from "../ui/Toolbar";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { MOBILE_BREAKPOINT } from "../hooks/useIsMobile";
import { useParams, useNavigate } from "react-router-dom";
import type { Course, Tee, SexFilter, CoursePlayerRound } from "../data/types";
import { useAppContext } from "../context/AppContext";
import TeeBadge from "../ui/TeeBadge";
import SexBadge from "../ui/SexBadge";
import { teeCanonicalLabel, teeGroupHex, teeBorder } from "../utils/teeColors";
import { fmt, fmtCR, norm, sumRange, fmtToPar } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { fixMojibake } from "../utils/fixEncoding";
import { sortTees, filterTees } from "../utils/teeUtils";
import { PillBadge, EscPill } from "../ui/PillBadge";
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
type CoursePlayerMeta = {
  names: Record<string, string>;
  dob: Record<string, string>;   // fed → "YYYY-MM-DD"
  sex: Record<string, "M" | "F">;
};
const EMPTY_META: CoursePlayerMeta = { names: {}, dob: {}, sex: {} };
let _coursePlayerMeta: CoursePlayerMeta | null = null;
let _coursePlayerMetaPromise: Promise<CoursePlayerMeta> | null = null;
function loadCoursePlayerMeta(): Promise<CoursePlayerMeta> {
  if (_coursePlayerMeta) return Promise.resolve(_coursePlayerMeta);
  if (!_coursePlayerMetaPromise) {
    _coursePlayerMetaPromise = cachedFetchJson<Partial<CoursePlayerMeta>>(
      "/data/course-player-names.json"
    )
      .then((d) => {
        _coursePlayerMeta = { names: d?.names ?? {}, dob: d?.dob ?? {}, sex: (d?.sex as CoursePlayerMeta["sex"]) ?? {} };
        return _coursePlayerMeta;
      })
      .catch(() => {
        _coursePlayerMeta = EMPTY_META;
        return _coursePlayerMeta;
      });
  }
  return _coursePlayerMetaPromise;
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

/* Override nome-PT → código ISO/subdivisão SÓ para os casos em que flag() não
   resolve o nome português abreviado ou perderia a sub-bandeira (Inglaterra,
   Escócia, Gales → Union Jack). Tudo o resto passa directo pelo flag() canónico
   de flagUtils — sem emojis hardcoded. Chaves = normalizeCountryKey (lowercase,
   sem diacríticos). */
const COUNTRY_FLAG_CODE: Record<string, string> = {
  "eua": "US",
  "inglaterra": "GB-ENG", "escocia": "GB-SCT",
  "gales": "GB-WLS", "pais de gales": "GB-WLS",
  "rep checa": "CZ", "republica checa": "CZ",
  "rep dominicana": "DO",
};

/** Bandeira a partir do nome do país (PT/EN), via flag() canónico, com override
 *  só para os nomes abreviados/sub-bandeiras que flag() não distingue. */
function flagFor(name: string): string {
  if (!name) return "";
  const code = COUNTRY_FLAG_CODE[normalizeCountryKey(name)];
  return flag(code ?? name);
}

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
    const f = flagFor(c.master.country);
    if (f && f !== "🏳️") return f;
  }
  // 2) Fallback: nome de país do mapa de campos conhecidos
  const known = KNOWN_AWAY[c.courseKey];
  if (known) {
    const f = flagFor(known.country);
    if (f && f !== "🏳️") return f;
  }
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

/** Constrói os resumos por jogador a partir do `_players` do campo. Se
 *  `teeFilter` for dado, só conta as voltas cujo tee o passa (usado pela vista
 *  "por tee"). Nome resolvido: players.json → mapa de federados → nº fed. */
function buildSummaries(
  raw: Course["master"]["_players"],
  players: Record<string, { name?: string } | undefined>,
  nameMap: Record<string, string>,
  teeFilter?: (tee: string | null) => boolean,
): PlayerSummary[] {
  if (!raw || Object.keys(raw).length === 0) return [];
  const out: PlayerSummary[] = [];
  for (const [nfed, val] of Object.entries(raw)) {
    const p = players[nfed];
    const realName = p?.name && p.name !== nfed ? p.name : null;
    const fromMap = nameMap[nfed] && nameMap[nfed] !== nfed ? nameMap[nfed] : null;
    const name = realName ?? fromMap ?? nfed;
    // Retro-compat: formato antigo = string (só data); novo = array de rondas
    const allRounds: CoursePlayerRound[] = Array.isArray(val)
      ? val
      : typeof val === "string"
        ? [{ date: val, gross: null, toPar: null, tee: null, event: null, sd: null }]
        : [];
    const rounds = teeFilter ? allRounds.filter((r) => teeFilter(r.tee)) : allRounds;
    if (rounds.length === 0) continue;
    const sortedRounds = [...rounds].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const r18: CoursePlayerRound[] = [];
    const r9: CoursePlayerRound[] = [];
    for (const r of sortedRounds) {
      const h = roundHoles(r);
      if (h === 18) r18.push(r);
      else if (h === 9) r9.push(r);
    }
    out.push({
      nfed, name, isM: nfed === MANUEL_FED,
      rounds: sortedRounds, total: rounds.length,
      b18: buildBucket(r18), b9: buildBucket(r9),
    });
  }
  return out;
}

/** Tabela sortável de jogadores + scores num campo (18b/18 e 9b em linhas
 *  separadas, expansível para as voltas individuais). Reutilizada pela vista
 *  geral ("Jogadores") e pela vista por-tee ("Como jogaram — por tee"). */
function PlayersTable({ entries, title, onSelectPlayer, bare }: { entries: PlayerSummary[]; title?: ReactNode; onSelectPlayer?: (fed: string) => void; bare?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Default: mais voltas primeiro. Por coluna: melhor/média ascendente (menor = melhor),
  // última descendente (mais recente primeiro), nome ascendente.
  const { sortKey, sortDir, toggleSort } = useSort<CPSortKey>("n", "desc", {
    name: "asc", best: "asc", avg: "asc",
  });

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
            {fmtCR(b.avgGross)}
            {b.avgToPar != null && (
              <span className="cp-tp" style={{ color: tpTextColor(Math.round(b.avgToPar)) }}> ({b.avgToPar >= 0 ? "+" : ""}{fmtCR(b.avgToPar)})</span>
            )}
          </>
        ) : <span className="muted">–</span>}
      </td>
      <td className="cp-num cp-muted" style={{ whiteSpace: "nowrap" }}>{fmtDMYfull(b.last) || "–"}</td>
    </>
  );

  return (
    <div className={bare ? "" : "course-players-section"}>
      {!bare && <h4 className="course-players-title">{title}</h4>}
      <div className={bare ? "sc-wrap sc-wrap-bare" : "sc-wrap"}>
        <table className={bare ? "cp-table cp-table-bare" : "cp-table"}>
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

/* Hook partilhado: carrega o meta dos jogadores (nome + dob + sexo). */
function useCoursePlayerMeta(): CoursePlayerMeta {
  const [meta, setMeta] = useState<CoursePlayerMeta>(_coursePlayerMeta ?? EMPTY_META);
  useEffect(() => {
    let alive = true;
    loadCoursePlayerMeta().then((m) => { if (alive) setMeta(m); });
    return () => { alive = false; };
  }, []);
  return meta;
}
function useCoursePlayerNames(): Record<string, string> {
  return useCoursePlayerMeta().names;
}

/** Vista geral: todos os jogadores que já jogaram o campo (todos os tees). */
function CoursePlayersSection({ course, onSelectPlayer }: { course: Course; onSelectPlayer?: (fed: string) => void }) {
  const { players } = useAppContext();
  const nameMap = useCoursePlayerNames();
  const entries = useMemo(
    () => buildSummaries(course.master._players, players, nameMap),
    [course, players, nameMap],
  );
  if (entries.length === 0) return null;
  return <PlayersTable entries={entries} title={`Jogadores (${entries.length})`} onSelectPlayer={onSelectPlayer} />;
}

/* Ordem de tees por cor (back→front). Tees desconhecidos (juvenis, etc.) e
 * "Sem tee" vão para o fim. */
const TEE_COLOR_ORDER = ["pretas", "azuis", "brancas", "amarelas", "laranjas", "verdes", "vermelhas", "rosas", "douradas", "castanhas"];
function teeRankKey(label: string): number {
  const k = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const i = TEE_COLOR_ORDER.indexOf(k);
  return i < 0 ? 90 : i;
}
const NO_TEE_LABEL = "Sem tee";

/* ── Helpers de aspecto dos cartões por tee (partilhados KPIs + tabelas) ── */
const teeTint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, var(--bg-card))`;
const teeDot = (hex: string, sz = 12): CSSProperties => ({ width: sz, height: sz, borderRadius: "50%", background: hex, border: teeBorder(hex) || "1px solid rgba(0,0,0,0.15)", display: "inline-block", flex: "none" });
type TeeInfo = { dist: number; hex: string; group: PhysTeeGroup };
function useTeeInfoMap(course: Course): Map<string, TeeInfo> {
  return useMemo(() => {
    const m = new Map<string, TeeInfo>();
    for (const g of physicalTeeGroups(course.master.tees || [])) {
      const label = teeCanonicalLabel(g.label);
      const dist = Math.round(g.teeHoles?.distances?.total ?? 0);
      if (!m.has(label)) m.set(label, { dist, hex: g.colorHex, group: g });
    }
    return m;
  }, [course]);
}

/* ── Escalão (coorte FPG) à DATA da volta ─────────────────────────────────
 * Por ano de nascimento vs ano do evento (a idade que o jogador FAZ nesse ano
 * — é assim que a FPG define as coortes). "Sub 10..21" ou "Absoluto". */
const ESC_KPI_ORDER = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18", "Sub 21", "Absoluto"];
const ESC_THRESHOLDS = [10, 12, 14, 16, 18, 21];
function escalaoAtDate(dob: string | undefined, date: string | null): string | null {
  if (!dob || !date) return null;
  const by = parseInt(dob.slice(0, 4), 10);
  const ey = parseInt(String(date).slice(0, 4), 10);
  if (!by || !ey || ey < by) return null;
  const yrs = ey - by;
  for (const t of ESC_THRESHOLDS) if (yrs <= t) return `Sub ${t}`;
  return "Absoluto";
}

type VoltaKind = "18" | "f9" | "b9";
type EscRec = { val: number; tp: number | null; fed: string; name: string; date: string | null; sd: number | null };
type ManuelRec = { label: string; val: number; tp: number | null; date: string | null; sd: number | null; esc: string | null; dist: number };

/** Valor da volta consoante o tipo (18 buracos / Front 9 / Back 9). null quando
 *  a volta não tem esse split. */
function roundValue(r: CoursePlayerRound, kind: VoltaKind): { val: number; tp: number | null } | null {
  if (kind === "18") return roundHoles(r) === 18 ? { val: r.gross as number, tp: r.toPar ?? null } : null;
  if (kind === "f9") return r.f9 != null ? { val: r.f9, tp: r.f9tp ?? null } : null;
  return r.b9 != null ? { val: r.b9, tp: r.b9tp ?? null } : null;
}

/** Segmented toggle compacto (sexo / tipo de volta). */
function Seg<T extends string>({ value, onChange, opts }: { value: T; onChange: (v: T) => void; opts: { v: T; label: ReactNode }[] }) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: "var(--radius-pill, 999px)", overflow: "hidden" }}>
      {opts.map((o, i) => {
        const on = value === o.v;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} style={{
            border: "none", borderLeft: i > 0 ? "1px solid var(--border)" : "none",
            padding: "4px 10px", cursor: "pointer", fontSize: "var(--fs-12)", fontWeight: on ? 700 : 500,
            background: on ? "var(--accent)" : "var(--bg-card)", color: on ? "#fff" : "var(--text)",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/** KPIs por cor de tee (topo do tab "Como jogou"). Por tee: nº jogadores + voltas
 *  + TOP-3 de cada escalão (à data da volta) com data (ano) + SD. Ordenado por
 *  distância (dificuldade). Separa ♂/♀ e 18 / Front 9 / Back 9. Inclui sempre um
 *  cartão do Manuel (recorde por tee). */
function CourseTeeKpis({ course, onSelectPlayer }: { course: Course; onSelectPlayer?: (fed: string) => void }) {
  const meta = useCoursePlayerMeta();
  const { players } = useAppContext();
  const [sex, setSex] = useState<"M" | "F">("M");
  const [volta, setVolta] = useState<VoltaKind>("18");

  // Info do tee físico: distância + CR/Slope por sexo (18/F9/B9) + cor.
  const teeInfo = useTeeInfoMap(course);

  const { tees, manuel, lastDate } = useMemo(() => {
    const raw = course.master._players;
    const empty = { tees: [] as { label: string; players: Set<string>; nRounds: number; esc: Map<string, Map<string, EscRec>>; dist: number }[], manuel: [] as ManuelRec[], lastDate: null as string | null };
    if (!raw || Object.keys(raw).length === 0) return empty;
    const labelOf = (tee: string | null) => (tee ? teeCanonicalLabel(tee) : NO_TEE_LABEL);
    const nameOf = (fed: string) => {
      const p = players[fed];
      return (p?.name && p.name !== fed ? p.name : null)
        ?? (meta.names[fed] && meta.names[fed] !== fed ? meta.names[fed] : null)
        ?? fed;
    };
    const byTee = new Map<string, { players: Set<string>; nRounds: number; esc: Map<string, Map<string, EscRec>> }>();
    const manuelByTee = new Map<string, ManuelRec>();
    let lastDate: string | null = null;
    for (const [fed, val] of Object.entries(raw)) {
      if (!Array.isArray(val)) continue;
      const dob = meta.dob[fed];
      const psex = meta.sex[fed];
      const isManuelPlayer = fed === MANUEL_FED;
      for (const r of val) {
        const rv = roundValue(r, volta);
        if (!rv) continue;
        if (r.date && (!lastDate || r.date > lastDate)) lastDate = r.date;
        const label = labelOf(r.tee);
        // Cartão do Manuel — independente do filtro de sexo.
        if (isManuelPlayer) {
          const cur = manuelByTee.get(label);
          if (!cur || rv.val < cur.val) {
            manuelByTee.set(label, { label, val: rv.val, tp: rv.tp, date: r.date, sd: r.sd ?? null, esc: escalaoAtDate(dob, r.date), dist: teeInfo.get(label)?.dist ?? -1 });
          }
        }
        // Cartões por tee — filtrados pelo sexo seleccionado.
        if (psex !== sex) continue;
        let t = byTee.get(label);
        if (!t) { t = { players: new Set(), nRounds: 0, esc: new Map() }; byTee.set(label, t); }
        t.players.add(fed);
        t.nRounds++;
        const esc = escalaoAtDate(dob, r.date);
        if (!esc) continue;
        let em = t.esc.get(esc);
        if (!em) { em = new Map(); t.esc.set(esc, em); }
        const cur = em.get(fed);
        if (!cur || rv.val < cur.val) em.set(fed, { val: rv.val, tp: rv.tp, fed, name: nameOf(fed), date: r.date, sd: r.sd ?? null });
      }
    }
    const tees = [...byTee.entries()]
      .map(([label, t]) => ({ label, players: t.players, nRounds: t.nRounds, esc: t.esc, dist: teeInfo.get(label)?.dist ?? -1 }))
      .filter((t) => t.nRounds > 0)
      .sort((a, b) => (b.dist - a.dist) || (b.players.size - a.players.size) || a.label.localeCompare(b.label, "pt"));
    const manuel = [...manuelByTee.values()].sort((a, b) => b.dist - a.dist);
    return { tees, manuel, lastDate };
  }, [course, players, meta, sex, volta, teeInfo]);

  if (tees.length === 0 && manuel.length === 0) return null;

  const ratingField = volta === "18" ? "h18" : volta;
  const ratingFor = (label: string): { cr: number; sl: number } | null => {
    const g = teeInfo.get(label)?.group;
    if (!g) return null;
    const bucket = g[ratingField as "h18" | "f9" | "b9"];
    return bucket[sex] ?? bucket.M ?? bucket.F ?? bucket.U ?? null;
  };
  const distFor = (label: string) => teeInfo.get(label)?.dist ?? 0;
  const voltaLabel = volta === "18" ? "18 buracos" : volta === "f9" ? "Front 9" : "Back 9";

  const tint = teeTint;
  const dotStyle = teeDot;

  const score = (val: number, tp: number | null) => (
    <span style={{ textAlign: "right", fontWeight: 600, fontSize: "var(--fs-13, 13px)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      {val}
      {tp != null && <span style={{ color: tpTextColor(tp), fontWeight: 700 }}> {fmtToPar(tp)}</span>}
    </span>
  );
  const when = (date: string | null, sd: number | null) => (
    <span className="muted" style={{ fontSize: "var(--fs-10)", whiteSpace: "nowrap", textAlign: "right" }}>
      {fmtDMYfull(date)}{sd != null ? ` · SD ${sd.toFixed(1)}` : ""}
    </span>
  );
  const nameEl = (fed: string, name: string) => {
    const st: CSSProperties = { display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", fontWeight: 500 };
    return onSelectPlayer
      ? <button type="button" className="tourn-pname tourn-pname-link" style={st} onClick={() => onSelectPlayer(fed)} title={name}>{name}</button>
      : <span style={st} title={name}>{name}</span>;
  };
  /** Marcador de posição para o 2º/3º (o 1º leva o pill do escalão). */
  const rankBadge = (i: number) => (
    <span aria-hidden style={{ justifySelf: "center", alignSelf: "center", width: 15, height: 15, borderRadius: "50%", background: "var(--bg-hover, rgba(0,0,0,0.06))", color: "var(--text-muted)", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
  );

  return (
    <div style={{ margin: "4px 0 14px" }}>
      {/* Toolbar: sexo · tipo de volta · fonte */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Seg value={sex} onChange={setSex} opts={[
          { v: "M", label: <><SexBadge sex="M" /> Rapazes</> },
          { v: "F", label: <><SexBadge sex="F" /> Raparigas</> },
        ]} />
        <Seg value={volta} onChange={setVolta} opts={[
          { v: "18", label: "18 buracos" }, { v: "f9", label: "Front 9" }, { v: "b9", label: "Back 9" },
        ]} />
        <span className="muted" style={{ marginLeft: "auto", fontSize: "var(--fs-11)", cursor: "help" }}
          title={"Fonte: melhores voltas WHS (scorecards) de todos os jogadores que seguimos — course-players.json, regenerado semanalmente (workflow update-data.yml). Escalão calculado à DATA da volta pela coorte FPG (ano de nascimento, dos federados)."}>
          ⓘ dados: voltas dos nossos{lastDate ? ` · última ${fmtDMYfull(lastDate)}` : ""}
        </span>
      </div>

      {/* Cartão do Manuel — recorde por tee */}
      {manuel.length > 0 && (
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--accent)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: tint("var(--accent)", 12), borderBottom: "1px solid var(--border-light, var(--border))", fontWeight: 800 }}>
            <span style={{ fontSize: "var(--fs-15, 15px)" }}>🧒 Manuel</span>
            <span className="muted" style={{ fontWeight: 400, fontSize: "var(--fs-11)" }}>recorde por tee · {voltaLabel}</span>
          </div>
          <div style={{ padding: "6px 12px 9px", display: "grid", gridTemplateColumns: "minmax(120px,auto) auto auto minmax(0,1fr)", gap: "4px 12px", alignItems: "center", background: "var(--bg-card)" }}>
            {manuel.map((mr) => {
              const hex = mr.label === NO_TEE_LABEL ? "var(--border)" : teeGroupHex(mr.label);
              return (
                <Fragment key={mr.label}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 600, minWidth: 0 }}>
                    <span aria-hidden style={dotStyle(hex, 11)} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mr.label}</span>
                    {distFor(mr.label) ? <span className="muted" style={{ fontWeight: 400, fontSize: "var(--fs-10)" }}>{distFor(mr.label)}m</span> : null}
                  </span>
                  {score(mr.val, mr.tp)}
                  <span>{mr.esc ? <EscPill esc={mr.esc} /> : <span className="muted">–</span>}</span>
                  {when(mr.date, mr.sd)}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Cartões por tee (ordenados por distância/dificuldade) */}
      {tees.length === 0 ? (
        <div className="muted" style={{ fontSize: "var(--fs-12)" }}>
          Sem voltas de {voltaLabel.toLowerCase()} de {sex === "M" ? "rapazes" : "raparigas"} neste campo.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
          {tees.map((c) => {
            const hex = c.label === NO_TEE_LABEL ? "var(--border)" : teeGroupHex(c.label);
            const stripe = teeBorder(hex) ? "var(--border)" : hex; // tees claros → risca neutra visível
            const rt = ratingFor(c.label);
            const dist = distFor(c.label);
            const escs = ESC_KPI_ORDER.filter((e) => c.esc.has(e));
            return (
              <div key={c.label} style={{ flex: "1 1 300px", minWidth: 282, maxWidth: 460, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", borderTop: `3px solid ${stripe}`, background: "var(--bg-card)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
                {/* Header do tee (banda tingida) */}
                <div style={{ padding: "7px 12px", background: tint(hex, 13), borderBottom: "1px solid var(--border-light, var(--border))" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden style={dotStyle(hex, 14)} />
                    <span style={{ fontWeight: 800, fontSize: "var(--fs-15, 15px)" }}>{c.label}</span>
                    <span className="muted" style={{ fontWeight: 500, fontSize: "var(--fs-11)", marginLeft: "auto", whiteSpace: "nowrap" }}>{c.players.size} jog · {c.nRounds} voltas</span>
                  </div>
                  <div className="muted" style={{ fontSize: "var(--fs-11)", marginTop: 2, paddingLeft: 22 }}>
                    {dist ? <b style={{ fontWeight: 700 }}>{dist} m</b> : null}{dist && rt ? " · " : ""}{rt ? `CR ${fmtCR(rt.cr)} · Slope ${rt.sl}` : ""}{!dist && !rt ? "—" : ""}
                  </div>
                </div>
                {/* Corpo: escalões — UMA grelha só (nomes alinhados verticalmente
                    entre todos os escalões). Escalão = pill na 1ª linha; 2º/3º com
                    nº; data+SD por baixo do nome (2ª linha, pequena). */}
                <div style={{ padding: "4px 12px 9px" }}>
                  {escs.length === 0 ? (
                    <div className="muted" style={{ fontSize: "var(--fs-11)", padding: "6px 0" }}>sem escalão conhecido</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto minmax(0,1fr)", columnGap: 9, rowGap: 0, alignItems: "center" }}>
                      {escs.map((e, ei) => {
                        const top3 = [...c.esc.get(e)!.values()].sort((a, b) => (a.val - b.val) || ((a.tp ?? 0) - (b.tp ?? 0))).slice(0, 3);
                        return (
                          <Fragment key={e}>
                            {ei > 0 && <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-light, var(--border))", margin: "4px 0" }} />}
                            {top3.map((b, i) => (
                              <Fragment key={b.fed + i}>
                                {i === 0 ? <span style={{ justifySelf: "start", alignSelf: "center" }}><EscPill esc={e} /></span> : rankBadge(i)}
                                {score(b.val, b.tp)}
                                <span style={{ minWidth: 0, display: "block", padding: "3px 0" }}>
                                  {nameEl(b.fed, b.name)}
                                  <span className="muted" style={{ display: "block", fontSize: "var(--fs-10)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {fmtDMYfull(b.date)}{b.sd != null ? ` · SD ${b.sd.toFixed(1)}` : ""}
                                  </span>
                                </span>
                              </Fragment>
                            ))}
                          </Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Vista "por tee" (no tab Como jogou): uma tabela por tee (Brancas, Amarelas,
 *  …) com os nossos jogadores e as pontuações que fizeram NESSE tee. */
function CoursePlayersByTee({ course, onSelectPlayer }: { course: Course; onSelectPlayer?: (fed: string) => void }) {
  const { players } = useAppContext();
  const nameMap = useCoursePlayerNames();
  const teeInfo = useTeeInfoMap(course);

  const groups = useMemo(() => {
    const raw = course.master._players;
    if (!raw || Object.keys(raw).length === 0) return [];
    // Rótulo canónico do tee de cada volta (agrupa variantes M/F da mesma cor).
    const labelOf = (tee: string | null) => (tee ? teeCanonicalLabel(tee) : NO_TEE_LABEL);
    const labels = new Set<string>();
    for (const val of Object.values(raw)) {
      if (Array.isArray(val)) for (const r of val) labels.add(labelOf(r.tee));
    }
    return [...labels]
      .map((label) => ({
        label,
        entries: buildSummaries(raw, players, nameMap, (tee) => labelOf(tee) === label),
      }))
      .filter((g) => g.entries.length > 0)
      .sort((a, b) => {
        const semA = a.label === NO_TEE_LABEL ? 1 : 0, semB = b.label === NO_TEE_LABEL ? 1 : 0;
        if (semA !== semB) return semA - semB;
        return (teeRankKey(a.label) - teeRankKey(b.label))
          || (b.entries.length - a.entries.length)
          || a.label.localeCompare(b.label, "pt");
      });
  }, [course, players, nameMap]);

  if (groups.length === 0) return null;
  return (
    <div className="course-tee-breakdown">
      <h4 className="course-players-title" style={{ marginBottom: 8 }}>Como jogaram os nossos — por tee</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((g) => {
          const hex = g.label === NO_TEE_LABEL ? "var(--border)" : teeGroupHex(g.label);
          const stripe = teeBorder(hex) ? "var(--border)" : hex; // tees claros → risca neutra
          const info = teeInfo.get(g.label);
          const dist = info?.dist ?? 0;
          const rM = info?.group.h18.M, rF = info?.group.h18.F;
          return (
            <div key={g.label} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", borderTop: `3px solid ${stripe}`, background: "var(--bg-card)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              {/* Header do tee (banda tingida) — mesmo look dos KPIs */}
              <div style={{ padding: "7px 12px", background: teeTint(hex, 13), borderBottom: "1px solid var(--border-light, var(--border))" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden style={teeDot(hex, 14)} />
                  <span style={{ fontWeight: 800, fontSize: "var(--fs-15, 15px)" }}>{g.label}</span>
                  <span className="muted" style={{ fontWeight: 500, fontSize: "var(--fs-11)", marginLeft: "auto", whiteSpace: "nowrap" }}>{g.entries.length} jog.</span>
                </div>
                {(dist || rM || rF) && (
                  <div className="muted" style={{ fontSize: "var(--fs-11)", marginTop: 2, paddingLeft: 22, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {dist ? <b style={{ fontWeight: 700 }}>{dist} m</b> : null}
                    {rM && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SexBadge sex="M" /> CR {fmtCR(rM.cr)} · Slope {rM.sl}</span>}
                    {rF && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SexBadge sex="F" /> CR {fmtCR(rF.cr)} · Slope {rF.sl}</span>}
                  </div>
                )}
              </div>
              {/* Tabela (sortável) sem o wrapper de secção */}
              <div style={{ padding: "6px 10px 8px" }}>
                <PlayersTable entries={g.entries} onSelectPlayer={onSelectPlayer} bare />
              </div>
            </div>
          );
        })}
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
    const isMobileInit = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT;
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
      .map(([k, v]) => { const f = flagFor(v); return { key: k, label: v, flag: f && f !== "🏳️" ? f : "🌍" }; })
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
    // entradas separadas para M e F (CR/Slope diferentes). Contar só uma vez,
    // com a chave canónica physicalTeeKey (igual ao sidebar e ao total).
    const nTees = new Set(tees.map(physicalTeeKey)).size;
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

              {/* KPIs do campo — genéricos (Par/Tees/Jogadores) só no Scorecard.
                  No "Como jogou" mostramos KPIs por cor de tee (mais úteis). */}
              {detailView === "scorecard" && heroStats && (
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
                  {/* Lista geral de quem já jogou aqui (todos os tees) */}
                  <CoursePlayersSection
                    course={selected}
                    onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)}
                  />
                </>
              ) : (
                <>
                  {/* KPIs por cor de tee: nº jogadores + melhor Sub-12/14/16… */}
                  <CourseTeeKpis
                    course={selected}
                    onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)}
                  />
                  {/* Quem jogou + scores, partido por tee (Brancas, Amarelas, …) */}
                  <CoursePlayersByTee
                    course={selected}
                    onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)}
                  />
                  {/* Média por buraco do Manuel — em baixo, secundário */}
                  <CourseHoleAverages course={selected} />
                </>
              )}
            </>
          ) : (
            <EmptyState icon="⛳" message="Selecciona um campo" />
          )}
        </div>
      </div>
    </div>
  );
}
