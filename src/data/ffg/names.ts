/**
 * names.ts — Nomes, países e escalões das fontes de França: «APELIDO Nome» →
 * «Nome Apelido», nacionalidade → bandeira, siglas de divisão FFG legíveis e o
 * escalão canónico do filtro da lista.
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { ffgEscalaoCanonico } from "../../utils/ffgEscalao";

/* ── Normalização de nome (FFGolf/GolfGenius usam "APELIDO(S) Nome") ────
 * O run INICIAL de tokens todo-em-CAPS é o apelido (pode ser composto):
 * "CASTRO FERREIRA Ricardo" → "Ricardo Castro Ferreira". Tratar só o 1º
 * token baralhava nomes de apelido duplo ("Ferreira Ricardo Castro"). */
export function normalizeName(raw: string): string {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const isCaps = (t: string) => t.length >= 2 && t === t.toUpperCase() && /^[A-ZÀ-Ý'-]+$/.test(t);
  let n = 0;
  while (n < parts.length && isCaps(parts[n])) n++;
  if (n === 0 || n === parts.length) return trimmed; // sem run em CAPS, ou nome inteiro em CAPS
  if (!parts.slice(0, n).some((t) => t.length >= 3)) return trimmed; // só iniciais/partículas
  const apelido = toTitleCase(parts.slice(0, n).join(" "));
  return `${parts.slice(n).join(" ")} ${apelido}`;
}

/* Normalize um apelido em CAPS para Title Case (ex: "MARCINIAK" → "Marciniak", "DE LOS RIOS" → "De Los Rios") */
export function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => part.match(/^[a-zà-ÿ]/) ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join("");
}

/* Construir nome canónico "Nome Apelido" para um FFG player.
 * Cruza com KIDS page: o KIDS usa "Nome Apelido" (ex: "Valentina Marciniak").
 * O FFG dá `nameNom: "MARCINIAK"` (caps) e `namePrenom: "Valentina"`. */
export function ffgPlayerName(p: { name?: string; nameNom?: string | null; namePrenom?: string | null }): string {
  if (p.namePrenom && p.nameNom) {
    const apelido = toTitleCase(p.nameNom.trim());
    return `${p.namePrenom.trim()} ${apelido}`;
  }
  return normalizeName(p.name || "");
}

/** País do jogador FFG para bandeira. Só o que a fonte dá — NUNCA inventar
 *  "FR" quando falta (mostrava estrangeiros como franceses e estragava o
 *  filtro 🇵🇹). "FRA" real do portal converte-se no código FR. Sem país → null. */
export function ffgCountry(p: { nationality?: string | null; flag?: string | null }): string | null {
  const c = p.nationality || p.flag || null;
  if (!c) return null;
  return c === "FRA" ? "FR" : c;
}

/* ── Legenda das siglas de divisão / categoria FFG ─────────────
   Tabela oficial (Vademecum, /ffg/info/categorias): Enfant ≤ U8 · Poucet U9-10 ·
   Poussin U11-12 · Benjamin U13-14 · Minime U15-16 · Cadet U17-18 · Junior U19-21.
   F = Filles (raparigas), G = Garçons (rapazes)
*/

/** Nome mostrado de uma divisão FFG — UMA só convenção (decisão da Mariana,
 *  22/10/2026): nome francês oficial + sexo + escalão português entre
 *  parênteses — «Benjamin Garçons (Sub 14)», «Poussin Filles (Sub 12)»,
 *  «Benjamins (Sub 14)» quando a divisão é mista. Antes misturava-se «Minime
 *  Filles» (sigla MF) com «Sub-12 Garçons» (sigla U12G). Sem idade → null. */
export function ffgCategoryLabel(raw: string): string | null {
  raw = raw.replace(/\bsub[\s-]*(\d+)/i, "U$1");
  const esc = ffgEscalaoCanonico(raw);
  const m = esc ? /^Sub-(\d+)(?:\s*\((.+)\))?$/.exec(esc) : null;
  if (!m) return null;
  const n = +m[1];
  const cat = m[2] || (n <= 8 ? "Enfant" : null);
  if (!cat) return null;
  const u = raw.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fem = /FILLE|GIRL|DAMES|\bF\b|\dF\b|^[A-Z]{1,3}F$|INES\b|CADETTES|^F\s*\//.test(u);
  const masc = /GAR[CÇ]ON|BOY|MESSIEURS|HOMMES|\bG\b|\dG\b|^[A-Z]{1,3}G$|^[HM]\s*\//.test(u);
  const sex = fem && !masc ? "Filles" : masc && !fem ? "Garçons" : null;
  return sex ? `${cat} ${sex} (Sub ${n})` : `${cat}s (Sub ${n})`;
}

/** Ordem dos separadores FFG: dos mais novos para os mais velhos, Garçons antes
 *  de Filles (mista entre os dois); sem escalão → no fim, pela ordem da fonte. */
export function ffgDivisionRank(label: string): number {
  const sub = /\(Sub (\d+)\)/.exec(label)?.[1];
  if (!sub) return 9999;
  return +sub * 10 + (/ Filles /.test(label) ? 2 : / Garçons /.test(label) ? 0 : 1);
}

export function divisionLabel(div: string): string {
  const cat = div ? ffgCategoryLabel(div) : null;
  if (cat) return cat;
  return divisionLabelRaw(div);
}

function divisionLabelRaw(div: string): string {
  if (!div) return "—";
  const u = div.trim().toUpperCase();
  const map: Record<string, string> = {
    BF: "Benjamin Filles", BG: "Benjamin Garçons",
    MF: "Minime Filles",   MG: "Minime Garçons",
    CF: "Cadet Filles",    CG: "Cadet Garçons",
    JF: "Junior Filles",   JG: "Junior Garçons",
    "U10F": "Sub-10 Filles", "U10G": "Sub-10 Garçons",
    "U12F": "Sub-12 Filles", "U12G": "Sub-12 Garçons",
    "U14F": "Sub-14 Filles", "U14G": "Sub-14 Garçons",
    "U16F": "Sub-16 Filles", "U16G": "Sub-16 Garçons",
    "U18F": "Sub-18 Filles", "U18G": "Sub-18 Garçons",
  };
  if (map[u]) return map[u];
  // Códigos do <select serieCpt> das páginas resultats (2026-07-02):
  // "BENG"/"BenF" (Benjamins), "MinG"/"MINF" (Minimes), "CADG" (Cadets),
  // "POUF" (Poussins), "H/U12"·"F/U10" (sexo/idade), "Messieurs"/"Dames".
  const hf = u.match(/^([HFDM])\s*\/\s*U(\d+)$/);
  if (hf) return `Sub-${hf[2]} ${hf[1] === "H" || hf[1] === "M" ? "Garçons" : "Filles"}`;
  const abbr = u.match(/^(POU|BEN|MIN|CAD|JUN)([FG])$/);
  if (abbr) {
    const cat = { POU: "Poussin", BEN: "Benjamin", MIN: "Minime", CAD: "Cadet", JUN: "Junior" }[abbr[1]]!;
    return `${cat} ${abbr[2] === "F" ? "Filles" : "Garçons"}`;
  }
  // Plurais franceses: feminino explícito ("BENJAMINES", "CADETTES") → Filles;
  // plural simples ("BENJAMINS", "MINIMES") pode ser misto → só a categoria.
  const pluralF = u.match(/^(POUSSIN|BENJAMIN|CADETT)ES$/);
  if (pluralF) {
    const cat = { POUSSIN: "Poussin", BENJAMIN: "Benjamin", CADETT: "Cadet" }[pluralF[1]]!;
    return `${cat} Filles`;
  }
  const pluralM = u.match(/^(POUSSINS|BENJAMINS|MINIMES|CADETS)$/);
  if (pluralM) return pluralM[1].charAt(0) + pluralM[1].slice(1).toLowerCase();
  const uOnly = u.match(/^U(\d+)$/);
  if (uOnly) return `Sub-${uOnly[1]}`;
  // Categorias longas vindas de inscritos PDFs ("U12 Fille", "BENJAMIN Garçon")
  return div
    .replace(/U(\d+)\s+Fille/i, "Sub-$1 Filles")
    .replace(/U(\d+)\s+Gar[çc]on/i, "Sub-$1 Garçons")
    .replace(/BENJAMIN(?:E)?\s+Fille/i, "Benjamin Filles")
    .replace(/BENJAMIN(?:E)?\s+Gar[çc]on/i, "Benjamin Garçons")
    .replace(/MINIM(?:E)?\s+Fille/i, "Minime Filles")
    .replace(/MINIM(?:E)?\s+Gar[çc]on/i, "Minime Garçons");
}


/** Escalões de um torneio: divisões + NOME (a idade FFG mora no nome quando as
 *  divisões só dizem o sexo). Junta ambas as fontes e dedup. */
export function ffgEscaloesOfTournament(name: string | undefined, labels: (string | null | undefined)[]): string[] {
  return ffgEscaloesOf([...labels, name]);
}

/** Escalões canónicos (dedup, sem nulls) de uma lista de labels de série. */
export function ffgEscaloesOf(labels: (string | null | undefined)[]): string[] {
  return [...new Set(labels.map(ffgEscalaoCanonico).filter((x): x is string => !!x))];
}

