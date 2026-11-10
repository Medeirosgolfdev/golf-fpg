/**
 * toTournament.ts — GJGL → Tournament da FPG (uma divisão U14/U18/U23 de cada
 * vez), as opções do scorecard e os totais quando não há buraco a buraco.
 *
 * Tirado da GlobalJuniorPage a 23/10/2026 (fase 5 do plano) — igual ao que estava lá.
 */
import { gf } from "../../utils/flagUtils";
import type { Tournament as FPGTournament, ScorecardOptions } from "../fpgTypes";
import { intlScorecardOptions } from "../intlScorecard";
import { buildFPGTournament, type IntlPlayerIn } from "../intlTournament";
import type { GjglData, GjglDivision, GjglCourseOverride } from "./types";


/* ── Nome de país (por extenso, vindo do scraper) → ISO-2 ──────────
   O scraper GJGL extrai o país de um comentário HTML embutido na row do
   leaderboard (nome por extenso em inglês). Mapeamos para ISO-2 para
   gerar a bandeira emoji via gf(). Também tolera ISO-3 e "gif:N" legacy. */
const NAME_TO_ISO2: Record<string, string> = {
  Portugal: "PT", Spain: "ES", France: "FR", Germany: "DE", Italy: "IT",
  Netherlands: "NL", Denmark: "DK", Sweden: "SE", Finland: "FI", Iceland: "IS",
  Poland: "PL", Switzerland: "CH", Latvia: "LV", Estonia: "EE",
  Scotland: "GB-SCT", England: "GB-ENG", Wales: "GB-WLS", Ireland: "IE",
  "South Africa": "ZA", UAE: "AE", "United Arab Emirates": "AE",
  Mauritius: "MU", India: "IN", Belgium: "BE", Austria: "AT", Norway: "NO",
  "United States": "US", "United States of America": "US", USA: "US", "United Kingdom": "GB", "Great Britain": "GB",
  "Hong Kong": "HK", China: "CN", Japan: "JP", "South Korea": "KR", Korea: "KR",
  Australia: "AU", Brazil: "BR", Argentina: "AR", Canada: "CA", Mexico: "MX",
  "Czech Republic": "CZ", Czechia: "CZ", Slovakia: "SK", Slovenia: "SI",
  Hungary: "HU", Romania: "RO", Bulgaria: "BG", Greece: "GR", Turkey: "TR",
  Ukraine: "UA", Lithuania: "LT", Luxembourg: "LU", Malta: "MT", Cyprus: "CY",
  Croatia: "HR", Serbia: "RS", Russia: "RU", "Russian Federation": "RU",
  Morocco: "MA", Egypt: "EG", "New Zealand": "NZ", Singapore: "SG",
  Thailand: "TH", Philippines: "PH", Malaysia: "MY", Indonesia: "ID",
  Israel: "IL", "Saudi Arabia": "SA", Qatar: "QA", Bahrain: "BH",
};
// Legacy ISO-3 fallback for any old scraped JSON still using 3-letter codes
const ISO3_TO_ISO2: Record<string, string> = {
  AUT: "AT", BEL: "BE", CHE: "CH", DEU: "DE", DNK: "DK", ESP: "ES",
  EST: "EE", FIN: "FI", FRA: "FR", GBR: "GB", ENG: "GB-ENG", ITA: "IT",
  NLD: "NL", NOR: "NO", POL: "PL", PRT: "PT", SWE: "SE", USA: "US",
  ZAF: "ZA", IND: "IN", MUS: "MU", ARE: "AE",
};
export function flagForCountry(country: string | null | undefined): string {
  if (!country) return "";
  if (/^gif:\d+$/.test(country)) return "🏳";
  const iso2 = NAME_TO_ISO2[country] || ISO3_TO_ISO2[country] || (country.length === 2 ? country : "");
  return iso2 ? (gf(iso2) || "🏳") : "🏳";
}

/** Par de 18 buracos válido (um número > 0 por buraco) ou null. */
const par18De = (par: readonly (number | null)[] | null | undefined): number[] | null =>
  par && par.length >= 18 && par.every((x) => typeof x === "number" && x > 0) ? (par as number[]) : null;

const mesmoPar = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Dias que NÃO são voltas da divisão: ninguém jogou 9 buracos nesse dia (o
 * play-off de desempate vem da fonte como uma «volta» de 1 buraco). 10/11/2026
 * (J9): GJG Edge Mason 2026 — o vencedor ficava com 3 voltas contra 2 dos
 * outros («incompleto» para todos) e ±par −69. Uma volta abandonada a meio por
 * UM jogador (WD) continua a contar: nesse dia os outros jogaram 18.
 */
export function gjglDiasSemVolta(div: GjglDivision): Set<number> {
  const maxBuracos = new Map<number, number>();
  for (const p of div.players) for (const r of p.rounds || []) {
    if (!r || !Array.isArray(r.scores)) continue;   // só totais: não se sabe, conta como volta
    const n = r.scores.filter((x) => typeof x === "number" && x > 0).length;
    maxBuracos.set(r.day, Math.max(maxBuracos.get(r.day) ?? 0, n));
  }
  return new Set([...maxBuracos].filter(([, n]) => n < 9).map(([day]) => day));
}

/* ── Adapter GjglData → FPGTournament por escalão ─────────────────── */
export function divisionToTournament(d: GjglData, div: GjglDivision, label: string, ovr?: GjglCourseOverride | null): FPGTournament {
  // Sem par por buraco → sem par (nunca 4 inventado); o ±par é o da fonte.
  const par18: number[] = d.par && d.par.length >= 18 ? (d.par as number[]) : [];
  const semVolta = gjglDiasSemVolta(div);
  return buildFPGTournament(
    { name: label, tcode: `${d.slug}-u${div.ak}`, date: d.start_date || "", campo: ovr?.course || d.course || d.country },
    { par: par18, teeName: "Tee", holes: 18, parTotal: par18.length ? undefined : null },
    div.players.map((p): IntlPlayerIn => {
      // Tee curado por sexo — só se houver evidência para ESSE sexo (não
      // mostrar metros dos rapazes a uma rapariga).
      const teeOvr = ovr?.tees?.[p.gender === "f" ? "F" : "M"] ?? null;
      const dispCountry = /united states/i.test(p.country || "") ? "USA" : (p.country || "");
      // Play-off fora das voltas; e sai do total quando a fonte o somou lá.
      const todas = p.rounds || [];
      const voltas = todas.filter((r) => !semVolta.has(r.day));
      const fora = todas.length - voltas.length;
      const soma = (rs: typeof todas) => rs.reduce((s, r) => s + (r.gross ?? 0), 0);
      const total = fora > 0 && p.total != null && p.total === soma(todas) ? soma(voltas) : p.total;
      // O par é o de CADA volta do jogador (10/11/2026, J3): as raparigas jogam
      // outro par (Loretto 2026: 73 contra 70) e a fonte dá-o volta a volta. O
      // par do torneio só serve a quem não traz o seu.
      const pars = voltas.map((r) => par18De(r.par));
      const parJog = pars.find((x) => x) ?? null;
      const base = parJog ?? par18;
      return {
        id: p.playerKey || p.name, name: p.name, pos: p.pos,
        club: p.country ? `${flagForCountry(p.country)} ${dispCountry}` : "",
        country: p.country, total, hcp: p.hcp,
        rounds: voltas.map((r, i) => {
          const pr = pars[i];
          return pr && !mesmoPar(pr, base) ? { ...r, card: { par: pr } } : r;
        }),
        ...(par18.length ? {} : { toPar: typeof p.toPar === "number" ? p.toPar : null }),
        wd: false,
        course: teeOvr || (parJog && !mesmoPar(parJog, par18))
          ? {
              ...(teeOvr ? { si: teeOvr.si, meters: teeOvr.meters, teeName: teeOvr.tee ?? "Tee" } : {}),
              ...(parJog && !mesmoPar(parJog, par18) ? { par: parJog, parTotal: undefined } : {}),
            }
          : undefined,
      };
    }),
  );
}

export function gjglScorecardOptions(hasTees?: boolean): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, hideTee: !hasTees });
}

/** Divisão GJGL sem buraco a buraco → os totais que o shell desenha no Resumo comum. O par de
 *  uma volta tira-se de quem tem total e ±par numéricos. */
export function gjglTotais(div: GjglDivision) {
  const ref = div.players.find((p) => typeof p.toPar === "number" && p.total != null && (p.rounds || []).some((r) => r?.gross));
  const nR = ref ? (ref.rounds || []).filter((r) => r?.gross).length : 0;
  const parPerRound = ref && nR ? Math.round((ref.total! - (ref.toPar as number)) / nR) : null;
  const players = div.players.map((p) => ({ name: p.name, country: p.country, club: p.club ?? null,
    hcp: p.hcp ?? null, birthYear: p.birthYearEst ?? null, pos: p.pos,
    rounds: (p.rounds || []).map((r) => r?.gross ?? null), total: p.total }));
  return { players, parPerRound };
}
