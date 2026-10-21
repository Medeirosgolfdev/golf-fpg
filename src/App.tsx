import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import RankingsTabs from "./ui/RankingsTabs";
import "./App.css";
import { loadPlayers, loadMelhorias } from "./data/loader";
import type { PlayersDb } from "./data/types";
import { deepFixMojibake } from "./utils/fixEncoding";
import { isCalUnlocked, CAL_UNLOCK_EVENT } from "./utils/authConstants";
import type { MelhoriasJson } from "./data/melhoriasTypes";
import { AppContext } from "./context/AppContext";
import { CoursesGate } from "./context/CoursesContext";
import NavBar from "./ui/NavBar";
import PasswordGate from "./ui/PasswordGate";
import LoadingState from "./ui/LoadingState";

/* ── Cabeçalho mínimo — usado nos estados loading/error/gate ── */
function MinimalHeader() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-title">Golf</div>
      </div>
    </header>
  );
}

/* ── Redirect /kids → /kids2 preservando hash (links cruzados de USKIDSPage,
      TabCampoDetalhe, etc., usam /kids#playerName — Navigate normal não copia
      o hash). Aplica-se a /kids e /kids/next-t (próximos torneios). ── */
function KidsRedirect({ to }: { to: string }) {
  const { hash, search } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

/* ── Lazy-loaded pages (code-split per route) ── */
const CamposPage = lazy(() => import("./pages/CamposPage"));
const JogadoresPage = lazy(() => import("./pages/JogadoresPage"));
const SimuladorPage = lazy(() => import("./pages/SimuladorPage"));
const CalendarioPage = lazy(() => import("./pages/CalendarioPage"));
const BJGTAnalysisPage = lazy(() => import("./pages/BJGTAnalysisPage"));
const KIDS2Page = lazy(() => import("./pages/KIDS2Page"));
const KIDS2NextTournaments = lazy(() => import("./pages/kids2/NextTournaments"));
const KIDS2NextTournamentsGlobal = lazy(() => import("./pages/kids2/NextTournamentsGlobal"));
const KIDS2RankingPage = lazy(() => import("./pages/kids2/RankingPage"));
const KIDS2ListasPage = lazy(() => import("./pages/kids2/ListasPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const DrivePage = lazy(() => import("./pages/DrivePage"));
const USKIDSPage = lazy(() => import("./pages/USKIDSPage"));
const FPGPage = lazy(() => import("./pages/FPGPage"));
const MajorPage = lazy(() => import("./pages/MajorPage"));
const FFGPage = lazy(() => import("./pages/FFGPage"));
const EGRPage = lazy(() => import("./pages/EGRPage"));
const WAGRPage = lazy(() => import("./pages/WAGRPage"));
const GlobalJuniorPage = lazy(() => import("./pages/GlobalJuniorPage"));
const RFEGPage = lazy(() => import("./pages/RFEGPage"));
const TitulosPage = lazy(() => import("./pages/TitulosPage"));
const JogadoresListPage = lazy(() => import("./pages/JogadoresListPage"));
const JogadoresPorAnoPage = lazy(() => import("./pages/JogadoresPorAnoPage"));
const RecentTournamentsPage = lazy(() => import("./pages/RecentTournamentsPage"));
const OmCgssPage = lazy(() => import("./pages/OmCgssPage"));

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; players: PlayersDb; melhorias: MelhoriasJson };

/* ── Start fetching data at module level (before React mounts) ──
   Só o que todas as páginas usam (players.json + melhorias). Os campos
   (master/away/course-players, ~13 MB) carregam-se nas páginas que os usam —
   <CoursesGate> (src/context/CoursesContext.tsx). */
const _earlyData = Promise.all([loadPlayers(), loadMelhorias()]);

/** /kids2/scout/:tid (Scout antigo, 20/10/2026) → a aba Scout dos Próximos
 *  torneios, que usa o Scout partilhado (ui/circuit/Scout.tsx). */
function Kids2ScoutRedirect() {
  const { tid = "" } = useParams<{ tid: string }>();
  const t = tid.match(/(\d+)$/)?.[1];
  return <Navigate to={t ? `/kids2/next-t?t=${t}&tab=scout` : "/kids2/next-t"} replace />;
}

/** /england/t/2025_reid-trophy-2025 → /major/reidtrophy/2025; o resto → Reid Trophy 2026. */
function EnglandRedirect() {
  const { pathname } = useLocation();
  const y = /reid-trophy-(\d{4})/.exec(pathname)?.[1] ?? "2026";
  return <Navigate to={`/major/reidtrophy/${y}`} replace />;
}

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  /* Calendar unlock state — passado para o contexto */
  const [calUnlocked, setCalUnlocked] = useState(() => isCalUnlocked());
  useEffect(() => {
    const check = () => setCalUnlocked(isCalUnlocked());
    window.addEventListener("storage", check);
    window.addEventListener(CAL_UNLOCK_EVENT, check);
    return () => { window.removeEventListener("storage", check); window.removeEventListener(CAL_UNLOCK_EVENT, check); };
  }, []);

  useEffect(() => {
    let alive = true;
    _earlyData
      .then(([players, melhorias]) => {
        if (!alive) return;
        deepFixMojibake(players);
        setStatus({ kind: "ready", players, melhorias });
      })
      .catch((e) => alive && setStatus({ kind: "error", message: e?.message ?? String(e) }));
    return () => { alive = false; };
  }, []);

  const playerCount = status.kind === "ready" ? Object.keys(status.players).length : 0;

  /* Valor do contexto — só fornecido quando os dados estão prontos.
     MEMOIZADO: sem useMemo, ctxValue era um novo objecto a cada render do
     App, fazendo qualquer useEffect com `players`/`simCourses`/`melhorias`
     nas deps disparar em loop nos consumidores (ex: JogadoresPage URL sync). */
  const ctxValue = useMemo(
    () => status.kind === "ready" ? {
      players: status.players,
      melhorias: status.melhorias,
      playerCount,
      calUnlocked,
    } : null,
    [status, playerCount, calUnlocked]
  );

  return (
    <div className="app">
      {/* Estados de carregamento/erro (sem contexto disponível) */}
      {status.kind === "loading" && (
        <>
          <MinimalHeader />
          <main className="content"><LoadingState message="A carregar…" /></main>
        </>
      )}

      {status.kind === "error" && (
        <>
          <MinimalHeader />
          <main className="content">
            <div className="center-msg error-box">
              <div className="error-title">Erro</div>
              <div className="error-msg">{status.message}</div>
            </div>
          </main>
        </>
      )}

      {/* Dados prontos mas password não introduzida — gate global */}
      {status.kind === "ready" && ctxValue && !calUnlocked && (
        <AppContext.Provider value={ctxValue}>
          <MinimalHeader />
          <main className="content">
            <PasswordGate onUnlock={() => setCalUnlocked(true)} />
          </main>
        </AppContext.Provider>
      )}

      {/* Dados prontos e desbloqueados — layout completo */}
      {status.kind === "ready" && ctxValue && calUnlocked && (
        <AppContext.Provider value={ctxValue}>
          <NavBar />
          <main className="content">
            <Suspense fallback={<LoadingState message="A carregar…" />}>
              <Routes>
                <Route path="/campos/:courseKey?" element={<CoursesGate withPlayers><CamposPage /></CoursesGate>} />
                <Route path="/jogadores/:fed" element={<CoursesGate><JogadoresPage /></CoursesGate>} />
                {/* Landing page: lista tipo FPG FederatedsList com tabela ordenável + filtros */}
                <Route path="/jogadores" element={<JogadoresListPage />} />
                {/* Utilitário (fora da NavBar): jogadores por ano de nascimento */}
                <Route path="/jogadores-por-ano" element={<JogadoresPorAnoPage />} />
                {/* Utilitário (fora da NavBar): torneios recentes reconstruídos das voltas dos nossos */}
                <Route path="/torneios-recentes" element={<RecentTournamentsPage />} />
                <Route path="/torneios-recentes/:key" element={<RecentTournamentsPage />} />
                <Route path="/simulador" element={<CoursesGate><SimuladorPage /></CoursesGate>} />
                <Route path="/comparar" element={<ComparePage />} />
                <Route path="/calendario" element={<CalendarioPage />} />
                <Route path="/drive" element={<DrivePage />} />
                {/* Deep-link canónico de torneio Drive: /drive/torneio/{ccode}-{tcode} */}
                <Route path="/drive/torneio/:tkey" element={<DrivePage />} />
                <Route path="/major" element={<MajorPage />} />
                <Route path="/major/:source/:year" element={<MajorPage />} />
                <Route path="/bjgt/:fed?" element={<Navigate to="/major" replace />} />
                <Route path="/bjgt-legacy/:fed?" element={<Navigate to="/major" replace />} />
                <Route path="/bjgt-analysis/:fed?" element={<BJGTAnalysisPage />} />
                {/* Migração para KIDS2 (2026-05): /kids → /kids2 com hash preservado.
                    KIDSPage legacy REMOVIDA 2026-08-06 (sunset): a paridade vive no
                    kids2 — H2H detalhada no MatchupVsManuel; Previsão/Campo/Scorecards
                    históricos no FieldRivaisDashboard em /kids2/next-t. */}
                <Route path="/kids" element={<KidsRedirect to="/kids2" />} />
                <Route path="/kids/next-t" element={<KidsRedirect to="/kids2/next-t" />} />
                <Route path="/kids-legacy" element={<KidsRedirect to="/kids2" />} />
                <Route path="/kids-legacy/next-t" element={<KidsRedirect to="/kids2/next-t" />} />
                <Route path="/kids2" element={<KIDS2Page />} />
                <Route path="/kids2/next-t" element={<KIDS2NextTournaments />} />
                <Route path="/kids2/scout/:tid" element={<Kids2ScoutRedirect />} />
                {/* Tabela global de inscrições futuras por jogador.
                    ANTES de /kids2/:juniorId senão "inscricoes" seria lido como juniorId. */}
                <Route path="/kids2/inscricoes" element={<KIDS2NextTournamentsGlobal />} />
                <Route path="/kids2/listas" element={<KIDS2ListasPage />} />
                <Route path="/kids2/ranking/:year" element={<KIDS2RankingPage />} />
                <Route path="/kids2/ranking" element={<KIDS2RankingPage />} />
                <Route path="/kids2/:juniorId" element={<KIDS2Page />} />
                <Route path="/uskids" element={<USKIDSPage />} />
                <Route path="/FPG" element={<FPGPage />} />
                {/* Deep-link canónico de torneio FPG: /FPG/torneio/{ccode}-{tcode}.
                    Registado antes dos routes genéricos para ser escolhido quando
                    filter === "torneio" (caso contrário seria capturado por /FPG/:filter). */}
                <Route path="/FPG/torneio/:tkey" element={<FPGPage />} />
                <Route path="/FPG/:filter" element={<FPGPage />} />
                <Route path="/FPG/:filter/:sub" element={<FPGPage />} />
                {/* Compat: URLs antigas continuam a funcionar (redirect) */}
                <Route path="/diversos" element={<Navigate to="/FPG" replace />} />
                <Route path="/diversos/inscritos" element={<Navigate to="/FPG/jovens/inscritosCN" replace />} />
                <Route path="/doral" element={<Navigate to="/major" replace />} />
                <Route path="/doral-legacy" element={<Navigate to="/major" replace />} />
                <Route path="/ffg" element={<FFGPage />} />
                <Route path="/ffg/:source/:key" element={<FFGPage />} />
                {/* /england arquivada (2026-10-13, scripts/_archive/england) — o Reid Trophy vive na /major */}
                <Route path="/england/*" element={<EnglandRedirect />} />
                {/* /faldo arquivada (2026-10-13, scripts/_archive/faldo) — o Faldo Madeira vive na /major */}
                <Route path="/faldo/*" element={<Navigate to="/major/faldomadeira/2026" replace />} />
                {/* Rankings: EGR · WAGR · GJGL com separadores comuns (RankingsTabs) */}
                <Route path="/rankings/*" element={<Navigate to="/egr" replace />} />
                <Route path="/egr" element={<RankingsTabs><EGRPage /></RankingsTabs>} />
                <Route path="/egr/:source/:id" element={<RankingsTabs><EGRPage /></RankingsTabs>} />
                <Route path="/wagr" element={<RankingsTabs><WAGRPage /></RankingsTabs>} />
                <Route path="/wagr/:source/:id" element={<RankingsTabs><WAGRPage /></RankingsTabs>} />
                <Route path="/global-junior" element={<RankingsTabs><GlobalJuniorPage /></RankingsTabs>} />
                <Route path="/global-junior/:slug" element={<RankingsTabs><GlobalJuniorPage /></RankingsTabs>} />
                <Route path="/rfeg" element={<RFEGPage />} />
                <Route path="/rfeg/:compId" element={<RFEGPage />} />
                <Route path="/rfeg/:source/:id" element={<RFEGPage />} />
                {/* Página Títulos — tabs Nacional/Regional/Atleta */}
                <Route path="/titulos" element={<TitulosPage />} />
                <Route path="/titulos/:tab" element={<TitulosPage />} />
                {/* Draws saiu da barra (13/10/2026): vive na ficha do Manuel */}
                <Route path="/draws" element={<Navigate to="/jogadores/52884?view=draws" replace />} />
                <Route path="/om-cgss" element={<OmCgssPage />} />
                {/* Landing — sem rota explícita, o catch-all entrava em loop com /* → / */}
                <Route path="/" element={<Navigate to="/jogadores" replace />} />
                {/* Compat: URLs antigas continuam a funcionar (redirect) */}
                <Route path="/*" element={<Navigate to="/jogadores" replace />} />
              </Routes>
            </Suspense>
          </main>
        </AppContext.Provider>
      )}
    </div>
  );
}
