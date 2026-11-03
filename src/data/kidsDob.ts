/**
 * src/data/kidsDob.ts — nascimento do Kids 2 para quem a fonte do torneio não
 * o traz (02/11/2026: no Venice Open 2026 da USKids as colunas Nasc./Idade
 * saíam vazias para toda a gente, mesmo para quem tem a data na ficha).
 *
 * Liga como a seta ↗: nome → ficha (o mapa do juniors-links.json, KidsLinkCtx)
 * → juniors-scout.json. Um homónimo com outro federado não conta (o pai do
 * Manuel). A data completa lida (`d`) ganha sempre; sem ela, o ano CERTO de uma
 * fonte que o publica (`y` — Federgolf, GolfBox; 03/11/2026); sem nada, o ano ESTIMADO
 * pelos escalões USKids (`ne`, scripts/aggregator/util/nascimento-uskids.js —
 * acerta ~97%), que as tabelas mostram a vermelho, como estimativa. Nunca o ano
 * do ranking (`r`), que falha. Usado pelo TournamentDetail (voltas e Resumo),
 * pelo DrawTab e pelo AdmissionsTab, por isso as páginas de torneio ficam iguais.
 */
import type { KidsLinkEntry } from "../ui/KidsLink";
import { normName } from "../utils/normName";

/** O que interessa do juniors-scout.json. */
export interface ScoutDobFile { players: Record<string, { d?: string; y?: number; ne?: [number, number] }> }

/** Nascimento do Kids 2: a data lida, ou o ano estimado (um ou dois anos). */
export type KidsNasc =
  | { dob: string }
  /** Ano CERTO sem data (Federgolf, GolfBox) — mostra-se como lido, não a vermelho. */
  | { birthYear: number }
  | { birthYearEst: number; birthYearEstMax: number; estNote: string };

/** Nome (e federado, se houver) → nascimento do Kids 2. */
export type KidsDobLookup = (nome: string | null | undefined, fed?: string | null) => KidsNasc | undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
export const KIDS_EST_NOTE = "ano deduzido dos escalões USKids em que jogou (Kids 2)";

export function makeKidsDobLookup(kidsMap: Map<string, KidsLinkEntry>, scout: ScoutDobFile | null | undefined): KidsDobLookup {
  return (nome, fed) => {
    if (!scout || !nome) return undefined;
    const kid = kidsMap.get(normName(nome));
    if (!kid?.id || (fed && kid.fed && kid.fed !== fed)) return undefined;
    const s = scout.players[kid.id];
    if (s?.d && ISO_DATE.test(s.d)) return { dob: s.d.slice(0, 10) };
    if (typeof s?.y === "number") return { birthYear: s.y };
    if (s?.ne) return { birthYearEst: s.ne[0], birthYearEstMax: s.ne[1], estNote: KIDS_EST_NOTE };
    return undefined;
  };
}

interface DobPlayer { name: string; fed?: string; fedCode?: string; dob?: string | null; birthYear?: number | null; birthYearEst?: number | null }

/** Há alguém sem data nem federado (o federado tem-na pelo playersDB)? */
export function precisaKidsDob(players: readonly DobPlayer[]): boolean {
  return players.some(p => !p.dob && !(p.fed || p.fedCode));
}

/** O que o Kids 2 acrescenta a um jogador sem data: tudo, se não tiver nada;
 *  só a data lida, se a fonte já der o ano (e for o mesmo ano — ex.: ranking da
 *  Federgolf) ou uma estimativa. Uma estimativa nunca passa por cima de nada. */
export function kidsAcrescento(p: Omit<DobPlayer, "name">, n: KidsNasc): KidsNasc | null {
  if (p.birthYear == null && p.birthYearEst == null) return n;
  // Um ano CERTO (Federgolf) passa por cima de uma estimativa, nunca de um ano lido.
  if ("birthYear" in n) return p.birthYear == null ? n : null;
  if (!("dob" in n)) return null;
  return p.birthYear == null || +n.dob.slice(0, 4) === p.birthYear ? n : null;
}

/** Cópia do torneio com o nascimento do Kids 2 em quem não tem data.
 *  Devolve o MESMO objecto quando não há nada a acrescentar. */
export function withKidsDob<P extends DobPlayer, T extends { players: P[] }>(t: T, lookup: KidsDobLookup | null): T {
  if (!lookup) return t;
  let mudou = false;
  const players = t.players.map((p): P => {
    if (p.dob) return p;
    const n = lookup(p.name, p.fed || p.fedCode);
    const a = n ? kidsAcrescento(p, n) : null;
    if (!a) return p;
    mudou = true;
    return { ...p, ...a };
  });
  return mudou ? { ...t, players } : t;
}

/** Só a data lida (as Inscrições não mostram estimativas). */
export const kidsDobLida = (n: KidsNasc | undefined): string | undefined => (n && "dob" in n ? n.dob : undefined);
