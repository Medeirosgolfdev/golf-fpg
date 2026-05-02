/**
 * courseAliases.ts — Normalização de nomes de campo
 *
 * A FPG ocasionalmente publica nomes de campo com sufixos específicos do
 * torneio (ex: "PGA Aroeira No.2 - CNJ FPG" para o Campeonato Nacional Jovens).
 * Sem normalização, esses sufixos fazem com que rondas do mesmo campo apareçam
 * agrupadas separadamente na CamposPage e na sidebar de campos da JogadoresPage.
 *
 * Esta função canoniza o nome para o nome usado em `master-courses.json`,
 * unificando o histórico do campo.
 *
 * Adicionar novos aliases sempre que a FPG inventar uma variante. O matching é
 * por regex — preserva o radical do nome e remove só o sufixo.
 *
 * Exemplos:
 *   "PGA  Aroeira No.2 - CNJ FPG"  → "PGA  Aroeira No.2"
 *   "PGA Aroeira No.2 — CNJ FPG"   → "PGA  Aroeira No.2"  (en-dash variant)
 *   "Quinta do Lago South - CN"    → "Quinta do Lago South"  (hipotético)
 *
 * Usado em:
 *   - FPGPage `loadAllFiles` (normaliza ao carregar pull-torneios*.json)
 *   - KIDSdataLoader `processPullTorneios` (idem)
 *   - Qualquer outro loader que leia dados do scrape FPG
 */

/**
 * Sufixos comuns que a FPG adiciona ao nome do campo durante torneios e que
 * queremos remover para unificar agrupamento.
 *
 * Cada padrão é tentado sequencialmente. O primeiro que casa é aplicado.
 */
const SUFFIX_PATTERNS: RegExp[] = [
  // " - CNJ FPG", " — CNJ FPG", "- CNJ" (Campeonato Nacional Jovens)
  /\s*[-–—]\s*CNJ(?:\s+FPG)?\s*$/i,
  // " - CN FPG", " - CN" (Campeonato Nacional adulto)
  /\s*[-–—]\s*CN(?:\s+FPG)?\s*$/i,
  // " - CNS FPG", " - CNS" (Campeonato Nacional Seniores)
  /\s*[-–—]\s*CNS(?:\s+FPG)?\s*$/i,
];

/**
 * Devolve o nome canónico do campo, removendo sufixos específicos de torneio.
 *
 * Devolve a string vazia/null/undefined inalterada.
 */
export function canonicalCourseName<T extends string | null | undefined>(name: T): T {
  if (!name || typeof name !== "string") return name;
  let out = name;
  for (const re of SUFFIX_PATTERNS) {
    if (re.test(out)) {
      out = out.replace(re, "").trim();
      break;
    }
  }
  return (out as T);
}

/**
 * Normaliza in-place todos os campos textuais relacionados com o nome do campo
 * num registo de torneio (formato pull-torneios). Mutates input.
 *
 * Aplica a:
 *   - t.campo
 *   - t.players[].course
 *   - t.players[].roundScores[].course
 */
export function normalizeTournamentCourseNames(t: {
  campo?: string;
  players?: Array<{
    course?: string;
    roundScores?: Array<{ course?: string }>;
  }>;
}): void {
  if (t.campo) t.campo = canonicalCourseName(t.campo);
  for (const p of t.players || []) {
    if (p.course) p.course = canonicalCourseName(p.course);
    for (const r of p.roundScores || []) {
      if (r.course) r.course = canonicalCourseName(r.course);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PGA Aroeira No.2 — renumeração de buracos (15 Fev → ~22 Nov 2025)
// ─────────────────────────────────────────────────────────────────────────────
//
// O Aroeira No.2 foi reconfigurado em algum ponto entre 15/Fev/2025 e 22/Nov/2025.
// O que era o BURACO 1 da config antiga é agora o BURACO 7 da config nova
// (deslocamento de +6 com wrap-around).
//
// Algumas rondas continuam a vir da FPG na sequência ANTIGA (notavelmente o
// Campeonato Nacional Jovens de 30 Abr / 1 Mai 2026, marcado pela FPG com
// "PGA Aroeira No.2 - CNJ FPG"). Para que o histórico fique alinhado com a
// numeração actual, rotacionamos esses arrays +12 posições:
//
//   newArr[i] = oldArr[(i + 12) % 18]
//   ⟺ newArr = oldArr.slice(12).concat(oldArr.slice(0, 12))
//
// Verificado matematicamente:
//   - par antiga rodada +12 = par nova (18/18 ✓)
//   - SI antiga rodada +12 = SI nova (18/18 ✓)
//   - metros antiga rodada +12 = metros nova, mesmo tee AMARELAS (18/18 ao metro ✓)
//
// Detecção: a config antiga começa por par 4-5-4-5-3-4 (par 18 = 5).
// A config nova começa por 4-3-4-4-4-5 (par 18 = 3).

/** Padrão de pars da config ANTIGA do PGA Aroeira No.2 */
const AROEIRA2_OLD_PAR = [4, 5, 4, 5, 3, 4, 4, 3, 4, 4, 5, 3, 4, 3, 4, 4, 4, 5];

/** Roda um array N posições para a esquerda (wrap-around). */
function rotateLeft<T>(arr: T[], n: number): T[] {
  if (!arr || arr.length !== 18) return arr;
  return arr.slice(n).concat(arr.slice(0, n));
}

/**
 * Detecta se uma ronda do Aroeira No.2 está na sequência antiga e, se sim,
 * rotaciona +12 todos os arrays paralelos (scores, pars, si, meters) e
 * marca a ronda com `_rotated: 12`.
 *
 * Mutates input. Idempotente: chamar duas vezes não duplica a rotação
 * (porque depois da primeira rotação o pars deixa de bater AROEIRA2_OLD_PAR).
 *
 * Devolve `true` se rotação foi aplicada, `false` caso contrário.
 */
export function rotateAroeira2RoundIfNeeded(round: {
  pars?: number[];
  scores?: number[];
  si?: number[];
  meters?: number[];
  _rotated?: number;
  course?: string;
}): boolean {
  const pars = round?.pars;
  if (!pars || pars.length !== 18) return false;
  // Match exacto contra a config antiga
  for (let i = 0; i < 18; i++) {
    if (pars[i] !== AROEIRA2_OLD_PAR[i]) return false;
  }
  // Rotacionar todos os arrays paralelos
  round.pars = rotateLeft(round.pars!, 12);
  if (round.scores && round.scores.length === 18) round.scores = rotateLeft(round.scores, 12);
  if (round.si && round.si.length === 18) round.si = rotateLeft(round.si, 12);
  if (round.meters && round.meters.length === 18) round.meters = rotateLeft(round.meters, 12);
  round._rotated = 12;
  return true;
}

/**
 * Versão para o formato `HOLES` do `playerDataLoader` (campos curtos: g/p/si/m).
 * Mutates input. Idempotente. Devolve `true` se rotação foi aplicada.
 */
export function rotateAroeira2HolesIfNeeded(holes: {
  g?: (number | null)[];
  p?: (number | null)[];
  si?: (number | null)[];
  m?: (number | null)[];
  _rotated?: number;
}): boolean {
  const p = holes?.p;
  if (!p || p.length !== 18) return false;
  for (let i = 0; i < 18; i++) {
    if (p[i] !== AROEIRA2_OLD_PAR[i]) return false;
  }
  holes.p = rotateLeft(holes.p!, 12);
  if (holes.g && holes.g.length === 18) holes.g = rotateLeft(holes.g, 12);
  if (holes.si && holes.si.length === 18) holes.si = rotateLeft(holes.si, 12);
  if (holes.m && holes.m.length === 18) holes.m = rotateLeft(holes.m, 12);
  holes._rotated = 12;
  return true;
}

/**
 * Versão para o formato `Scorecard` da FPG (campos indexados par_1..par_18,
 * gross_1..gross_18, meters_1..meters_18, stroke_index_1..stroke_index_18).
 * Mutates input. Idempotente. Devolve `true` se rotação aplicada.
 *
 * Após rotação, marca `sc._rotated = 12` para a UI poder mostrar a nota.
 */
export function rotateAroeira2ScorecardIfNeeded(sc: Record<string, unknown>): boolean {
  // Construir array de pars 1..18
  const pars: number[] = [];
  for (let i = 1; i <= 18; i++) {
    const v = sc[`par_${i}`];
    if (typeof v !== "number" && typeof v !== "string") return false;
    pars.push(Number(v));
  }
  if (pars.length !== 18) return false;
  for (let i = 0; i < 18; i++) {
    if (pars[i] !== AROEIRA2_OLD_PAR[i]) return false;
  }
  // Rotacionar 4 séries paralelas
  const fields = ["par", "gross", "meters", "stroke_index"];
  for (const f of fields) {
    const arr: unknown[] = [];
    for (let i = 1; i <= 18; i++) arr.push(sc[`${f}_${i}`]);
    if (arr.every(v => v == null)) continue; // série não presente
    const rot = arr.slice(12).concat(arr.slice(0, 12));
    for (let i = 0; i < 18; i++) sc[`${f}_${i + 1}`] = rot[i];
  }
  // Também rotacionar net_1..net_18 e stbnet_1..stbnet_18 e bogey_1..bogey_18 e stbgross_1..stbgross_18 se existirem
  const optFields = ["net", "stbnet", "stbgross", "bogey"];
  for (const f of optFields) {
    const arr: unknown[] = [];
    let any = false;
    for (let i = 1; i <= 18; i++) {
      const v = sc[`${f}_${i}`];
      if (v != null) any = true;
      arr.push(v);
    }
    if (!any) continue;
    const rot = arr.slice(12).concat(arr.slice(0, 12));
    for (let i = 0; i < 18; i++) sc[`${f}_${i + 1}`] = rot[i];
  }
  sc._rotated = 12;
  return true;
}

/**
 * Aplica `rotateAroeira2RoundIfNeeded` a todos os scorecards de um torneio
 * cujo campo seja "PGA Aroeira No.2" (após canonicalCourseName). Mutates input.
 *
 * Devolve o nº de rondas rotacionadas.
 */
export function rotateAroeira2TournamentIfNeeded(t: {
  campo?: string;
  players?: Array<{
    course?: string;
    roundScores?: Array<{
      pars?: number[];
      scores?: number[];
      si?: number[];
      meters?: number[];
      _rotated?: number;
      course?: string;
    }>;
  }>;
}): number {
  let n = 0;
  const matchesAroeira2 = (s?: string) =>
    !!s && /^PGA\s+Aroeira\s+No\.?\s*2$/i.test(canonicalCourseName(s) || "");
  if (!matchesAroeira2(t.campo)) return 0;
  for (const p of t.players || []) {
    // Saltar jogadores que noutra fonte foram marcados como No.1 (ex: R2 do
    // Aroeira Master 2025 com pars de outro layout, marcados via r.course).
    for (const r of p.roundScores || []) {
      if (r.course && /no\.?\s*1/i.test(r.course)) continue;
      if (rotateAroeira2RoundIfNeeded(r)) n++;
    }
  }
  return n;
}
