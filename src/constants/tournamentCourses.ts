/**
 * tournamentCourses.ts
 *
 * Algumas entradas em `away-courses.json` não são campos — são nomes de
 * TORNEIO ou ORGANIZAÇÃO que ficaram registados no campo "course" das rondas
 * (ex: "Campeonato Andalucia Sub 16", "European Boys Team Championship",
 * "Daily Mail World Junior Golf Championship"). São úteis para saber QUEM
 * jogou esses eventos (têm `_players`), mas não representam um percurso real:
 *   - no Simulador não fazem sentido (não há um tee/par a simular) → escondidos
 *   - na CamposPage aparecem separados sob a origem "Torneios"
 *
 * Lista curada por courseKey (estável, derivado do nome normalizado). Ambíguos
 * que SÃO campos reais (ex: "Royal Dornoch Championship", "ChampionsGate
 * International", "Golf Resort Kaskáda") foram deliberadamente deixados de fora.
 *
 * Manter em sincronia se forem descobertas novas entradas-torneio.
 */
export const TOURNAMENT_COURSE_KEYS: ReadonlySet<string> = new Set([
  "away-1-puntuable-zonal-de-galicia-asturias",
  "away-european-boys-team-championship-div-2",
  "away-european-ladies-team-championship",
  "away-american-junior-golf-association",
  "away-belgian-international-golf-championship-for-boys",
  "away-campeonato-absoluto-aberto-ciudad-de-leon",
  "away-campeonato-andalucia-individuales-almerimar",
  "away-campeonato-andalucia-sub-16",
  "away-campeonato-andalucia-sub-18",
  "away-campeonato-de-galicia-sub-14",
  "away-campionato-internazionale-d-italia-maschile",
  "away-circuito-infantil-sevilha",
  "away-cognizant-cup-finnish-international-junior-champ",
  "away-copa-de-andalucia-femenina",
  "away-copa-de-andalucia-masculina",
  "away-copa-s-m-el-rey-alcanada",
  "away-copa-sm-el-rey",
  "away-daily-mail-world-junior-golf-championship-d2",
  "away-english-girls-under-16-14-open-amateur-championshi",
  "away-campeonato-abierto-de-madrid-femenino",
  "away-european-boys-team-championship",
  "away-european-girls-team-championship",
  "away-european-young-masters",
  "away-gadget-golf-trophy",
  "away-internacional-de-franca-sub-14",
  "away-internationaux-de-france-u14-challenge-alexis-go",
  "away-junior-cup-12-17-ans",
  "away-open-amateur-champioship",
  "away-open-championship-scottish-girls-u16-loretto",
  "away-south-carolina-golf-association",
  "away-st-andrews-links-trophy",
  "away-portustewart-golf-cup",
]);

/** True se o courseKey corresponde a um nome de torneio/organização (não um campo). */
export function isTournamentCourse(courseKey: string): boolean {
  return TOURNAMENT_COURSE_KEYS.has(courseKey);
}
