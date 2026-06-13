import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { Player, SexFilter } from "../data/types";
import { useAppContext } from "../context/AppContext";
import { resolvePlayedTee, resolvePlayedSI, isFakeSI } from "../utils/playedDistance";
import { norm, shortDate, fmtSign, fmtToPar, fpgScoringUrl } from "../utils/format";
import { getTeeHex, textOnColor, normKey, teeBorder } from "../utils/teeColors";
import { clubShort, clubLong, hcpDisplay, escCls } from "../utils/playerUtils";
import { numSafe, meanArr, stdevArr, minArr, maxArr, linearSlope } from "../utils/mathUtils";
import { acesFromHoleScores } from "../utils/aces";
import { scClass, fmtGrossDelta, fmtStb, sdClassByHcp, fmtSdVal, sc3m, SC, toParClass } from "../utils/scoreDisplay";
import {
  type PlayerPageData, type CourseData, type RoundData,
  type HcpInfo,
} from "../data/playerDataLoader";
import { usePlayerData } from "../data/usePlayerData";
import SexBadge from "../ui/SexBadge";
import RotatedNotice from "../ui/RotatedNotice";
import AroeiraNotice, { countRotatedRounds } from "../ui/AroeiraNotice";
import { canonicalCourseName } from "../utils/courseAliases";
import TeePill from "../ui/TeePill";
import TeeDate from "../ui/TeeDate";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import DetailHeader from "../ui/DetailHeader";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar } from "../ui/Toolbar";
import Counter from "../ui/Counter";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { useSort } from "../hooks/useSort";
import { loadPlayerStats, daysSince, type PlayerStatsDb } from "../data/playerStatsTypes";
import { loadFederados, federadoToPlayer, mergePlayersWithFederados, loadInativosStats, normalizeAgeLevel, type FederadoRaw, type MergedPlayer, type InativosStats } from "../data/federadosLoader";
import { getPlayerHistory, getScorecard, type WhsRound, type Scorecard } from "../data/datagolfClient";
import { gf } from "../utils/flagUtils";
import SortableHdr from "../ui/SortableHdr";
import { PillBadge, EscPill, SIDEBAR_ACCENT } from "../ui/PillBadge";
import { RoundSimulator } from "../ui/RoundSimulator";
import HoleStatsSection from "../ui/HoleStatsSection";
import { ScorecardTable } from "../ui/ScorecardTable";
import { EclecticSection } from "../ui/EclecticSection";
import { Last20Table } from "../ui/Last20Table";
import { CrossAnalysis } from "../ui/CrossAnalysis";
import { ByTournamentView } from "../ui/ByTournamentView";
import { buildCourseKeyMap, setCourseKeyMap, findCourseKey, CourseLink } from "../ui/jogadoresHelpers";
import { PIN_RANK } from "../constants/pinnedPlayers";

/* ────────────────────────────────────────────────────────────────────────────────────
   Utility functions (port from client JS)
   ──────────────────────────────────────────────────────────────────────────────────── */


type SortKey = "name" | "hcp" | "club" | "escalao" | "ranking" | "rounds" | "aces";
type ViewKey = "by_course" | "by_course_analysis" | "by_date" | "by_tournament" | "analysis";
type CourseSort = "last_desc" | "count_desc" | "name_asc";


const scHostStyle: React.CSSProperties = { margin: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", background: "var(--bg-card)", padding: 10, overflow: "hidden", width: "fit-content", maxWidth: "calc(100% - 16px)" };

/* ────────────────────────────────────────────────────────────────────────────────────────
   Micro-components
   ──────────────────────────────────────────────────────────────────────────────────────── */

function GrossCell({ gross, par }: { gross: number | null; par: number | null }) {
  const { text, delta, cls } = fmtGrossDelta(gross, par);
  if (!text) return null;
  return <><b>{text}</b>{delta && <span className={`score-delta ${cls}`}>{delta}</span>}</>;
}

function SdCell({ round }: { round: RoundData }) {
  const { text, cls } = fmtSdVal(round);
  if (!text) return null;
  return <span className={`p p-${cls}`}>{text}</span>;
}

function HoleBadge({ hc }: { hc: number }) {
  return hc === 9
    ? <span className="hb hb9">9</span>
    : <span className="hb hb18">18</span>;
}

/** Retorna a pill efectiva: usa _pill dos dados ou auto-detecta INTL/REGIONAL/NACIONAL */
function effectivePill(round: { _pill?: string; course?: string; scoreOrigin?: string; eventName?: string }, courseName?: string): string {
  if (round._pill) return round._pill;
  const o = (round.scoreOrigin || "").trim().toUpperCase();
  if (o === "INTERN") return "INTL";
  const c = (courseName || round.course || "").trim().toUpperCase();
  if (c === "INTERNACIONAL" || c === "INTERNATIONAL") return "INTL";
  // Detecção pelo nome da prova: "Campeonato Regional...", "Campeonato Nacional..."
  const ev = (round.eventName || "").trim();
  if (/regional/i.test(ev)) return "REGIONAL";
  if (/nacional/i.test(ev)) return "NACIONAL";
  return "";
}

/* ScoreCircle imported from src/ui/ */

/* ─── Origin Pill (EDS / Treino / Extra / Import / Indiv) ─── */
const ORIGIN_MAP: Record<string, { label: string; cls: string }> = {
  EDS:     { label: "EDS",     cls: "p p-sm p-origin p-eds" },
  IMPORT:  { label: "IMPORT",  cls: "p p-sm p-origin p-import" },
  INDIV:   { label: "INDIV",   cls: "p p-sm p-origin p-indiv" },
  TREINO:  { label: "TREINO",  cls: "p p-sm p-origin p-treino" },
  EXTRA:   { label: "EXTRA",   cls: "p p-sm p-origin p-extra" },
};
function OriginPill({ origin }: { origin?: string }) {
  if (!origin) return null;
  const key = origin.trim().toUpperCase();
  // "Torn" = torneio normal, "Intern" = tratado pelo effectivePill/PillBadge
  if (!key || key === "TORN" || key === "INTERN") return null;
  const entry = ORIGIN_MAP[key];
  if (!entry) return null;
  return <span className={entry.cls}>{entry.label}</span>;
}

/* ─── External Links (classificação, etc.) ─── */
function LinkBtns({ links }: { links?: Record<string, string> }) {
  if (!links || Object.keys(links).length === 0) return null;
  return (
    <>
      {Object.entries(links).map(([label, url]) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={label.replace(/_/g, " ")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 10, marginLeft: 4, color: "var(--chart-2)", textDecoration: "none",
            verticalAlign: "middle",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          🔗
        </a>
      ))}
    </>
  );
}

/* ─── Course → ccode heuristic (organizador típico = clube anfitrião) ─── */
const COURSE_TO_CCODE: { match: RegExp; ccode: string }[] = [
  { match: /santo\s*da\s*serra/i,            ccode: "007" }, // CGSS
  { match: /aroeira/i,                         ccode: "009" }, // Aroeira (cobre PGA Aroeira No.X)
  { match: /miramar/i,                         ccode: "003" },
  { match: /estoril/i,                         ccode: "004" },
  { match: /oporto/i,                          ccode: "005" },
  { match: /vidago/i,                          ccode: "006" },
  { match: /montebelo/i,                       ccode: "008" },
  { match: /troia/i,                           ccode: "010" },
  { match: /quinta\s*do\s*peru/i,             ccode: "011" },
  { match: /belas\s*club/i,                   ccode: "068" },
  { match: /belas/i,                           ccode: "012" },
  { match: /qta\s*marinha|quinta\s*da\s*marinha/i, ccode: "013" },
  { match: /\bLSC\b|lisbon\s*sports/i,       ccode: "014" },
  { match: /penha\s*longa/i,                  ccode: "015" },
  { match: /oitavos/i,                         ccode: "016" },
  { match: /ribagolfe/i,                       ccode: "017" },
  { match: /montado/i,                         ccode: "018" },
  { match: /morgado/i,                         ccode: "019" },
  { match: /palmares/i,                        ccode: "020" },
  { match: /castro\s*marim/i,                 ccode: "021" },
  { match: /vale\s*do\s*lobo/i,               ccode: "022" },
  { match: /vilamoura/i,                       ccode: "023" },
  { match: /quinta\s*do\s*lago/i,             ccode: "024" },
  { match: /boavista/i,                        ccode: "025" },
  { match: /silves/i,                          ccode: "026" },
  { match: /alamos/i,                          ccode: "040" },
  { match: /pinheiros\s*altos/i,              ccode: "041" },
  { match: /penina/i,                          ccode: "042" },
  { match: /vila\s*sol/i,                     ccode: "046" },
  { match: /salgados/i,                        ccode: "047" },
  { match: /jamor/i,                           ccode: "055" },
  { match: /beloura/i,                         ccode: "060" },
  { match: /palheiro/i,                        ccode: "086" },
  { match: /porto\s*santo/i,                  ccode: "087" },
];

function ccodeFromCourse(course?: string): string | null {
  if (!course) return null;
  for (const { match, ccode } of COURSE_TO_CCODE) {
    if (match.test(course)) return ccode;
  }
  return null;
}

/* ─── Combined event info: name + EDS badge + pill + links ─── */
function EventInfo({ name, origin, pill, links, fed, tcode, ccode, course }: {
  name?: string; origin?: string; pill?: string; links?: Record<string, string>;
  /** Fed code do jogador — fallback final para link à página WHS. */
  fed?: string;
  /** Tournament code FPG. */
  tcode?: string;
  /** Club code do organizador (do scorecard, post-pipeline). Quando disponível
   *  é a fonte mais precisa. Para rondas pré-pipeline, cai para ccodeFromCourse. */
  ccode?: string;
  /** Nome do campo — usado para inferir ccode do clube anfitrião quando não
   *  temos o ccode exacto do scorecard. Funciona para torneios típicos cujo
   *  organizador é o clube onde se joga (regionais, championships de clube). */
  course?: string;
}) {
  // Prioridade do link "Abrir torneio na federação":
  //   1. _links.classif* — URL curado pelo pipeline (sempre correcto).
  //   2. tcode + ccode (do scorecard, exacto) — URL canónica FPG.
  //   3. tcode + ccodeFromCourse (heurística) — URL com ccode do clube
  //      anfitrião. Funciona para a maioria dos torneios organizados pelo
  //      próprio clube (regionais, club championships). Para torneios
  //      organizados pela FPG num clube anfitrião (ex: Nacional Sub-12 em
  //      Aroeira), o ccode estaria errado mas isso normalmente já tem _links.
  //   4. PlayerWHS — fallback final (página do jogador, não do torneio).
  const classifUrl = links
    ? Object.entries(links).find(([k]) => /^classif/i.test(k))?.[1] ?? null
    : null;
  const effectiveCcode = ccode || ccodeFromCourse(course);
  const tcodeUrl = !classifUrl && tcode && effectiveCcode
    ? fpgScoringUrl(effectiveCcode, tcode)
    : null;
  const isFpgTorn = (origin || "").trim().toUpperCase() === "TORN";
  const fallbackFpgUrl = !classifUrl && !tcodeUrl && isFpgTorn && fed
    ? `https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed}`
    : null;
  const fedUrl = classifUrl || tcodeUrl || fallbackFpgUrl;
  const fedTitle = classifUrl
    ? "Abrir classificação do torneio na federação"
    : tcodeUrl
    ? "Abrir torneio na federação"
    : "Abrir histórico WHS do jogador na federação (link directo ao torneio não disponível)";
  const nameNode = fedUrl ? (
    <a
      href={fedUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={fedTitle}
      className="muted"
      style={{ textDecoration: "none" }}
      onClick={e => e.stopPropagation()}
    >{name || ""}</a>
  ) : (
    <span className="muted">{name || ""}</span>
  );
  // Ícone 🔗 quando NÃO há _links curado mas temos algum fallback (tcode ou fed).
  const showFallbackIcon = !classifUrl && fedUrl;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {nameNode}
      <OriginPill origin={origin} />
      <PillBadge pill={pill} />
      <LinkBtns links={links} />
      {showFallbackIcon && (
        <a
          href={fedUrl!}
          target="_blank"
          rel="noopener noreferrer"
          title={fedTitle}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 10, color: "var(--text-muted)", textDecoration: "none",
            verticalAlign: "middle", opacity: 0.6,
          }}
          onClick={e => e.stopPropagation()}
        >🔗</a>
      )}
    </span>
  );
}


/* ────────────────────────────────────────────────────────────────────────────────────────
   By Date View
   ──────────────────────────────────────────────────────────────────────────────────────── */

function ByDateView({ data, search }: {
  data: PlayerPageData; search: string;
}) {
  const [openScorecardId, setOpenScorecardId] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<"date" | "course" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd">("date", "desc", {
    gross: "asc", sd: "asc", hcp: "asc", meters: "desc", stb: "desc", holes: "desc",
  });

  const all = useMemo(() => {
    const term = norm(search);
    let rounds: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => {
      c.rounds.forEach(r => {
        rounds.push({ ...r, course: c.course });
      });
    });
    if (term) {
      rounds = rounds.filter(x =>
        norm(x.course).includes(term) || norm(x.eventName || "").includes(term)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    rounds.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "date": av = a.dateSort; bv = b.dateSort; break;
        case "course": return dir * a.course.localeCompare(b.course, "pt");
        case "event": return dir * (a.eventName || "").localeCompare(b.eventName || "", "pt");
        case "holes": av = a.holeCount; bv = b.holeCount; break;
        case "hcp": av = a.hi ?? 999; bv = b.hi ?? 999; break;
        case "tee": return dir * (a.tee || "").localeCompare(b.tee || "");
        case "meters": av = a.meters ?? 0; bv = b.meters ?? 0; break;
        case "gross": av = a.gross ?? 999; bv = b.gross ?? 999; break;
        case "stb": av = a.stb ?? -999; bv = b.stb ?? -999; break;
        case "sd": av = a.sd ?? 999; bv = b.sd ?? 999; break;
        default: av = a.dateSort; bv = b.dateSort;
      }
      return dir * (av - bv);
    });
    return rounds;
  }, [data, search, sortKey, sortDir]);

  return (
    <div className="card">
    <div className="scroll-x">
      <table className="dtable-lg">
        <colgroup>
          <col className="col-p9" /><col className="col-p18" /><col className="col-p15" />
          <col className="col-p6" /><col className="col-p7" /><col className="col-p10" />
          <col className="col-p9" /><col className="col-p9" /><col className="col-p8" /><col className="col-p9" />
        </colgroup>
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="course" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
            <SortableHdr k="event" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Prova</SortableHdr>
            <SortableHdr k="holes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Bur.</SortableHdr>
            <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">HCP</SortableHdr>
            <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tee</SortableHdr>
            <SortableHdr k="meters" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Dist.</SortableHdr>
            <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
            <SortableHdr k="stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Stb</SortableHdr>
            <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {all.map((r, idx) => {
            const isOpen = openScorecardId === r.scoreId;
            const toggle = () => setOpenScorecardId(isOpen ? null : r.scoreId);
            const holes = data.HOLES[String(r.scoreId)];
            const courseKey = norm(r.course);
            const teeKey = r.teeKey || normKey(r.tee || "");
            const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;
            const year = r.date ? r.date.slice(-4) : null;
            const prevYear = idx > 0 && all[idx - 1].date ? all[idx - 1].date.slice(-4) : null;
            const showYearBar = year && prevYear && year !== prevYear;

            return (
              <React.Fragment key={r.scoreId}>
                {showYearBar && (
                  <tr>
                    <td colSpan={10} style={{ padding: 0, background: "transparent", borderBottom: "2px solid var(--border)" }}>
                      <div className="year-label">{year}</div>
                    </td>
                  </tr>
                )}
                <tr className={`roundRow${isOpen ? " pa-row-open" : ""}`}
                  onClick={() => r.hasCard && toggle()}
                  style={{ cursor: r.hasCard ? "pointer" : "default" }}>
                  <td>
                    {r.hasCard
                      ? <a href="#" onClick={e => { e.preventDefault(); toggle(); }}><TeeDate date={r.date} tee={r.tee || ""} /></a>
                      : <TeeDate date={r.date} tee={r.tee || ""} />}
                    <div className="muted fs-10">#{r.scoreId}</div>
                  </td>
                  <td><CourseLink name={r.course} /></td>
                  <td><EventInfo
                    name={r.eventName}
                    origin={r.scoreOrigin}
                    pill={effectivePill(r)}
                    links={r._links}
                    fed={data.CURRENT_FED}
                    tcode={r.tcode}
                    ccode={r.ccode}
                    course={r.course}
                  /></td>
                  <td className="r"><HoleBadge hc={r.holeCount} /></td>
                  <td className="r">{r.hi ?? ""}</td>
                  <td><TeePill name={r.tee || ""} /></td>
                  <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
                  <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
                  <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
                  <td className="r"><SdCell round={r} /></td>
                </tr>
                {isOpen && holes && (
                  <tr>
                    <td colSpan={10} className="bg-page p-0">
                      <div className="scroll-x" style={scHostStyle}>
                        <ScorecardTable
                          holes={holes}
                          courseName={r.course}
                          date={r.date}
                          tee={r.tee || ""}
                          hi={r.hi}
                          links={r._links}
                          pill={effectivePill(r)}
                          eclecticEntry={ecEntry}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {all.length === 0 && <EmptyState size="sm" message="Nenhuma ronda encontrada" />}
    </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   By Course View
   ──────────────────────────────────────────────────────────────────────────────────────── */

/* ─── Tee Summary Table (compact, for simple by_course view) ─── */
function TeeSummaryTable({ rounds }: { rounds: RoundData[] }) {
  const { sortKey, sortDir, toggleSort } = useSort<"rondas" | "melhor" | "media_gr" | "media_stb" | "media_sd">("rondas", "desc", {
    melhor: "asc", media_gr: "asc", media_sd: "asc", media_stb: "desc",
  });

  const tees = useMemo(() => {
    const map: Record<string, { tee: string; count: number; gross: number[]; stb: number[]; sd: number[]; hi: (number | null)[] }> = {};
    rounds.forEach(r => {
      const tk = normKey(r.tee || "?");
      if (!map[tk]) map[tk] = { tee: r.tee || "?", count: 0, gross: [], stb: [], sd: [], hi: [] };
      map[tk].count++;
      const g = numSafe(r.gross);
      if (g != null && g > 30) map[tk].gross.push(g);
      const s = numSafe(r.stb);
      if (s != null) map[tk].stb.push(s);
      const d = numSafe(r.sd);
      if (d != null) map[tk].sd.push(d);
      map[tk].hi.push(r.hi != null ? Number(r.hi) : null);
    });
    let result = Object.values(map);
    const dir = sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "rondas": av = a.count; bv = b.count; break;
        case "melhor": av = minArr(a.gross) ?? 999; bv = minArr(b.gross) ?? 999; break;
        case "media_gr": av = meanArr(a.gross) ?? 0; bv = meanArr(b.gross) ?? 0; break;
        case "media_stb": av = meanArr(a.stb) ?? 0; bv = meanArr(b.stb) ?? 0; break;
        case "media_sd": av = meanArr(a.sd) ?? 0; bv = meanArr(b.sd) ?? 0; break;
        default: av = a.count; bv = b.count;
      }
      return dir * (av - bv);
    });
    return result;
  }, [rounds, sortKey, sortDir]);

  if (tees.length <= 1) return null; // No point showing if only 1 tee

  return (
    <div className="mb-10">
      <div className="sc-bar-head"><span>Resumo por Tee</span></div>
      <table className="dtable ec-summary" style={{ marginBottom: 0 }}>
        <thead>
          <tr>
            <th>Tee</th>
            <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Rondas</SortableHdr>
            <SortableHdr k="melhor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Melhor</SortableHdr>
            <SortableHdr k="media_gr" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média Gr.</SortableHdr>
            <SortableHdr k="media_stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média Stb</SortableHdr>
            <SortableHdr k="media_sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média SD</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {tees.map(t => {
            const avgG = meanArr(t.gross);
            const minG = minArr(t.gross);
            const avgStb = meanArr(t.stb);
            const avgSd = meanArr(t.sd);
            return (
              <tr key={t.tee}>
                <td><TeePill name={t.tee} /></td>
                <td className="r fw-600">{t.count}</td>
                <td className="r fw-600 cb-par-ok">{minG ?? "–"}</td>
                <td className="r fw-600">{avgG?.toFixed(1) ?? "–"}</td>
                <td className="r fw-600">{avgStb?.toFixed(1) ?? "–"}</td>
                <td className="r">{avgSd != null ? (
                  <span className={`p p-sm p-${sdClassByHcp(avgSd, meanArr(t.hi) ?? null)}`}>
                    {avgSd.toFixed(1)}
                  </span>
                ) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ByCourseRow({ course, data, isAnalysis, openScorecard, openScorecardId }: {
  course: CourseData; data: PlayerPageData; isAnalysis: boolean;
  openScorecard: (id: string) => void; openScorecardId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [activeTee, setActiveTee] = useState<string | null>(null);
  const last = course.rounds[0];
  const courseKey = norm(course.course);

  // Filter rounds by active tee
  const roundsView = useMemo(() => {
    let rr = course.rounds;
    if (activeTee) rr = rr.filter(r => normKey(r.tee || "") === activeTee);
    return rr;
  }, [course.rounds, activeTee]);

  const ecList = data.EC[courseKey] || [];
  const ecDet = data.ECDET[courseKey] || {};
  const holeStats = data.HOLE_STATS[courseKey] || {};
  const lastHex = getTeeHex(last?.tee || "");
  const courseLinkKey = findCourseKey(course.course);

  // Na análise por campo, auto-seleccionar o tee com mais voltas quando se abre o detalhe
  // (caso o utilizador ainda não tenha feito escolha explícita). Assim os gráficos aparecem
  // logo, em vez de exigir um clique prévio.
  useEffect(() => {
    if (!open || !isAnalysis || activeTee) return;
    const keys = Object.keys(holeStats);
    if (keys.length === 0) return;
    const best = keys.reduce((a, b) => ((holeStats[a]?.nRounds ?? 0) >= (holeStats[b]?.nRounds ?? 0) ? a : b));
    setActiveTee(best);
  }, [open, isAnalysis, activeTee, holeStats]);

  // Handler de clique manual num tee — só muda o filtro (sem scroll automático).
  // Toggle: clicar no tee já activo limpa o filtro.
  const handleSelectTee = useCallback((tk: string) => {
    setActiveTee(prev => (prev === tk ? null : tk));
  }, []);

  return (
    <>
      {/* Summary row */}
      <tr className={open ? "pa-row-open" : ""}>
        <td>
          <div className="rowHead">
            <div className="count" style={{ background: lastHex, color: textOnColor(lastHex), border: teeBorder(lastHex) }}>{course.count}</div>
            <button type="button" className="courseBtn" onClick={() => setOpen(v => !v)}>{course.course}</button>
 {courseLinkKey && <a href={`/campos/${courseLinkKey}`} className="courseLink fs-10 ml-4" title="Ver campo" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>↗</a>}
            <PillBadge pill={course.rounds.map(r => effectivePill(r, course.course)).find(Boolean) || ""} />
            <AroeiraNotice
              compact
              courseName={course.course}
              rotatedCount={countRotatedRounds(course.rounds, data.HOLES as Record<string, { _rotated?: number }>)}
              totalRounds={course.rounds.length}
            />
          </div>
        </td>
        <td className="r"><b>{course.count}</b></td>
        <td>{last && <TeeDate date={last.date} tee={last.tee || ""} />}</td>
        <td className="r">{last && <HoleBadge hc={last.holeCount} />}</td>
        <td className="r">{last?.hi ?? ""}</td>
        <td>{last && <TeePill name={last.tee || ""} />}</td>
        <td className="r muted">{last?.meters ? `${last.meters}m` : ""}</td>
        <td className="r">{last && <GrossCell gross={last.gross} par={last.par} />}</td>
        <td className="r">{last ? fmtStb(last.stb, last.holeCount) : ""}</td>
        <td className="r">{last && <SdCell round={last} />}</td>
      </tr>
      {/* Detail row */}
      {open && (
        <tr className="details open">
          <td className="inner" colSpan={10}>
            <div className="innerWrap">
              {/* Nota de unificação + rotação para campos Aroeira (No.1 e No.2) */}
              <AroeiraNotice
                courseName={course.course}
                rotatedCount={countRotatedRounds(course.rounds, data.HOLES as Record<string, { _rotated?: number }>)}
                totalRounds={course.rounds.length}
              />
              {isAnalysis && (
                <>
                  {/* Eclectic */}
                  {ecList.length > 0 && (
                    <EclecticSection ecList={ecList} ecDet={ecDet} holeStats={holeStats}
                      courseRounds={course.rounds} holesData={data.HOLES}
                      activeTee={activeTee} onSelectTee={handleSelectTee} />
                  )}
                  {/* Hole Stats for active tee (logo a seguir ao Eclético, por ser o detalhe do tee seleccionado) */}
                  {activeTee && holeStats[activeTee] && (
                    <div id="hole-stats-section">
                      <HoleStatsSection stats={holeStats[activeTee]} />
                    </div>
                  )}
                  {/* Course Performance Analysis (agnóstico ao tee seleccionado) */}
                  <CoursePerformanceSection rounds={roundsView} />
                </>
              )}
              {/* Tee Summary — só no modo não-análise (no modo análise o EclecticSection já cobre) */}
              {!isAnalysis && <TeeSummaryTable rounds={course.rounds} />}
              {/* Rounds table — no modo análise com tee activo, as rondas com scorecard já aparecem no
                  bloco do Eclético (com HCP/Stb/SD à direita). Aqui mostramos apenas rondas SEM scorecard
                  (para não perder dados) e todas as rondas no modo não-análise ou sem tee seleccionado. */}
              {(() => {
                const hasCardIds = new Set(
                  isAnalysis && activeTee
                    ? course.rounds.filter(r => normKey(r.tee || "") === activeTee && data.HOLES[r.scoreId]).map(r => r.scoreId)
                    : []
                );
                const rowsToShow = isAnalysis && activeTee
                  ? roundsView.filter(r => !hasCardIds.has(r.scoreId))
                  : roundsView;
                if (rowsToShow.length === 0) return null;
                return (
              <div className="mt-8">
                {isAnalysis && activeTee && (
                  <div className="muted fs-11 mb-4">Rondas sem scorecard detalhado neste tee:</div>
                )}
                <table className="dt-compact">
                  <colgroup>
                    <col className="col-p17" /><col className="col-p8" /><col className="col-p9" />
                    <col className="col-p17" /><col className="col-p11" /><col className="col-p14" />
                    <col className="col-p12" /><col className="col-p12" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Data</th><th className="r">Bur.</th><th className="r">HCP</th>
                      <th>Tee</th><th className="r">Dist.</th><th className="r">Gross</th>
                      <th className="r">Stb</th><th className="r">SD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToShow.map(r => {
                      return (
                        <RoundRow key={r.scoreId} r={r} data={data} courseName={course.course}
                          isOpen={openScorecardId === r.scoreId}
                          onToggle={() => openScorecard(openScorecardId === r.scoreId ? "" : r.scoreId)} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
                );
              })()}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Scorecard wrapper that resolves HOLES data and renders ScorecardTable ─── */

function RoundRow({ r, data, courseName, isOpen, onToggle }: {
  r: RoundData; data: PlayerPageData; courseName: string; isOpen: boolean; onToggle: () => void;
}) {
  const holes = data.HOLES[String(r.scoreId)];
  const courseKey = norm(courseName);
  const teeKey = r.teeKey || normKey(r.tee || "");
  const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;
  return (
    <>
      <tr className="roundRow" onClick={r.hasCard ? onToggle : undefined}
          style={{ cursor: r.hasCard ? "pointer" : "default" }}>
        <td>
          {r.hasCard
            ? <a href="#" onClick={e => { e.preventDefault(); onToggle(); }}><TeeDate date={r.date} tee={r.tee || ""} /></a>
            : <TeeDate date={r.date} tee={r.tee || ""} />}
          <OriginPill origin={r.scoreOrigin} />
          <PillBadge pill={effectivePill(r, courseName)} />
          <LinkBtns links={r._links} />
          <div className="muted fs-10">#{r.scoreId}</div>
        </td>
        <td className="r"><HoleBadge hc={r.holeCount} /></td>
        <td className="r">{r.hi ?? ""}</td>
        <td><TeePill name={r.tee || ""} /></td>
        <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
        <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
        <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
        <td className="r"><SdCell round={r} /></td>
      </tr>
      {isOpen && holes && (
        <tr>
          <td colSpan={8} className="bg-page p-0">
            <div className="scroll-x" style={scHostStyle}>
              <ScorecardTable
                holes={holes}
                courseName={courseName}
                date={r.date}
                tee={r.tee || ""}
                hi={r.hi}
                links={r._links}
                pill={effectivePill(r, courseName)}
                eclecticEntry={ecEntry}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ByCourseView({ data, search, sort, isAnalysis }: {
  data: PlayerPageData; search: string; sort: CourseSort; isAnalysis: boolean;
}) {
  const [openScorecardId, setOpenScorecardId] = useState<string | null>(null);
  type ColKey = "course" | "voltas" | "ultima" | "gross" | "stb" | "sd";

  const dropdownToCol = (s: CourseSort): { key: ColKey; dir: "asc" | "desc" } => {
    if (s === "name_asc") return { key: "course", dir: "asc" };
    if (s === "last_desc") return { key: "ultima", dir: "desc" };
    return { key: "voltas", dir: "desc" };
  };

  const initial = dropdownToCol(sort);
  const [sortKey, setSortKey] = useState<ColKey>(initial.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial.dir);

  useEffect(() => {
    const m = dropdownToCol(sort);
    setSortKey(m.key);
    setSortDir(m.dir);
  }, [sort]);

  const defaultDirMap: Record<ColKey, "asc" | "desc"> = {
    course: "asc", voltas: "desc", ultima: "desc", gross: "asc", stb: "desc", sd: "asc",
  };
  const toggleSort = useCallback((k: ColKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(defaultDirMap[k]); }
  }, [sortKey]);

  const list = useMemo(() => {
    const term = norm(search);
    let l = data.DATA.slice();
    if (term) l = l.filter(c => norm(c.course).includes(term));

    const dir = sortDir === "asc" ? 1 : -1;
    l.sort((a, b) => {
      let av: number, bv: number;
      const lastA = a.rounds[0];
      const lastB = b.rounds[0];
      switch (sortKey) {
        case "course": return dir * a.course.localeCompare(b.course, "pt");
        case "voltas": av = a.count; bv = b.count; break;
        case "ultima": av = a.lastDateSort; bv = b.lastDateSort; break;
        case "gross": av = (lastA?.gross ?? 999); bv = (lastB?.gross ?? 999); break;
        case "stb": av = (lastA?.stb ?? -999); bv = (lastB?.stb ?? -999); break;
        case "sd": av = (lastA?.sd ?? 999); bv = (lastB?.sd ?? 999); break;
        default: av = a.count; bv = b.count;
      }
      if (av === bv) {
        const tieDate = b.lastDateSort - a.lastDateSort;
        return tieDate !== 0 ? tieDate : a.course.localeCompare(b.course, "pt");
      }
      return dir * (av - bv);
    });
    return l;
  }, [data, search, sortKey, sortDir]);

  return (
    <div className="card">
      <div className="scroll-x">
        <table className="dtable-lg">
          <colgroup>
            <col className="col-p26" /><col className="col-p7" /><col className="col-p9" />
            <col className="col-p6" /><col className="col-p7" /><col className="col-p12" />
            <col className="col-p8" /><col className="col-p9" /><col className="col-p8" /><col className="col-p8" />
          </colgroup>
          <thead>
            <tr>
              <SortableHdr k="course" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
              <SortableHdr k="voltas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Voltas</SortableHdr>
              <SortableHdr k="ultima" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Última</SortableHdr>
              <th className="r">Bur.</th><th className="r">HCP</th><th>Tee</th>
              <th className="r">Dist.</th>
              <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
              <SortableHdr k="stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Stb</SortableHdr>
              <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {list.map((c, i) => (
              <ByCourseRow key={c.course + i} course={c} data={data}
                isAnalysis={isAnalysis} openScorecard={setOpenScorecardId} openScorecardId={openScorecardId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Eclectic Section (inside course detail)
   ──────────────────────────────────────────────────────────────────────────────────────── */


/* ────────────────────────────────────────────────────────────────────────────────────────
   Hole Stats Section
   ──────────────────────────────────────────────────────────────────────────────────────── */

/* ─── Linha temporal das rondas neste campo ─── */
function RoundsTimeline({ rounds }: { rounds: RoundData[] }) {
  // Só rondas com gross+par válido (para termos o eixo Y coerente); excluímos 9H
  const pts = useMemo(() => {
    return rounds
      .filter(r => r.gross != null && r.par != null && r.holeCount === 18 && r.dateSort > 0)
      .map(r => ({
        x: r.dateSort,
        gross: Number(r.gross),
        par: Number(r.par),
        tee: r.tee || "",
        date: r.date,
        scoreId: r.scoreId,
        diff: Number(r.gross) - Number(r.par),
      }))
      .sort((a, b) => a.x - b.x);
  }, [rounds]);

  if (pts.length < 3) return null;

  // Dimensões SVG
  const W = 1200, H = 170;
  const padL = 32, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.gross);
  const pars = pts.map(p => p.par);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMinRaw = Math.min(...ys, ...pars), yMaxRaw = Math.max(...ys, ...pars);
  // Margem de 2 golpes em cima e em baixo
  const yMin = Math.floor(yMinRaw - 2), yMax = Math.ceil(yMaxRaw + 2);

  const xScale = (x: number) => padL + (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW);
  const yScale = (y: number) => padT + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;

  // Path da linha de gross (poliline suave)
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.gross).toFixed(1)}`).join(" ");

  // Par: se for constante, linha horizontal; se não, liga os pontos
  const parConst = pars.every(p => p === pars[0]);
  const parPath = parConst
    ? `M ${padL} ${yScale(pars[0])} L ${W - padR} ${yScale(pars[0])}`
    : pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.par).toFixed(1)}`).join(" ");

  // Grid Y (3 linhas)
  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax];

  // Labels X: primeiro e último ponto
  const fmtDate = (ds: string) => ds ? ds.substring(0, 5) + "/" + ds.slice(-2) : "";

  return (
    <div className="mt-10">
      <div className="h-sm">Evolução dos gross <span className="muted fs-11">({pts.length} rondas de 18 buracos · linha tracejada = par)</span></div>
      <div className="scroll-x">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Evolução do gross ao longo do tempo">
          {/* Eixo Y: linhas de grelha */}
          {yTicks.map(t => (
            <g key={t}>
              <line x1={padL} y1={yScale(t)} x2={W - padR} y2={yScale(t)} stroke="var(--border-light)" strokeWidth={1} strokeDasharray={t === yTicks[1] ? "" : "2 3"} />
              <text x={padL - 4} y={yScale(t) + 3} fontSize={10} fill="var(--text-3)" textAnchor="end">{t}</text>
            </g>
          ))}
          {/* Linha do par */}
          <path d={parPath} stroke="var(--color-good)" strokeWidth={1.5} strokeDasharray="5 4" fill="none" opacity={0.7} />
          {/* Linha dos gross */}
          <path d={linePath} stroke="var(--chart-2)" strokeWidth={2} fill="none" />
          {/* Pontos com cor do tee */}
          {pts.map(p => {
            const hex = getTeeHex(p.tee);
            const above = p.diff > 0;
            return (
              <g key={p.scoreId}>
                <circle cx={xScale(p.x)} cy={yScale(p.gross)} r={4.5} fill={hex} stroke="var(--bg-card)" strokeWidth={1.5}>
                  <title>{`${p.date} · ${p.tee} · Gross ${p.gross} (par ${p.par}, ${above ? "+" : ""}${p.diff})`}</title>
                </circle>
              </g>
            );
          })}
          {/* Labels X: datas espaçadas — só rende cada etiqueta se distar o suficiente
              da anterior em x (evita sobreposição quando há rondas em datas próximas). */}
          {(() => {
            const lastIdx = pts.length - 1;
            const minGap = 95;
            const want = Math.min(8, pts.length);
            const cand = Array.from(new Set(
              Array.from({ length: want }, (_, i) => Math.round((i * lastIdx) / (want - 1)))
            ));
            const keep: number[] = [];
            let lastX = -Infinity;
            for (const idx of cand) {
              const x = xScale(pts[idx].x);
              if (x - lastX >= minGap) { keep.push(idx); lastX = x; }
            }
            if (keep.length === 0 || keep[keep.length - 1] !== lastIdx) {
              if (keep.length && xScale(pts[lastIdx].x) - lastX < minGap) keep[keep.length - 1] = lastIdx;
              else keep.push(lastIdx);
            }
            return keep.map(idx => {
              const anchor = idx === 0 ? "start" : idx === lastIdx ? "end" : "middle";
              return <text key={idx} x={xScale(pts[idx].x)} y={H - 8} fontSize={10} fill="var(--text-3)" textAnchor={anchor}>{fmtDate(pts[idx].date)}</text>;
            });
          })()}
        </svg>
      </div>
    </div>
  );
}

/* ─── Course Performance Analysis (KPIs + Conclusion) ─── */
function CoursePerformanceSection({ rounds }: { rounds: RoundData[] }) {
  const stats = useMemo(() => {
    const r18 = rounds.filter(r => r.holeCount === 18 && (r.sd != null || r.stb != null));
    const r9 = rounds.filter(r => r.holeCount === 9 && (r.sd != null || r.stb != null));
    if (r18.length + r9.length < 2) return null;

    interface NormRound { sd: number | null; stb: number | null; hi: number | null; tee: string; date: string; dateSort: number; holeCount: number; gross: number | null; par: number | null }
    const allNorm: NormRound[] = [];
    r18.forEach(r => allNorm.push({
      sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) : null,
      hi: r.hi, tee: r.tee || "?", date: r.date || "", dateSort: r.dateSort,
      holeCount: 18, gross: r.gross ? Number(r.gross) : null, par: r.par ? Number(r.par) : null
    }));
    r9.forEach(r => allNorm.push({
      sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) + 17 : null,
      hi: r.hi, tee: r.tee || "?", date: r.date || "", dateSort: r.dateSort,
      holeCount: 9, gross: null, par: null
    }));
    allNorm.sort((a, b) => a.dateSort - b.dateSort);

    const sdArr = allNorm.map(r => r.sd).filter((x): x is number => x != null && !isNaN(x));
    const stbArr = allNorm.map(r => r.stb).filter((x): x is number => x != null && !isNaN(x));

    // Trend: linear regression on SD
    let trendLabel = "➡️ Estável", trendCls = "trend-flat";
    if (sdArr.length >= 3) {
      const slope = linearSlope(sdArr)!;
      if (slope < -0.3) { trendLabel = "📈 A melhorar"; trendCls = "trend-up"; }
      else if (slope > 0.3) { trendLabel = "📉 A piorar"; trendCls = "trend-down"; }
    }

    // By tee breakdown
    const teeMap: Record<string, { tee: string; sds: number[]; stbs: number[]; grosses: number[]; pars: number[]; count: number }> = {};
    allNorm.forEach(r => {
      if (!teeMap[r.tee]) teeMap[r.tee] = { tee: r.tee, sds: [], stbs: [], grosses: [], pars: [], count: 0 };
      if (r.sd != null && !isNaN(r.sd)) teeMap[r.tee].sds.push(r.sd);
      if (r.stb != null && !isNaN(r.stb)) teeMap[r.tee].stbs.push(r.stb);
      if (r.gross != null && r.par != null) { teeMap[r.tee].grosses.push(r.gross); teeMap[r.tee].pars.push(r.par); }
      teeMap[r.tee].count++;
    });
    const teeArr = Object.values(teeMap).sort((a, b) => b.count - a.count);

    // Conclusion (native React elements)
    const grossArr18 = allNorm.filter(r => r.gross != null && r.par != null);
    const conclusion: React.ReactNode[] = [];
    if (grossArr18.length >= 2) {
      const avgG = meanArr(grossArr18.map(r => r.gross!))!;
      const avgP = meanArr(grossArr18.map(r => r.par!))!;
      const diff = avgG - avgP;
      const bestG = minArr(grossArr18.map(r => r.gross!))!;
      const bestP = grossArr18.reduce((a, r) => r.gross! < a.gross! ? r : a).par;
      conclusion.push(<span key="avg">Em média faz <b>{avgG.toFixed(0)} pancadas</b> neste campo (<b>{fmtSign(diff, 0)} vs par</b>). </span>);
      conclusion.push(<span key="best">O melhor resultado foi <b>{bestG}</b> (par {bestP}). </span>);
    }
    if (stbArr.length >= 2) {
      const avgStb = meanArr(stbArr)!;
      if (avgStb >= 36) conclusion.push(<span key="stb">A média Stableford de <b>{avgStb.toFixed(0)}</b> mostra que joga <b className="c-par-ok">consistentemente bem</b> aqui. </span>);
      else if (avgStb >= 30) conclusion.push(<span key="stb">A média Stableford de <b>{avgStb.toFixed(0)}</b> mostra um desempenho <b>sólido</b>. </span>);
      else conclusion.push(<span key="stb">A média Stableford de <b>{avgStb.toFixed(0)}</b> sugere <b className="c-eagle">espaço para melhorar</b> neste campo. </span>);
    }
    if (trendCls === "trend-up") conclusion.push(<span key="trend">A tendência é <b className="c-par-ok">positiva</b> — está a melhorar neste campo. </span>);
    else if (trendCls === "trend-down") conclusion.push(<span key="trend">A tendência é <b className="c-birdie">negativa</b> — os resultados recentes pioraram. </span>);
    if (teeArr.length > 1) {
      const bestTee = teeArr.reduce((a, b) => (meanArr(b.stbs) ?? 0) > (meanArr(a.stbs) ?? 0) ? b : a);
      if (bestTee.stbs.length >= 2) conclusion.push(<span key="tee">Os tees <b>{bestTee.tee}</b> são onde tem melhores resultados (Stb {meanArr(bestTee.stbs)!.toFixed(0)}). </span>);
    }

    return {
      has9: r9.length > 0, r18Count: r18.length, r9Count: r9.length,
      totalRounds: allNorm.length,
      sdArr, stbArr,
      avgSd: meanArr(sdArr), minSd: minArr(sdArr), maxSd: maxArr(sdArr),
      avgStb: meanArr(stbArr), maxStb: maxArr(stbArr),
      trendLabel, trendCls,
      conclusion,
    };
  }, [rounds]);

  if (!stats) return null;

  // Versão compacta: tendência pill + resumo em prosa + timeline.
  // Os KPIs (Média SD, Melhor SD, etc.) deixam de aparecer aqui porque já estão
  // no bloco do Eclético (colunas HCP/Stb/SD por ronda + totais).
  return (
    <details className="details-block mt-10">
      <summary className="details-summary">
        Evolução neste campo
        {stats.sdArr.length >= 3 && (
          <span className={`p p-sm ml-6 ${stats.trendCls}`} title="Tendência linear da série de SDs">
            {stats.trendLabel}
          </span>
        )}
      </summary>
      {stats.conclusion.length > 0 && (
        <div className="caConcText fs-12 mt-6">{stats.conclusion}</div>
      )}
      {stats.has9 && <div className="muted fs-10 mt-4">Stb 9h normalizado +17</div>}
      <RoundsTimeline rounds={rounds} />
    </details>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Analysis View — KPIs, Histogram, Trajectory, Records, WHS, Last 20, Cross
   ──────────────────────────────────────────────────────────────────────────────────────── */

function AnalysisView({ data }: { data: PlayerPageData }) {
  const [histPeriod, setHistPeriod] = useState(12);
  const [recPeriod, setRecPeriod] = useState(12);
  const [trajPeriod, setTrajPeriod] = useState(12);

  // Flatten all rounds desc
  const allRoundsDesc = useMemo(() => {
    const arr: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => c.rounds.forEach(r => arr.push({ ...r, course: c.course })));
    arr.sort((a, b) => (b.dateSort || 0) - (a.dateSort || 0));
    return arr;
  }, [data]);

  const rounds18 = useMemo(() => allRoundsDesc.filter(r => r.holeCount === 18 || (r as RoundData & { hc?: number }).hc === 18), [allRoundsDesc]);
  const rounds18g = useMemo(() => rounds18.filter(r => numSafe(r.gross) != null && Number(r.gross) > 50 && Number(r.gross) < 200), [rounds18]);

  // KPIs
  const last5 = rounds18g.slice(0, 5);
  const last20 = rounds18g.slice(0, 20);
  const kpiGross5 = meanArr(last5.map(r => r.gross));
  const kpiGross20 = meanArr(last20.map(r => r.gross));

  // whs20 = last 20 rounds WITH a valid SD (real WHS window — treino rounds count too)
  const whs20 = useMemo(() =>
    allRoundsDesc.filter(r => numSafe(r.sd) != null).slice(0, 20),
    [allRoundsDesc]
  );

  // whsPosMap: scoreId → position 1-20 in the WHS window
  const whsPosMap = useMemo(() => {
    const m = new Map<string, number>();
    whs20.forEach((r, i) => m.set(r.scoreId, i + 1));
    return m;
  }, [whs20]);

  // Display table: all non-training rounds up to (and including) the 20th WHS round + a few extra
  const last20Table = useMemo(() => {
    const nonTraining = allRoundsDesc.filter(r => !r._isTreino);
    // Find index of the 20th WHS round in the full list
    const last20thId = whs20.length === 20 ? whs20[19].scoreId : null;
    const cutoffIdx  = last20thId
      ? nonTraining.findIndex(r => r.scoreId === last20thId)
      : -1;
    const showUntil = Math.max(25, cutoffIdx + 4);
    return nonTraining.slice(0, showUntil);
  }, [allRoundsDesc, whs20]);

  // Best 8 SD in WHS window — Map<scoreId, rank (1-8)>
  const best8 = useMemo(() => {
    const indexed = whs20.map(r => ({ id: r.scoreId, sd: numSafe(r.sd)! }))
      .sort((a, b) => a.sd - b.sd);
    const map = new Map<string, number>();
    indexed.slice(0, 8).forEach((x, rank) => map.set(x.id, rank + 1));
    return map;
  }, [whs20]);

  // Period filter for analysis — only 18-hole rounds with valid gross (consistent with KPI cards)
  function filterByPeriod(months: number): (RoundData & { course: string })[] {
    if (months <= 0) return rounds18g;
    const cutoff = Date.now() - months * 30.44 * 24 * 3600 * 1000;
    return rounds18g.filter(r => r.dateSort >= cutoff);
  }

  // ── Extra KPI calculations ───────────────────────────────────────────────
  const rounds18sd = useMemo(() =>
    rounds18.filter(r => numSafe(r.sd) != null).slice(0, 20), [rounds18]);
  const sdLast5  = useMemo(() => meanArr(rounds18sd.slice(0, 5).map(r => Number(r.sd))), [rounds18sd]);
  const sdLast20 = useMemo(() => meanArr(rounds18sd.map(r => Number(r.sd))), [rounds18sd]);
  const sdSigma  = useMemo(() => stdevArr(rounds18sd.map(r => Number(r.sd))), [rounds18sd]);
  const bestSdRound = useMemo(() => {
    const valid = rounds18.filter(r => numSafe(r.sd) != null);
    if (!valid.length) return null;
    return valid.reduce((best, r) => Number(r.sd) < Number(best.sd) ? r : best);
  }, [rounds18]);
  const sdTrend = useMemo(() => {
    const recent = rounds18sd.slice(0, 10);
    if (recent.length < 3) return null;
    const chronological = [...recent].reverse().map(r => Number(r.sd));
    const slope = linearSlope(chronological);
    return slope != null ? { slope, n: recent.length } : null;
  }, [rounds18sd]);

  return (
    <div className="an-wrap">

      {/* ── KPIs ── */}
      <CollapseCard title="Indicadores" icon="📊" defaultOpen={false}>
        <div className="flex-wrap" style={{ display: "flex", gap: 10 }}>
          <KPICard title="SD Médio · Últ. 5" val={sdLast5?.toFixed(1) ?? null}
            delta={sdLast5 != null && sdLast20 != null ? sdLast5 - sdLast20 : null}
            deltaLabel="vs últ. 20"
            sub={`${Math.min(5, rounds18sd.length)} rondas com SD`}
            tip="Média do Score Diferencial das últimas 5 rondas de 18B. Negativo = a melhorar vs média longa." />
          <KPICard title="SD Médio · Últ. 20" val={sdLast20?.toFixed(1) ?? null}
            sub={`${rounds18sd.length} rondas com SD`}
            tip="Média dos Score Diferenciais das últimas 20 rondas de 18 buracos." />
          <KPICard title="Consistência (σ SD)" val={sdSigma?.toFixed(1) ?? null}
            sub="Desvio padrão do SD"
            tip="Desvio padrão do Score Diferencial. Menor = mais consistente." />
          <KPICard title="Melhor SD (carreira)"
            val={bestSdRound ? Number(bestSdRound.sd).toFixed(1) : null}
            sub={bestSdRound ? `${shortDate(bestSdRound.date)} · ${(bestSdRound as any).course ?? ""}` : undefined}
            accent="var(--color-good)"
            tip="Melhor Score Diferencial de sempre." />
          <KPICard title="Gross Médio · Últ. 5" val={kpiGross5?.toFixed(1) ?? null}
            delta={kpiGross5 != null && kpiGross20 != null ? kpiGross5 - kpiGross20 : null}
            deltaLabel="vs últ. 20"
            sub={`${last5.length} rondas 18B`} />
          <KPICard title="Tendência SD (últ. 10)"
            val={sdTrend != null ? `${sdTrend.slope > 0 ? "+" : ""}${sdTrend.slope.toFixed(2)}` : null}
            sub={sdTrend ? `por ronda · ${sdTrend.n} rondas analisadas` : "mín. 3 rondas necessárias"}
            accent={sdTrend != null
              ? sdTrend.slope < -0.1 ? "var(--color-good)"
              : sdTrend.slope > 0.1  ? "var(--color-danger)"
              : "var(--text-3)" : undefined}
            tip="Inclinação da regressão linear dos SDs das últimas 10 rondas. Negativo = a melhorar por ronda jogada. Independente do tempo." />
        </div>
      </CollapseCard>

      {/* ── Histogram + Trajectory + Records ── */}
      <CollapseCard title="Distribuição · Trajectória · Recordes" icon="📈" defaultOpen={false}>
        <div className="an-grid3" style={{ marginBottom: 0 }}>
          <HistogramCard rounds={filterByPeriod(histPeriod)} period={histPeriod} setPeriod={setHistPeriod} />
          <TrajectoryCard rounds={filterByPeriod(trajPeriod)} period={trajPeriod} setPeriod={setTrajPeriod} />
          <RecordsCard rounds={filterByPeriod(recPeriod)} period={recPeriod} setPeriod={setRecPeriod} />
        </div>
      </CollapseCard>

      {/* ── WHS Detail ── */}
      <CollapseCard title="Handicap — Detalhe WHS" icon="🏌️" defaultOpen={false}>
        <WHSDetail hcp={data.HCP_INFO} bare />
      </CollapseCard>

      {/* ── Round Simulator (SD + Próxima Ronda combinados) ── */}
      <CollapseCard title="Simulador de Rondas" icon="🎯" defaultOpen={false}>
        <RoundSimulator hcp={data.HCP_INFO} whs20={whs20} playerData={data} bare />
      </CollapseCard>

      {/* ── Last 20 Table ── */}
      <CollapseCard title="Janela WHS — Últimas Rondas" icon="📋" defaultOpen={false}>
        <Last20Table data={data} last20Table={last20Table} best8={best8} whsPosMap={whsPosMap} bare />
      </CollapseCard>

      {/* ── Cross Analysis ── */}
      <CollapseCard title="Análise por Campo" icon="🗺️" defaultOpen={false}>
        <CrossAnalysis data={data} bare />
      </CollapseCard>

    </div>
  );
}

/* ─── KPI Card — variante local: suporta delta numérico + accent color + tip icon.
   NÃO é o mesmo que src/ui/KpiCard.tsx (que é genérico label/value/sub).
   Manter local até convergir as props. ─── */
function KPICard({ title, val, sub, delta, deltaLabel, tip, accent }: {
  title: string; val: string | null; sub?: string;
  delta?: number | null; deltaLabel?: string;
  tip?: string; accent?: string;
}) {
  const dColor = delta == null ? undefined
    : delta < -0.05 ? "var(--color-good)"
    : delta > 0.05  ? "var(--color-danger)"
    : "var(--text-3)";
  return (
    <div className="kpi-card">
      <div className="kpi-card-label">
        {title}{tip && <span className="kpi-info ml-4" title={tip}>ℹ</span>}
      </div>
      <div className="kpi-card-val" style={accent ? { color: accent } : undefined}>
        {val ?? <span style={{ color: "var(--text-3)" }}>–</span>}
      </div>
      {delta != null && (
        <div className="kpi-card-delta" style={{ color: dColor }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)} {deltaLabel ?? "vs média"}
        </div>
      )}
      {sub && <div className="kpi-card-sub">{sub}</div>}
    </div>
  );
}

/* ─── Period selector (3m/6m/1a/…/total) ─── */
function PeriodSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="br c-text-2 fs-11" style={{ padding: "2px 6px", border: "1px solid var(--border)", background: "var(--bg-card)" }}
      value={value} onChange={e => onChange(Number(e.target.value))}>
      <option value={3}>3 meses</option>
      <option value={6}>6 meses</option>
      <option value={9}>9 meses</option>
      <option value={12}>1 ano</option>
      <option value={24}>2 anos</option>
      <option value={36}>3 anos</option>
      <option value={0}>Total</option>
    </select>
  );
}

/* ─── Histogram ─── */
function HistogramCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const bins = useMemo(() => {
    const defs = [
      { label: "Excepcional (≤0)", min: -999, max: 0, color: "var(--tier-exceptional)" },
      { label: "Bom (+1 a +5)", min: 1, max: 5, color: "var(--tier-good)" },
      { label: "Razoável (+6 a +10)", min: 6, max: 10, color: "var(--tier-fair)" },
      { label: "Difícil (+11 a +15)", min: 11, max: 15, color: "var(--chart-4)" },
      { label: "Fraco (+16 a +20)", min: 16, max: 20, color: "var(--tier-weak)" },
      { label: "Mau (+21 a +25)", min: 21, max: 25, color: "var(--tier-bad)" },
      { label: "Desastroso (>+25)", min: 26, max: 999, color: "var(--color-danger-dark)" },
    ];
    const diffs: number[] = [];
    for (const r of rounds) {
      if (r.gross != null && r.par != null && Number(r.par) > 0) {
        const diff = Number(r.gross) - Number(r.par);
        diffs.push(diff);
      }
    }
    let maxCount = 0;
    const result = defs.map(d => {
      const count = diffs.filter(v => v >= d.min && v <= d.max).length;
      if (count > maxCount) maxCount = count;
      return { ...d, count };
    });
    const avg = meanArr(diffs) ?? 0;
    const sorted = [...diffs].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)] || 0;
    return { bins: result, maxCount, total: diffs.length, avg, median };
  }, [rounds]);

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Desempenho vs Par</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {bins.total === 0 ? <EmptyState size="sm" message="Sem dados" /> :
        <>
          {bins.bins.map(b => (
            <div key={b.label} className="an-hist-row">
              <div className="an-hist-label">{b.label}</div>
              <div className="flex-1">
                <div className="an-hist-bar" style={{
                  width: `${bins.maxCount > 0 ? Math.max(4, (b.count / bins.maxCount) * 100) : 4}%`,
                  background: b.color
                }}>{b.count > 0 ? b.count : ""}</div>
              </div>
            </div>
          ))}
          <div className="muted mt-6 ta-c fs-11">
            {bins.total} rondas · Média: +{bins.avg.toFixed(1)} · Mediana: +{bins.median.toFixed(0)}
          </div>
        </>
      }
    </div>
  );
}

/* ─── Trajectory ─── */
function TrajectoryCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const stats = useMemo(() => {
    const grosses: number[] = [];
    for (const r of rounds) {
      if (r.gross != null) {
        grosses.push(Number(r.gross));
      }
    }
    if (grosses.length < 3) return null;
    const overall = grosses.reduce((a, b) => a + b, 0) / grosses.length;
    const last5 = grosses.slice(0, Math.min(5, grosses.length));
    const last5avg = last5.reduce((a, b) => a + b, 0) / last5.length;
    const last10 = grosses.slice(0, Math.min(10, grosses.length));
    const last10avg = last10.reduce((a, b) => a + b, 0) / last10.length;
    const diff5 = last5avg - overall;
    const diff10 = last10avg - overall;
    return { overall: overall.toFixed(1), last5: last5avg.toFixed(1), last10: last10avg.toFixed(1), diff5, diff10, n: grosses.length };
  }, [rounds]);

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Trajectória</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!stats ? <div className="muted">Poucos dados</div> : (
        <div className="grid-3-tc">
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 5</div>
            <div className="kpi-val">{stats.last5}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff5, 1, 1) }}>
              {fmtSign(stats.diff5, 1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 10</div>
            <div className="kpi-val">{stats.last10}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff10, 1, 1) }}>
              {fmtSign(stats.diff10, 1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">CARREIRA</div>
            <div className="kpi-val">{stats.overall}</div>
            <div className="muted fs-10">{stats.n} rondas</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Records ─── */
function RecordsCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const records = useMemo(() => {
    const r18 = rounds.filter(r => r.holeCount === 18 && numSafe(r.gross) != null && Number(r.gross) > 50 && Number(r.gross) < 200);
    if (r18.length === 0) return null;
    const byGross = [...r18].sort((a, b) => Number(a.gross) - Number(b.gross));
    const bySd = [...r18].filter(r => r.sd != null).sort((a, b) => Number(a.sd) - Number(b.sd));
    const byStb = [...r18].filter(r => r.stb != null).sort((a, b) => Number(b.stb!) - Number(a.stb!));
    return {
      bestGross: byGross[0],
      bestSd: bySd[0],
      bestStb: byStb[0],
      worstGross: byGross[byGross.length - 1],
    };
  }, [rounds]);

  function RecLine({ label, r, field }: { label: string; r: RoundData & { course: string } | undefined; field: "gross" | "sd" | "stb" }) {
    if (!r) return null;
    const val = field === "gross" ? r.gross : field === "sd" ? r.sd : r.stb;
    return (
      <div className="jog-field-line">
        <span>{label}</span>
        <span><b>{val}</b> <span className="muted">({shortDate(r.date)} · {r.course})</span></span>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Recordes Pessoais</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!records ? <EmptyState size="sm" message="Sem dados" /> : (
        <div>
          <RecLine label="🏆 Melhor Gross" r={records.bestGross} field="gross" />
          <RecLine label="📉 Melhor SD" r={records.bestSd} field="sd" />
          <RecLine label="⭐ Melhor Stb" r={records.bestStb} field="stb" />
          <RecLine label="💀 Pior Gross" r={records.worstGross} field="gross" />
        </div>
      )}
    </div>
  );
}

/* ─── WHS Detail ─── */
/* ─── Reusable collapsible card wrapper ─── */
function CollapseCard({ title, icon, defaultOpen = false, children, badge }: {
  title: string; icon?: string; defaultOpen?: boolean;
  children: React.ReactNode; badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card mb-12" >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === "Enter" || e.key === " ") && setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", marginBottom: open ? 12 : 0 }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span className="h-xs flex-1"  style={{ margin: 0 }}>{title}</span>
        {badge}
        <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && children}
    </div>
  );
}

function WHSDetail({ hcp, bare }: { hcp: HcpInfo; bare?: boolean }) {
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    bare ? <>{children}</> : <div className="card"><div className="h-xs">Handicap — Detalhe WHS</div>{children}</div>;
  if (hcp.current == null) {
    return <Wrap><EmptyState size="sm" message="Sem dados WHS disponíveis" /></Wrap>;
  }
  return (
    <Wrap>
      <div className="jog-record-grid">
        <div className="card-stat-green">
          <div className="muted fs-10">MÍNIMO ATINGIDO</div>
          <div className="jog-big-val c-par-ok">{hcp.lowHcp?.toFixed(1) ?? "–"}</div>
        </div>
        <div className="card-stat-blue">
          <div className="muted fs-10">ACTUAL</div>
          <div className="jog-big-val c-blue">{hcp.current.toFixed(1)}</div>
          {hcp.lowHcp != null && (
 <div className="fs-11 fw-600" style={{ color: SC.danger }}>+{(hcp.current - hcp.lowHcp).toFixed(1)} do mínimo</div>
          )}
        </div>
        <div className="card-stat-detail">
          <div className="muted fs-10">MÉDIA {hcp.qtyCalc || 8} MELHORES</div>
          <div className="jog-big-val c-text-3">{hcp.scoreAvg?.toFixed(1) ?? "–"}</div>
        </div>
      </div>
 <div className="fs-11 c-text-3 d-flex" style={{ gap: 14, borderTop: "1px solid var(--bg)", paddingTop: 8 }}>
        {hcp.softCap != null && <span>Soft cap: <b>{hcp.softCap.toFixed(1)}</b></span>}
        {hcp.hardCap != null && <span>Hard cap: <b>{hcp.hardCap.toFixed(1)}</b></span>}
        {hcp.qtyScores != null && hcp.qtyCalc != null && (
          <span>Cálculo: <b>{hcp.qtyCalc}</b> de <b>{hcp.qtyScores}</b> scores
            {hcp.adjustTotal != null && hcp.adjustTotal !== 0 && ` (ajuste: ${hcp.adjustTotal})`}
          </span>
        )}
      </div>
    </Wrap>
  );
}

/* ─── Last 20 Table with scorecard expansion ─── */
/* ──── View
   ──────────────────────────────────────────────────────────────────────────────────────── */

/* ──── — data loading + view switching
   ──────────────────────────────────────────────────────────────────────────────────────── */

/** Constrói um FederadoRaw vazio a partir SÓ do fed code — para quando o
 *  utilizador chega via /jogadores/{fed}?view=federado mas o fed code não
 *  existe nem em allPlayers nem em federados.json (jogador inactivo histórico
 *  ou novo). A ficha live (rondas WHS) funciona porque só precisa do
 *  federation_code; o cadastro fica todo a vazio até a chamada live trazer
 *  algum dado. */
function syntheticFederadoFromFedCode(fed: string): FederadoRaw {
  return {
    federation_code:    fed,
    federation_number:  fed.padStart(7, "0"),
    name:               "",
    gender:             "",
    birthdate:          null,
    admission_date:     null,
    club_code:          "",
    club_name:          "",
    acronym:            "",
    country_prefix:     "PT",
    country:            "Portugal",
    hcp_exact:          null,
    hcp_index:          null,
    hcp_status:         "",
    hcp_status_id:      0,
    hcp_type:           "",
    age_level:          "",
    age_level_id:       0,
    player_type:        "",
    player_type_id:     0,
    federated_status:   "",
    federated_status_id: 0,
    rounds_current_year: 0,
    photo:              null,
    last_hcp_date:      null,
    encryptedfedcode:   "",
  };
}

/** Constrói um FederadoRaw mínimo a partir de um Player "Nossos" — para
 *  poder renderizar FederadoOnlyDetail no modo "ver como federado". Os campos
 *  ausentes são preenchidos de forma neutra; o cadastro fica esparso mas a
 *  ficha live (rondas WHS) funciona porque só precisa do federation_code. */
function syntheticFederadoFromPlayer(p: { fed: string } & Player): FederadoRaw {
  const clubName = typeof p.club === "string" ? p.club : (p.club?.long || p.club?.short || "");
  const acronym  = typeof p.club === "string" ? p.club : (p.club?.short || "");
  const clubCode = typeof p.club === "object" && p.club?.code ? String(p.club.code) : "";
  return {
    federation_code:    p.fed,
    federation_number:  p.fed.padStart(7, "0"),
    name:               p.name,
    gender:             p.sex || "",
    birthdate:          p.dob || null,
    admission_date:     null,
    club_code:          clubCode,
    club_name:          clubName,
    acronym,
    country_prefix:     "PT",
    country:            "Portugal",
    hcp_exact:          p.hcp ?? null,
    hcp_index:          p.hcp ?? null,
    hcp_status:         "",
    hcp_status_id:      0,
    hcp_type:           "",
    age_level:          p.escalao || "",
    age_level_id:       0,
    player_type:        "",
    player_type_id:     0,
    federated_status:   "",
    federated_status_id: 0,
    rounds_current_year: 0,
    photo:              null,
    last_hcp_date:      null,
    encryptedfedcode:   "",
  };
}

function PlayerDetail({ fedId, selected, onMetaLoaded }: { fedId: string; selected: { fed: string } & Player; onMetaLoaded?: (meta: PlayerPageData["META"]) => void }) {
  const { data: rawData, loading, error } = usePlayerData(fedId);
  const { simCourses } = useAppContext();
  // Ligar dados JOGADOS ao tee do campo quando a ronda não os traz (típico de
  // torneios internacionais — a FPG tem o score mas não as jardas, e o SI vem
  // sequencial/falso). Liga ao tee real do campo em simCourses e preenche:
  //   • meters (distância)   • si (stroke index) no scorecard (data.HOLES)
  // Clona só o que é afectado. ⚠ `meters` vem às vezes "" ou 0 (não null).
  const data = useMemo(() => {
    if (!rawData?.DATA) return rawData;
    let any = false;
    let HOLES = rawData.HOLES;
    let holesCloned = false;
    const DATA = rawData.DATA.map((c) => {
      const rounds = c.rounds.map((r) => {
        const tee = resolvePlayedTee(c.course, r.tee ?? null, simCourses, fedId);
        let nr = r;
        // distância
        if (!r.meters && tee?.distances) {
          const d = tee.distances;
          const m = (r.holeCount === 9 && d.holesCount === 18 && d.front9) ? d.front9 : d.total;
          if (m != null) { nr = { ...nr, meters: m }; any = true; }
        }
        // SI no scorecard (data.HOLES[scoreId].si) — só 18 buracos. Usa o SI de
        // REFERÊNCIA do campo (igual ao da CamposPage), não o do tee específico.
        const sid = String(r.scoreId);
        const hd = HOLES?.[sid];
        if (hd && isFakeSI(hd.si)) {
          const courseSI = r.holeCount === 18 ? resolvePlayedSI(c.course, simCourses) : null;
          const real = courseSI && courseSI.length === (hd.si?.length ?? 18) ? courseSI : null;
          const hasFakeNumbers = (hd.si ?? []).some((v) => v != null && v > 0);
          // SI sequencial nunca é real → substituir pelo SI do campo, ou OCULTAR
          // (tudo null) se não houver fonte. Não tocar se já está vazio.
          if (real || hasFakeNumbers) {
            if (!holesCloned) { HOLES = { ...rawData.HOLES }; holesCloned = true; }
            HOLES[sid] = { ...hd, si: real ?? (hd.si ?? []).map(() => null) };
            any = true;
          }
        }
        return nr;
      });
      return { ...c, rounds };
    });
    return any ? { ...rawData, DATA, HOLES } : rawData;
  }, [rawData, simCourses, fedId]);
  const [searchParams, setSearchParams] = useSearchParams();
  // Toggle: ver este jogador como se fosse só um federado (sem análise rica).
  // Persiste no URL via ?view=federado para sobreviver a refresh / share.
  const federadoView = searchParams.get("view") === "federado";
  const setFederadoView = (on: boolean) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      if (on) n.set("view", "federado");
      else n.set("view", "by_date");
      return n;
    }, { replace: true });
  };
  // Federado real do FPG (carregado lazy quando se entra na vista federado) —
  // permite mostrar foto, country_prefix, dados de cadastro reais, etc.
  const [realFederado, setRealFederado] = useState<FederadoRaw | null>(null);
  // Reset quando muda de jogador
  useEffect(() => { setRealFederado(null); }, [fedId]);
  // Quando se activa a vista federado, procurar o federado real em federados.json
  useEffect(() => {
    if (!federadoView) return;
    let cancelled = false;
    loadFederados()
      .then(file => {
        if (cancelled) return;
        const found = file.players.find(p => String(p.federation_code) === String(fedId));
        if (found) setRealFederado(found);
      })
      .catch(() => { /* ignorar — synthetic ainda funciona */ });
    return () => { cancelled = true; };
  }, [federadoView, fedId]);

  const VALID_VIEWS: ViewKey[] = ["by_course", "by_course_analysis", "by_date", "by_tournament", "analysis"];
  const paramView = searchParams.get("view") as ViewKey | null;

  const [view, setViewState] = useState<ViewKey>(
    paramView && VALID_VIEWS.includes(paramView) ? paramView : "by_date"
  );
  const setView = (v: ViewKey) => {
    setViewState(v);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("view", v); return n; }, { replace: true });
  };

  const [courseSearch, setCourseSearch] = useState("");
  const [courseSort, setCourseSort] = useState<CourseSort>("last_desc");

  // Reset search + view quando muda de jogador; notify parent when player data loads
  useEffect(() => {
    setCourseSearch("");
    const pv = searchParams.get("view") as string | null;
    // "federado" é uma vista válida (não-ViewKey) — ignorar aqui, é tratada noutro código
    if (pv === "federado") {
      if (data?.META) onMetaLoaded?.(data.META);
      return;
    }
    const resolved: ViewKey = pv && VALID_VIEWS.includes(pv as ViewKey) ? (pv as ViewKey) : "by_date";
    setViewState(resolved);
    // Garantir que o URL reflecte a vista activa (mesmo sem parâmetro explícito)
    if (!pv) setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("view", "by_date"); return n; }, { replace: true });
    if (data?.META) onMetaLoaded?.(data.META);
  }, [data]);

  // Stats (safe even when data is null)
  const totalCourses = data?.DATA.length ?? 0;
  const totalRounds = data?.DATA.reduce((a, c) => a + c.count, 0) ?? 0;
  const curYear = String(new Date().getFullYear());
  const roundsThisYear = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    data.DATA.forEach(c => c.rounds.forEach(r => {
      if (r.date && r.date.slice(-4) === curYear) n++;
    }));
    return n;
  }, [data, curYear]);

  // Holes-in-one: gross 1 em buraco par 3/4 (par conhecido), sobre todas as rondas.
  const aces = useMemo(() => {
    if (!data) return [];
    // Lookup scoreId → {course, date} a partir de DATA para o tooltip.
    const info = new Map<string, { course: string; date: string }>();
    for (const c of data.DATA) for (const r of c.rounds) info.set(String(r.scoreId), { course: c.course, date: r.date });
    return acesFromHoleScores(data.HOLES).map(a => ({ ...a, ...info.get(a.scoreId) }));
  }, [data]);

  // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
  const latestHcp = data?.HCP_INFO?.current != null ? Number(data.HCP_INFO.current) : null;
  const meta = data?.META;

  // Vista "como federado": renderiza FederadoOnlyDetail com um _federadoRaw
  // sintético (Nossos não têm um real). Útil para ver a ficha base FPG +
  // rondas WHS live em tempo real, sem o overlay rico de análise.
  if (federadoView) {
    // Preferência: federado real do FPG (com foto, country, etc.) > _federadoRaw já anexado > synthetic
    const fedSrc = realFederado || (selected as unknown as MergedPlayer)._federadoRaw || syntheticFederadoFromPlayer(selected);
    const fakePlayer = { ...selected, _source: "both" as const, _federadoRaw: fedSrc } as MergedPlayer & { fed: string };
    return (
      <div className="pa-page">
        <div style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <button className="p p-outline" style={{ cursor: "pointer" }}
            onClick={() => setFederadoView(false)}
            title="Voltar à vista completa com análise">
            ← Vista completa
          </button>
          <span className="muted fs-12">Vista de federado (cadastro FPG + rondas WHS live, sem análise nossa)</span>
        </div>
        {/* pa-content dá scroll vertical (.pa-page tem overflow:hidden) */}
        <div className="pa-content" style={{ padding: 0 }}>
          <FederadoOnlyDetail player={fakePlayer} />
        </div>
      </div>
    );
  }

  return (
    <div className="pa-page">
      {/* Header: name + controls on same row, pills below */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(selected as unknown as MergedPlayer)._federadoRaw?.photo && (
              <img src={`https://hcp-portugal.datagolf.pt/photos/${(selected as unknown as MergedPlayer)._federadoRaw!.photo}`}
                alt="" style={{ width: 44, height: 56, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            <span>{selected.name}</span>
            <a
              href={`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${selected.fed}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver ficha WHS no FPG Scoring"
              style={{ marginLeft: 8, fontSize: 14, color: "var(--chart-2)", textDecoration: "none", verticalAlign: "middle" }}
              onClick={e => e.stopPropagation()}
            >🔗</a>
            <a
              href={`https://my.fpg.pt/Home/PlayerWHS.aspx?no=${selected.fed}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver ficha WHS no My FPG"
              style={{ marginLeft: 4, fontSize: 14, color: "var(--chart-2)", textDecoration: "none", verticalAlign: "middle" }}
              onClick={e => e.stopPropagation()}
            >🔗</a>
            <button
              onClick={() => setFederadoView(true)}
              title="Ver como federado: cadastro FPG + rondas WHS live (sem análise nossa)"
              style={{
                marginLeft: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                background: "transparent", border: "1px solid var(--border)",
                borderRadius: 10, cursor: "pointer", color: "var(--text-2)",
                verticalAlign: "middle",
              }}
            >👤 Vista federado</button>
          </h2>
          {data && (
            <div className="pa-controls-left">
              <input className="input" placeholder="Pesquisar campo…" value={courseSearch}
                onChange={e => setCourseSearch(e.target.value)} />
              <select className="select" value={view}
                onChange={e => setView(e.target.value as ViewKey)}>
                <option value="by_course">Por campo</option>
                <option value="by_course_analysis">Análise por campo</option>
                <option value="by_date">Por data</option>
                <option value="by_tournament">Por torneio</option>
                <option value="analysis">Análises</option>
              </select>
              {(view === "by_course" || view === "by_course_analysis") && (
                <select className="select" value={courseSort}
                  onChange={e => setCourseSort(e.target.value as CourseSort)}>
                  <option value="last_desc">Mais recente</option>
                  <option value="count_desc">Mais jogados</option>
                  <option value="name_asc">Nome A–Z</option>
                </select>
              )}
            </div>
          )}
        </div>
        <div className="jog-pills">
          <span className="p p-fed">#{selected.fed}</span>
          {latestHcp != null && <span className="p p-muted">HCP {hcpDisplay(latestHcp)}</span>}
          <SexBadge sex={selected.sex} size="md" />
          {selected.dob && <span className="p p-birth">{selected.dob.slice(0, 4)}</span>}
          {selected.escalao && <span className={`p p-${escCls(meta?.escalao || selected.escalao)}`}>{meta?.escalao || selected.escalao}</span>}
          {(meta?.club || clubLong(selected)) && <span className="p p-club">{meta?.club || clubLong(selected)}</span>}
          {selected.tags?.filter(t => t !== "no-priority").map(t => (
            <span key={t} className="p p-outline">{t}</span>
          ))}
          {totalCourses > 0 && <span className="p p-outline">{totalCourses} campos</span>}
          {totalRounds > 0 && <span className="p p-outline">{totalRounds} voltas</span>}
          {roundsThisYear > 0 && <span className="p p-outline" title={`Rondas em ${curYear}`}>{roundsThisYear} em {curYear}</span>}
          {aces.length > 0 && (
            <span
              className="p"
              style={{ background: "var(--score-eagle, #f59e0b)", color: "#fff", border: "1px solid var(--score-eagle, #f59e0b)" }}
              title={aces
                .map(a => `Buraco ${a.hole} (par ${a.par})${a.course ? ` · ${a.course}` : ""}${a.date ? ` · ${a.date}` : ""}`)
                .join("\n")}
            >
              🕳️ {aces.length} hole-in-one
            </span>
          )}
          {meta?.lastUpdate && <span className="muted fs-11">Últ. act.: {meta.lastUpdate}</span>}
        </div>
      </div>

      {loading ? (
        <LoadingState size="sm" message="A carregar análise…" />
      ) : error || !data ? (
        <div className="player-embed-error">Não foi possível carregar: {error}</div>
      ) : (
        <>
          {/* View content */}
          <div className="pa-content">
            {(view === "by_course" || view === "by_course_analysis") && (
              <ByCourseView data={data} search={courseSearch} sort={courseSort}
                isAnalysis={view === "by_course_analysis"} />
            )}
            {view === "by_date" && (
              <ByDateView data={data} search={courseSearch} />
            )}
            {view === "by_tournament" && (
              <ByTournamentView data={data} search={courseSearch} />
            )}
            {view === "analysis" && (
              <AnalysisView data={data} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   FederadosStatsPanel — estatísticas globais do ficheiro federados.json (página inteira)
   Suporta drill-down em clubes e escalões (clicáveis).
   ──────────────────────────────────────────────────────────────────────────────────────── */
interface GlobalStats {
  total: number; male: number; female: number; withHcp: number; avgHcp: number;
  activeThisYear: number; pros: number;
  byAge: Record<string, { m: number; f: number }>;
  byAgeFull: Record<string, FederadoRaw[]>;
  topCountries: { cp: string; count: number; m: number; f: number; name: string }[];
  allClubs: [string, { name: string; m: number; f: number; count: number; members: FederadoRaw[] }][];
  topBestHcp: FederadoRaw[];
  admissionYears: [string, { m: number; f: number }][];
  hcpBins: Record<string, { m: number; f: number }>;
  hcpBinOrder: readonly string[];
}

/* ── Tabela sortable de todos os clubes ────────────────────── */
type ClubSortKey = "rank" | "name" | "m" | "f" | "count";
function ClubsTable({ stats, onDrillDown, maxClub, pct, COL_M, COL_F }: {
  stats: GlobalStats;
  onDrillDown: (d: { type: "club" | "age"; key: string }) => void;
  maxClub: number;
  pct: (v: number, max: number) => string;
  COL_M: string;
  COL_F: string;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<ClubSortKey>("count", "desc", {
    rank: "asc", name: "asc", m: "desc", f: "desc", count: "desc",
  });
  const rowsBase = stats.allClubs.map(([code, c], i) => ({ code, name: c.name, m: c.m, f: c.f, count: c.count, rank: i + 1 }));
  const sortedRows = React.useMemo(() => {
    const arr = [...rowsBase];
    const mul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "pt") * mul;
      return (Number(a[sortKey]) - Number(b[sortKey])) * mul;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir, stats.allClubs]);

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="fw-700 fs-14">
          Todos os clubes · <span className="muted fs-10">{stats.allClubs.length} clubes · clica na linha para detalhe · clica no cabeçalho para ordenar</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SexBadge sex="M" /> Masculino</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SexBadge sex="F" /> Feminino</span>
        </div>
      </div>
      <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
        <table className="dt-compact">
          <thead>
            <tr className="sticky-head">
              <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} style={{ width: 30 }}>#</SortableHdr>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)}>Clube</SortableHdr>
              <th style={{ width: "40%" }}>Distribuição</th>
              <SortableHdr k="m" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="ta-c" style={{ width: 50 }}><SexBadge sex="M" /></SortableHdr>
              <SortableHdr k="f" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="ta-c" style={{ width: 50 }}><SexBadge sex="F" /></SortableHdr>
              <SortableHdr k="count" sortKey={sortKey} sortDir={sortDir} onSort={k => toggleSort(k as ClubSortKey)} className="r" style={{ width: 60 }}>Total</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => {
              const mPct = row.count > 0 ? (row.m / row.count) * 100 : 0;
              return (
                <tr key={row.code} className="clickable" onClick={() => onDrillDown({ type: "club", key: row.code })}>
                  <td className="muted fs-10">{row.rank}</td>
                  <td>
                    <span className="fw-600">{row.name}</span> <span className="muted fs-10">({row.code})</span>
                  </td>
                  <td>
                    <div style={{ height: 8, borderRadius: 3, overflow: "hidden", display: "flex", background: "var(--bg-subtle)" }}>
                      <div style={{ width: pct(row.count, maxClub), height: "100%", display: "flex" }}>
                        <div style={{ width: `${mPct}%`, background: COL_M }} />
                        <div style={{ width: `${100 - mPct}%`, background: COL_F }} />
                      </div>
                    </div>
                  </td>
                  <td className="r fw-600" style={{ color: COL_M }}>{row.m}</td>
                  <td className="r fw-600" style={{ color: COL_F }}>{row.f}</td>
                  <td className="r fw-900">{row.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FederadosStatsPanel({ stats, inativosStats: _inativosStats, drillDown, onDrillDown, hcpBinDrill, onHcpBinDrill, federados, onClose, onPickPlayer }: {
  stats: GlobalStats;
  inativosStats: InativosStats | null;
  drillDown: { type: "club" | "age"; key: string } | null;
  onDrillDown: (d: { type: "club" | "age"; key: string } | null) => void;
  hcpBinDrill: string | null;
  onHcpBinDrill: (bin: string | null) => void;
  federados: FederadoRaw[] | null;
  onClose: () => void;
  onPickPlayer: (fed: string) => void;
}) {
  const ageOrder = ["SUB10", "SUB12", "SUB14", "SUB16", "SUB18", "SUB21", "SUB24", "MidAmateur", "Senior", "SuperSenior"];
  const sortedAges = Object.entries(stats.byAge).sort((a, b) => {
    const ai = ageOrder.indexOf(a[0]);
    const bi = ageOrder.indexOf(b[0]);
    const at = a[1].m + a[1].f;
    const bt = b[1].m + b[1].f;
    if (ai === -1 && bi === -1) return bt - at;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const totalOf = (o: { m: number; f: number }) => o.m + o.f;
  const maxAge = Math.max(...Object.values(stats.byAge).map(totalOf));
  const maxCountry = stats.topCountries[0]?.count ?? 1;
  const maxClub = stats.allClubs[0]?.[1].count ?? 1;
  const maxHcpBin = Math.max(...Object.values(stats.hcpBins).map(totalOf));
  const maxAdm = Math.max(...stats.admissionYears.map(([, v]) => totalOf(v)));
  const pct = (v: number, max: number) => `${Math.max(2, (v / Math.max(1, max)) * 100)}%`;
  const COL_M = "var(--badge-male)";
  const COL_F = "var(--badge-female)";

  const ptCount = stats.topCountries.find(c => c.cp === "PT")?.count ?? 0;
  const foreignCount = stats.total - ptCount;

  return (
    <div className="p-16">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="detail-title" style={{ margin: 0 }}>📊 Estatísticas FPG</h2>
        <button className="p" onClick={onClose} title="Fechar estatísticas">✕ Fechar</button>
      </div>

      {/* KPIs — 6 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Total" value={stats.total} big />
        <KpiCard label={<><SexBadge sex="M" /> Masculino</>} value={stats.male} pct={stats.male / stats.total} />
        <KpiCard label={<><SexBadge sex="F" /> Feminino</>} value={stats.female} pct={stats.female / stats.total} />
        <KpiCard label="🇵🇹 Portugueses" value={ptCount} pct={ptCount / stats.total} />
        <KpiCard label="🌍 Estrangeiros" value={foreignCount} pct={foreignCount / stats.total} />
        <KpiCard label="Activos 2026" value={stats.activeThisYear} pct={stats.activeThisYear / stats.total} sub="com rondas este ano" />
        <KpiCard label="Com HCP válido" value={stats.withHcp} pct={stats.withHcp / stats.total} sub={`média ${stats.avgHcp.toFixed(1)}`} />
        <KpiCard label="Profissionais" value={stats.pros} pct={stats.pros / stats.total} />
      </div>

      {/* Drill-down inline (aparece no topo quando activo) */}
      {drillDown && (
        <DrillDownCard
          drillDown={drillDown}
          stats={stats}
          onClose={() => onDrillDown(null)}
          onPickPlayer={onPickPlayer}
        />
      )}

      {/* Distribuição de HCP — histograma vertical stacked M/F */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="fw-700 fs-14">Distribuição de HCP · <span className="muted fs-10">{stats.withHcp.toLocaleString("pt-PT")} jogadores com HCP válido</span></div>
          <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SexBadge sex="M" /> Masculino</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SexBadge sex="F" /> Feminino</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.hcpBinOrder.length}, 1fr)`, gap: 12, alignItems: "end", height: 300 }}>
          {stats.hcpBinOrder.map(bin => {
            const { m, f } = stats.hcpBins[bin] || { m: 0, f: 0 };
            const total = m + f;
            const label = bin === "plus" ? "Scratch (+)" : bin;
            const barHeight = (total / Math.max(1, maxHcpBin)) * 180;  // max 180px da altura
            const mHeight = (m / Math.max(1, total)) * barHeight;
            const fHeight = barHeight - mHeight;
            const isActive = hcpBinDrill === bin;
            return (
              <button
                key={bin}
                onClick={() => onHcpBinDrill(isActive ? null : bin)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", background: isActive ? "var(--bg-hover)" : "transparent", border: isActive ? "1px solid var(--accent)" : "1px solid transparent", borderRadius: 4, padding: 2, cursor: "pointer", minWidth: 0 }}
                title={`Clica para ver top 15 (HCP ${label})`}
              >
                <div className="fw-700 fs-12" style={{ marginBottom: 4 }}>
                  {total.toLocaleString("pt-PT")}
                </div>
                <div className="muted fs-10" style={{ marginBottom: 4 }}>{((total / stats.withHcp) * 100).toFixed(1)}%</div>
                <div style={{ width: "85%", minWidth: 20, display: "flex", flexDirection: "column", borderRadius: "4px 4px 0 0", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                  {f > 0 && <div title={`${f} Feminino`} style={{ height: fHeight, background: COL_F, minHeight: f > 0 ? 2 : 0 }} />}
                  {m > 0 && <div title={`${m} Masculino`} style={{ height: mHeight, background: COL_M, minHeight: m > 0 ? 2 : 0 }} />}
                </div>
                <div className="fw-600 fs-11" style={{ marginTop: 6, textAlign: "center" }}>{label}</div>
                <div className="fs-10" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, marginTop: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" /><span className="fw-600">{m.toLocaleString("pt-PT")}</span></span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" /><span className="fw-600">{f.toLocaleString("pt-PT")}</span></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drill-down de HCP bin — top 15 jogadores do bin seleccionado */}
      {hcpBinDrill && federados && (
        <HcpBinDrillCard
          bin={hcpBinDrill}
          federados={federados}
          onClose={() => onHcpBinDrill(null)}
          onPickPlayer={onPickPlayer}
        />
      )}

      {/* 2 colunas: Top scratch + Novos federados por ano */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Top 15 melhores HCPs */}
        <div className="card" style={{ padding: 12 }}>
          <div className="fw-700 fs-14 mb-8">🏆 Top 15 melhores HCPs</div>
          {stats.topBestHcp.map((p, i) => (
            <button
              key={p.federation_code}
              className="course-item"
              onClick={() => onPickPlayer(p.federation_code)}
              style={{ width: "100%", padding: "4px 6px", marginBottom: 2, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <span className="fw-700" style={{ width: 22, textAlign: "center", fontSize: 11 }}>{i + 1}</span>
              <span className="fw-600" style={{ flex: 1, textAlign: "left", fontSize: 12 }}>
                {p.country_prefix && p.country_prefix !== "PT" && !p.country_prefix.startsWith("@") && <span className="mr-4">{gf(p.country_prefix)}</span>}
                {p.name}
                <span className="muted fs-10 ml-4">({p.acronym})</span>
              </span>
              <span className="fw-900" style={{ fontSize: 14, color: (p.hcp_exact as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
                {(p.hcp_exact as number).toFixed(1)}
              </span>
            </button>
          ))}
        </div>

        {/* Novos federados por ano — stacked M/F */}
        <div className="card" style={{ padding: 12 }}>
          <div className="fw-700 fs-14 mb-8">Novos federados por ano · <span className="muted fs-10">stacked M/F</span></div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.admissionYears.length}, 1fr)`, gap: 2, alignItems: "end", height: 140 }}>
            {stats.admissionYears.map(([y, v]) => {
              const total = v.m + v.f;
              const barHeight = (total / Math.max(1, maxAdm)) * 110;
              const mHeight = (v.m / Math.max(1, total)) * barHeight;
              const fHeight = barHeight - mHeight;
              return (
                <div key={y} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  <div className="fs-10 fw-600" title={`${v.m} M + ${v.f} F`}>{total}</div>
                  <div style={{ width: "90%", display: "flex", flexDirection: "column", borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                    {v.f > 0 && <div style={{ height: fHeight, background: COL_F }} />}
                    {v.m > 0 && <div style={{ height: mHeight, background: COL_M }} />}
                  </div>
                  <div className="fs-10 muted" style={{ marginTop: 3 }}>{y.slice(2)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2 colunas: Escalões e Países */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Por escalão (clicável) — stacked M/F */}
        <div className="card" style={{ padding: 12 }}>
          <div className="fw-700 fs-14 mb-8">Por escalão · <span className="muted fs-10">clica para detalhe</span></div>
          {sortedAges.map(([k, v]) => {
            const total = v.m + v.f;
            const mPct = total > 0 ? (v.m / total) * 100 : 0;
            return (
              <button
                key={k}
                onClick={() => onDrillDown({ type: "age", key: k })}
                style={{ width: "100%", padding: "4px 0", marginBottom: 4, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500 }}>
                  <span>{k}</span>
                  <span>
                    <span className="fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
                      <SexBadge sex="M" />{v.m} <SexBadge sex="F" />{v.f} ·
                    </span>
                    <span className="fw-700">{total.toLocaleString("pt-PT")}</span>
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 3, overflow: "hidden", display: "flex", background: "var(--bg-subtle)" }}>
                  <div style={{ width: pct(total, maxAge), height: "100%", display: "flex" }}>
                    <div style={{ width: `${mPct}%`, background: COL_M }} />
                    <div style={{ width: `${100 - mPct}%`, background: COL_F }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Por país — M/F split */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="fw-700 fs-14">Top 25 países</div>
            <div style={{ display: "flex", gap: 10, fontSize: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" /> M</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" /> F</span>
            </div>
          </div>
          {stats.topCountries.map(c => {
            const mPct = c.count > 0 ? (c.m / c.count) * 100 : 0;
            return (
              <div key={c.cp} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, alignItems: "center", gap: 6 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.cp && !c.cp.startsWith("@") ? gf(c.cp) : "🏴"} <span className="fw-600">{c.name}</span> <span className="muted fs-10">({c.cp})</span>
                  </span>
                  <span className="muted fs-10" style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap" }}>
                    <span style={{ color: COL_M, fontWeight: 600 }}>{c.m}</span>·
                    <span style={{ color: COL_F, fontWeight: 600 }}>{c.f}</span>
                  </span>
                  <span className="fw-700" style={{ minWidth: 40, textAlign: "right" }}>{c.count.toLocaleString("pt-PT")}</span>
                </div>
                <div style={{ height: 6, background: "var(--bg-subtle)", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                  <div style={{ width: pct(c.count, maxCountry), height: "100%", display: "flex" }}>
                    <div style={{ width: `${mPct}%`, background: COL_M }} />
                    <div style={{ width: `${100 - mPct}%`, background: COL_F }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Todos os clubes — tabela sortable com stacked M/F */}
      <ClubsTable stats={stats} onDrillDown={onDrillDown} maxClub={maxClub} pct={pct} COL_M={COL_M} COL_F={COL_F} />
    </div>
  );
}

function KpiCard({ label, value, pct, big, sub }: { label: React.ReactNode; value: number; pct?: number; big?: boolean; sub?: string }) {
  return (
    <div className="card" style={{ padding: 10, textAlign: "center" }}>
      <div className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}</div>
      <div className="fw-900" style={{ fontSize: big ? 28 : 22 }}>{value.toLocaleString("pt-PT")}</div>
      {pct != null && <div className="muted fs-10">{(pct * 100).toFixed(1)}%</div>}
      {sub && <div className="muted fs-10">{sub}</div>}
    </div>
  );
}

/* ── Drill-down: detalhe de um clube ou escalão ──────────────── */
/* ── Drill-down de um bin de HCP — top 15 jogadores nesse range ── */
function HcpBinDrillCard({ bin, federados, onClose, onPickPlayer }: {
  bin: string;
  federados: FederadoRaw[];
  onClose: () => void;
  onPickPlayer: (fed: string) => void;
}) {
  const binRange: { min: number; max: number; label: string } = (() => {
    if (bin === "plus") return { min: -Infinity, max: 0, label: "Scratch ou melhor (HCP ≤ 0)" };
    if (bin === "0-5")  return { min: 0, max: 5, label: "HCP 0 a 4.9" };
    if (bin === "5-10") return { min: 5, max: 10, label: "HCP 5 a 9.9" };
    if (bin === "10-15") return { min: 10, max: 15, label: "HCP 10 a 14.9" };
    if (bin === "15-20") return { min: 15, max: 20, label: "HCP 15 a 19.9" };
    if (bin === "20-30") return { min: 20, max: 30, label: "HCP 20 a 29.9" };
    return { min: 30, max: Infinity, label: "HCP 30+" };
  })();

  const inBin = federados.filter(f =>
    f.hcp_exact != null &&
    f.hcp_exact !== 99 &&
    f.hcp_exact >= binRange.min &&
    f.hcp_exact < binRange.max
  );
  const top = inBin
    .sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number))
    .slice(0, 15);
  const male = inBin.filter(f => f.gender === "M").length;
  const female = inBin.filter(f => f.gender === "F").length;

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 16,
      border: "2px solid var(--accent)",
      background: "var(--bg-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div className="fw-900 fs-14">🎯 {binRange.label}</div>
          <div className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            {inBin.length.toLocaleString("pt-PT")} jogadores ·
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" />{male}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" />{female}</span>
          </div>
        </div>
        <button className="p p-sm" onClick={onClose} title="Fechar">✕</button>
      </div>
      <div className="fw-700 fs-12 mb-4">Top 15 (ordenados por HCP)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 4 }}>
        {top.map((p, i) => (
          <button
            key={p.federation_code}
            className="course-item"
            onClick={() => onPickPlayer(p.federation_code)}
            style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
          >
            <span className="fw-700 muted" style={{ width: 22, fontSize: 11 }}>{i + 1}</span>
            <SexBadge sex={p.gender as "M" | "F"} />
            <span style={{ flex: 1, fontSize: 12 }}>
              {p.country_prefix && p.country_prefix !== "PT" && !p.country_prefix.startsWith("@") && <span className="mr-4">{gf(p.country_prefix)}</span>}
              <span className="fw-600">{p.name}</span>
              <span className="muted fs-10 ml-4">({p.acronym})</span>
            </span>
            <span className="fw-900" style={{ fontSize: 13, color: (p.hcp_exact as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
              {(p.hcp_exact as number).toFixed(1)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DrillDownCard({ drillDown, stats, onClose, onPickPlayer }: {
  drillDown: { type: "club" | "age"; key: string };
  stats: GlobalStats;
  onClose: () => void;
  onPickPlayer: (fed: string) => void;
}) {
  const members: FederadoRaw[] = drillDown.type === "club"
    ? (stats.allClubs.find(([code]) => code === drillDown.key)?.[1].members || [])
    : (stats.byAgeFull[drillDown.key] || []);
  const title = drillDown.type === "club"
    ? (stats.allClubs.find(([code]) => code === drillDown.key)?.[1].name || drillDown.key)
    : drillDown.key;

  // Agregações locais
  let male = 0, female = 0, withHcp = 0, totalHcp = 0, active = 0, pros = 0;
  const byAge: Record<string, number> = {};
  const byClub: Record<string, { name: string; count: number }> = {};
  const byCountry: Record<string, number> = {};
  for (const f of members) {
    if (f.gender === "M") male++; else if (f.gender === "F") female++;
    if (f.hcp_exact != null) { withHcp++; totalHcp += f.hcp_exact; }
    if ((f.rounds_current_year || 0) > 0) active++;
    if (f.player_type_id === 2) pros++;
    if (drillDown.type === "club") byAge[f.age_level] = (byAge[f.age_level] || 0) + 1;
    if (drillDown.type === "age") {
      const k = f.club_code || "?";
      if (byClub[k]) byClub[k].count++;
      else byClub[k] = { name: f.acronym || f.club_name || "?", count: 1 };
    }
    byCountry[f.country_prefix || "?"] = (byCountry[f.country_prefix || "?"] || 0) + 1;
  }
  const avgHcp = withHcp > 0 ? totalHcp / withHcp : 0;
  const best = [...members].filter(f => f.hcp_exact != null).sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number)).slice(0, 10);
  const topClubsDrill = drillDown.type === "age"
    ? Object.entries(byClub).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    : [];
  const topCountriesDrill = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sortedAges = Object.entries(byAge).sort((a, b) => b[1] - a[1]);

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 16,
      border: "2px solid var(--accent)",
      background: "var(--bg-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="fw-900 fs-14">
          {drillDown.type === "club" ? "🏌️ Clube" : "🎯 Escalão"}: {title}
        </div>
        <button className="p p-sm" onClick={onClose} title="Fechar drill-down">✕</button>
      </div>

      {/* KPIs do drill */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 12 }}>
        <KpiCard label="Total" value={members.length} big />
        <KpiCard label={<SexBadge sex="M" />} value={male} pct={male / members.length} />
        <KpiCard label={<SexBadge sex="F" />} value={female} pct={female / members.length} />
        <KpiCard label="Com HCP" value={withHcp} sub={`média ${avgHcp.toFixed(1)}`} />
        <KpiCard label="Activos 2026" value={active} pct={active / members.length} />
        {pros > 0 && <KpiCard label="Pros" value={pros} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {/* Top HCPs */}
        <div>
          <div className="fw-700 fs-14 mb-4">🏆 Top 10 HCPs</div>
          {best.map((p, i) => (
            <button
              key={p.federation_code}
              className="course-item"
              onClick={() => onPickPlayer(p.federation_code)}
              style={{ width: "100%", padding: "3px 6px", marginBottom: 2, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <span className="fw-700" style={{ width: 18, fontSize: 11 }}>{i + 1}</span>
              <span style={{ flex: 1, textAlign: "left", fontSize: 12 }}>{p.name}</span>
              <span className="fw-900" style={{ fontSize: 13, color: (p.hcp_exact as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
                {(p.hcp_exact as number).toFixed(1)}
              </span>
            </button>
          ))}
        </div>

        {/* Só se for clube: distribuição por escalão */}
        {drillDown.type === "club" && sortedAges.length > 0 && (
          <div>
            <div className="fw-700 fs-14 mb-4">Por escalão</div>
            {sortedAges.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                <span>{k}</span><span className="fw-700">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Só se for escalão: top clubes */}
        {drillDown.type === "age" && topClubsDrill.length > 0 && (
          <div>
            <div className="fw-700 fs-14 mb-4">Top clubes</div>
            {topClubsDrill.map(([code, c]) => (
              <div key={code} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                <span>{c.name}</span><span className="fw-700">{c.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top países (sempre) */}
        {topCountriesDrill.length > 1 && (
          <div>
            <div className="fw-700 fs-14 mb-4">Por país</div>
            {topCountriesDrill.map(([cp, n]) => (
              <div key={cp} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                <span>{cp && !cp.startsWith("@") ? gf(cp) : "🏴"} {cp}</span><span className="fw-700">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   FederadoRoundsTable — tabela rica de rondas WHS (usada em FederadoOnlyDetail e vista federado)
   Replica o estilo da ByDateView com pills, sorting, separadores por ano, etc.
   ──────────────────────────────────────────────────────────────────────────────────────── */

/** Info extra de cada ronda extraída do ScoreCard (tee, gross, CR, slope). */
type RoundExtra = { tee: string; gross: number | null; cr: number | null; slope: number | null };

type FRTSortKey = "date" | "event" | "course" | "holes" | "hcp" | "tee" | "gross" | "stb" | "sd" | "origin" | "par";

function FederadoRoundsTable({ rounds, hcpRef, onOpenScorecard, extraMap, localIds }: {
  rounds: WhsRound[];
  hcpRef: number | null;
  onOpenScorecard: (r: WhsRound) => void;
  /** Mapa scoreId → info extra (tee, gross) preenchido async pelo parent */
  extraMap?: Map<number, RoundExtra>;
  /** Set de scoreIds que existem nos nossos dados locais (para comparação) */
  localIds?: Set<number>;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<FRTSortKey>("date", "desc", {
    sd: "asc", hcp: "asc", stb: "desc", holes: "desc", par: "asc", gross: "asc",
  });

  const sorted = useMemo(() => {
    const arr = [...rounds];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va: unknown, vb: unknown;
      switch (sortKey) {
        case "date":   va = a.score_dateStr; vb = b.score_dateStr; break;
        case "event":  va = a.tournament_description; vb = b.tournament_description; break;
        case "course": va = a.course_description; vb = b.course_description; break;
        case "holes":  va = a.hole_count; vb = b.hole_count; break;
        case "hcp":    va = a.calc_hcp_index ?? a.calculated_exact_hcp; vb = b.calc_hcp_index ?? b.calculated_exact_hcp; break;
        case "par":    va = a.par_total; vb = b.par_total; break;
        case "tee":    va = extraMap?.get(a.id)?.tee ?? ""; vb = extraMap?.get(b.id)?.tee ?? ""; break;
        case "gross":  va = extraMap?.get(a.id)?.gross ?? 999; vb = extraMap?.get(b.id)?.gross ?? 999; break;
        case "stb":    va = a.calculated_stablnet_total; vb = b.calculated_stablnet_total; break;
        case "sd":     va = a.score_differential; vb = b.score_differential; break;
        case "origin": va = a.score_origin; vb = b.score_origin; break;
        default:       va = a.score_dateStr; vb = b.score_dateStr;
      }
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
    return arr;
  }, [rounds, sortKey, sortDir]);

  const hasExtra = extraMap && extraMap.size > 0;
  // Ordem: Data | Campo | Prova | Bur. | HCP | Tee? | Par | Gross? | Stb | SD | Tipo
  const COLS = 9 + (hasExtra ? 2 : 0);
  let lastYear = "";

  // Contagem de rondas que NÃO temos em local
  // Ignorar registos administrativos (ajustes de HCP) que têm id=0/null/undefined — não são rondas jogadas
  const missingCount = localIds && localIds.size > 0
    ? rounds.filter(r => r.id && !localIds.has(r.id)).length
    : 0;

  return (
    <div style={{ maxHeight: 600, overflowY: "auto" }}>
      {localIds && localIds.size > 0 && missingCount > 0 && (
        <div className="p p-sm" style={{ marginBottom: 8, display: "inline-block" }}>
          {missingCount} ronda{missingCount !== 1 ? "s" : ""} na FPG que não temos em local
        </div>
      )}
      <table className="dtable-lg">
        <thead>
          <tr>
            <SortableHdr k="date"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="course" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
            <SortableHdr k="event"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Prova</SortableHdr>
            <SortableHdr k="holes"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Bur.</SortableHdr>
            <SortableHdr k="hcp"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">HCP</SortableHdr>
            {hasExtra && <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tee</SortableHdr>}
            <SortableHdr k="par"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Par</SortableHdr>
            {hasExtra && <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>}
            <SortableHdr k="stb"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Stb</SortableHdr>
            <SortableHdr k="sd"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD</SortableHdr>
            <SortableHdr k="origin" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tipo</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 200).map(r => {
            const dateStr = (r.score_dateStr || "").slice(0, 10);
            const year = dateStr.slice(0, 4);
            const showYearBar = sortKey === "date" && year !== lastYear;
            if (showYearBar) lastYear = year;

            // Data sem ano: DD-MM
            const shortDate = dateStr.slice(8, 10) + "-" + dateStr.slice(5, 7);

            const sdNum = r.score_differential != null ? Number(r.score_differential) : NaN;
            const hiRef = r.calc_hcp_index ?? r.calculated_exact_hcp ?? hcpRef ?? null;
            const sdCls = isFinite(sdNum) && hiRef != null ? sdClassByHcp(sdNum, Number(hiRef)) : "";

            const originKey = (r.score_origin || "").trim().toUpperCase();
            const isIntl = originKey === "INTERN";
            const tournName = r.tournament_description || "";
            const isRegional = !isIntl && /regional/i.test(tournName);
            const isNacional = !isIntl && !isRegional && /nacional/i.test(tournName);
            const extra = extraMap?.get(r.id);

            // Indicador visual se a ronda não existe nos nossos dados locais
            // Ignorar registos admin (id=0/null) — ajustes de HCP, não rondas jogadas
            const isMissing = r.id && localIds && localIds.size > 0 && !localIds.has(r.id);

            return (
              <React.Fragment key={r.id}>
                {showYearBar && (
                  <tr>
                    <td colSpan={COLS} style={{ padding: 0, background: "transparent", borderBottom: "2px solid var(--border)" }}>
                      <div className="year-label">{year}</div>
                    </td>
                  </tr>
                )}
                <tr
                  style={{ cursor: "pointer" }}
                  title={isMissing ? "Ronda que não temos em local — clicar para ver scorecard" : "Clicar para ver scorecard hole-by-hole"}
                  onClick={() => onOpenScorecard(r)}
                >
                  <td className="fw-600">
                    {shortDate}
                    {isMissing && <span style={{ marginLeft: 4, color: "var(--color-warn-vivid)", fontSize: 10 }} title="Não temos esta ronda em local">●</span>}
                  </td>
                  <td className="muted">{r.course_description}</td>
                  <td>
                    <span className="muted">{r.tournament_description}</span>
                    <OriginPill origin={r.score_origin} />
                    {isIntl && <PillBadge pill="INTL" />}
                    {isRegional && <PillBadge pill="REGIONAL" />}
                    {isNacional && <PillBadge pill="NACIONAL" />}
                  </td>
                  <td className="r"><HoleBadge hc={r.hole_count} /></td>
                  <td className="r fw-700">{r.calc_hcp_index ?? r.calculated_exact_hcp ?? ""}</td>
                  {hasExtra && (
                    <td>{extra?.tee ? <TeePill name={extra.tee} /> : <span className="muted fs-10">…</span>}</td>
                  )}
                  <td className="r muted">{r.par_total ?? ""}</td>
                  {hasExtra && (
                    <td className="r">
                      {extra?.gross != null ? (
                        <><b>{extra.gross}</b>{r.par_total != null && extra.gross !== r.par_total && (
                          <span className={`score-delta ${toParClass(extra.gross - r.par_total)}`}>
                            {fmtToPar(extra.gross - r.par_total)}
                          </span>
                        )}</>
                      ) : <span className="muted fs-10">…</span>}
                    </td>
                  )}
                  <td className="r">{r.calculated_stablnet_total ?? ""}</td>
                  <td className="r">
                    {isFinite(sdNum)
                      ? <span className={sdCls ? `p p-sm p-${sdCls}` : ""}>{r.score_differential}</span>
                      : (r.score_differential ?? "")}
                  </td>
                  <td>
                    {originKey === "TORN" ? <span className="muted fs-10">Torneio</span>
                      : originKey === "INTERN" ? <span className="muted fs-10">Internacional</span>
                      : originKey === "EDS" ? <span className="p p-sm p-origin p-eds">EDS</span>
                      : originKey === "INDIV" ? <span className="p p-sm p-origin p-indiv">INDIV</span>
                      : originKey === "TREINO" ? <span className="p p-sm p-origin p-treino">TREINO</span>
                      : originKey === "EXTRA" ? <span className="p p-sm p-origin p-extra">EXTRA</span>
                      : originKey === "IMPORT" ? <span className="p p-sm p-origin p-import">IMPORT</span>
                      : <span className="muted fs-10">{r.score_origin}</span>}
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {rounds.length > 200 && (
        <div className="muted fs-10 ta-c p-4">A mostrar 200 de {rounds.length} rondas</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   FederadoOnlyDetail — stub para jogadores que só existem em federados.json
   (cadastro FPG sem análise de scorecards)
   ──────────────────────────────────────────────────────────────────────────────────────── */
function FederadoOnlyDetail({ player }: { player: MergedPlayer & { fed: string } }) {
  const f = player._federadoRaw;
  if (!f) return <EmptyState message="Sem dados disponíveis" />;
  const showFlag = f.country_prefix && f.country_prefix !== "PT" && !f.country_prefix.startsWith("@");

  /* ── Rondas em tempo real via /api/datagolf ── */
  const [liveRounds, setLiveRounds] = useState<WhsRound[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  /* ── Modal de scorecard detalhado ── */
  const [scorecardModal, setScorecardModal] = useState<{ round: WhsRound; data: Scorecard | null; loading: boolean; error: string | null } | null>(null);

  const openScorecard = async (round: WhsRound) => {
    setScorecardModal({ round, data: null, loading: true, error: null });
    try {
      const arr = await getScorecard(round.id, round.scoring_type_id ?? 1, round.competition_type_id ?? 10);
      const data = Array.isArray(arr) ? arr[0] : arr;
      setScorecardModal(prev => prev && prev.round.id === round.id ? { ...prev, data: data || null, loading: false } : prev);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      setScorecardModal(prev => prev && prev.round.id === round.id ? { ...prev, loading: false, error: msg } : prev);
    }
  };

  /* ── Enriquecimento: tee/gross por ronda (batch-fetch de scorecards) ── */
  const [extraMap, setExtraMap] = useState<Map<number, RoundExtra>>(new Map());

  /* ── Comparação com dados locais (scoreIds que já temos em ficheiro) ── */
  const [localIds, setLocalIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoadingLive(true);
    setLiveError(null);
    setLiveRounds(null);
    setExtraMap(new Map());
    getPlayerHistory(f.federation_code)
      .then(rounds => { if (!cancelled) setLiveRounds(rounds); })
      .catch(err => { if (!cancelled) setLiveError(String(err?.message || err)); })
      .finally(() => { if (!cancelled) setLoadingLive(false); });
    return () => { cancelled = true; };
  }, [f.federation_code]);

  /* Batch-fetch scorecards para extrair tee + gross (concurrency ~3) */
  useEffect(() => {
    if (!liveRounds || liveRounds.length === 0) return;
    let cancelled = false;
    const map = new Map<number, RoundExtra>();
    const queue = [...liveRounds];
    let running = 0;
    const CONC = 3;

    function flush() {
      if (cancelled) return;
      setExtraMap(new Map(map));
    }
    async function next(): Promise<void> {
      while (queue.length > 0 && !cancelled) {
        const r = queue.shift()!;
        running++;
        try {
          const arr = await getScorecard(r.id, r.scoring_type_id ?? 1, r.competition_type_id ?? 10);
          const sc = Array.isArray(arr) ? arr[0] : arr;
          if (sc && !cancelled) {
            map.set(r.id, {
              tee: sc.tee_name || "",
              gross: typeof sc.gross_total === "number" ? sc.gross_total : null,
              cr: typeof sc.course_rating === "number" ? sc.course_rating : null,
              slope: typeof sc.slope === "number" ? sc.slope : null,
            });
            // Flush progressively every 5 scorecards
            if (map.size % 5 === 0) flush();
          }
        } catch { /* silently skip failed scorecards */ }
        running--;
      }
      if (running === 0) flush();
    }
    // Launch CONC parallel workers
    for (let i = 0; i < CONC; i++) next();
    return () => { cancelled = true; };
  }, [liveRounds]);

  /* Load local data scoreIds for comparison */
  useEffect(() => {
    let cancelled = false;
    setLocalIds(new Set());
    const fed = f.federation_code;
    if (!fed) return;
    (async () => {
      try {
        const resp = await fetch(`/${fed}/analysis/data.json`);
        if (!resp.ok) return;
        const json = await resp.json();
        // HOLES keys are scoreId strings; DATA[].rounds[].scoreId too
        const ids = new Set<number>();
        if (json.HOLES) {
          for (const k of Object.keys(json.HOLES)) {
            const n = Number(k);
            if (isFinite(n)) ids.add(n);
          }
        }
        if (!cancelled && ids.size > 0) setLocalIds(ids);
      } catch { /* no local data available — OK */ }
    })();
    return () => { cancelled = true; };
  }, [f.federation_code]);

  return (
    <div className="p-16">
      {/* Header com foto grande ao lado */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
        {f.photo && (
          <img src={`https://hcp-portugal.datagolf.pt/photos/${f.photo}`}
            alt={f.name}
            style={{ width: 200, maxHeight: 260, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DetailHeader
            title={
              <>
                {showFlag && <span className="mr-8">{gf(f.country_prefix)}</span>}
                {f.name}
                <a
                  href={`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${f.federation_code}`}
                  target="_blank" rel="noopener noreferrer"
                  title="Ver ficha WHS no FPG Scoring"
                  style={{ marginLeft: 8, fontSize: 14, color: "var(--chart-2)", textDecoration: "none", verticalAlign: "middle" }}
                  onClick={e => e.stopPropagation()}
                >🔗</a>
                <a
                  href={`https://my.fpg.pt/Home/PlayerWHS.aspx?no=${f.federation_code}`}
                  target="_blank" rel="noopener noreferrer"
                  title="Ver ficha WHS no My FPG"
                  style={{ marginLeft: 4, fontSize: 14, color: "var(--chart-2)", textDecoration: "none", verticalAlign: "middle" }}
                  onClick={e => e.stopPropagation()}
                >🔗</a>
              </>
            }
            sub={<span className="muted">#{f.federation_code} · Só cadastro FPG (sem scorecards detalhados)</span>}
          />
        </div>
      </div>
      {(() => {
        const fRec = f as Record<string, unknown>;
        const fKeys = new Set(Object.keys(fRec));
        // Campos já cobertos pelas secções + bloco técnico
        const covered = new Set<string>([
          ...FEDERADO_SECTIONS.flatMap(s => s.fields),
          ...FEDERADO_TECHNICAL_FIELDS,
        ]);
        // Campos "soltos" — apareceram no JSON mas não estão mapeados em nenhum lado
        const extraFields = Object.keys(fRec).filter(k => !covered.has(k));
        const visibleCount =
          FEDERADO_SECTIONS.reduce((n, s) => n + s.fields.filter(k => fKeys.has(k)).length, 0) +
          extraFields.length;
        const technicalCount = FEDERADO_TECHNICAL_FIELDS.filter(k => fKeys.has(k)).length;

        // Detecta divergência entre HCP Exacto e HCP Index (raro mas possível)
        const hcpExact = fRec.hcp_exact;
        const hcpIndex = fRec.hcp_index;
        const hcpDiverges =
          hcpExact != null && hcpIndex != null &&
          typeof hcpExact === "number" && typeof hcpIndex === "number" &&
          Math.abs(hcpExact - hcpIndex) > 0.05;

        const renderKV = (k: string) => {
          const label = FEDERADO_FIELD_LABELS[k] || k;
          const raw = fRec[k];
          let value = formatFedValue(k, raw);
          // Aviso inline quando hcp_exact e hcp_index divergem
          if (k === "hcp_index" && hcpDiverges) {
            value = (
              <>
                {value}
                <span
                  className="p p-sm"
                  title={`Divergência: HCP Exacto=${hcpExact}, HCP Index=${hcpIndex}. Normalmente são iguais — investigar.`}
                  style={{ background: "var(--color-warn)", color: "#fff", borderColor: "transparent" }}
                >⚠ ≠ exacto</span>
              </>
            );
          }
          return <KV key={k} label={label} value={value} description={FEDERADO_FIELD_DESCRIPTIONS[k]} />;
        };

        return (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="h-md fs-14 mb-8" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Cadastro FPG</span>
              <span className="muted fs-10" style={{ fontWeight: 400 }}>
                {visibleCount} campos visíveis{technicalCount > 0 ? ` · ${technicalCount} técnicos ocultos` : ""}
              </span>
            </div>

            {/* Secções principais */}
            {FEDERADO_SECTIONS.map(sec => {
              const keys = sec.fields.filter(k => fKeys.has(k));
              if (keys.length === 0) return null;
              return (
                <div key={sec.title} style={{ marginBottom: 14 }}>
                  <div
                    className="muted"
                    style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
                      textTransform: "uppercase", marginBottom: 6,
                      borderBottom: "1px solid var(--border)", paddingBottom: 3,
                    }}
                  >{sec.title}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                    {keys.map(renderKV)}
                  </div>
                </div>
              );
            })}

            {/* Campos extra não mapeados (caso futuro em que o JSON ganhe campos novos) */}
            {extraFields.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div
                  className="muted"
                  style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
                    textTransform: "uppercase", marginBottom: 6,
                    borderBottom: "1px solid var(--border)", paddingBottom: 3,
                  }}
                >Outros</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {extraFields.map(renderKV)}
                </div>
              </div>
            )}

            {/* Campos técnicos — colapsados por defeito */}
            {technicalCount > 0 && (
              <details style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <summary
                  className="muted"
                  style={{
                    cursor: "pointer", fontSize: 11, fontWeight: 600,
                    letterSpacing: "0.03em", userSelect: "none",
                  }}
                  title="IDs internos, tokens e campos redundantes — úteis para debug."
                >
                  ⚙ Campos técnicos ({technicalCount}) <span style={{ opacity: 0.6, fontWeight: 400 }}>— IDs, tokens e redundâncias</span>
                </summary>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginTop: 8 }}>
                  {FEDERADO_TECHNICAL_FIELDS.filter(k => fKeys.has(k)).map(renderKV)}
                </div>
              </details>
            )}
          </div>
        );
      })()}
      {/* KPIs de actividade — calculados a partir das rondas WHS */}
      {liveRounds && liveRounds.length > 0 && (() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const prevYear = currentYear - 1;
        const year = (r: WhsRound) => {
          const d = (r.score_dateStr || "").slice(0, 4);
          const y = parseInt(d, 10);
          return isFinite(y) ? y : null;
        };
        const inYear = (y: number) => liveRounds.filter(r => year(r) === y);
        const thisYearRounds = inYear(currentYear);
        const prevYearRounds = inYear(prevYear);
        const last90Days = liveRounds.filter(r => {
          const d = new Date((r.score_dateStr || "").slice(0, 10));
          if (!isFinite(d.getTime())) return false;
          return (now.getTime() - d.getTime()) / 86400000 <= 90;
        });
        const sds = liveRounds.filter(r => r.score_differential != null).map(r => Number(r.score_differential)).filter(n => isFinite(n));
        const bestSD = sds.length ? Math.min(...sds) : null;
        const avgSD = sds.length ? sds.reduce((a, b) => a + b, 0) / sds.length : null;
        const tornRounds = liveRounds.filter(r => /torn/i.test(String(r.score_origin || "")));
        const lastDate = liveRounds[0]?.score_dateStr?.slice(0, 10) || null;
        const kpi = (label: string, value: React.ReactNode, sub?: string) => (
          <div className="kpi-card">
            <div className="kpi-card-label">{label}</div>
            <div className="kpi-card-val">{value}</div>
            {sub && <div className="kpi-card-sub">{sub}</div>}
          </div>
        );
        return (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="h-md fs-14 mb-8">Actividade</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
              {kpi(`Rondas ${currentYear}`, thisYearRounds.length, prevYearRounds.length > 0 ? `vs ${prevYearRounds.length} em ${prevYear}` : undefined)}
              {kpi(`Rondas ${prevYear}`, prevYearRounds.length)}
              {kpi("Últimos 90 dias", last90Days.length)}
              {kpi("Torneios", tornRounds.length, `${liveRounds.length} total`)}
              {kpi("Melhor SD", bestSD != null ? bestSD.toFixed(1) : "—")}
              {kpi("Média SD", avgSD != null ? avgSD.toFixed(1) : "—")}
              {lastDate && kpi("Última ronda", lastDate)}
            </div>
          </div>
        );
      })()}

      {/* Rondas em tempo real via /api/datagolf */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="h-md fs-14">Rondas WHS
            {liveRounds && <span className="muted fs-10 ml-8">({liveRounds.length} rondas · via scoring.datagolf.pt)</span>}
          </div>
          {loadingLive && <span className="muted fs-10">⏳ A carregar…</span>}
          {liveError && (
            <div className="fs-10" style={{ color: "var(--color-warn-vivid)", textAlign: "right", maxWidth: "70%" }}>
              <div style={{ fontWeight: 600 }}>⚠ Não foi possível carregar rondas em tempo real</div>
              <details style={{ marginTop: 4, opacity: 0.85 }}>
                <summary style={{ cursor: "pointer" }}>Ver detalhes do erro</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 10, marginTop: 4, textAlign: "left" }}>{liveError}</pre>
              </details>
            </div>
          )}
        </div>
        {liveError && !loadingLive && !liveRounds && (
          <div className="muted fs-11" style={{ padding: "8px 0" }}>
            Dados de cadastro acima. As rondas WHS podem ser consultadas diretamente no site da FPG.
          </div>
        )}
        {liveRounds && liveRounds.length > 0 && <FederadoRoundsTable rounds={liveRounds} hcpRef={player.hcp} onOpenScorecard={openScorecard} extraMap={extraMap} localIds={localIds} />}
        {liveRounds && liveRounds.length === 0 && (
          <div className="muted fs-10 ta-c">Sem rondas registadas no WHS</div>
        )}
      </div>

      {/* Modal de scorecard detalhado */}
      {scorecardModal && (
        <div
          onClick={() => setScorecardModal(null)}
          style={{ position: "fixed", inset: 0, background: "var(--overlay-black-50)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: 20, maxWidth: 900, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px var(--overlay-black-30)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div className="h-md fs-14 fw-700">{scorecardModal.round.tournament_description || "Scorecard"}</div>
                <div className="muted fs-11">{scorecardModal.round.course_description} · {(scorecardModal.round.score_dateStr || "").slice(0, 10)}</div>
              </div>
              <button
                onClick={() => setScorecardModal(null)}
                style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", padding: 4 }}
                title="Fechar"
              >✕</button>
            </div>
            {/* Nota se a ronda foi rotacionada (Aroeira No.2 config antiga) */}
            <RotatedNotice rotated={(scorecardModal.data as { _rotated?: number } | null)?._rotated} />
            {/* Nota geral para campos Aroeira (mesmo se esta ronda específica não foi rotacionada) */}
            <AroeiraNotice
              courseName={canonicalCourseName(scorecardModal.round.course_description || "") || ""}
              rotatedCount={(scorecardModal.data as { _rotated?: number } | null)?._rotated ? 1 : 0}
              totalRounds={1}
            />

            {scorecardModal.loading && <div className="muted p-16 ta-c">⏳ A carregar scorecard…</div>}
            {scorecardModal.error && (
              <div className="p-16" style={{ color: "var(--color-warn-vivid)" }}>
                ⚠ Erro a carregar: <code>{scorecardModal.error}</code>
              </div>
            )}
            {scorecardModal.data && (() => {
              const sc = scorecardModal.data as unknown as Record<string, number | string | null | undefined>;
              const nh = Number(sc.nholes || sc.hole_count || 18);
              const is9 = nh === 9;
              const gross = (h: number) => { const v = sc[`gross_${h}`]; return v != null ? Number(v) : 0; };
              const pars  = (h: number) => { const v = sc[`par_${h}`];   return v != null ? Number(v) : 0; };
              const sis   = (h: number) => { const v = sc[`stroke_index_${h}`]; return v != null ? Number(v) : 0; };
              const f9Gross = Array.from({length: 9}, (_, i) => gross(i + 1)).reduce((a, b) => a + b, 0);
              const f9Par   = Array.from({length: 9}, (_, i) => pars(i + 1)).reduce((a, b) => a + b, 0);
              const b9Gross = !is9 ? Array.from({length: 9}, (_, i) => gross(i + 10)).reduce((a, b) => a + b, 0) : 0;
              const b9Par   = !is9 ? Array.from({length: 9}, (_, i) => pars(i + 10)).reduce((a, b) => a + b, 0) : 0;
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16, fontSize: 12 }}>
                    <div><span className="muted">Par total:</span> <b>{sc.par_total ?? "—"}</b></div>
                    <div><span className="muted">Gross:</span> <b>{sc.gross_total ?? "—"}</b></div>
                    <div><span className="muted">Stableford:</span> <b>{(sc as Record<string, number | undefined>).stableford ?? (sc as Record<string, number | undefined>).calculated_stablnet_total ?? "—"}</b></div>
                    <div><span className="muted">Tees:</span> <b>{sc.tee_name || "—"}</b></div>
                    <div><span className="muted">CR/Slope:</span> <b>{sc.course_rating ?? "—"}/{sc.slope ?? "—"}</b></div>
                    <div><span className="muted">CBA:</span> <b>{(sc as Record<string, number | undefined>).cba ?? (sc as Record<string, number | undefined>).cba_value ?? "—"}</b></div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="lb-scorecard" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px" }} className="muted fs-10">Bur.</th>
                          {Array.from({length: 9}, (_, i) => i + 1).map(h => (
                            <th key={h} className="lb-hole" style={{ textAlign: "center", padding: "4px 6px" }}>{h}</th>
                          ))}
                          <th className="lb-halftot" style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>F9</th>
                          {!is9 && Array.from({length: 9}, (_, i) => i + 10).map(h => (
                            <th key={h} className="lb-hole" style={{ textAlign: "center", padding: "4px 6px" }}>{h}</th>
                          ))}
                          {!is9 && <th className="lb-halftot" style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>B9</th>}
                          <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>Tot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Par */}
                        <tr>
                          <td className="muted fs-10" style={{ padding: "4px 6px" }}>Par</td>
                          {Array.from({length: 9}, (_, i) => i + 1).map(h => (
                            <td key={h} className="lb-hole muted" style={{ textAlign: "center", padding: "4px 6px" }}>{pars(h) || "—"}</td>
                          ))}
                          <td className="lb-halftot muted" style={{ textAlign: "center", padding: "4px 6px", fontWeight: 600 }}>{f9Par}</td>
                          {!is9 && Array.from({length: 9}, (_, i) => i + 10).map(h => (
                            <td key={h} className="lb-hole muted" style={{ textAlign: "center", padding: "4px 6px" }}>{pars(h) || "—"}</td>
                          ))}
                          {!is9 && <td className="lb-halftot muted" style={{ textAlign: "center", padding: "4px 6px", fontWeight: 600 }}>{b9Par}</td>}
                          <td style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>{sc.par_total ?? "—"}</td>
                        </tr>
                        {/* SI */}
                        <tr>
                          <td className="muted fs-10" style={{ padding: "4px 6px" }}>SI</td>
                          {Array.from({length: 9}, (_, i) => i + 1).map(h => (
                            <td key={h} className="lb-hole muted fs-10" style={{ textAlign: "center", padding: "4px 6px" }}>{sis(h) || "—"}</td>
                          ))}
                          <td className="lb-halftot"></td>
                          {!is9 && Array.from({length: 9}, (_, i) => i + 10).map(h => (
                            <td key={h} className="lb-hole muted fs-10" style={{ textAlign: "center", padding: "4px 6px" }}>{sis(h) || "—"}</td>
                          ))}
                          {!is9 && <td className="lb-halftot"></td>}
                          <td></td>
                        </tr>
                        {/* Gross com cores oficiais via scClass */}
                        <tr>
                          <td style={{ padding: "4px 6px", fontWeight: 600 }}>Gross</td>
                          {Array.from({length: 9}, (_, i) => i + 1).map(h => (
                            <td key={h} className="lb-hole" style={{ textAlign: "center", padding: "4px 6px" }}>
                              <span className={"sc-score " + scClass(gross(h), pars(h))}>{gross(h) || ""}</span>
                            </td>
                          ))}
                          <td className="lb-halftot" style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>
                            {f9Gross} <span className="fs-10 c-text-3">({fmtToPar(f9Gross - f9Par)})</span>
                          </td>
                          {!is9 && Array.from({length: 9}, (_, i) => i + 10).map(h => (
                            <td key={h} className="lb-hole" style={{ textAlign: "center", padding: "4px 6px" }}>
                              <span className={"sc-score " + scClass(gross(h), pars(h))}>{gross(h) || ""}</span>
                            </td>
                          ))}
                          {!is9 && (
                            <td className="lb-halftot" style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>
                              {b9Gross} <span className="fs-10 c-text-3">({fmtToPar(b9Gross - b9Par)})</span>
                            </td>
                          )}
                          <td style={{ textAlign: "center", padding: "4px 6px", fontWeight: 700 }}>{sc.gross_total ?? "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <div className="muted fs-10 p-8 ta-c" style={{ marginTop: 8 }}>
        Para análise completa (scorecards hole-by-hole + estatísticas), este jogador pode ser
        adicionado ao pipeline (<code>node scripts/golf-all.js {f.federation_code}</code>).
      </div>
    </div>
  );
}

/* ── Ordem e etiquetas dos 32 campos FPG ──────────────────── */
/* ────────────────────────────────────────────────────────────────────
   Cadastro FPG — organização dos campos em secções + tooltips
   ──────────────────────────────────────────────────────────────────── */

/** Secções visíveis por defeito. Cada uma agrupa campos relacionados. */
const FEDERADO_SECTIONS: { title: string; fields: string[] }[] = [
  {
    title: "Identificação",
    fields: ["federation_code", "name", "gender", "birthdate", "country", "country_prefix"],
  },
  {
    title: "Clube",
    fields: ["acronym", "club_name", "club_code", "clubplayerstatus", "club_notpublic"],
  },
  {
    title: "Handicap",
    fields: ["hcp_index", "hcp_status", "hcp_type", "last_hcp_date", "rounds_current_year"],
  },
  {
    title: "Estado FPG",
    fields: ["federated_status", "player_type", "age_level", "admission_date", "notpublic"],
  },
];

/** Campos "técnicos" — IDs internos, tokens e redundâncias — escondidos num
 *  <details> colapsado. Não são úteis no dia-a-dia mas podem ser necessários
 *  para debug ou cross-referencing com outros scripts. */
const FEDERADO_TECHNICAL_FIELDS = [
  "federation_number",    // redundante com federation_code (zeros à esquerda)
  "hcp_exact",            // igual ao hcp_index em 99% dos casos
  "age_level_id", "hcp_status_id", "hcp_type_id", "player_type_id", "federated_status_id",
  "permit", "dt_aniv", "photo", "encryptedfedcode",
];

const FEDERADO_FIELD_LABELS: Record<string, string> = {
  federation_code: "Nº Federado",
  federation_number: "Nº Federado (7 dígitos)",
  name: "Nome",
  gender: "Sexo",
  birthdate: "Data de nascimento",
  age_level: "Escalão",
  age_level_id: "Escalão (ID)",
  hcp_exact: "HCP Exacto",
  hcp_index: "HCP Index",
  hcp_status: "HCP Status",
  hcp_status_id: "HCP Status (ID)",
  hcp_type: "HCP Tipo",
  hcp_type_id: "HCP Tipo (ID)",
  player_type: "Tipo de jogador",
  player_type_id: "Tipo de jogador (ID)",
  federated_status: "Status federado",
  federated_status_id: "Status federado (ID)",
  acronym: "Clube (acrónimo)",
  club_code: "Clube (código)",
  club_name: "Clube (nome oficial)",
  club_notpublic: "Clube — privacidade",
  clubplayerstatus: "Clube — status jogador",
  country: "País",
  country_prefix: "País (prefixo)",
  admission_date: "Federado desde",
  last_hcp_date: "Última actualização HCP",
  rounds_current_year: "Rondas este ano",
  notpublic: "Perfil público",
  permit: "Permit",
  dt_aniv: "DT Aniv",
  photo: "Fotografia (path)",
  encryptedfedcode: "Token encriptado",
};

/** Tooltips — aparecem via `title=` ao fazer hover no label.
 *  Escrito para um leigo que pode não estar familiarizado com os termos FPG. */
const FEDERADO_FIELD_DESCRIPTIONS: Record<string, string> = {
  federation_code: "Número único atribuído pela FPG quando o jogador se federa. Usado em toda a federação para identificar o jogador.",
  federation_number: "Mesmo nº federado com zeros à esquerda até 7 dígitos. É só um formato alternativo — sem informação adicional.",
  name: "Nome completo como consta no registo da FPG.",
  gender: "Masculino (M) ou Feminino (F). Determina os escalões competitivos e os tees oficiais a jogar.",
  birthdate: "Data de nascimento. Determina o escalão etário em cada torneio.",
  age_level: "Escalão etário competitivo conforme o regulamento FPG. Sub-10, Sub-12, Sub-14, Sub-16, Sub-18, Sub-21, Absoluto, Sénior, etc.",
  age_level_id: "Código numérico interno do escalão (10=Sub-10, 12=Sub-12, …). Só útil para debug.",
  hcp_exact: "Handicap 'exacto' — terminologia antiga da EGA. Em Portugal desde a migração para o WHS é igual ao HCP Index.",
  hcp_index: "Handicap oficial WHS (World Handicap System). Reflecte a capacidade actual do jogador; quanto mais baixo, melhor. É o valor usado para calcular o Playing Handicap em cada campo.",
  hcp_status: "Estado do handicap: Válido = pode ser usado em competição; Provisório = ainda em formação (menos de 20 cartões entregues); Suspenso = alguma irregularidade.",
  hcp_status_id: "Código numérico do status HCP (10=Válido, etc.). Só útil para debug.",
  hcp_type: "Sistema de handicap: EGA = sistema europeu antigo; WHS = sistema mundial actual (em vigor em Portugal desde 2020).",
  hcp_type_id: "Código numérico do tipo de HCP. Só útil para debug.",
  player_type: "Amador compete por prazer e pode receber prémios em vouchers/géneros; Profissional está inscrito como tal e pode receber prémios monetários.",
  player_type_id: "Código numérico do tipo de jogador (1=Amador, 2=Profissional, etc.). Só útil para debug.",
  federated_status: "Ativo = federação em dia e pode participar em competições; Inativo = quota por regularizar.",
  federated_status_id: "Código numérico do status federado (9=Ativo, 7=Inativo, etc.). Só útil para debug.",
  acronym: "Nome curto do clube onde o jogador está inscrito.",
  club_code: "Código FPG do clube (3 dígitos, ex.: 007 = CGSS Santo da Serra, 004 = Estoril).",
  club_name: "Nome oficial completo do clube de filiação.",
  club_notpublic: "Se Privado, o clube optou por não exibir listas de jogadores publicamente nos rankings FPG.",
  clubplayerstatus: "Status do jogador dentro do próprio clube (0=regular, 1=social, etc.).",
  country: "País de origem ou de federação.",
  country_prefix: "Código ISO de 2 letras do país (PT=Portugal, ES=Espanha, …).",
  admission_date: "Data da primeira inscrição do jogador na FPG.",
  last_hcp_date: "Data do último cartão/ronda que fez mexer o HCP Index.",
  rounds_current_year: "Número de cartões entregues este ano civil. Pode incluir torneios e rondas individuais (EDS).",
  notpublic: "Se Privado, o jogador optou por não aparecer publicamente nas listas/rankings da FPG.",
  permit: "Código interno FPG relacionado com autorizações de jogo (permits internacionais, reciprocidades, etc.).",
  dt_aniv: "Data interna de aniversário de filiação, usada pela FPG para renovações. Quase sempre vazia.",
  photo: "Caminho interno da fotografia do jogador nos servidores da FPG.",
  encryptedfedcode: "Identificador criptografado usado pela FPG para gerar URLs únicos (ex.: scorecard partilháveis). Nunca muda para o mesmo jogador.",
};

/* ────────────────────────────────────────────────────────────────
   formatFedValue — todos os 32 campos do Cadastro FPG renderizados
   com os pills globais (PillBadge.tsx + App.css .p/.p-sm/.p-*).
   Cada valor vira pill apropriado ao tipo de campo.
   ──────────────────────────────────────────────────────────────── */
const STATUS_GOOD_PILL: React.CSSProperties = {
  background: "var(--color-good)", color: "#fff", borderColor: "transparent",
};
const STATUS_WARN_PILL: React.CSSProperties = {
  background: "var(--color-warn)", color: "#fff", borderColor: "transparent",
};
const STATUS_DANGER_PILL: React.CSSProperties = {
  background: "var(--color-danger)", color: "#fff", borderColor: "transparent",
};
const HCP_VALUE_PILL: React.CSSProperties = {
  background: "var(--bg-topbar)", color: "#fff", borderColor: "transparent",
  letterSpacing: "0.02em",
};

function normalizeAgeLabel(s: string): string {
  // "SUB12" → "Sub-12" · "SUB-14" → "Sub-14" · mantém "Absoluto", "Sénior", etc.
  const m = s.match(/^sub[-\s]?(\d{1,2})$/i);
  return m ? `Sub-${m[1]}` : s;
}

function formatFedValue(key: string, v: unknown): React.ReactNode {
  // ── Vazios ───────────────────────────────────────────────────
  if (v == null || v === "") return <span className="p p-sm p-muted">—</span>;

  // ── Tokens longos (path/hash) — pill muted com code mono ────
  if (key === "encryptedfedcode" && typeof v === "string") {
    return (
      <span className="p p-sm p-muted" title={v}>
        <code className="fs-10">{v.slice(0, 16)}…</code>
      </span>
    );
  }
  if (key === "photo" && typeof v === "string") {
    return (
      <span className="p p-sm p-muted" title={v}>
        <code className="fs-10">…{v.slice(-18)}</code>
      </span>
    );
  }

  // ── Nome — texto, não pill (demasiado longo) ─────────────────
  if (key === "name") {
    return <span className="fw-700" style={{ fontSize: 13 }}>{String(v)}</span>;
  }

  // ── Género ───────────────────────────────────────────────────
  if (key === "gender") {
    const sex = String(v).toUpperCase();
    return sex === "M" || sex === "F"
      ? <SexBadge sex={sex as "M" | "F"} size="md" />
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Códigos de federação ─────────────────────────────────────
  if (key === "federation_code" || key === "federation_number") {
    return <span className="p p-sm p-fed">{String(v)}</span>;
  }

  // ── Escalão — pill global (.p-sub10 etc.) via <EscPill /> ───
  if (key === "age_level" && typeof v === "string") {
    return <EscPill esc={normalizeAgeLabel(v)} />;
  }

  // ── Datas → .p-birth ─────────────────────────────────────────
  if (key === "birthdate" || key === "admission_date" || key === "last_hcp_date" || key === "dt_aniv") {
    return <span className="p p-sm p-birth">{String(v)}</span>;
  }

  // ── HCP Exacto / Index → pill escuro destacado ───────────────
  if (key === "hcp_exact" || key === "hcp_index") {
    const n = Number(v);
    const txt = isFinite(n) ? (Number.isInteger(n) ? n.toString() : n.toFixed(1)) : String(v);
    return <span className="p p-sm" style={HCP_VALUE_PILL}>{txt}</span>;
  }

  // ── Status de HCP (Válido / Provisório / …) ─────────────────
  if (key === "hcp_status") {
    const s = String(v).toLowerCase();
    const isGood = /v[aá]lid|ativo|activo/.test(s);
    const isWarn = /provis|review|revis/.test(s);
    const style = isGood ? STATUS_GOOD_PILL : isWarn ? STATUS_WARN_PILL : undefined;
    return style
      ? <span className="p p-sm" style={style}>{String(v)}</span>
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Status federado (Ativo / Inativo) ───────────────────────
  if (key === "federated_status") {
    const s = String(v).toLowerCase();
    const isGood = /ativ/.test(s) && !/inativ/.test(s);
    const isBad = /inativ|suspen/.test(s);
    const style = isGood ? STATUS_GOOD_PILL : isBad ? STATUS_DANGER_PILL : undefined;
    return style
      ? <span className="p p-sm" style={style}>{String(v)}</span>
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Tipo de HCP (EGA, WHS, …) → outline ─────────────────────
  if (key === "hcp_type") {
    return <span className="p p-sm p-outline">{String(v)}</span>;
  }

  // ── Tipo de jogador (Amador / Profissional) ─────────────────
  if (key === "player_type") {
    const s = String(v).toLowerCase();
    const isPro = /profiss/.test(s);
    return isPro
      ? <span className="p p-sm" style={STATUS_WARN_PILL}>{String(v)}</span>
      : <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── País (nome extenso) com bandeira ────────────────────────
  if (key === "country") {
    const flag = gf(String(v));
    return (
      <span className="p p-sm p-muted">
        {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
        {String(v)}
      </span>
    );
  }

  // ── País (prefixo ISO) ──────────────────────────────────────
  if (key === "country_prefix") {
    const txt = String(v);
    const flag = gf(txt);
    return (
      <span className="p p-sm p-muted">
        {flag && <span style={{ marginRight: 4 }}>{flag}</span>}
        {txt}
      </span>
    );
  }

  // ── Clube — acrónimo, código, nome ──────────────────────────
  if (key === "acronym" || key === "club_name") {
    return <span className="p p-sm p-club">{String(v)}</span>;
  }
  if (key === "club_code") {
    return <span className="p p-sm p-club">{String(v).padStart(3, "0")}</span>;
  }

  // ── Rondas este ano → número destacado ──────────────────────
  if (key === "rounds_current_year") {
    const n = Number(v);
    const isZero = isFinite(n) && n === 0;
    return (
      <span className="p p-sm" style={isZero ? { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "transparent" } : HCP_VALUE_PILL}>
        {isFinite(n) ? n : String(v)}
      </span>
    );
  }

  // ── Flags booleanas (notpublic, club_notpublic) ─────────────
  if (key === "notpublic" || key === "club_notpublic") {
    // 1 = privado (warn), 0/null = público (good)
    const truthy = v === true || v === 1 || v === "1";
    return (
      <span className="p p-sm" style={truthy ? STATUS_WARN_PILL : STATUS_GOOD_PILL}>
        {truthy ? "Privado" : "Público"}
      </span>
    );
  }

  // ── IDs numéricos (termina em _id) → muted ──────────────────
  if (key.endsWith("_id")) {
    return <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Permit (número) ─────────────────────────────────────────
  if (key === "permit") {
    return <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── clubplayerstatus (0/1) ──────────────────────────────────
  if (key === "clubplayerstatus") {
    return <span className="p p-sm p-muted">{String(v)}</span>;
  }

  // ── Fallbacks por tipo ──────────────────────────────────────
  if (typeof v === "boolean") {
    return (
      <span className="p p-sm" style={v ? STATUS_GOOD_PILL : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "transparent" }}>
        {v ? "Sim" : "Não"}
      </span>
    );
  }
  if (typeof v === "number") return <span className="p p-sm p-muted">{v}</span>;
  return <span className="p p-sm p-muted">{String(v)}</span>;
}

function KV({ label, value, description }: { label: string; value: React.ReactNode; description?: string }) {
  const hasDesc = !!description;
  return (
    <div>
      <div
        className="muted fs-10"
        style={{
          marginBottom: 2,
          cursor: hasDesc ? "help" : "default",
          textDecoration: hasDesc ? "underline dotted var(--text-3)" : "none",
          textUnderlineOffset: "2px",
        }}
        title={description}
      >
        {label}{hasDesc && <span aria-hidden style={{ marginLeft: 3, opacity: 0.5 }}>ⓘ</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, minHeight: 20 }}>
        {value}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Main Page — Jogadores (master-detail)
   ──────────────────────────────────────────────────────────────────────────────────────── */

const ESC_ORDER = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Sub-24", "Absoluto", "MidAmateur", "Sénior", "SuperSenior", "Outros"];
const ESC_IDX = new Map(ESC_ORDER.map((e, i) => [e, i]));

/* ────────────────────────────────────────────────────────────────────────────────────────
   FilteredStatsCard — mostra estatísticas dos jogadores actualmente filtrados
   quando não há nenhum jogador seleccionado na sidebar.
   ──────────────────────────────────────────────────────────────────────────────────────── */
type FilteredPlayer = { name: string; fed: string; escalao: string; sex?: "M" | "F" | string; hcp: number | null; club: unknown; region?: string; _federadoRaw?: FederadoRaw; _source?: MergedPlayer["_source"]; tags?: string[] };

function FilteredStatsCard({ filtered, viewMode, onPickPlayer, activeFiltersCount }: {
  filtered: FilteredPlayer[];
  viewMode: "ours" | "todos";
  onPickPlayer: (fed: string) => void;
  activeFiltersCount: number;
}) {
  if (!filtered.length) {
    return <EmptyState size="sm" message="Nenhum jogador corresponde aos filtros actuais" />;
  }

  // Agregados
  let male = 0, female = 0, withHcp = 0, totalHcp = 0, active2026 = 0;
  let withAnalysis = 0, cadastroOnly = 0;
  const byEsc: Record<string, { m: number; f: number }> = {};
  const byClub: Record<string, { name: string; count: number }> = {};
  const byRegion: Record<string, number> = {};
  const HCP_BINS = ["plus", "0-5", "5-10", "10-15", "15-20", "20-30", "30+"] as const;
  const hcpBins: Record<string, { m: number; f: number }> = Object.fromEntries(HCP_BINS.map(k => [k, { m: 0, f: 0 }]));
  const binKey = (h: number): string => h < 0 ? "plus" : h < 5 ? "0-5" : h < 10 ? "5-10" : h < 15 ? "10-15" : h < 20 ? "15-20" : h < 30 ? "20-30" : "30+";

  for (const p of filtered) {
    const isM = p.sex === "M"; const isF = p.sex === "F";
    if (isM) male++; else if (isF) female++;
    if (p.hcp != null && p.hcp !== 99) {
      withHcp++; totalHcp += p.hcp;
      const k = binKey(p.hcp);
      if (isM) hcpBins[k].m++; else if (isF) hcpBins[k].f++;
    }
    if ((p._federadoRaw?.rounds_current_year || 0) > 0) active2026++;
    if (!byEsc[p.escalao]) byEsc[p.escalao] = { m: 0, f: 0 };
    if (isM) byEsc[p.escalao].m++; else if (isF) byEsc[p.escalao].f++;
    const club = typeof p.club === "object" && p.club ? p.club as { code?: string; short?: string; long?: string } : null;
    if (club?.code) {
      if (!byClub[club.code]) byClub[club.code] = { name: club.short || club.long || club.code, count: 0 };
      byClub[club.code].count++;
    }
    if (p.region) byRegion[p.region] = (byRegion[p.region] || 0) + 1;
    if (p._source === "both" || p._source === "players" || (!p._source && viewMode === "ours")) withAnalysis++;
    if (p._source === "feds") cadastroOnly++;
  }

  const avgHcp = withHcp ? totalHcp / withHcp : 0;
  const sortedEsc = Object.entries(byEsc).sort((a, b) => (ESC_IDX.get(a[0]) ?? 999) - (ESC_IDX.get(b[0]) ?? 999));
  const maxEsc = Math.max(...Object.values(byEsc).map(v => v.m + v.f), 1);
  const topClubs = Object.entries(byClub).sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  const maxClub = topClubs[0]?.[1].count ?? 1;
  const topRegions = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxRegion = topRegions[0]?.[1] ?? 1;
  const maxHcpBin = Math.max(...Object.values(hcpBins).map(v => v.m + v.f), 1);

  const topBest = [...filtered]
    .filter(p => p.hcp != null && p.hcp !== 99)
    .sort((a, b) => (a.hcp as number) - (b.hcp as number))
    .slice(0, 10);

  const COL_M = "var(--badge-male)";
  const COL_F = "var(--badge-female)";
  const pct = (v: number, max: number) => `${Math.max(2, (v / Math.max(1, max)) * 100)}%`;

  return (
    <div className="p-16">
      <div style={{ marginBottom: 14 }}>
        <h2 className="detail-title" style={{ margin: 0 }}>📊 Estatísticas da selecção actual</h2>
        <div className="muted fs-10" style={{ marginTop: 4 }}>
          {filtered.length.toLocaleString("pt-PT")} jogadores
          {activeFiltersCount > 0 && <> · {activeFiltersCount} filtro{activeFiltersCount > 1 ? "s" : ""} activo{activeFiltersCount > 1 ? "s" : ""}</>}
          {" · "}<span className="c-muted">clica num jogador na sidebar para ver o detalhe</span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Total" value={filtered.length} big />
        <KpiCard label={<><SexBadge sex="M" /> Masculino</>} value={male} pct={male / filtered.length} />
        <KpiCard label={<><SexBadge sex="F" /> Feminino</>} value={female} pct={female / filtered.length} />
        {withHcp > 0 && <KpiCard label="Com HCP" value={withHcp} sub={`média ${avgHcp.toFixed(1)}`} />}
        {viewMode === "todos" && active2026 > 0 && <KpiCard label="Activos 2026" value={active2026} pct={active2026 / filtered.length} sub="com rondas" />}
        {viewMode === "todos" && withAnalysis > 0 && cadastroOnly > 0 && (
          <KpiCard label="🔍 Com análise" value={withAnalysis} sub={`+ ${cadastroOnly} cadastro`} />
        )}
      </div>

      {/* Top 10 por HCP */}
      {topBest.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="fw-700 fs-14 mb-8">🏆 Top 10 por HCP (melhores primeiro)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 4 }}>
            {topBest.map((p, i) => {
              const cp = p._federadoRaw?.country_prefix;
              return (
                <button
                  key={p.fed}
                  className="course-item"
                  onClick={() => onPickPlayer(p.fed)}
                  style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
                >
                  <span className="fw-700 muted" style={{ width: 22, fontSize: 11 }}>{i + 1}</span>
                  {p.sex === "M" || p.sex === "F" ? <SexBadge sex={p.sex} /> : null}
                  <span style={{ flex: 1, fontSize: 12 }}>
                    {cp && cp !== "PT" && !cp.startsWith("@") && <span className="mr-4">{gf(cp)}</span>}
                    <span className="fw-600">{p.name}</span>
                    {(() => {
                      const club = typeof p.club === "object" && p.club ? (p.club as { short?: string }).short : null;
                      return club ? <span className="muted fs-10 ml-4">({club})</span> : null;
                    })()}
                  </span>
                  <span className="fw-900" style={{ fontSize: 13, color: (p.hcp as number) < 0 ? "var(--medal-gold)" : "var(--text-1)" }}>
                    {(p.hcp as number).toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 colunas: Escalões, Clubes, Regiões */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 16 }}>
        {sortedEsc.length > 1 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="fw-700 fs-14 mb-8">Por escalão</div>
            {sortedEsc.map(([k, v]) => {
              const total = v.m + v.f;
              const mPct = total > 0 ? (v.m / total) * 100 : 0;
              return (
                <div key={k} style={{ marginBottom: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span className="fw-500">{k}</span>
                    <span className="fw-700">{total}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-subtle)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: pct(total, maxEsc), height: "100%", display: "flex" }}>
                      <div style={{ width: `${mPct}%`, background: COL_M }} />
                      <div style={{ width: `${100 - mPct}%`, background: COL_F }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {topClubs.length > 1 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="fw-700 fs-14 mb-8">Top 12 clubes</div>
            {topClubs.map(([code, c]) => (
              <div key={code} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span className="fw-500">{c.name} <span className="muted fs-10">({code})</span></span>
                  <span className="fw-700">{c.count}</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-subtle)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: pct(c.count, maxClub), height: "100%", background: "var(--color-good)" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {topRegions.length > 1 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="fw-700 fs-14 mb-8">Por região</div>
            {topRegions.map(([r, n]) => (
              <div key={r} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span className="fw-500">{r}</span>
                  <span className="fw-700">{n}</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-subtle)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: pct(n, maxRegion), height: "100%", background: "var(--chart-2)" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribuição de HCP */}
      {withHcp > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="fw-700 fs-14">Distribuição de HCP · <span className="muted fs-10">{withHcp} jogadores</span></div>
            <div style={{ display: "flex", gap: 10, fontSize: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" /> M</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" /> F</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${HCP_BINS.length}, 1fr)`, gap: 10, alignItems: "end", height: 220 }}>
            {HCP_BINS.map(bin => {
              const { m, f } = hcpBins[bin];
              const total = m + f;
              const label = bin === "plus" ? "Scratch" : bin;
              const barHeight = (total / maxHcpBin) * 140;
              const mHeight = (m / Math.max(1, total)) * barHeight;
              const fHeight = barHeight - mHeight;
              return (
                <div key={bin} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  <div className="fw-700 fs-11" style={{ marginBottom: 2 }}>{total}</div>
                  <div className="muted fs-10" style={{ marginBottom: 4 }}>{total > 0 ? ((total / withHcp) * 100).toFixed(0) + "%" : ""}</div>
                  <div style={{ width: "80%", minWidth: 14, display: "flex", flexDirection: "column", borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                    {f > 0 && <div style={{ height: fHeight, background: COL_F, minHeight: 2 }} />}
                    {m > 0 && <div style={{ height: mHeight, background: COL_M, minHeight: 2 }} />}
                  </div>
                  <div className="fw-600 fs-10" style={{ marginTop: 4 }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   PlayerSidebarItem — item de sidebar unificado para JogadoresPage.
   Inspirado no TournSidebarItem (FPGPage): accent lateral + pills globais.
   ──────────────────────────────────────────────────────────────────────── */

type PlayerSidebarPlayer = {
  name: string;
  fed: string;
  escalao: string;
  sex?: "M" | "F" | string;
  hcp: number | null;
  club?: unknown;
  tags?: string[];
  _source?: MergedPlayer["_source"];
  _federadoRaw?: FederadoRaw;
  _fpgDiffs?: MergedPlayer["_fpgDiffs"];
};

/** Sep — pequena linha separadora entre blocos do cartão */
const PlayerSidebarSep = () => (
  <div style={{ height: "0.5px", background: "var(--border-light, rgba(0,0,0,.08))", margin: "4px 0" }} />
);

/** Estatísticas de HCP de um escalão. HCP menor = melhor, logo p25 é o valor
 *  CEILING do quartil de topo (top 25% dos jogadores têm HCP ≤ p25). */
export type EscHcpStats = {
  p25: number;   // Topo (25% melhores têm HCP ≤ p25)
  p50: number;   // Mediana
  p75: number;   // 25% piores têm HCP > p75
  count: number;
};

/** Pill HCP com 3 níveis de destaque relativamente ao escalão:
 *   - TOP 25%  → verde (standout — "dos melhores do escalão")
 *   - MEIO 50% → pill neutro (estado maioritário e "normal")
 *   - BOTTOM 25% → outline esmaecido ("abaixo do escalão")
 *
 *  Usa percentis dentro do mesmo escalão para remover a falsa hierarquia
 *  do "HCP baixo = melhor em absoluto" (um Sub-10 com HCP 25 pode ser dos
 *  melhores do escalão; um Sub-18 com 15 pode ser dos piores).
 *
 *  Nota de design: experimentámos 4 níveis (quartis) mas era confuso —
 *  dois jogadores com HCP 11.8 e 11.9 podiam cair em quartis adjacentes
 *  e mudar de cor por ruído estatístico. Com 3 níveis, só o topo e o
 *  fundo têm sinal visual, os 50% do meio ficam todos iguais. */
/** WHS cap é 54.0 — valores ≥ 54 (incluindo 99) são placeholders usados
 *  para jogadores sem HI estabelecido ("a começar a jogar"). Não entram
 *  nas estatísticas de escalão e têm um pill próprio (neutro, em formação). */
const HCP_UNESTABLISHED_THRESHOLD = 54;

function HcpPill({ hcp, escHcps }: { hcp: number | null; escHcps?: EscHcpStats }) {
  if (hcp == null || !isFinite(hcp)) return null;

  // Caso especial: HI ainda não estabelecido (jogador em formação)
  if (hcp >= HCP_UNESTABLISHED_THRESHOLD) {
    return (
      <span
        className="p p-sm"
        style={{ background: "transparent", color: "var(--text-3)", borderColor: "transparent" }}
        title={`HCP ${hcpDisplay(hcp)} — HI ainda não estabelecido (jogador em formação, excluído das stats do escalão)`}
      >
        HCP {hcpDisplay(hcp)}
      </span>
    );
  }

  let style: React.CSSProperties;
  let tooltip = `HCP ${hcpDisplay(hcp)}`;
  if (escHcps && escHcps.count >= 5) {
    const { p25, p75, count } = escHcps;
    if (hcp <= p25) {
      // Topo do escalão — único destaque forte
      style = { background: "var(--color-good)", color: "#fff", borderColor: "transparent" };
      tooltip += ` · TOP 25% do escalão (entre ${count} jogadores)`;
    } else if (hcp > p75) {
      // Fundo do escalão — sem fundo, sem borda, só texto esmaecido
      style = { background: "transparent", color: "var(--text-3)", borderColor: "transparent" };
      tooltip += ` · Bottom 25% do escalão (entre ${count} jogadores)`;
    } else {
      // Meio 50% — o estado "normal", sem sinal forte
      style = { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" };
      tooltip += ` · típico do escalão (entre ${count} jogadores)`;
    }
  } else {
    // Sem estatísticas de escalão — pill neutro
    style = { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" };
    if (escHcps) tooltip += ` · escalão com poucos jogadores (${escHcps.count})`;
  }
  return (
    <span className="p p-sm" style={style} title={tooltip}>
      HCP {hcpDisplay(hcp)}
    </span>
  );
}

/** Pill de tag (PJA, inscrito-nacional, no-scrape, hidden) */
function TagPill({ tag }: { tag: string }) {
  const t = tag.toLowerCase();
  // Mapeamento tag → estilo + label
  if (t === "pja") return <PillBadge pill="PJA" />;
  if (t === "inscrito-nacional") {
    return (
      <span
        className="p p-sm"
        style={{ background: "var(--color-good-dark)", color: "#fff", borderColor: "transparent" }}
        title="Inscrito no Campeonato Nacional 2026"
      >
        🏆 CN26
      </span>
    );
  }
  if (t === "no-scrape") {
    return (
      <span
        className="p p-sm"
        style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderColor: "var(--border)" }}
        title="Scraper salta este jogador (dados congelados)"
      >
        ⏸ sem scrape
      </span>
    );
  }
  if (t === "hidden") {
    return (
      <span
        className="p p-sm"
        style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderColor: "var(--border)" }}
        title="Escondido da sidebar"
      >
        👁 oculto
      </span>
    );
  }
  // Fallback — tag genérica
  return <span className="p p-sm p-muted">{tag}</span>;
}

type PlayerSidebarItemProps = {
  p: PlayerSidebarPlayer;
  isActive: boolean;
  displayClub: string | null;
  displayEscalao: string;
  displayHcp: number | null;
  rank?: number | null;
  rankingMode: boolean;
  isNewRound: boolean;
  escHcps?: EscHcpStats;
  roundsTotal?: number | null;
  /** Rondas no ano civil corrente — mesma fonte que o detalhe ("N em {ano}"). */
  roundsCurrentYear?: number | null;
  onClick: (e: React.MouseEvent) => void;
};

function PlayerSidebarItem({
  p, isActive, displayClub, displayEscalao, displayHcp, rank, rankingMode, isNewRound,
  escHcps, roundsTotal, roundsCurrentYear, onClick,
}: PlayerSidebarItemProps) {
  const pm = p;
  const isFedsOnly = pm._source === "feds";
  const isOrphan = pm._source === "players";
  const hcpChanged = !!pm._fpgDiffs?.hcpChanged;
  const rawTags = (pm.tags || []).filter(t => t !== "no-priority");
  const isPja = rawTags.some(t => t.toUpperCase() === "PJA");
  const hasNacionalTag = rawTags.includes("inscrito-nacional");
  // PJAs estão implicitamente inscritos no Campeonato Nacional — se o
  // tag explícito não existir, adicionamo-lo aqui para o pill aparecer.
  const tags = isPja && !hasNacionalTag ? [...rawTags, "inscrito-nacional"] : rawTags;
  const isNacional = isPja || hasNacionalTag;

  const countryPrefix = pm._federadoRaw?.country_prefix;
  const showFlag = countryPrefix && countryPrefix !== "PT" && !countryPrefix.startsWith("@");

  // ── Accent lateral: prioridade nacional > PJA > orphan > escalão > feds-only ──
  const escKey = (displayEscalao || "").toLowerCase().replace(/[\s-]/g, "");
  const escBg =
    escKey === "sub10" ? "var(--esc-sub10-bg)" :
    escKey === "sub12" ? "var(--esc-sub12-bg)" :
    escKey === "sub14" ? "var(--esc-sub14-bg)" :
    escKey === "sub16" ? "var(--esc-sub16-bg)" :
    escKey === "sub18" ? "var(--esc-sub18-bg)" :
    escKey === "sub21" ? "var(--esc-sub21-bg)" :
    escKey === "sub24" ? "var(--esc-sub24-bg)" :
    null;
  const accent =
    isNacional ? "var(--color-good-dark, #166534)" :
    isPja      ? SIDEBAR_ACCENT.pja :
    isOrphan   ? "var(--color-warn)" :
    escBg      ??
    (isFedsOnly ? "var(--border)" : SIDEBAR_ACCENT.default);

  // Club — fallback para fed code se não houver clube
  const clubText = typeof displayClub === "string" && displayClub.trim() ? displayClub : null;

  return (
    <a
      href={`/jogadores/${p.fed}`}
      className={`course-item ${isActive ? "active" : ""}`}
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${accent}`,
        paddingLeft: 10,
        borderRadius: "0 6px 6px 0",
        opacity: isFedsOnly ? 0.82 : 1,
      }}
    >
      {/* Linha 1: rank (se rankingMode) + flag + nome + sexo + indicadores */}
      <div className="course-item-name flex-center" style={{ marginBottom: 3 }}>
        {rankingMode && rank != null && (
          <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}>
            {rank}
          </span>
        )}
        <span className="flex-1" style={{ minWidth: 0 }}>
          {showFlag && <span className="mr-4" title={pm._federadoRaw?.country}>{gf(countryPrefix!)}</span>}
          <span style={{ fontWeight: isActive ? 700 : 600 }}>{p.name}</span>
          <SexBadge sex={p.sex} size="sm" className="ml-4" />
          {isNewRound && <span className="new-round-dot ml-4" title="Ronda recente (< 7 dias)" />}
          {isFedsOnly && <span className="ml-4 c-muted fs-10" title="Só cadastro FPG — sem análise de scorecards">ø</span>}
          {isOrphan && <span className="ml-4 fs-10" title="Não encontrado na FPG activa (quotas por regularizar?)" style={{ color: "var(--color-warn-vivid)" }}>⚠</span>}
          {hcpChanged && <span className="ml-4 fs-10" title={`FPG actual: HCP ${pm._fpgDiffs?.hcpChanged?.fpg}`} style={{ color: "var(--color-warn-vivid)" }}>⚡</span>}
        </span>
      </div>

      <PlayerSidebarSep />

      {/* Linha 2: pills — escalão · clube · HCP · tags */}
      <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center", margin: "3px 0" }}>
        {displayEscalao && <EscPill esc={displayEscalao} />}
        {clubText && (
          // Nota: NÃO usamos ClubePill aqui porque o seu helper `shortClubFromField`
          // rejeita ccode="000" (reservado à FPG) e devolve null nesse caso.
          // O `displayClub` vem de `clubShort(p)` já normalizado — renderizamos
          // directamente com a mesma classe .p-club para visual consistente.
          <span className="p p-sm p-club" title={clubText}>{clubText}</span>
        )}
        <HcpPill hcp={displayHcp} escHcps={escHcps} />
        {tags.map(t => <TagPill key={t} tag={t} />)}
      </div>

      <PlayerSidebarSep />

      {/* Linha 3: fed# + rondas (total · este ano) + rank HCP (se rankingMode) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>#{p.fed}</span>
          {/* Rondas neste ano civil — mesma fonte (data.json) que o detalhe header.
              Usado para ordenação por defeito. */}
          {(roundsCurrentYear != null && roundsCurrentYear > 0) && (
            <span title={`${roundsCurrentYear} rondas em ${new Date().getFullYear()}`} style={{ color: "var(--color-good-dark, #166534)", fontWeight: 600 }}>🗓 {roundsCurrentYear}</span>
          )}
          {/* Total — também do data.json. */}
          {(roundsTotal != null && roundsTotal > 0) && (
            <span title={`${roundsTotal} voltas no total`} style={{ opacity: 0.7 }}>📊 {roundsTotal}</span>
          )}
        </span>
        {rankingMode && displayHcp != null && (
          <span className={`sidebar-sd ${displayHcp <= 5 ? "trend-up" : displayHcp <= 15 ? "sidebar-c-text-3" : "sidebar-sd-high"}`}>
            {hcpDisplay(displayHcp)}
          </span>
        )}
      </div>
    </a>
  );
}

export default function JogadoresPage() {
  const { players, simCourses: courses } = useAppContext();
  const { fed: urlFed } = useParams<{ fed?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [escalaoFilter, setEscalaoFilter] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  // Default: ordenar por nº de rondas no ano corrente (desc) para destacar
  // jogadores activos. O sortKey "rounds" usa statsDb.roundsLast12m para
  // os nossos e _federadoRaw.rounds_current_year para federados-only.
  const [sortKey, setSortKey] = useState<SortKey>("rounds");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hcpMin, setHcpMin] = useState<string>("");  // input controlado (string para permitir "")
  const [hcpMax, setHcpMax] = useState<string>("");
  const [activeOnlyFilter, setActiveOnlyFilter] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "WITH_ANALYSIS" | "CADASTRO">("ALL");
  // Por defeito ocultamos Sénior/SuperSenior/Absoluto/MidAmateur (são muitos e
  // menos interessantes para o tracking júnior). Botão na toolbar carrega-os.
  const [includeSeniors, setIncludeSeniors] = useState(false);
  const [selectedFed, setSelectedFed] = useState<string | null>(urlFed ?? null);
    const isMobileInit = typeof window !== "undefined" && window.innerWidth <= 768;
  const md = useMasterDetail(!(isMobileInit && urlFed));
  const [playerMeta, setPlayerMeta] = useState<PlayerPageData["META"] | null>(null);
  const rankingMode = sortKey === "ranking";
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});
  const [newFilter, setNewFilter] = useState(false);
  const NEW_DAYS = 7; // threshold: "novo" = última ronda há ≤7 dias
  // Fixar Manuel, Gastão e o top 5 de cada escalão do Nacional de Jovens no
  // topo da lista alfabética (ver constants/pinnedPlayers.ts). Ligado por
  // defeito; "✕ Limpar" desliga-o → ordem alfabética pura. Re-activável pelo ⭐.
  const [prioritizeJuniors, setPrioritizeJuniors] = useState(true);

  /* ── Modo TODOS (federados.json) ──────────────────────────────── */
  // Default "todos" — garante que qualquer link externo para um federado (ex. do
  // DrawTab/AdmissionsTab) é encontrado, mesmo que o jogador não esteja nos 261
  // curados de players.json. O user pode alternar para "Nossos" na toolbar.
  const [viewMode, setViewMode] = useState<"ours" | "todos">("todos");
  const [federados, setFederados] = useState<FederadoRaw[] | null>(null);
  const [loadingFeds, setLoadingFeds] = useState(false);
  const [natFilter, setNatFilter] = useState<"ALL" | "PT" | "FOREIGN">("ALL");
  const [clubFilter, setClubFilter] = useState<string>("ALL");
  const [showStats, setShowStats] = useState(false);
  const [drillDown, setDrillDown] = useState<{ type: "club" | "age"; key: string } | null>(null);
  const [hcpBinDrill, setHcpBinDrill] = useState<string | null>(null);
  const [inativosStats, setInativosStats] = useState<InativosStats | null>(null);
  const MAX_SIDEBAR_ITEMS = 2000;  // era 500 — subido 2026-04-15 para permitir encontrar jogadores com nomes comuns sem refinar filtros
  // Escalões jovens (Sub-*) — quando o filtro só tem jovens, levantamos o cap
  // porque são poucos e o user quer ver todos sem ter de refinar mais
  const isJuvenilFilter = escalaoFilter.size > 0 && [...escalaoFilter].every(e => /^Sub-?\s*\d+$/i.test(e));

  useEffect(() => {
    if (showStats && !inativosStats) {
      loadInativosStats().then(setInativosStats).catch(err => console.error("[inativos]", err));
    }
  }, [showStats, inativosStats]);

  const [federadosError, setFederadosError] = useState<string | null>(null);

  useEffect(() => {
    // Carrega federados em ambos os modos (nossos + todos) para enriquecimento
    // (bandeira por país, HCP FPG, encryptedfedcode, etc.). Ficheiro é cacheado
    // após primeira carga via cachedFetchJson — sem custo em re-navegações.
    if (!federados && !loadingFeds && !federadosError) {
      setLoadingFeds(true);
      setFederadosError(null);
      if (import.meta.env.DEV) console.log("[federados] A carregar /data/federados.json...");
      loadFederados()
        .then(f => {
          if (import.meta.env.DEV) console.log("[federados] OK -", f.players?.length, "jogadores");
          setFederados(f.players);
        })
        .catch(err => {
          // NÃO reverter para "ours" — manter TODOS activo para o user ver o erro.
          console.error("[federados] Falha ao carregar federados.json:", err);
          setFederadosError(String(err?.message || err));
        })
        .finally(() => setLoadingFeds(false));
    }
  }, [viewMode, federados, loadingFeds, federadosError]);

  useEffect(() => { loadPlayerStats().then(setStatsDb); }, []);


  /* Ref para distinguir navegação interna (selectPlayer) de externa (URL directo) */
  const internalNav = React.useRef(false);

  /* Sync URL param → selectedFed (só limpa q em navegação externa).
     IMPORTANTE: deps APENAS [urlFed]. Antes tinha [urlFed, players] mas
     `players` (do AppContext) é um objecto re-criado em cada render do App.tsx,
     fazendo este effect disparar em loop e re-aplicar o urlFed mesmo após
     o user clicar TODOS / outro filtro.

     Sincroniza SEMPRE quando urlFed muda — mesmo que o player não esteja em
     `players` (Nossos). Para fed codes externos (jogadores de federados.json
     ou stubs sintéticos vindos de /nacionais-jovens/históricos), o `selected`
     useMemo abaixo trata de construir um stub e renderizar FederadoOnlyDetail. */
  useEffect(() => {
    if (urlFed) {
      setSelectedFed(urlFed);
      if (!internalNav.current && players[urlFed]) {
        // Só limpar a pesquisa quando o fed pertence a Nossos — evita
        // resetar o filtro do user em navegações externas para feds desconhecidos.
        setQ("");
      }
      internalNav.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFed]);

  /* Helper: select player and update URL */
  const selectPlayer = (fed: string | null) => {
    setSelectedFed(fed);
    if (fed) {
      internalNav.current = true;
      navigate(`/jogadores/${fed}`, { replace: true });
    } else {
      navigate("/jogadores", { replace: true });
    }
  };

  // Populate course key map for course links
  useEffect(() => {
    if (courses?.length) {
      setCourseKeyMap(buildCourseKeyMap(courses));
    }
  }, [courses]);

  // Reset meta when player changes
  useEffect(() => { setPlayerMeta(null); }, [selectedFed]);

  const allPlayers = useMemo(() => {
    if (federados) {
      // Com federados carregados, fazemos sempre merge para obter country_prefix,
      // diffs FPG, encryptedfedcode, etc. Em NOSSOS filtramos para excluir os
      // "feds" (cadastro-only FPG) e manter apenas os nossos jogadores enriquecidos.
      const merged = mergePlayersWithFederados(players, federados)
        .map(p => ({ fed: p.nfed, ...p }));
      if (viewMode === "todos") return merged;
      return merged.filter(p => p._source !== "feds");
    }
    // Fallback (federados ainda a carregar) — usar players.json directo,
    // coagindo escalão inválido/vazio para "Absoluto" (consistente com o merge).
    return Object.entries(players).map(([fed, p]) => {
      const esc = (!p.escalao || p.escalao === "?" || p.escalao === "Outros") ? "Absoluto" : p.escalao;
      return ({ fed, ...p, escalao: esc } as typeof p & { fed: string; _source?: MergedPlayer["_source"]; _federadoRaw?: FederadoRaw; _fpgDiffs?: MergedPlayer["_fpgDiffs"] });
    });
  }, [players, viewMode, federados]);

  const escaloes = useMemo(() => {
    const order = ESC_ORDER;
    const present = new Set<string>();
    allPlayers.forEach(p => p.escalao && present.add(p.escalao));
    return order.filter(e => present.has(e));
  }, [allPlayers]);

  /** Estatísticas de HCP por escalão — usadas pelo HcpPill da sidebar para
   *  colorir o pill relativamente aos pares do mesmo escalão (em vez de uma
   *  escala absoluta que seria injusta: um Sub-10 com HCP 25 pode ser dos
   *  melhores do escalão, um Sub-18 com 15 pode ser dos piores do seu).
   *
   *  ⚠ Filtramos jogadores com HCP ≥ 54 (WHS cap / placeholder 99) — são
   *  jogadores em formação, sem HI real estabelecido, que puxariam os
   *  percentis artificialmente para cima. Um Sub-10 com 8 iniciantes todos
   *  com HCP 54 passaria a ter a mediana em 54 e ninguém no bottom 25%. */
  const hcpStatsByEscalao = useMemo(() => {
    const byEsc: Record<string, number[]> = {};
    for (const p of allPlayers) {
      if (p.hcp == null || !isFinite(p.hcp)) continue;
      if (p.hcp >= HCP_UNESTABLISHED_THRESHOLD) continue; // excluir jogadores em formação
      const e = p.escalao;
      if (!e) continue;
      (byEsc[e] ||= []).push(p.hcp);
    }
    const out: Record<string, EscHcpStats> = {};
    for (const [esc, hcps] of Object.entries(byEsc)) {
      if (hcps.length === 0) continue;
      const sorted = [...hcps].sort((a, b) => a - b);
      const n = sorted.length;
      const q = (pct: number) => sorted[Math.min(n - 1, Math.floor(n * pct))];
      out[esc] = { p25: q(0.25), p50: q(0.50), p75: q(0.75), count: n };
    }
    return out;
  }, [allPlayers]);

  const regions = useMemo(() => {
    const s = new Set<string>();
    allPlayers.forEach(p => p.region && s.add(p.region));
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allPlayers]);

  /* ── Opções de clube (ambos os modos) ───────────────────────── */
  const clubOptions = useMemo(() => {
    const counts = new Map<string, { code: string; short: string; count: number }>();
    for (const p of allPlayers) {
      const c = typeof p.club === "object" ? p.club : null;
      if (!c?.code) continue;
      const existing = counts.get(c.code);
      if (existing) existing.count++;
      else counts.set(c.code, { code: c.code, short: c.short || c.code, count: 1 });
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .map(c => ({ code: c.code, label: `${c.short} (${c.count})` }));
  }, [allPlayers]);

  /* ── Estatísticas globais (modo TODOS) ──────────────────────── */
  const globalStats = useMemo(() => {
    if (viewMode !== "todos" || !federados) return null;
    const byCountry: Record<string, { count: number; m: number; f: number; name: string }> = {};
    const byAge: Record<string, { m: number; f: number }> = {};
    const byClub: Record<string, { name: string; m: number; f: number; members: FederadoRaw[] }> = {};
    const byAdmissionYear: Record<string, { m: number; f: number }> = {};
    const byAgeFull: Record<string, FederadoRaw[]> = {};
    const HCP_BINS = ["plus", "0-5", "5-10", "10-15", "15-20", "20-30", "30+"] as const;
    const hcpBins: Record<string, { m: number; f: number }> = Object.fromEntries(HCP_BINS.map(k => [k, { m: 0, f: 0 }]));
    let male = 0, female = 0;
    let activeThisYear = 0, withHcp = 0;
    let pros = 0;
    let totalHcp = 0;

    const binKey = (h: number): string => {
      if (h < 0) return "plus";
      if (h < 5) return "0-5";
      if (h < 10) return "5-10";
      if (h < 15) return "10-15";
      if (h < 20) return "15-20";
      if (h < 30) return "20-30";
      return "30+";
    };

    for (const f of federados) {
      const isM = f.gender === "M";
      const isF = f.gender === "F";
      const cp = f.country_prefix || "?";
      if (!byCountry[cp]) byCountry[cp] = { count: 0, m: 0, f: 0, name: f.country || cp };
      byCountry[cp].count++;
      if (isM) byCountry[cp].m++; else if (isF) byCountry[cp].f++;
      if (!byAge[f.age_level]) byAge[f.age_level] = { m: 0, f: 0 };
      if (isM) byAge[f.age_level].m++; else if (isF) byAge[f.age_level].f++;
      if (!byAgeFull[f.age_level]) byAgeFull[f.age_level] = [];
      byAgeFull[f.age_level].push(f);
      if (isM) male++; else if (isF) female++;

      const key = f.club_code || "?";
      if (!byClub[key]) byClub[key] = { name: f.acronym || f.club_name || "?", m: 0, f: 0, members: [] };
      if (isM) byClub[key].m++; else if (isF) byClub[key].f++;
      byClub[key].members.push(f);

      if (f.admission_date) {
        const y = f.admission_date.slice(0, 4);
        if (!byAdmissionYear[y]) byAdmissionYear[y] = { m: 0, f: 0 };
        if (isM) byAdmissionYear[y].m++; else if (isF) byAdmissionYear[y].f++;
      }
      if ((f.rounds_current_year || 0) > 0) activeThisYear++;
      if (f.player_type_id === 2 || f.player_type === "Profissional") pros++;
      if (f.hcp_exact != null) {
        withHcp++;
        totalHcp += f.hcp_exact;
        const k = binKey(f.hcp_exact);
        if (isM) hcpBins[k].m++; else if (isF) hcpBins[k].f++;
      }
    }

    const topCountries = Object.entries(byCountry)
      .map(([cp, v]) => ({ cp, count: v.count, m: v.m, f: v.f, name: v.name }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
    const allClubs = Object.entries(byClub)
      .map(([code, c]) => [code, { ...c, count: c.m + c.f }] as [string, typeof c & { count: number }])
      .sort((a, b) => b[1].count - a[1].count);
    const topBestHcp = [...federados]
      .filter(f => f.hcp_exact != null)
      .sort((a, b) => (a.hcp_exact as number) - (b.hcp_exact as number))
      .slice(0, 20);
    const avgHcp = withHcp > 0 ? totalHcp / withHcp : 0;

    const admissionYears = Object.entries(byAdmissionYear)
      .filter(([y]) => Number(y) >= 2000)
      .sort((a, b) => a[0].localeCompare(b[0]));

    return {
      total: federados.length, male, female, withHcp, avgHcp,
      activeThisYear, pros,
      byAge, byAgeFull, topCountries, allClubs, topBestHcp,
      admissionYears, hcpBins, hcpBinOrder: HCP_BINS,
    };
  }, [federados, viewMode]);

  const toggleEscalao = (esc: string) => {
    clearSelection();
    setEscalaoFilter(prev => {
      const next = new Set(prev);
      if (next.has(esc)) next.delete(esc);
      else next.add(esc);
      return next;
    });
  };

  const clearEscalao = () => {
    clearSelection();
    setEscalaoFilter(new Set());
  };

  const escalaoCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    let list = allPlayers;
    const qq = norm(q);
    if (qq) {
      const words = qq.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const haystack = norm([p.name, clubShort(p), p.escalao, p.fed, p.region, ...(p.tags || [])].join(" "));
        return words.every(w => haystack.includes(w));
      });
    }
    if (sexFilter !== "ALL") list = list.filter(p => p.sex === sexFilter);
    if (regionFilter !== "ALL") list = list.filter(p => p.region === regionFilter);
    list = list.filter(p => !p.tags?.includes("hidden"));
    for (const p of list) {
      if (p.escalao) map[p.escalao] = (map[p.escalao] || 0) + 1;
    }
    return map;
  }, [allPlayers, q, sexFilter, regionFilter]);

  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = allPlayers;
    if (qq) {
      const words = qq.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const haystack = norm([p.name, clubShort(p), p.escalao, p.fed, p.region, ...(p.tags || [])].join(" "));
        return words.every(w => haystack.includes(w));
      });
    }
    if (sexFilter !== "ALL") list = list.filter(p => p.sex === sexFilter);
    // Ocultar seniores por defeito (Absoluto/MidAmateur/Sénior/SuperSenior)
    // — só aplica quando não há filtro de escalão activo (senão respeitamos a escolha explícita)
    if (!includeSeniors && escalaoFilter.size === 0) {
      list = list.filter(p => p.escalao !== "Absoluto" && p.escalao !== "MidAmateur" && p.escalao !== "Sénior" && p.escalao !== "SuperSenior");
    }
    if (escalaoFilter.size > 0) list = list.filter(p => escalaoFilter.has(p.escalao));
    if (regionFilter !== "ALL") list = list.filter(p => p.region === regionFilter);
    if (viewMode === "todos" && natFilter !== "ALL") {
      list = list.filter(p => {
        const cp = (p as any)._federadoRaw?.country_prefix;
        if (natFilter === "PT") return cp === "PT" || !cp;
        return cp && cp !== "PT";
      });
    }
    if (clubFilter !== "ALL") {
      list = list.filter(p => {
        const code = typeof p.club === "object" ? p.club?.code : undefined;
        return code === clubFilter;
      });
    }
    // Filtro HCP range
    const hMin = hcpMin.trim() === "" ? null : parseFloat(hcpMin.replace(",", "."));
    const hMax = hcpMax.trim() === "" ? null : parseFloat(hcpMax.replace(",", "."));
    if (hMin != null && !isNaN(hMin)) list = list.filter(p => p.hcp != null && p.hcp >= hMin);
    if (hMax != null && !isNaN(hMax)) list = list.filter(p => p.hcp != null && p.hcp <= hMax);
    // Filtro "Activos" — jogadores com actividade recente (nº rondas > 0).
    // Usa a MESMA base de cálculo que a ordenação "voltas" e o KPI do detalhe:
    //  - para os nossos: statsDb.roundsLast12m (janela móvel de 12 meses)
    //  - para federados-only: rounds_current_year do cadastro FPG
    // (antes usávamos só rounds_current_year, que no FPG é muito restritivo
    // — só conta rondas oficiais — deixando 380 dos 396 nossos a 0).
    if (activeOnlyFilter) {
      list = list.filter(p => {
        const ps = statsDb[p.fed];
        if (ps?.roundsLast12m != null && ps.roundsLast12m > 0) return true;
        if (ps?.lastRoundDate && ps.lastRoundDate.startsWith(String(new Date().getFullYear()))) return true;
        const rcy = (p as any)._federadoRaw?.rounds_current_year;
        if (typeof rcy === "number" && rcy > 0) return true;
        return false;
      });
    }
    // Filtro fonte (só em TODOS)
    if (viewMode === "todos" && sourceFilter !== "ALL") {
      list = list.filter(p => {
        const src = (p as any)._source;
        if (sourceFilter === "WITH_ANALYSIS") return src === "both" || src === "players";
        if (sourceFilter === "CADASTRO") return src === "feds";
        return true;
      });
    }
    list = list.filter(p => !p.tags?.includes("hidden"));
    if (newFilter) list = list.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; });

    // Ordenação com direcção (asc/desc) e ordem semântica para escalão
    const dir = sortDir === "asc" ? 1 : -1;
    // Pin: Manuel, Gastão e o top 5 de cada escalão do Campeonato Nacional de
    // Jovens (ver constants/pinnedPlayers.ts) flutuam para o topo, na ordem de
    // PIN_RANK, quando ordenamos por Nome. Os restantes seguem a ordem normal.
    const pinActive = prioritizeJuniors && sortKey === "name";
    return [...list].sort((a, b) => {
      if (pinActive) {
        const ra = PIN_RANK.get(a.fed);
        const rb = PIN_RANK.get(b.fed);
        if (ra != null || rb != null) {
          if (ra == null) return 1;
          if (rb == null) return -1;
          if (ra !== rb) return ra - rb;
        }
      }
      switch (sortKey) {
        case "name": return dir * a.name.localeCompare(b.name, "pt");
        case "hcp": return dir * ((a.hcp ?? 999) - (b.hcp ?? 999));
        case "club": return dir * clubShort(a).localeCompare(clubShort(b), "pt");
        case "escalao": {
          const ai = ESC_IDX.get(a.escalao) ?? 999;
          const bi = ESC_IDX.get(b.escalao) ?? 999;
          return dir * (ai - bi);
        }
        case "ranking": return dir * ((a.hcp ?? 999) - (b.hcp ?? 999));
        case "rounds": {
          // "Rondas" = rondas no ano civil corrente (Jan→hoje).
          // statsDb.roundsCurrentYear é gerado por enrich-players.js a
          // partir do data.json — MESMA fonte que o detalhe da ficha de
          // jogador, garantindo que o número do sidebar bate com o do
          // detalhe header ("N em {ano}"). Para federados-only (sem data.json)
          // cai para roundsLast12m e depois para roundsTotal.
          const roundCount = (p: typeof a): number => {
            const ps = statsDb[p.fed];
            if (ps?.roundsCurrentYear != null) return ps.roundsCurrentYear;
            const rcy = (p as any)._federadoRaw?.rounds_current_year;
            if (typeof rcy === "number" && rcy > 0) return rcy;
            if (ps?.roundsLast12m != null) return ps.roundsLast12m;
            return ps?.roundsTotal ?? 0;
          };
          return dir * (roundCount(a) - roundCount(b)) || (dir * ((statsDb[a.fed]?.roundsTotal ?? 0) - (statsDb[b.fed]?.roundsTotal ?? 0)));
        }
        case "aces": {
          // Nº de holes-in-one (statsDb.aces, gerado por enrich-players.js).
          // Desempate por nome para estabilidade entre jogadores com 0.
          const av = statsDb[a.fed]?.aces ?? 0;
          const bv = statsDb[b.fed]?.aces ?? 0;
          return (dir * (av - bv)) || a.name.localeCompare(b.name, "pt");
        }
        default: return 0;
      }
    });
  }, [allPlayers, q, sexFilter, escalaoFilter, regionFilter, natFilter, clubFilter, viewMode, sortKey, sortDir, newFilter, statsDb, hcpMin, hcpMax, activeOnlyFilter, sourceFilter, includeSeniors, prioritizeJuniors]);

  // Contagem de filtros activos — partilhada entre o badge da Toolbar
  // (botão "✕ Limpar N") e o FilteredStatsCard no detail pane.
  const activeFiltersCount = useMemo(() => {
    return [
      q !== "",
      sexFilter !== "ALL",
      escalaoFilter.size > 0,
      regionFilter !== "ALL",
      natFilter !== "ALL",
      clubFilter !== "ALL",
      hcpMin !== "",
      hcpMax !== "",
      activeOnlyFilter,
      sourceFilter !== "ALL",
      newFilter,
    ].filter(Boolean).length;
  }, [q, sexFilter, escalaoFilter, regionFilter, natFilter, clubFilter, hcpMin, hcpMax, activeOnlyFilter, sourceFilter, newFilter]);

  // Ranking positions based on HCP (global, not filtered)
  const rankings = useMemo(() => {
    const withHcp = allPlayers
      .filter(p => p.hcp != null)
      .sort((a, b) => (a.hcp ?? 999) - (b.hcp ?? 999));
    const map = new Map<string, number>();
    withHcp.forEach((p, i) => map.set(p.fed, i + 1));
    return map;
  }, [allPlayers]);

  /* Helper — limpa APENAS o estado de selecção (mostra FilteredStatsCard).
     A URL fica como está (ex: /jogadores/52884) — é tratada como "última
     posição" e não como "estado actual". Se o user fizer F5, volta ao
     Manuel; mas enquanto navega o estado interno pode estar dessincronizado
     da URL para permitir TODOS, filtros, etc.
     IMPORTANTE: marca `internalNav` para que o URL sync useEffect não
     re-aplique imediatamente o urlFed quando o componente re-renderizar. */
  const clearSelection = () => {
    if (selectedFed !== null) {
      internalNav.current = true;
      setSelectedFed(null);
    }
  };

  const selected = useMemo(() => {
    if (!selectedFed) return null;
    const inAll = allPlayers.find(p => p.fed === selectedFed);
    if (inAll) return inAll;
    // Fallback 1: jogador não está em allPlayers (ex: cheguei de /nacionais-jovens
    // com fed externo que não foi carregado pelo modo Nossos). Procurar
    // directamente em federados.json e construir entry sintético — assim
    // a página renderiza sempre, mostrando vista federado mínima.
    if (federados && federados.length > 0) {
      const fp = federados.find(f => String(f.federation_code) === String(selectedFed));
      if (fp) {
        const baseP = federadoToPlayer(fp);
        const synth = {
          ...baseP,
          fed: String(selectedFed),
          _source: "feds" as const,
          _federadoRaw: fp,
        } as MergedPlayer & { fed: string };
        return synth;
      }
    }
    // Fallback 2: nem em allPlayers nem em federados (jogador inactivo
    // histórico, fed code antigo, ou ainda por carregar). Construir stub
    // mínimo a partir do fed code para que `FederadoOnlyDetail` renderize
    // e faça fetch live a `getPlayerHistory(fed)` — se o fed existir mesmo
    // na FPG, o user vê as rondas WHS reais; senão vê erro amigável.
    // Sem esta entry sintética, o user clicava num nome antigo e caía
    // numa página em branco / FilteredStatsCard genérico.
    const fedStr = String(selectedFed);
    const stub: MergedPlayer & { fed: string } = {
      fed:            fedStr,
      name:           `Federado ${fedStr}`,
      sex:            "",
      escalao:        "",
      club:           { short: "", long: "", code: "" },
      hcp:            null,
      hcpExact:       null,
      region:         "",
      dob:            null,
      _source:        "feds" as const,
      _federadoRaw:   syntheticFederadoFromFedCode(fedStr),
    } as unknown as MergedPlayer & { fed: string };
    return stub;
  }, [allPlayers, selectedFed, federados]);

  return (
    <div className="jogadores-page">
      <Toolbar>
                <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Jogadores" />
        {/* Toggle Nossos / TODOS (lazy-load federados.json) */}
        {(() => {
          // Contagens reactivas ao filtro de seniores. Quando seniores estão
          // ocultos, mostramos o nº de não-seniores para bater certo com a lista.
          const isSenior = (esc: string) => esc === "Absoluto" || esc === "MidAmateur" || esc === "Sénior" || esc === "SuperSenior";
          // Coerção "?"/vazio → "Absoluto" coerente com allPlayers
          const fixEsc = (esc: string | undefined | null): string =>
            (!esc || esc === "?" || esc === "Outros") ? "Absoluto" : esc;
          const nossosTotal = Object.keys(players).length;
          const nossosNonSenior = Object.values(players).filter(p => !isSenior(fixEsc(p.escalao))).length;
          const todosTotal = federados ? federados.length : null;
          // Usa a MESMA normalização que o sidebar (federadoToPlayer →
          // normalizeAgeLevel) para bater certo com o que aparece listado.
          // Mapa: Senior→Sénior, SuperSenior→Sénior, MidAmateur→Absoluto.
          const todosNonSenior = federados
            ? federados.filter(f => {
                const norm = normalizeAgeLevel(f.age_level);
                return !isSenior(norm);
              }).length
            : null;
          const nossosShown = includeSeniors ? nossosTotal : nossosNonSenior;
          const todosShown = todosTotal == null ? null : (includeSeniors ? todosTotal : todosNonSenior!);
          return (
            <div className="segmented-toggle" role="tablist" aria-label="Fonte de jogadores">
              <button
                role="tab"
                aria-selected={viewMode === "ours"}
                className={`seg-btn ${viewMode === "ours" ? "active" : ""}`}
                onClick={() => { clearSelection(); setViewMode("ours"); }}
                title={includeSeniors
                  ? `${nossosTotal} jogadores com análise detalhada`
                  : `${nossosNonSenior} não-seniores (total ${nossosTotal} com seniores)`}
              >
                <span className="seg-label">Nossos</span>
                <span className="seg-count">{nossosShown}</span>
              </button>
              <button
                role="tab"
                aria-selected={viewMode === "todos"}
                className={`seg-btn ${viewMode === "todos" ? "active" : ""}`}
                onClick={() => { clearSelection(); setFederadosError(null); setViewMode("todos"); }}
                title={federadosError ? `Erro: ${federadosError}` : (includeSeniors ? "Lista FPG completa (cadastro)" : `Sem seniores — total ${todosTotal ?? "?"} com seniores`)}
                style={federadosError ? { background: "var(--color-warn-vivid)", color: "#fff" } : undefined}
              >
                <span className="seg-label">TODOS</span>
                <span className="seg-count">
                  {todosShown != null ? todosShown.toLocaleString("pt-PT")
                    : loadingFeds ? "⏳"
                    : federadosError ? "⚠"
                    : "15k+"}
                </span>
              </button>
            </div>
          );
        })()}
        {viewMode === "todos" && federadosError && (
          <div className="muted fs-10" style={{ color: "var(--color-warn-vivid)", fontWeight: 600 }}>
            ⚠ Erro a carregar federados.json: {federadosError}
          </div>
        )}
        {/* ORDEM: Nome · Sexo · Nacionalidade · Região · Clube · [Novos] · Jovens · Seniores · Stats */}
        <input className="input" value={q} onChange={e => { setQ(e.target.value); clearSelection(); }}
          placeholder="Nome, clube, n.º federado…" />
        <select className="select" value={sexFilter} onChange={e => { clearSelection(); setSexFilter(e.target.value as SexFilter); }}>
          <option value="ALL">Sexo</option><option value="M">Masculino</option><option value="F">Feminino</option>
        </select>
        {viewMode === "todos" && (
          <select className="select" value={natFilter} onChange={e => { clearSelection(); setNatFilter(e.target.value as typeof natFilter); }} title="Nacionalidade">
            <option value="ALL">Nacionalidade</option>
            <option value="PT">🇵🇹 Portugueses</option>
            <option value="FOREIGN">🌍 Estrangeiros</option>
          </select>
        )}
        <select className="select" value={regionFilter} onChange={e => { clearSelection(); setRegionFilter(e.target.value); }}>
          <option value="ALL">Região</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="select" value={clubFilter} onChange={e => { clearSelection(); setClubFilter(e.target.value); }} title="Clube">
          <option value="ALL">Todos os clubes</option>
          {clubOptions.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        {/* Acções rápidas: Novos · Jovens · Seniores · Stats (TODOS) */}
        {Object.keys(statsDb).length > 0 && (() => {
          const newCount = allPlayers.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; }).length;
          if (newCount === 0) return null;
          return (
            <button
              className={`p p-icon-only p-novo${newFilter ? " active" : ""}`}
              onClick={() => { clearSelection(); setNewFilter(v => !v); }}
              title={newFilter
                ? `Filtrando ${newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias — clicar para limpar`
                : `Mostrar só os ${newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias`}
              style={{ background: newFilter ? "var(--color-good)" : undefined, color: newFilter ? "#fff" : undefined, borderColor: newFilter ? "var(--color-good)" : "var(--border-best)" }}
            >
              <span className="p-icon-big" aria-hidden="true">🟢</span>
              <span className="p-filter-count">{newCount}</span>
            </button>
          );
        })()}
        <button
          className={`p p-icon-only ${isJuvenilFilter ? "active" : ""}`}
          onClick={() => {
            clearSelection();
            if (isJuvenilFilter) {
              setEscalaoFilter(new Set());
            } else {
              const jovens = new Set(["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21"]);
              setEscalaoFilter(jovens);
            }
          }}
          title={isJuvenilFilter ? "Limpar filtro de jovens" : "Só escalões jovens (Sub-10 a Sub-21)"}
        >
          <span className="p-icon-big" aria-hidden="true">🧒</span>
        </button>
        <button
          className={`p p-icon-only ${includeSeniors ? "active" : ""}`}
          onClick={() => { clearSelection(); setIncludeSeniors(v => !v); }}
          title={includeSeniors ? "Ocultar seniores (Absoluto/Sénior/SuperSenior/MidAmateur)" : "Mostrar também seniores"}
          style={includeSeniors ? { background: "var(--color-good)", color: "#fff" } : undefined}
        >
          <span className="p-icon-big" aria-hidden="true">👴</span>
        </button>
        <button
          className={`p p-icon-only ${prioritizeJuniors ? "active" : ""}`}
          onClick={() => { clearSelection(); setPrioritizeJuniors(v => !v); }}
          title={prioritizeJuniors
            ? "Manuel, Gastão e top 5 de cada escalão do Nacional de Jovens no topo (clicar para ordem alfabética pura)"
            : "Fixar Manuel, Gastão e top 5 do Nacional de Jovens no topo da lista"}
          style={prioritizeJuniors ? { background: "var(--accent)", color: "#fff" } : undefined}
        >
          <span className="p-icon-big" aria-hidden="true">⭐</span>
        </button>
        {viewMode === "todos" && (
          <button
            className={`p ${showStats ? "active" : ""}`}
            onClick={() => setShowStats(s => !s)}
            title="Estatísticas globais"
          >
            📊
          </button>
        )}
        {/* Escalão pills — em NOSSOS sempre visíveis; em TODOS só quando o filtro
             de jovens está activo. Com Jovens activo escondemos pills de
             Absoluto/Sénior/SuperSenior/MidAmateur (não fazem sentido no contexto). */}
        {(viewMode === "ours" || isJuvenilFilter || escalaoFilter.size > 0) && (
          <div className="escalao-pills">
            {escalaoFilter.size > 0 && (
              <button className="p p-esc-clear" onClick={clearEscalao} title="Limpar filtros">✕</button>
            )}
            {escaloes.map(esc => {
              const active = escalaoFilter.has(esc);
              const cls = escCls(esc);
              const count = escalaoCountMap[esc] || 0;
              if (count === 0 && !active) return null;
              // Quando filtro Jovens está activo, não mostrar pills de seniores.
              const isSeniorEsc = esc === "Absoluto" || esc === "MidAmateur" || esc === "Sénior" || esc === "SuperSenior";
              if (isJuvenilFilter && isSeniorEsc) return null;
              return (
                <button
                  key={esc}
                  className={`p p-esc-filter p-${cls}${active ? " active" : ""}`}
                  onClick={() => toggleEscalao(esc)}
                  title={`${esc} (${count})`}
                >
                  {esc.replace("Sub-", "S")}{count > 0 && <span className="p-filter-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* HCP range */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input
            className="input" type="number" step="0.1" min="-10" max="54"
            value={hcpMin} onChange={e => { clearSelection(); setHcpMin(e.target.value); }}
            placeholder="HCP min" title="HCP mínimo"
            style={{ width: 72 }}
          />
          <span className="muted fs-10">–</span>
          <input
            className="input" type="number" step="0.1" min="-10" max="54"
            value={hcpMax} onChange={e => { clearSelection(); setHcpMax(e.target.value); }}
            placeholder="HCP max" title="HCP máximo"
            style={{ width: 72 }}
          />
        </div>
        {/* Activos (ambos os modos) — com rondas este ano */}
        <button
          className={`p ${activeOnlyFilter ? "active" : ""}`}
          onClick={() => { clearSelection(); setActiveOnlyFilter(v => !v); }}
          title={`Jogadores com rondas em ${new Date().getFullYear()} (união: player-stats locais + cadastro FPG)`}
          style={{ background: activeOnlyFilter ? "var(--color-good)" : undefined, color: activeOnlyFilter ? "#fff" : undefined }}
        >
          🏌️ Activos
        </button>
        {/* Fonte — só TODOS */}
        {viewMode === "todos" && (
          <select
            className="select" value={sourceFilter}
            onChange={e => { clearSelection(); setSourceFilter(e.target.value as typeof sourceFilter); }}
            title="Origem dos dados"
          >
            <option value="ALL">Fonte (todos)</option>
            <option value="WITH_ANALYSIS">🔍 Com análise</option>
            <option value="CADASTRO">ø Só cadastro</option>
          </select>
        )}
        {/* Sort: key + direction toggle */}
        <div style={{ display: "inline-flex", alignItems: "stretch", gap: 0 }}>
          <select
            className="select"
            value={sortKey}
            onChange={e => {
              const k = e.target.value as SortKey;
              setSortKey(k);
              setSortDir(k === "rounds" || k === "aces" ? "desc" : "asc");
            }}
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          >
            <option value="name">Ordenar: Nome</option>
            <option value="hcp">Ordenar: Handicap</option>
            <option value="club">Ordenar: Clube</option>
            <option value="escalao">Ordenar: Escalão</option>
            <option value="ranking">Ordenar: 🏆 Ranking</option>
            <option value="rounds">Ordenar: Voltas</option>
            <option value="aces">Ordenar: 🕳️ Hole-in-one</option>
          </select>
          <button
            className="p"
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            title={sortDir === "asc" ? "Ordem crescente (clica para inverter)" : "Ordem decrescente (clica para inverter)"}
            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: "0 8px", minWidth: 34 }}
          >
            {sortDir === "asc" ? "▲" : "▼"}
          </button>
        </div>
        {/* Limpar filtros + badge */}
        {activeFiltersCount > 0 && (
          <button
            className="p"
            onClick={() => {
              clearSelection();
              setQ(""); setSexFilter("ALL"); setEscalaoFilter(new Set());
              setRegionFilter("ALL"); setNatFilter("ALL"); setClubFilter("ALL");
              setHcpMin(""); setHcpMax("");
              setActiveOnlyFilter(false); setSourceFilter("ALL"); setNewFilter(false);
              setPrioritizeJuniors(false); // volta à ordem alfabética pura
            }}
            title="Limpar todos os filtros activos"
            style={{ background: "var(--color-warn-vivid)", color: "#fff", gap: 4 }}
          >
            ✕ Limpar <span className="p-filter-count">{activeFiltersCount}</span>
          </button>
        )}
        <Counter ml="auto">{filtered.length} jogadores</Counter>
        <span style={{ display: "inline-flex", gap: 6, fontSize: 10, opacity: 0.6, whiteSpace: "nowrap" }}>
          <a
            href="/analise-percurso-juniores.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Análise de percurso de juniores"
            style={{ color: "var(--text-muted, inherit)", textDecoration: "none" }}
          >
            ↗ percurso
          </a>
          <span aria-hidden>·</span>
          <a
            href="/jogadores-por-ano"
            target="_blank"
            rel="noopener noreferrer"
            title="Jogadores por ano"
            style={{ color: "var(--text-muted, inherit)", textDecoration: "none" }}
          >
            ↗ por ano
          </a>
        </span>
      </Toolbar>

      <div className="master-detail">
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {viewMode === "todos" && !isJuvenilFilter && filtered.length > MAX_SIDEBAR_ITEMS && (
            <div className="muted fs-10 p-8 ta-c" style={{ borderBottom: "1px solid var(--border)" }}>
              A mostrar os primeiros {MAX_SIDEBAR_ITEMS} de {filtered.length.toLocaleString("pt-PT")} — refine os filtros para ver mais
            </div>
          )}
          {viewMode === "todos" && isJuvenilFilter && (() => {
            // KPI por escalão jovem — contagem total e por sexo
            const jovensOrdem = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21"];
            const stats: Record<string, { total: number; m: number; f: number }> = {};
            for (const esc of jovensOrdem) stats[esc] = { total: 0, m: 0, f: 0 };
            for (const p of filtered) {
              const s = stats[p.escalao];
              if (s) {
                s.total++;
                if (p.sex === "M") s.m++;
                else if (p.sex === "F") s.f++;
              }
            }
            return (
              <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-subtle, rgba(59,130,246,0.05))", padding: "6px 8px" }}>
                <div className="muted fs-10" style={{ marginBottom: 4 }}>
                  🧒 {filtered.length.toLocaleString("pt-PT")} jogadores jovens — todos visíveis
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 4 }}>
                  {jovensOrdem.map(esc => {
                    const s = stats[esc];
                    if (!s || s.total === 0) return null;
                    return (
                      <div key={esc} style={{ padding: "4px 6px", background: "var(--bg, white)", borderRadius: 4, fontSize: 11 }}>
                        <div className="fw-700">{esc}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <b>{s.total}</b>
                          <span className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            ({s.m}<SexBadge sex="M" size="sm" /> {s.f}<SexBadge sex="F" size="sm" />)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {filtered.slice(0, viewMode === "todos" && !isJuvenilFilter ? MAX_SIDEBAR_ITEMS : filtered.length).map(p => {
            const isActive = selected?.fed === p.fed;
            const displayClub = (isActive && playerMeta?.club) ? playerMeta.club : clubShort(p);
            const displayEscalao = (isActive && playerMeta?.escalao) ? playerMeta.escalao : p.escalao;
            const displayHcp = (isActive) ? (playerMeta?.latestHcp ?? null) : p.hcp;
            const rank = rankings.get(p.fed);
            const ps = statsDb[p.fed];
            const d = daysSince(ps);
            const isNewRound = d != null && d <= NEW_DAYS;
            const escHcps = hcpStatsByEscalao[displayEscalao];
            // Rondas total: do data.json via player-stats.json.
            // Para o JOGADOR SELECCIONADO, usar directamente data.DATA (via
            // playerMeta) — garante consistência mesmo que player-stats.json
            // esteja desfasado / data.json esteja corrompido para outros feds.
            const isThisActive = isActive;
            let roundsTotal: number | null = ps?.roundsTotal ?? null;
            let roundsCurrentYear: number | null = ps?.roundsCurrentYear ?? null;
            if (isThisActive && playerMeta) {
              if (typeof playerMeta.totalRounds === "number" && playerMeta.totalRounds > 0) {
                roundsTotal = playerMeta.totalRounds;
              }
              if (typeof playerMeta.roundsCurrentYear === "number") {
                roundsCurrentYear = playerMeta.roundsCurrentYear;
              }
            }
            if (roundsCurrentYear == null) {
              const rcy = (p as typeof p & { _federadoRaw?: FederadoRaw })._federadoRaw?.rounds_current_year;
              roundsCurrentYear = typeof rcy === "number" && rcy > 0 ? rcy : null;
            }
            return (
              <PlayerSidebarItem
                key={p.fed}
                p={p as PlayerSidebarPlayer}
                isActive={isActive}
                displayClub={typeof displayClub === "string" ? displayClub : displayClub != null ? String(displayClub) : null}
                displayEscalao={displayEscalao}
                displayHcp={displayHcp}
                rank={rank}
                rankingMode={rankingMode}
                isNewRound={isNewRound}
                escHcps={escHcps}
                roundsTotal={roundsTotal}
                roundsCurrentYear={roundsCurrentYear}
                onClick={e => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    selectPlayer(p.fed);
                    md.onSelect();
                  }
                }}
              />
            );
          })}
          {filtered.length === 0 && <EmptyState size="sm" message="Nenhum jogador encontrado" />}
        </div>

        <div className="course-detail jog-detail" ref={md.detailRef}>
          {showStats && viewMode === "todos" && globalStats ? (
            <FederadosStatsPanel
              stats={globalStats}
              inativosStats={inativosStats}
              drillDown={drillDown}
              onDrillDown={setDrillDown}
              hcpBinDrill={hcpBinDrill}
              onHcpBinDrill={setHcpBinDrill}
              federados={federados}
              onClose={() => { setShowStats(false); setDrillDown(null); setHcpBinDrill(null); }}
              onPickPlayer={fed => { setShowStats(false); setDrillDown(null); setHcpBinDrill(null); selectPlayer(fed); }}
            />
          ) : selected ? (
            (selected as typeof selected & { _source?: MergedPlayer["_source"] })._source === "feds"
              ? <FederadoOnlyDetail player={selected as MergedPlayer & { fed: string }} />
              : <PlayerDetail key={selected.fed} fedId={selected.fed} selected={selected} onMetaLoaded={setPlayerMeta} />
          ) : (
            <FilteredStatsCard
              filtered={filtered as FilteredPlayer[]}
              viewMode={viewMode}
              onPickPlayer={fed => { selectPlayer(fed); md.onSelect(); }}
              activeFiltersCount={activeFiltersCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}
