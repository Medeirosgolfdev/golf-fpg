/**
 * calendarData.ts
 * Eventos competitivos 2026 — fonte de dados partilhada com CalendarioPage.
 * Usado pelo SimuladorPage para pré-preencher o campo "Torneio" no overlay.
 *
 * Manter sincronizado com os EVENTS de CalendarioPage.tsx.
 */

export interface CalEvent {
  title: string;
  date: Date;
  campo: string;
}

/* Eventos principais 2026 (sem aniversários, viagens, júnior, treinos) */
const EVENTS: CalEvent[] = [
  // Janeiro
  { title: "1º Torneio Drive Challenge Madeira",       date: new Date(2026, 0,  4), campo: "Palheiro" },
  { title: "1º Torneio Drive Tour Norte",              date: new Date(2026, 0,  4), campo: "Estela GC" },
  { title: "1º Torneio Drive Tour Tejo",               date: new Date(2026, 0,  4), campo: "Montado" },
  { title: "1º Torneio Drive Tour Sul",                date: new Date(2026, 0, 11), campo: "Laguna GC" },
  { title: "2º Torneio Drive Tour Tejo",               date: new Date(2026, 0, 31), campo: "Belas" },
  // Fevereiro
  { title: "2º Torneio Drive Challenge Madeira",       date: new Date(2026, 1,  8), campo: "Santo da Serra" },
  { title: "Torneio de Carnaval CGSS",                 date: new Date(2026, 1, 14), campo: "Santo da Serra" },
  { title: "2º Torneio Drive Tour Sul",                date: new Date(2026, 1,  1), campo: "Vila Sol" },
  { title: "2º Torneio Drive Tour Norte",              date: new Date(2026, 1,  1), campo: "Amarante" },
  { title: "3º Torneio Drive Tour Norte",              date: new Date(2026, 1, 28), campo: "Vale Pisão" },
  { title: "II Prova Camp. Clube de Pares",            date: new Date(2026, 1, 28), campo: "Santo da Serra" },
  // Março
  { title: "5º Torneio Drive Challenge Madeira",       date: new Date(2026, 2,  8), campo: "Santo da Serra" },
  { title: "Torneio da Primavera CGSS",                date: new Date(2026, 2, 14), campo: "Santo da Serra" },
  { title: "Torneio Golf & Clássicos 3rd Edition",     date: new Date(2026, 2, 21), campo: "Santo da Serra" },
  { title: "1º Torneio Circuito AQUAPOR",              date: new Date(2026, 2, 22), campo: "Aroeira" },
  // Abril
  { title: "4º Torneio Drive Challenge Madeira",       date: new Date(2026, 3, 12), campo: "Porto Santo" },
  { title: "3º Torneio Drive Tour Sul",                date: new Date(2026, 3,  4), campo: "Penina" },
  { title: "4º Torneio Drive Tour Norte",              date: new Date(2026, 3, 19), campo: "Ponte de Lima" },
  { title: "III Prova Camp. Clube de Pares",           date: new Date(2026, 3, 11), campo: "Santo da Serra" },
  { title: "Torneio CGSS",                             date: new Date(2026, 3, 25), campo: "Santo da Serra" },
  { title: "2º Torneio Circuito AQUAPOR",              date: new Date(2026, 3, 26), campo: "Beloura" },
  // Maio
  { title: "3º Torneio Drive Challenge Madeira",       date: new Date(2026, 4, 24), campo: "Palheiro" },
  { title: "I Aberto CGSS 2026",                       date: new Date(2026, 4,  3), campo: "Santo da Serra" },
  { title: "4º Torneio Drive Tour Sul",                date: new Date(2026, 5, 10), campo: "Boavista" },
  { title: "Torneio Clube de Golf Santo da Serra",     date: new Date(2026, 4, 30), campo: "Santo da Serra" },
  // Junho
  { title: "6º Torneio Drive Challenge Madeira",       date: new Date(2026, 5, 28), campo: "Porto Santo" },
  { title: "Madeira Golf Trophy",                      date: new Date(2026, 5,  6), campo: "Santo da Serra" },
  { title: "3º Torneio Circuito AQUAPOR",              date: new Date(2026, 5, 14), campo: "Quinta do Peru" },
  // Julho
  { title: "7º Torneio Drive Challenge Madeira",       date: new Date(2026, 6, 11), campo: "Santo da Serra" },
  { title: "IV Prova Camp. Clube de Pares",            date: new Date(2026, 6,  4), campo: "Santo da Serra" },
  { title: "Taça do Clube",                            date: new Date(2026, 6, 25), campo: "Santo da Serra" },
  // Agosto
  { title: "Torneio CGSS Rali",                        date: new Date(2026, 7,  1), campo: "Santo da Serra" },
  { title: "Torneio CGSS Summer",                      date: new Date(2026, 7, 22), campo: "Santo da Serra" },
  { title: "Camp. Nacional de Clubes",                 date: new Date(2026, 7, 25), campo: "Pinhal" },
  { title: "Torneio CGSS",                             date: new Date(2026, 7, 29), campo: "Santo da Serra" },
  // Setembro
  { title: "XIII Torneio Barbeito Madeira",            date: new Date(2026, 8, 12), campo: "Santo da Serra" },
  { title: "Porto Santo Colombos",                     date: new Date(2026, 8, 19), campo: "Porto Santo" },
  { title: "4º Torneio Circuito AQUAPOR",              date: new Date(2026, 8, 20), campo: "TBC" },
  // Outubro
  { title: "Torneio CGEx ZMM",                         date: new Date(2026, 9,  4), campo: "Santo da Serra" },
  { title: "Torneio Serras / São Martinho CGSS",       date: new Date(2026, 9, 10), campo: "Santo da Serra" },
  { title: "Troféu João Sousa",                        date: new Date(2026, 9, 17), campo: "Santo da Serra" },
  { title: "V Prova Camp. Clube de Pares",             date: new Date(2026, 9, 24), campo: "Santo da Serra" },
  { title: "Taça Presidente",                          date: new Date(2026, 9, 31), campo: "Santo da Serra" },
  // Novembro
  { title: "Torneio de São Martinho CGSS",             date: new Date(2026, 10,  7), campo: "Santo da Serra" },
  { title: "Taça 1937 — Gala Encerramento",            date: new Date(2026, 10, 21), campo: "Santo da Serra" },
  // Dezembro
  { title: "Torneio Solidário",                        date: new Date(2026, 11,  5), campo: "Santo da Serra" },
  { title: "Torneio de Natal CGSS 2026",               date: new Date(2026, 11, 12), campo: "Santo da Serra" },
];

/**
 * Devolve o próximo evento a partir de hoje (ou da data fornecida).
 * Ordena por data ascendente e devolve o primeiro >= hoje.
 */
export function getNextCalendarEvent(today: Date = new Date()): CalEvent | null {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = EVENTS
    .filter(e => e.date >= todayMidnight)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0] ?? null;
}
