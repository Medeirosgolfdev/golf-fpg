/**
 * doral.ts — Dados First Tee Miami Doral Jr. Classic (GolfGenius) da /major.
 *
 *   - DORAL_FILES: um ficheiro por ano (ftm_doral_{ano}.json)
 *   - DORAL_DIVISION_META: campo, CR/Slope e metros por escalão
 *   - normalizeDoralFile: divisões → DoralEntry (nomes «Nome Apelido», rondas
 *     por data, escalões «Boys 14-15»)
 *   - doralEntryToTournament: DoralEntry → Tournament (formato FPG)
 *
 * Boys 8-9: 9 buracos (H10-H18) · Boys 10-11 / 12-13: 18 buracos.
 * Tirado da DORALPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { gf, normPaisDisplay } from "../../utils/flagUtils";
import type { Tournament as FPGTournament } from "../fpgTypes";
import { buildFPGTournament, type IntlPlayerIn } from "../intlTournament";

/* ── Types ─────────────────────────────────────────────────── */
export interface DoralRound {
  day: number;
  date: string;
  course: string;
  startingHole?: number;
  scores: number[];
  f9?: number;
  b9?: number;
  gross: number;
}
export interface DoralPlayer {
  id: string;
  name: string;
  country: string;
  birthYear?: number;
  pos: number | null;
  toPar: number | null;
  total: number | null;
  r1Gross?: number;
  r2Gross?: number;
  rounds: DoralRound[];
}
export interface DoralDivision {
  division: string;
  name: string;
  par?: number[];
  parF9?: number;
  parB9?: number;
  parTotal?: number;
  startingHole?: number;
  players: DoralPlayer[];
}
export interface DoralFile {
  tournament: string;
  year: number;
  source: string;
  divisions: DoralDivision[];
}

/* Entrada normalizada para uma divisão específica */
export interface DoralEntry {
  id: string;
  label: string;
  year: number;
  category: string;
  divisionName: string;
  nineHole: boolean;
  par: number[];
  parF9: number;
  parB9: number;
  parTotal: number;
  course: string;
  cr?: number;
  slope?: number;
  metres: number[];
  metresF9?: number;
  metresB9?: number;
  metresTotal?: number;
  sourceUrl: string;
  players: DoralPlayer[];
}

/* ── Ficheiros de dados ─────────────────────────────────────── */
/* Todos os anos disponíveis em GolfGenius. Ficheiros em falta (404) são
   tolerados graciosamente pelo loader — só aparecem na UI os que existirem.
   Para scrapar um ano novo: `node scripts/scrape-golfgenius-v3.js --year YYYY` */
export const DORAL_FILES: { url: string; sourceUrl: string }[] = [
  {
    url: "/data/ftm_doral_2025.json",
    sourceUrl: "https://2025firstteemiamidoraljrclassic.golfgenius.com/pages/5506943",
  },
  {
    url: "/data/ftm_doral_2024.json",
    sourceUrl: "https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994",
  },
  {
    url: "/data/ftm_doral_2023.json",
    sourceUrl: "https://tftm-2023firstteemiamidoraljrclassic.golfgenius.com/pages/4282619",
  },
  {
    url: "/data/ftm_doral_2022.json",
    sourceUrl: "https://2022firstteemiamidoral.golfgenius.com/pages/3661172",
  },
  {
    url: "/data/ftm_doral_2021.json",
    sourceUrl: "https://2021firstteemiamidoral.golfgenius.com/pages/3122115",
  },
  {
    url: "/data/ftm_doral_2020.json",
    sourceUrl: "https://www.golfgenius.com/pages/2610251",
  },
  {
    url: "/data/ftm_doral_2019.json",
    sourceUrl: "https://2019doralpublix.golfgenius.com/pages/2050901",
  },
  {
    url: "/data/ftm_doral_2018.json",
    sourceUrl: "https://2018doralpublix.golfgenius.com/pages/1568091",
  },
];


/* ── Metadados por divisão: campo, CR/Slope, metros por buraco ── */
interface DivMeta { course: string; cr?: number; slope?: number; metres: number[]; metresF9?: number; metresB9?: number; metresTotal: number }
const DORAL_DIVISION_META: Record<string, DivMeta> = {
  // RED TIGER — 9H (H10-H18)
  "Boys 7 & Under": { course:"Red Tiger", metres:[215,79,210,160,84,155,78,165,210], metresTotal:1356 },
  "Boys 8-9":       { course:"Red Tiger", metres:[247,79,261,192,84,183,107,198,274], metresTotal:1625 },
  // RED TIGER — 9H (H1-H9)
  "Girls 7 & Under":{ course:"Red Tiger", metres:[215,73,210,160,210,55,165,102,174], metresTotal:1364 },
  "Girls 8-9":      { course:"Red Tiger", metres:[247,138,238,192,229,104,197,102,197], metresTotal:1644 },
  "Girls 10-11":    { course:"Red Tiger", metres:[362,137,343,192,312,104,210,102,248], metresTotal:2010 },
  // RED TIGER — 18H
  "Girls 14-15":    { course:"Red Tiger", metres:[467,146,428,248,445,142,316,117,329,428,145,411,294,129,315,146,255,447], metresF9:2638, metresB9:2570, metresTotal:5208 },
  "Girls 16-18":    { course:"Red Tiger", cr:75.0, slope:140, metres:[467,146,445,259,445,152,327,138,345,433,163,443,318,151,333,155,275,447], metresF9:2724, metresB9:2718, metresTotal:5442 },
  // GOLDEN PALM — 18H
  "Boys 10-11":     { course:"Golden Palm", cr:69.0, slope:130, metres:[275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273], metresF9:2571, metresB9:2315, metresTotal:4886 },
  "Girls 12-13":    { course:"Golden Palm", cr:71.0, slope:134, metres:[275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273], metresF9:2571, metresB9:2315, metresTotal:4886 },
  "Boys 14-15":     { course:"Golden Palm", cr:72.0, slope:136, metres:[354,475,354,493,356,353,133,361,164,302,494,137,314,367,134,487,159,356], metresF9:3043, metresB9:2750, metresTotal:5793 },
  // SILVER FOX — 18H
  "Boys 12-13":     { course:"Silver Fox", cr:74.0, slope:140, metres:[321,311,455,130,293,317,123,311,306,314,425,300,281,279,125,428,121,304], metresF9:2567, metresB9:2577, metresTotal:5144 },
  // BLUE MONSTER — 18H
  "Boys 16-18":     { course:"Blue Monster", cr:74.0, slope:140, metres:[511,348,359,161,346,368,398,483,169,512,298,539,180,401,122,286,375,396], metresF9:3143, metresB9:3109, metresTotal:6252 },
};

/* ── Normalização de nomes ──────────────────────────────────── */
/** Golf Genius devolve "Sobrenome, Nome" → converter para "Nome Sobrenome" */
function lastFirstToFirstLast(raw: string): string {
  const comma = raw.indexOf(",");
  if (comma === -1) return raw.trim();
  const last  = raw.slice(0, comma).trim();
  const first = raw.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

/** Normaliza label de divisão GolfGenius para forma consistente.
 *  O widget mistura "Boys 14 & 15" e "Boys 14-15" entre anos — normalizamos
 *  para "Boys 14-15" sempre (excepto "Boys 7 & Under" que mantém-se).
 *  Sem isto, a comparação ano-a-ano falha em divisões com tipografia diferente. */
export function normalizeDoralCategory(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (/7\s*&\s*Under/i.test(s)) return s.replace(/\s*&\s*/g, " & ");
  // "Boys 14 & 15" → "Boys 14-15"
  return s.replace(/(\d+)\s*&\s*(\d+)/g, "$1-$2");
}


export function normalizeDoralFile(raw: DoralFile, sourceUrl: string): DoralEntry[] {
  return raw.divisions.map((div): DoralEntry => {
    const nineHole = div.players.some(p => p.rounds.some(r => r.startingHole === 10 && r.scores.length === 9));
    // Reordenar rondas por data (mais antiga = R1)
    const players = div.players
      .filter(p => p.rounds.length > 0)
      .map(p => ({
        ...p,
        name: lastFirstToFirstLast(p.name),
        rounds: [...p.rounds].sort((a, b) => {
          // Ordenar por data real (o campo day pode estar errado no scraper)
          if (a.date && b.date) {
            const months: Record<string,number> = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
              January:1,February:2,March:3,April:4,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
            const parse = (d: string) => {
              const parts = d.replace(/^[A-Za-z]+,\s+/, "").split(" ");
              return (months[parts[0]] ?? 0) * 100 + (parseInt(parts[1]) || 0);
            };
            return parse(a.date) - parse(b.date);
          }
          return a.day - b.day;
        }),
      }))
      .sort((a, b) => {
        const nR = Math.max(...div.players.map(p => p.rounds.length));
        const af = a.rounds.length === nR ? 0 : 1;
        const bf = b.rounds.length === nR ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.total ?? 999) - (b.total ?? 999);
      });
    // Lookup do DORAL_DIVISION_META — normaliza o key porque o scraper guarda
    // "Boys 14 & 15" (com ampersand) mas o DORAL_DIVISION_META tem "Boys 14-15" (hífen).
    // Tenta primeiro o raw, depois a versão normalizada.
    const metaKeyNorm = normalizeDoralCategory(div.division);
    const meta = DORAL_DIVISION_META[div.division] ?? DORAL_DIVISION_META[metaKeyNorm] ?? { course: "", metres: [], metresTotal: 0 };
    const normCategory = normalizeDoralCategory(div.division);
    return {
      id: `${raw.year}_${normCategory.replace(/\s+/g,"_")}`,
      label: `${raw.year} // ${normCategory}`,
      year: raw.year,
      category: normCategory,
      divisionName: div.name,
      nineHole,
      par: div.par ?? [],
      parF9: div.parF9 ?? 0,
      parB9: div.parB9 ?? 0,
      parTotal: div.parTotal ?? 0,
      course: meta.course,
      cr: meta.cr,
      slope: meta.slope,
      metres: meta.metres,
      metresF9: meta.metresF9,
      metresB9: meta.metresB9,
      metresTotal: meta.metresTotal || undefined,
      sourceUrl,
      players,
    };
  });
}

/* ── Adaptador DoralEntry → FPGTournament para reutilizar AllRoundsScorecardLB ── */
export function doralEntryToTournament(entry: DoralEntry): FPGTournament {
  return buildFPGTournament(
    { name: entry.label, tcode: entry.id, campo: entry.course },
    // Metros na linha SI (siLabel="m"); Red Tiger, Golden Palm, Silver Fox,
    // Blue Monster — o percurso vai para a linha de stats.
    { par: entry.par, si: entry.metres, meters: entry.metres, course: entry.course, courseRating: entry.cr, slope: entry.slope },
    entry.players.map((p): IntlPlayerIn => ({
      id: p.id, name: p.name, pos: p.pos,
      club: p.country ? `${gf(p.country)} ${normPaisDisplay(p.country)}` : "",
      country: p.country, total: p.total, toPar: p.toPar, rounds: p.rounds,
    })),
  );
}
