/**
 * KidsLink — Seta ↗ com link para KIDSPage de um jogador.
 * Usa um Map<normName, { name, memberId? }> para resolver o hash.
 * Reutilizado em USKIDSPage, BJGTPage, DORALPage.
 */
import React from "react";
import { normName } from "../data/KIDSdataLoader";

export interface KidsLinkEntry {
  n: string;            // nome display
  memberId?: string;    // memberId USKids (preferido como hash)
}

/** Context para partilhar o mapa autoRivals dentro de uma página */
export const KidsLinkCtx = React.createContext<Map<string, KidsLinkEntry>>(new Map());

/** Componente ↗ — só aparece se o jogador existir no mapa */
export function KidsLink({ nome }: { nome: string }) {
  const map = React.useContext(KidsLinkCtx);
  const entry = map.get(normName(nome));
  if (!entry) return null;
  const hash = entry.memberId ?? encodeURIComponent(entry.n);
  return (
    <a
      href="/kids"
      onClick={e => { e.preventDefault(); window.open(`/kids#${hash}`, "_blank"); }}
      title="Ver em Kids"
      style={{
        fontWeight: 800, color: "var(--color-good-dark)", fontSize: 13,
        cursor: "pointer", textDecoration: "none", flexShrink: 0, marginLeft: 4,
      }}>
      ↗
    </a>
  );
}
