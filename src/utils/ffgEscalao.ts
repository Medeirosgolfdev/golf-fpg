/**
 * ffgEscalao.ts — Escalão canónico FFG a partir de um label cru.
 *
 * Fonte ÚNICA da regra (era interna à FFGPage). Espelhada em Node por
 * `scripts/lib/ffg-escalao.cjs` — **manter as duas sincronizadas** (o teste
 * `scripts/ffg-escalao-mirror.test.js` falha se divergirem). Precedente:
 * `lib/course-aliases.cjs` ↔ `src/utils/courseAliases.ts`.
 *
 * Buckets pela equivalência oficial do Vademecum (ffg-categories-age.json):
 * Poucet=U9-10 · Poussin=U11-12 · Benjamin=U13-14 · Minime=U15-16 ·
 * Cadet=U17-18 · Junior=U19-21.
 */

/** Escalões do mais novo para o mais velho (ordem de comparação). */
export const FFG_ESC_ORDER = [
  "Sub-8",
  "Sub-10 (Poucet)",
  "Sub-12 (Poussin)",
  "Sub-14 (Benjamin)",
  "Sub-16 (Minime)",
  "Sub-18 (Cadet)",
  "Sub-21 (Junior)",
  "Adultos",
] as const;

/** Escalão canónico de um label cru (série, divisão ou NOME de torneio). */
export function ffgEscalaoCanonico(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const u = s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&#\d+;/g, "'");
  const bucket = (n: number): string =>
    n <= 8 ? "Sub-8" : n <= 10 ? "Sub-10 (Poucet)" : n <= 12 ? "Sub-12 (Poussin)"
    : n <= 14 ? "Sub-14 (Benjamin)" : n <= 16 ? "Sub-16 (Minime)"
    : n <= 18 ? "Sub-18 (Cadet)" : "Sub-21 (Junior)";
  // U-age explícito: "U12F", "U12 Filles", "H/U14", "U  12", "GARCONS U-12"
  const um = u.match(/(?:^|[^A-Z0-9])U[\s-]*(\d{1,2})(?![0-9])/);
  if (um) return bucket(+um[1]);
  if (/POUCET/.test(u)) return "Sub-10 (Poucet)";
  if (/\bPOU/.test(u)) return "Sub-12 (Poussin)";
  if (/\bBEN|BNJ|^B[GF]\b/.test(u)) return "Sub-14 (Benjamin)";
  if (/\bMIN|\bMI\b|MNIM|^M[GF]\b/.test(u)) return "Sub-16 (Minime)";
  if (/\bCAD/.test(u)) return "Sub-18 (Cadet)";
  if (/JUNIOR|\bJUN\b|^J[GF]\b/.test(u)) return "Sub-21 (Junior)";
  if (/ENFANT/.test(u)) return "Sub-8";
  // Limites por idade: "Joueurs jusqu'à 14 ans", "MOINS DE 15 ANS", "-13 ans"
  const am = u.match(/(?:JUSQU|MOINS|-)\D{0,8}?(\d{1,2})\s*ANS/);
  if (am) return bucket(+am[1]);
  // ⚠ Só marcadores GENUINAMENTE adultos. MESSIEURS/DAMES/HOMMES/FEMMES são
  // SEXO e "1ère Série" é NÍVEL de divisão — nenhum diz a idade. No portal FFG
  // as divisões de um torneio juvenil chamam-se "Messieurs"/"Dames"; a idade
  // vive no NOME ("U16 Filles"). Mapear sexo→"Adultos" rotulava 399 provas
  // juvenis como adultas. Sem sinal de idade → null (não se adivinha).
  if (/\bSENIOR|\bVETERAN|\bADULTE|MID[\s-]?AM/.test(u)) return "Adultos";
  return null;
}

/**
 * Escalão MAIS NOVO de uma lista (null se nenhum tiver sinal de idade).
 *
 * Um júnior pode inscrever-se ACIMA do seu escalão (o Xan Iribarne, U12, jogou
 * a "1re Division U16 Garçons") mas nunca abaixo — logo o mínimo dos escalões
 * de uma época é a categoria real dele, e o máximo seria enganador.
 * "Adultos" só ganha se não houver mais nada.
 */
export function ffgEscalaoMaisNovo(escaloes: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestIdx = Infinity;
  for (const e of escaloes) {
    if (!e) continue;
    const i = (FFG_ESC_ORDER as readonly string[]).indexOf(e);
    if (i >= 0 && i < bestIdx) { bestIdx = i; best = e; }
    else if (i < 0 && best === null) best = e; // escalão desconhecido: só como último recurso
  }
  return best;
}
