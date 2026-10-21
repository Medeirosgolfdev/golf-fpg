/**
 * ffgEntries.ts — Entradas da /ffg (CircuitShell) a partir das três fontes:
 *   - `ffgres` (portal FFG Resultats): entrada LAZY a partir do índice; o
 *     detalhe (séries com resultados) carrega ao seleccionar
 *   - `gg` (GolfGenius, sem gémeo no portal): leaderboard + match play + draws;
 *     os escalões do MESMO campeonato juntam-se numa entrada `gg:evt:…`
 *   - `lgpidf` (PDFs Paris-Île-de-France): inscritos, horários, totais e mapa
 *
 * O que se desenha (DrawTab, totais LGPIDF, mapa do campo) entra pelos
 * `FfgRenderers` que a página passa; o resto é dados.
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import type { ReactNode } from "react";
import { cachedFetchJson, invalidateCache } from "../fetchCache";
import { isManuelByName as isM } from "../../constants/manuel";
import type { CircuitEntry, CircuitDivision, CircuitLink } from "../../ui/circuit/types";
import type { FpgDraw } from "../nacional2026Loader";
import type {
  FFGTournament, FFGDrawRound, Catalog, CatalogEntry, LGPIDFTournament, LGPIDFIndex, LGPIDFIndexEntry,
  FFGResTournament, FFGResIndex, FFGResIndexEntry, FFGSerieCourse, FFGCategoriesData,
} from "./types";
import { divisionLabel, ffgEscaloesOfTournament } from "./names";
import { ffgResToFPGTournament, toFPGTournament, ffgScorecardOptions } from "./toTournament";
import { lgpidfAdmissions, lgpidfDraws, lgpidfTotais } from "./lgpidf";
import {
  ggDrawToFpgDraw, buildFfgMatchplay, GG_NON_FR_SLUGS, ggSexFromName, ggInferDates,
  ffgGgEscalaoLabel, ffgEventFamilyKey, ffgPrettyTitle,
} from "./golfgenius";

/** O que a página desenha dentro das divisões. */
export interface FfgRenderers {
  /** Draw de uma volta (DrawTab partilhado). */
  draw: (draw: FpgDraw, round: number, date: string | null | undefined, hideCols?: { fed?: boolean; nasc?: boolean; esc?: boolean }) => ReactNode;
  /** Leaderboard só de totais (LGPIDF). */
  lgpidfTotals: (data: LGPIDFTournament) => ReactNode;
  /** Aba «Mapa do campo» (LGPIDF). */
  lgpidfCourseMap: (data: LGPIDFTournament) => ReactNode;
}

const isIntlName = (name?: string | null) => /\binternationa(l|ux?)\b/i.test(name || "");

/* ── FFG Resultats (portal) ── */

/** Distâncias por série de um torneio do portal FFG, se publicadas (null = não há). */
async function loadFfgSerieCourses(trnId: string): Promise<Record<string, FFGSerieCourse> | null> {
  try {
    const o = await cachedFetchJson<{ resultats?: Record<string, { series?: Record<string, FFGSerieCourse> }> }>("/data/ffgolf-course-overrides.json");
    return o?.resultats?.[trnId]?.series ?? null;
  } catch {
    return null;
  }
}

/** Carrega o detalhe de UM torneio FFG-Resultats (lazy) + enriquecimento GG. */
export async function ffgResLoadDivisions(meta: FFGResIndexEntry): Promise<CircuitDivision[]> {
  const td = await cachedFetchJson<FFGResTournament>(`/data/ffgolf-resultats/${meta.file}`);
  if (!td) return [];
  const serieCourses = await loadFfgSerieCourses(td.trnId);
  if (serieCourses) td._serieCourses = serieCourses;
  if (meta.ffgolfSlug && meta.year) {
    try {
      const ggData = await cachedFetchJson<{ course?: { par?: number[]; meters?: number[]; si?: number[]; parTotal?: number; metersTotal?: number; name?: string }; courses?: Array<{ teeName?: string; par?: number[]; meters?: number[]; si?: number[]; parTotal?: number; metersTotal?: number }> }>(`/data/ffgolf/${meta.year}_${meta.ffgolfSlug}.json`);
      if (ggData && ggData.course && Array.isArray(ggData.course.meters) && ggData.course.meters.length === 18) {
        const allCourses = Array.isArray(ggData.courses) ? ggData.courses
          .filter((c) => Array.isArray(c?.meters) && c.meters!.length === 18)
          .map((c) => ({ teeName: c.teeName, par: c.par || [], meters: c.meters!, si: c.si || [], parTotal: c.parTotal, metersTotal: c.metersTotal })) : [];
        td._ggCourse = { par: ggData.course.par || [], meters: ggData.course.meters, si: ggData.course.si || [], parTotal: ggData.course.parTotal, metersTotal: ggData.course.metersTotal, name: ggData.course.name, courses: allCourses.length > 0 ? allCourses : undefined };
      }
    } catch { /* GG opcional */ }
  }
  return td.details.series.map((s): CircuitDivision => ({
    key: s.serieId,
    escalao: divisionLabel(s.label || s.serieId),
    tabLabel: divisionLabel(s.label || s.serieId),
    hasManuel: s.players.some((p) => isM(p.name)),
    results: ffgResToFPGTournament(td, s.serieId),
    scOptions: ffgScorecardOptions(),
  }));
}

/** FFG-Resultats: entry LAZY a partir do índice (~1600 torneios — detalhe só
 *  carrega ao seleccionar). hasManuel/hasPt vêm de um índice enriquecido opcional. */
export function ffgResEntry(meta: FFGResIndexEntry, hasManuel?: boolean, hasPt?: boolean): CircuitEntry {
  const links: CircuitLink[] = [];
  if (meta.ggPage) links.push({ label: "GolfGenius", url: `https://www.golfgenius.com/pages/${meta.ggPage}`, icon: "🏌️", title: "Scorecards hole-by-hole no GolfGenius" });
  // Deep-link directo aos resultados deste torneio no portal FFG (rota GET
  // com partKey — a mesma que o kids2 usa via agregador).
  if (meta.partKey) links.push({ label: "Resultados FFG", url: `https://pages.ffgolf.org/resultats/resultats-details/${meta.partKey}/${meta.trnId}`, icon: "🏁", title: "Resultados oficiais deste torneio no portal FFG" });
  if (meta.ffgolfOfficialUrl) links.push({ label: "Página FFG", url: meta.ffgolfOfficialUrl, icon: "🔗" });
  if (!meta.partKey && !meta.ffgolfOfficialUrl) links.push({ label: "Portal FFG", url: meta.pagesFfgolfUrl || "https://pages.ffgolf.org/resultats/", icon: "🔗" });
  return {
    id: `ffgres:${meta.trnId}`,
    year: meta.year,
    name: meta.name,
    series: "FFG Officiel",
    source: "ffgres",
    dateStart: meta.dateIso ?? undefined,
    federation: "FFG",
    liga: meta.ligue,
    ligas: meta.ligues?.length ? meta.ligues : undefined,
    intl: isIntlName(meta.name),
    escaloes: ffgEscaloesOfTournament(meta.name, (meta.divisions ?? []).map((d) => d.label || d.serieId)),
    // Campos ricos da sidebar (existem no índice; antes não eram expostos).
    course: Array.isArray(meta.course) ? meta.course.join(" · ") : (meta.course ?? undefined),
    sex: meta.sex === "MF" ? "Mixed" : (meta.sex ?? undefined),
    roundsCount: meta.roundsPlayed ?? undefined,
    hasResults: meta.totalPlayers > 0,
    links,
    playerCount: meta.totalPlayers,
    divisionCount: meta.seriesCount,
    hasManuel,
    hasPt,
    loadDivisions: () => ffgResLoadDivisions(meta),
  };
}

/* ── GolfGenius ── */

/** Uma divisão (escalão) de um torneio GG FFG — leaderboard + match play + draws. */
export function ffgGgDivision(meta: CatalogEntry, data: FFGTournament, R: FfgRenderers): CircuitDivision {
  const hasManuel = data.players.some((p) => isM(p.name));
  const label = ffgGgEscalaoLabel(meta, data);
  const withDraw = (data.draws ?? []).filter((r: FFGDrawRound) => r.groups.length);
  return {
    key: `${meta.year}_${meta.slug}`,
    escalao: label,
    tabLabel: label,
    sex: ggSexFromName(data.tournament || meta.title || ""),
    hasManuel,
    // `results` (não `customResults`): só assim a shell renderiza o IntlTournView
    // e intercala as abas "Draw R{n}" antes de cada ronda.
    results: toFPGTournament(data),
    scOptions: ffgScorecardOptions(),
    siLabel: "m",
    // Bracket knockout (CFJ etc.) — aba "Match Play" no fim da barra.
    matchplay: buildFfgMatchplay(data),
    // Draw por ronda intercalado com os resultados (mesmo padrão da /rfeg). Inclui
    // rondas por jogar — no match play saber COM QUEM se joga a seguinte é metade
    // da informação.
    roundDraws: withDraw.length
      ? withDraw.map((r) => ({
          round: r.round,
          render: () => R.draw(ggDrawToFpgDraw(r), r.round, r.dateIso, { fed: true, nasc: true, esc: true }),
        }))
      : undefined,
  };
}

function ggLinks(meta: CatalogEntry, data: FFGTournament): CircuitLink[] {
  const links: CircuitLink[] = [
    { label: "GolfGenius", url: data.source || `https://www.golfgenius.com/pages/${meta.gg_page}`, icon: "🏌️", title: "Leaderboard e scorecards no GolfGenius" },
  ];
  if (meta.ffgolf_scores_url) links.push({ label: "Resultados FFG", url: meta.ffgolf_scores_url, icon: "🏁" });
  if (meta.ffgolf_url) links.push({ label: "Página FFG", url: meta.ffgolf_url, icon: "🔗" });
  return links;
}

/** Torneio GG de escalão único. */
export function ggEntry(meta: CatalogEntry, data: FFGTournament, R: FfgRenderers): CircuitEntry {
  const div = ffgGgDivision(meta, data, R);
  const { start, end } = ggInferDates(data);
  return {
    id: `gg:${meta.year}_${meta.slug}`,
    year: meta.year,
    name: data.tournament || meta.title || meta.slug,
    series: "GolfGenius",
    source: "gg",
    course: data.course?.name ?? undefined,
    dateStart: start ?? undefined,
    dateEnd: end ?? undefined,
    federation: "FFG",
    intl: isIntlName(data.tournament || meta.title || ""),
    escaloes: ffgEscaloesOfTournament(data.tournament || meta.title, data.divisions ?? []),
    sex: ggSexFromName(data.tournament || meta.title || ""),
    roundsCount: data.rounds || undefined,
    hasResults: data.players.length > 0,
    links: ggLinks(meta, data),
    playerCount: data.players.length,
    divisionCount: (data.divisions ?? []).length || 1,
    hasManuel: div.hasManuel,
    divisions: [div],
  };
}

/** Vários escalões do MESMO campeonato GG (mesmo ano+campo) fundidos numa entrada
 *  com abas de escalão — ex: CFJ 2026 (U12 Garçons/Filles + Benjamins/Benjamines):
 *  4 leagues GolfGenius distintas mas 1 só evento (mesmos dias, mesmo campo). */
export function ggMergedEntry(members: { meta: CatalogEntry; data: FFGTournament }[], R: FfgRenderers): CircuitEntry {
  const escRank = (d: CircuitDivision): number => {
    const s = d.escalao.toLowerCase();
    const age = /u10/.test(s) ? 10 : /u12/.test(s) ? 12 : /benjamin/.test(s) ? 13
      : /u14/.test(s) ? 14 : /minime/.test(s) ? 15 : /u16/.test(s) ? 16 : /u18/.test(s) ? 18 : 99;
    return age * 10 + (d.sex === "F" ? 1 : 0);   // Garçons antes de Filles
  };
  const divisions = members.map((m) => ffgGgDivision(m.meta, m.data, R)).sort((a, b) => escRank(a) - escRank(b));
  const y = members[0].meta.year;
  // Os escalões podem jogar percursos diferentes do mesmo clube — no cabeçalho
  // da entrada fundida mostra-se o CLUBE (cada aba de escalão traz o seu percurso).
  const rawCourse = members.map((m) => m.data.course?.name).find(Boolean);
  const course = rawCourse ? rawCourse.replace(/\s*\(.*$/, "").trim() : undefined;
  const starts = members.map((m) => ggInferDates(m.data).start).filter((d): d is string => !!d).sort();
  const ends = members.map((m) => ggInferDates(m.data).end).filter((d): d is string => !!d).sort();
  const fam = ffgPrettyTitle(ffgEventFamilyKey(members[0].meta));
  return {
    id: `gg:evt:${ffgEventFamilyKey(members[0].meta)}_${y}`,
    year: y,
    name: `${fam} ${y}`,
    series: "GolfGenius",
    source: "gg",
    course,
    dateStart: starts[0],
    dateEnd: ends[ends.length - 1],
    federation: "FFG",
    intl: isIntlName(fam),
    escaloes: divisions.map((d) => d.escalao),
    sex: "Mixed",
    roundsCount: Math.max(0, ...members.map((m) => m.data.rounds || 0)) || undefined,
    hasResults: members.some((m) => m.data.players.length > 0),
    links: members.map((m) => ({
      label: `GG · ${ffgGgEscalaoLabel(m.meta, m.data)}`,
      url: m.data.source || `https://www.golfgenius.com/pages/${m.meta.gg_page}`,
      icon: "🏌️",
    })),
    playerCount: members.reduce((s, m) => s + m.data.players.length, 0),
    divisionCount: divisions.length,
    hasManuel: divisions.some((d) => d.hasManuel),
    divisions,
  };
}

/* ── LGPIDF ── */

/** LGPIDF: 1 entry, uma divisão com inscritos, horários, totais e mapa do campo. */
export function lgpidfEntry(meta: LGPIDFIndexEntry, data: LGPIDFTournament, R: FfgRenderers): CircuitEntry {
  const inscritos = data.inscritosPdfs.reduce((s, pf) => s + pf.players.length, 0);
  const hasManuel = data.players.some((p) => isM(p.name)) || data.inscritosPdfs.some((pf) => pf.players.some((pl) => isM(pl.name)));
  return {
    id: `lgpidf:${meta.year}_${meta.slug}`,
    year: meta.year,
    name: meta.tournament,
    series: "LGPIDF",
    source: "lgpidf",
    course: data.course?.name ?? undefined,
    dateStart: data.dateStart ?? undefined,
    dateEnd: data.dateEnd ?? undefined,
    federation: "LGPIDF",
    playerCount: data.players.length || inscritos,
    divisionCount: 1,
    escaloes: ffgEscaloesOfTournament(data.tournament || meta.tournament, meta.divisions ?? []),
    hasManuel,
    divisions: [{
      key: "main",
      escalao: meta.divisions?.length ? meta.divisions.join("/") : "—",
      hasManuel,
      customResults: data.players.length ? R.lgpidfTotals(data) : undefined,
      totals: data.players.length ? { players: lgpidfTotais(data), parPerRound: 72 } : undefined,
      admissions: lgpidfAdmissions(data),
      roundDraws: lgpidfDraws(data).map((draw, i) => ({
        round: i + 1,
        render: () => R.draw(draw, i + 1, data.dateStart ?? null),
      })),
      extraSections: data.courseMapPdfs.length
        ? [{ key: "course-map", label: "📐 Mapa do campo", content: R.lgpidfCourseMap(data) }]
        : undefined,
      links: (data.allPdfs ?? []).map((p) => ({ label: `${p.kind}${p.category ? ` · ${p.category}` : ""}`, url: p.url, icon: "📄", title: p.filename })),
    }],
  };
}

/* ── Fontes + lista completa ── */

/** Tudo o que a lista da /ffg precisa (os ficheiros pequenos carregam já; o
 *  detalhe do portal é lazy). */
export interface FfgSources {
  ffgResIndex: FFGResIndex | null;
  lgpidfIndex: LGPIDFIndex | null;
  lgpidfData: Map<string, LGPIDFTournament>;
  /** Índice opcional Manuel/PT por trnId (scripts/build-ffgolf-manuel-index.js)
   *  — permite o filtro Manuel/PT na LISTA sem carregar os ~1600 ficheiros. */
  manuelIdx: Record<string, { m?: boolean; pt?: boolean }>;
  ggCatalog: Catalog | null;
  ggData: Map<string, FFGTournament>;
  ggTwins: Set<string>;
  categories: FFGCategoriesData | null;
}

export const EMPTY_FFG_SOURCES: FfgSources = {
  ffgResIndex: null, lgpidfIndex: null, lgpidfData: new Map(), manuelIdx: {},
  ggCatalog: null, ggData: new Map(), ggTwins: new Set(), categories: null,
};

/** Lê as fontes (cada uma opcional, menos o índice do portal). */
export async function loadFfgSources(): Promise<FfgSources> {
  const out: FfgSources = { ...EMPTY_FFG_SOURCES, lgpidfData: new Map(), ggData: new Map(), ggTwins: new Set() };
  invalidateCache("/data/ffgolf-resultats-index.json");
  // FFG-Resultats: só o ÍNDICE (lazy — o detalhe carrega ao seleccionar).
  out.ffgResIndex = await cachedFetchJson<FFGResIndex>("/data/ffgolf-resultats-index.json");

  // LGPIDF (PDFs Paris-Île-de-France) — eager (pequeno; permite dedup + Manuel).
  try {
    const lgIdx = await cachedFetchJson<LGPIDFIndex>("/data/ffgolf-lgpidf-index.json");
    if (lgIdx) {
      out.lgpidfIndex = lgIdx;
      await Promise.all(lgIdx.tournaments.map(async (t) => {
        try { const td = await cachedFetchJson<LGPIDFTournament>(`/data/ffgolf/${t.file}`); if (td) out.lgpidfData.set(`${t.year}_${t.slug}`, td); } catch { /* skip */ }
      }));
    }
  } catch { /* lgpidf opcional */ }

  // Índice Manuel/PT (opcional) — alimenta o filtro da lista em modo lazy.
  try {
    const mi = await cachedFetchJson<{ tournaments: Record<string, { m?: boolean; pt?: boolean }> }>("/data/ffgolf-manuel-index.json");
    if (mi?.tournaments) out.manuelIdx = mi.tournaments;
  } catch { /* opcional */ }

  // Catálogo GolfGenius — torneios FFG hospedados no GG. A maioria é gémea
  // de um evento do portal (entra por ffgres); os que NÃO têm gémeo só
  // existem aqui e, sem este bloco, não apareciam em lado nenhum.
  try {
    const cat = await cachedFetchJson<Catalog>("/data/ffgolf-catalog.json");
    if (cat) {
      out.ggCatalog = cat;
      await Promise.all(
        cat.tournaments.filter((t) => t.gg_page).map(async (t) => {
          try {
            const td = await cachedFetchJson<FFGTournament>(`/data/ffgolf/${t.year}_${t.slug}.json`);
            if (td) out.ggData.set(`${t.year}_${t.slug}`, td);
          } catch { /* ficheiro em falta é normal */ }
        }),
      );
    }
  } catch { /* catálogo opcional */ }

  // Gémeos GG ↔ portal: quando o mesmo evento existe nos dois sítios, o
  // portal ganha (tem licenças) e a versão GG é escondida.
  try {
    const tw = await cachedFetchJson<{ twins: Record<string, unknown> }>("/data/ffgolf-gg-twins.json");
    if (tw?.twins) out.ggTwins = new Set(Object.keys(tw.twins));
  } catch { /* opcional */ }

  // Catégories d'âge (Vademecum).
  try { out.categories = await cachedFetchJson<FFGCategoriesData>("/data/ffg-categories-age.json"); } catch { /* opcional */ }
  return out;
}

/** LGPIDF que duplicam um FFG Officiel (mesma data + ≥2 palavras do nome) —
 *  escondidos da lista. */
export function matchedLgpidfKeys(src: FfgSources): Set<string> {
  const set = new Set<string>();
  const { ffgResIndex, lgpidfIndex, lgpidfData } = src;
  if (!ffgResIndex || !lgpidfIndex) return set;
  for (const fe of ffgResIndex.tournaments) {
    if (!fe.dateIso) continue;
    for (const le of lgpidfIndex.tournaments) {
      const lg = lgpidfData.get(`${le.year}_${le.slug}`);
      if (!lg || lg.dateStart !== fe.dateIso) continue;
      const fw = fe.name.toLowerCase().split(/[\s-]+/);
      const lw = lg.tournament.toLowerCase().split(/[\s-]+/);
      if (fw.filter((w) => w.length > 3 && lw.includes(w)).length >= 2) set.add(`${le.year}_${le.slug}`);
    }
  }
  return set;
}

/** A lista completa da /ffg. */
export function buildFfgEntries(src: FfgSources, matchedLgKeys: Set<string>, R: FfgRenderers): CircuitEntry[] {
  const { ffgResIndex, lgpidfIndex, lgpidfData, manuelIdx, ggCatalog, ggData, ggTwins } = src;
  const out: CircuitEntry[] = [];
  if (ffgResIndex) {
    const seen = new Set<string>();
    for (const meta of ffgResIndex.tournaments) {
      if (seen.has(meta.trnId)) continue;
      seen.add(meta.trnId);
      const mi = manuelIdx[meta.trnId];
      out.push(ffgResEntry(meta, mi?.m, mi?.pt));
    }
  }
  if (lgpidfIndex) {
    for (const meta of lgpidfIndex.tournaments) {
      const key = `${meta.year}_${meta.slug}`;
      if (matchedLgKeys.has(key)) continue;
      const data = lgpidfData.get(key);
      if (!data) continue;
      out.push(lgpidfEntry(meta, data, R));
    }
  }
  if (ggCatalog) {
    // Rede de segurança: uma página GolfGenius que aloja as duas divisões
    // (Filles + Garçons) tem slugs distintos a apontar ao MESMO gg_page e o
    // seu leaderboard é combinado — os dois ficheiros ficam idênticos. Dedup
    // por gg_page para não mostrar o mesmo evento duas vezes (o nome exibido
    // vem do próprio GG, que é o título combinado real, não do slug).
    const seenGgPage = new Set<string>();
    const ggPairs: { meta: CatalogEntry; data: FFGTournament }[] = [];
    for (const meta of ggCatalog.tournaments) {
      if (!meta.gg_page) continue;
      // Eventos não-franceses que o catálogo GG arrastou (Sage Valley/EUA,
      // World Junior Girls/Canadá) — mesma lista do EXCLUDE_SLUGS do roster.
      // Não pertencem à página 🇫🇷 France.
      if (GG_NON_FR_SLUGS.has(meta.slug)) continue;
      const key = `${meta.year}_${meta.slug}`;
      if (seenGgPage.has(meta.gg_page)) continue;
      const data = ggData.get(key);
      if (!data || !data.players?.length) continue;
      // Gémeo do portal: por regra escondemos a versão GG (o portal traz
      // licenças + leaderboard mais rico). EXCEPÇÃO: quando a versão GG tem
      // match play (bracket knockout) mantemo-la SEMPRE — o portal só publica
      // o stroke play da qualificação e não representa os confrontos, logo a
      // GG é a única fonte do match play (caso CFJ U12 Garçons 2026, que o
      // build-france-players marcou como gémeo e desaparecia da lista).
      const hasMatchplay = !!data.matchplay?.flights?.length;
      if (ggTwins.has(key) && !hasMatchplay) continue; // o portal já mostra este evento
      seenGgPage.add(meta.gg_page);
      ggPairs.push({ meta, data });
    }
    // Fundir escalões do MESMO campeonato numa entrada com abas de escalão
    // (CFJ 2026 = U12 Garçons/Filles + Benjamins/Benjamines, 4 leagues GG mas 1
    // evento). Chave: família do nome + ano + CLUBE. Usa-se o clube (nome antes
    // do parêntesis) e não o percurso exato — o mesmo evento joga percursos
    // diferentes por escalão E o GG nomeia-os de forma inconsistente ("Golf du
    // Gouverneur (Montaplan)" vs "(Montaplan CFJ 2026)" vs "(Le Breuil …)").
    // Só funde quando há campo (para nunca fundir por engano); sem campo, solo.
    const clubKey = (c: string) => c.toLowerCase().replace(/\s*\(.*$/, "").replace(/\s+/g, " ").trim();
    const byEvent = new Map<string, { meta: CatalogEntry; data: FFGTournament }[]>();
    for (const pr of ggPairs) {
      const course = pr.data.course?.name || "";
      const gkey = course
        ? `${ffgEventFamilyKey(pr.meta)}|${pr.meta.year}|${clubKey(course)}`
        : `__solo__|${pr.meta.year}_${pr.meta.slug}`;
      if (!byEvent.has(gkey)) byEvent.set(gkey, []);
      byEvent.get(gkey)!.push(pr);
    }
    for (const members of byEvent.values()) {
      out.push(members.length > 1 ? ggMergedEntry(members, R) : ggEntry(members[0].meta, members[0].data, R));
    }
  }
  return out;
}
