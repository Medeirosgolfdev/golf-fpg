/**
 * manuelAwayTees.ts
 *
 * Em torneios internacionais (USKids, WJGC, EOWAGR…) a FPG regista a marcação
 * pela COR (ex: "AZUIS", "VERMELHAS") mas a marcação REAL jogada depende do
 * escalão/idade no momento — não da cor. Por isso o match automático por cor
 * falha (ex: Marco Simone "AZUIS" mas jogou o tee USKids Boys 11, muito mais
 * curto). Este mapa fixa, por campo, o NOME do tee que o Manuel realmente jogou,
 * para a JogadoresPage ligar a distância correcta a partir dos dados do campo.
 *
 * Chave: nome canónico do campo, normalizado (lowercase, sem pontuação).
 * Valor: teeName exacto tal como existe em master/away/extraCourses.
 *
 * Confirmado com o próprio jogador (2026-06-13).
 */
export const MANUEL_AWAY_TEE: Record<string, string> = {
  // Marco Simone US Kids Invitational 2026 — tinha 11 anos → Boys 11.
  "marco simone golf country club": "USKids Boys 11/10",
  // Glen Golf Club, European Championship 2026 — Boys 12 (marcas Red).
  "glen golf club": "USKids Boys 12",
  // Villa Padierna Flamingos, WJGC 2025/2026 — tee Vermelhas.
  "villa padierna flamingos": "Vermelhas",
  // Le Touquet La Forêt, EOWAGR 2025 — tee Vermelho.
  "le touquet golf club la foret": "Vermelho",
  // Doral Golden Palm, Dec 2025 — Boys 10-11 (já costuma vir com metros).
  "trump doral golden palm": "Boys 10-11",
  // Golf Paris Val d'Europe, Paris Invitational 2026 — tinha 12 anos → Boys 12
  // (tee físico Bleus, 5029m, CR 67.8/119). O melhorias.json regista o tee como
  // "Boys 12" mas o tee do campo chama-se "Bleus / USKids Boys 12" → sem este
  // override o match exacto por nome falha e a ronda fica sem metros.
  // ⚠ Chave = courseKeyName() do nome CANÓNICO, que é o CURTO "Val d'Europe"
  // (ver courseAliases.ts); o norm() remove o apóstrofo → "val deurope".
  "val deurope": "Bleus / USKids Boys 12",
};
