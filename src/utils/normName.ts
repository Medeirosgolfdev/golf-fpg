/**
 * normName — normaliza um nome para comparação/indexação/matching.
 *
 * FONTE ÚNICA. Antes existiam 6 cópias divergentes espalhadas (KIDSdataLoader,
 * constants/manuel, CircuitShell, AtletaSearchPanel, UskidsDrawTab, kids2/ScoutView)
 * — umas removiam pontuação, a do CircuitShell não removia nada, a do ScoutView
 * removia também '/'. Essa divergência fazia o MESMO nome normalizar de formas
 * diferentes conforme a página, quebrando o matching/dedup de jogadores.
 *
 * Regra canónica (a mais completa): lowercase + sem diacríticos +
 * pontuação ( -  '  ’  .  ·  / ) convertida em espaço + espaços condensados.
 */
export function normName(n: string): string {
  return (n || "")
    .trim()
    .toLowerCase()
    .replace(/[-'’.·/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
