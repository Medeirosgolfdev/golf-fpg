/**
 * golfgenius.ts — Torneios FFG no GolfGenius: tee sheet → FpgDraw, bracket de
 * match play, sexo/datas/escalão inferidos e a chave de evento que junta os
 * escalões do mesmo campeonato.
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import type { FpgDraw } from "../nacional2026Loader";
import type { MatchplayFile, MatchplayRound, MatchplayTeamMatch } from "../../ui/circuit/matchplayTypes";
import { normalizeName, ffgEscaloesOfTournament } from "./names";
import type { FFGTournament, FFGDrawRound, CatalogEntry } from "./types";

export function ggDrawToFpgDraw(round: FFGDrawRound): FpgDraw {
  return {
    name: round.label ?? undefined,
    date: round.dateIso ?? undefined,
    totalJogadores: round.groups.reduce((s, g) => s + g.players.length, 0),
    groups: round.groups.map((g) => ({
      teeTime: g.teeTime,
      startHole: null, // o GG não publica buraco de saída na tee sheet
      tee: round.tee ?? null,
      players: g.players.map((p) => ({
        nome: normalizeName(p.name),
        clube: p.club,
        hcp: p.hcp,
        tee: p.tee ?? null,
      })),
    })),
  };
}

/* ── Match play GG → MatchplayFile (bracket knockout individual) ──────────
   O GolfGenius não expõe o score dos confrontos ao público, mas dá-nos tudo o
   resto: os PARES vêm do tee sheet (draws com grupos de 2) e o VENCEDOR de
   cada par é quem aparece na lista de jogadores do evento dessa eliminatória
   (nos eventos match play do dropdown, `players` = vencedores). Para rondas
   sem tee sheet publicado (a FFG publica-o em cima da hora), os pares
   sintetizam-se pela ordem do bracket: vencedores dos matches 1+2 defrontam-se
   no match 1 da ronda seguinte (knockout standard). */
const mpKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const mpLabelBase = (s: string | null | undefined) => mpKey((s || "").replace(/\(.*$/, ""));
const isKnockoutLabel = (s: string | null | undefined) => /finale|1\/\d+|demi|quart|match\s*play/i.test(s || "");

/** Bracket do scraper com os nomes GG ("LE THEO Maxence") normalizados p/ display. */
export function normalizeMpNames(mp: MatchplayFile): MatchplayFile {
  const n = (s: string | null) => (s ? normalizeName(s) : s);
  return {
    ...mp,
    flights: mp.flights.map((fl) => ({
      ...fl,
      rounds: fl.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => ({
          ...m,
          home: m.home ? { ...m.home, name: n(m.home.name) } : null,
          away: m.away ? { ...m.away, name: n(m.away.name) } : null,
          games: m.games.map((g) => ({
            ...g,
            home: g.home ? { ...g.home, name: n(g.home.name), players: g.home.players.map((p) => normalizeName(p)) } : null,
            away: g.away ? { ...g.away, name: n(g.away.name), players: g.away.players.map((p) => normalizeName(p)) } : null,
          })),
        })),
      })),
    })),
  };
}

export function buildFfgMatchplay(data: FFGTournament): MatchplayFile | undefined {
  // Bracket completo do scraper (winners + "2 & 1" + holes) — fonte preferida.
  if (data.matchplay?.flights?.length) return normalizeMpNames(data.matchplay);
  const matchEvents = (data.events ?? []).filter((e) => e.format === "match");
  const draws = data.draws ?? [];
  const knockoutDraws = draws.filter((r) => isKnockoutLabel(r.label));
  if (!matchEvents.length && !knockoutDraws.some((r) => r.groups.length)) return undefined;

  const side = (name: string | null): MatchplayTeamMatch["home"] =>
    name ? { teamId: null, name: normalizeName(name), iso: null, country: null, points: null, isLead: false } : null;

  // Rondas na ordem do tee sheet (R3, R4, …); eventos match casados por label.
  const rounds: MatchplayRound[] = [];
  let prevWinnersOrdered: (string | null)[] | null = null; // nomes crus, ordem do bracket
  let number = 0;
  for (const dr of knockoutDraws) {
    number += 1;
    const ev = matchEvents.find((e) => mpLabelBase(e.name) === mpLabelBase(dr.label));
    const winners = new Set((ev?.players ?? []).map((p) => mpKey(p.name)));
    // Pares: tee sheet publicado > síntese pela ordem do bracket anterior.
    let pairs: Array<{ a: string | null; b: string | null; teeTime: string | null }> = [];
    if (dr.groups.length) {
      pairs = dr.groups
        .filter((g) => g.players.length >= 1)
        .map((g) => ({ a: g.players[0]?.name ?? null, b: g.players[1]?.name ?? null, teeTime: g.teeTime || null }));
    } else if (prevWinnersOrdered && prevWinnersOrdered.length >= 2 && prevWinnersOrdered.every(Boolean)) {
      for (let i = 0; i + 1 < prevWinnersOrdered.length; i += 2) {
        pairs.push({ a: prevWinnersOrdered[i], b: prevWinnersOrdered[i + 1], teeTime: null });
      }
    } else if (!ev?.players?.length) {
      continue; // ronda futura sem pares nem vencedores — nada a mostrar
    }
    const roundWinnersRaw: (string | null)[] = [];
    const matches: MatchplayTeamMatch[] = pairs.map((p, i) => {
      const aWon = p.a != null && winners.has(mpKey(p.a));
      const bWon = p.b != null && winners.has(mpKey(p.b));
      const winner = aWon && !bWon ? "home" : bWon && !aWon ? "away" : null;
      // Nomes CRUS na ordem do bracket (o display normaliza, mas o matching
      // da ronda seguinte precisa do nome tal como o GG o escreve).
      roundWinnersRaw.push(winner === "home" ? p.a : winner === "away" ? p.b : null);
      return {
        teamMatchId: null, matchNo: i + 1, startTime: p.teeTime,
        result: null, isSettled: winner != null, isStarted: false,
        home: side(p.a), away: side(p.b), winner, games: [],
      };
    });
    if (!matches.length) continue;
    rounds.push({ number, name: (dr.label || "").replace(/\s*\(.*$/, "") || `Ronda ${number}`, date: dr.dateIso, matches });
    prevWinnersOrdered = roundWinnersRaw;
  }
  if (!rounds.length) return undefined;
  return {
    tournament: data.tournament, slug: data.slug, year: data.year,
    format: "KnockOut", parentCompetitionId: null,
    startDate: rounds[0]?.date ?? undefined, endDate: rounds[rounds.length - 1]?.date ?? undefined,
    flights: [{
      competitionId: 1, name: "Match Play", format: "KnockOut", parentId: null,
      isCompleted: false, source: data.source || "", rounds,
    }],
    scrapedAt: data.scrapedAt || "",
  };
}

/** Slugs GG que NÃO são torneios franceses (espelha EXCLUDE_SLUGS de
 *  scripts/lib/ffgolf-gg.js — o roster já os exclui; a /ffg também deve). */
export const GG_NON_FR_SLUGS = new Set<string>([
  "junior-invitational",                    // Sage Valley (EUA)
  "world-junior-girls-golf-championship",   // WAGR (Canadá)
]);

/** Sexo a partir do nome do torneio (só quando é inequívoco). Sem sinal → undefined. */
export function ggSexFromName(name: string): "M" | "F" | undefined {
  const g = /gar[cç]ons|boys/i.test(name), f = /filles|girls/i.test(name);
  return g && !f ? "M" : f && !g ? "F" : undefined;
}

/** GolfGenius: torneio FFG que vive só no GG (sem gémeo no portal de resultados).
 *  Reutiliza a DivView — a mesma vista que a versão pré-CircuitShell usava. */
/** Datas de um torneio GG: usa o topo do ficheiro, senão deriva das rondas do
 *  match play (sempre presentes). Sem isto, ficheiros sem `dateStart` (CFJ 2026
 *  Filles/Benjamins/Benjamines) davam `entryDateKey` "00000000" e afundavam para
 *  o fundo da sidebar (ordenada por data) = "não aparecem". */
export function ggInferDates(data: FFGTournament): { start?: string; end?: string } {
  const mp = (data.matchplay?.flights ?? [])
    .flatMap((f) => (f.rounds ?? []).map((r) => r.date))
    .filter((d): d is string => !!d)
    .sort();
  return { start: data.dateStart ?? mp[0], end: data.dateEnd ?? mp[mp.length - 1] };
}

/** Label de escalão de UM torneio GG FFG (o GG não o publica) — inferido do slug:
 *  "…u12-garcons…" → "U12 Garçons", "…benjamines" → "Benjamines". */
export function ffgGgEscalaoLabel(meta: CatalogEntry, data: FFGTournament): string {
  const s = (meta.slug || "").toLowerCase();
  const sex = /gar[cç]ons|boys/.test(s) ? "Garçons" : /filles|girls/.test(s) ? "Filles" : "";
  const age = /u1[0248]/.exec(s)?.[0]?.toUpperCase();
  if (/benjamines/.test(s)) return "Benjamines";
  if (/benjamins/.test(s)) return "Benjamins";
  if (/minimes/.test(s)) return sex ? `Minimes ${sex}` : "Minimes";
  if (age) return sex ? `${age} ${sex}` : age;
  const esc = ffgEscaloesOfTournament(data.tournament || meta.title, data.divisions ?? []);
  return esc[0] || ((data.divisions ?? []).join("/")) || meta.title || "—";
}

/** Chave de "evento" para fundir escalões do MESMO campeonato: tira do slug os
 *  tokens de escalão/sexo/patrocinador. Os 4 do CFJ 2026 colapsam todos em
 *  "championnat-de-france-des-jeunes". */
export function ffgEventFamilyKey(meta: CatalogEntry): string {
  return (meta.slug || "")
    .toLowerCase()
    .replace(/-troph[ée]e-.*$/, "")
    .replace(/\b(u1[0248]|benjamins|benjamines|minimes|gar[cç]ons|filles|boys|girls)\b/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Slug de família → título legível FR ("championnat-de-france-des-jeunes" →
 *  "Championnat de France des Jeunes"). */
export function ffgPrettyTitle(familyKey: string): string {
  const small = new Set(["de", "des", "du", "la", "le", "et", "d", "aux", "au"]);
  return familyKey.split("-").filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Uma divisão (escalão) de um torneio GG FFG — leaderboard + match play + draws. */
