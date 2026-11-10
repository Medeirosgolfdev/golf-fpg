/**
 * src/utils/clubePais.ts — «clube» que é só o país (10/11/2026).
 *
 * Na USKids e nos torneios internacionais a coluna Clube traz o código do país
 * («IT», «GB-ENG»), às vezes já com a bandeira à frente («🇮🇹 IT»). As tabelas
 * de torneio (volta e Resumo) passam então a bandeira para antes do nome e
 * escondem a coluna — a mesma leitura estava copiada nas duas.
 */
import { flag } from "./flagUtils";

/** Tira a bandeira (emoji) do início: «🇮🇹 IT» → «IT». */
export function semBandeira(c?: string | null): string {
  return (c || "").replace(/^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*\s*/u, "").trim();
}

/** O «clube» é um código de país com bandeira conhecida («IT», «GB-ENG», «🇮🇹 IT»)? */
export function clubeEhPais(c?: string | null): boolean {
  const u = semBandeira(c).toUpperCase();
  return /^[A-Z]{2,3}(-[A-Z]{2,4})?$/.test(u) && flag(u) !== "🏳️";
}
