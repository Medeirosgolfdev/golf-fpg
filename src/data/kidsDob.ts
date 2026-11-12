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
import { fichaDoKids } from "./kidsFicha";
import { isoDate } from "../utils/format";

/** O que interessa do juniors-scout.json. */
export interface ScoutDobFile { players: Record<string, { d?: string; y?: number; ne?: [number, number]; hh?: [string, number][] }> }

/** Nascimento do Kids 2: a data lida, ou o ano estimado (um ou dois anos). */
export type KidsNasc =
  | { dob: string }
  /** Ano CERTO sem data (Federgolf, GolfBox) — mostra-se como lido, não a vermelho. */
  | { birthYear: number }
  | { birthYearEst: number; birthYearEstMax: number; estNote: string };

/** HCP do Kids 2 perto de uma data: o valor e a data em que foi visto. */
export interface KidsHcp { hcp: number; date: string }

/** Nome (e federado, se houver) → nascimento do Kids 2; `hcpAt` → o HCP mais perto
 *  de uma data (para pintar o SD de quem não tem HCP na linha — 03/11/2026).
 *  `juniorId`: a ficha dada pela própria fonte — ganha ao nome (kidsFicha.ts). */
export type KidsDobLookup = ((nome: string | null | undefined, fed?: string | null, juniorId?: string | null) => KidsNasc | undefined) & {
  hcpAt?: (nome: string | null | undefined, fed: string | null | undefined, date: string | null | undefined, juniorId?: string | null) => KidsHcp | undefined;
};

/** Até quantos dias de distância um HCP do Kids 2 ainda serve para a data do torneio. */
export const KIDS_HCP_JANELA_DIAS = 183;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
export const KIDS_EST_NOTE = "ano deduzido dos escalões USKids em que jogou (Kids 2)";

export function makeKidsDobLookup(kidsMap: Map<string, KidsLinkEntry>, scout: ScoutDobFile | null | undefined): KidsDobLookup {
  const fichaDe = (nome: string | null | undefined, fed?: string | null, juniorId?: string | null) => {
    if (!scout) return undefined;
    const kid = fichaDoKids(kidsMap, { nome, fed, juniorId });
    return kid?.id ? scout.players[kid.id] : undefined;
  };
  const lookup: KidsDobLookup = (nome, fed, juniorId) => {
    const s = fichaDe(nome, fed, juniorId);
    if (s?.d && ISO_DATE.test(s.d)) return { dob: s.d.slice(0, 10) };
    if (typeof s?.y === "number") return { birthYear: s.y };
    if (s?.ne) return { birthYearEst: s.ne[0], birthYearEstMax: s.ne[1], estNote: KIDS_EST_NOTE };
    return undefined;
  };
  // O HCP com a data mais perto da do torneio (no máximo KIDS_HCP_JANELA_DIAS de
  // distância; em empate, o de antes). Sem data do torneio ou longe demais → nada.
  lookup.hcpAt = (nome, fed, date, juniorId) => {
    const hh = fichaDe(nome, fed, juniorId)?.hh;
    const iso = date ? isoDate(date) : "";   // aceita «8/13/2026» (USKids) e «2026-08-13»
    const ref = iso ? Date.parse(iso) : NaN;
    if (!hh?.length || Number.isNaN(ref)) return undefined;
    let best: KidsHcp | undefined, bestD = Infinity;
    for (const [d, hcp] of hh) {
      const dist = Math.abs(Date.parse(d) - ref) / 864e5;
      if (dist < bestD || (dist === bestD && d <= iso)) { best = { hcp, date: d }; bestD = dist; }
    }
    return bestD <= KIDS_HCP_JANELA_DIAS ? best : undefined;
  };
  return lookup;
}

interface DobPlayer { name: string; fed?: string; fedCode?: string; juniorId?: string | null; dob?: string | null; birthYear?: number | null; birthYearEst?: number | null; hcpExact?: number | null }

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

/** Cópia do torneio com o nascimento do Kids 2 em quem não tem data e o HCP do
 *  Kids 2 (perto da data do torneio) em quem não tem HCP — o SD pinta-se com ele.
 *  Devolve o MESMO objecto quando não há nada a acrescentar. */
export function withKidsDob<P extends DobPlayer, T extends { players: P[]; date?: string | null }>(t: T, lookup: KidsDobLookup | null): T {
  if (!lookup) return t;
  let mudou = false;
  const players = t.players.map((p): P => {
    let q = p;
    if (!p.dob) {
      const n = lookup(p.name, p.fed || p.fedCode, p.juniorId);
      const a = n ? kidsAcrescento(p, n) : null;
      if (a) {
        q = { ...q, ...a };
        // Dado CERTO do Kids 2 (data lida ou ano de uma federação): a estimativa da
        // fonte sai — senão a tabela continua a pintá-la a vermelho (Faldo Madeira
        // 2026: Könemund e Groß com o ano da DGV e a mostrar «2011»/«2012–13» estimados).
        if ("dob" in a || "birthYear" in a) q = { ...q, birthYearEst: undefined, birthYearEstMax: undefined, estNote: undefined };
      }
    }
    if (q.hcpExact == null && lookup.hcpAt) {
      const h = lookup.hcpAt(p.name, p.fed || p.fedCode, t.date, p.juniorId);
      if (h) q = { ...q, hcpExact: h.hcp, hcpKidsDate: h.date };
    }
    if (q !== p) mudou = true;
    return q;
  });
  return mudou ? { ...t, players } : t;
}

/** Só a data lida, de um nascimento do Kids 2. */
export const kidsDobLida = (n: KidsNasc | undefined): string | undefined => (n && "dob" in n ? n.dob : undefined);
