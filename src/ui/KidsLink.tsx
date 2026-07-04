/**
 * KidsLink — Seta ↗ com link para KIDSPage de um jogador.
 * Usa um Map<normName, { name, memberId? }> para resolver o hash.
 * Reutilizado em USKIDSPage, BJGTPage, DORALPage.
 */
import React from "react";
import { normName } from "../data/KIDSdataLoader";

export interface KidsLinkEntry {
  n: string;            // nome display
  memberId?: string;    // memberId USKids (fallback de hash)
  id?: string;          // juniorId canónico kids2 → link directo /kids2/{id} (sem ambiguidade)
}

/** Context para partilhar o mapa de juniores dentro de uma página */
export const KidsLinkCtx = React.createContext<Map<string, KidsLinkEntry>>(new Map());

/** Componente ↗ — só aparece se o jogador existir no mapa */
export function KidsLink({ nome }: { nome: string }) {
  const map = React.useContext(KidsLinkCtx);
  const entry = map.get(normName(nome));
  if (!entry) return null;
  // Preferir o link canónico /kids2/{id} (inequívoco). Sem id, cair no hash
  // retro-compatível (memberId ou nome), que o KIDS2Page resolve.
  const to = entry.id
    ? `/kids2/${entry.id}`
    : `/kids2#${entry.memberId ?? encodeURIComponent(entry.n)}`;
  return (
    <a
      href={to}
      onClick={e => { e.preventDefault(); window.open(to, "_blank"); }}
      title="Ver em Kids"
      style={{
        fontWeight: 800, color: "var(--color-good-dark)", fontSize: "var(--fs-13)",
        cursor: "pointer", textDecoration: "none", flexShrink: 0, marginLeft: 4,
      }}>
      ↗
    </a>
  );
}
