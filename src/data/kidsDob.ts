/**
 * src/data/kidsDob.ts — data de nascimento do Kids 2 para quem a fonte do
 * torneio não traz (02/11/2026: no Venice Open 2026 da USKids as colunas
 * Nasc./Idade saíam vazias para toda a gente, mesmo para quem tem a data na
 * ficha do Kids 2).
 *
 * Liga como a seta ↗: nome → ficha (o mapa do juniors-links.json, KidsLinkCtx)
 * → `d` do juniors-scout.json. Um homónimo com outro federado não conta (o pai
 * do Manuel). Só a data COMPLETA lida (`d`) — nunca o ano estimado do ranking
 * (`r`), que é deduzido dos escalões e falha por um ano em metade dos miúdos.
 * Usado pelo TournamentDetail (voltas e Resumo), pelo DrawTab e pelo
 * AdmissionsTab, por isso todas as páginas de torneio ficam iguais.
 */
import type { KidsLinkEntry } from "../ui/KidsLink";
import { normName } from "../utils/normName";

/** O que interessa do juniors-scout.json. */
export interface ScoutDobFile { players: Record<string, { d?: string }> }

/** Nome (e federado, se houver) → data de nascimento ISO do Kids 2. */
export type KidsDobLookup = (nome: string | null | undefined, fed?: string | null) => string | undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function makeKidsDobLookup(kidsMap: Map<string, KidsLinkEntry>, scout: ScoutDobFile | null | undefined): KidsDobLookup {
  return (nome, fed) => {
    if (!scout || !nome) return undefined;
    const kid = kidsMap.get(normName(nome));
    if (!kid?.id || (fed && kid.fed && kid.fed !== fed)) return undefined;
    const d = scout.players[kid.id]?.d;
    return d && ISO_DATE.test(d) ? d.slice(0, 10) : undefined;
  };
}

interface DobPlayer { name: string; fed?: string; fedCode?: string; dob?: string | null; birthYear?: number | null }

/** Há alguém sem nascimento nem federado (o federado tem-no pelo playersDB)? */
export function precisaKidsDob(players: readonly DobPlayer[]): boolean {
  return players.some(p => !p.dob && p.birthYear == null && !(p.fed || p.fedCode));
}

/** Cópia do torneio com a data do Kids 2 em quem não tem nascimento. Devolve o
 *  MESMO objecto quando não há nada a acrescentar. */
export function withKidsDob<P extends DobPlayer, T extends { players: P[] }>(t: T, lookup: KidsDobLookup | null): T {
  if (!lookup) return t;
  let mudou = false;
  const players = t.players.map((p): P => {
    if (p.dob || p.birthYear != null) return p;
    const dob = lookup(p.name, p.fed || p.fedCode);
    if (!dob) return p;
    mudou = true;
    return { ...p, dob };
  });
  return mudou ? { ...t, players } : t;
}
