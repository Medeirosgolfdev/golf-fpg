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
import { norm } from "./utils/format";
import { MANUEL_FED } from "./constants/manuel";
import type { MelhoriasJson } from "./data/melhoriasTypes";
import { AppContext } from "./context/AppContext";
import NavBar from "./ui/NavBar";
import PasswordGate from "./ui/PasswordGate";

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

/* ── Lazy-loaded pages (code-split per route) ── */
const CamposPage = lazy(() => import("./pages/CamposPage"));
const JogadoresPage = lazy(() => import("./pages/JogadoresPage"));
const SimuladorPage = lazy(() => import("./pages/SimuladorPage"));
const CalendarioPage = lazy(() => import("./pages/CalendarioPage"));
const BJGTPage = lazy(() => import("./pages/BJGTPage"));
const BJGTAnalysisPage = lazy(() => import("./pages/BJGTAnalysisPage"));
const KIDSPage = lazy(() => import("./pages/KIDSPage"));
const CompararPage = lazy(() => import("./pages/CompararPage"));
const DrivePage = lazy(() => import("./pages/DrivePage"));
const USKIDSPage = lazy(() => import("./pages/USKIDSPage"));
const FPGPage = lazy(() => import("./pages/FPGPage"));
const DORALPage = lazy(() => import("./pages/DORALPage"));
const FFGPage = lazy(() => import("./pages/FFGPage"));
const RFEGPage = lazy(() => import("./pages/RFEGPage"));
const NacionaisJovensPage = lazy(() => import("./pages/NacionaisJovensPage"));
const TitulosPage = lazy(() => import("./pages/TitulosPage"));
const JogadoresListPage = lazy(() => import("./pages/JogadoresListPage"));

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb; awayCourses: Course[]; melhorias: MelhoriasJson };

/* ── Start fetching data at module level (before React mounts) ── */
const _earlyData = Promise.all([
  loadMasterData(),
  loadPlayers(),
  loadAwayCourses(),
import("../melhorias.json").then(m => m.default as unknown as MelhoriasJson).catch(() => ({} as MelhoriasJson)),]);

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

    // ── helpers ──────────────────────────────────────────────────────────

    /** Chave de deduplicação de tee: nome + CR + slope */
    function teeKey(t: Course["master"]["tees"][0]): string {
      const cr = t.ratings?.holes18?.courseRating ?? "";
      const sl = t.ratings?.holes18?.slopeRating ?? "";
      return `${t.teeName.trim().toLowerCase()}|${cr}|${sl}`;
    }

    /** Qualidade de um tee: mais buracos e mais distância = melhor */
    function teeScore(t: Course["master"]["tees"][0]): number {
      return (t.distances?.holesCount ?? 0) * 10000 + (t.distances?.total ?? 0);
    }

    /** Remove tees duplicados e em branco de uma lista */
    function dedupTees(tees: Course["master"]["tees"]): Course["master"]["tees"] {
      const seen = new Map<string, Course["master"]["tees"][0]>();
      for (const t of tees) {
        const k = teeKey(t);
        const prev = seen.get(k);
        // Guardar o tee com mais dados; rejeitar tees completamente vazios
        if (!prev || teeScore(t) > teeScore(prev)) seen.set(k, t);
      }
      // Filtrar tees sem dados úteis (sem buracos, sem distância, sem CR)
      return [...seen.values()].filter(t =>
        (t.distances?.holesCount ?? 0) > 0 ||
        (t.distances?.total ?? 0) > 0 ||
        (t.ratings?.holes18?.courseRating ?? 0) > 0
      );
    }

    /** Merge de dois campos: mantém o melhor de cada um.
     *  Se o base é um campo FPG (master-courses, key não começa por "away-"),
     *  os tees FPG são autoritativos — não fundir tees de scorecards (away).
     *  Só se fundem os tees quando ambos têm a mesma origem. */
    function mergeCourses(base: Course, other: Course): Course {
      const isBaseFPG  = !base.courseKey.startsWith("away-");
      const isOtherFPG = !other.courseKey.startsWith("away-");

      // Campo FPG + fonte away → manter só tees FPG (dados oficiais)
      // Campo away + away, ou FPG + FPG → fundir normalmente
      const combinedTees = (isBaseFPG && !isOtherFPG)
        ? base.master.tees
        : [...base.master.tees, ...other.master.tees];

      const mergedTees = dedupTees(combinedTees);
      const players = { ...(other.master._players ?? {}), ...(base.master._players ?? {}) };
      return {
        ...base,
        master: {
          ...base.master,
          tees: mergedTees.length > 0 ? mergedTees : base.master.tees,
          country: base.master.country || other.master.country,
          _players: Object.keys(players).length > 0 ? players : undefined,
        },
      };
    }

    // ── build map por courseKey ───────────────────────────────────────────
    const map = new Map<string, Course>();
    for (const c of fpg) map.set(c.courseKey, c);

    // Guardar _players do pipeline antes de possível sobrescrita por extra
    const pipelinePlayers = new Map<string, Record<string, string | null>>();
    for (const c of pipelineAway) {
      if (c.master._players) pipelinePlayers.set(c.courseKey, c.master._players);
      if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    }
    for (const c of melhoriasAway) if (!map.has(c.courseKey)) map.set(c.courseKey, c);

    // Extra (manual) tem precedência de tees sobre pipeline
    for (const c of extra) map.set(c.courseKey, c);

    // Reaplicar _players do pipeline nas entradas extra/melhorias que não os têm
    for (const [key, players] of pipelinePlayers) {
      const existing = map.get(key);
      if (existing && !existing.master._players) {
        map.set(key, { ...existing, master: { ...existing.master, _players: players } });
      }
    }

    // ── dedup tees por campo ──────────────────────────────────────────────
    for (const [key, c] of map) {
      const clean = dedupTees(c.master.tees);
      if (clean.length !== c.master.tees.length) {
        map.set(key, { ...c, master: { ...c.master, tees: clean } });
      }
    }

    // ── dedup campos por nome display (mesmo nome = merge) ────────────────
    const byName = new Map<string, string>(); // norm → courseKey canónico
    const finalMap = new Map<string, Course>();

    // Ordenar: campos com mais tees ganham — iterar por ordem de inserção
    const ordered = [...map.values()].sort((a, b) => b.master.tees.length - a.master.tees.length);

    for (const c of ordered) {
      const nn = norm(c.master.name);
      const canonical = byName.get(nn);
      if (canonical) {
        // Já existe um campo com este nome — fazer merge
        const existing = finalMap.get(canonical)!;
        finalMap.set(canonical, mergeCourses(existing, c));
      } else {
        byName.set(nn, c.courseKey);
        finalMap.set(c.courseKey, c);
      }
    }

    return [...finalMap.values()];
  }, [status]);

  /* Valor do contexto — só fornecido quando os dados estão prontos.
     MEMOIZADO: sem useMemo, ctxValue era um novo objecto a cada render do
     App, fazendo qualquer useEffect com `players`/`simCourses`/`melhorias`
     nas deps disparar em loop nos consumidores (ex: JogadoresPage URL sync). */
  const ctxValue = useMemo(
    () => status.kind === "ready" ? {
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
    } : null,
    [status, simCourses, playerCount, calUnlocked]
  );

  return (
    <div className="app">
      {/* Estados de carregamento/erro (sem contexto disponível) */}
      {status.kind === "loading" && (
        <>
          <MinimalHeader />
          <main className="content"><div className="center-msg">A carregar…</div></main>
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
            <Suspense fallback={<div className="center-msg">A carregar…</div>}>
              <Routes>
                <Route path="/campos/:courseKey?" element={<CamposPage />} />
                <Route path="/jogadores/:fed" element={<JogadoresPage />} />
                {/* Landing page: lista tipo FPG FederatedsList com tabela ordenável + filtros */}
                <Route path="/jogadores" element={<JogadoresListPage />} />
                <Route path="/simulador" element={<SimuladorPage />} />
                <Route path="/comparar" element={<CompararPage />} />
                <Route path="/calendario" element={<CalendarioPage />} />
                <Route path="/drive" element={<DrivePage />} />
                {/* Deep-link canónico de torneio Drive: /drive/torneio/{ccode}-{tcode} */}
                <Route path="/drive/torneio/:tkey" element={<DrivePage />} />
                <Route path="/bjgt/:fed?" element={<BJGTPage />} />
                <Route path="/bjgt-analysis/:fed?" element={<BJGTAnalysisPage />} />
                <Route path="/kids" element={<KIDSPage />} />
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
                <Route path="/doral" element={<DORALPage />} />
                <Route path="/ffg" element={<FFGPage />} />
                <Route path="/rfeg" element={<RFEGPage />} />
                <Route path="/rfeg/:compId" element={<RFEGPage />} />
                <Route path="/rfeg/:source/:id" element={<RFEGPage />} />
                {/* Página Títulos — tabs Nacional/Regional/Atleta */}
                <Route path="/titulos" element={<TitulosPage />} />
                <Route path="/titulos/:tab" element={<TitulosPage />} />
                {/* Compat: URLs antigas continuam a funcionar (redirect) */}
                <Route path="/nacionais-jovens" element={<Navigate to="/titulos/nacional" replace />} />
                <Route path="/nacionais" element={<Navigate to="/titulos/nacional" replace />} />
                {/* Manter NacionaisJovensPage acessivel via rota antiga (caso de bookmarks) */}
                <Route path="/nacionais-jovens-legacy" element={<NacionaisJovensPage />} />
                <Route path="*" element={<Navigate to={`/jogadores/${MANUEL_FED}`} replace />} />
              </Routes>
            </Suspense>
          </main>
        </AppContext.Provider>
      )}
    </div>
  );
}
