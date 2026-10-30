/**
 * src/data/courses.ts — campos (FPG + away + melhorias + manuais), carregados
 * SÓ nas páginas que os usam (21/10/2026).
 *
 * Antes o App esperava por master-courses + away-courses + course-players
 * (~13 MB) e fazia esta fusão antes de mostrar QUALQUER página. Agora:
 *   - `loadCourses()` → master-courses + away-courses (+ melhorias), para o
 *     Simulador, a ficha do jogador e as abas Campo/Previsão do Kids 2;
 *   - `loadCourses({ withPlayers: true })` → também o course-players.json
 *     (~10 MB: «quem jogou» nos campos PT), só para a /campos (e a vista Comparar).
 * Cada variante é calculada uma vez por sessão (Promise em cache). As páginas
 * usam o `CoursesGate` / `useCourses()` (src/context/CoursesContext.tsx).
 */
import type { Course, CoursePlayerRound } from "./types";
import { loadMasterData, loadAwayCourses, loadMelhorias } from "./loader";
import { extractAwayCourses } from "./melhoriasLoader";
import { getExtraCourses } from "./extraCourses";
import { cachedFetchJson } from "./fetchCache";
import { initCourseColorCache, teeGroupHex } from "../utils/teeColors";
import { norm } from "../utils/format";
import { canonicalCourseName } from "../utils/courseAliases";
import { isTournamentCourse } from "../constants/tournamentCourses";

/** course-players.json — _players dos campos PT do master (quem jogou + scores). */
export type CoursePlayersMap = Record<string, Record<string, CoursePlayerRound[]>>;

export interface CoursesData {
  /** Campos reais: FPG + away + extra (com dedup por courseKey), SEM torneios.
      Esta é a lista usada em todo o lado (Simulador, Comparar, Jogadores). */
  simCourses: Course[];
  /** Entradas que são nomes de torneio/organização (não campos). Usadas só na
      CamposPage sob o separador de origem "Torneios". */
  tournamentCourses: Course[];
}

export interface CoursesInput {
  fpg: Course[];
  pipelineAway: Course[];
  melhoriasAway: Course[];
  extra: Course[];
  coursePlayers?: CoursePlayersMap;
}

/** Fusão dos campos — FPG + Away (pipeline + melhorias + manuais). */
export function buildAllCourses(input: CoursesInput): Course[] {
  const { fpg, pipelineAway, melhoriasAway, extra } = input;

  // ── helpers ──────────────────────────────────────────────────────────

  /** Chave de deduplicação de tee: nome + sexo + DISTÂNCIA.
   *  Colapsa as variantes de CR/Slope do MESMO tee físico (o pipeline cria um
   *  tee por cada rating histórico de scorecard, o que inflacionava campos
   *  muito jogados — Aroeira, Ribagolfe… — para dezenas de tees iguais). */
  function teeKey(t: Course["master"]["tees"][0]): string {
    const sex = t.sex ?? "";
    const dist = t.distances?.total ?? "";
    return `${t.teeName.trim().toLowerCase()}|${sex}|${dist}`;
  }

  /** Qualidade de um tee: mais buracos e distância; em empate, preferir o que
   *  TEM rating (CR), para o tee colapsado manter o rating oficial. */
  function teeScore(t: Course["master"]["tees"][0]): number {
    const holes = t.distances?.holesCount ?? 0;
    const total = t.distances?.total ?? 0;
    const hasCR = t.ratings?.holes18?.courseRating != null ? 1 : 0;
    return holes * 100000 + total * 10 + hasCR;
  }

  /** Remove tees duplicados e em branco de uma lista */
  function dedupTees(tees: Course["master"]["tees"]): Course["master"]["tees"] {
    const seen = new Map<string, Course["master"]["tees"][0]>();
    for (const t of tees) {
      const k = teeKey(t);
      const prev = seen.get(k);
      // Guardar o tee com mais dados; rejeitar tees completamente vazios.
      // Empate (mesmo tee com ratings de anos diferentes): fica o rating da
      // volta mais recente (lastPlayed, dos campos away) — 30/10/2026.
      const better = !prev
        || teeScore(t) > teeScore(prev)
        || (teeScore(t) === teeScore(prev) && (t.lastPlayed ?? "") > (prev.lastPlayed ?? ""));
      if (better) seen.set(k, t);
    }
    // Filtragem de tees:
    //  1) fora os completamente vazios (sem buracos, sem distância, sem CR);
    //  2) fora os que NÃO têm geometria (metros) MAS apenas duplicam uma marca
    //     (cor) que JÁ está representada no campo por um tee COM metros.
    //     É o caso do Glen: a FPG registou a ronda do Manuel pela cor
    //     "Vermelhas" (só CR/Slope, sem metros), mas essas marcas já existem
    //     como "Red" com distâncias — logo o "Vermelhas" é ruído redundante.
    //  Tees sem metros que são o ÚNICO registo da sua marca mantêm-se sempre
    //  (campos away em que o clube não preencheu os metros não perdem nada).
    const vals = [...seen.values()];
    const hasGeom = (t: Course["master"]["tees"][number]) =>
      (t.distances?.total ?? 0) > 0 || (t.holes ?? []).some((h) => (h.distance ?? 0) > 0);
    const grp = (t: Course["master"]["tees"][number]) =>
      teeGroupHex(t.teeName, t.scorecardMeta?.teeColor);
    const geomGroups = new Set(vals.filter(hasGeom).map(grp));
    // Mesma marca com metros e do MESMO sexo → o tee sem metros é ruído.
    // Do OUTRO sexo → é o rating do outro sexo no mesmo tee físico: fica, e
    // herda os metros desse tee (um tee é cor + distância; M/F são só ratings).
    const geomBySexGroup = new Map<string, Course["master"]["tees"][number]>();
    for (const t of vals.filter(hasGeom)) {
      const k = `${grp(t)}|${t.sex}`;
      const prev = geomBySexGroup.get(k);
      if (!prev || (t.lastPlayed ?? "") > (prev.lastPlayed ?? "")) geomBySexGroup.set(k, t);
    }
    const geomOfGroup = (g: string) => [...geomBySexGroup.entries()].find(([k]) => k.startsWith(`${g}|`))?.[1];
    return vals.flatMap((t) => {
      const empty =
        (t.distances?.holesCount ?? 0) === 0 &&
        (t.distances?.total ?? 0) === 0 &&
        (t.ratings?.holes18?.courseRating ?? 0) === 0;
      if (empty) return [];
      if (!hasGeom(t) && geomGroups.has(grp(t))) {
        if (t.sex === "U" || geomBySexGroup.has(`${grp(t)}|${t.sex}`)) return [];
        const src = geomOfGroup(grp(t));
        if (!src || (src.holes?.length ?? 0) !== (t.holes?.length ?? 0)) return [];
        return [{
          ...t,
          holes: (t.holes ?? []).map((h, i) => ({ ...h, distance: src.holes![i]?.distance ?? h.distance })),
          distances: { ...src.distances },
        }];
      }
      return [t];
    });
  }

  /** Merge de dois campos: mantém o melhor de cada um.
   *  Se o base é um campo FPG (master-courses, key não começa por "away-"),
   *  os tees FPG são autoritativos — não fundir tees de scorecards (away).
   *  Só se fundem os tees quando ambos têm a mesma origem. */
  function mergeCourses(base: Course, other: Course): Course {
    const isBaseFPG  = !base.courseKey.startsWith("away-");
    const isOtherFPG = !other.courseKey.startsWith("away-");

    // Campo FPG + fonte away → manter só tees FPG (dados oficiais)
    // Campo away + away, ou FPG + FPG → fundir normalmente
    const combinedTees = (isBaseFPG && !isOtherFPG)
      ? base.master.tees
      : [...base.master.tees, ...other.master.tees];

    const mergedTees = dedupTees(combinedTees);
    const players = { ...(other.master._players ?? {}), ...(base.master._players ?? {}) };
    return {
      ...base,
      master: {
        ...base.master,
        tees: mergedTees.length > 0 ? mergedTees : base.master.tees,
        country: base.master.country || other.master.country,
        _players: Object.keys(players).length > 0 ? players : undefined,
      },
    };
  }

  // ── build map por courseKey ───────────────────────────────────────────
  const map = new Map<string, Course>();
  for (const c of fpg) map.set(c.courseKey, c);

  // Guardar _players do pipeline antes de possível sobrescrita por extra
  const pipelinePlayers = new Map<string, Record<string, any>>();
  for (const c of pipelineAway) {
    if (c.master._players) pipelinePlayers.set(c.courseKey, c.master._players);
    if (!map.has(c.courseKey)) map.set(c.courseKey, c);
  }
  for (const c of melhoriasAway) if (!map.has(c.courseKey)) map.set(c.courseKey, c);

  // Extra (manual) tem precedência de tees sobre pipeline
  for (const c of extra) map.set(c.courseKey, c);

  // Reaplicar _players do pipeline nas entradas extra/melhorias que não os têm
  for (const [key, players] of pipelinePlayers) {
    const existing = map.get(key);
    if (existing && !existing.master._players) {
      map.set(key, { ...existing, master: { ...existing.master, _players: players } });
    }
  }

  // ── _players dos campos PT (course-players.json) ──────────────────────
  // O pipeline só constrói _players para campos away; os campos PT do master
  // ficam sem "quem jogou". Aqui anexamos o course-players.json (gerado por
  // scripts/build-course-players.js) por courseKey. Feito ANTES do merge para
  // que se combine com o que já exista.
  const coursePlayers = input.coursePlayers ?? {};
  for (const [key, c] of map) {
    const pp = coursePlayers[key];
    if (pp && Object.keys(pp).length > 0) {
      const merged = { ...(c.master._players ?? {}), ...pp };
      map.set(key, { ...c, master: { ...c.master, _players: merged } });
    }
  }

  // ── dedup tees por campo ──────────────────────────────────────────────
  for (const [key, c] of map) {
    const clean = dedupTees(c.master.tees);
    if (clean.length !== c.master.tees.length) {
      map.set(key, { ...c, master: { ...c.master, tees: clean } });
    }
  }

  // ── dedup campos por nome display (mesmo nome = merge) ────────────────
  const byName = new Map<string, string>(); // norm → courseKey canónico
  const finalMap = new Map<string, Course>();

  // Ordenar para escolher o campo CANÓNICO de cada nome:
  //  1) Campos FPG (master, courseKey sem "away-") primeiro — assim os seus
  //     tees OFICIAIS prevalecem sobre os tees-ruído das entradas away (o
  //     pipeline cria um tee por cada CR/Slope histórico de scorecard, o que
  //     inflacionava campos registados como o Aroeira para dezenas de tees).
  //     O mergeCourses já descarta os tees away quando a base é FPG.
  //  2) Entre campos da mesma origem, o que tiver mais tees ganha.
  //  3) Um nome que é ALIAS (gralha, nome do torneio no lugar do campo…) nunca
  //     é o canónico: o campo fica com o nome certo e o seu URL (30/10/2026).
  const isAliasName = (c: Course) => canonicalCourseName(c.master.name) !== c.master.name;
  const ordered = [...map.values()].sort((a, b) => {
    const aAway = a.courseKey.startsWith("away-") ? 1 : 0;
    const bAway = b.courseKey.startsWith("away-") ? 1 : 0;
    if (aAway !== bAway) return aAway - bAway;
    const aAlias = isAliasName(a) ? 1 : 0;
    const bAlias = isAliasName(b) ? 1 : 0;
    if (aAlias !== bAlias) return aAlias - bAlias;
    return b.master.tees.length - a.master.tees.length;
  });

  for (const c of ordered) {
    // Comparar pelo nome CANÓNICO (resolve aliases tipo "Golden Palm" →
    // "Trump Doral - Golden Palm"), para fundir entradas do mesmo campo
    // físico que vêm com nomes diferentes (pipeline vs extraCourses).
    const nn = norm(canonicalCourseName(c.master.name) || c.master.name);
    const canonical = byName.get(nn);
    if (canonical) {
      // Já existe um campo com este nome — fazer merge
      const existing = finalMap.get(canonical)!;
      finalMap.set(canonical, mergeCourses(existing, c));
    } else {
      byName.set(nn, c.courseKey);
      finalMap.set(c.courseKey, c);
    }
  }

  // ── Enriquecimento de SI (stroke index) ───────────────────────────────
  // O SI é uma propriedade do LAYOUT do campo — igual em todos os tees do
  // mesmo combo. Alguns tees (curados de PDFs USKids) vêm sem SI mas outros
  // do mesmo campo têm-no (via scorecards FPG). Copiar o SI dos que têm para
  // os que não têm (casando por nº de buracos), para o scorecard do campo
  // ficar tão rico como o do jogador.
  //
  // Antes disso, nos campos away (cartões dos clubes, não oficiais), o que é
  // claramente INVENTADO passa a «sem dado» (30/10/2026, revisão dos campos):
  // SI 1..n seguido e par 4 em todos os buracos. O par vem depois de outro tee
  // do mesmo campo com par verdadeiro; se não houver, fica sem par.
  for (const [key, c] of finalMap) {
    if (!key.startsWith("away-")) continue;
    let changed = false;
    const tees = c.master.tees.map((t) => {
      const h = t.holes ?? [];
      if (h.length < 9) return t;
      const fakeSI = h.every((x, i) => x.si === i + 1);
      const fakePar = h.every((x) => x.par === 4);
      if (!fakeSI && !fakePar) return t;
      changed = true;
      return { ...t, holes: h.map((x) => ({ ...x, si: fakeSI ? null : x.si, par: fakePar ? null : x.par })) };
    });
    if (changed) finalMap.set(key, { ...c, master: { ...c.master, tees } });
  }

  for (const [key, c] of finalMap) {
    const tees = c.master.tees;
    if (tees.length < 2) continue;
    // SI de referência por nº de buracos: o que mais tees repetem (consenso
    // entre cartões), não o primeiro que aparece.
    const refByN = new Map<number, (number | null)[]>();
    const votes = new Map<number, Map<string, number>>();
    for (const t of tees) {
      const n = t.holes?.length ?? 0;
      if (!n || !t.holes!.every(h => h.si != null && h.si > 0)) continue;
      const sig = JSON.stringify(t.holes!.map(h => h.si));
      const m = votes.get(n) ?? new Map<string, number>();
      m.set(sig, (m.get(sig) ?? 0) + 1);
      votes.set(n, m);
    }
    for (const [n, m] of votes) {
      const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      refByN.set(n, JSON.parse(best));
    }
    // Par de referência (só para preencher tees sem par — nunca troca um par existente)
    const parRefByN = new Map<number, number[]>();
    for (const t of tees) {
      const n = t.holes?.length ?? 0;
      if (n && !parRefByN.has(n) && t.holes!.every(h => h.par != null && h.par > 0)) {
        parRefByN.set(n, t.holes!.map(h => h.par as number));
      }
    }
    let changed = false;
    const withPar = tees.map(t => {
      const ref = parRefByN.get(t.holes?.length ?? 0);
      if (!ref || !t.holes || !t.holes.some(h => h.par == null)) return t;
      changed = true;
      return { ...t, holes: t.holes.map((h, i) => (h.par != null ? h : { ...h, par: ref[i] })) };
    });
    if (refByN.size === 0) {
      if (changed) finalMap.set(key, { ...c, master: { ...c.master, tees: withPar } });
      continue;
    }
    const newTees = withPar.map(t => {
      const ref = refByN.get(t.holes?.length ?? 0);
      if (!ref || !t.holes) return t;
      if (t.holes.every(h => h.si != null && h.si > 0)) return t;
      changed = true;
      return { ...t, holes: t.holes.map((h, i) => (h.si != null && h.si > 0) ? h : { ...h, si: ref[i] ?? h.si }) };
    });
    if (changed) finalMap.set(key, { ...c, master: { ...c.master, tees: newTees } });
  }

  return [...finalMap.values()];
}

/** Separa os campos reais dos que são nomes de torneio/organização. */
export function splitCourses(all: Course[]): CoursesData {
  return {
    simCourses: all.filter((c) => !isTournamentCourse(c.courseKey)),
    tournamentCourses: all.filter((c) => isTournamentCourse(c.courseKey)),
  };
}

async function loadCoursePlayers(): Promise<CoursePlayersMap> {
  try {
    const j = await cachedFetchJson<{ players?: CoursePlayersMap }>("/data/course-players.json");
    return j?.players ?? {};
  } catch {
    return {};
  }
}

const _courses = new Map<boolean, Promise<CoursesData>>();

export function loadCourses(opts?: { withPlayers?: boolean }): Promise<CoursesData> {
  const withPlayers = !!opts?.withPlayers;
  let p = _courses.get(withPlayers);
  if (!p) {
    p = Promise.all([
      loadMasterData(),
      loadAwayCourses(),
      loadMelhorias(),
      withPlayers ? loadCoursePlayers() : Promise.resolve(undefined),
    ]).then(([master, away, melhorias, coursePlayers]) => {
      initCourseColorCache([...master.courses, ...away], true);
      return splitCourses(buildAllCourses({
        fpg: master.courses,
        pipelineAway: away,
        melhoriasAway: extractAwayCourses(melhorias),
        extra: getExtraCourses(),
        coursePlayers,
      }));
    });
    _courses.set(withPlayers, p);
    p.catch(() => _courses.delete(withPlayers));
  }
  return p;
}
