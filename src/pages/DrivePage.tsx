// @refresh reset
/**
 * DrivePage.tsx — DRIVE Tour & Challenge + AQUAPOR Results 2026
 * v10: Reads scraper v7 format directly (fedCode, roundScores)
 *      + multi-round support (R1/R2/Total tabs)
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import TabRow from "../ui/TabRow";
import { FilterPills } from "../ui/FilterPills";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import { resolveFedsInTournaments, buildEscLookup } from "../utils/playerUtils";
import { buildTemporalEscLookup } from "../data/fpgUtils";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import { ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { CircuitToolbarSlotCtx } from "../ui/circuit/toolbarSlot";
import { circuitRanking } from "../ui/circuit/CircuitRanking";
import { useFedBirthdates } from "../ui/InscricoesComponents";
import { availEscaloes, countEvents, driveEntriesByEsc, resolveEscForTournament, uniquePC } from "../data/drive/driveSub12";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import DriveEquipasTab, { type DriveEquipasData } from "./drive/DriveEquipasTab";
import { driveRanking, SERIE_LABELS } from "./drive/driveRanking";
import { calendarStatus, driveCalendar, type DriveCalEntry } from "../data/drive/driveCalendar";
import { todayIso } from "../utils/format";
import CircuitShell from "../ui/circuit/CircuitShell";
import { buildDriveEntries, DRIVE_CONFIG } from "../data/drive/driveCircuitData";
import { TournamentDetail } from "./fpg/TournamentDetail";
import { loadDriveAdmissions, loadDriveData, loadDriveEquipas } from "../data/drive/driveLoader";
import { attachDriveAdmissions, buildDriveSource, filterDriveSource, type DriveAdmissionsIndex, type DriveSeries } from "../data/drive/driveSource";
import {
  driveDivTkey, driveFiltersForTkey, driveQueryString, driveRepDivision, legacyDriveT, parseDriveQuery,
  resolveDriveTkey, type DriveUrlState,
} from "../data/drive/driveUrl";
import type { Tournament, DriveData } from "../ui/driveTypes";

/* ── Constants ── */
const REGIONS = [
  { id: "norte",   label: "Norte",   emoji: "📍" },
  { id: "tejo",    label: "Tejo",    emoji: "📍" },
  { id: "sul",     label: "Sul",     emoji: "📍" },
  { id: "madeira", label: "Madeira", emoji: "📍" },
  { id: "acores",  label: "Açores",  emoji: "📍" },
];
const REGION_EMOJI: Record<string, string>  = { norte: "🔵", tejo: "🟡", sul: "🟢", madeira: "🟣", acores: "🔴", nacional: "⚪" };

/* ─ Calendário da época (decisão E): sai dos dados — src/data/drive/driveCalendar.ts ─ */
const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
function UpcomingSchedule({ series, year, entries }: { series: DriveSeries; year: string; entries: DriveCalEntry[] }) {
  if (!entries.length) return null;
  const status = calendarStatus(entries, todayIso());
  return (
    <div className="card p-8-12">
      <div className="h-xs mb-6">📅 Calendário {SERIE_LABELS[series]} {year}</div>
      <div className="flex-wrap gap-4 drive-cal-list">
        {entries.map((e, i) => {
          const isNext = status[i] === "next", isPast = status[i] === "past";
          return (
            // Cor da série por classe (decisão C): tokens --drive-* + color-mix.
            <div key={i} className={`drive-cal-pill drive-serie-${series}` + (isNext ? " is-next" : isPast ? " is-past" : "")}>
              {REGION_EMOJI[e.region] || ""} <span className="fw-700">{ddmm(e.date)}{e.endDate ? "–" + ddmm(e.endDate) : ""}</span> {e.name} <span className="c-muted">{e.campo}</span>
              {isNext && <span className="badge-next">PRÓXIMO</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriveContent() {
  const [data, setData]           = useState<DriveData | null>(null);
  const [pdb, setPdb]             = useState<PlayersDB>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // Fallback DOB p/ federados fora de players.json curado.
  const fedBirthdates = useFedBirthdates();
  // O URL é a única fonte de verdade (decisão A, src/data/drive/driveUrl.ts):
  // o torneio/escalão no caminho /drive/torneio/{ccode}-{tcode}, os filtros na
  // query. Só as acções do utilizador mudam a query — nada se perde ao montar.
  const { tkey: urlTkey } = useParams<{ tkey?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const st = useMemo(() => parseDriveQuery(searchParams), [searchParams]);
  const tabParam = searchParams.get("tab");
  const legacyT = searchParams.get("t");
  const { nav: navMode, series, manuel: filterManuel, region: regionFilter, esc: escFilter,
    s12s: sub12Series, s12v: sub12View, s12x: sub12Sex, s12e: sub12Esc } = st;
  /** Muda filtros. Com `keepTkey` o torneio aberto fica (se deixar de estar
   *  visível, o shell abre o mais recente); sem ele volta-se a /drive. */
  const go = useCallback((patch: Partial<DriveUrlState>, keepTkey = true) => {
    const pathname = keepTkey && urlTkey ? location.pathname : "/drive";
    navigate({ pathname, search: driveQueryString({ ...st, ...patch }) }, { replace: true });
  }, [navigate, location.pathname, urlTkey, st]);
  /** Abre um torneio (tkey canónico); a aba fica só na aterragem (sem tkey). */
  const goTkey = useCallback((tk: string | null, nav: DriveUrlState["nav"] = st.nav) => {
    if (!tk) return;
    const pathname = `/drive/torneio/${tk}`;
    if (pathname === location.pathname && nav === st.nav) return;
    navigate({ pathname, search: driveQueryString({ ...st, nav }, urlTkey ? null : tabParam) }, { replace: true });
  }, [navigate, location.pathname, st, urlTkey, tabParam]);
  const md = useMasterDetail();
  const [sub12Search, setSub12Search]   = useState("");
  const [sub12Player, setSub12Player]   = useState<string | null>(null);

  const [monthlyMeta, setMonthlyMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    loadDriveData().then(({ raw: rawTournaments, tournaments: allTourns, meta, players: pp }) => {
      setMonthlyMeta(meta);
      setRaw(rawTournaments);
      const driveData: DriveData = {
        lastUpdated: "",
        source: "scoring.datagolf.pt",
        totalTournaments: allTourns.length,
        totalPlayers: allTourns.reduce((s, t) => s + t.playerCount, 0),
        totalScorecards: 0,
        tournaments: allTourns,
      };
      setData(driveData); setPdb(pp); setLoading(false);
      // Fed por nome (mexe nos jogadores) só depois do 1.º desenho.
      setTimeout(() => {
        resolveFedsInTournaments(driveData.tournaments, pp);
        setData({ ...driveData });
      }, 0);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Classificação por equipas (regiões) das Finais. Opcional: sem o ficheiro a
  // página funciona igual, só não aparece o separador «Equipas».
  const [equipasIdx, setEquipasIdx] = useState<Record<string, DriveEquipasData | null>>({});
  useEffect(() => {
    loadDriveEquipas().then((d) => { if (d) setEquipasIdx(d); });
  }, []);

  // Inscrições + draws da FPG (uma vez), por ccode-tcode.
  const [admDrawsIdx, setAdmDrawsIdx] = useState<DriveAdmissionsIndex>(new Map());
  const [raw, setRaw] = useState<Tournament[]>([]);
  const [admissionsMeta, setAdmissionsMeta] = useState<DataSource[]>([]);
  useEffect(() => {
    loadDriveAdmissions().then(({ idx, meta }) => {
      if (meta.status === "loaded") setAdmDrawsIdx(idx);
      setAdmissionsMeta([meta]);
    });
  }, []);

  // ── CircuitShell: entries a partir da lista CRUA (não-expandida) ─────────
  // O IntlTournView desenha as tabs de ronda a partir de results.players[].roundScores;
  // as secções Inscritos/Draw vêm de _admissions/_draws (anexados por tcode base).
  // Anos disponíveis — só os que têm torneios reais na série activa (exclui sub-rondas expandidas)
  const yearsOf = useCallback((sr: DriveUrlState["series"]) => {
    const s = new Set<string>();
    for (const t of data?.tournaments ?? []) {
      if ((sr === "all" || t.series === sr) && (!t._roundLabel || t._roundLabel === "Resumo")) {
        const y = t.date?.split("-")[0];
        if (y) s.add(y);
      }
    }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [data]);
  const availYears = useMemo(() => yearsOf(series), [yearsOf, series]);

  // Ano do URL só se existir na série (um `year` de outra série é ignorado, sem
  // reescrever o URL); por omissão o mais recente disponível.
  const yearFilter = st.year && (availYears.length === 0 || availYears.includes(st.year)) ? st.year : null;
  const activeYear = yearFilter ?? availYears[0] ?? null;
  const escLookup = useMemo(() => buildEscLookup(pdb, data?.tournaments ?? []), [pdb, data]);
  // Lookup temporal: fedCode → Map<year, escalão> — construído dos torneios Challenge históricos
  const temporalEscLookup = useMemo(
    () => buildTemporalEscLookup(data?.tournaments ?? []),
    [data]
  );
  const admissionsReady = admissionsMeta.length > 0;
  // Todos os torneios (resultados + por jogar), sem filtros: deep-links e `?t=`.
  const allSrc = useMemo(() => {
    if (raw.length === 0) return [];
    attachDriveAdmissions(raw, admDrawsIdx);
    return buildDriveSource(raw, admDrawsIdx);
  }, [raw, admDrawsIdx]);
  const driveEntries = useMemo(() => {
    if (allSrc.length === 0) return [];
    const src = filterDriveSource(allSrc, { series, year: yearFilter, region: regionFilter });
    let ents = buildDriveEntries(src);
    // Filtros ao nível da entrada: ★ Manuel e a «Classificação» por escalão
    // (decisão H: no Tour/AQUAPOR fica cada torneio só com esse escalão, em
    // cópias com as posições refeitas; no Challenge, os eventos com esse escalão).
    if (filterManuel) ents = ents.filter(e => e.hasManuel);
    if (escFilter.length > 0) {
      ents = driveEntriesByEsc(ents, escFilter, (p, t) => resolveEscForTournament(p, t, escLookup, pdb, temporalEscLookup, fedBirthdates));
    }
    // Detalhe IDÊNTICO à FPGPage: cada divisão (escalão) renderiza o TournamentDetail
    // da FPGPage — tabs flat (Inscrições·Draw·R1·R2·Resumo·Scorecards), que busca
    // inscrições/draws sozinho por ccode-tcode.
    for (const e of ents) {
      for (const d of e.divisions ?? []) {
        const t = d.results;
        if (!t) continue;  // as divisões do Drive trazem sempre `results`
        const eqData = equipasIdx[`${t.ccode}-${t.tcode}`];
        const equipasTab = eqData ? { key: "equipas", label: "Equipas", content: <DriveEquipasTab data={eqData} /> } : null;
        d.renderFull = (extras) => <TournamentDetail tournament={t} escLookup={escLookup} playersDB={pdb}
          extraTabs={[equipasTab, extras?.seasonTab, extras?.pastEditionsTab, extras?.repeatersTab].filter(Boolean) as { key: string; label: string; content: React.ReactNode }[]} />;
      }
    }
    return ents;
  }, [allSrc, series, yearFilter, regionFilter, filterManuel, escFilter, pdb, escLookup, temporalEscLookup, fedBirthdates, equipasIdx]);

  // Pool INTEGRAL para a tab "Edições anteriores" — TODOS os torneios (todos os
  // anos/séries/regiões), sem os filtros da sidebar nem os sintéticos futuros.
  // O Drive repete o mesmo evento várias vezes por ano (etapas), por vezes no
  // mesmo campo; a tab mostra-os todos como colunas. Sem este pool integral, as
  // irmãs ficavam limitadas ao ano/série/região filtrados na sidebar.
  const driveEditionsPool = useMemo(() => (raw.length === 0 ? [] : buildDriveEntries(raw)), [raw]);

  // ── Torneio aberto = o do caminho ────────────────────────────────────
  const shellSel = useMemo(() => resolveDriveTkey(driveEntries, urlTkey), [driveEntries, urlTkey]);
  // Um deep-link é «consumido» uma vez: se o torneio não está visível, mudam-se
  // série/ano/zona/escalão/★Manuel para ele aparecer; depois disso, mudar
  // filtros que o escondam abre o mais recente (o shell escolhe).
  const [tkeyDone, setTkeyDone] = useState<string | null>(null);
  const ready = !loading && admissionsReady && allSrc.length > 0;
  useEffect(() => {
    if (!ready || !urlTkey || tkeyDone === urlTkey) return;
    const patch = shellSel.id ? null : driveFiltersForTkey(allSrc, urlTkey, st, false);
    if (patch) go(patch);
    else setTkeyDone(urlTkey);
  }, [ready, urlTkey, tkeyDone, shellSel.id, allSrc, st, go]);
  // `?t={id}` antigo → /drive/torneio/{ccode}-{tcode}.
  useEffect(() => {
    if (!ready || !legacyT) return;
    const tk = legacyDriveT(buildDriveEntries(allSrc), legacyT);
    navigate({ pathname: tk ? `/drive/torneio/${tk}` : location.pathname, search: driveQueryString(st, tabParam) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, legacyT]);
  // Enquanto o deep-link (ou o `?t=`) não está resolvido, não se escolhe o
  // torneio por omissão (escolhia-se e reescrevia-se o URL).
  const tkeyPending = !shellSel.id && (!!legacyT || (!!urlTkey && tkeyDone !== urlTkey));
  // Por omissão (sem torneio no URL, ou o do URL escondido pelos filtros): o
  // mais recente/próximo — o primeiro por data, na ordem da lista (é a página
  // que escolhe, não o shell, que desempata pelo nome).
  useEffect(() => {
    if (!ready || shellSel.id || tkeyPending || driveEntries.length === 0) return;
    const latest = [...driveEntries].sort((a, b) => (b.dateStart || "").localeCompare(a.dateStart || ""))[0];
    goTkey(driveDivTkey(driveRepDivision(latest)));
  }, [ready, shellSel.id, tkeyPending, driveEntries, goTkey]);

  const inYear = (t: Tournament) => !activeYear || t.date?.startsWith(activeYear);

  const tourT    = useMemo(() => data?.tournaments.filter(t => t.series === "tour"      && inYear(t)) ?? [], [data, activeYear]);
  const allT     = useMemo(() => data?.tournaments.filter(t => inYear(t)) ?? [], [data, activeYear]);
  const challT   = useMemo(() => data?.tournaments.filter(t => t.series === "challenge" && inYear(t)) ?? [], [data, activeYear]);
  const aquaporT = useMemo(() => data?.tournaments.filter(t => t.series === "aquapor"   && inYear(t)) ?? [], [data, activeYear]);
  // escLookup definido acima (antes de driveEntries).




  // Ranking (decisões D e G): capacidade `ranking` do CircuitShell — vista
  // «🏅 Ranking» (nav=ranking-sub12 no URL) e a classificação acumulada na «Época».
  const rankingCap = useMemo(() => data ? circuitRanking(driveRanking({
    expanded: data.tournaments, pdb, escLookup, temporal: temporalEscLookup, fedBirthdates,
    series, seriesAll: sub12Series, year: activeYear, esc: sub12Esc, sex: sub12Sex, search: sub12Search,
    view: sub12View, selected: sub12Player,
    set: (p) => go(p),
    setSearch: setSub12Search,
    setSelected: setSub12Player,
    top: (s) => { const y = activeYear ?? todayIso().slice(0, 4); return <UpcomingSchedule series={s} year={y} entries={driveCalendar(allSrc, s, y)} />; },
  })) : undefined, [data, pdb, escLookup, temporalEscLookup, fedBirthdates, series, sub12Series, activeYear, sub12Esc, sub12Sex, sub12Search, sub12View, sub12Player, go, allSrc]);
  const shellConfig = useMemo(() => ({ ...DRIVE_CONFIG, color: "var(--color-good-dark)", filters: { search: true }, ranking: rankingCap }), [rankingCap]);

  // Série normal (tour/challenge/aquapor)
  const seriesT = series === "all" ? allT : series === "tour" ? tourT : series === "challenge" ? challT : aquaporT;
  const availRegions = useMemo(() => {
    const s = new Set(seriesT.map(t => t.region));
    return REGIONS.filter(r => s.has(r.id));
  }, [series, seriesT]);

  const regionT = useMemo(() => regionFilter ? seriesT.filter(t => t.region === regionFilter) : seriesT, [seriesT, regionFilter]);
  const uniquePCRegion    = useMemo(() => uniquePC(regionT), [regionT]);
  const countTour         = useMemo(() => countEvents(tourT), [tourT]);
  const countChall        = useMemo(() => countEvents(challT), [challT]);
  const countAquapor      = useMemo(() => countEvents(aquaporT), [aquaporT]);

  // Para series="all" mostramos sempre todos os escalões (fixo) — evita iterar todos os jogadores
  const availEscs = useMemo(() => {
    if (series === "all") return ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"];
    return availEscaloes(regionT, escLookup, pdb, temporalEscLookup, fedBirthdates);
  }, [series, regionT, escLookup, pdb, temporalEscLookup, fedBirthdates]);


  if (loading) return <LoadingState />;
  if (error)   return <div className="jogadores-page"><div className="notice-error drive-error">Erro: {error}</div></div>;
  if (!data)   return null;

  const allSources: DataSource[] = [...monthlyMeta, ...admissionsMeta];
  const providerTournaments = (data?.tournaments ?? []).map(t => ({
    _sourceFile: t._sourceFile,
    name: t.name,
    date: t.date,
    tcode: t.tcode,
    ccode: t.ccode,
  }));
  // Controlos da página na barra do CircuitShell.
  const driveLead = (<>
          <ToolbarTitle>🏁 DRIVE</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          <a href="https://competicoes.fpg.pt/ranking/" target="_blank" rel="noopener noreferrer"
            className="p p-sm drive-rank-link"
            title="Rankings oficiais da FPG (competicoes.fpg.pt)">🏆 Rankings FPG</a>
          <ToolbarSep />
            <TabRow
              className="drive-tabrow"
              tabs={[
                { key: "all",       label: "Todos" },
                { key: "tour",      label: "🏌️ Tour", count: countTour },
                { key: "challenge", label: "⚡ Challenge", count: countChall },
                { key: "aquapor",   label: "💧 AQUAPOR", count: countAquapor },
              ]}
              active={series}
              onChange={(k) => {
                const kk = k as DriveUrlState["series"];
                const ys = yearsOf(kk);
                const year = yearFilter && ys.includes(yearFilter) ? yearFilter : kk === "all" ? (ys[0] ?? null) : null;
                go({ series: kk, region: null, esc: [], year });
              }}
            />
            {availYears.length > 1 && (<>
              <ToolbarSep />
              {/* Anos: o mesmo interruptor segmentado das vistas. */}
              <div className="segmented-toggle" role="tablist" aria-label="Ano">
                {availYears.map(y => (
                  <button key={y} role="tab" aria-selected={activeYear === y}
                    className={"seg-btn" + (activeYear === y ? " active" : "")}
                    onClick={() => go({ year: y === activeYear && availYears.length > 1 ? null : y })}>
                    <span className="seg-label">{y}</span>
                  </button>
                ))}
              </div>
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm drive-manuel" + (filterManuel ? " active" : " tourn-tab-muted")}
                onClick={() => go({ manuel: !filterManuel })}>
                ★ Manuel
              </button>
            </>)}
  </>);
  const driveBelow = (<>
        {/* Linha 2: regiões + escalões. Quebra para a linha seguinte (todos os
            botões ao mesmo nível, alinhados à esquerda) — antes, em desktop,
            a linha não quebrava e os escalões embrulhavam-se sozinhos no meio
            do ecrã ao estreitar a janela (14/10/2026). */}
        {(availRegions.length > 1 || availEscs.length > 0) && (
          <div className={"drive-below" + (md.isMobile ? " is-mobile" : "")}>
            {availRegions.length > 1 && (<>
              <button className={"tourn-tab tourn-tab-sm shrink-0" + (regionFilter === null ? " active" : "")}
                onClick={() => go({ region: null, esc: [] })}>
                {md.isMobile ? `Todas ${countEvents(seriesT)}` : `Todas (${countEvents(seriesT)})`}
              </button>
              {availRegions.map(reg => {
                const rt = seriesT.filter(t => t.region === reg.id);
                const nT = countEvents(rt);
                const nJ = uniquePC(rt);
                return (
                  <button key={reg.id}
                    className={"tourn-tab tourn-tab-sm drive-region" + (regionFilter === reg.id ? " active" : " tourn-tab-muted")}
                    onClick={() => go({ region: reg.id, esc: [] })}>
                    {md.isMobile
                      ? `${reg.label} ${nT}·${nJ}`
                      : `${reg.emoji} ${reg.label} (${nT}T · ${nJ} jog)`}
                  </button>
                );
              })}
              <ToolbarSep />
            </>)}
            {/* Não é o mesmo que o filtro da tabela: este refaz a classificação
                só com o(s) escalão(ões) escolhido(s). No Ranking o escalão é o da vista. */}
            {navMode === "torneios" && (<>
            <span className="fs-11 muted shrink-0" title="Classificação só com estes escalões (as posições são recalculadas)">Classificação:</span>
            <button className={"tourn-tab tourn-tab-sm shrink-0" + (escFilter.length === 0 ? " active" : " tourn-tab-muted")}
              onClick={() => go({ esc: [] })}>
              {md.isMobile ? `Todos ${uniquePCRegion}` : `Todos (${uniquePCRegion} jog)`}
            </button>
            <FilterPills
              items={(["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"] as const).map(e => ({
                key: e,
                label: e,
                disabled: !availEscs.includes(e),
              }))}
              active={escFilter}
              onToggle={(e) => go({ esc: escFilter.includes(e) ? escFilter.filter(x => x !== e) : [...escFilter, e] })}
              style={{ display: "contents" }}
            />
            </>)}
          </div>
        )}
  </>);

  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="jogadores-page">

      {/* Uma só barra: os controlos da página entram na barra do CircuitShell
          (CircuitToolbarSlotCtx); o Ranking é uma vista do shell (capacidade `ranking`). */}
        <CircuitToolbarSlotCtx.Provider value={{ lead: driveLead, below: driveBelow, hideTitle: true }}>
        <CircuitShell entries={driveEntries} pastEditionsPool={driveEditionsPool} config={shellConfig}
          selectedInfo={navMode === "ranking-sub12" ? "ranking" : null}
          onSelectInfo={(k) => go({ nav: k ? "ranking-sub12" : "torneios" })}
          // «A carregar» até chegarem as inscrições: os torneios por jogar (a Final
          // de 07/11) só entram com elas, e o shell escolhia antes o penúltimo (B, 22/10/2026).
          loading={loading || admissionsMeta.length === 0}
          // Nunca indefinido: o torneio por omissão escolhe-o a página (efeito acima).
          selectedId={shellSel.id ?? "__drive-pending__"}
          selectedDivKey={shellSel.divKey}
          onSelectEntry={(e) => goTkey(driveDivTkey(driveRepDivision(e)), "torneios")}
          // Só o escalão do torneio do URL (o shell também chama isto para o
          // escalão por omissão do que mostra enquanto espera).
          onSelectDivision={(e, d) => { if (e.id === shellSel.id) goTkey(driveDivTkey(d), "torneios"); }} />
        </CircuitToolbarSlotCtx.Provider>


    </div>
    </DataSourcesProvider>
  );
}

export default function DrivePage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <DriveContent />;
}
