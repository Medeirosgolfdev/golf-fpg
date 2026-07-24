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

/**
 * vetKey — chave de IDENTIDADE de jogador tolerante à ORDEM dos nomes.
 *
 * Além do `normName`, remove vírgulas e ordena os tokens alfabeticamente, para
 * que "Apelido, Nome" (formato do Doral) e "Nome Apelido" (Future Masters, etc.)
 * gerem a MESMA chave — senão a mesma pessoa contava como dois "veteranos"
 * distintos (o Doral inverte nome+apelido face às fontes GolfGenius). Usada pelo
 * índice de veteranos do CircuitShell e espelhada em `build-major-catalog.js`.
 *
 * ⚠ Trade-off aceite: dois nomes com o MESMO multiset de tokens (raro) fundem-se.
 * Para o heurístico "presenças por jogador" isso é preferível ao falso negativo
 * dos nomes invertidos.
 */
export function vetKey(n: string): string {
  return normName(n)
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
