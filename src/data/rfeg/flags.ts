/**
 * flags.ts — Bandeiras na página de Espanha: só os ESTRANGEIROS levam bandeira
 * (país da fonte em espanhol ou ISO-2), com nacionalidades curadas por nome.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */

/** O RFEGolf devolve o país por extenso em espanhol ("ESPAÑA", "PORTUGAL").
 *  Convertemos para código ISO-2 para a função flag() (que aceita ISO/EN/PT). */
export const ES_COUNTRY_CODE: Record<string, string> = {
  "ESPANA": "ES", "ESPAÑA": "ES", "PORTUGAL": "PT", "FRANCIA": "FR", "ITALIA": "IT",
  "ALEMANIA": "DE", "INGLATERRA": "GB", "ESCOCIA": "GB", "GALES": "GB", "REINO UNIDO": "GB",
  "IRLANDA": "IE", "BELGICA": "BE", "BÉLGICA": "BE", "HOLANDA": "NL", "PAISES BAJOS": "NL",
  "SUECIA": "SE", "SUIZA": "CH", "POLONIA": "PL", "CHINA": "CN", "REPUBLICA CHECA": "CZ",
  "REPÚBLICA CHECA": "CZ", "DINAMARCA": "DK", "NORUEGA": "NO", "FINLANDIA": "FI",
  "AUSTRIA": "AT", "ESTADOS UNIDOS": "US", "MARRUECOS": "MA", "ANDORRA": "AD",
  "LUXEMBURGO": "LU", "RUSIA": "RU", "MEXICO": "MX", "MÉXICO": "MX", "ARGENTINA": "AR",
  "BRASIL": "BR", "JAPON": "JP", "JAPÓN": "JP", "COREA DEL SUR": "KR", "AUSTRALIA": "AU",
  "CANADA": "CA", "CANADÁ": "CA", "SUDAFRICA": "ZA", "SUDÁFRICA": "ZA",
  // América Latina (frequentes na RFEG)
  "PARAGUAY": "PY", "URUGUAY": "UY", "CHILE": "CL", "COLOMBIA": "CO", "PERU": "PE",
  "PERÚ": "PE", "VENEZUELA": "VE", "ECUADOR": "EC", "BOLIVIA": "BO", "CUBA": "CU",
  "COSTA RICA": "CR", "GUATEMALA": "GT", "PANAMA": "PA", "PANAMÁ": "PA",
  "REPUBLICA DOMINICANA": "DO", "REPÚBLICA DOMINICANA": "DO", "HONDURAS": "HN",
  "EL SALVADOR": "SV", "NICARAGUA": "NI",
};

/** País a mostrar como BANDEIRA na página de Espanha — só ESTRANGEIROS com país
 *  CONHECIDO. Estamos no circuito espanhol: os espanhóis são o default e NÃO levam
 *  bandeira; destaca-se apenas quem NÃO é espanhol (o inverso do habitual).
 *  ⚠ Só emite bandeira para nomes de país RECONHECIDOS em ES_COUNTRY_CODE. "EXTRANJERO"
 *  (estrangeiro sem país concreto) e valores não mapeados → SEM bandeira: a fonte RFEG
 *  marca "EXTRANJERO" mesmo a espanhóis de federações regionais (ex.: Xan Iribarne,
 *  Federación Vasca) — uma 🏳️ genérica seria enganadora. Estrangeiros genuínos cuja
 *  fonte não dá o país são marcados via RFEG_NAT_OVERRIDE (por nome). */
export function rfegForeignFlag(pais: string | null | undefined): string | undefined {
  if (!pais) return undefined;
  const raw = pais.trim().toUpperCase();
  // O LGS já nos dá o país em ISO-2 (ou "GB-ENG"), vindo da bandeira que a
  // própria fonte marca na linha; o microsite RFEG dá o nome por extenso em
  // espanhol. Aceitar os dois — só com a tabela de nomes, um "PT" não resolvia
  // e a lista de inscritos ficava sem bandeira nenhuma.
  if (/^[A-Z]{2}(-[A-Z]{3})?$/.test(raw)) return raw === "ES" ? undefined : raw;
  const code = ES_COUNTRY_CODE[raw];
  if (!code || code === "ES") return undefined;
  return code;
}

/** Nacionalidades CURADAS — a fonte RFEG é pouco fiável para estrangeiros: marca-os
 *  ora como "EXTRANJERO" (sem país), ora até como "ESPAÑA" (porque jogam com licença
 *  espanhola). Estes overrides, por nome normalizado (ver rfegNatNorm), têm prioridade
 *  sobre `pais`. Estender conforme se confirmem casos. */
export const RFEG_NAT_OVERRIDE: Record<string, string> = {
  // Irmãos russos: o RFEG marca-os EXTRANJERO/ESPAÑA (no Campeonato Nacional,
  // "EXTRANJERO" impede a atribuição do título) — mas são russos.
  "dmitrii elchaninov": "RU",
  "elchaninov nikita": "RU",
};
/** Normaliza um nome para chave de override: minúsculas, sem acentos, vírgula→espaço,
 *  e tokens ORDENADOS — assim casa independentemente da ordem ("ELCHANINOV , DMITRII"
 *  e "Dmitrii Elchaninov" dão a mesma chave). O primeiro nome mantém os irmãos
 *  distintos (Dmitrii ≠ Nikita). */
export function rfegNatNorm(name: string | null | undefined): string {
  return (name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
}
/** País de cada inscrito, por licença e por nome (`norm`, nas duas ordens que a
 *  fonte usa) — os resultados do PDF e do mitarjeta não trazem o país, as
 *  listas de inscritos sim. Ganha o 1.º país não vazio. */
export function rfegPaisLookup(
  inscritos: Record<string, unknown> | null | undefined,
  norm: (s: string) => string,
): (licencia: string | null | undefined, name: string | null | undefined) => string | null {
  const byLic = new Map<string, string>(), byName = new Map<string, string>();
  for (const list of Object.values(inscritos || {})) {
    if (!Array.isArray(list)) continue;
    for (const p of list as { name?: string | null; licencia?: string | null; pais?: string | null }[]) {
      if (!p?.pais) continue;
      const lic = (p.licencia || "").trim();
      if (lic && !byLic.has(lic)) byLic.set(lic, p.pais);
      if (p.name) { const k = norm(p.name); if (!byName.has(k)) byName.set(k, p.pais); }
    }
  }
  return (lic, name) => (lic && byLic.get(lic.trim())) || (name ? byName.get(norm(name)) : undefined) || null;
}

/** Bandeira a mostrar para um jogador na página de Espanha: override curado de
 *  nacionalidade primeiro, senão a regra geral (só estrangeiros levam bandeira). */
export function rfegPlayerFlag(name: string | null | undefined, pais: string | null | undefined): string | undefined {
  const ov = RFEG_NAT_OVERRIDE[rfegNatNorm(name)];
  if (ov) return ov;
  return rfegForeignFlag(pais);
}
