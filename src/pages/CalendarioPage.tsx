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
import { C } from "../utils/colors";
import type { PlayersDb } from "../data/types";
import { useAppContext } from "../context/AppContext";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import { useIsMobile } from "../hooks/useIsMobile";
import { clickableA11y } from "../utils/a11y";
import { norm } from "../utils/format";
import { schoolDay, isFreeDay, freeDayReason } from "../data/schoolCalendar";
import { MONTHS_PT as MONTHS_SHORT, MONTHS_PT_LONG } from "../utils/format";

/* ═══ Types ═══ */
interface CalEvent {
  id: number;
  title: string;
  date: Date;
  endDate?: Date;
  modalidade: string;
  campo: string;
  calId: string;
  note?: string;   // alerta destacado no popup do evento (ex: data corrigida)
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
  { id: "cgss_major",     name: "Majors (A)",         color: C.cal.cgss_major, group: "CGSS" },
  { id: "cgss_om_b",      name: "O.M. Nível B",       color: "var(--chart-2)", group: "CGSS" },
  { id: "cgss_om_c",      name: "O.M. Nível C",       color: C.cal.cgss_om_c, group: "CGSS" },
  { id: "cgss_pares",     name: "Camp. Pares",        color: C.cal.cgss_pares, group: "CGSS" },
  { id: "cgss_ouro",      name: "Ranking Ouro",       color: C.cal.cgss_ouro, group: "CGSS" },
  { id: "cgss_patrocin",  name: "Patrocinador",       color: "var(--text-3)", group: "CGSS" },
  { id: "cgss_regional",  name: "Regional",           color: C.cal.cgss_regional, group: "CGSS" },
  { id: "cgss_fpg",       name: "FPG Nacional",       color: C.cal.cgss_fpg, group: "CGSS" },

  // ── Junior CGSS — Academia ──
  { id: "jr_cgss",        name: "CGSS Jr",             color: C.cal.jr_cgss, group: "JUNIOR" },
  { id: "jr_regional",    name: "Regional Jr",         color: C.cal.jr_regional, group: "JUNIOR" },
  { id: "jr_fpg",         name: "FPG Jr",              color: C.cal.dest_uskids, group: "JUNIOR" },

  // ── Drive — violeta / verde ──
  { id: "drive_chall",    name: "Drive Challenge",     color: C.cal.drive_chall, group: "DRIVE" },
  { id: "drive_tour",     name: "Drive Tour",          color: C.cal.drive_tour, group: "DRIVE" },
  { id: "drive_tour_mad", name: "Drive Tour Madeira",  color: C.cal.drive_tour_mad, group: "DRIVE" },

  // ── FPG ──
  { id: "fpg_aquapor",    name: "Circuito AQUAPOR",    color: C.cal.fpg_aquapor, group: "FPG" },
  { id: "fpg_torneios",   name: "Torneios FPG",        color: C.cal.fpg_torneios, group: "FPG" },

  // ── Destaque — vermelho / laranja ──
  { id: "dest_intl",      name: "Internacionais",      color: C.cal.dest_intl, group: "DESTAQUE" },
  { id: "dest_nac_jr",    name: "Nacional Sub14&18",    color: C.cal.dest_intl, group: "DESTAQUE" },
  { id: "dest_uskids",    name: "US Kids International",color: C.cal.dest_uskids, group: "DESTAQUE" },
  { id: "dest_uskids_tbc",name: "US Kids (a confirmar)",color: "var(--text-muted)", group: "DESTAQUE" },
  { id: "dest_bjgt",      name: "BJGT",                color: C.cal.dest_bjgt, group: "DESTAQUE" },
  { id: "dest_pja",       name: "PJA Tour",            color: C.cal.dest_pja, group: "DESTAQUE" },
  { id: "pessoal",        name: "🎂 Pessoal",          color: C.cal.pessoal, group: "DESTAQUE" },
  { id: "profissao_fe",   name: "✝ Profissão de Fé",   color: C.cal.profissao_fe, group: "DESTAQUE" },
  { id: "irma_bad",       name: "🏸 Maria Antónia (irmã)", color: C.cal.irma_bad, group: "DESTAQUE" },

  // ── Aniversários por escalão ──
  { id: "bday_sub10",     name: "🎂 Sub-10",            color: C.cal.bday_sub10, group: "ANIVER" },
  { id: "bday_sub12",     name: "🎂 Sub-12",            color: C.cal.bday_sub12, group: "ANIVER" },
  { id: "bday_sub14",     name: "🎂 Sub-14",            color: C.cal.bday_sub14, group: "ANIVER" },
  { id: "bday_sub16",     name: "🎂 Sub-16",            color: C.cal.bday_sub16, group: "ANIVER" },
  { id: "bday_sub18",     name: "🎂 Sub-18",            color: C.cal.bday_sub18, group: "ANIVER" },
  { id: "bday_pja",       name: "🎂 PJA",               color: C.cal.dest_pja, group: "ANIVER" },
  { id: "bday_outros",    name: "🎂 Outros",            color: C.cal.bday_outros, group: "ANIVER" },
  { id: "ferias",         name: "🏖 Férias",            color: C.cal.ferias, group: "DESTAQUE" },
  { id: "treino",         name: "⛳ Campo / Treino",    color: C.cal.treino, group: "DESTAQUE" },
  { id: "colonias",       name: "🏕 Colónias",          color: C.cal.colonias, group: "DESTAQUE" },

  // ── Viagens — laranja / âmbar ──
  { id: "viag_alg_fev",   name: "✈ Algarve (Fev)",      color: C.cal.jr_cgss, group: "VIAGENS" },
  { id: "viag_malaga",    name: "✈ Málaga (Fev)",        color: C.cal.viag_malaga, group: "VIAGENS" },
  { id: "viag_roma",      name: "✈ Roma (Mar)",          color: C.cal.viag_roma, group: "VIAGENS" },
  { id: "viag_alg_mar",   name: "✈ Algarve (Mar/Abr)",  color: C.cal.viag_alg_mar, group: "VIAGENS" },
  { id: "viag_edinb",     name: "✈ Edimburgo (Mai)",     color: C.cal.viag_edinb, group: "VIAGENS" },
  { id: "viag_jun",         name: "✈ Lisboa Jun · Manuel + M. Francisco",        color: C.cal.viag_roma,        group: "VIAGENS" },
  { id: "viag_par_jul",     name: "✈ Paris Jul · Manuel + M. Francisco",        color: C.cal.viag_edinb,       group: "VIAGENS" },
  { id: "viag_alg_jul_m",   name: "✈ Algarve Jul · Manuel+2",                  color: C.cal.viag_alg_jul_m,   group: "VIAGENS" },
  { id: "viag_alg_jul_mamf",name: "✈ Algarve Jul · Mariana + M. Francisco",   color: C.cal.viag_alg_jul_mamf,group: "VIAGENS" },
  { id: "viag_vce_ago",     name: "✈ Veneza + Porto Ago (prov.)",             color: C.cal.viag_vce_ago,     group: "VIAGENS" },
  { id: "viag_malaga_nov",  name: "✈ Málaga Nov · Spanish Open",              color: C.cal.viag_malaga_nov,  group: "VIAGENS" },
  { id: "viag_paris_set",   name: "✈ Paris + Comporta (Set)",                  color: C.cal.viag_paris_set,   group: "VIAGENS" },
];

const CAL_MAP = new Map(CALENDARS.map(c => [c.id, c]));

/* ═══ Correções manuais de datas de nascimento (aniversários) ═══
   ⚠ TRAVA: estas datas GANHAM sempre ao players.json no calendário.
   Mesmo que o scraper da FPG volte a reescrever players.json com a data
   errada, o aniversário mostrado aqui mantém-se correcto e exibe uma nota
   de alerta no evento. Chave = nfed (número de federado). */
const DOB_OVERRIDES: Record<string, { dob: string; note: string }> = {
  // Ricardo Castro Ferreira — a FPG traz "2015-07-02" (dia/mês TROCADOS).
  // Nasceu a 7 de FEVEREIRO de 2015, não 2 de Julho.
  "49085": { dob: "2015-02-07", note: "⚠ Data certa: 7 de Fevereiro (não Julho)" },
};

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
  ev("cgss_ouro",     "III Aberto CGSS 2026",                new Date(2026,5,7),  "Santo da Serra", "Strokeplay"),
  // Julho
  ev("cgss_pares",    "III Prova Camp. Clube de Pares",      new Date(2026,6,4),  "Santo da Serra", "Texas Scramble"),
  ev("cgss_patrocin", "Expresso BPI Golf Cup QR",            new Date(2026,6,18), "Santo da Serra", "Texas Scramble"),
  ev("cgss_patrocin", "Expresso BPI Golf Cup MF",            new Date(2026,6,19), "Santo da Serra", "Texas Scramble"),
  ev("cgss_major",    "Taça do Clube",                       new Date(2026,6,25), "Santo da Serra", "Medal"),
  ev("cgss_ouro",     "IV Aberto CGSS 2026",                 new Date(2026,6,26), "Santo da Serra", "Strokeplay"),
  // Agosto
  ev("cgss_om_c",     "Torneio CGSS Rali",                  new Date(2026,7,1),  "Santo da Serra", "Stableford"),
  ev("cgss_om_c",     "Torneio CGSS Summer",                new Date(2026,7,22), "Santo da Serra", "Stableford"),
  ev("cgss_fpg",      "Camp. Nacional de Clubes",           new Date(2026,7,25), "Pinhal",         "Strokeplay", new Date(2026,7,28)),
  ev("cgss_om_c",     "Torneio CGSS",                       new Date(2026,7,29), "Santo da Serra", "Stableford"),
  // Setembro
  ev("cgss_om_b",     "XIII Torneio Barbeito Madeira",      new Date(2026,8,12), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Torneio Pérola do Atlântico (SCP Golfe)", new Date(2026,8,14), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Taça Prof. Ernâni Lopes",            new Date(2026,8,18), "Santo da Serra", "Stableford"),
  ev("cgss_patrocin", "Porto Santo Colombos",               new Date(2026,8,19), "Porto Santo",    ""),
  ev("cgss_pares",    "IV Prova Camp. Clube de Pares",      new Date(2026,8,26), "Santo da Serra", "Texas Scramble"),
  // Outubro
  ev("cgss_patrocin", "Torneio 50 Anos de Autonomia",       new Date(2026,9,3),  "Santo da Serra", "Stableford", new Date(2026,9,4)),
  ev("cgss_major",    "Troféu João Sousa",                  new Date(2026,9,10), "Santo da Serra", "Stableford"),
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
  // Final Nacional
  ev("drive_tour", "Final Drive Tour",            new Date(2026,10,7), "Oeiras Green Valley (Lisboa)", "Strokeplay e Medal", new Date(2026,10,8)),

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
  ev("dest_intl", "Faldo Series Madeira",                              new Date(2026,9,16),  "Santo da Serra",              "Strokeplay", new Date(2026,9,18)),
  ev("dest_intl", "63º Open de Portugal PGA",                          new Date(2026,8,17), "Aroeira I",                   "Strokeplay", new Date(2026,8,20)),
  ev("dest_intl", "2nd Castro Marim Portuguese International U14",     new Date(2026,11,4), "Championship Quinta do Vale", "Strokeplay", new Date(2026,11,6)),
  ev("dest_intl", "Greatgolf Junior Open — Luis Figo Foundation",      new Date(2026,1,15), "Vilamoura",                   "Strokeplay", new Date(2026,1,17)),
  ev("dest_intl", "World Kids Golf 2026 by Amendoeira",                new Date(2026,6,29), "Amendoeira",                  "3R Strokeplay (jantar de encerramento)", new Date(2026,6,31)),

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
  ev("dest_pja", "VIII Miramar Internacional Open U25", new Date(2026,7,19), "CG Miramar",       "3R Strokeplay", new Date(2026,7,21)),
  ev("dest_pja", "PJA — Quinta do Peru",             new Date(2026,5,27), "Quinta do Peru",     "Strokeplay", new Date(2026,5,28)),
  ev("dest_pja", "PJA — Torre",                      new Date(2026,8,5),  "Torre",              "Strokeplay"),
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
  // Aterram sexta e seguem para a Comporta; regressam domingo à noite.
  ev("treino",         "⛳ Terras da Comporta — Dunas",            new Date(2026,8,4),  "Terras da Comporta - Dunas", "", new Date(2026,8,6)),
  ev("viag_paris_set", "✈ TP1695 LIS → FNC 22:20–00:10 (+1)",     new Date(2026,8,6),  "TAP", ""),
];

/* ═══ Helpers ═══ */
function monthLabel(m: number) { return `${MONTHS_PT_LONG[m]} (${String(m + 1).padStart(2, "0")})`; }
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
  pessoal:       { bg: C.cal.hl_pessoal_bg, border: C.cal.hl_pessoal_border, text: C.cal.hl_pessoal_text, icon: "🎂", cls: "hl-green" },
};
/* Events that get animated bars (pulse/glow/shine) but NOT full-cell */
const HL_BAR: Record<string, string> = {
  treino:       "hl-teal",
  dest_nac_jr:  "hl-red",
  profissao_fe: "hl-gold",
};
function isHighlight(e: CalEvent) { return e.calId in HIGHLIGHT; }

/** Já passou? Compara-se por DIA: um evento de hoje ainda é de hoje, mesmo
 *  que a hora já tenha passado. (Com `new Date()` cru, tudo o que era de hoje
 *  nascia esbatido a partir da meia-noite.) */
function jaPassou(e: CalEvent, hoje: Date): boolean {
  const fim = e.endDate || e.date;
  const f = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime();
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  return f < h;
}

/* ═══ O que é DELE ═══
   O calendário mistura duas coisas: a agenda do Manuel e o calendário geral do
   clube/federação, que é o pano de fundo onde ela se insere. As provas em que
   ele NÃO entra ficam esbatidas — continuam lá, para se perceber o contexto e
   as sobreposições, mas deixam de disputar a atenção com o que ele vai jogar.

   ⚠ A regra é por CALENDÁRIO, não por prova: quem decide é a natureza do
   evento. As excepções (uma prova de adultos que ele foi jogar, ou uma prova
   juvenil que ele falha) marcam-se à mão em MANUEL_EXCEPCOES, pelo título. */
const NAO_DELE = new Set<string>([
  "cgss_pares",       // Campeonato do Clube de Pares — prova de duplas de sócios
  "cgss_ouro",        // Ranking Ouro — provas dos adultos do clube
  "cgss_patrocin",    // torneios de patrocinador (Diário de Notícias, BPI, …)
  "cgss_regional",    // Campeonatos Regionais Absolutos
  "cgss_fpg",         // Campeonatos Nacionais Absolutos / de Clubes
  "dest_intl",        // circuito profissional (Open de Portugal, …)
  "irma_bad",         // badminton da irmã
  "bday_sub10", "bday_sub12", "bday_sub14", "bday_sub16", "bday_sub18",
  "bday_pja", "bday_outros",   // aniversários dos outros miúdos
]);
/** Excepções por título (`includes`, sem maiúsculas/acentos a contar). */
const MANUEL_EXCEPCOES: string[] = [];
function isDele(e: CalEvent): boolean {
  if (MANUEL_EXCEPCOES.some(x => norm(e.title).includes(norm(x)))) return true;
  return !NAO_DELE.has(e.calId);
}
/** Quanto se vê um evento. A agenda do Manuel a 100%; o calendário do clube
 *  em surdina; os aniversários dos outros miúdos ainda mais abaixo — são
 *  muitos e diários, e a cheio tapavam o resto. */
function opacidadeDe(e: CalEvent): number {
  if (isDele(e)) return 1;
  return e.calId.startsWith("bday_") ? 0.3 : 0.45;
}


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
          // Pano de fundo do ano lectivo: os dias COM aulas ficam esbatidos, para
          // se ver de relance se uma viagem cai em período de escola. Os dias
          // úteis sem aulas (interrupções, mid-term, conference days) ficam
          // limpos e dizem o motivo ao passar o rato.
          const sd = schoolDay(d.date);
          const livreMini = isFreeDay(d.date);
          return (
            <div key={i} onClick={() => onSelect(d.date)} {...clickableA11y(() => onSelect(d.date))} className="cal-day-cell" style={{
              color: !d.inMonth ? "var(--border)" : isToday ? "#fff" : isSel ? "var(--accent)" : "var(--text)",
              backgroundColor: isToday ? "var(--accent)" : isSel ? "var(--accent-light)" : livreMini ? "var(--cal-livre-bg)" : "transparent",
              fontWeight: isToday || isSel ? 600 : 400,
            }} title={livreMini ? `Livre — ${freeDayReason(d.date)}` : sd.tipo === "aulas" ? `Escola — ${sd.periodo}` : undefined}>
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
          <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ background: hl ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)", border: "none",
            color: hl ? hl.text : "#fff",
            width: 26, height: 26, borderRadius: "50%", cursor: "pointer", fontSize: "var(--fs-14)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div className="cal-sidebar">
          <div className="h-lg">{event.title}</div>
          <div className="d-flex flex-col gap-8">
            <InfoRow icon="📅" label={fmtRange(event)} />
            {event.modalidade && <InfoRow icon="🏌️" label={event.modalidade} />}
            {event.campo && <InfoRow icon="⛳" label={event.campo} />}
          </div>
          {event.note && (
            <div className="fs-12 fw-600" style={{ marginTop: 12, padding: "8px 10px",
              borderRadius: "var(--radius)", background: "var(--bg-warn)",
              border: "1px solid var(--color-warn)", color: "var(--color-warn-dark)" }}>
              {event.note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (<div className="d-flex items-center gap-8">
    <span className="cal-day-num">{icon}</span>
    <span className="fs-13 c-text-2">{label}</span>
  </div>);
}

function ListView({ events, onSelect, scrollSignal = 0 }: { events: CalEvent[]; onSelect: (e: CalEvent) => void; scrollSignal?: number }) {
  const today = new Date();
  const todayMonthRef = useRef<HTMLDivElement>(null);
  const firstUpcomingRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => {
    const m = new Map<number, CalEvent[]>();
    for (const e of events) { const k = e.date.getMonth(); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e); }
    const all = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const cur = today.getMonth();
    return [...all.filter(([k]) => k >= cur), ...all.filter(([k]) => k < cur)];
  }, [events]);

  // Primeiro evento hoje-ou-futuro — para ancorar o scroll no DIA (não só no mês).
  const todayKey = useMemo(() => {
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const up = events.find(e => {
      const ed = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate()).getTime();
      return ed >= t0;
    });
    return up?.id ?? null;
  }, [events]);

  useEffect(() => {
    const target = firstUpcomingRef.current || todayMonthRef.current;
    target?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [todayKey, scrollSignal]);
  return (
    <div className="cal-page-inner">
      {grouped.map(([month, evts]) => {
        const isCur = month === today.getMonth();
        return (
        <div key={month} ref={isCur ? todayMonthRef : undefined}>
          <div className="uppercase fs-13 fw-700" style={{ color: "var(--accent)",
            letterSpacing: "0.04em", marginBottom: 8, paddingBottom: 4, borderBottom: "2px solid var(--accent-light)" }}>
            {monthLabel(month)} 2026
          </div>
          <div className="d-flex flex-col gap-4">
            {evts.map(e => {
              const c = calColor(e);
              const hl = HIGHLIGHT[e.calId];
              const isPast = jaPassou(e, today);
              const isFirstUpcoming = e.id === todayKey;
              return (
                <div key={e.id}
                  ref={isFirstUpcoming ? firstUpcomingRef : undefined}
                  onClick={() => onSelect(e)} {...clickableA11y(() => onSelect(e))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: hl ? 8 : "var(--radius)", cursor: "pointer", transition: "background 0.15s",
                    background: hl ? `${hl.bg}18` : "transparent",
                    border: hl ? `2px solid ${hl.bg}66` : "2px solid transparent",
                    opacity: isPast ? 0.45 : opacidadeDe(e),
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = hl ? `${hl.bg}30` : "var(--bg-hover)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = hl ? `${hl.bg}18` : "transparent")}>
                  <div className="col-w42 ta-c shrink-0">
 <div className="uppercase fw-500 fs-10" style={{ color: hl ? hl.border : "var(--text-3)" }}>{DAY_NAMES[e.date.getDay()]}</div>
 <div className="fw-600 fs-18" style={{ color: hl ? hl.border : "var(--text)", lineHeight: 1.2 }}>{e.date.getDate()}</div>
                  </div>
                  <div style={{ width: 4, alignSelf: "stretch", borderRadius: "var(--radius-xs)",
                    background: hl ? hl.bg : c, flexShrink: 0 }} />
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div className="text-ellipsis fs-13 fw-600" style={{ color: "var(--text)" }}>
                      {hl ? `${hl.icon} ` : ""}{e.title}
                    </div>
                    <div className="fs-11 c-text-3 mt-4" >
                      {e.modalidade}{e.modalidade && " · "}{e.campo}
                    </div>
                  </div>
                  <span className="fs-10 fw-600" style={{ padding: "2px 8px", borderRadius: "var(--radius-lg)",
                    background: hl ? hl.bg : c,
                    color: hl ? hl.text : "#fff", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {CAL_MAP.get(e.calId)?.name ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
      {grouped.length === 0 && (
        <div className="ta-c c-text-3 p-40">Sem provas visíveis.</div>
      )}
    </div>
  );
}

/* ═══ Main Component ═══ */
type ViewMode = "month" | "list";
type GroupKey = "CGSS" | "JUNIOR" | "DRIVE" | "FPG" | "DESTAQUE" | "ANIVER" | "VIAGENS";

export default function CalendarioPage() {
  const { players } = useAppContext();
  const { unlocked, unlock } = usePasswordGate();

  if (!unlocked) return <PasswordGate onUnlock={unlock} />;

  return <CalendarioContent players={players} />;
}

function CalendarioContent({ players }: { players?: PlayersDb }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() === 2026 ? now.getMonth() : 1;
  });
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  // Em mobile, abrir por defeito em "list" — o grid mensal de 7 colunas
  // fica muito apertado em telemóveis. Lazy init para só ser avaliado 1×.
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth <= 768 ? "list" : "month"
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayPopup, setDayPopup] = useState<Date | null>(null);
  const BDAY_IDS_OFF = ["bday_sub10","bday_sub12","bday_sub14","bday_sub16","bday_sub18","bday_outros"];
  const [enabledCals, setEnabledCals] = useState<Set<string>>(
    () => new Set(CALENDARS.map(c => c.id).filter(id => !BDAY_IDS_OFF.includes(id)))
  );
  const [expandedCal, setExpandedCal] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
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
      const ovr = DOB_OVERRIDES[fed];        // correcção manual ganha ao players.json
      const dobStr = ovr?.dob ?? p.dob;
      if (!dobStr || p.tags?.includes("no-priority")) continue;
      const parts = dobStr.split("-");
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
        note: ovr?.note,
      });
    }
    return [...EVENTS, ...bdayEvs];
  }, [players]);

  const [listScrollSignal, setListScrollSignal] = useState(0);
  const goToday = () => {
    const now = new Date();
    const m = now.getFullYear() === 2026 ? now.getMonth() : 1;
    setCurrentMonth(m);
    setSelectedDate(now.getFullYear() === 2026 ? now : null);
    setListScrollSignal(v => v + 1);
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
  // Máximo de eventos mostrados por célula antes de colapsar em "+N mais".
  // Meses de 6 semanas têm células mais baixas → limite menor para não cortar.
  const cellCap = gridRows >= 6 ? 5 : 8;
  const today = new Date();
  const groups: GroupKey[] = ["CGSS", "JUNIOR", "DRIVE", "FPG", "DESTAQUE", "ANIVER", "VIAGENS"];

  return (
    <div className="cal-page">

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
        <div className="d-flex flex-col gap-6">
          {groups.map(g => {
            const cals = CALENDARS.filter(c => c.group === g);
            const groupCount = allEvents.filter(e => cals.some(c => c.id === e.calId)).length;
            const allOn = cals.every(c => enabledCals.has(c.id));
            return (
              <div key={g}>
                <button onClick={() => toggleGroup(g)} className="cal-toggle-btn">
                  <span className={`cal-toggle-check${allOn ? " on" : ""}`}>
                    {allOn ? "✓" : ""}
                  </span>
                  <span className="cal-toggle-label">{GROUP_LABELS[g]}</span>
                  <span className="fs-10 c-text-3 mono">{groupCount}</span>
                </button>
                <div className="d-flex flex-col gap-1" style={{ paddingLeft: 8, marginTop: 2 }}>
                  {cals.map(cal => {
                    const calEvts = allEvents.filter(e => e.calId === cal.id).sort((a, b) => a.date.getTime() - b.date.getTime());
                    const isExpanded = expandedCal === cal.id;
                    return (
                      <div key={cal.id}>
                        <div className="flex-center" style={{ gap: 0 }}>
                          {/* Checkbox */}
                          <button onClick={() => toggleCal(cal.id)} className="shrink-0" style={{ width: 28, height: 26, border: "none", cursor: "pointer", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
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
                            <span className="text-ellipsis fs-11 ta-left" style={{
                              color: enabledCals.has(cal.id) ? "var(--text)" : "var(--text-3)",
                              flex: 1, fontWeight: isExpanded ? 600 : enabledCals.has(cal.id) ? 500 : 400,
                            }}>{cal.name}</span>
                            <span className="fs-10" style={{ fontFamily: "var(--font-mono)",
                              color: "var(--text-3)", flexShrink: 0 }}>{calEvts.length}</span>
                            <span className="fs-10" style={{ color: "var(--text-3)", flexShrink: 0, transition: "transform 0.15s",
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
                                  <span className="fs-10 fw-600 shrink-0" style={{ fontFamily: "var(--font-mono)", color: cal.color, minWidth: 30 }}>{dd}</span>
                                  <span className="text-ellipsis fs-10 ta-left" style={{ color: "var(--text-2)", flex: 1 }}>{ev.title}</span>
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
        <div style={{ borderBottom: "1px solid var(--border-light)", flexShrink: 0 }}>
          <div className="gap-8 flex-wrap" style={{ display: "flex", alignItems: "center", padding: "8px 12px" }}>
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <h2 className="cal-month-title fs-14"  style={{ margin: 0, whiteSpace: "nowrap" }}>Calendário 2026</h2>
            <button onClick={goToday} className="p p-filter shrink-0" title="Ir para hoje" style={{ opacity: 1 }}>Hoje</button>
            <div ref={searchRef} style={{ position: "relative", flex: "1 1 120px", minWidth: 100, maxWidth: 220 }}>
              <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
                onFocus={() => searchQ.length >= 2 && setSearchOpen(true)}
                placeholder="Pesquisar…"
                style={{ width: "100%", padding: "5px 8px 5px 26px", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", fontSize: "var(--fs-11)", fontFamily: "inherit",
                  background: "var(--bg-card)", color: "var(--text)", outline: "none" }}
                onKeyDown={e => { if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); } }} />
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                fontSize: "var(--fs-12)", color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
              {searchOpen && searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                  background: "var(--bg-card)", border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  maxHeight: 320, overflowY: "auto", zIndex: "var(--z-sidebar)" }}>
                  {searchResults.map(ev => {
                    const cal = CAL_MAP.get(ev.calId);
                    const d = ev.date;
                    return (
                      <button key={ev.id} onClick={() => goToEvent(ev)} className="cal-search-result">
                        <span className="cal-search-dot" style={{ background: cal?.color || "var(--text-3)" }} />
                        <span className="cal-search-date">{d.getDate()}/{d.getMonth()+1}</span>
                        <span className="cal-search-title">{ev.title}</span>
                        {ev.campo && <span className="c-muted fs-10 shrink-0">{ev.campo}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {searchOpen && searchQ.length >= 2 && searchResults.length === 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                  background: "var(--bg-card)", border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-lg)", padding: "12px 16px",
                  color: "var(--text-3)" }} className="fs-11 ta-c">
                  Nenhum evento encontrado
                </div>
              )}
            </div>
            <div className="escalao-pills ml-auto shrink-0" >
              {(["month", "list"] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`p p-filter${viewMode === v ? " active" : ""}`}>
                  {v === "month" ? "Mês" : "Lista"}
                </button>
              ))}
            </div>
          </div>
          <div className="gap-8" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 12px 8px" }}>
            <button onClick={() => setCurrentMonth(m => Math.max(0, m-1))} title="Mês anterior" disabled={currentMonth <= 0}
              style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
                background: "var(--bg-card)", cursor: currentMonth <= 0 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--fs-18)", color: currentMonth <= 0 ? "var(--border)" : "var(--text-2)",
                flexShrink: 0 }}>‹</button>
            <span className="fw-700 ta-c" style={{ fontSize: "var(--fs-15)", color: "var(--text)", flex: 1 }}>
              {monthLabel(currentMonth)} 2026
            </span>
            <span className="fs-11 c-text-3 mono shrink-0" >{visibleEvents.length} provas</span>
            <button onClick={() => setCurrentMonth(m => Math.min(11, m+1))} title="Mês seguinte" disabled={currentMonth >= 11}
              style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
                background: "var(--bg-card)", cursor: currentMonth >= 11 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--fs-18)", color: currentMonth >= 11 ? "var(--border)" : "var(--text-2)",
                flexShrink: 0 }}>›</button>
          </div>
        </div>

        <div className="flex-1 scroll-y scroll-y">
          {!sidebarOpen && isMobile && (
            <button className="sidebar-back-btn" onClick={() => setSidebarOpen(true)}>▶ Filtros</button>
          )}
          {viewMode === "month" ? (
            <div className="cal-content">
              <div className="cal-week-header" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)",
                borderBottom: "1px solid var(--border-light)", marginBottom: 4 }}>
                {DAYS_PT.map((d, i) => (
                  <div key={i} className="uppercase ta-c fs-11 fw-600 cal-dow" style={{ padding: "8px 0",
                    color: "var(--text-3)", letterSpacing: "0.04em" }}>{d}</div>
                ))}
              </div>
              <div className="cal-month-grid" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `repeat(${gridRows},1fr)` }}>
                {monthDays.map((d, i) => {
                  const dayEvts = sortEventsForGrid(visibleEvents.filter(e => eventOnDay(e, d.date)));
                  const isToday = isSameDay(d.date, today);
                  const isSel = selectedDate && isSameDay(d.date, selectedDate);
                  const hlEvt = dayEvts.find(e => isHighlight(e));
                  const weekIdx = Math.floor(i / 7);
                  const weekStart = monthDays[weekIdx * 7].date;
                  const weekEnd = monthDays[weekIdx * 7 + 6].date;
                  // Pano de fundo (ver src/data/schoolCalendar.ts): sombreiam-se os
                  // dias LIVRES de escola — fins-de-semana, interrupções, feriados e
                  // os dias soltos sem aulas. É onde há espaço para jogar e viajar,
                  // e são a minoria: sombrear os dias de aulas pintava quase tudo.
                  const livre = isFreeDay(d.date);
                  const sd = schoolDay(d.date);
                  const tipDia = livre ? `Livre — ${freeDayReason(d.date)}`
                    : sd.tipo === "aulas" ? `Escola — ${sd.periodo}` : undefined;
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
                          <span className="fs-10">{MONTHS_SHORT[d.date.getMonth()]}</span> {d.date.getDate()}
                        </div>
                        <div className="fs-14" style={{ lineHeight: 1 }}>{hl.icon}</div>
                        {isFirst ? (
                          <div className="fs-10 fw-900 ta-c mt-1" style={{ color: hl.text, lineHeight: 1.1, letterSpacing: "0.02em" }}>
                            {titleLines.map((l, j) => <div key={j}>{l}</div>)}
                          </div>
                        ) : (
                          <div className="fs-10 fw-700 ta-c mt-1" style={{ color: hl.text, opacity: 0.6, lineHeight: 1.1 }}>
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
                      background: isSel ? "var(--accent-light)" : livre ? "var(--cal-livre-bg)" : "transparent",
                      transition: "background 0.12s",
                    }}
                      onMouseEnter={ev => { if (!isSel) ev.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={ev => { if (!isSel) ev.currentTarget.style.background = livre ? "var(--cal-livre-bg)" : "transparent"; }} title={tipDia}>
                      <div className="fs-11" style={{
                        fontWeight: isToday ? 700 : 500,
                        minHeight: 22, borderRadius: "var(--radius-lg)", padding: "1px 4px",
                        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2px",
                        color: !d.inMonth ? "var(--text-3)" : isToday ? "#fff" : "var(--text)",
                        background: isToday ? "var(--accent)" : !d.inMonth ? "var(--bg-hover)" : "transparent",
                        gap: 2, whiteSpace: "nowrap" }}>
 <span className="fw-600 fs-10" style={{ opacity: !d.inMonth ? 0.7 : 0.45 }}>{MONTHS_SHORT[d.date.getMonth()]}</span>
                        {d.date.getDate()}
                      </div>
                      {dayEvts.slice(0, cellCap).map(e => {
                        const isPast = jaPassou(e, today);
                        const pos = getEvPos(e, d.date, weekStart, weekEnd);
                        const showTitle = pos === "single" || pos === "start";
                        // A animação só faz sentido num evento de UM dia: repetida em
                        // três células seguidas (o Dunas, 4-6 Set) fica a gritar.
                        const barCls = pos === "single" ? HL_BAR[e.calId] : undefined;
                        const bRadius =
                          pos === "start" ? "3px 0 0 3px" :
                          pos === "end"   ? "0 3px 3px 0" :
                          pos === "mid"   ? "0" : "3px";
                        return (
                        <div key={e.id} role="button" tabIndex={0} onClick={ev => { ev.stopPropagation(); setSelectedEvent(e); }} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setSelectedEvent(e); } }}
                          title={e.title}
                          className={barCls ? `hl-bar ${barCls}` : undefined}
                          style={{
                            fontSize: "var(--fs-10)",
                            padding: showTitle ? "1px 5px" : "1px 0",
                            marginBottom: 1,
                            marginLeft:  (pos === "mid" || pos === "end") ? -CP : 0,
                            marginRight: (pos === "mid" || pos === "start") ? -CP : 0,
                            borderRadius: bRadius,
                            background: calColor(e),
                            color: "#fff", overflow: "hidden", whiteSpace: "nowrap",
                            textOverflow: "ellipsis", cursor: "pointer",
                            fontWeight: 600, lineHeight: 1.6,
                            opacity: isPast ? 0.4 : opacidadeDe(e),
                            minHeight: pos !== "single" && !showTitle ? 16 : undefined,
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={ev => (ev.currentTarget.style.opacity = String(isPast ? 0.55 : Math.min(0.85, opacidadeDe(e) + 0.25)))}
                          onMouseLeave={ev => (ev.currentTarget.style.opacity = String(isPast ? 0.4 : opacidadeDe(e)))}>
                          {showTitle ? e.title : "\u00A0"}
                        </div>
                        );
                      })}
                      {dayEvts.length > cellCap && (
                        <div role="button" tabIndex={0}
                          onClick={ev => { ev.stopPropagation(); setDayPopup(d.date); }}
                          onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setDayPopup(d.date); } }}
                          title="Ver todos os eventos deste dia"
                          className="fs-10 c-text-3 ta-c fw-600"
                          style={{ cursor: "pointer", borderRadius: "var(--radius-xs)", padding: "0 2px" }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                          +{dayEvts.length - cellCap} mais
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ListView events={visibleEvents} onSelect={setSelectedEvent} scrollSignal={listScrollSignal} />
          )}
        </div>
      </div>

      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {dayPopup && (
        <DayEventsPopup
          date={dayPopup}
          events={sortEventsForGrid(visibleEvents.filter(e => eventOnDay(e, dayPopup)))}
          onSelect={e => { setDayPopup(null); setSelectedEvent(e); }}
          onClose={() => setDayPopup(null)}
        />
      )}
    </div>
  );
}

function DayEventsPopup({ date, events, onSelect, onClose }: {
  date: Date; events: CalEvent[]; onSelect: (e: CalEvent) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 10);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const title = `${DAY_NAMES[date.getDay()]}, ${date.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })} 2026`;
  return (
    <div className="cal-overlay" style={{ backdropFilter: "blur(3px)" }}>
      <div ref={ref} style={{ background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-lg)", width: 380, maxHeight: "80vh", overflow: "hidden",
        display: "flex", flexDirection: "column", animation: "calPopIn 0.2s ease" }}>
        <div style={{ background: "var(--accent)", padding: "14px 18px", display: "flex",
          justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span className="fw-600 fs-13" style={{ color: "#fff" }}>{title}</span>
          <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ background: "rgba(255,255,255,0.2)",
            border: "none", color: "#fff", width: 26, height: 26, borderRadius: "50%", cursor: "pointer",
            fontSize: "var(--fs-14)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div className="cal-sidebar d-flex flex-col gap-4" style={{ overflowY: "auto" }}>
          {events.map(e => (
            <button key={e.id} onClick={() => onSelect(e)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", width: "100%",
              border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              background: "transparent", borderRadius: "var(--radius)", transition: "background 0.15s" }}
              onMouseEnter={ev => (ev.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
              <span style={{ width: 4, alignSelf: "stretch", borderRadius: "var(--radius-xs)",
                background: calColor(e), flexShrink: 0 }} />
              <span className="flex-1" style={{ minWidth: 0 }}>
                <span className="text-ellipsis fs-13 fw-600" style={{ color: "var(--text)", display: "block" }}>{e.title}</span>
                {(e.modalidade || e.campo) && (
                  <span className="fs-11 c-text-3" style={{ display: "block" }}>
                    {e.modalidade}{e.modalidade && e.campo && " · "}{e.campo}
                  </span>
                )}
              </span>
              <span className="fs-10 fw-600 shrink-0" style={{ padding: "2px 8px", borderRadius: "var(--radius-lg)",
                background: calColor(e), color: "#fff", whiteSpace: "nowrap" }}>
                {CAL_MAP.get(e.calId)?.name ?? ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SmBtn({ l, onClick, dis }: { l: string; onClick: () => void; dis?: boolean }) {
  return (
    <button onClick={onClick} disabled={dis} style={{
      background: "none", border: "none", cursor: dis ? "default" : "pointer",
      fontSize: "var(--fs-16)", color: dis ? "var(--border)" : "var(--text-3)",
      width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 0,
    }}>{l}</button>
  );
}
