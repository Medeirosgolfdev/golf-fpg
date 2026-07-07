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
 * Mapeamento explícito de nomes alternativos → nome canónico do campo.
 * Match case-insensitive e tolerante a whitespace múltiplo (a key é normalizada
 * para lowercase + colapso de espaços antes do lookup).
 *
 * Adicionar aqui sempre que descobrirmos que dois nomes referem o mesmo
 * percurso físico. Verificado para "Aroeira Challenge" — 292 rondas em 91
 * jogadores entre Jul-2021 e Jan-2025, todas com par/SI/metros idênticos
 * ao "PGA Aroeira No.2" config antiga (rotação +12 aplicada automaticamente
 * por rotateAroeira2RecordIfNeeded).
 */
const COURSE_NAME_ALIASES: Record<string, string> = {
  // Nome FPG histórico até 19-Jan-2025; mesmo percurso físico do No.2 cfg antiga.
  "aroeira challenge": "PGA  Aroeira No.2",
  // Nomes históricos do PGA Aroeira No.1 (par[] = Cfg-NO1). Confirmado em 488
  // jogadores: 350 rondas "Pines Classic" (2021-2024) + 250 rondas "Aroeira I"
  // (2004-2024) com par idêntico ao No.1 actual (41 rondas Nov-2024+).
  "aroeira pines classic": "PGA  Aroeira No.1",
  "aroeira i": "PGA  Aroeira No.1",

  // ── Nomes legados / genéricos de campos PT (2026-06-13) ────────────────
  // Estes nomes apareciam como campos duplicados na CamposPage/Simulador,
  // separados dos combos canónicos do master-courses. Cada destino foi
  // confirmado por par[] idêntico (e, no caso do Pinheiros Altos, pela
  // nomenclatura oficial PT↔EN: Oliveiras=Olives, Pinheiros=Pines, Sobreiros=Corks).

  // Oceânico O'Connor (Amendoeira) → nome actual O'Connor Jnr Course (par exacto).
  "oceânico o'connor": "O'Connor Jnr Course",
  "oceanico o'connor": "O'Connor Jnr Course",

  // Morgado do Reguengo Golfe → Morgado Golf (par exacto).
  "morgado do reguengo golfe": "Morgado Golf",

  // Montebelo: nome genérico / "A-B" → combo Caramulo (1-18) (par exacto).
  "montebelo": "Montebelo Caramulo (1-18)",
  "montebelo a-b": "Montebelo Caramulo (1-18)",

  // Vila Sol: nomenclatura antiga sem o sufixo (10-27/19-9/1-18) → combos master.
  "vila sol (challenge / prestige)": "Vila Sol - Challenge / Prestige (10-27)",
  "vila sol (prestige / prime)": "Vila Sol - Prestige / Prime (19-9)",
  "vila sol (prime / challenge)": "Vila Sol - Prime / Challenge (1-18)",
  "vila sol 1 (prime / challenge)": "Vila Sol - Prime / Challenge (1-18)",

  // Pinheiros Altos: nomes PT dos nines → combos master (EN). Par exacto.
  "pinheiros altos": "Pinheiros Altos-Corks/Olives",
  "pinheiros altos-oliveiras/pinheiros": "Pinheiros Altos-Olives/Pines",
  "pinheiros altos-pinheiros/sobreiros": "Pinheiros Altos-Pines/Corks",

  // Penha Longa - Atlântico (combo North+South) → Atlantic Championship (par exacto).
  "penha longa - atlântico": "Penha Longa Atlantic Championship",
  "penha longa - atlantico": "Penha Longa Atlantic Championship",

  // Palmares: nome genérico → combo Lagos-Praia (o mais jogado).
  "palmares golf": "Palmares Golf Lagos - Praia",

  // ── Duplicados pipeline (nome cru da ronda) vs extraCourses (nome curado) ──
  // O nome cru com que a ronda chega (ex: "Golden Palm") é fundido com a
  // entrada rica do extraCourses ("Trump Doral - Golden Palm"). 2026-06-13.
  "golden palm": "Trump Doral - Golden Palm",
  "red tiger": "Trump Doral - Red Tiger",
  "silver fox": "Trump Doral - Silver Fox",
  "blue monster": "Trump Doral - Blue Monster",
  "golf du touquet la foret": "Le Touquet Golf Club - La Forêt",
  "golf du touquet - la mer": "Golf Du Touquet - La Mer",
  "golf du touquet la mer": "Golf Du Touquet - La Mer",

  // ── Variantes de nome do MESMO campo (typos / sufixos) ──
  "toya golf & country wroclaw": "Toya Golf & Country Club Wroclaw",
  "real club de golf el prat. barcelona": "Real Club de Golf El Prat",
  "sedgefleld country club - donald ross course": "Sedgefield Country Club",
  "glen golf course": "Glen Golf Club",
  "chantilly vineuil new": "Golf de Chantilly Parcours de Vineul",
  "vierumakki": "vierumaki golf club",
  "454golf du médoc": "Golf du Médoc",
  "pga catalunya resort, spain": "PGA Catalunya Resort",

  // ── NOVO 2026-07-07 — Paris Invitational (Golf Val d'Europe Disneyland) ──
  // Apenas para variantes de "GOLF VAL D'EUROPE" — NÃO fazer alias para "INTERNACIONAL"
  // porque esse é genérico para TODOS os torneios internacionais
  // Canónico = nome CURTO "Val d'Europe" (decisão 2026-07-07: o nome completo
  // "Golf Paris Val d'Europe Disneyland - RED/BLUE" é demasiado extenso nas
  // listagens). O campo em extraCourses.ts mantém o nome completo — o alias
  // longo→curto abaixo garante que ambos resolvem para a mesma chave.
  "golf val d'europe": "Val d'Europe",
  "golf val d´europe": "Val d'Europe",
  "golf val deurope": "Val d'Europe",
  "val d'europe": "Val d'Europe",
  "val d´europe": "Val d'Europe",
  "val deurope": "Val d'Europe",
  "golf paris val d'europe disneyland - red/blue": "Val d'Europe",
};

/* ── Resolução por par[] para nomes ambíguos ──────────────────────────── */
// "Aroeira II" foi historicamente usado para BOTH PGA Aroeira No.1 e No.2 —
// algumas rondas têm par do No.1, outras do No.2. Resolver caso a caso pelo
// par[] é a única forma de não perder nenhuma ronda.
const AROEIRA_PAR_TO_COURSE: Record<string, string> = {
  // Cfg 2 (No.2 antiga, pré-renumeração)
  "[4,5,4,5,3,4,4,3,4,4,5,3,4,3,4,4,4,5]": "PGA  Aroeira No.2",
  // Cfg 1 (No.2 nova, pós-renumeração 2025)
  "[4,3,4,4,4,5,4,5,4,5,3,4,4,3,4,4,5,3]": "PGA  Aroeira No.2",
  // Par único do PGA Aroeira No.1
  "[5,4,4,3,4,4,4,3,5,5,4,4,4,3,5,3,4,4]": "PGA  Aroeira No.1",
};

/** Nomes ambíguos cujo destino correcto se decide pelo par[] da ronda. */
const AMBIGUOUS_AROEIRA_NAMES = new Set(["aroeira ii"]);

/**
 * Resolve um nome ambíguo (ex: "Aroeira II") para o nome canónico correcto
 * comparando o `pars[]` da ronda contra os pars conhecidos dos campos Aroeira.
 *
 * Devolve `name` inalterado se:
 *   - O nome não está na lista ambígua
 *   - `pars` está em falta ou tem tamanho ≠ 18
 *   - O par[] não bate com nenhum padrão conhecido
 */
export function resolveAroeiraIIByPar(name: string, pars: number[] | null | undefined): string {
  if (!name || !AMBIGUOUS_AROEIRA_NAMES.has(aliasKey(name))) return name;
  if (!pars || pars.length !== 18) return name;
  return AROEIRA_PAR_TO_COURSE[JSON.stringify(pars)] || name;
}

/** Normaliza key para lookup em COURSE_NAME_ALIASES. */
function aliasKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/* ─────────────────────────────────────────────────────────────────────────
 * Santo da Serra — 3 nines (Machico/Desertas/Serras), cada um par 36.
 *
 * A FPG mistura as combinações 18H em buckets que não correspondem ao que
 * foi realmente jogado (e.g. `Serras-Machico` pode conter `Machico+Serras`,
 * `Serras+Machico` OU `Serras+Serras`). E rondas 9H ficam etiquetadas com
 * o nome de um nine mas o par[] mostra que jogaram outro.
 *
 * Resolvemos por par[] em runtime (loaders TS + pipeline Node), produzindo
 * buckets canónicos:
 *   9H  → "Santo da Serra - {Nine}"
 *   18H → "Santo da Serra - {A}+{B}"  (ordem alfabética, F9/B9 colapsados)
 *   18H → "Santo da Serra - Serras×2" (caso especial: jogou-se Serras 2×)
 * ───────────────────────────────────────────────────────────────────────── */
const SDS_NINES: Record<string, string> = {
  "[4,4,5,3,4,4,5,3,4]": "Machico",
  "[4,5,4,4,4,3,5,3,4]": "Desertas",
  "[5,4,4,4,3,4,4,3,5]": "Serras",
};
const SDS_BASE = "Santo da Serra";

function _identifyNine(parsArr9: number[]): string | null {
  if (!Array.isArray(parsArr9) || parsArr9.length !== 9) return null;
  return SDS_NINES[JSON.stringify(parsArr9)] || null;
}

/** Reconhece qualquer variante "Santo da Serra"/"Sto da Serra"/"S. da Serra". */
function isSantoDaSerraName(name: string | null | undefined): boolean {
  return /santo\s+da\s+serra|sto\.?\s+da\s+serra|s\.\s*da\s+serra/i.test(String(name || ""));
}

/**
 * Resolve o nome canónico de uma ronda no Santo da Serra pelo par[]:
 *   9H  → "Santo da Serra - {Nine}"
 *   18H → "Santo da Serra - {A}+{B}" ou "Santo da Serra - Serras×2"
 *
 * Devolve `name` inalterado se não é Santo da Serra ou par é desconhecido.
 */
export function resolveSantoDaSerraByPar(name: string, pars: number[] | null | undefined): string {
  if (!isSantoDaSerraName(name)) return name;
  if (!Array.isArray(pars)) return canonicalSantoDaSerraNameOnly(name);

  if (pars.length === 9) {
    const nine = _identifyNine(pars);
    return nine ? `${SDS_BASE} - ${nine}` : canonicalSantoDaSerraNameOnly(name);
  }

  if (pars.length === 18) {
    const f9 = _identifyNine(pars.slice(0, 9));
    const b9 = _identifyNine(pars.slice(9, 18));
    if (!f9 || !b9) return canonicalSantoDaSerraNameOnly(name);
    if (f9 === b9) return `${SDS_BASE} - ${f9}×2`;
    const [a, b] = [f9, b9].sort();
    return `${SDS_BASE} - ${a}+${b}`;
  }

  return canonicalSantoDaSerraNameOnly(name);
}

/**
 * Fallback para rondas Santo da Serra sem par[]: canoniza só pelo nome,
 * ordenando os nines alfabeticamente em 18H. Não consegue corrigir nines
 * mal-etiquetados em 9H.
 */
function canonicalSantoDaSerraNameOnly(name: string): string {
  if (!isSantoDaSerraName(name)) return name;
  const m = String(name).match(/-\s*([A-Za-zÀ-ÿ]+)\s*[-/]\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (m) {
    const a = m[1].trim();
    const b = m[2].trim();
    if (a.toLowerCase() === b.toLowerCase()) return `${SDS_BASE} - ${a}×2`;
    const [first, second] = [a, b].sort((x, y) => x.localeCompare(y, "pt"));
    return `${SDS_BASE} - ${first}+${second}`;
  }
  const m2 = String(name).match(/-\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (m2) return `${SDS_BASE} - ${m2[1].trim()}`;
  return name;
}

/**
 * Devolve o nome canónico do campo:
 *   1) Remove sufixos de torneio (CNJ FPG, CN, CNS).
 *   2) Faz lookup em COURSE_NAME_ALIASES para resolver nomes históricos.
 *
 * Devolve string vazia/null/undefined inalterada.
 */
export function canonicalCourseName<T extends string | null | undefined>(name: T): T {
  if (!name || typeof name !== "string") return name;
  let out: string = name;
  for (const re of SUFFIX_PATTERNS) {
    if (re.test(out)) {
      out = out.replace(re, "").trim();
      break;
    }
  }
  // Resolver alias histórico (ex: "Aroeira Challenge" → "PGA  Aroeira No.2")
  const alias = COURSE_NAME_ALIASES[aliasKey(out)];
  if (alias) out = alias;
  return (out as unknown as T);
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
