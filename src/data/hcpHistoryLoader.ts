/**
 * hcpHistoryLoader.ts — Histórico compacto de HCP por jogador
 *
 * Carrega /data/hcp-history.json (gerado por scripts/enrich-players.js).
 * Formato no ficheiro: { [fed]: [[dayInt, hcp], ...] }, onde dayInt = ms/86400000
 * e hcp já vem filtrado (≤ 54, sem provisórios/lixo) e arredondado a 1 casa.
 *
 * Usado pela /jogadores-por-ano para a secção de análise de evolução de HCP.
 */

export type HcpPoint = { d: number; h: number }; // d em ms (epoch), h = índice
export type HcpHistoryDb = Record<string, HcpPoint[]>;

const MS_DAY = 86400000;

let _cache: Promise<HcpHistoryDb> | null = null;

export async function loadHcpHistory(): Promise<HcpHistoryDb> {
  if (_cache) return _cache;
  _cache = (async () => {
    try {
      const resp = await fetch("/data/hcp-history.json");
      if (!resp.ok) {
        console.warn("hcp-history.json não encontrado — gráfico de evolução desactivado");
        return {};
      }
      let text = await resp.text();
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      text = text.replace(/\0+/g, ""); // null bytes de escrita truncada no Windows
      const raw = JSON.parse(text) as Record<string, [number, number][]>;
      const out: HcpHistoryDb = {};
      for (const fed in raw) {
        const arr = raw[fed];
        if (!Array.isArray(arr) || arr.length < 2) continue;
        out[fed] = arr
          .map(([day, h]) => ({ d: day * MS_DAY, h }))
          .filter(p => isFinite(p.d) && isFinite(p.h));
      }
      return out;
    } catch (e) {
      console.warn("Falha a carregar hcp-history.json:", e);
      return {};
    }
  })();
  return _cache;
}
