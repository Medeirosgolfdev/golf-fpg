/**
 * FFGPage.tsx — 🇫🇷 FFGolf · Torneios juvenis franceses
 *
 * Carrega o catálogo `public/data/ffgolf-catalog.json` (lista de torneios
 * mapeados) e, para cada um, tenta `public/data/ffgolf/{year}_{slug}.json`
 * (gerado pelo scraper). Os ficheiros têm par REAL, metros e SI vindos do
 * widget course_statistics do GolfGenius — não há adivinhação.
 *
 * Match play (knockout) é excluído pelo scraper. Só stroke play (qualifiers)
 * é mostrado.
 */
import React, { useEffect, useState, useMemo } from "react";
import { cachedFetchJson, invalidateCache } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { gf } from "../utils/flagUtils";
import { fmtFieldInfo } from "../utils/format";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../ui/Toolbar";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import DetailHeader from "../ui/DetailHeader";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import { RoundPill, ManuelPill } from "../ui/PillBadge";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import { IntlTournView } from "../ui/IntlTournView";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { KidsLinkCtx } from "../ui/KidsLink";

/* ── Tipos do ficheiro novo (1 torneio = 1 ficheiro) ──────────── */
interface CourseInfo {
  name: string;
  tee?: string;
  par: number[];
  meters: number[];
  si: number[];
  parTotal: number;
  metersTotal: number;
}
interface PlayerRound {
  round: number;
  gross: number;
  scores: number[];
  f9?: number;
  b9?: number;
}
interface FFGPlayer {
  id: string;
  pos: number | null;
  name: string;
  country: string;
  club: string;
  hcp: number | null;
  total: number | null;
  toPar: number | null;
  roundScores?: number[];   // novo formato genérico [r1, r2, ..., rN]
  /** legacy: alguns ficheiros antigos têm r1/r2 directos */
  r1?: number | null;
  r2?: number | null;
  rounds: PlayerRound[];
}
interface FFGTournament {
  tournament: string;
  slug: string;
  year: number;
  section: string;
  source: string;
  gg_page: string;
  gg_league?: string;
  course: CourseInfo;
  rounds: number;
  format: string;
  players: FFGPlayer[];
  scrapedAt?: string;
}

interface CatalogEntry {
  year: number;
  section: string;
  slug: string;
  title: string;
  gg_page: string | null;
  gg_league: string | null;
  ffgolf_url?: string;
}
interface Catalog {
  generated_at: string;
  source?: string;
  note?: string;
  tournaments: CatalogEntry[];
}

/* ── Normalização de nome (FFGolf usa "APELIDO Nome") ──────────── */
function normalizeName(raw: string): string {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  if (first.length >= 3 && first === first.toUpperCase() && /^[A-ZÀ-Ý-]+$/.test(first)) {
    const last = first.charAt(0) + first.slice(1).toLowerCase();
    return `${rest} ${last}`;
  }
  return trimmed;
}

/* ── Categoria/título amigável a partir do nome do torneio ────── */
function shortTitle(t: FFGTournament | CatalogEntry): string {
  const name = "title" in t ? t.title : t.tournament;
  return name
    .replace(/^Championnat de France des Jeunes\s*-\s*/i, "Champ. France ")
    .replace(/^Internationaux de France\s+/i, "Internat. France ")
    .replace(/^Championnat\s+/i, "Champ. ")
    .replace(/Trophée Crocodile/, "")
    .replace(/\s+\(Sage Valley\)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Adaptador FFG → FPGTournament (para reusar IntlTournView) ── */
function toFPGTournament(t: FFGTournament): FPGTournament {
  // Ordenar primeiro por total ascendente (pode estar fora de ordem nos JSONs antigos)
  // e atribuir pos sequencial se vier null
  const sorted = [...t.players].sort((a, b) => {
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });
  const players: FPGPlayer[] = sorted.map((p, idx) => {
    const roundScores: FPGRoundScore[] = p.rounds.map((r) => ({
      round: r.round,
      gross: r.gross,
      scores: r.scores,
      pars: t.course.par,
      si: t.course.si,
      meters: t.course.meters,
    }));
    const incomplete = p.rounds.length < t.rounds;
    // Position: usar p.pos se válido, senão idx+1
    const pos = (typeof p.pos === "number" && p.pos > 0) ? p.pos : (idx + 1);
    return {
      scoreId: p.id,
      pos,
      name: normalizeName(p.name),
      club: p.country ? `${gf(p.country)} ${p.club || p.country}` : p.club,
      grossTotal: p.total,
      toPar: p.toPar,
      hcpExact: p.hcp ?? undefined,
      nholes: t.course.par.length,
      parTotal: t.course.parTotal,
      scores: p.rounds[0]?.scores,
      par: t.course.par,
      si: t.course.si,
      meters: t.course.meters,
      roundScores,
      _wd: incomplete,
      _roundsPlayed: p.rounds.length,
    } as FPGPlayer;
  });
  return {
    name: `${t.year} // ${shortTitle(t)}`,
    tcode: `${t.year}_${t.slug}`,
    date: "",
    campo: t.course.name,
    rounds: t.rounds,
    playerCount: players.length,
    players,
  };
}

function ffgScorecardOptions(): ScorecardOptions {
  return {
    hideHCP: false,
    hideSD: true,
    hideEsc: true,
    hideFed: true,
    hideTee: true,
    clubLabel: "Clube",
  };
}

/* ── DivView ─────────────────────────────────────────────────── */
function DivView({ data }: { data: FFGTournament }) {
  const tournament = useMemo(() => toFPGTournament(data), [data]);
  const scOptions = useMemo(() => ffgScorecardOptions(), []);
  return <IntlTournView tournament={tournament} scOptions={scOptions} siLabel="m" />;
}

/* ── FStats ──────────────────────────────────────────────────── */
function FStats({ data }: { data: FFGTournament }) {
  const { players } = data;
  const full = players.filter((p) => p.rounds.length === data.rounds);
  const avg = full.length ? full.reduce((s, p) => s + (p.total ?? 0), 0) / full.length : 0;
  return (
    <div className="muted fs-10 mb-8">
      {full.length} jogadores
      {data.rounds > 1 && (
        <>
          {" "}(<RoundPill nR={data.rounds} />)
        </>
      )}
      {players.length > full.length ? ` + ${players.length - full.length} parciais` : ""}
      {full.length > 0 && (
        <>
          {" · "}Média total: {avg.toFixed(1)}
          {" · "}Líder: {normalizeName(full[0]?.name)} ({full[0]?.total})
          {" · "}Par {data.course.parTotal} · {data.course.metersTotal.toLocaleString("pt-PT")} m
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN CONTENT
   ═══════════════════════════════════════════════════════════════ */
function Content() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [data, setData] = useState<Map<string, FFGTournament>>(new Map());
  const [loading, setLoading] = useState(true);
  const [ti, setTi] = useState(0);
  const { kidsMap } = useKidsLinkMap();
  const md = useMasterDetail();
  const [fileMeta, setFileMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Invalidar cache para evitar respostas falhadas em cache
      invalidateCache("/data/ffgolf-catalog.json");
      try {
        const cat = await cachedFetchJson<Catalog>("/data/ffgolf-catalog.json");
        if (!cat) throw new Error("ffgolf-catalog.json não encontrado (404)");
        if (!alive) return;
        setCatalog(cat);
        setFileMeta((p) => [...p, { path: "/data/ffgolf-catalog.json", status: "loaded", count: cat.tournaments.length, group: "ffg" }]);

        // Tentar carregar cada torneio individualmente
        const dataMap = new Map<string, FFGTournament>();
        await Promise.all(
          cat.tournaments
            .filter((t) => t.gg_page)
            .map(async (t) => {
              const url = `/data/ffgolf/${t.year}_${t.slug}.json`;
              try {
                const td = await cachedFetchJson<FFGTournament>(url);
                if (td) dataMap.set(`${t.year}_${t.slug}`, td);
              } catch {
                /* missing file is fine */
              }
            })
        );
        if (!alive) return;
        setData(dataMap);
        setFileMeta((p) => [...p, { path: "/data/ffgolf/*.json", status: "loaded", count: dataMap.size, group: "ffg" }]);
        setLoading(false);
      } catch (e) {
        if (alive) {
          const msg = String((e as Error)?.message || e);
          setCatalogErr(msg);
          setFileMeta((p) => [...p, { path: "/data/ffgolf-catalog.json", status: "error", error: msg, group: "ffg" }]);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <LoadingState />;
  if (!catalog) {
    return (
      <div className="center-msg muted">
        Catálogo FFGolf não disponível.<br />
        <span className="fs-10">Esperado em <code>public/data/ffgolf-catalog.json</code></span>
        {catalogErr && <><br /><span className="fs-10" style={{ color: "var(--danger)" }}>Erro: {catalogErr}</span></>}
      </div>
    );
  }

  // Lista visível: só torneios que TÊM dados scrapados
  const visibleEntries = catalog.tournaments
    .filter((t) => t.gg_page && data.has(`${t.year}_${t.slug}`))
    .sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title));

  if (!visibleEntries.length) {
    return (
      <div className="center-msg muted">
        Nenhum torneio FFGolf scrapado ainda.<br />
        <span className="fs-10">
          {catalog.tournaments.length} torneios mapeados no catálogo. Falta scrape:
          coloca os JSONs em <code>public/data/ffgolf/{`{ano}_{slug}.json`}</code>.
        </span>
      </div>
    );
  }

  const safeIdx = Math.min(ti, visibleEntries.length - 1);
  const curEntry = visibleEntries[safeIdx];
  const cur = data.get(`${curEntry.year}_${curEntry.slug}`)!;

  // Agrupar por ano para sidebar
  const years = [...new Set(visibleEntries.map((e) => e.year))].sort((a, b) => b - a);

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <DataSourcesProvider tournaments={[]}>
        <div className="tourn-layout">
          <Toolbar>
            <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
            <ToolbarTitle>🇫🇷 FFG</ToolbarTitle>
            <DataSourcesChip sources={fileMeta} />
            {cur && cur.course?.name && <ToolbarMeta>📍 {cur.course.name}</ToolbarMeta>}
            {cur && (() => {
              const full = cur.players.filter((p) => p.rounds.length === cur.rounds).length;
              return <span className="chip ml-auto">{fmtFieldInfo(full, cur.rounds, shortTitle(cur))}</span>;
            })()}
          </Toolbar>

          <div className="master-detail">
            <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
              {years.map((year) => {
                const yearEntries = visibleEntries.filter((e) => e.year === year);
                return (
                  <React.Fragment key={year}>
                    <SidebarSectionTitle
                      dark
                      color="var(--color-ffg-dark)"
                      textColor="var(--color-ffg-text)"
                      borderColor="var(--color-ffg-mid)"
                      letterSpacing="0.08em"
                    >
                      🇫🇷 FFGolf — Torneios juvenis
                    </SidebarSectionTitle>
                    <div
                      className="sidebar-year-label"
                      style={{
                        padding: "2px 10px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: "#ffffff",
                        textTransform: "uppercase",
                        marginTop: 4,
                        background: "var(--color-ffg-dark)",
                      }}
                    >
                      {year}
                    </div>
                    {yearEntries.map((entry) => {
                      const idx = visibleEntries.indexOf(entry);
                      const t = data.get(`${entry.year}_${entry.slug}`);
                      if (!t) return null;
                      const full = t.players.filter((p) => p.rounds.length === t.rounds).length;
                      const manuelPlayed = t.players.some((p) => isM(p.name));
                      return (
                        <button
                          key={entry.slug}
                          className={`course-item ${safeIdx === idx ? "active" : ""}`}
                          onClick={() => {
                            setTi(idx);
                            md.onSelect();
                          }}
                        >
                          <div className="course-item-name">{shortTitle(t)}</div>
                          {t.course?.name && (
                            <div className="course-item-meta" style={{ fontWeight: 600, color: "var(--text-2)" }}>
                              ⛳ {t.course.name}
                              {t.course.tee ? ` · ${t.course.tee}` : ""}
                            </div>
                          )}
                          <div className="course-item-meta">
                            {full} jog{t.rounds > 1 && (
                              <>
                                {" "}· <RoundPill nR={t.rounds} />
                              </>
                            )}
                            {t.course?.parTotal ? ` · Par ${t.course.parTotal}` : ""}
                            {t.course?.metersTotal ? ` · ${t.course.metersTotal.toLocaleString("pt-PT")} m` : ""}
                          </div>
                          {manuelPlayed && (
                            <span style={{ display: "inline-block", marginTop: 4 }}>
                              <ManuelPill />
                            </span>
                          )}
                          <ExtLink
                            href={t.source}
                            className="tourn-ext-link"
                            style={{ marginTop: 4 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            🔗 Leaderboard oficial
                          </ExtLink>
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="course-detail" ref={md.detailRef}>
              {cur ? (
                <>
                  <DetailHeader
                    title={`${cur.year} // ${shortTitle(cur)}`}
                    sub={
                      <>
                        <span className="muted">
                          {cur.tournament}
                          {cur.course?.name && (
                            <>
                              {" "}— 📍 {cur.course.name}
                              {cur.course.tee ? ` (${cur.course.tee})` : ""}
                            </>
                          )}
                        </span>
                        <ExtLink href={cur.source} className="tourn-ext-link" style={{ marginLeft: 8 }}>
                          🔗 Leaderboard oficial
                        </ExtLink>
                      </>
                    }
                  />
                  <FStats data={cur} />
                  <DivView data={cur} />
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

export default function FFGPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <Content />;
}
