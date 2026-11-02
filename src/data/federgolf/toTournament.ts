/**
 * toTournament.ts — uma prova da Federgolf (um sexo) → Tournament da FPG, e
 * os nomes («APELIDO, NOME» → «Nome Apelido»).
 *
 * Cada volta leva o tee, o CR/Slope e o SD oficial do relatório de handicap
 * da prova; o escalão de cada jogador sai da categoria da Federgolf (B Baby,
 * P Pulcini, C Cadetti, R Ragazzi) pela tabela única de `model/escalao.ts`.
 */
import type { Tournament as FPGTournament, ScorecardOptions } from "../fpgTypes";
import { intlScorecardOptions } from "../intlScorecard";
import { buildFPGTournament, parOrNone, type IntlPlayerIn } from "../intlTournament";
import { escalaoCanon } from "../model/escalao";
import type { TotalsExtraCol } from "../model/types";
import { flagOrEmpty } from "../../utils/flagUtils";
import type { FgProva } from "./types";

/** «D'ADDABBO» → «D'Addabbo», «BIANCHI FEDRIGONI» → «Bianchi Fedrigoni»,
 *  «SICILIA'S PICCIOLO» → «Sicilia's Picciolo». */
export function fgTitulo(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'’"(“-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/(['’])S\b/g, "$1s")
    // Siglas e escalões ficam em maiúsculas («TGF U18», «AJGA IPS», «WAGR»).
    .replace(/\b(Tgf|Wagr|Ajga|Ips|Cjga|Gc|Cg|Fig|Ssd|Asd|U\d{2})\b/g, (m) => m.toUpperCase());
}

/** «DURANDO, MATTEO» → «Matteo Durando». */
export function fgNome(nome: string): string {
  const [apelido, proprio] = nome.split(",").map((s) => s.trim());
  return fgTitulo(proprio ? `${proprio} ${apelido}` : apelido);
}

export const fgClube = (clube: string | null | undefined): string => (clube ? fgTitulo(clube) : "");

/** Nos estrangeiros a Federgolf põe o país no lugar do clube, com códigos
 *  próprios (SWI, DAN, SLK, IRE, SCO…). Código → ISO-2; um clube italiano → null. */
const PAIS: Record<string, string> = {
  FRA: "FR", RSA: "ZA", NED: "NL", ENG: "GB-ENG", SCO: "GB-SCT", WAL: "GB-WLS", IRE: "IE", BEL: "BE",
  SWE: "SE", FIN: "FI", AUT: "AT", CZE: "CZ", SWI: "CH", SUI: "CH", NOR: "NO", POL: "PL", DAN: "DK",
  DEN: "DK", EST: "EE", SLK: "SK", SVK: "SK", GER: "DE", LIT: "LT", LTU: "LT", CRO: "HR", POR: "PT",
  ESP: "ES", SPA: "ES", USA: "US", GBR: "GB", HUN: "HU", SLO: "SI", LAT: "LV", ISL: "IS", LUX: "LU",
  MON: "MC", SMR: "SM", MLT: "MT", GRE: "GR", TUR: "TR", UKR: "UA", ROU: "RO", BUL: "BG", SRB: "RS",
  ISR: "IL", MEX: "MX", CAN: "CA", BRA: "BR", ARG: "AR", CHN: "CN", JPN: "JP", KOR: "KR", IND: "IN",
  AUS: "AU", NZL: "NZ", UAE: "AE", MAR: "MA", THA: "TH",
};
export function fgPais(clube: string | null | undefined): string | null {
  const c = String(clube ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? PAIS[c] ?? null : null;
}

/** Coluna Clube: o clube, ou a bandeira e o código nos estrangeiros. */
export function clubeOuPais(clube: string | null | undefined): string {
  const pais = fgPais(clube);
  return pais ? `${flagOrEmpty(pais)} ${String(clube).trim().toUpperCase()}` : fgClube(clube);
}

/** Letra da categoria da Federgolf → nome (para a tabela de escalões). */
const CATEGORIA: Record<string, string> = { B: "Baby", P: "Pulcini", C: "Cadetti", R: "Ragazzi" };

/** Escalão de um jogador pela categoria (B/P/C/R); null = desconhecida. */
export function fgEscalao(cat: string | null | undefined): string | null {
  const nome = CATEGORIA[String(cat ?? "").trim().toUpperCase().slice(0, 1)];
  return nome ? escalaoCanon(nome, "it") : null;
}

/** Escalão de uma prova (Baby → Sub 12, U16 → Sub 16); o resto fica com o nome. */
export const fgEscalaoProva = (categoria: string): string => escalaoCanon(categoria, "it") ?? categoria;

export function fgToTournament(d: FgProva): FPGTournament {
  const par = parOrNone(d.campo?.par, 18);
  const metros = d.campo?.metros?.every((m) => typeof m === "number" && m > 0) ? (d.campo.metros as number[]) : null;
  return buildFPGTournament(
    { name: fgTitulo(d.nome), tcode: d.id, date: d.data ?? "", campo: fgClube(d.clube), rounds: d.voltas },
    { par, meters: metros, holes: 18, parTotal: par.length ? undefined : null },
    d.jogadores.map((j): IntlPlayerIn => {
      const escalao = fgEscalao(j.cat);
      const tee = j.rating.find((r) => r?.tee)?.tee;
      return {
        id: j.id,
        name: fgNome(j.nome),
        pos: j.pos,
        club: clubeOuPais(j.clube),
        country: fgPais(j.clube),
        total: j.total,
        hcp: j.indice ?? j.hcp,
        ...(tee ? { course: { teeName: tee } } : {}),
        // Sem ±par da fonte (voltas em falta), conta-se pelas voltas jogadas.
        ...(j.toPar != null ? { toPar: j.toPar } : {}),
        rounds: j.voltas.flatMap((g, i) => {
          if (g == null) return [];
          const r = j.rating[i];
          return [{
            gross: g,
            scores: j.cartoes[i] ?? null,
            round: i + 1,
            card: r ? { teeName: r.tee ?? undefined, courseRating: r.cr ?? undefined, slope: r.slope ?? undefined } : undefined,
            extra: r?.sd != null ? { sd: r.sd } : undefined,
          }];
        }),
        extra: { ...(escalao ? { escalao } : {}), ...(d.sexo ? { sex: d.sexo } : {}) },
      };
    }),
  );
}

/** A prova tem cartões buraco a buraco? (a passagem rápida só grava totais) */
export const fgTemCartoes = (d: FgProva): boolean => d.jogadores.some((j) => j.cartoes.some(Boolean));

/** Prova só com totais → o Resumo comum (TotalsResumo). */
export function fgTotais(d: FgProva) {
  // SD oficial de cada volta (relatório de handicap) — colunas «SD R1»…, só
  // nas voltas em que alguém o tem.
  const voltasComSd = Array.from({ length: d.voltas }, (_, i) => i).filter((i) => d.jogadores.some((j) => j.rating[i]?.sd != null));
  return {
    players: d.jogadores.map((j) => ({
      name: fgNome(j.nome), club: clubeOuPais(j.clube), country: fgPais(j.clube), hcp: j.indice ?? j.hcp, pos: j.pos,
      rounds: j.voltas, total: j.total,
      ...(j.toPar != null ? { toPar: j.toPar } : {}),
      ...Object.fromEntries(voltasComSd.map((i) => [`sd${i + 1}`, j.rating[i]?.sd ?? null])),
    })),
    parPerRound: d.parTotal ?? null,
    tournamentDate: d.data ?? undefined,
    ...(voltasComSd.length ? {
      extra: voltasComSd.map((i): TotalsExtraCol => ({
        header: `SD R${i + 1}`, title: `SD oficial da Federgolf na ${i + 1}.ª volta`, field: `sd${i + 1}`, decimals: 1,
      })),
    } : {}),
  };
}

export function fgScorecardOptions(): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, hideTee: false, hideEsc: false, clubLabel: "Clube" });
}
