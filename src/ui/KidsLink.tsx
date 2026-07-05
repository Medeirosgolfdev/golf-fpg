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

/**
 * kidsUrl — MÉTODO ÚNICO de construir uma ligação para a ficha kids2 de um
 * jogador. Todas as páginas (FPG, FFG, RFEG, USKids, Draws, Major, kids…) devem
 * usar isto em vez de montar `/kids2#...` à mão. O resolver do KIDS2Page
 * (resolveToId) sabe desfazer qualquer uma destas formas.
 *
 * Preferência: id canónico (inequívoco) > memberId USKids > fed FPG > nome.
 */
export function kidsUrl(opts: { id?: string | null; memberId?: string | null; fed?: string | null; name?: string | null }): string {
  if (opts.id) return `/kids2/${opts.id}`;
  if (opts.memberId) return `/kids2#${encodeURIComponent(String(opts.memberId))}`;
  if (opts.fed) return `/kids2#${encodeURIComponent(String(opts.fed))}`;
  return `/kids2#${encodeURIComponent(opts.name ?? "")}`;
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
  const to = kidsUrl({ id: entry.id, memberId: entry.memberId, name: entry.n });
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
