/**
 * src/utils/extraTid.ts — ler um «tid» dos torneios de fora da USKids que o Kids
 * acompanha (WJGC, FCG, JWGC, Doral, EOWAGR): família, ano e escalão. Um só
 * sítio (10/11/2026) — havia três cópias desta leitura no FieldRivaisDashboard
 * (colunas, menu dos Próximos torneios, aba «Scores») e as três erravam de
 * maneira diferente: o ano caía no ano corrente quando o código não o trazia
 * (`wjgc-brjgt243_boys_10-11`, de 2024, aparecia «WJGC 2026»), o escalão do
 * formato longo (`_boys_10-11`) ficava «Geral», e o FCG e o JWGC — que vivem
 * debaixo do prefixo `wjgc-` — eram rotulados «WJGC».
 *
 * Formatos de tid (ver `src/data/kidsTid.ts`):
 *   antigos   "wjgc26", "wjgc26_1213", "wjgc25_b89", "doral25_b1011", "eowagr25_b910"
 *   canónicos "wjgc-brjgt251_boys_12-13", "wjgc-fcg268_girls_9-10",
 *             "wjgc-jwgc261_boys_11-12", "eowagr-eowagr25_contest109"
 */

export const EXTRA_FAMILIAS = ["WJGC", "FCG", "JWGC", "Doral", "EOWAGR"] as const;
export type ExtraFamilia = (typeof EXTRA_FAMILIAS)[number];

/** Família do torneio. O prefixo `wjgc-` é só o guarda-chuva do loader: por
 *  baixo vivem o Daily Mail WJGC (brjgt), o FCG Callaway e o Uswing Mojing (jwgc). */
export function extraTidFamilia(tid: string): ExtraFamilia | null {
  if (/^wjgc-fcg/.test(tid)) return "FCG";
  if (/^wjgc-jwgc/.test(tid)) return "JWGC";
  if (tid.startsWith("wjgc")) return "WJGC";
  if (tid.startsWith("doral")) return "Doral";
  if (tid.startsWith("eowagr")) return "EOWAGR";
  return null;
}

/**
 * Ano da prova. Manda a data do canónico (`dataIso`); sem ela, o ano escrito no
 * código (`_2025_`, `wjgc26`, `doral25`). O número do evento BlueGolf NÃO serve
 * (`brjgt2537` é o WJGC de 2026) — sem data nem ano no código fica null, nunca
 * o ano corrente.
 */
export function extraTidAno(tid: string, dataIso?: string | null): number | null {
  const d = /^(\d{4})-\d{2}/.exec(dataIso ?? "");
  if (d) return parseInt(d[1], 10);
  const y4 = /(?:^|[_-])(20\d{2})(?:[_-]|$)/.exec(tid);
  if (y4) return parseInt(y4[1], 10);
  const y2 = /(?:wjgc|doral|eowagr)(\d{2})(?:[_-]|$)/.exec(tid);
  return y2 ? 2000 + parseInt(y2[1], 10) : null;
}

const fim = "(?:[_-]|$)";

/** Escalão escrito num rótulo de flight ou no fim do nome da prova
 *  («… - 10-11 Boys», «Girls 7-8 LTQ», «Boys 7&Under», «6/Under LTQ»). */
function escalaoDoRotulo(rotulo: string | null | undefined): string | null {
  const s = (rotulo ?? "").split(" - ").pop()!.trim();
  if (!s) return null;
  const sexo = /girl/i.test(s) ? "Girls " : /boy/i.test(s) ? "Boys " : "";
  const faixa = /(\d{1,2})\s*-\s*(\d{1,2})/.exec(s);
  if (faixa) return `${sexo}${faixa[1]}-${faixa[2]}`;
  const under = /(\d{1,2})\s*(?:&|\/|and)?\s*under/i.exec(s);
  if (under) return `${sexo}U${under[1]}`;
  if (sexo && /\bwagr\b/i.test(s)) return `${sexo}13-18`;
  return null;
}

/**
 * Escalão de um tid, no formato que o `escalaoMatches` do Kids sabe comparar
 * («Boys 10-11», «Girls 12-13», «Boys U7»; a divisão WAGR — aberta, na prática
 * 13+ — conta como «13-18»). Primeiro o código; sem escalão no código, os
 * `rotulos` (rótulo do flight, nome da prova) pela ordem dada; senão «Geral».
 */
export function extraTidEscalao(tid: string, ...rotulos: (string | null | undefined)[]): string {
  const sexo = /_girls?_|_g(?:\d|wagr)/.test(tid) ? "Girls" : "Boys";
  const longo = new RegExp(`_(?:boys|girls)_(\\d{1,2})-(\\d{1,2})${fim}`).exec(tid);
  if (longo) return `${sexo} ${longo[1]}-${longo[2]}`;
  if (new RegExp(`_(?:(?:boys|girls)_7under|[bg]7u)${fim}`).test(tid)) return `${sexo} U7`;
  if (new RegExp(`_(?:(?:boys|girls)_|[bg])wagr${fim}`).test(tid)) return `${sexo} 13-18`;
  // Compacto: "_b89", "_b910", "_b1011" (⚠ os dígitos colados ao b/g — senão
  // apanhava o ano de "wjgc-wjgc_2025_b1011").
  const cmp = new RegExp(`_[bg](\\d{1,4})${fim}`).exec(tid);
  if (cmp) {
    const a = cmp[1];
    if (a.length === 4) return `${sexo} ${a.slice(0, 2)}-${a.slice(2)}`;
    if (a.length === 3) return `${sexo} ${a[0]}-${a.slice(1)}`;
    if (a.length === 2) return `${sexo} ${a[0]}-${a[1]}`;
    return `${sexo} ${a}`;
  }
  const semLetra = new RegExp(`_(1213|1011|89)${fim}`).exec(tid);
  if (semLetra) return semLetra[1] === "89" ? "Boys 8-9" : `Boys ${semLetra[1].slice(0, 2)}-${semLetra[1].slice(2)}`;
  if (/^wjgc\d{2}$/.test(tid)) return "Boys 10-11";
  for (const r of rotulos) {
    const e = escalaoDoRotulo(r);
    if (e) return e;
  }
  return "Geral";
}

/** Nome do escalão para mostrar: o do `extraTidEscalao`, com a divisão WAGR pelo nome. */
export function extraTidEscalaoNome(tid: string, ...rotulos: (string | null | undefined)[]): string {
  if (new RegExp(`_(?:(?:boys|girls)_|[bg])wagr${fim}`).test(tid)) return /_g(?:irls_)?wagr/.test(tid) ? "Girls WAGR" : "Boys WAGR";
  return extraTidEscalao(tid, ...rotulos);
}
