/**
 * src/context/CoursesContext.tsx
 *
 * Campos sob pedido (21/10/2026): só as páginas que usam campos os carregam.
 * Envolver a página (ou a aba) em `<CoursesGate>` — mostra «A carregar…» até os
 * campos chegarem — e lá dentro ler com `useCourses()`.
 *
 *   <CoursesGate withPlayers><CamposPage /></CoursesGate>
 *   const { simCourses, tournamentCourses } = useCourses();
 *
 * `withPlayers` junta o course-players.json («quem jogou» nos campos PT, ~10 MB)
 * — só a /campos (e a vista «Comparar» dela) precisa dele.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CoursesData } from "../data/courses";
import LoadingState from "../ui/LoadingState";

const CoursesContext = createContext<CoursesData | null>(null);

export function CoursesGate({ withPlayers = false, children }: { withPlayers?: boolean; children: ReactNode }) {
  const parent = useContext(CoursesContext);
  const [state, setState] = useState<{ data: CoursesData } | { error: string } | null>(null);

  // Já dentro de um gate (ex.: aba de campo dentro de uma página com campos).
  const reuse = !!parent && !withPlayers;

  useEffect(() => {
    if (reuse) return;
    let alive = true;
    // import dinâmico: a fusão dos campos (e o extraCourses) fica fora do bundle inicial
    import("../data/courses")
      .then((m) => m.loadCourses({ withPlayers }))
      .then((data) => { if (alive) setState({ data }); })
      .catch((e) => { if (alive) setState({ error: e?.message ?? String(e) }); });
    return () => { alive = false; };
  }, [withPlayers, reuse]);

  if (reuse) return <>{children}</>;
  if (!state) return <LoadingState message="A carregar campos…" />;
  if ("error" in state) {
    return (
      <div className="center-msg error-box">
        <div className="error-title">Erro</div>
        <div className="error-msg">{state.error}</div>
      </div>
    );
  }
  return <CoursesContext.Provider value={state.data}>{children}</CoursesContext.Provider>;
}

/** Campos carregados pelo `CoursesGate` mais próximo. */
export function useCourses(): CoursesData {
  const ctx = useContext(CoursesContext);
  if (!ctx) throw new Error("useCourses deve ser usado dentro de <CoursesGate>");
  return ctx;
}
