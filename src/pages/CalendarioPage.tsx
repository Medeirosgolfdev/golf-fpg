/**
 * CalendarioPage.tsx — Calendário Multi-Fonte 2026
 *
 * Código de cores:
 *  • Azuis — CGSS Santo da Serra (Majors, O.M., Pares, Regional, etc.)
 *  • Violeta — Drive Challenge (todas as zonas)
 *  • Verde — Drive Tour (Sul/Norte/Tejo)
 *  • Esmeralda — Drive Tour Madeira
 *  • Índigo — Circuito AQUAPOR
 *  • Roxo — Torneios FPG
 *  • Vermelho/Laranja — Internacionais & Nacionais em destaque
 *
 * Drive Challenge/Tour Madeira: entradas do CGSS ocultadas
 * quando duplicam a mesma prova no calendário FPG.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import type { PlayersDb } from "../data/types";
import { isCalUnlocked } from "../utils/authConstants";
import { clickableA11y } from "../utils/a11y";
import { norm } from "../utils/format";
import PasswordGate from "../ui/PasswordGate";

/* ═══ Types ═══ */
interface CalEvent {
  id: number;
  title: string;
  date: Date;
  endDate?: Date;
  modalidade: string;
  campo: string;
  calId: string;
}

interface CalendarSource {
  id: string;
  name: string;
  color: string;
  group: "CGSS" | "DRIVE" | "FPG" | "DESTAQUE" | "VIAGENS" | "JUNIOR" | "ANIVER";
}

/* ═══ Calendar Sources ═══ */
const CALENDARS: CalendarSource[] = [
  // ── CGSS Santo da Serra — azuis ──
  { id: "cgss_major",     name: "Majors (A)",         color: "#1e3a8a", group: "CGSS" },
  { id: "cgss_om_b",      name: "O.M. Nível B",       color: "var(--chart-2)", group: "CGSS" },
  { id: "cgss_om_c",      name: "O.M. Nível C",       color: "#60a5fa", group: "CGSS" },
  { id: "cgss_pares",     name: "Camp. Pares",        color: "#0891b2", group: "CGSS" },
  { id: "cgss_ouro",      name: "Ranking Ouro",       color: "#0ea5e9", group: "CGSS" },
  { id: "cgss_patrocin",  name: "Patrocinador",       color: "var(--text-3)", group: "CGSS" },
  { id: "cgss_regional",  name: "Regional",           color: "#0284c7", group: "CGSS" },
  { id: "cgss_fpg",       name: "FPG Nacional",       color: "#4338ca", group: "CGSS" },

  // ── Junior CGSS — Academia ──
  { id: "jr_cgss",        name: "CGSS Jr",             color: "#f59e0b", group: "JUNIOR" },
  { id: "jr_regional",    name: "Regional Jr",         color: "#0d9488", group: "JUNIOR" },
  { id: "jr_fpg",         name: "FPG Jr",              color: "#e11d48", group: "JUNIOR" },

  // ── Drive — violeta / verde ──
  { id: "drive_chall",    name: "Drive Challenge",     color: "#8b5cf6", group: "DRIVE" },
  { id: "drive_tour",     name: "Drive Tour",          color: "#16a34a", group: "DRIVE" },
  { id: "drive_tour_mad", name: "Drive Tour Madeira",  color: "#059669", group: "DRIVE" },

  // ── FPG ──
  { id: "fpg_aquapor",    name: "Circuito AQUAPOR",    color: "#6366f1", group: "FPG" },
  { id: "fpg_torneios",   name: "Torneios FPG",        color: "#a855f7", group: "FPG" },

  // ── Destaque — vermelho / laranja ──
  { id: "dest_intl",      name: "Internacionais",      color: "#dc2626", group: "DESTAQUE" },
  { id: "dest_nac_jr",    name: "Nacional Sub14&18",    color: "#dc2626", group: "DESTAQUE" },
  { id: "dest_uskids",    name: "US Kids International",color: "#e11d48", group: "DESTAQUE" },
  { id: "dest_uskids_tbc",name: "US Kids (a confirmar)",color: "var(--text-muted)", group: "DESTAQUE" },
  { id: "dest_bjgt",      name: "BJGT",                color: "#be123c", group: "DESTAQUE" },
  { id: "dest_pja",       name: "PJA Tour",            color: "#d946ef", group: "DESTAQUE" },
  { id: "pessoal",        name: "🎂 Pessoal",          color: "#39ff14", group: "DESTAQUE" },

  // ── Aniversários por escalão ──
  { id: "bday_sub10",     name: "🎂 Sub-10",            color: "#f9a8d4", group: "ANIVER" },
  { id: "bday_sub12",     name: "🎂 Sub-12",            color: "#f472b6", group: "ANIVER" },
  { id: "bday_sub14",     name: "🎂 Sub-14",            color: "#ec4899", group: "ANIVER" },
  { id: "bday_sub16",     name: "🎂 Sub-16",            color: "#db2777", group: "ANIVER" },
  { id: "bday_sub18",     name: "🎂 Sub-18",            color: "#be185d", group: "ANIVER" },
  { id: "bday_pja",       name: "🎂 PJA",               color: "#d946ef", group: "ANIVER" },
  { id: "bday_outros",    name: "🎂 Outros",            color: "#a78bfa", group: "ANIVER" },
  { id: "ferias",         name: "🏖 Férias",            color: "#a3e635", group: "DESTAQUE" },
  { id: "treino",         name: "⛳ Campo / Treino",    color: "#10b981", group: "DESTAQUE" },

  // ── Viagens — laranja / âmbar ──
  { id: "viag_alg_fev",   name: "✈ Algarve (Fev)",      color: "#f59e0b", group: "VIAGENS" },
  { id: "viag_malaga",    name: "✈ Málaga (Fev)",        color: "#f97316", group: "VIAGENS" },
  { id: "viag_roma",      name: "✈ Roma (Mar)",          color: "#ef4444", group: "VIAGENS" },
  { id: "viag_alg_mar",   name: "✈ Algarve (Mar/Abr)",  color: "#eab308", group: "VIAGENS" },
  { id: "viag_edinb",     name: "✈ Edimburgo (Mai)",     color: "#06b6d4", group: "VIAGENS" },
];

const CAL_MAP = new Map(CALENDARS.map(c => [c.id, c]));

/* ═══ Events ═══ */
let _id = 0;
const ev = (calId: string, title: string, d: Date, campo: string, mod = "", end?: Date): CalEvent =>
  ({ id: ++_id, calId, title, date: d, endDate: end, campo, modalidade: mod });

const EVENTS: CalEvent[] = [

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
  // Julho
  ev("cgss_pares",    "IV Prova Camp. Clube de Pares",       new Date(2026,6,4),  "Santo da Serra", "Texas Scramble"),
  ev("cgss_major",    "Taça do Clube",                       new Date(2026,6,25), "Santo da Serra", "Medal"),
  // Agosto
  ev("cgss_om_c",     "Torneio CGSS Rali",                  new Date(2026,7,1),  "Santo da Serra", "Stableford"),
  ev("cgss_om_c",     "Torneio CGSS Summer",                new Date(2026,7,22), "Santo da Serra", "Stableford"),
  ev("cgss_fpg",      "Camp. Nacional de Clubes",           new Date(2026,7,25), "Pinhal",         "Strokeplay", new Date(2026,7,28)),
  ev("cgss_om_c",     "Torneio CGSS",                       new Date(2026,7,29), "Santo da Serra", "Stableford"),
  // Setembro
  ev("cgss_om_b",     "XIII Torneio Barbeito Madeira",      new Date(2026,8,12), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Porto Santo Colombos",               new Date(2026,8,19), "Porto Santo",    ""),
  // Outubro
  ev("cgss_om_c",     "Torneio Serras / São Martinho CGSS", new Date(2026,9,10), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Torneio CGEx ZMM",                   new Date(2026,9,4),  "Santo da Serra", "Stableford"),
  ev("cgss_major",    "Troféu João Sousa",                  new Date(2026,9,17), "Santo da Serra", "Stableford"),
  ev("cgss_pares",    "V Prova Camp. Clube de Pares",       new Date(2026,9,24), "Santo da Serra", "Stableford Agg"),
  ev("cgss_major",    "Taça Presidente",                    new Date(2026,9,31), "Santo da Serra", "Stableford"),
  // Novembro
  ev("cgss_om_c",     "Torneio de São Martinho CGSS",       new Date(2026,10,7), "Santo da Serra", "Stableford"),
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
  ev("jr_regional", "Camp. Regional de Clubes D1",         new Date(2026,5,20), "Santo da Serra", "Strokeplay"),
  ev("jr_regional", "Camp. Regional de Clubes D2",         new Date(2026,5,21), "Santo da Serra", "Strokeplay"),
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
  ev("drive_chall", "5º Torneio Drive Challenge Madeira",     new Date(2026,2,8),  "Santo da Serra",  "Strokeplay e Medal"),
  ev("drive_chall", "4º Torneio Drive Challenge Madeira",     new Date(2026,3,12), "Porto Santo",     "Strokeplay e Medal"),
  ev("drive_chall", "3º Torneio Drive Challenge Madeira",     new Date(2026,4,24), "Palheiro",        "Strokeplay e Medal"),
  ev("drive_chall", "6º Torneio Drive Challenge Madeira",     new Date(2026,5,28), "Porto Santo",     "Strokeplay e Medal"),
  ev("drive_chall", "7º Torneio Drive Challenge Madeira",     new Date(2026,6,11), "Santo da Serra",  "Strokeplay e Medal"),
  ev("drive_chall", "Final Regional Drive Challenge Madeira", new Date(2026,6,12), "Palheiro",        "Strokeplay e Medal"),

  /* ══════════════════════════════════════
     DRIVE TOUR — verde (Sul/Norte/Tejo)
     ══════════════════════════════════════ */
  // Sul
  ev("drive_tour", "1º Torneio Drive Tour Sul",   new Date(2026,0,11), "Laguna GC",    "Strokeplay e Medal"),
  ev("drive_tour", "2º Torneio Drive Tour Sul",   new Date(2026,1,1),  "Vila Sol",     "Strokeplay e Medal"),
  ev("drive_tour", "3º Torneio Drive Tour Sul",   new Date(2026,3,4),  "Penina (TBC)", "Strokeplay e Medal"),
  ev("drive_tour", "4º Torneio Drive Tour Sul",   new Date(2026,5,10), "Boavista",     "Strokeplay e Medal"),
  // Norte
  ev("drive_tour", "1º Torneio Drive Tour Norte", new Date(2026,0,4),  "Estela GC",      "Strokeplay e Medal"),
  ev("drive_tour", "2º Torneio Drive Tour Norte", new Date(2026,1,1),  "Amarante",       "Strokeplay e Medal"),
  ev("drive_tour", "3º Torneio Drive Tour Norte", new Date(2026,1,28), "Vale Pisão",     "Strokeplay e Medal", new Date(2026,2,1)),
  ev("drive_tour", "4º Torneio Drive Tour Norte", new Date(2026,3,19), "Ponte de Lima",  "Strokeplay e Medal"),
  // Tejo
  ev("drive_tour", "1º Torneio Drive Tour Tejo",  new Date(2026,0,4),  "Montado",        "Strokeplay e Medal"),
  ev("drive_tour", "2º Torneio Drive Tour Tejo",  new Date(2026,0,31), "Belas",          "Strokeplay e Medal"),
  ev("drive_tour", "3º Torneio Drive Tour Tejo",  new Date(2026,2,28), "St. Estêvão",    "Strokeplay e Medal", new Date(2026,2,29)),
  ev("drive_tour", "4º Torneio Drive Tour Tejo",  new Date(2026,3,12), "Lisbon SC",      "Strokeplay e Medal"),

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
  ev("fpg_aquapor", "5º Torneio do Circuito AQUAPOR",  new Date(2026,8,19), "TBC",                 "Strokeplay", new Date(2026,8,20)),
  ev("fpg_aquapor", "6º Torneio do Circuito AQUAPOR",  new Date(2026,9,17), "Estela",              "Strokeplay", new Date(2026,9,18)),
  ev("fpg_aquapor", "7º Torneio do Circuito AQUAPOR",  new Date(2026,10,14),"Belas CC",            "Strokeplay", new Date(2026,10,15)),

  /* ══════════════════════════════════════
     FPG — Torneios (roxo)
     ══════════════════════════════════════ */
  ev("fpg_torneios", "Taça Kendall",            new Date(2026,3,25), "Oporto GC",     "Strokeplay", new Date(2026,3,26)),
  ev("fpg_torneios", "Lisbon Cup",              new Date(2026,4,9),  "Lisbon SC",     "Strokeplay", new Date(2026,4,10)),
  ev("fpg_torneios", "Aberto do Estoril",       new Date(2026,4,23), "CG Estoril",    "Strokeplay", new Date(2026,4,24)),
  ev("fpg_torneios", "Taça RS Yeatman",         new Date(2026,5,20), "CG Miramar",    "Strokeplay", new Date(2026,5,21)),
  ev("fpg_torneios", "Taça Mendes D'Almeida",   new Date(2026,7,15), "Vidago Palace", "Strokeplay", new Date(2026,7,16)),
  ev("fpg_torneios", "Taça FPG",                new Date(2026,9,10), "Ribagolfe",     "Strokeplay e Match", new Date(2026,9,13)),

  /* ══════════════════════════════════════
     DESTAQUE — Internacionais (vermelho)
     ══════════════════════════════════════ */
  ev("dest_intl", "Faldo Series Madeira",                              new Date(2026,9,1),  "Santo da Serra",              "Strokeplay", new Date(2026,9,3)),
  ev("dest_intl", "63º Open de Portugal PGA",                          new Date(2026,8,17), "Aroeira I",                   "Strokeplay", new Date(2026,8,20)),
  ev("dest_intl", "2nd Castro Marim Portuguese International U14",     new Date(2026,11,4), "Championship Quinta do Vale", "Strokeplay", new Date(2026,11,6)),
  ev("dest_intl", "Greatgolf Junior Open — Luis Figo Foundation",      new Date(2026,1,15), "Vilamoura",                   "Strokeplay", new Date(2026,1,17)),

  /* ══════════════════════════════════════
     DESTAQUE — Camp. Nacional Sub14 & 18 (laranja)
     ══════════════════════════════════════ */
  ev("dest_nac_jr", "Camp. Nacional Clubes Sub14 & 18",  new Date(2026,2,31), "Oporto",  "Strokeplay", new Date(2026,3,2)),
  ev("dest_nac_jr", "Camp. Nacional de Jovens",          new Date(2026,4,1),  "Aroeira", "Strokeplay", new Date(2026,4,3)),

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
  ev("dest_pja", "PJA — Miramar Open",               new Date(2026,7,19), "CG Miramar",         "Strokeplay", new Date(2026,7,21)),
  ev("dest_pja", "PJA — Quinta do Peru",             new Date(2026,5,27), "Quinta do Peru",     "Strokeplay", new Date(2026,5,28)),
  ev("dest_pja", "PJA — Torre",                      new Date(2026,8,5),  "Torre",              "Strokeplay", new Date(2026,8,6)),
  ev("dest_pja", "PJA — Dunas — Grande Final",       new Date(2026,10,28),"Dunas",              "Strokeplay", new Date(2026,10,29)),

  /* ══════════════════════════════════════
     🎂 PESSOAL
     ══════════════════════════════════════ */
  ev("pessoal", "MANUEL 12 ANOS", new Date(2026,3,29), "", ""),
  ev("ferias",  "🐣 Férias da Páscoa", new Date(2026,2,28), "", "", new Date(2026,3,12)),

  /* ══════════════════════════════════════
     ⛳ CAMPO / TREINO
     ══════════════════════════════════════ */
  ev("treino", "Mypro Golf Algarve — Campo de Golf", new Date(2026,2,28), "Algarve", "", new Date(2026,3,4)),

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
];

/* ═══ Helpers ═══ */
const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function monthLabel(m: number) { return `${MONTHS_PT[m]} (${String(m + 1).padStart(2, "0")})`; }
const DAYS_SHORT = ["S","T","Q","Q","S","S","D"];
const DAYS_PT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]; // indexed by JS getDay()
const GROUP_LABELS: Record<string, string> = {
  CGSS: "CGSS — Santo da Serra",
  JUNIOR: "Junior CGSS — Academia",
  DRIVE: "Drive",
  FPG: "FPG — Federação",
  DESTAQUE: "Destaque",
  ANIVER: "🎂 Aniversários",
  VIAGENS: "✈ Viagens",
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: { date: Date; inMonth: boolean }[] = [];
  // Monday-first offset: (0=Mon ... 6=Sun)
  const offset = (first.getDay() + 6) % 7;
  for (let i = offset; i > 0; i--)
    days.push({ date: new Date(year, month, 1 - i), inMonth: false });
  for (let d = 1; d <= last.getDate(); d++)
    days.push({ date: new Date(year, month, d), inMonth: true });
  // fill to complete the last week (minimal trailing)
  const rem = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= rem; i++)
    days.push({ date: new Date(year, month + 1, i), inMonth: false });
  return days;
}
function eventOnDay(e: CalEvent, d: Date) {
  if (isSameDay(e.date, d)) return true;
  return !!(e.endDate && d >= e.date && d <= e.endDate);
}
function fmtRange(e: CalEvent): string {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (!e.endDate || isSameDay(e.date, e.endDate))
    return `${DAY_NAMES[e.date.getDay()]}, ${e.date.toLocaleDateString("pt-PT", o)} ${e.date.getFullYear()}`;
  return `${e.date.toLocaleDateString("pt-PT", o)} – ${e.endDate.toLocaleDateString("pt-PT", o)} ${e.date.getFullYear()}`;
}
function calColor(e: CalEvent): string { return CAL_MAP.get(e.calId)?.color ?? "var(--text-3)"; }

/* Highlighted "full-cell" events */
const HIGHLIGHT: Record<string, { bg: string; border: string; text: string; icon: string; cls: string }> = {
  pessoal:       { bg: "#39ff14", border: "#2ecc40", text: "#1a1a1a", icon: "🎂", cls: "hl-green" },
};
/* Events that get animated bars (pulse/glow/shine) but NOT full-cell */
const HL_BAR: Record<string, string> = {
  treino:      "hl-teal",
  dest_nac_jr: "hl-red",
};
function isHighlight(e: CalEvent) { return e.calId in HIGHLIGHT; }

type EvPos = "single" | "start" | "mid" | "end";
function getEvPos(e: CalEvent, day: Date, weekStart: Date, weekEnd: Date): EvPos {
  if (!e.endDate || isSameDay(e.date, e.endDate)) return "single";
  const effStart = e.date < weekStart ? weekStart : e.date;
  const effEnd = e.endDate > weekEnd ? weekEnd : e.endDate;
  const isS = isSameDay(day, effStart);
  const isE = isSameDay(day, effEnd);
  if (isS && isE) return "single";
  if (isS) return "start";
  if (isE) return "end";
  return "mid";
}

/** Sort events for consistent lane ordering: multi-day first (by start, then length desc), then single */
function sortEventsForGrid(evts: CalEvent[]): CalEvent[] {
  return [...evts].sort((a, b) => {
    const aMulti = a.endDate && !isSameDay(a.date, a.endDate) ? 1 : 0;
    const bMulti = b.endDate && !isSameDay(b.date, b.endDate) ? 1 : 0;
    if (aMulti !== bMulti) return bMulti - aMulti; // multi-day first
    if (aMulti && bMulti) {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) return diff;
      return (b.endDate!.getTime() - b.date.getTime()) - (a.endDate!.getTime() - a.date.getTime());
    }
    return a.date.getTime() - b.date.getTime();
  });
}

/* ═══ Sub-components ═══ */

function MiniCal({ year, month, onSelect, selected, visibleEvents }: {
  year: number; month: number; selected: Date | null;
  onSelect: (d: Date) => void; visibleEvents: CalEvent[];
}) {
  const days = getMonthDays(year, month);
  const today = new Date();
  return (
    <div className="cal-no-select">
      <div className="ta-c cal-week-grid">
        {DAYS_SHORT.map((d, i) => (
          <div key={i} className="fs-10 c-text-3 fw-600 cal-day-label">{d}</div>
        ))}
        {days.map((d, i) => {
          const isToday = isSameDay(d.date, today);
          const isSel = selected && isSameDay(d.date, selected);
          const has = visibleEvents.some(e => eventOnDay(e, d.date));
          return (
            <div key={i} onClick={() => onSelect(d.date)} {...clickableA11y(() => onSelect(d.date))} className="cal-day-cell" style={{
              color: !d.inMonth ? "var(--border)" : isToday ? "#fff" : isSel ? "var(--accent)" : "var(--text)",
              backgroundColor: isToday ? "var(--accent)" : isSel ? "var(--accent-light)" : "transparent",
              fontWeight: isToday || isSel ? 600 : 400,
            }}>
              {d.date.getDate()}
              {has && d.inMonth && !isToday && (
                <span className="cal-dot-indicator" style={{ width: 3, height: 3, background: "var(--accent)" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventPopup({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const color = calColor(event);
  const calName = CAL_MAP.get(event.calId)?.name ?? "";
  const ref = useRef<HTMLDivElement>(null);
  const hl = HIGHLIGHT[event.calId];
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 10);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div className="cal-overlay" style={{ backdropFilter: "blur(3px)" }}>
      <div ref={ref} style={{ background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-lg)", width: 380, overflow: "hidden", animation: "calPopIn 0.2s ease" }}>
        <div style={{ background: hl ? hl.bg : color,
          padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <span className="uppercase fw-600 fs-12" style={{ color: hl ? hl.text : "#fff", letterSpacing: "0.04em" }}>
            {calName}
          </span>
          <button onClick={onClose} style={{ background: hl ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)", border: "none",
            color: hl ? hl.text : "#fff",
            width: 26, height: 26, borderRadius: "50%", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div className="cal-sidebar">
          <div className="h-lg">{event.title}</div>
          <div className="flex-col-gap8">
            <InfoRow icon="📅" label={fmtRange(event)} />
            {event.modalidade && <InfoRow icon="🏌️" label={event.modalidade} />}
            {event.campo && <InfoRow icon="⛳" label={event.campo} />}
          </div>
        </div>
      </div>
    </div>
  );
}
function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (<div className="flex-center-gap8">
    <span className="cal-day-num">{icon}</span>
    <span className="fs-13 c-text-2">{label}</span>
  </div>);
}

function ListView({ events, onSelect }: { events: CalEvent[]; onSelect: (e: CalEvent) => void }) {
  const today = new Date();
  const grouped = useMemo(() => {
    const m = new Map<number, CalEvent[]>();
    for (const e of events) { const k = e.date.getMonth(); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);
  return (
    <div className="cal-page-inner">
      {grouped.map(([month, evts]) => (
        <div key={month}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase",
            letterSpacing: "0.04em", marginBottom: 8, paddingBottom: 4, borderBottom: "2px solid var(--accent-light)" }}>
            {monthLabel(month)} 2026
          </div>
          <div className="flex-col-gap4">
            {evts.map(e => {
              const c = calColor(e);
              const hl = HIGHLIGHT[e.calId];
              const isPast = (e.endDate || e.date) < today;
              return (
                <div key={e.id} onClick={() => onSelect(e)} {...clickableA11y(() => onSelect(e))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: hl ? 8 : "var(--radius)", cursor: "pointer", transition: "background 0.15s",
                    background: hl ? `${hl.bg}18` : "transparent",
                    border: hl ? `2px solid ${hl.bg}66` : "2px solid transparent",
                    opacity: isPast ? 0.45 : 1,
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = hl ? `${hl.bg}30` : "var(--bg-hover)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = hl ? `${hl.bg}18` : "transparent")}>
                  <div className="col-w42 ta-c flex-shrink-0">
 <div className="uppercase fw-500 fs-10" style={{ color: hl ? hl.border : "var(--text-3)" }}>{DAY_NAMES[e.date.getDay()]}</div>
 <div className="fw-600 fs-18" style={{ color: hl ? hl.border : "var(--text)", lineHeight: 1.2 }}>{e.date.getDate()}</div>
                  </div>
                  <div style={{ width: 4, alignSelf: "stretch", borderRadius: "var(--radius-xs)",
                    background: hl ? hl.bg : c, flexShrink: 0 }} />
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {hl ? `${hl.icon} ` : ""}{e.title}
                    </div>
                    <div className="fs-11 c-text-3 mt-4" >
                      {e.modalidade}{e.modalidade && " · "}{e.campo}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-lg)",
                    background: hl ? hl.bg : c,
                    color: hl ? hl.text : "#fff", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {CAL_MAP.get(e.calId)?.name ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {grouped.length === 0 && (
        <div className="ta-c c-text-3 p-40">Sem provas visíveis.</div>
      )}
    </div>
  );
}

/* ═══ Main Component ═══ */
type ViewMode = "month" | "list";
type GroupKey = "CGSS" | "JUNIOR" | "DRIVE" | "FPG" | "DESTAQUE" | "ANIVER" | "VIAGENS";

export default function CalendarioPage({ players }: { players?: PlayersDb }) {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return <CalendarioContent players={players} />;
}

function CalendarioContent({ players }: { players?: PlayersDb }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() === 2026 ? now.getMonth() : 1;
  });
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [enabledCals, setEnabledCals] = useState<Set<string>>(() => new Set(CALENDARS.map(c => c.id)));
  const [expandedCal, setExpandedCal] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  /* Generate birthday events from players */
  const allEvents = useMemo(() => {
    if (!players) return EVENTS;
    const bdayEvs: CalEvent[] = [];
    let bdayId = 90000;

    const escalaoToCalId: Record<string, string> = {
      "Sub-10": "bday_sub10", "Sub-12": "bday_sub12", "Sub-14": "bday_sub14",
      "Sub-16": "bday_sub16", "Sub-18": "bday_sub18",
    };

    for (const [fed, p] of Object.entries(players)) {
      if (!p.dob || p.tags?.includes("no-priority")) continue;
      const parts = p.dob.split("-");
      if (parts.length < 3) continue;
      const m = parseInt(parts[1], 10) - 1; // 0-indexed month
      const d = parseInt(parts[2], 10);
      if (isNaN(m) || isNaN(d) || d < 1 || d > 31) continue;
      const birthYear = parseInt(parts[0], 10);
      const age = 2026 - birthYear;
      const firstName = p.name.split(" ")[0];
      const isPJA = p.tags?.includes("PJA");
      const calId = isPJA ? "bday_pja" : (escalaoToCalId[p.escalao] || "bday_outros");
      bdayEvs.push({
        id: ++bdayId,
        calId,
        title: `🎂 ${firstName} — ${age} anos`,
        date: new Date(2026, m, d),
        campo: "",
        modalidade: `${p.name} · #${fed}`,
      });
    }
    return [...EVENTS, ...bdayEvs];
  }, [players]);

  const goToday = () => {
    const now = new Date();
    const m = now.getFullYear() === 2026 ? now.getMonth() : 1;
    setCurrentMonth(m);
    setSelectedDate(now.getFullYear() === 2026 ? now : null);
  };

  /* Search */
  const searchResults = useMemo(() => {
    const q = norm(searchQ);
    if (!q || q.length < 2) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return allEvents
      .filter(e => enabledCals.has(e.calId))
      .filter(e => {
        const hay = norm([e.title, e.campo, e.modalidade, CAL_MAP.get(e.calId)?.name || ""].join(" "));
        return words.every(w => hay.includes(w));
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 20);
  }, [searchQ, allEvents, enabledCals]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const goToEvent = (ev: CalEvent) => {
    setCurrentMonth(ev.date.getMonth());
    setSelectedDate(ev.date);
    setSelectedEvent(ev);
    setSearchOpen(false);
    setSearchQ("");
  };

  const toggleCal = (id: string) => setEnabledCals(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleGroup = (group: GroupKey) => {
    const ids = CALENDARS.filter(c => c.group === group).map(c => c.id);
    const allOn = ids.every(id => enabledCals.has(id));
    setEnabledCals(prev => {
      const next = new Set(prev);
      for (const id of ids) allOn ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibleEvents = useMemo(() =>
    allEvents.filter(e => enabledCals.has(e.calId)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [enabledCals, allEvents]
  );
  const monthDays = useMemo(() => getMonthDays(2026, currentMonth), [currentMonth]);
  const gridRows = monthDays.length / 7;
  const today = new Date();
  const groups: GroupKey[] = ["CGSS", "JUNIOR", "DRIVE", "FPG", "DESTAQUE", "ANIVER", "VIAGENS"];

  return (
    <div className="cal-page">
      <style>{`
        @keyframes calPopIn { from { transform: translateY(6px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes hlShine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes hlGlowGreen {
          0%, 100% { box-shadow: 0 0 4px 1px rgba(57,255,20,0.4); }
          50% { box-shadow: 0 0 14px 5px rgba(57,255,20,0.5); }
        }
        @keyframes hlGlowTeal {
          0%, 100% { box-shadow: 0 0 4px 1px rgba(16,185,129,0.4); }
          50% { box-shadow: 0 0 14px 5px rgba(16,185,129,0.5); }
        }
        @keyframes hlGlowRed {
          0%, 100% { box-shadow: 0 0 4px 1px rgba(220,38,38,0.4); }
          50% { box-shadow: 0 0 14px 5px rgba(220,38,38,0.5); }
        }
        .hl-cell {
          border-radius: 4px;
          position: relative;
          overflow: hidden;
        }
        .hl-cell::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%);
          background-size: 300% 100%;
          animation: hlShine 3s linear infinite;
          pointer-events: none;
          border-radius: 4px;
        }
        .hl-green  { animation: hlGlowGreen 2s ease-in-out infinite; }
        .hl-teal   { animation: hlGlowTeal 2s ease-in-out infinite; }
        .hl-red    { animation: hlGlowRed 2s ease-in-out infinite; }
        .hl-bar {
          position: relative;
          overflow: hidden;
        }
        .hl-bar::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%);
          background-size: 300% 100%;
          animation: hlShine 3s linear infinite;
          pointer-events: none;
          border-radius: inherit;
        }
      `}</style>

      {/* ── Sidebar ── */}
      <div className={`sidebar cal-sidebar-main ${sidebarOpen ? "" : "sidebar-closed"}`}>

        {/* Mini cal */}
        <div>
          <div className="flex-between-mb6">
            <span className="fs-13 fw-700 c-text">{monthLabel(currentMonth)} 2026</span>
            <div className="d-flex gap-2">
              <SmBtn l="‹" onClick={() => setCurrentMonth(m => Math.max(0, m - 1))} dis={currentMonth <= 0} />
              <SmBtn l="›" onClick={() => setCurrentMonth(m => Math.min(11, m + 1))} dis={currentMonth >= 11} />
            </div>
          </div>
          <MiniCal year={2026} month={currentMonth} selected={selectedDate} visibleEvents={visibleEvents}
            onSelect={d => { setSelectedDate(d); setCurrentMonth(d.getMonth()); }} />
        </div>

        {/* Calendar toggles */}
        <div className="flex-col-gap6">
          {groups.map(g => {
            const cals = CALENDARS.filter(c => c.group === g);
            const groupCount = allEvents.filter(e => cals.some(c => c.id === e.calId)).length;
            const allOn = cals.every(c => enabledCals.has(c.id));
            return (
              <div key={g}>
                <button onClick={() => toggleGroup(g)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "6px 4px", border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: "transparent", borderBottom: "1px solid var(--border-light)",
                }}>
                  <span style={{ width: 16, height: 16, borderRadius: "var(--radius-sm)", border: "2px solid var(--accent)",
                    background: allOn ? "var(--accent)" : "transparent", display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#fff", lineHeight: 1, transition: "all 0.15s" }}>
                    {allOn ? "✓" : ""}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", flex: 1, textAlign: "left",
                    textTransform: "uppercase", letterSpacing: "0.04em" }}>{GROUP_LABELS[g]}</span>
                  <span className="fs-10 c-text-3 mono">{groupCount}</span>
                </button>
                <div className="flex-col-gap1" style={{ paddingLeft: 8, marginTop: 2 }}>
                  {cals.map(cal => {
                    const calEvts = allEvents.filter(e => e.calId === cal.id).sort((a, b) => a.date.getTime() - b.date.getTime());
                    const isExpanded = expandedCal === cal.id;
                    return (
                      <div key={cal.id}>
                        <div className="flex-center" style={{ gap: 0 }}>
                          {/* Checkbox */}
                          <button onClick={() => toggleCal(cal.id)} style={{
                            width: 28, height: 26, border: "none", cursor: "pointer", background: "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
                          }}>
                            <span style={{
                              width: 12, height: 12, borderRadius: "var(--radius-xs)", transition: "all 0.15s",
                              background: enabledCals.has(cal.id) ? cal.color : "transparent",
                              border: `2px solid ${enabledCals.has(cal.id) ? cal.color : "var(--border)"}`,
                            }} />
                          </button>
                          {/* Name — click to expand */}
                          <button onClick={() => setExpandedCal(isExpanded ? null : cal.id)} style={{
                            flex: 1, display: "flex", alignItems: "center", gap: 4, minWidth: 0,
                            padding: "3px 4px", border: "none", cursor: "pointer", fontFamily: "inherit",
                            background: isExpanded ? "var(--accent-light)" : "transparent",
                            borderRadius: "var(--radius)", transition: "background 0.15s",
                          }}
                            onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "var(--bg-hover)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? "var(--accent-light)" : "transparent"; }}>
                            <span style={{
                              fontSize: 11, color: enabledCals.has(cal.id) ? "var(--text)" : "var(--text-3)",
                              flex: 1, textAlign: "left", fontWeight: isExpanded ? 600 : enabledCals.has(cal.id) ? 500 : 400,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{cal.name}</span>
                            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                              color: "var(--text-3)", flexShrink: 0 }}>{calEvts.length}</span>
                            <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, transition: "transform 0.15s",
                              transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
                          </button>
                        </div>
                        {/* Expanded event list */}
                        {isExpanded && (
                          <div className="cal-indent">
                            {calEvts.map(ev => {
                              const isPast = (ev.endDate || ev.date) < today;
                              const d = ev.date;
                              const dd = `${d.getDate()}/${d.getMonth() + 1}`;
                              return (
                                <button key={ev.id} onClick={() => {
                                  setCurrentMonth(d.getMonth());
                                  setSelectedDate(d);
                                  setSelectedEvent(ev);
                                }} style={{
                                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                                  padding: "3px 6px", border: "none", cursor: "pointer", fontFamily: "inherit",
                                  background: "transparent", borderRadius: "var(--radius)", transition: "background 0.12s",
                                  opacity: isPast ? 0.45 : 1,
                                }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                                    color: cal.color, fontWeight: 600, minWidth: 30, flexShrink: 0 }}>{dd}</span>
                                  <span style={{ fontSize: 10, color: "var(--text-2)", flex: 1, textAlign: "left",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main ── */}
 <div className="flex-1 d-flex flex-col overflow-hidden">
        <div style={{ display: "flex", alignItems: "center", padding: "10px 20px",
          borderBottom: "1px solid var(--border-light)", gap: 12, flexShrink: 0 }}>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <h2 className="cal-month-title">Calendário 2026</h2>
          <button onClick={goToday} className="p p-filter"
            style={{ opacity: 1 }}>
            Hoje
          </button>
          {/* Search */}
          <div ref={searchRef} style={{ position: "relative", flex: "0 1 220px", minWidth: 120 }}>
            <input
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => searchQ.length >= 2 && setSearchOpen(true)}
              placeholder="Pesquisar evento…"
              style={{
                width: "100%", padding: "5px 8px 5px 26px", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", fontSize: 11, fontFamily: "inherit",
                background: "var(--bg-card)", color: "var(--text)", outline: "none",
              }}
              onKeyDown={e => { if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); } }}
            />
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              fontSize: 12, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
            {searchOpen && searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "var(--bg-card)", border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                maxHeight: 320, overflowY: "auto", zIndex: 100,
              }}>
                {searchResults.map(ev => {
                  const cal = CAL_MAP.get(ev.calId);
                  const d = ev.date;
                  const dd = `${d.getDate()}/${d.getMonth() + 1}`;
                  return (
                    <button key={ev.id} onClick={() => goToEvent(ev)} style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "7px 10px", border: "none", cursor: "pointer", fontFamily: "inherit",
                      background: "transparent", borderBottom: "1px solid var(--border-light)",
                      transition: "background 0.1s", textAlign: "left",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                        background: cal?.color || "var(--text-3)",
                      }} />
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--text-3)", fontWeight: 600, minWidth: 32, flexShrink: 0 }}>{dd}</span>
                      <span style={{ fontSize: 11, color: "var(--text)", flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                      {ev.campo && <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>{ev.campo}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {searchOpen && searchQ.length >= 2 && searchResults.length === 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "var(--bg-card)", border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                padding: "12px 14px", fontSize: 11, color: "var(--text-3)", textAlign: "center",
              }}>
                Nenhum evento encontrado
              </div>
            )}
          </div>
          <div className="escalao-pills" style={{ marginLeft: "auto" }}>
            {(["month", "list"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`p p-filter${viewMode === v ? " active" : ""}`}
              >{v === "month" ? "Mês" : "Lista"}</button>
            ))}
          </div>
          <span className="fs-11 c-text-3 mono">
            {visibleEvents.length} provas
          </span>
          <div className="flex-center-gap6" style={{ marginLeft: 12 }}>
            <button onClick={() => setCurrentMonth(m => Math.max(0, m - 1))} disabled={currentMonth <= 0}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--border)",
                background: "var(--bg-card)", cursor: currentMonth <= 0 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, color: currentMonth <= 0 ? "var(--border)" : "var(--text-2)",
                transition: "all 0.15s",
              }}>‹</button>
            <span style={{
              fontSize: 15, fontWeight: 700, color: "var(--text)", minWidth: 190, textAlign: "center",
            }}>
              {monthLabel(currentMonth)} 2026
            </span>
            <button onClick={() => setCurrentMonth(m => Math.min(11, m + 1))} disabled={currentMonth >= 11}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--border)",
                background: "var(--bg-card)", cursor: currentMonth >= 11 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, color: currentMonth >= 11 ? "var(--border)" : "var(--text-2)",
                transition: "all 0.15s",
              }}>›</button>
          </div>
        </div>

        <div className="flex-1 scroll-y scroll-y">
          {viewMode === "month" ? (
            <div className="cal-content">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)",
                borderBottom: "1px solid var(--border-light)", marginBottom: 4 }}>
                {DAYS_PT.map((d, i) => (
                  <div key={i} style={{ textAlign: "center", padding: "8px 0", fontSize: 11,
                    fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{d}</div>
                ))}
              </div>
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `repeat(${gridRows},1fr)` }}>
                {monthDays.map((d, i) => {
                  const dayEvts = sortEventsForGrid(visibleEvents.filter(e => eventOnDay(e, d.date)));
                  const isToday = isSameDay(d.date, today);
                  const isSel = selectedDate && isSameDay(d.date, selectedDate);
                  const hlEvt = dayEvts.find(e => isHighlight(e));
                  const weekIdx = Math.floor(i / 7);
                  const weekStart = monthDays[weekIdx * 7].date;
                  const weekEnd = monthDays[weekIdx * 7 + 6].date;
                  const CP = 4;

                  // Highlight cell: full colored square with icon + label
                  if (hlEvt && d.inMonth) {
                    const hl = HIGHLIGHT[hlEvt.calId];
                    // For multi-day: show title only on first day
                    const isFirst = isSameDay(d.date, hlEvt.date);
                    const titleLines = hlEvt.title.split(/\s*[—–-]\s*/).filter(Boolean);
                    return (
                      <div key={i} onClick={() => setSelectedEvent(hlEvt)} {...clickableA11y(() => setSelectedEvent(hlEvt))}
                        className={`hl-cell ${hl.cls}`}
                        style={{
                          background: hl.bg, border: `2px solid ${hl.border}`,
                          cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          padding: 4, overflow: "hidden", transition: "filter 0.15s",
                        }}
                        onMouseEnter={ev => (ev.currentTarget.style.filter = "brightness(1.1)")}
                        onMouseLeave={ev => (ev.currentTarget.style.filter = "none")}>
 <div className="fs-10 fw-800" style={{ color: hl.text, opacity: 0.5 }}>
                          <span className="fs-8">{MONTHS_SHORT[d.date.getMonth()]}</span> {d.date.getDate()}
                        </div>
                        <div className="fs-14" style={{ lineHeight: 1 }}>{hl.icon}</div>
                        {isFirst ? (
                          <div style={{ fontSize: 10, fontWeight: 900, color: hl.text, textAlign: "center",
                            lineHeight: 1.1, letterSpacing: "0.02em", marginTop: 1 }}>
                            {titleLines.map((l, j) => <div key={j}>{l}</div>)}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, fontWeight: 700, color: hl.text, opacity: 0.6, textAlign: "center",
                            lineHeight: 1.1, marginTop: 1 }}>
                            {hlEvt.title}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={i} onClick={() => setSelectedDate(d.date)} {...clickableA11y(() => setSelectedDate(d.date))}
                      style={{
                      borderRight: "1px solid var(--border-light)",
                      borderBottom: "1px solid var(--border-light)",
                      padding: CP, overflow: "hidden", cursor: "pointer",
                      background: isSel ? "var(--accent-light)" : "transparent",
                      transition: "background 0.12s",
                    }}
                      onMouseEnter={ev => { if (!isSel) ev.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={ev => { if (!isSel) ev.currentTarget.style.background = isSel ? "var(--accent-light)" : "transparent"; }}>
                      <div style={{ fontSize: 11,
                        fontWeight: isToday ? 700 : 500,
                        minHeight: 22, borderRadius: "var(--radius-lg)", padding: "1px 4px",
                        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2px",
                        color: !d.inMonth ? "var(--text-3)" : isToday ? "#fff" : "var(--text)",
                        background: isToday ? "var(--accent)" : !d.inMonth ? "var(--bg-hover)" : "transparent",
                        gap: 2, whiteSpace: "nowrap" }}>
 <span className="fw-600 fs-10" style={{ opacity: !d.inMonth ? 0.7 : 0.45 }}>{MONTHS_SHORT[d.date.getMonth()]}</span>
                        {d.date.getDate()}
                      </div>
                      {dayEvts.slice(0, 3).map(e => {
                        const isPast = (e.endDate || e.date) < today;
                        const pos = getEvPos(e, d.date, weekStart, weekEnd);
                        const showTitle = pos === "single" || pos === "start";
                        const barCls = HL_BAR[e.calId];
                        const bRadius =
                          pos === "start" ? "3px 0 0 3px" :
                          pos === "end"   ? "0 3px 3px 0" :
                          pos === "mid"   ? "0" : "3px";
                        return (
                        <div key={e.id} role="button" tabIndex={0} onClick={ev => { ev.stopPropagation(); setSelectedEvent(e); }} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setSelectedEvent(e); } }}
                          title={e.title}
                          className={barCls ? `hl-bar ${barCls}` : undefined}
                          style={{
                            fontSize: 10,
                            padding: showTitle ? "1px 5px" : "1px 0",
                            marginBottom: 1,
                            marginLeft:  (pos === "mid" || pos === "end") ? -CP : 0,
                            marginRight: (pos === "mid" || pos === "start") ? -CP : 0,
                            borderRadius: bRadius,
                            background: calColor(e),
                            color: "#fff", overflow: "hidden", whiteSpace: "nowrap",
                            textOverflow: "ellipsis", cursor: "pointer",
                            fontWeight: 600, lineHeight: 1.6,
                            opacity: isPast ? 0.4 : 1,
                            minHeight: pos !== "single" && !showTitle ? 16 : undefined,
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={ev => (ev.currentTarget.style.opacity = String(isPast ? 0.55 : 0.85))}
                          onMouseLeave={ev => (ev.currentTarget.style.opacity = String(isPast ? 0.4 : 1))}>
                          {showTitle ? e.title : "\u00A0"}
                        </div>
                        );
                      })}
                      {dayEvts.length > 3 && (
                        <div className="fs-9 c-text-3 ta-c fw-600">+{dayEvts.length - 3} mais</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ListView events={visibleEvents} onSelect={setSelectedEvent} />
          )}
        </div>
      </div>

      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

function SmBtn({ l, onClick, dis }: { l: string; onClick: () => void; dis?: boolean }) {
  return (
    <button onClick={onClick} disabled={dis} style={{
      background: "none", border: "none", cursor: dis ? "default" : "pointer",
      fontSize: 16, color: dis ? "var(--border)" : "var(--text-3)",
      width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 0,
    }}>{l}</button>
  );
}
