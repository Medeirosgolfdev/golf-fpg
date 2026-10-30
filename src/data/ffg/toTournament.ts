/**
 * toTournament.ts — Conversores de França para o Tournament da FPG (o formato
 * que o TournamentDetail desenha): portal FFG Resultats (com par real e cartão
 * por série) e GolfGenius.
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { isPT } from "../../utils/ptPlayers";
import { normPaisDisplay } from "../../utils/flagUtils";
import { intlCountryCell } from "../intlCommon";
import type { Tournament as FPGTournament, ScorecardOptions } from "../fpgTypes";
import { intlScorecardOptions } from "../intlScorecard";
import { buildFPGTournament, type IntlPlayerIn, type IntlRoundIn } from "../intlTournament";
import { normalizeName, ffgPlayerName, ffgCountry } from "./names";
import type { FFGTournament, CatalogEntry, FFGResTournament, FFGResSerie, FFGSerieCourse } from "./types";

/** «U12G»/«U12 G»/«BG»/«MF» → chave única U12G/U14G/U16F… (BG/BF = Benjamins = U14,
 *  MG/MF = Minimes = U16 — os GP Jeunes usam as duas grafias). */
const serieCourseKey = (label: string): string => {
  const k = String(label || "").toUpperCase().replace(/\s+/g, "");
  const alias: Record<string, string> = { BG: "U14G", BF: "U14F", MG: "U16G", MF: "U16F" };
  return alias[k] || k;
};

const fmtCr = (v: number) => v.toFixed(1).replace(".", ",");
const faixa = (a: number, b: number, f: (v: number) => string) => (a === b ? f(a) : `${f(a)}–${f(b)}`);

/** CR/Slope do tee por fonte: o do organizador (RMS9) e o que se deduz do
 *  handicap de jogo de todos os jogadores da lista de partidas. Uma faixa larga
 *  (poucos jogadores) não diz nada e não se mostra. */
export function ratingFontes(sc: FFGSerieCourse | null | undefined): NonNullable<FPGTournament["_ratingFontes"]> {
  const out: NonNullable<FPGTournament["_ratingFontes"]> = [];
  if (!sc) return out;
  if (sc.ratingRms9) out.push({ fonte: "RMS9", cr: fmtCr(sc.ratingRms9.cr), slope: String(sc.ratingRms9.slope),
    title: "CR/Slope do tee no RMS9 do organizador (course-assignments do torneio)" });
  const h = sc.ratingHcp;
  if (h && h.slope[1] - h.slope[0] <= 15 && h.cr[1] - h.cr[0] <= 1.5) out.push({ fonte: "HCP de jogo",
    cr: faixa(h.cr[0], h.cr[1], fmtCr), slope: faixa(h.slope[0], h.slope[1], String),
    title: `Deduzido do handicap de jogo dos ${h.n} jogadores (por volta) da lista de partidas do RMS9: só estes CR/Slope dão o HCP de todos` });
  const s = sc.ratingSss;
  if (s) out.push({ fonte: "SSS FFG", cr: fmtCr(s.sss), slope: "",
    title: `SSS que a FFG usou nesta série (Mérite Jeunes): média das voltas − média vs SSS, mediana de ${s.n} jogador${s.n === 1 ? "" : "es"}`
      + (s.n > 1 ? ` (${fmtCr(s.lo)} a ${fmtCr(s.hi)})` : "")
      + (sc.courseRating != null ? `. SSS − CR = ${(s.sss - sc.courseRating).toFixed(1).replace(".", ",")} (PCC médio da prova)` : "") });
  return out;
}

/* ── Categoria/título amigável a partir do nome do torneio ────── */
function shortTitle(t: FFGTournament | CatalogEntry): string {
  // `title` é opcional no catálogo (entradas sem página de scores no ffgolf.org)
  // → cai no nome do torneio scrapado e, em último caso, no slug.
  const name = ("title" in t && t.title) ? t.title
    : "tournament" in t ? t.tournament
    : t.slug;
  return name
    .replace(/^Championnat de France des Jeunes\s*-\s*/i, "Champ. France ")
    .replace(/^Internationaux de France\s+/i, "Internat. France ")
    .replace(/^Championnat\s+/i, "Champ. ")
    .replace(/Trophée Crocodile/, "")
    .replace(/\s+\(Sage Valley\)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Adaptador FFG Resultats → FPGTournament (reusa IntlTournView com par real) ── */
export function ffgResToFPGTournament(data: FFGResTournament, serieFilter?: string): FPGTournament {
  // Filtrar série específica ou agregar tudo. Se o filtro não corresponde a
  // nenhuma série (caso comum quando vimos de outro torneio), faz fallback
  // para todas as séries em vez de devolver tournament vazio.
  let seriesToUse: FFGResSerie[];
  if (serieFilter && serieFilter !== "all") {
    const matched = data.details.series.filter((s) => s.serieId === serieFilter);
    seriesToUse = matched.length > 0 ? matched : data.details.series;
  } else {
    seriesToUse = data.details.series;
  }

  // Pegar par/curso da primeira série (todos partilham o mesmo curso geralmente)
  const firstSerie = seriesToUse[0] || data.details.series[0];
  const par: number[] = firstSerie?.parPerHole && firstSerie.parPerHole.length === 18
    ? firstSerie.parPerHole
    : [];
  const parTotal = firstSerie?.parTotal || 0;
  const courseName = firstSerie?.courseTerrain
    ? `Parcours ${firstSerie.courseTerrain}`
    : "";

  // Detectar nº de rondas REALMENTE jogadas (algum player tem tN não-null).
  // Importante: torneios futuros ou em curso podem ter t2/t3/t4 todos null
  // — nesse caso numRounds=1 para não marcar todos como WD.
  const allPlayers = seriesToUse.flatMap((s) => s.players.map((p) => ({ ...p, _serieId: s.serieId })));
  const hasT2 = allPlayers.some((p) => p.t2 != null);
  const hasT3 = allPlayers.some((p) => p.t3 != null);
  const hasT4 = allPlayers.some((p) => p.t4 != null);
  const numRounds = hasT4 ? 4 : hasT3 ? 3 : hasT2 ? 2 : 1;

  // Sort por total
  const sorted = [...allPlayers].sort((a, b) => {
    if (a.total == null && b.total == null) return 0;
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });

  // Enriquecimento GG (metros/SI por buraco) injectado pelo load effect, se disponível.
  // Quando há múltiplos tees no curso (Black/Garçons + Blue/Filles), seleccionar o correcto
  // baseado em sex maioritário dos jogadores da série filtrada.
  const ggC = (data as any)._ggCourse as { par?: number[]; meters?: number[]; si?: number[]; metersTotal?: number;
    courses?: Array<{ teeName?: string; par?: number[]; meters?: number[]; si?: number[]; metersTotal?: number }> } | undefined;
  let chosenCourse: { par?: number[]; meters?: number[]; si?: number[]; metersTotal?: number } | undefined = ggC;
  if (ggC?.courses && ggC.courses.length > 1) {
    // Maioria sex da série: M → tee mais longo (Black), F → tee mais curto (Blue)
    const seriePlayers = sorted; // já filtrados pela série visível
    const males = seriePlayers.filter((p) => p.sex === "M").length;
    const females = seriePlayers.filter((p) => p.sex === "F").length;
    const sortedByMeters = [...ggC.courses].sort((a, b) => (b.metersTotal || 0) - (a.metersTotal || 0));
    if (males > females) chosenCourse = sortedByMeters[0]; // tee mais longo
    else if (females > males) chosenCourse = sortedByMeters[sortedByMeters.length - 1]; // tee mais curto
    // Empate ou só 1 tee → fica com o ggC default (primeiro do scrape)
  }
  // Distâncias publicadas para ESTA série (marcas jovens da Liga/clube) ganham ao GG:
  // num GP Jeunes cada escalão joga as suas marcas, muitas vezes misturando tees.
  const serieCourse = seriesToUse.length === 1
    ? data._serieCourses?.[serieCourseKey(seriesToUse[0].label || seriesToUse[0].serieId)]
    : undefined;
  if (serieCourse && Array.isArray(serieCourse.meters) && serieCourse.meters.length === 18) {
    chosenCourse = { par: serieCourse.par, meters: serieCourse.meters,
      si: serieCourse.si?.length === 18 ? serieCourse.si : chosenCourse?.si, metersTotal: serieCourse.metersTotal };
  } else if (serieCourse?.si?.length === 18) {
    // Só o SI (sem metros): ganha ao inferido — precisa-se dele para o NDB do SD.
    chosenCourse = { ...(chosenCourse ?? { par: [], meters: [] }), si: serieCourse.si } as typeof chosenCourse;
  }
  const ggMeters = chosenCourse?.meters && chosenCourse.meters.length === 18 ? chosenCourse.meters : [];
  const ggSi = chosenCourse?.si && chosenCourse.si.length === 18 ? chosenCourse.si : [];

  // teeName fictício "FFG" para que o ScorecardLB inclua a linha de metros.
  // Sem teeName, o teeMetersMap não é populado e a linha "m" por buraco fica vazia.
  // Com distâncias da série, o nome diz que o tee é MISTO (ex.: «… — misto: Azuis + Vermelhas»).
  const ffgTeeName = serieCourse?.tee || (ggC as any)?.name || "Tees";
  const cards = [
    (p: FFGResSerie["players"][number]) => [p.scoresR1, p.t1] as const,
    (p: FFGResSerie["players"][number]) => [p.scoresR2, p.t2] as const,
    (p: FFGResSerie["players"][number]) => [p.scoresR3, p.t3] as const,
    (p: FFGResSerie["players"][number]) => [p.scoresR4, p.t4] as const,
  ];
  const players: IntlPlayerIn[] = sorted.map((p, idx) => {
    const rounds: IntlRoundIn[] = [];
    cards.forEach((card, i) => {
      const [scores, gross] = card(p);
      const dayPcc = serieCourse?.pcc?.[i];
      if (scores && scores.length === 18 && gross != null) rounds.push({ round: i + 1, gross, scores, ...(typeof dayPcc === "number" ? { extra: { pcc: dayPcc } } : {}) });
    });
    const playerCountry = ffgCountry(p); // país REAL ou null — nunca "FRA" inventado
    const clubText = (p.club && p.club.trim()) ? p.club.trim() : (playerCountry ? normPaisDisplay(playerCountry) : "");
    return {
      id: p.license || `${data.trnId}-${p._serieId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: ffgPlayerName(p),
      club: playerCountry ? intlCountryCell(playerCountry, clubText).trim() : clubText,
      total: p.total,
      toPar: p.total != null && parTotal > 0 ? p.total - (parTotal * numRounds) : null,
      hcp: p.hcp,
      rounds,
      scores: rounds[0]?.scores || [],
      // Marca conterrâneos para o ScorecardLB/AccumulatedLB aplicar .row-portuguese.
      isPortuguese: isPT(p.nationality, p.flag, p.name),
    };
  });

  // CR/Slope da série (publicados ou estimados) → SD de quem jogou esse tee.
  const rating = serieCourse?.courseRating != null && serieCourse?.slope != null
    ? { courseRating: serieCourse.courseRating, slope: serieCourse.slope } : {};
  const t = buildFPGTournament(
    { name: data.name, tcode: data.trnId, date: data.date, campo: courseName, rounds: numRounds },
    { par, si: ggSi, meters: ggMeters, teeName: ggMeters.length ? ffgTeeName : undefined, holes: par.length || 18, parTotal, ...rating },
    players,
    { keepNoRounds: true, raw: true },
  );
  if (serieCourse?.ratingEstimado && rating.courseRating != null) {
    t._sdEstimate = `CR ${rating.courseRating.toFixed(1)} · Slope ${rating.slope} estimados — ${serieCourse.ratingNota || "não publicados"}`;
  }
  const fontes = ratingFontes(serieCourse);
  if (fontes.length) t._ratingFontes = fontes;
  return t;
}

/* ── Adaptador FFG → FPGTournament (para reusar IntlTournView) ── */
export function toFPGTournament(t: FFGTournament): FPGTournament {
  // Ordenar: primeiro quem jogou mais voltas, depois o total ascendente (pode
  // estar fora de ordem nos JSONs antigos). Só pelo total, quem desistiu depois
  // da 1.ª volta ficava à frente do vencedor (CFJ 2026 U12 Garçons: Arthur Boue,
  // 85 numa volta, aparecia em 1.º acima de 140 em duas — 26/10/2026).
  const nVoltas = (p: FFGTournament["players"][number]) => (p.rounds || []).length;
  const maxVoltas = Math.max(0, ...t.players.map(nVoltas));
  const sorted = [...t.players].sort((a, b) => {
    if (nVoltas(a) !== nVoltas(b)) return nVoltas(b) - nVoltas(a);
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });
  // ⚠ O ScorecardLeaderboard só desenha a linha de metros para tees que
  // conheça pelo NOME (teeMetersMap é indexado por teeName). Sem teeName os
  // metros chegam ao componente e são ignorados — era por isso que o cartão
  // do campo não aparecia nos torneios GG. Mesmo truque do caminho do portal.
  // NUNCA inventar um nome de tee: o ScorecardLB indexa os metros por teeName,
  // portanto sem nome REAL de tee (vindo do cartão oficial) não há linha de
  // metros — fica vazia, que é o correcto quando não sabemos em que tee se jogou.
  const ggTeeName = t.course.tee || null;
  const hasMeters = !!ggTeeName
    && Array.isArray(t.course.meters) && t.course.meters.length === t.course.par.length;
  const { courseRating, slope, pcc } = t.course;
  const rated = courseRating != null && slope != null;
  const out = buildFPGTournament(
    { name: `${t.year} // ${shortTitle(t)}`, tcode: `${t.year}_${t.slug}`, date: t.dateStart || "", campo: t.course.name, rounds: t.rounds },
    {
      par: t.course.par, si: t.course.si, meters: t.course.meters,
      teeName: hasMeters ? ggTeeName ?? undefined : undefined,
      holes: t.course.par.length, parTotal: t.course.parTotal,
      ...(rated ? { courseRating, slope } : {}),
    },
    sorted.map((p, idx): IntlPlayerIn => ({
      id: p.id,
      // Position: usar p.pos se válido; sem ele, a ordem só para quem jogou
      // todas as voltas — quem não as acabou fica sem lugar (não «1.º»).
      pos: (typeof p.pos === "number" && p.pos > 0) ? p.pos : (nVoltas(p) === maxVoltas ? idx + 1 : null),
      name: normalizeName(p.name),
      club: p.country ? intlCountryCell(p.country, p.club || normPaisDisplay(p.country)) : p.club,
      total: p.total,
      toPar: p.toPar,
      hcp: p.hcp,
      rounds: p.rounds.map((r) => {
        const dayPcc = pcc?.[r.round - 1];
        return { round: r.round, gross: r.gross, scores: r.scores, ...(rated && typeof dayPcc === "number" ? { extra: { pcc: dayPcc } } : {}) };
      }),
      // Marca conterrâneos (.row-portuguese) — o caminho FFG-resultats já o
      // fazia; sem isto os torneios GolfGenius não destacavam PT (o GG publica
      // country null, mas a excepção por nome — Ricardo Castro Ferreira — pega).
      isPortuguese: isPT(p.country, null, p.name),
    })),
    { keepNoRounds: true, raw: true },
  );
  if (rated && t.course.ratingEstimado) {
    out._sdEstimate = `CR ${courseRating.toFixed(1)} · Slope ${slope} estimados — ${t.course.ratingNota || "não publicados"}`;
  }
  return out;
}

export function ffgScorecardOptions(): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, clubLabel: "Clube" });
}
