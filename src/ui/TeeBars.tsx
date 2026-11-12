/**
 * src/ui/TeeBars.tsx
 *
 * Barras de tees partilhadas entre CamposPage e SimuladorPage. Uma barra por
 * tee FÍSICO (só a bolinha colorida + distância), com o CR/Slope de cada sexo.
 *
 * - Modo display (Campos): M/F mostrados como texto.
 * - Modo selector (Simulador): passar `onSelectTee` — cada variante M/F vira um
 *   botão clicável; `selectedTeeId` marca o activo.
 */
import { useMemo } from "react";
import type { Tee } from "../data/types";
import SexBadge from "./SexBadge";
import { Tint } from "./DataStyle";
import { fmt, fmtCR } from "../utils/format";
import { physicalTeeGroups, type SexKey } from "../utils/teeGroups";
import { teeChoiceKey } from "../utils/teeChoice";
import { somaDe } from "../utils/mathUtils";

/** Nome do tee para a barra (escalão nos tees USKids): sem o prefixo «USKids». */
function teeLabel(t: Tee | undefined): string {
  return (t?.teeName ?? "").replace(/^USKids\s+/i, "").trim();
}

/** Distância de um nove: a publicada, ou a soma dos 9 buracos quando todos têm distância. */
function nineDistance(t: Tee, nine: "front9" | "back9"): number | null {
  const d = t.distances?.[nine];
  if (d != null && d > 0) return d;
  const hs = (t.holes ?? []).filter((h) => (nine === "front9" ? h.hole <= 9 : h.hole > 9));
  if (hs.length !== 9 || hs.some((h) => !h.distance)) return null;
  return somaDe(hs, h => (h.distance ?? 0));
}

interface TeeBarsProps {
  tees: Tee[];
  /** Mostrar só um nove (Simulador em Front 9 / Back 9): distância e CR/Slope desse nove. */
  nine?: "front9" | "back9";
  /** Selector por sexo (Simulador): cada variante M/F vira botão. */
  onSelectTee?: (tee: Tee) => void;
  selectedTeeId?: string | null;
  /** Selecção do tee inteiro (Campos): a barra toda fica clicável. */
  onSelectGroup?: (key: string) => void;
  selectedGroupKey?: string | null;
}

export default function TeeBars({ tees, nine, onSelectTee, selectedTeeId, onSelectGroup, selectedGroupKey }: TeeBarsProps) {
  const groups = useMemo(() => physicalTeeGroups(tees), [tees]);
  if (!groups.length) return null;
  const selectable = !!onSelectTee;
  const groupSelectable = !!onSelectGroup;

  return (
    <div className="tee-badges-row">
      {groups.map((g) => {
        const dist = nine ? nineDistance(g.teeHoles, nine) : g.teeHoles.distances?.total ?? null;
        const ratings = nine === "front9" ? g.f9 : nine === "back9" ? g.b9 : g.h18;
        const gs = (["M", "F", "U"] as const).filter((s) => ratings[s] || g.teeBySex[s]);
        const groupActive = groupSelectable && selectedGroupKey === g.key;
        // Nome do tee/escalão: uma vez para a barra quando é o mesmo nos dois sexos, senão ao lado de cada sexo.
        const names = gs.map((s) => teeLabel(g.teeBySex[s]));
        const sameName = names.every((n) => n === names[0]);
        return (
          <span
            key={g.key}
            className={"tee-badge-card tee-bar-card" + (groupSelectable ? " is-click" : "") + (groupActive ? " is-active" : "")}
            onClick={groupSelectable ? () => onSelectGroup!(g.key) : undefined}
            title={groupSelectable ? "Clicar para comparar este tee com os outros" : undefined}
          >
            <Tint className="tee-dot" bg={g.colorHex} title={g.label} />
            <span className="u-fw-700 u-ws-nowrap">
              {dist != null && dist > 0 ? `${fmt(dist)} m` : "– m"}
            </span>
            {sameName && names[0] && <span className="fs-12 u-fw-600 u-c-text-1">{names[0]}</span>}
            {gs.map((s: SexKey) => {
              const r = ratings[s];
              const tee = g.teeBySex[s];
              const name = sameName ? "" : teeLabel(tee);
              // CR/Slope não publicados → «estimado», com a origem no title.
              const est = r && !nine ? tee?.ratings?.holes18?.estimado : undefined;
              const rating = (
                <>
                  {(s === "M" || s === "F") && <SexBadge sex={s} />}
                  {name && <span className="u-fw-600 u-c-text-1">{name}</span>}
                  {r ? <>CR {fmtCR(r.cr)} · Slope {r.sl}</> : <span className="muted">sem rating</span>}
                  {est && <span className="muted u-fst-italic" title={`ESTIMADO — ${est}`}>estimado</span>}
                </>
              );
              if (selectable && tee) {
                // Pela chave tee + sexo (há 27 pares M/F com o MESMO teeId: só pelo
                // teeId acendiam os dois botões). O teeId cru continua a valer para
                // quem ainda o passa (Campos).
                const active = selectedTeeId != null && (teeChoiceKey(tee) === selectedTeeId || tee.teeId === selectedTeeId);
                return (
                  <button
                    key={s}
                    onClick={() => onSelectTee!(tee)}
                    title="Seleccionar este rating para o cálculo"
                    className={active ? "tee-bar-sexbtn is-active" : "tee-bar-sexbtn"}
                  >
                    {rating}
                  </button>
                );
              }
              return (
                <span
                  key={s}
                  className="fs-12 u-d-inline-flex u-ai-center u-gap-4px u-ws-nowrap u-c-text-2"
                >
                  {rating}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}
