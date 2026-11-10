/**
 * hcpHistoryLoader.ts — Histórico compacto de HCP por jogador
 *
 * Carrega /data/hcp-history.json (gerado por scripts/enrich-players.js).
 * Formato no ficheiro: { [fed]: [[dayInt, hcp], ...] }, onde dayInt = ms/86400000
 * e hcp já vem filtrado (≤ 54, sem provisórios/lixo) e arredondado a 1 casa.
 *
 * Usado pela /jogadores-por-ano para a secção de análise de evolução de HCP.
 */
import { cachedFetchJson, invalidateCache, memoAsync } from "./fetchCache";

export type HcpPoint = { d: number; h: number }; // d em ms (epoch), h = índice
export type HcpHistoryDb = Record<string, HcpPoint[]>;

const MS_DAY = 86400000;

const URL_HCP_HISTORY = "/data/hcp-history.json";

/** Uma falha passageira (502, rede) devolve `{}` mas NÃO fica guardada — a
 *  chamada seguinte tenta outra vez (10/11/2026, `memoAsync`). */
const _load = memoAsync<HcpHistoryDb>(
  async () => {
    const raw = await cachedFetchJson<Record<string, [number, number][]>>(URL_HCP_HISTORY);
    if (!raw) {
      console.warn("hcp-history.json não encontrado — gráfico de evolução desactivado");
      return {};
    }
    const out: HcpHistoryDb = {};
    for (const fed in raw) {
      const arr = raw[fed];
      if (!Array.isArray(arr) || arr.length < 2) continue;
      out[fed] = arr
        .map(([day, h]) => ({ d: day * MS_DAY, h }))
        .filter(p => isFinite(p.d) && isFinite(p.h));
    }
    invalidateCache(URL_HCP_HISTORY); // o cru já não é preciso: fica só o convertido
    return out;
  },
  { fallback: (e) => { console.warn("Falha a carregar hcp-history.json:", e); return {}; } },
);

export function loadHcpHistory(): Promise<HcpHistoryDb> {
  return _load();
}
