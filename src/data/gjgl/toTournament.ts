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

/* ── Adapter GjglData → FPGTournament por escalão ─────────────────── */
export function divisionToTournament(d: GjglData, div: GjglDivision, label: string, ovr?: GjglCourseOverride | null): FPGTournament {
  // Sem par por buraco → sem par (nunca 4 inventado); o ±par é o da fonte.
  const par18: number[] = d.par && d.par.length >= 18 ? (d.par as number[]) : [];
  return buildFPGTournament(
    { name: label, tcode: `${d.slug}-u${div.ak}`, date: d.start_date || "", campo: ovr?.course || d.course || d.country },
    { par: par18, teeName: "Tee", holes: 18, parTotal: par18.length ? undefined : null },
    div.players.map((p): IntlPlayerIn => {
      // Tee curado por sexo — só se houver evidência para ESSE sexo (não
      // mostrar metros dos rapazes a uma rapariga).
      const teeOvr = ovr?.tees?.[p.gender === "f" ? "F" : "M"] ?? null;
      const dispCountry = /united states/i.test(p.country || "") ? "USA" : (p.country || "");
      return {
        id: p.playerKey || p.name, name: p.name, pos: p.pos,
        club: p.country ? `${flagForCountry(p.country)} ${dispCountry}` : "",
        country: p.country, total: p.total, hcp: p.hcp, rounds: p.rounds || [],
        ...(par18.length ? {} : { toPar: typeof p.toPar === "number" ? p.toPar : null }),
        wd: false,
        course: teeOvr ? { si: teeOvr.si, meters: teeOvr.meters, teeName: teeOvr.tee ?? "Tee" } : undefined,
      };
    }),
  );
}

export function gjglScorecardOptions(hasTees?: boolean): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, hideTee: !hasTees });
}

/** Divisão GJGL sem buraco a buraco → o Resumo comum (TotalsResumo). O par de
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
