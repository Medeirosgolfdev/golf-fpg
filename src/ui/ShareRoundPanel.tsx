/**
 * ShareRoundPanel — «📷 Partilhar volta» por baixo de um leaderboard: os mesmos
 * PNGs do simulador (OverlayExport), já preenchidos com a volta do jogador
 * (campo, tee, metros, SI, scores, HCP, SD, torneio, volta, data, posição).
 *
 * O OverlayExport só é carregado quando o painel abre (traz o html-to-image e
 * os ~50 desenhos).
 */
import { lazy, Suspense, useState } from "react";
import type { OverlayData } from "./overlay/types";

const OverlayExport = lazy(() => import("./OverlayExport"));

export default function ShareRoundPanel({ data, label }: { data: OverlayData; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-12" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="sim-section-toggle">
        📷 Partilhar volta{label ? ` — ${label}` : ""}
      </summary>
      {open && (
        <div className="mt-8">
          <Suspense fallback={<div className="muted fs-12">A carregar…</div>}>
            {/* key: o OverlayExport lê os dados só ao montar (torneio/volta noutra tab = painel novo) */}
            <OverlayExport key={`${data.event}|${data.round}|${data.player}`} data={data} inline />
          </Suspense>
        </div>
      )}
    </details>
  );
}
