/* ═══════════════════════════════════════════════════════════════════
   Dados do calendário — a fonte única.

   Estava tudo dentro do `CalendarioPage.tsx`. Saiu para aqui porque
   além da página há agora o `scripts/build-ics.js`, que gera os
   ficheiros `.ics` publicados em `public/` e subscritos no Google
   Calendar. Os dois lêem esta lista: mexer aqui chega aos dois sítios.

   A página continua a tratar das cores (a rampa por família vive lá).
   ═══════════════════════════════════════════════════════════════════ */

import { C } from "../utils/colors";

export type CalGroup = "CGSS" | "DRIVE" | "FPG" | "DESTAQUE" | "VIAGENS" | "JUNIOR" | "ANIVER";

/** Anos cobertos pelo calendário (grelha do site e ficheiros .ics). */
export const ANO_BASE = 2026;
export const ANO_FIM = 2027;

export interface CalEvent {
  id: number;
  title: string;
  date: Date;
  endDate?: Date;
  modalidade: string;
  campo: string;
  calId: string;
  note?: string;   // alerta destacado no popup do evento (ex: data corrigida)
}


export type CalDef = { id: string; name: string; group: CalGroup; color?: string };
export const CAL_DEFS: CalDef[] = [
  // ── CGSS Santo da Serra ──
  { id: "cgss_major",     name: "Majors (A)",              group: "CGSS" },
  { id: "cgss_om_b",      name: "O.M. Nível B",            group: "CGSS" },
  { id: "cgss_om_c",      name: "O.M. Nível C",            group: "CGSS" },
  { id: "cgss_regional",  name: "Regional",                group: "CGSS" },
  { id: "cgss_fpg",       name: "FPG Nacional",            group: "CGSS" },
  { id: "cgss_ouro",      name: "Ranking Ouro",            group: "CGSS" },
  { id: "cgss_pares",     name: "Camp. Pares",             group: "CGSS" },
  { id: "cgss_patrocin",  name: "Patrocinador",            group: "CGSS" },

  // ── Junior CGSS — Academia ──
  { id: "jr_cgss",        name: "CGSS Jr",                 group: "JUNIOR" },
  { id: "jr_regional",    name: "Regional Jr",             group: "JUNIOR" },
  { id: "jr_fpg",         name: "FPG Jr",                  group: "JUNIOR" },

  // ── Drive ──
  { id: "drive_tour_mad", name: "Drive Tour Madeira",      group: "DRIVE" },
  { id: "drive_chall",    name: "Drive Challenge",         group: "DRIVE" },
  { id: "drive_tour",     name: "Drive Tour",              group: "DRIVE" },

  // ── FPG ──
  { id: "fpg_aquapor",    name: "Circuito AQUAPOR",        group: "FPG" },
  { id: "fpg_torneios",   name: "Torneios FPG",            group: "FPG" },

  // ── Destaque: as provas que contam ──
  { id: "drive_final",    name: "Finais Drive",            group: "DESTAQUE" },
  { id: "dest_uskids",    name: "US Kids International",   group: "DESTAQUE" },
  { id: "dest_pja",       name: "PJA Tour",                group: "DESTAQUE" },
  { id: "dest_intl",      name: "Internacionais",          group: "DESTAQUE" },
  { id: "dest_nac_jr",    name: "Nacional Sub14&18",       group: "DESTAQUE" },
  { id: "dest_bjgt",      name: "BJGT",                    group: "DESTAQUE" },
  { id: "dest_uskids_tbc",name: "US Kids (a confirmar)",   group: "DESTAQUE" },

  // ── Fora das provas: identidade própria, de propósito ──
  { id: "pessoal",        name: "🎂 Pessoal",              group: "DESTAQUE", color: C.cal.pessoal },
  { id: "profissao_fe",   name: "✝ Profissão de Fé",       group: "DESTAQUE", color: C.cal.profissao_fe },
  { id: "irma_bad",       name: "🏸 Maria Antónia (irmã)", group: "DESTAQUE", color: C.cal.irma_bad },
  { id: "andebol",        name: "🤾 Andebol",              group: "DESTAQUE", color: C.cal.andebol },
  { id: "treino",         name: "⛳ Campo / Treino",       group: "DESTAQUE", color: C.cal.treino },
  { id: "ferias",         name: "🏖 Férias",               group: "DESTAQUE", color: C.cal.ferias },
  { id: "colonias",       name: "🏕 Colónias",             group: "DESTAQUE", color: C.cal.colonias },

  // ── Aniversários ──
  { id: "bday_pja",       name: "🎂 PJA",                  group: "ANIVER" },
  { id: "bday_sub10",     name: "🎂 Sub-10",               group: "ANIVER" },
  { id: "bday_sub12",     name: "🎂 Sub-12",               group: "ANIVER" },
  { id: "bday_sub14",     name: "🎂 Sub-14",               group: "ANIVER" },
  { id: "bday_sub16",     name: "🎂 Sub-16",               group: "ANIVER" },
  { id: "bday_sub18",     name: "🎂 Sub-18",               group: "ANIVER" },
  { id: "bday_outros",    name: "🎂 Outros",               group: "ANIVER" },

  // ── Viagens (todas laranja; distinguem-se pelo nome, não pela cor) ──
  { id: "viag_paris_set",   name: "✈ Paris + Comporta (Set)",              group: "VIAGENS" },
  { id: "viag_malaga_nov",  name: "✈ Málaga Nov · Spanish Open",           group: "VIAGENS" },
  { id: "viag_alg_fev",     name: "✈ Algarve (Fev)",                       group: "VIAGENS" },
  { id: "viag_malaga",      name: "✈ Málaga (Fev)",                        group: "VIAGENS" },
  { id: "viag_roma",        name: "✈ Roma (Mar)",                          group: "VIAGENS" },
  { id: "viag_alg_mar",     name: "✈ Algarve (Mar/Abr)",                   group: "VIAGENS" },
  { id: "viag_edinb",       name: "✈ Edimburgo (Mai)",                     group: "VIAGENS" },
  { id: "viag_jun",         name: "✈ Lisboa Jun · Manuel + M. Francisco",  group: "VIAGENS" },
  { id: "viag_par_jul",     name: "✈ Paris Jul · Manuel + M. Francisco",   group: "VIAGENS" },
  { id: "viag_alg_jul_m",   name: "✈ Algarve Jul · Manuel+2",              group: "VIAGENS" },
  { id: "viag_alg_jul_mamf",name: "✈ Algarve Jul · Mariana + M. Francisco",group: "VIAGENS" },
  { id: "viag_vce_ago",     name: "✈ Veneza + Porto Ago (prov.)",          group: "VIAGENS" },
];

/* ═══ Correções manuais de datas de nascimento (aniversários) ═══
   ⚠ TRAVA: estas datas GANHAM sempre ao players.json no calendário.
   Mesmo que o scraper da FPG volte a reescrever players.json com a data
   errada, o aniversário mostrado aqui mantém-se correcto e exibe uma nota
   de alerta no evento. Chave = nfed (número de federado). */
export const DOB_OVERRIDES: Record<string, { dob: string; note: string }> = {
  // Ricardo Castro Ferreira — a FPG traz "2015-07-02" (dia/mês TROCADOS).
  // Nasceu a 7 de FEVEREIRO de 2015, não 2 de Julho.
  "49085": { dob: "2015-02-07", note: "⚠ Data certa: 7 de Fevereiro (não Julho)" },
};

/* ═══ Events ═══ */
let _id = 0;
const ev = (calId: string, title: string, d: Date, campo: string, mod = "", end?: Date): CalEvent =>
  ({ id: ++_id, calId, title, date: d, endDate: end, campo, modalidade: mod });

export const EVENTS: CalEvent[] = [

  /* ══════════════════════════════════════
     CGSS — Santo da Serra (azuis)
     ══════════════════════════════════════ */

  // Fevereiro
  ev("cgss_om_c",     "Torneio de Carnaval CGSS",            new Date(2026,1,14), "Santo da Serra", "Stableford"),
  ev("cgss_pares",    "II Prova Camp. Clube de Pares 2026",  new Date(2026,1,28), "Santo da Serra", "Foursomes"),
  // Março
  ev("cgss_om_c",     "Torneio da Primavera CGSS",           new Date(2026,2,14), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Torneio Golf & Clássicos 3rd edition",new Date(2026,2,21), "Santo da Serra", "Stableford"),
  // Abril
  ev("cgss_pares",    "III Prova Camp. Clube de Pares",       new Date(2026,3,11), "Santo da Serra", "Stableford Agg"),
  ev("cgss_om_c",     "Torneio CGSS",                        new Date(2026,3,25), "Santo da Serra", "Stableford"),
  // Maio
  ev("cgss_ouro",     "I Aberto CGSS 2026",                  new Date(2026,4,3),  "Santo da Serra", "Strokeplay"),
  ev("cgss_om_b",     "Torneio Clube de Golf Santo da Serra", new Date(2026,4,30), "Santo da Serra", "Stableford"),
  // Junho
  ev("cgss_patrocin", "Madeira Golf Trophy",                 new Date(2026,5,6),  "Santo da Serra", "Strokeplay"),
  ev("cgss_ouro",     "III Aberto CGSS 2026",                new Date(2026,5,7),  "Santo da Serra", "Strokeplay"),
  // Julho
  ev("cgss_pares",    "III Prova Camp. Clube de Pares",      new Date(2026,6,4),  "Santo da Serra", "Texas Scramble"),
  ev("cgss_patrocin", "Expresso BPI Golf Cup QR",            new Date(2026,6,18), "Santo da Serra", "Texas Scramble"),
  ev("cgss_patrocin", "Expresso BPI Golf Cup MF",            new Date(2026,6,19), "Santo da Serra", "Texas Scramble"),
  ev("cgss_ouro",     "IV Aberto CGSS 2026",                 new Date(2026,6,26), "Santo da Serra", "Strokeplay"),
  // Agosto
  ev("cgss_om_c",     "Torneio CGSS Rali",                  new Date(2026,7,1),  "Santo da Serra", "Stableford"),
  ev("cgss_om_c",     "Torneio CGSS Summer",                new Date(2026,7,22), "Santo da Serra", "Stableford"),
  ev("cgss_fpg",      "Camp. Nacional de Clubes",           new Date(2026,7,27), "Vilamoura - Pinhal", "Strokeplay", new Date(2026,7,30)),
  ev("cgss_om_c",     "Torneio CGSS",                       new Date(2026,7,29), "Santo da Serra", "Stableford"),
  // Setembro
  ev("cgss_om_b",     "XIII Torneio Barbeito Madeira",      new Date(2026,8,12), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Torneio Pérola do Atlântico (SCP Golfe)", new Date(2026,8,14), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Taça Prof. Ernâni Lopes",            new Date(2026,8,18), "Santo da Serra", "Stableford"),
  // Calendário do clube de 08/09/2026: a Taça do Clube passou de 25 Jul para aqui e
  // a prova de pares que estava neste dia saiu.
  ev("cgss_major",    "Taça do Clube",                      new Date(2026,8,26), "Santo da Serra", "Medal"),
  // Outubro
  ev("cgss_patrocin", "Torneio 50 Anos de Autonomia",       new Date(2026,9,3),  "Santo da Serra", "Stableford", new Date(2026,9,4)),
  ev("cgss_major",    "Troféu João Sousa",                  new Date(2026,9,10), "Santo da Serra", "Stableford"),
  ev("cgss_pares",    "V Prova Camp. Clube de Pares",       new Date(2026,9,24), "Santo da Serra", "Stableford Agg"),
  ev("cgss_major",    "Taça Presidente",                    new Date(2026,9,31), "Santo da Serra", "Stableford"),
  // Novembro
  ev("cgss_om_c",     "Torneio de São Martinho CGSS",       new Date(2026,10,7), "Santo da Serra", "Stableford"),
  // O PDF do clube chama-lhe "V Prova", tal como à de 24 Out — número por confirmar.
  ev("cgss_pares",    "VI Prova Camp. Clube de Pares",      new Date(2026,10,14),"Santo da Serra", "Betterball"),
  ev("cgss_patrocin", "Taça 1937 — Gala Encerramento",      new Date(2026,10,21),"Santo da Serra", "Stableford"),
  // Dezembro
  ev("cgss_patrocin", "Torneio Solidário",                  new Date(2026,11,5), "Santo da Serra", "Stableford"),
  ev("cgss_om_c",     "Torneio de Natal CGSS 2026",         new Date(2026,11,12),"Santo da Serra", "Stableford"),

  /* ══════════════════════════════════════
     JUNIOR CGSS — Academia (âmbar/teal/rosa)
     ══════════════════════════════════════ */

  // ── CGSS Jr — Torneios internos ──
  ev("jr_cgss", "Torneio Cidade de Machico",               new Date(2026,4,9),  "Santo da Serra", "Stableford"),
  ev("jr_cgss", "Torneio NOS Empresas",                    new Date(2026,4,23), "Santo da Serra", "Stableford"),
  ev("jr_cgss", "Torneio Diário de Notícias da Madeira",   new Date(2026,5,13), "Santo da Serra", "Stableford"),
  ev("jr_cgss", "Torneio Calheta Viva",                    new Date(2026,7,8),  "Santo da Serra", "Stableford"),
  ev("jr_cgss", "Torneio Quinta de São João",              new Date(2026,8,5),  "Santo da Serra", "Stableford"),
  ev("jr_cgss", "Torneio Famílias & Amigos — P&P",         new Date(2026,11,19),"Santo da Serra", "Texas Scramble"),

  // ── Regional Jr ──
  ev("jr_regional", "Campeonato Regional de Jovens D1",    new Date(2026,1,28), "Santo da Serra", "Strokeplay"),
  ev("jr_regional", "Campeonato Regional de Jovens D2",    new Date(2026,2,1),  "Santo da Serra", "Strokeplay"),
  ev("jr_regional", "Camp. Regional de Clubes D1",         new Date(2026,5,20), "Palheiro",       "Strokeplay"),
  ev("jr_regional", "Camp. Regional de Clubes D2",         new Date(2026,5,21), "Palheiro",       "Strokeplay"),
  ev("jr_regional", "Camp. da Madeira Ind. Absoluto D1",   new Date(2026,10,28),"Porto Santo",    "Strokeplay"),
  ev("jr_regional", "Camp. da Madeira Ind. Absoluto D2",   new Date(2026,10,29),"Porto Santo",    "Strokeplay"),

  // ── FPG Jr — Campeonatos Nacionais ──
  ev("jr_fpg", "Camp. Nacional Ind. Absoluto",             new Date(2026,5,4),  "Oporto",         "Strokeplay", new Date(2026,5,7)),

  /* ══════════════════════════════════════
     DRIVE CHALLENGE — violeta
     (FPG como fonte principal, CGSS dupes ocultados)
     ══════════════════════════════════════ */
  ev("drive_chall", "1º Torneio Drive Challenge Madeira",     new Date(2026,0,4),  "Palheiro",       "Strokeplay e Medal"),
  ev("drive_chall", "2º Torneio Drive Challenge Madeira",     new Date(2026,1,8),  "Santo da Serra",  "Strokeplay e Medal"),
  ev("drive_chall", "3º Torneio Drive Challenge Madeira",     new Date(2026,2,8),  "Santo da Serra",  "Strokeplay e Medal"),
  ev("drive_chall", "4º Torneio Drive Challenge Madeira",     new Date(2026,3,12), "Porto Santo",     "Strokeplay e Medal"),
  ev("drive_chall", "5º Torneio Drive Challenge Madeira",     new Date(2026,4,24), "Palheiro",        "Strokeplay e Medal"),
  ev("drive_chall", "6º Torneio Drive Challenge Madeira",     new Date(2026,5,28), "Porto Santo",     "Strokeplay e Medal"),
  ev("drive_chall", "7º Torneio Drive Challenge Madeira",     new Date(2026,6,11), "Santo da Serra",  "Strokeplay e Medal"),
  ev("drive_final", "Final Regional Drive Challenge Madeira", new Date(2026,6,12), "Palheiro",        "Strokeplay e Medal"),
  ev("drive_final", "Final Nacional Drive Challenge",         new Date(2026,9,10), "Jamor",           "Strokeplay e Medal", new Date(2026,9,11)),

  /* ══════════════════════════════════════
     DRIVE TOUR — verde (Sul/Norte/Tejo)
     ══════════════════════════════════════ */
  // Sul
  ev("drive_tour", "1º Torneio Drive Tour Sul",   new Date(2026,0,11), "Laguna GC",    "Strokeplay e Medal"),
  ev("drive_tour", "2º Torneio Drive Tour Sul",   new Date(2026,1,1),  "Vila Sol",     "Strokeplay e Medal"),
  ev("drive_tour", "3º Torneio Drive Tour Sul",   new Date(2026,3,4),  "Quinta do Vale", "Strokeplay e Medal"),
  ev("drive_tour", "4º Torneio Drive Tour Sul",   new Date(2026,5,10), "Boavista",     "Strokeplay e Medal"),
  // Norte
  ev("drive_tour", "1º Torneio Drive Tour Norte", new Date(2026,0,4),  "Estela GC",      "Strokeplay e Medal"),
  // Remarcado: jogou-se a 30 Ago (987/10207), não a 1 Fev.
  ev("drive_tour", "2º Torneio Drive Tour Norte", new Date(2026,7,30), "Amarante",       "Strokeplay e Medal"),
  ev("drive_tour", "3º Torneio Drive Tour Norte", new Date(2026,1,28), "Vale Pisão",     "Strokeplay e Medal", new Date(2026,2,1)),
  ev("drive_tour", "4º Torneio Drive Tour Norte", new Date(2026,3,19), "Ponte de Lima",  "Strokeplay e Medal"),
  // Tejo
  ev("drive_tour", "1º Torneio Drive Tour Tejo",  new Date(2026,0,4),  "Montado",        "Strokeplay e Medal"),
  // Remarcado: jogou-se a 10 Jun (985/10203), não a 31 Jan.
  ev("drive_tour", "2º Torneio Drive Tour Tejo",  new Date(2026,5,10), "Belas",          "Strokeplay e Medal"),
  ev("drive_tour", "3º Torneio Drive Tour Tejo",  new Date(2026,2,28), "St. Estêvão",    "Strokeplay e Medal", new Date(2026,2,29)),
  ev("drive_tour", "4º Torneio Drive Tour Tejo",  new Date(2026,3,12), "Lisbon SC",      "Strokeplay e Medal"),
  // Final Nacional
  ev("drive_final", "Final Drive Tour",            new Date(2026,10,7), "Oeiras Green Valley (Lisboa)", "Strokeplay e Medal", new Date(2026,10,8)),

  /* ══════════════════════════════════════
     DRIVE TOUR MADEIRA — esmeralda
     (FPG como fonte, CGSS dupes ocultados)
     ══════════════════════════════════════ */
  ev("drive_tour_mad", "1º Torneio Drive Tour Madeira", new Date(2026,0,3),  "Palheiro Golf",     "Strokeplay e Medal"),
  ev("drive_tour_mad", "2º Torneio Drive Tour Madeira", new Date(2026,1,7),  "Santo da Serra",    "Strokeplay e Medal"),
  ev("drive_tour_mad", "3º Torneio Drive Tour Madeira", new Date(2026,2,7),  "Palheiro Golf",     "Strokeplay e Medal"),
  ev("drive_tour_mad", "4º Torneio Drive Tour Madeira", new Date(2026,3,11), "Porto Santo Golfe", "Strokeplay e Medal"),

  /* ══════════════════════════════════════
     FPG — Circuito AQUAPOR (índigo)
     ══════════════════════════════════════ */
  ev("fpg_aquapor", "1º Torneio do Circuito AQUAPOR",  new Date(2026,0,17), "Morgado do Reguengo", "Strokeplay", new Date(2026,0,18)),
  ev("fpg_aquapor", "2º Torneio do Circuito AQUAPOR",  new Date(2026,2,14), "Quinta do Peru",      "Strokeplay", new Date(2026,2,15)),
  ev("fpg_aquapor", "3º Torneio do Circuito AQUAPOR",  new Date(2026,4,16), "Vidago Palace",       "Strokeplay", new Date(2026,4,17)),
  ev("fpg_aquapor", "4º Torneio do Circuito AQUAPOR",  new Date(2026,6,18), "Palmares",            "Strokeplay", new Date(2026,6,19)),
  // O 5º de Setembro (campo TBC) saiu do calendário oficial e a FPG renumerou:
  // as páginas em competicoes.fpg.pt mantêm os slugs "6o-…-estela" e
  // "7o-…-belas-cc" mas os títulos são agora 5º e 6º. O circuito tem 6 provas.
  ev("fpg_aquapor", "5º Torneio do Circuito AQUAPOR",  new Date(2026,9,17), "Estela",              "Strokeplay", new Date(2026,9,18)),
  ev("fpg_aquapor", "6º Torneio do Circuito AQUAPOR",  new Date(2026,10,14),"Belas CC",            "Strokeplay", new Date(2026,10,15)),
  // 2027 — já publicado em competicoes.fpg.pt (o 6º ainda sem campo).
  ev("fpg_aquapor", "1º Torneio do Circuito AQUAPOR",  new Date(2027,0,16), "Morgado do Reguengo", "Strokeplay", new Date(2027,0,17)),
  ev("fpg_aquapor", "2º Torneio do Circuito AQUAPOR",  new Date(2027,1,20), "Quinta do Peru",      "Strokeplay", new Date(2027,1,21)),
  ev("fpg_aquapor", "3º Torneio do Circuito AQUAPOR",  new Date(2027,3,17), "Oporto",              "Strokeplay", new Date(2027,3,18)),
  ev("fpg_aquapor", "4º Torneio do Circuito AQUAPOR",  new Date(2027,4,8),  "Vidago Palace",       "Strokeplay", new Date(2027,4,9)),
  ev("fpg_aquapor", "5º Torneio do Circuito AQUAPOR",  new Date(2027,6,17), "Penina",              "Strokeplay", new Date(2027,6,18)),
  ev("fpg_aquapor", "6º Torneio do Circuito AQUAPOR",  new Date(2027,10,20),"TBA",                 "Strokeplay", new Date(2027,10,21)),

  /* ══════════════════════════════════════
     FPG — Torneios (roxo)
     ══════════════════════════════════════ */
  ev("fpg_torneios", "Taça Kendall",            new Date(2026,3,25), "Oporto GC",     "Strokeplay", new Date(2026,3,26)),
  ev("fpg_torneios", "Lisbon Cup",              new Date(2026,4,9),  "Lisbon SC",     "Strokeplay", new Date(2026,4,10)),
  ev("fpg_torneios", "Aberto do Estoril",       new Date(2026,4,23), "CG Estoril",    "Strokeplay", new Date(2026,4,24)),
  ev("fpg_torneios", "Taça RS Yeatman",         new Date(2026,5,20), "CG Miramar",    "Strokeplay", new Date(2026,5,21)),
  ev("fpg_torneios", "Taça Mendes D'Almeida",   new Date(2026,7,15), "Vidago Palace", "Strokeplay", new Date(2026,7,16)),
  ev("fpg_torneios", "Taça FPG",                new Date(2026,9,10), "Santo Estêvão", "Strokeplay e Match", new Date(2026,9,13)),
  // 2027 — competicoes.fpg.pt. Aberto a todas as idades (por categoria de HCP):
  // é dele, por isso vai também em MANUEL_EXCEPCOES.
  ev("fpg_torneios", "Camp. Nacional de 2ª, 3ª e 4ª Categorias", new Date(2027,3,10), "Montebelo", "", new Date(2027,3,11)),

  /* ══════════════════════════════════════
     DESTAQUE — Internacionais (vermelho)
     ══════════════════════════════════════ */
  ev("dest_intl", "Faldo Series Madeira",                              new Date(2026,9,16),  "Santo da Serra",              "Strokeplay", new Date(2026,9,18)),
  ev("dest_intl", "64º Open de Portugal PGA",                          new Date(2026,8,17), "Aroeira I",                   "Strokeplay", new Date(2026,8,20)),
  ev("dest_intl", "2nd Castro Marim Portuguese International U14",     new Date(2026,11,3), "Championship Quinta do Vale", "Strokeplay", new Date(2026,11,6)),
  ev("dest_intl", "Greatgolf Junior Open — Luis Figo Foundation",      new Date(2026,1,15), "Vilamoura",                   "Strokeplay", new Date(2026,1,17)),
  ev("dest_intl", "World Kids Golf 2026 by Amendoeira",                new Date(2026,6,29), "Amendoeira",                  "3R Strokeplay (jantar de encerramento)", new Date(2026,6,31)),

  /* ══════════════════════════════════════
     DESTAQUE — Camp. Nacional Sub14 & 18 (laranja)
     ══════════════════════════════════════ */
  ev("dest_nac_jr", "Camp. Nacional Clubes Sub14 & 18",  new Date(2026,2,31), "Oporto",  "Strokeplay", new Date(2026,3,2)),
  ev("dest_nac_jr", "Camp. Nacional de Jovens",          new Date(2026,4,1),  "Aroeira", "Strokeplay", new Date(2026,4,3)),
  // 2027 — já publicado em competicoes.fpg.pt (o dos Jovens ainda sem campo).
  ev("dest_nac_jr", "Camp. Nacional Clubes Sub14 & 18",  new Date(2027,2,24), "Montado", "Strokeplay", new Date(2027,2,26)),
  ev("dest_nac_jr", "Camp. Nacional de Jovens",          new Date(2027,3,30), "TBA",     "Strokeplay", new Date(2027,4,2)),

  /* ══════════════════════════════════════
     DESTAQUE — US Kids International (rosa)
     ══════════════════════════════════════ */
  ev("dest_uskids", "Marco Simone Invitational 2026",    new Date(2026,2,14), "Marco Simone, Guidonia (IT)",      "", new Date(2026,2,15)),
  // ev("dest_uskids", "Panama Invitational 2026",       new Date(2026,3,2),  "Panamá",                           "", new Date(2026,3,4)),
  // ev("dest_uskids", "Thailand Championship 2026",     new Date(2026,3,3),  "Tailândia",                        "", new Date(2026,3,5)),
  // ev("dest_uskids", "Australian Masters 2026",        new Date(2026,3,9),  "Austrália",                        "", new Date(2026,3,10)),
  // ev("dest_uskids", "The Big 5 South African Open",   new Date(2026,3,13), "África do Sul",                    "", new Date(2026,3,15)),
  // ev("dest_uskids", "Korean Championship 2026",       new Date(2026,3,22), "Coreia",                           "", new Date(2026,3,24)),
  ev("dest_uskids", "European Championship 2026",        new Date(2026,4,26), "Craigielaw, Aberlady (GB)",        "", new Date(2026,4,28)),
  // ev("dest_uskids", "Vallarta Open 2026",             new Date(2026,3,30), "Puerto Vallarta (MX)",             "", new Date(2026,4,1)),
  ev("dest_uskids_tbc", "Irish Open 2026",                   new Date(2026,6,1),  "Mountwolseley, Tullow (IE)",       "", new Date(2026,6,2)),
  ev("dest_uskids_tbc", "Paris Invitational 2026",           new Date(2026,6,4),  "Magny-le-Hongre (FR)",             "", new Date(2026,6,6)),
  ev("dest_uskids", "Venice Open 2026",                      new Date(2026,7,13), "Venice (IT)",                      "3R Strokeplay", new Date(2026,7,15)),
  // US Kids International Championships Tour (t=23132, 107/159 inscritos a
  // 2026-09-02). San Roque fica em Sotogrande (Cádiz), a ~1h de Málaga — daí
  // os voos para AGP.
  ev("dest_uskids", "US Kids Spanish Open 2026",              new Date(2026,10,20), "San Roque Golf & Resort (ES)",     "3R Strokeplay", new Date(2026,10,22)),
  // ev("dest_uskids", "Canadian Invitational 2026",     new Date(2026,6,6),  "Canadá",                           "", new Date(2026,6,7)),

  /* ══════════════════════════════════════
     DESTAQUE — BJGT (vermelho escuro)
     ══════════════════════════════════════ */
  ev("dest_bjgt", "Daily Mail World Junior Golf Championship 2026", new Date(2026,1,24), "Villa Padierna, Málaga (ES)", "", new Date(2026,1,27)),

  /* ══════════════════════════════════════
     PJA Tour 2026 (excluindo Drive Tour já listados)
     ══════════════════════════════════════ */
  // CANCELADO: ev("dest_pja", "PJA — Quinta da Marinha", new Date(2026,0,24), "Quinta da Marinha", "Strokeplay", new Date(2026,0,25)),
  ev("dest_pja", "PJA — Great Golf Júnior Open 2026", new Date(2026,1,15), "Vilamoura",         "Strokeplay", new Date(2026,1,17)),
  ev("dest_pja", "X Miramar Internacional Open U25", new Date(2026,7,19), "CG Miramar",       "3R Strokeplay", new Date(2026,7,21)),
  ev("dest_pja", "PJA — Quinta do Peru",             new Date(2026,5,27), "Quinta do Peru",     "Strokeplay", new Date(2026,5,28)),
  ev("dest_pja", "PJA — Torre",                      new Date(2026,8,5),  "Terras da Comporta - Torre", "2R Strokeplay", new Date(2026,8,6)),
  ev("dest_pja", "PJA — Dunas — Grande Final",       new Date(2026,10,28),"Dunas",              "Strokeplay", new Date(2026,10,29)),

  /* ══════════════════════════════════════
     🎂 PESSOAL
     ══════════════════════════════════════ */
  ev("pessoal", "MANUEL 12 ANOS", new Date(2026,3,29), "", ""),
  ev("profissao_fe", "Profissão de Fé — 18:30", new Date(2026,5,6), "", ""),
  ev("ferias",  "🐣 Férias da Páscoa", new Date(2026,2,28), "", "", new Date(2026,3,12)),

  /* ══════════════════════════════════════
     ⛳ CAMPO / TREINO
     ══════════════════════════════════════ */
  ev("treino", "Mypro Golf Algarve — Campo de Golf",          new Date(2026,2,28), "Algarve",     "", new Date(2026,3,4)),
  ev("treino", "Volta de treino — Venice Open 2026",          new Date(2026,7,12), "Venice (IT)", ""),
  ev("treino", "Volta de treino — VIII Miramar Open U25",     new Date(2026,7,18), "CG Miramar",  ""),
  ev("colonias", "Aranhiços 1 — Colónia",                     new Date(2026,6,17), "",            "", new Date(2026,6,26)),

  /* ══════════════════════════════════════
     🏸 MARIA ANTÓNIA (irmã) — colónia + badminton
     ══════════════════════════════════════ */
  ev("irma_bad", "Mosquitos 2 — Colónia · Maria Antónia", new Date(2026,7,19),  "Tona",             "",          new Date(2026,7,26)),
  ev("irma_bad", "4ª Jornada Nacional S11, S15 & S19",    new Date(2026,9,17),  "Caldas da Rainha", "Badminton", new Date(2026,9,18)),
  ev("irma_bad", "Campeonato Nacional Badminton S11",     new Date(2026,10,14), "Caldas da Rainha", "Badminton", new Date(2026,10,15)),

  /* ══════════════════════════════════════
     ANDEBOL — Manuel, Sub-14 masculinos (castanho)
     Fonte: «Planeamento Desportivo 2026/27» da Associação de Andebol da Madeira
     (linha Andebol 6/7 · MASC Sub14, e Selecções Sub14). ⚠ Na grelha as
     células ocupam o fim-de-semana inteiro — não se sabe se o jogo é ao sábado
     ou ao domingo, por isso cada jornada vai de sábado a domingo.
     ══════════════════════════════════════ */
  ev("andebol", "Calheta Beach Handball",                  new Date(2026,8,19),  "Calheta",        "", new Date(2026,8,20)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,8,26),  "",               "", new Date(2026,8,27)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,9,3),   "",               "", new Date(2026,9,4)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,9,10),  "",               "", new Date(2026,9,11)),
  ev("andebol", "EHF Beach Handball Champions Cup",        new Date(2026,9,15),  "Porto Santo",    "", new Date(2026,9,18)),
  ev("andebol", "1.º Estágio masculino",                   new Date(2026,9,24),  "",               "", new Date(2026,9,25)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,9,31),  "",               "", new Date(2026,10,1)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,10,7),  "",               "", new Date(2026,10,8)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,10,14), "",               "", new Date(2026,10,15)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,10,21), "",               "", new Date(2026,10,22)),
  ev("andebol", "1.º Torneio de Concentração",             new Date(2026,10,28), "Serra de Água",  "", new Date(2026,10,29)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,11,1),  "",               ""),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,11,5),  "",               "", new Date(2026,11,6)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,11,12), "",               "", new Date(2026,11,13)),
  ev("andebol", "Torneio de Abertura",                     new Date(2026,11,19), "",               "", new Date(2026,11,20)),
  ev("andebol", "VII Torneio CE Levada",                   new Date(2026,11,28), "",               "", new Date(2026,11,30)),
  ev("andebol", "Campeonato",                              new Date(2027,0,9),   "",               "", new Date(2027,0,10)),
  ev("andebol", "2.º Estágio (selecção Sub-14)",           new Date(2027,0,9),   "",               "", new Date(2027,0,10)),
  ev("andebol", "Campeonato",                              new Date(2027,0,16),  "",               "", new Date(2027,0,17)),
  ev("andebol", "33.º Clinic AAM",                         new Date(2027,0,23),  "",               "", new Date(2027,0,24)),
  ev("andebol", "Campeonato",                              new Date(2027,0,30),  "",               "", new Date(2027,0,31)),
  ev("andebol", "Campeonato",                              new Date(2027,1,6),   "",               "", new Date(2027,1,7)),
  ev("andebol", "Campeonato",                              new Date(2027,1,13),  "",               "", new Date(2027,1,14)),
  ev("andebol", "Campeonato",                              new Date(2027,1,20),  "",               "", new Date(2027,1,21)),
  ev("andebol", "Campeonato",                              new Date(2027,1,27),  "",               "", new Date(2027,1,28)),
  ev("andebol", "Campeonato",                              new Date(2027,2,6),   "",               "", new Date(2027,2,7)),
  ev("andebol", "Campeonato",                              new Date(2027,2,13),  "",               "", new Date(2027,2,14)),
  ev("andebol", "Campeonato",                              new Date(2027,2,20),  "",               "", new Date(2027,2,21)),
  ev("andebol", "Campeonato",                              new Date(2027,2,26),  "",               "", new Date(2027,2,27)),
  ev("andebol", "XXXIII Madeira Handball",                 new Date(2027,3,2),   "",               "", new Date(2027,3,3)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,3,10),  "",               "", new Date(2027,3,11)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,3,17),  "",               "", new Date(2027,3,18)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,3,24),  "",               "", new Date(2027,3,25)),
  ev("andebol", "3.º Estágio (selecção Sub-14)",           new Date(2027,3,24),  "",               "", new Date(2027,3,25)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,4,1),   "",               "", new Date(2027,4,2)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,4,8),   "",               "", new Date(2027,4,9)),
  ev("andebol", "2.º Torneio de Concentração",             new Date(2027,4,15),  "Funchal",        "", new Date(2027,4,16)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,4,22),  "",               "", new Date(2027,4,23)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,4,29),  "",               "", new Date(2027,4,30)),
  ev("andebol", "Taça AAM",                                new Date(2027,5,5),   "",               "", new Date(2027,5,6)),
  ev("andebol", "Torneio de Encerramento",                 new Date(2027,5,12),  "",               "", new Date(2027,5,13)),
  ev("andebol", "4.º Estágio (selecção Sub-14)",           new Date(2027,5,12),  "",               "", new Date(2027,5,13)),
  ev("andebol", "II IPTL Beach Handball Cup",              new Date(2027,5,19),  "",               "", new Date(2027,5,20)),
  ev("andebol", "Campeonato Nacional (PO15) · Torneio do Porto Santo", new Date(2027,5,26), "Porto Santo", "", new Date(2027,5,28)),
  ev("andebol", "Encerramento da época",                   new Date(2027,5,30),  "",               ""),
  ev("andebol", "Torneio de Selecções Regionais — Festa do Andebol", new Date(2027,6,8), "",       "", new Date(2027,6,11)),

  /* ══════════════════════════════════════
     ✈ VIAGENS — Voos
     ══════════════════════════════════════ */

  // ── Algarve Fevereiro (XUUM45) ──
  ev("viag_alg_fev", "✈ TP1692 FNC → LIS 18:10–19:55",          new Date(2026,1,14), "TAP", "XUUM45"),
  ev("viag_alg_fev", "✈ TP1901 LIS → FAO 09:35–10:25",          new Date(2026,1,15), "TAP", "XUUM45"),
  ev("viag_alg_fev", "✈ TP1902 FAO → LIS 11:15–12:05",          new Date(2026,1,18), "TAP", "XUUM45"),
  ev("viag_alg_fev", "✈ TP1691 LIS → FNC 15:20–17:10",          new Date(2026,1,18), "TAP", "XUUM45"),

  // ── Málaga (YZH6MC + YMAAUB) ──
  ev("viag_malaga", "✈ TP3842 FNC → LIS 12:50–14:55",            new Date(2026,1,22), "TAP", "YZH6MC"),
  ev("viag_malaga", "✈ TP1138 LIS → AGP 21:00–23:15",            new Date(2026,1,22), "TAP", "YMAAUB"),
  ev("viag_malaga", "✈ TP1137 AGP → LIS 15:00–16:25",            new Date(2026,1,28), "TAP", "YMAAUB"),
  ev("viag_malaga", "✈ TP1693 LIS → FNC 18:35–20:25",            new Date(2026,1,28), "TAP", "YZH6MC"),

  // ── Roma (XUZ0XS) ──
  ev("viag_roma", "✈ TP1688 FNC → LIS 11:00–12:45",              new Date(2026,2,12), "TAP", "XUZ0XS"),
  ev("viag_roma", "✈ TP836 LIS → FCO 14:40–18:45",               new Date(2026,2,12), "TAP", "XUZ0XS"),
  ev("viag_roma", "✈ TP833 FCO → LIS 12:15–14:25",               new Date(2026,2,16), "TAP", "XUZ0XS"),
  ev("viag_roma", "✈ TP1693 LIS → FNC 18:35–20:25",              new Date(2026,2,16), "TAP", "XUZ0XS"),

  // ── Algarve Março/Abril (XVCBD2) ──
  ev("viag_alg_mar", "✈ TP1694 FNC → LIS 21:15–23:00",           new Date(2026,2,27), "TAP", "XVCBD2"),
  ev("viag_alg_mar", "✈ TP1901 LIS → FAO 09:35–10:25",           new Date(2026,2,28), "TAP", "XVCBD2"),
  ev("viag_alg_mar", "✈ TP1906 FAO → LIS 18:10–19:05",           new Date(2026,3,4),  "TAP", "XVCBD2"),
  ev("viag_alg_mar", "✈ TP1695 LIS → FNC 22:20–00:10",           new Date(2026,3,4),  "TAP", "XVCBD2"),

  // ── Edimburgo (Ryanair) ──
  ev("viag_edinb", "✈ FR6673 FNC → EDI 15:00–19:05",             new Date(2026,4,23), "Ryanair", ""),
  ev("viag_edinb", "✈ FR6674 EDI → FNC 19:30–23:40",             new Date(2026,4,30), "Ryanair", ""),

  // ── Lisboa Junho · Manuel + Manuel Francisco (confirmado) ──
  ev("viag_jun", "✈ TP1690 FNC → LIS 14:15–16:00",              new Date(2026,5,22), "TAP", "ZUVRVP · M. Francisco (chegada est.)"),
  ev("viag_jun", "✈ TP1686 FNC → LIS 09:25–11:10",              new Date(2026,5,26), "TAP", "Manuel"),
  ev("viag_jun", "✈ TP1693 LIS → FNC 19:15–21:05",              new Date(2026,5,28), "TAP", "Manuel + M. Francisco"),

  /* ══════════════════════════════════════
     ✈ VIAGENS PROVISÓRIAS — Verão 2026 (por confirmar)
     ══════════════════════════════════════ */

  // ── Algarve Julho · Manuel + M.ª Antónia + Gastão (confirmado) ──
  ev("viag_alg_jul_m",  "✈ TP1688 FNC → LIS 12:40–14:25",        new Date(2026,6,7),  "TAP", "Manuel, M.ª Antónia, Gastão"),
  ev("viag_alg_jul_m",  "✈ TP1905 LIS → FAO 16:30–17:20",        new Date(2026,6,7),  "TAP", "Manuel, M.ª Antónia, Gastão"),
  ev("viag_alg_jul_m",  "✈ TP1693 LIS → FNC 19:10–21:05",        new Date(2026,6,17), "TAP", "Manuel, M.ª Antónia, Gastão"),

  // ── Algarve Julho · Mariana + Manuel Francisco (ida 12 Jul) ──
  ev("viag_alg_jul_mamf", "✈ TP1692 FNC → LIS 19:35–21:20",      new Date(2026,6,12), "TAP", "Mariana, M. Francisco"),
  ev("viag_alg_jul_mamf", "✈ TP1907 LIS → FAO 23:00–23:50",      new Date(2026,6,12), "TAP", "Mariana, M. Francisco"),

  // ── Paris Julho · Manuel + Manuel Francisco (confirmado) ──
  ev("viag_par_jul", "✈ TP1686 FNC → LIS 09:25–11:10",           new Date(2026,6,2),  "TAP · Portugalia",   "Manuel + M. Francisco"),
  ev("viag_par_jul", "✈ TP436 LIS → ORY 15:25–18:50",             new Date(2026,6,2),  "TAP",                "Manuel + M. Francisco"),
  ev("viag_par_jul", "✈ TP439 ORY → LIS 21:15–22:50",             new Date(2026,6,6),  "Privilege Style",    "Manuel + M. Francisco"),
  ev("viag_par_jul", "✈ TP1687 LIS → FNC 09:50–11:40",            new Date(2026,6,7),  "TAP",                "Manuel + M. Francisco"),

  // ── Veneza + Porto Agosto · Manuel, Mariana, Manuel Francisco (provisório) ──
  ev("viag_vce_ago",    "✈ TP1738 PXO → LIS 22:10–23:45",        new Date(2026,7,10), "TAP", "Prov. · Mariana, Manuel, M. Francisco"),
  ev("viag_vce_ago",    "✈ TP862 LIS → VCE 14:20–18:20",         new Date(2026,7,11), "TAP", "Prov. · Manuel, Mariana, M. Francisco"),
  ev("viag_vce_ago",    "✈ TP861 VCE → LIS 11:40–13:55",         new Date(2026,7,16), "TAP", "Prov. · Manuel, Mariana, M. Francisco"),
  ev("viag_vce_ago",    "✈ TP1930 LIS → OPO 16:00–17:00",        new Date(2026,7,16), "TAP", "Prov. · Manuel, Mariana, M. Francisco"),
  ev("viag_vce_ago",    "✈ TP1933 OPO → LIS 21:15–22:15",        new Date(2026,7,21), "TAP", "Prov. · Mariana, Manuel, M. Francisco"),
  ev("viag_vce_ago",    "✈ TP1697 LIS → FNC 23:40–01:30 (+1)",   new Date(2026,7,21), "TAP", "Prov. · Mariana, Manuel, M. Francisco"),

  // Novembro — Málaga (US Kids Spanish Open, San Roque)
  // ⚠ Do bilhete só constam os voos LIS↔AGP; os FNC↔LIS ainda não estão
  //   marcados (nas outras viagens há sempre o par da Madeira).
  ev("viag_malaga_nov", "✈ TP1134 LIS → AGP 07:20–09:35",       new Date(2026,10,18), "TAP", ""),
  ev("viag_malaga_nov", "✈ TP1137 AGP → LIS 15:00–15:25",       new Date(2026,10,23), "TAP", ""),

  // Setembro — Paris (treino). Dia inteiro no Golf de La Boulie com o Antoine
  // Schwartz; o dia da viagem fica marcado sem nº de voo (não foi indicado).
  ev("viag_paris_set", "✈ TP1688 FNC → LIS 12:40–14:25",          new Date(2026,8,2),  "TAP", ""),
  ev("viag_paris_set", "✈ TP438 LIS → PARIS ORLY 16:50–20:15",    new Date(2026,8,2),  "TAP", ""),
  ev("treino",         "⛳ Putt training day — Antoine Schwartz",  new Date(2026,8,3),  "Golf de La Boulie (FR)", "Dia inteiro"),
  ev("viag_paris_set", "✈ TP429 PARIS ORLY → LIS 10:15–11:55",    new Date(2026,8,4),  "TAP", ""),
  // Aterram sexta e seguem para a Comporta: sexta treino, sábado e domingo a
  // prova do PJA. É tudo Terras da Comporta — não vale a pena separar campos.
  ev("treino",         "⛳ Treino — Terras da Comporta",           new Date(2026,8,4),  "Terras da Comporta - Torre", "Treino"),
  ev("viag_paris_set", "✈ TP1695 LIS → FNC 22:20–00:10 (+1)",     new Date(2026,8,6),  "TAP", ""),
];

