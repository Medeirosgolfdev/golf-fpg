import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import { loadMasterData, loadPlayers, loadAwayCourses } from "./data/loader";
import { initCourseColorCache } from "./utils/teeColors";
import { extractAwayCourses } from "./data/melhoriasLoader";
import { getExtraCourses } from "./data/extraCourses";
import type { Course, MasterData, PlayersDb } from "./data/types";
import { deepFixMojibake } from "./utils/fixEncoding";
import { isCalUnlocked, CAL_UNLOCK_EVENT } from "./utils/authConstants";
import type { MelhoriasJson } from "./data/melhoriasTypes";
import { AppContext } from "./context/AppContext";
import NavBar from "./ui/NavBar";
import PasswordGate from "./ui/PasswordGate";

/* ── Lazy-loaded pages (code-split per route) ── */
const CamposPage = lazy(() => import("./pages/CamposPage"));
const JogadoresPage = lazy(() => import("./pages/JogadoresPage"));
const SimuladorPage = lazy(() => import("./pages/SimuladorPage"));
const CalendarioPage = lazy(() => import("./pages/CalendarioPage"));
const BJGTPage = lazy(() => import("./pages/BJGTPage"));
const RivaisIntlPage = lazy(() => import("./pages/RivaisIntlPage"));
const TorneioPage = lazy(() => import("./pages/TorneioPage"));
const CompararPage = lazy(() => import("./pages/CompararPage"));
const DrivePage = lazy(() => import("./pages/DrivePage"));
const USKidsFieldPage = lazy(() => import("./pages/USKidsFieldPage"));

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb; awayCourses: Course[]; melhorias: MelhoriasJson };

/* ── Start fetching data at module level (before React mounts) ── */
const _earlyData = Promise.all([
  loadMasterData(),
  loadPlayers(),
  loadAwayCourses(),
  import("../melhorias.json").then(m => m.default as MelhoriasJson).catch(() => ({} as MelhoriasJson)),
]);

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
      .then(([data, players, awayCourses, melhorias]) => {
        if (!alive) return;
        deepFixMojibake(players);
        initCourseColorCache([...data.courses, ...awayCourses]);
        setStatus({ kind: "ready", data, players, awayCourses, melhorias });
      })
      .catch((e) => alive && setStatus({ kind: "error", message: e?.message ?? String(e) }));
    return () => { alive = false; };
  }, []);

  const playerCount = status.kind === "ready" ? Object.keys(status.players).length : 0;

  /* Campos FPG + Away (pipeline + melhorias + manuais) */
  const simCourses: Course[] = useMemo(() => {
    if (status.kind !== "ready") return [];
    const fpg = status.data.courses;
    const pipelineAway = status.awayCourses;
    const melhoriasAway = extractAwayCourses(status.melhorias);
    const extra = getExtraCourses();

    // Merge com dedup por courseKey (prioridade: pipeline > melhorias > extra)
    const map = new Map<string, Course>();
    for (const c of fpg) map.set(c.courseKey, c);
    for (const c of pipelineAway) if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    for (const c of melhoriasAway) if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    for (const c of extra) if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    return [...map.values()];
  }, [status]);

  /* Valor do contexto — só fornecido quando os dados estão prontos */
  const ctxValue = status.kind === "ready" ? {
    masterData: status.data,
    players: status.players,
    simCourses,
    melhorias: status.melhorias,
    stats: {
      courses: status.data.meta.stats.courses,
      tees: status.data.meta.stats.tees,
      players: playerCount,
    },
    calUnlocked,
  } : null;

  return (
    <div className="app">
      {/* Estados de carregamento/erro (sem contexto disponível) */}
      {status.kind === "loading" && (
        <>
          <header className="topbar"><div className="brand"><div className="brand-title">Golf</div></div></header>
          <main className="content"><div className="center-msg">A carregar…</div></main>
        </>
      )}

      {status.kind === "error" && (
        <>
          <header className="topbar"><div className="brand"><div className="brand-title">Golf</div></div></header>
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
          <header className="topbar">
            <div className="brand">
              <div className="brand-title">Golf</div>
            </div>
          </header>
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
            <Suspense fallback={<div className="center-msg">A carregar…</div>}>
              <Routes>
                <Route path="/campos/:courseKey?" element={<CamposPage />} />
                <Route path="/jogadores/:fed" element={<JogadoresPage />} />
                <Route path="/jogadores" element={<Navigate to="/jogadores/52884" replace />} />
                <Route path="/simulador" element={<SimuladorPage />} />
                <Route path="/comparar" element={<CompararPage />} />
                <Route path="/calendario" element={<CalendarioPage />} />
                <Route path="/drive" element={<DrivePage />} />
                <Route path="/bjgt/:fed?" element={<BJGTPage />} />
                <Route path="/rivais" element={<RivaisIntlPage />} />
                <Route path="/torneio" element={<TorneioPage />} />
                <Route path="/uskids" element={<USKidsFieldPage />} />
                <Route path="*" element={<Navigate to="/jogadores/52884" replace />} />
              </Routes>
            </Suspense>
          </main>
        </AppContext.Provider>
      )}
    </div>
  );
}
