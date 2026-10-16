/**
 * ShareRoundPanel — «📷 Partilhar volta» por baixo de um leaderboard: os mesmos
 * PNGs do simulador (OverlayExport), já preenchidos com a volta do jogador
 * (campo, tee, metros, SI, scores, HCP, SD, torneio, volta, data, posição).
 * Dá para escolher qualquer jogador que acabou a volta (o Manuel por omissão).
 *
 * O OverlayExport só é carregado quando o painel abre (traz o html-to-image e
 * os ~40 desenhos).
 */
import { lazy, Suspense, useState } from "react";
import type { OverlayData } from "./overlay/types";

const OverlayExport = lazy(() => import("./OverlayExport"));

export type ShareOption = { key: string; label: string; data: OverlayData };

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
