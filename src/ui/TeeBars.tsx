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
import { fmt, fmtCR } from "../utils/format";
import { physicalTeeGroups, type SexKey } from "../utils/teeGroups";

interface TeeBarsProps {
  tees: Tee[];
  /** Selector por sexo (Simulador): cada variante M/F vira botão. */
  onSelectTee?: (tee: Tee) => void;
  selectedTeeId?: string | null;
  /** Selecção do tee inteiro (Campos): a barra toda fica clicável. */
  onSelectGroup?: (key: string) => void;
  selectedGroupKey?: string | null;
}

export default function TeeBars({ tees, onSelectTee, selectedTeeId, onSelectGroup, selectedGroupKey }: TeeBarsProps) {
  const groups = useMemo(() => physicalTeeGroups(tees), [tees]);
  if (!groups.length) return null;
  const selectable = !!onSelectTee;
  const groupSelectable = !!onSelectGroup;

  return (
    <div className="tee-badges-row">
      {groups.map((g) => {
        const dist = g.teeHoles.distances?.total ?? null;
        const gs = (["M", "F", "U"] as const).filter((s) => g.h18[s] || g.teeBySex[s]);
        const groupActive = groupSelectable && selectedGroupKey === g.key;
        return (
          <span
            key={g.key}
            className="tee-badge-card"
            onClick={groupSelectable ? () => onSelectGroup!(g.key) : undefined}
            title={groupSelectable ? "Clicar para comparar este tee com os outros" : undefined}
            style={{
              flexDirection: "row", alignItems: "center", gap: 10, padding: "8px 12px", flexWrap: "wrap",
              cursor: groupSelectable ? "pointer" : undefined,
              border: groupActive ? "1.5px solid var(--accent)" : undefined,
              background: groupActive ? "var(--accent-light)" : undefined,
            }}
          >
            <span className="tee-dot" style={{ background: g.colorHex }} title={g.label} />
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              {dist != null && dist > 0 ? `${fmt(dist)} m` : "– m"}
            </span>
            {gs.map((s: SexKey) => {
              const r = g.h18[s];
              const tee = g.teeBySex[s];
              const rating = (
                <>
                  {(s === "M" || s === "F") && <SexBadge sex={s} />}
                  {r ? <>CR {fmtCR(r.cr)} · Slope {r.sl}</> : <span className="muted">sem rating</span>}
                </>
              );
              if (selectable && tee) {
                const active = selectedTeeId != null && tee.teeId === selectedTeeId;
                return (
                  <button
                    key={s}
                    onClick={() => onSelectTee!(tee)}
                    title="Seleccionar este rating para o cálculo"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 8px", borderRadius: "var(--radius)", cursor: "pointer", fontSize: "var(--fs-12)",
                      border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      background: active ? "var(--accent-light)" : "var(--bg-card)",
                      color: active ? "var(--accent-text)" : "var(--text-2)",
                      fontWeight: active ? 700 : 400,
                    }}
                  >
                    {rating}
                  </button>
                );
              }
              return (
                <span
                  key={s}
                  className="fs-12"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", color: "var(--text-2)" }}
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
