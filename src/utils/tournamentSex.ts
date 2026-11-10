/**
 * Sexo de uma prova a partir dos seus rótulos (tabLabel, escalão, nome) — a
 * ÚNICA regra do site (10/11/2026). Antes havia duas, ambas com `\bS\b` sobre o
 * nome inteiro: em JavaScript o `\b` só conhece letras ASCII, por isso «São»,
 * «S.» e «R.S.» contavam como Senhoras e «Mérito» como Homens — o «Torneio de
 * São Martinho» e a «Taça R.S. Yeatman» ficavam femininos e sumiam com o filtro
 * de sexo; no «Drive Challenge Madeira–S.Serra-Sub 14» o tee passava a Vermelhas.
 *
 * Regra: palavra inteira (Feminino, Senhoras, Raparigas, Ladies, Girls /
 * Masculino, Homens, Rapazes, Boys) em qualquer sítio; a letra solta (S/F →
 * F, H/M → M) só no FIM do rótulo («Sub-18 S», «Sub 14 H»). Na dúvida,
 * undefined — a FPG mistura M e F em muitas provas.
 */
const PALAVRA_F = /(?:^|[^\p{L}])(fem(?:inin[oa]s?)?|raparigas?|senhoras|ladies|girls)(?![\p{L}])/iu;
const PALAVRA_M = /(?:^|[^\p{L}])(mascul(?:in[oa]s?)?|rapazes?|homens|boys)(?![\p{L}])/iu;
const LETRA_NO_FIM = /(?:^|[\s\-–])([SFHM])\s*(?:\([^)]*\))?\s*$/;

function sexoDoRotulo(rotulo: string | null | undefined): "M" | "F" | undefined {
  const s = String(rotulo ?? "").trim();
  if (!s) return undefined;
  if (PALAVRA_F.test(s)) return "F";
  if (PALAVRA_M.test(s)) return "M";
  const m = LETRA_NO_FIM.exec(s);
  return m ? (m[1] === "S" || m[1] === "F" ? "F" : "M") : undefined;
}

/** O primeiro rótulo que disser o sexo ganha (dar do mais específico para o menos). */
export function sexoDaProva(...rotulos: (string | null | undefined)[]): "M" | "F" | undefined {
  for (const r of rotulos) {
    const s = sexoDoRotulo(r);
    if (s) return s;
  }
  return undefined;
}
