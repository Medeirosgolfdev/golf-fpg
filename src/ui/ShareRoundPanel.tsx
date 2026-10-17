/**
 * ShareRoundPanel — «📷 Partilhar volta» por baixo de um leaderboard: os mesmos
 * PNGs do simulador (OverlayExport), já preenchidos com a volta do jogador
 * (campo, tee, metros, SI, scores, HCP, SD, torneio, volta, data, posição).
 * Dá para escolher qualquer jogador que acabou a volta (o Manuel por omissão).
 *
 * O OverlayExport só é carregado quando o painel abre (traz o html-to-image e
 * os ~40 desenhos).
 */
import { lazy, Suspense, useMemo, useState } from "react";
import type { OverlayData } from "./overlay/types";
import type { Tournament } from "../data/fpgTypes";
import { shareOptionsForRounds, shareOptionsForTournament } from "./overlay/shareOptions";

const OverlayExport = lazy(() => import("./OverlayExport"));
const RoundAnalysisPanel = lazy(() => import("./RoundAnalysisPanel"));

/** `pid` = o jogador entre voltas (fed ou nome — o scoreId da FPG muda de volta para volta). */
export type ShareOption = { key: string; label: string; data: OverlayData; pid?: string };

export default function ShareRoundPanel({ options, defaultKey }: { options: ShareOption[]; defaultKey?: string }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(defaultKey);
  const cur = options.find((o) => o.key === sel) ?? options.find((o) => o.key === defaultKey) ?? options[0];
  if (!cur) return null;
  return (
    <details className="mt-12" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="sim-section-toggle">📷 Partilhar volta</summary>
      {open && (
        <div className="mt-8">
          {options.length > 1 && (
            <label className="fs-12 mb-8" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Jogador
              <select className="input" value={cur.key} onChange={(e) => setSel(e.target.value)}>
                {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          )}
          <Suspense fallback={<div className="muted fs-12">A carregar…</div>}>
            <OverlayExport data={cur.data} inline />
          </Suspense>
        </div>
      )}
    </details>
  );
}

/** Painel do Resumo / Scorecards: o torneio completo (voltas comparadas) e
 *  cada volta de cada jogador. Por omissão o torneio do Manuel (ou a última
 *  volta dele, se ainda só jogou uma). */
/** `analysis`: mostra a «Análise das voltas» completa por cima (só no Resumo). */
export function ShareRoundsPanel({ rounds, event, course, date, analysis = false }: { rounds: Tournament[]; event?: string; course?: string; date?: string; analysis?: boolean }) {
  const share = useMemo(() => {
    const ctx = { event, course, date };
    const t = shareOptionsForTournament(rounds, ctx);
    const r = shareOptionsForRounds(rounds, ctx);
    return { options: [...t.options, ...r.options], defaultKey: t.defaultKey ?? r.defaultKey, tour: t };
  }, [rounds, event, course, date]);
  if (!share.options.length) return null;
  return (
    <>
      {/* Torneio com 2+ voltas: o analisador por cima do partilhar */}
      {analysis && share.tour.options.length > 0 && (
        <Suspense fallback={null}><RoundAnalysisPanel options={share.tour.options} defaultKey={share.tour.defaultKey} /></Suspense>
      )}
      <ShareRoundPanel options={share.options} defaultKey={share.defaultKey} />
    </>
  );
}

/** Separador de uma volta (R2, R3…): só a análise dessa volta contra a anterior,
 *  calculada com as voltas jogadas até ela (a posição é a de depois dessa volta). */
export function RoundAnalysisFor({ rounds, round }: { rounds: Tournament[]; round: number }) {
  const t = useMemo(() => (round >= 2 ? shareOptionsForTournament(rounds.slice(0, round)) : null), [rounds, round]);
  if (!t || !t.options.length) return null;
  return <Suspense fallback={null}><RoundAnalysisPanel options={t.options} defaultKey={t.defaultKey} only={round} /></Suspense>;
}
