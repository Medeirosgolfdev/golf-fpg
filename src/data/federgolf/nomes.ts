/**
 * nomes.ts — nomes, clube/país, a chave de prova e o ano de nascimento da
 * Federgolf. Partilhado pela /fig e pelo agregador do Kids 2
 * (scripts/aggregator/sources/fig.js), que o carrega directamente com o Node
 * (como o whsCalc.ts): só tipos e funções, nada de imports de valores, de
 * `enum` nem de `namespace` (scripts/federgolf-nomes-loader.test.js).
 */
import type { FgRanking } from "./ranking";

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

/** Nome da prova sem o sexo («… - MASCHILE», «… - FEMMINILE»). */
export function fgNomeBase(nome: string): string {
  return nome.replace(/\s*-?\s*\b(MASCHILE|FEMMINILE)\b\s*/i, " ").replace(/\s+-\s*$/, "").replace(/\s+/g, " ").trim();
}

/** A prova masculina e a feminina do mesmo dia e clube = a mesma prova
 *  («Pulcine»/«Pulcini», «Ragazze»/«Ragazzi»). */
export function fgChaveProva(p: { data: string | null; clube: string | null; nome: string }): string {
  return `${p.data}|${p.clube}|${fgNomeBase(p.nome).replace(/\b(PULCIN|CADETT|RAGAZZ)[IE]\b/gi, "$1I")}`;
}

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

/** id do jogador → ano de nascimento. A `idade` do ranking é a idade civil
 *  (ano do ranking − ano de nascimento, como as categorias): conferido a
 *  02/11/2026 contra os 222 juniores do Kids 2 com data real — 222 batem.
 *  É dado lido, não estimado. Vale o ano mais recente em que o jogador aparece. */
export function fgAnosNascimento(r: FgRanking | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!r) return m;
  for (const ano of Object.keys(r.anos).sort().reverse()) {
    for (const linhas of Object.values(r.anos[ano])) {
      for (const l of linhas) if (l.id && l.idade != null && !m.has(l.id)) m.set(l.id, Number(ano) - l.idade);
    }
  }
  return m;
}
