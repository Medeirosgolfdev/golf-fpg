import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import "./App.css";
import { loadMasterData, loadPlayers, loadAwayCourses } from "./data/loader";
import { initCourseColorCache } from "./utils/teeColors";
import { extractAwayCourses } from "./data/melhoriasLoader";
import { getExtraCourses } from "./data/extraCourses";
import type { Course, MasterData, PlayersDb } from "./data/types";
import golfBallSvg from "./assets/golf-ball.svg";

import { deepFixMojibake } from "./utils/fixEncoding";
import { isCalUnlocked, CAL_UNLOCK_EVENT } from "./utils/authConstants";
import type { MelhoriasJson } from "./data/melhoriasTypes";

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

type Tab = "campos" | "jogadores" | "comparar" | "simulador" | "calendario" | "drive" | "bjgt" | "torneio" | "rivais";

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

/* Derivar tab activo a partir do pathname */
function tabFromPath(pathname: string): Tab {
  const seg = pathname.split("/")[1] || "";
  if (seg === "campos") return "campos";
  if (seg === "simulador") return "simulador";
  if (seg === "comparar") return "comparar";
  if (seg === "calendario") return "calendario";
  if (seg === "drive") return "drive";
  if (seg === "bjgt") return "bjgt";
  if (seg === "rivais") return "rivais";
  if (seg === "torneio") return "torneio";
  return "jogadores"; // default
}

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPath(location.pathname);

  /* Calendar unlock → show BJGT nav */
  const [calUnlocked, setCalUnlocked] = useState(() => isCalUnlocked());
  useEffect(() => {
    const check = () => setCalUnlocked(isCalUnlocked());
    window.addEventListener("storage", check);
    window.addEventListener(CAL_UNLOCK_EVENT, check);
    check();
    return () => { window.removeEventListener("storage", check); window.removeEventListener(CAL_UNLOCK_EVENT, check); };
  }, [location.pathname]);

  /* Dynamic page title */
  useEffect(() => {
    const titles: Record<Tab, string> = {
      campos: "Campos", jogadores: "Jogadores", comparar: "Comparar",
      simulador: "Simulador", calendario: "Calendário", drive: "DRIVE", bjgt: "BJGT", torneio: "GG26", rivais: "Rivais Intl",
    };
    document.title = `Golf FPG — ${titles[tab] || "Jogadores"}`;
  }, [tab]);

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

  const goTo = (path: string) => navigate(path);

  return (
    <div className="app">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <img src={golfBallSvg} alt="" className="brand-icon" />
          <div className="brand-title">Golf</div>
        </div>

        <nav className="nav">
          <button
            className={`nav-btn ${tab === "jogadores" ? "active" : ""}`}
            onClick={() => goTo("/jogadores")}
          >
            Jogadores
          </button>
          <button
            className={`nav-btn ${tab === "comparar" ? "active" : ""}`}
            onClick={() => goTo("/comparar")}
          >
            Comparar
          </button>
          <button
            className={`nav-btn ${tab === "campos" ? "active" : ""}`}
            onClick={() => goTo("/campos")}
          >
            Campos
          </button>
          <button
            className={`nav-btn ${tab === "simulador" ? "active" : ""}`}
            onClick={() => goTo("/simulador")}
          >
            Simulador
          </button>
          <button
            className={`nav-btn ${tab === "calendario" ? "active" : ""}`}
            onClick={() => goTo("/calendario")}
          >
            Calendário
          </button>
          {calUnlocked && (
            <button
              className={`nav-btn ${tab === "drive" ? "active" : ""}`}
              onClick={() => goTo("/drive")}
            >
              🏁 DRIVE
            </button>
          )}
          {calUnlocked && (
            <button
              className={`nav-btn ${tab === "bjgt" ? "active" : ""}`}
              onClick={() => goTo("/bjgt")}
            >
              🇪🇸 BJGT
            </button>
          )}
          {calUnlocked && (
            <button
              className={`nav-btn ${tab === "rivais" ? "active" : ""}`}
              onClick={() => goTo("/rivais")}
            >
              🌍 Riv Intl
            </button>
          )}
          {calUnlocked && (
            <button
              className={`nav-btn ${tab === "torneio" ? "active" : ""}`}
              onClick={() => goTo("/torneio")}
            >
              GG26
            </button>
          )}
        </nav>

        {status.kind === "ready" && (
          <div className="top-stats">
            <div className="top-stat">
              <div className="top-stat-val">{status.data.meta.stats.courses}</div>
              <div className="top-stat-label">Campos</div>
            </div>
            <div className="top-stat">
              <div className="top-stat-val">{status.data.meta.stats.tees}</div>
              <div className="top-stat-label">Tees</div>
            </div>
            <div className="top-stat">
              <div className="top-stat-val">{playerCount}</div>
              <div className="top-stat-label">Jogadores</div>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="content">
        {status.kind === "loading" && (
          <div className="center-msg">A carregar…</div>
        )}

        {status.kind === "error" && (
          <div className="center-msg error-box">
            <div className="error-title">Erro</div>
            <div className="error-msg">{status.message}</div>
          </div>
        )}

        {status.kind === "ready" && (
          <Suspense fallback={<div className="center-msg">A carregar…</div>}>
          <Routes>
            <Route path="/campos/:courseKey?" element={<CamposPage courses={simCourses} />} />
            <Route path="/jogadores/:fed" element={<JogadoresPage players={status.players} courses={simCourses} />} />
            <Route path="/jogadores" element={<Navigate to="/jogadores/52884" replace />} />
            <Route path="/simulador" element={<SimuladorPage courses={simCourses} />} />
            <Route path="/comparar" element={<CompararPage players={status.players} />} />
            <Route path="/calendario" element={<CalendarioPage players={status.kind === "ready" ? status.players : undefined} />} />
            <Route path="/drive" element={<DrivePage />} />
            <Route path="/bjgt/:fed?" element={<BJGTPage />} />
            <Route path="/rivais" element={<RivaisIntlPage />} />
            <Route path="/torneio" element={<TorneioPage players={status.players} onSelectPlayer={(fed) => goTo(`/jogadores/${fed}`)} />} />
            <Route path="*" element={<Navigate to="/jogadores/52884" replace />} />
          </Routes>
          </Suspense>
        )}
      </main>
    </div>
  );
}
