/**
 * useLiveAdmissions — verificação LIVE das inscrições de um torneio FPG.
 *
 * Ao abrir o detalhe de um torneio em destaque (FEATURED_TOURNAMENTS) ainda
 * não jogado, chama /api/inscricoes?ccode=X&tcode=Y (proxy: função Vercel em
 * produção, middleware do vite.config.ts em dev) que vai à FPG buscar a lista
 * ACTUAL de inscritos via linkpage.aspx. O TournamentDetail compara com o
 * último scrape (fpg-admissions-draws.json) e mostra "+N novos / −N saíram".
 *
 * Cache em memória por (ccode,tcode) com TTL curto — evita re-fetch a cada
 * troca de tab/torneio na mesma sessão. Falha em silêncio (status "error"):
 * a UI cai no último scrape.
 */
import { useEffect, useState } from "react";
import type { FpgAdmissionPlayer } from "../data/nacional2026Loader";

export interface LiveAdmissionsState {
  status: "idle" | "loading" | "live" | "error";
  players: FpgAdmissionPlayer[];
  fetchedAt: string | null;
  error?: string;
}

const IDLE: LiveAdmissionsState = { status: "idle", players: [], fetchedAt: null };
const TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { ts: number; state: LiveAdmissionsState }>();

export function useLiveAdmissions(
  ccode: string | null | undefined,
  tcode: string | number | null | undefined,
  enabled: boolean,
): LiveAdmissionsState {
  const key = `${ccode ?? ""}-${tcode ?? ""}`;
  const [state, setState] = useState<LiveAdmissionsState>(() => {
    const c = cache.get(key);
    return c && Date.now() - c.ts < TTL_MS ? c.state : IDLE;
  });

  useEffect(() => {
    if (!enabled || !ccode || !tcode) { setState(IDLE); return; }
    const c = cache.get(key);
    if (c && Date.now() - c.ts < TTL_MS) { setState(c.state); return; }
    let alive = true;
    setState({ status: "loading", players: [], fetchedAt: null });
    (async () => {
      try {
        const r = await fetch(`/api/inscricoes?ccode=${encodeURIComponent(String(ccode))}&tcode=${encodeURIComponent(String(tcode))}`);
        const j = await r.json();
        if (!r.ok || j?.error) throw new Error(j?.error || `HTTP ${r.status}`);
        const players: FpgAdmissionPlayer[] = (j.jogadores || []).map((p: any, i: number) => ({
          pos: i + 1,
          fed: p.fed ?? null,
          nome: p.nome || "",
          clube: p.clube || null,
          hcp: p.hcp ?? null,
          vac: p.vac ?? null,
          dataInscricao: p.dataInscricao ?? null,
          status: "confirmed" as const,
        }));
        const st: LiveAdmissionsState = {
          status: "live",
          players,
          fetchedAt: j.lastFetched || new Date().toISOString(),
        };
        cache.set(key, { ts: Date.now(), state: st });
        if (alive) setState(st);
      } catch (e: any) {
        const st: LiveAdmissionsState = {
          status: "error", players: [], fetchedAt: null,
          error: String(e?.message || e),
        };
        cache.set(key, { ts: Date.now(), state: st });
        if (alive) setState(st);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
}
