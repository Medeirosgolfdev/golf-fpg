/**
 * fcgAdapter.ts
 *
 * Adapter para os JSONs em public/data/fcg/{gameId}.json (output do
 * scripts/scrape-fcg.js que scrape golfdirecto.com — plataforma da Federación
 * Catalana desde 2024).
 *
 * Converte para os shapes RFEGDetail/FPGTournament esperados pela RFEGPage,
 * para que torneios catalães apareçam ao lado de NextCaddy/livegolfscoring/RFEGolf.
 *
 * Formato fcg: { gameId, fetchedAt, game: {tournament, club, course, ...},
 *                categories: [{_id, name, gender, players: [...]}, ...] }
 *
 * Cada game = 1 jornada de uma competição. Pode ter 1-6 categorias (M+F separados,
 * + escalões). Como RFEGDetail tem só 1 meta.category, juntamos players de todas
 * as categorias e usamos `__cat` para identificar (mostrado na UI).
 */
import { displayName as displayCase } from "../utils/format";

// Types redefinidos localmente (DobLookup/HcpLookup são privados ao RFEGPage.tsx).
// Compatíveis estruturalmente — TypeScript faz duck typing.
interface DobLookupEntry { name: string | null; dob: string; dobIso: string; sex: string | null; club: string | null; catEdad: string | null; licencia?: string | null }
export type DobLookup = Record<string, DobLookupEntry>;
interface HcpLookupEntry { hcp: number; source: string; tourneyId?: number; dateIso?: string | null }
export type HcpLookup = Record<string, HcpLookupEntry>;

interface FCGScorecardGameTee {
  color: string | null;
  gender: string | null;
  lap: string | null;
  rating: number | null;
  slope: number | null;
  par: number | null;
  par1_18: (number | null)[];
  hcp1_18: (number | null)[];
  meters1_18: (number | null)[];
}

interface FCGScorecard {
  gameTee: FCGScorecardGameTee | null;
  gross: (number | null)[];
}

interface FCGPlayer {
  _id: string;
  firstName: string;
  surname: string;
  gender: "M" | "F" | null;
  license: string | null;
  country: string | null;
  hcpExact: number | null;
  hcpGame: number | null;
  gameTeeColor: string | null;
  isCardFinished: boolean;
  isCardClosed: boolean;
  teeTimeHour: string | null;
  teeTime: string | null;
  teeNumber: number | null;
  view: {
    day: { rankingPosition?: number; ranking?: string; result?: number; onlyGross?: number; onlyNet?: number; strokeNumber?: number } | null;
    acc: { rankingPosition?: number; ranking?: string; result?: number; onlyGross?: number; onlyNet?: number; strokeNumber?: number } | null;
  } | null;
  previous: any[];
  scorecard: FCGScorecard | null;
}

interface FCGCategory {
  _id: string;
  name: string;
  gender: "M" | "F" | null;
  ageMin: number | null;
  ageMax: number | null;
  hcpMin: number | null;
  hcpMax: number | null;
  teeColor: string | null;
  players: FCGPlayer[];
  rankingError?: string | null;
  scorecardErrors?: { playerId: string; error: string }[];
}

interface FCGGame {
  _id: string;
  name: string;
  status: string;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  federation: string | null;
  lap: string | null;
  pointMode: string | null;
  defaultTeeColorMale: string | null;
  defaultTeeColorFemale: string | null;
  tournament: { _id: string; name: string; clientName?: string; isSingleGame?: boolean } | null;
  club: { _id: string; name: string; city?: string; state?: string; country?: string } | null;
  course: { _id: string; name: string; isShort: boolean; isPitchAndPutt: boolean } | null;
  teesMale: any[];
  teesFemale: any[];
}

export interface FCGDetail {
  gameId: string;
  fetchedAt: string;
  game: FCGGame;
  categories: FCGCategory[];
  card?: any;
}

/** Shape mínima compatível com RFEGDetail consumido por RFEGPage. */
export interface MinimalRFEGShape {
  compId: string | number;
  ok: boolean;
  scrapedAt: string;
  meta: {
    name: string | null;
    dateStart: string | null;
    dateEnd: string | null;
    course: string | null;
    courseClubId: number | null;
    players: number | null;
    hcpLimitMen: number | null;
    hcpLimitWomen: number | null;
    mode: string | null;
    style: string | null;
    category: string | null;
    sex: string | null;
    federation: string | null;
    federationCatId: number | null;
  };
  coursePar?: number[] | null;
  parConfidence?: "high" | "medium" | "low";
  inscritos: {
    admitidos: any[];
    reservas: any[];
    bajas: any[];
    invitados: any[];
    noAdmitidos: any[];
    provisional: any[];
    counts: { admitidos: number; reservas: number; bajas: number; invitados: number; noAdmitidos: number; provisional: number };
  };
  results?: any[];
  /** Marker para distinguir source ao re-render. */
  __fcg?: true;
  __categories?: FCGCategory[];
}

// Nomes no golfdirecto vêm em ALL CAPS ("NIL", "CARRERA COSTA"). displayName()
// (de format.ts) detecta >45% maiúsculas → Title Case, igualando o aspeto das
// outras fontes/páginas. Nome já bem-formatado passa intacto.
function fmtName(first: string | null | undefined, last: string | null | undefined): string {
  const a = (first || "").trim();
  const b = (last || "").trim();
  return displayCase([a, b].filter(Boolean).join(" "));
}

export function adaptFcg(d: FCGDetail, dobLookup?: DobLookup, _hcpLookup?: HcpLookup): MinimalRFEGShape {
  const game = d.game;
  const cats = d.categories || [];
  const tournamentName = (game.tournament && game.tournament.name) || game.name || d.gameId;
  const courseName = (game.course && game.course.name) || (game.club && game.club.name) || null;
  const dateIso = game.scheduleStartDate ? game.scheduleStartDate.slice(0, 10) : null;
  const dateEndIso = game.scheduleEndDate ? game.scheduleEndDate.slice(0, 10) : dateIso;

  // Determinar par real do campo a partir do primeiro scorecard com gameTee preenchido
  let coursePar: number[] | null = null;
  for (const c of cats) {
    for (const p of c.players) {
      if (p.scorecard && p.scorecard.gameTee && Array.isArray(p.scorecard.gameTee.par1_18)) {
        coursePar = p.scorecard.gameTee.par1_18.filter((x): x is number => typeof x === "number");
        if (coursePar.length === 18 || coursePar.length === 9) break;
      }
    }
    if (coursePar) break;
  }

  // Sexo agregado das categorias
  const genders = new Set<string>(cats.map((c) => c.gender).filter((g): g is "M" | "F" => !!g));
  const sex = genders.size === 1 ? Array.from(genders)[0] : (genders.size > 1 ? "Mixto" : null);

  // Categoria dominante (texto)
  const allCatText = cats.map((c) => c.name).filter(Boolean).join(" / ");

  // admitidos = todos os jogadores de todas as categorias, com __cat anexado
  const admitidos: any[] = [];
  for (const c of cats) {
    for (const p of c.players) {
      const lic = p.license;
      const dobEntry = lic && dobLookup ? dobLookup[lic] : null;
      const acc = (p.view && p.view.acc) || {};
      const day = (p.view && p.view.day) || {};
      const pos = typeof acc.rankingPosition === "number" ? acc.rankingPosition : (typeof day.rankingPosition === "number" ? day.rankingPosition : null);
      const total = typeof acc.strokeNumber === "number" ? acc.strokeNumber : (typeof day.strokeNumber === "number" ? day.strokeNumber : null);
      const toPar = typeof acc.onlyGross === "number" ? acc.onlyGross : (typeof day.onlyGross === "number" ? day.onlyGross : null);
      admitidos.push({
        pos,
        name: fmtName(p.firstName, p.surname),
        licencia: lic,
        pais: p.country,
        hcp: p.hcpExact,
        catEdad: dobEntry?.catEdad || null,
        sexo: p.gender || c.gender,
        club: dobEntry?.club || null,
        dob: dobEntry?.dob || null,
        estado: p.isCardFinished ? "Finalizado" : (p.isCardClosed ? "Encerrado" : "Em curso"),
        // total + toPar para serem visíveis na lista de admitidos
        total,
        toPar,
        // __cat marca a categoria FCG (mostrado na UI como sufixo)
        __cat: c.name,
        __scorecard: p.scorecard || null,
      });
    }
  }
  admitidos.sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));

  return {
    compId: d.gameId,
    ok: true,
    scrapedAt: d.fetchedAt,
    meta: {
      name: tournamentName,
      dateStart: dateIso,
      dateEnd: dateEndIso,
      course: courseName,
      courseClubId: null,
      players: admitidos.length,
      hcpLimitMen: null,
      hcpLimitWomen: null,
      mode: game.pointMode,
      style: null,
      category: allCatText || null,
      sex,
      federation: "Federación Catalana de Golf",
      federationCatId: null,
    },
    coursePar,
    parConfidence: coursePar ? "high" : undefined,
    inscritos: {
      admitidos,
      reservas: [],
      bajas: [],
      invitados: [],
      noAdmitidos: [],
      provisional: [],
      counts: {
        admitidos: admitidos.length,
        reservas: 0,
        bajas: 0,
        invitados: 0,
        noAdmitidos: 0,
        provisional: 0,
      },
    },
    results: [],
    __fcg: true,
    __categories: cats,
  };
}

/* ── fcgToFPGTournament ────────────────────────────────────────
 * Converte os JSONs FCG (golfdirecto) para FPGTournament — formato consumido
 * pela tab "Resultados" via IntlTournView/ScorecardLeaderboard. Mantém:
 *   - par/SI/metros reais por buraco (gameTee.par1_18 etc.)
 *   - scorecard hbh por jogador (score.gross1-18)
 *   - posição + total + to-par (view.acc)
 *   - sex + age (cross-ref dobLookup)
 *
 * Limitação: cada game golfdirecto = 1 jornada (1 ronda). Para multi-round
 * o adapter teria que correlacionar múltiplos gameIds via tournament._id.
 */
interface FpgRoundScoreShape {
  round: number;
  gross: number;
  scores: number[];
  pars: number[];
  si: number[];
  meters: number[];
  teeName?: string;
}

interface FpgPlayerShape {
  scoreId: string;
  pos: number;
  name: string;
  club: string;
  fed?: string;
  fedCode?: string;
  grossTotal: number | null;
  toPar: number | null;
  hcpExact?: number;
  escalao: string | null;
  _sex: "M" | "F" | null;
  _age: number | null;
  _category?: string;
  teeName?: string;
  nholes: number;
  parTotal: number;
  scores: number[];
  par: number[];
  si: number[];
  meters: number[];
  roundScores: FpgRoundScoreShape[];
  _wd: boolean;
  _roundsPlayed: number;
}

export interface FpgTournamentShape {
  name: string;
  tcode: string;
  date: string;
  campo: string;
  rounds: number;
  playerCount: number;
  players: FpgPlayerShape[];
}

function ageAtFcg(dobIso: string | null | undefined, refIso: string | null | undefined): number | null {
  if (!dobIso || !refIso) return null;
  try {
    const d = new Date(dobIso);
    const r = new Date(refIso);
    if (isNaN(d.getTime()) || isNaN(r.getTime())) return null;
    let age = r.getFullYear() - d.getFullYear();
    const m = r.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && r.getDate() < d.getDate())) age--;
    return age;
  } catch { return null; }
}

function escalaoFromCategory(catName: string | null, age: number | null): string | null {
  // Preferir o nome da categoria FCG (mais específico) — depois fallback para idade.
  if (catName) {
    const t = catName.toLowerCase();
    if (/benjam[íi]/.test(t)) return "Benjamín";
    if (/alev[íi]|sub-?12/.test(t)) return "Alevín";
    if (/infantil|sub-?14/.test(t)) return "Infantil";
    if (/cadet|sub-?16/.test(t)) return "Cadete";
    if (/sub-?18|junior/.test(t)) return "Sub-18";
    if (/sub-?21|sub-?25/.test(t)) return "Sub-21";
  }
  if (age == null) return null;
  if (age <= 10) return "Benjamín";
  if (age <= 12) return "Alevín";
  if (age <= 14) return "Infantil";
  if (age <= 16) return "Cadete";
  if (age <= 18) return "Sub-18";
  return null;
}

export function fcgToFPGTournament(detail: MinimalRFEGShape, dobLookup?: DobLookup): FpgTournamentShape | null {
  const cats = detail.__categories || [];
  if (cats.length === 0) return null;

  // Procurar par/SI/meters do primeiro scorecard com gameTee
  let par18: number[] = [];
  let si18: number[] = [];
  let meters18: number[] = [];
  let teeName = "";
  for (const c of cats) {
    for (const p of c.players) {
      if (p.scorecard && p.scorecard.gameTee) {
        const t = p.scorecard.gameTee;
        const pp = (t.par1_18 || []).filter((x): x is number => typeof x === "number");
        if (pp.length === 18 || pp.length === 9) {
          par18 = pp;
          si18 = (t.hcp1_18 || []).filter((x): x is number => typeof x === "number");
          meters18 = (t.meters1_18 || []).filter((x): x is number => typeof x === "number");
          teeName = t.color ? t.color[0].toUpperCase() + t.color.slice(1) : "Tour";
          break;
        }
      }
    }
    if (par18.length > 0) break;
  }
  if (par18.length === 0) par18 = new Array(18).fill(4);
  const parTotal = par18.reduce((a, b) => a + b, 0);
  const nholes = par18.length;

  const dateRef = detail.meta.dateStart || null;
  const players: FpgPlayerShape[] = [];
  let scoreIdCounter = 0;

  for (const cat of cats) {
    for (const p of cat.players) {
      const lic = p.license || undefined;
      const dobEntry = lic && dobLookup ? dobLookup[lic] : null;
      const dobIso = dobEntry?.dobIso || null;
      const age = ageAtFcg(dobIso, dateRef);

      const view = p.view || { day: null, acc: null };
      const acc = view.acc || view.day || {};
      const grossTotal = typeof acc.strokeNumber === "number" ? acc.strokeNumber : null;
      const toPar = typeof acc.onlyGross === "number" ? acc.onlyGross : null;
      const pos = typeof acc.rankingPosition === "number" ? acc.rankingPosition : (scoreIdCounter + 1);

      const scoresRaw = p.scorecard && p.scorecard.gross ? p.scorecard.gross : [];
      const scores: number[] = scoresRaw.map((x) => (typeof x === "number" ? x : 0));
      const hasScorecard = scores.some((s) => s > 0);
      const r1Total = hasScorecard ? scores.reduce((a, b) => a + b, 0) : (grossTotal ?? 0);

      const roundScores: FpgRoundScoreShape[] = hasScorecard ? [{
        round: 1,
        gross: r1Total,
        scores,
        pars: par18,
        si: si18,
        meters: meters18,
        teeName,
      }] : [];

      const escalao = escalaoFromCategory(cat.name, age);
      const sex: "M" | "F" | null = (p.gender === "M" ? "M" : (p.gender === "F" ? "F" : (cat.gender === "M" ? "M" : (cat.gender === "F" ? "F" : (dobEntry?.sex === "M" ? "M" : (dobEntry?.sex === "F" ? "F" : null))))));

      players.push({
        scoreId: `fcg-${detail.compId}-${scoreIdCounter++}`,
        pos,
        name: fmtName(p.firstName, p.surname),
        club: dobEntry?.club || "—",
        fed: lic,
        fedCode: lic,
        grossTotal,
        toPar,
        hcpExact: p.hcpExact ?? undefined,
        escalao,
        _sex: sex,
        _age: age,
        _category: cat.name,
        teeName,
        nholes,
        parTotal,
        scores,
        par: par18,
        si: si18,
        meters: meters18,
        roundScores,
        _wd: !p.isCardFinished,
        _roundsPlayed: roundScores.length,
      });
    }
  }

  // Ordenar por posição (pos), depois por nome
  players.sort((a, b) => {
    const pa = a.pos ?? 999, pb = b.pos ?? 999;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return {
    name: detail.meta.name || `FCG ${detail.compId}`,
    tcode: String(detail.compId),
    date: detail.meta.dateStart || "",
    campo: detail.meta.course || "",
    rounds: 1,
    playerCount: players.length,
    players,
  };
}
