/**
 * src/data/model/escalao.ts — TABELA ÚNICA de escalões: o nome canónico de
 * cada escalão e os sinónimos com que as fontes o escrevem.
 *
 * O mesmo escalão aparecia escrito de várias formas («Sub 10», «Sub-10»,
 * «U10», «S10», «Benjamín», «Sub-10 (Poucet)», «10 and Under»…) e o filtro
 * «Escalão» do CircuitShell mostrava-as todas. Aqui fica a regra única:
 *
 *  - **Sub N** (até N anos no ano da prova) — «Sub N», «Sub-N», «SubN», «SN»,
 *    «UN», «U-N», «Under N», «N & Under», «N&U», «NU», «N/Under», «N and
 *    Under»; com ou sem sexo à frente/atrás («Boys U12», «Under 12 Girls»).
 *  - **Nomes de categoria** com equivalência no código (`SUB_TO_ES_TERM` da
 *    PillBadge e `FFG_ESC_ORDER` de utils/ffgEscalao): Benjamín/Benjamim → Sub
 *    10, Alevín/Alevim → Sub 12, Infantil → Sub 14, Cadete → Sub 16, Poucet →
 *    Sub 10, Poussin → Sub 12, Minime → Sub 16. Os nomes que mudam de país
 *    para país só com a fonte: «Benjamin» (FR Sub 14 · ES Sub 10), «Junior»
 *    (FR Sub 21 · ES Sub 18), «Juvenil» (ES Sub 21), «Cadet» (FR Sub 18).
 *  - **Idade ou intervalo de idades** (USKids, MAJOR) — «Boys 10» → «10 anos»,
 *    «Boys 13-14», «13 & 14», «Varonil 10-11» → «13-14 anos».
 *  - **Adultos** — Absoluto (também «All Ages» do WAGR), Seniores, Mid-Amateur, Adultos.
 *  - **Dois escalões num só** («U18 & U16», «U21&U16», «Sub 10 e 12», «Sub
 *    10/12») → `escaloesCanon` devolve os dois.
 *  - O que não se reconhece fica como veio (sem espaços a mais) — não se
 *    inventa escalão. Vazio, «—» e «Todos» → nenhum.
 *
 * ⚠ Fase 0: a tabela existe e tem testes, mas AINDA NÃO está ligada ao filtro
 * do CircuitShell (isso muda o ecrã — decisão da Mariana).
 */

/** Fonte do nome, para os nomes de categoria que mudam de país para país. */
export type EscalaoSource = "fpg" | "ffg" | "es" | "uskids";

/** Escalões de adultos (canónico ← sinónimos, sem acentos e em minúsculas). */
const ADULTOS: [string, RegExp][] = [
  ["Absoluto", /^(absolut[oa]s?|all ages)$/],
  ["Seniores", /^(s[eé]nior(es|s)?|veteran(os|s)?)$/],
  ["Mid-Amateur", /^mid[\s-]?am(ateur)?s?$/],
  ["Adultos", /^(adultos?|adultes?)$/],
];

/** Nomes de categoria → idade máxima. Sem fonte, os ambíguos ficam como estão. */
const NOMES: Record<string, number> = {
  benjamim: 10, alevim: 12, alevin: 12, alevi: 12, infantil: 14, cadete: 16,
  poucet: 10, poussin: 12, minime: 16,
};
const NOMES_FONTE: Record<EscalaoSource, Record<string, number>> = {
  es: { benjamin: 10, benjami: 10, junior: 18, juvenil: 21 },
  // FFG: também no plural e no feminino («Benjamins», «Benjamines», «Cadettes»).
  ffg: {
    benjamin: 14, benjamins: 14, benjamine: 14, benjamines: 14, cadet: 18, cadets: 18, cadette: 18, cadettes: 18,
    junior: 21, juniors: 21, poucets: 10, poucette: 10, poucettes: 10, poussins: 12, poussine: 12, poussines: 12, minimes: 16,
  },
  fpg: {},
  uskids: {},
};

/** Palavras de sexo que se tiram antes de ler o escalão (o sexo tem filtro próprio). */
const SEXO_RE = /\b(boys?|girls?|rapaz(es)?|raparigas?|varonil|femenil|gar[cç]ons?|filles?|masculin[oa]?|feminin[oa]?|mas|fem|men|women|messieurs|dames|homens|senhoras|m|f|h)\b/g;

const sub = (n: number) => `Sub ${n}`;

/** Forma de comparação: minúsculas, sem acentos, sem «Division»/parênteses. */
function clean(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\(([^)]*)\)/g, " ").replace(/\bdivision\b/g, " ").replace(/\s+/g, " ").trim();
}

/** Um só escalão (sem «&»/«e»/«/» a juntar dois). null = não reconhecido. */
function canonOne(s: string, source?: EscalaoSource): string | null {
  const t = s.replace(SEXO_RE, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let m: RegExpExecArray | null;
  // Sub N / S N / U N / Under N
  if ((m = /^(?:sub|s|u|under)[\s-]?(\d{1,2})$/.exec(t))) return sub(+m[1]);
  // N & Under / N&U / NU / N/Under / N and Under
  if ((m = /^(\d{1,2})\s*(?:&\s*under|&\s*u|u|\/\s*under|and under|e menos)$/.exec(t))) return sub(+m[1]);
  // Intervalo «13-14», «13 & 14», «13 a 14»
  if ((m = /^(\d{1,2})\s*(?:-|–|&|a|to)\s*(\d{1,2})$/.exec(t))) return `${+m[1]}-${+m[2]} anos`;
  // Idade única «10» (USKids «Boys 10», México «Varonil 15»)
  if ((m = /^(\d{1,2})$/.exec(t))) return `${+m[1]} anos`;
  for (const [canon, re] of ADULTOS) if (re.test(t)) return canon;
  const k = t.replace(/[\s-]/g, "");
  if (NOMES[k] != null) return sub(NOMES[k]);
  if (source && NOMES_FONTE[source][k] != null) return sub(NOMES_FONTE[source][k]);
  if (k === "junior") return "Júnior";
  return null;
}

/** Os escalões canónicos de um nome (dois quando o nome junta dois:
 *  «U18 & U16» → [Sub 16, Sub 18]). Vazio = sem escalão. */
export function escaloesCanon(raw: string | null | undefined, source?: EscalaoSource): string[] {
  const s = String(raw ?? "").trim();
  if (!s || /^[—–-]+$/.test(s) || /^todos$/i.test(s)) return [];
  const c = clean(s);
  // «Benjamín»/«Juvenil» com acento espanhol (í) são de Espanha mesmo sem fonte.
  if (!source && /í/i.test(s)) source = "es";
  const one = canonOne(c, source);
  if (one) return [one];
  // «Sub 10 e 12», «Sub 10/12», «Sub 14 a 24»: o prefixo vale para os dois.
  const m = /^(sub|s|u)[\s-]?(\d{1,2})\s*(?:e|\/|a|&)\s*(?:\1[\s-]?)?(\d{1,2})$/.exec(c.replace(SEXO_RE, " ").replace(/\s+/g, " ").trim());
  if (m) return sortEscaloes([sub(+m[2]), sub(+m[3])]);
  // «U18 & U16», «U21&U16», «Sub 21 + Sub 16»
  const parts = c.split(/\s*(?:&|\+|\/|\be\b)\s*/).filter(Boolean);
  if (parts.length > 1) {
    const all = parts.map((p) => canonOne(p, source));
    if (all.every((x): x is string => !!x)) return sortEscaloes([...new Set(all)]);
  }
  return [s.replace(/\s+/g, " ")];
}

/** O escalão canónico de um nome (o primeiro quando junta dois; null = sem
 *  escalão). Ver `escaloesCanon`. */
export function escalaoCanon(raw: string | null | undefined, source?: EscalaoSource): string | null {
  return escaloesCanon(raw, source)[0] ?? null;
}

/** Sexo que o nome do escalão traz («Boys 10» → M, «Under 12 Girls» → F). */
export function escalaoSex(raw: string | null | undefined): "M" | "F" | null {
  const c = clean(String(raw ?? ""));
  if (/\b(boys?|rapaz(es)?|varonil|gar[cç]ons?|masculin[oa]?|messieurs|homens|men)\b/.test(c)) return "M";
  if (/\b(girls?|raparigas?|femenil|filles?|feminin[oa]?|dames|senhoras|women)\b/.test(c)) return "F";
  return null;
}

/** Ordem de apresentação: Sub N pela idade, depois idades/intervalos, depois
 *  adultos e o resto por ordem alfabética. */
export function escalaoOrder(canon: string): [number, number, string] {
  let m = /^Sub (\d+)$/.exec(canon);
  if (m) return [0, +m[1], ""];
  m = /^(\d+)(?:-(\d+))? anos$/.exec(canon);
  if (m) return [1, +m[1] * 100 + +(m[2] ?? m[1]), ""];
  const a = ADULTOS.findIndex(([c]) => c === canon);
  if (a >= 0) return [2, a, ""];
  return [3, 0, canon];
}

/** Ordena escalões canónicos (ver `escalaoOrder`). */
export function sortEscaloes(list: string[]): string[] {
  return [...list].sort((x, y) => {
    const a = escalaoOrder(x), b = escalaoOrder(y);
    return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
  });
}

/** As opções que o filtro «Escalão» teria com a tabela ligada: os escalões
 *  canónicos de todos os nomes, sem repetidos, por ordem. */
export function escalaoFilterOptions(names: readonly (string | null | undefined)[], source?: EscalaoSource): string[] {
  return sortEscaloes([...new Set(names.flatMap((n) => escaloesCanon(n, source)))]);
}
