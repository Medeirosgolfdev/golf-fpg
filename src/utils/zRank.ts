/**
 * src/utils/zRank.ts — z-score médio de um jogador ao longo de VÁRIOS torneios
 * (10/11/2026).
 *
 * O `getAvgZ` (mathUtils) compara todas as voltas com UMA média/desvio; numa
 * matriz de torneios cada volta tem a sua (a do field dessa volta nesse
 * torneio) e cada torneio o seu peso de prestígio. A matriz de rivais chamava o
 * `getAvgZ` sem estatísticas e recebia sempre null: o rank não ordenava nada.
 *
 * Só tipos e funções puras; a regra «sem cartão» é a de utils/classificacao.
 */
import { temCartao } from "./classificacao";

type Stats = { m: number; s: number } | null | undefined;

/**
 * Média ponderada dos z-scores das voltas: z = (pancadas − média da volta) /
 * desvio da volta, com o peso do torneio (1 quando não vem). Menor = melhor.
 * Voltas sem cartão (0, ≥ 900) e voltas sem estatística (ou desvio 0) não contam;
 * sem nenhuma volta que conte devolve null.
 */
export function avgZPonderado(
  resultados: Record<string, { rd?: readonly (number | null)[] | null } | undefined>,
  statsPorVolta: Record<string, readonly Stats[] | undefined>,
  pesos?: Record<string, number | undefined>,
): number | null {
  let soma = 0, somaPesos = 0;
  for (const [tid, res] of Object.entries(resultados)) {
    const stats = statsPorVolta[tid];
    if (!res?.rd || !stats) continue;
    const w = pesos?.[tid] ?? 1;
    if (!(w > 0)) continue;
    res.rd.forEach((g, i) => {
      const st = stats[i];
      if (!temCartao(g) || !st || !(st.s > 0)) return;
      soma += w * ((g - st.m) / st.s);
      somaPesos += w;
    });
  }
  return somaPesos > 0 ? soma / somaPesos : null;
}
