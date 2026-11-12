/**
 * KidsLink — Seta ↗ com link para KIDSPage de um jogador.
 * Usa um Map<normName, { name, memberId? }> para resolver o hash.
 * Reutilizado em USKIDSPage, BJGTPage, DORALPage.
 */
import React from "react";
import { normName } from "../data/KIDSdataLoader";
import ExtLink from "./ExternalLink";

export interface KidsLinkEntry {
  n: string;            // nome display
  memberId?: string;    // memberId USKids (fallback de hash)
  id?: string;          // juniorId canónico kids2 → link directo /kids2/{id} (sem ambiguidade)
  fed?: string;         // federado FPG da ficha — desfaz homónimos (Manuel pai × filho)
  pais?: string;        // país da ficha (ISO-2) — bandeira de quem a fonte não diz de onde é
  sexo?: "M" | "F";     // sexo da ficha — para quem a fonte não o traz
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

/** A seta ↗ para a ficha Kids — a mesma em todas as tabelas (nova janela). */
export function KidsArrow({ to, title = "Ver em Kids" }: { to: string; title?: string }) {
  return <ExtLink href={to} title={title} className="kids-arrow">↗</ExtLink>;
}

/** Mapa de recurso da seta ↗ (ver KidsLink): mesma chave `normName`. */
export const KidsLinkFallbackCtx = React.createContext<ReadonlyMap<string, { n: string; memberId?: string | null }>>(new Map());

/** Context para partilhar o mapa de juniores dentro de uma página */
export const KidsLinkCtx = React.createContext<Map<string, KidsLinkEntry>>(new Map());

/** Componente ↗ — só aparece se o jogador existir no mapa (KidsLinkCtx).
 *  `fed`: federado FPG da linha — com ele, um homónimo (o pai do Manuel) não liga à
 *  ficha errada. Sem o jogador no roster, tenta o mapa de recurso
 *  (KidsLinkFallbackCtx, mesma chave `normName`) — os rivais da /uskids, que
 *  chegam antes do roster. */
export function KidsLink({ nome, fed }: { nome: string; fed?: string | null }) {
  const map = React.useContext(KidsLinkCtx);
  const fallback = React.useContext(KidsLinkFallbackCtx);
  const key = normName(nome);
  const entry = map.get(key);
  if (entry && fed && entry.fed && entry.fed !== fed) return null;
  if (entry) return <KidsArrow to={kidsUrl({ id: entry.id, memberId: entry.memberId, name: entry.n })} />;
  const alt = fallback.get(key);
  return alt ? <KidsArrow to={kidsUrl({ memberId: alt.memberId, name: alt.n })} /> : null;
}
