// @refresh reset
/**
 * TorneiosAnalisePage.tsx — Análise Genérica de Torneios
 *
 * Lê automaticamente todos os ficheiros:
 *   /data/pull-torneios000.json
 *   /data/pull-torneios001.json
 *   /data/pull-torneios002.json
 *   ... (para quando aparecer um 404)
 *
 * Apresenta:
 *   • Sidebar com todos os torneios de todos os ficheiros, agrupados por mês/ano
 *   • Leaderboard com scorecard buraco-a-buraco
 *   • Tabs por ronda (R1, R2, ... + Acumulado para multi-ronda)
 *   • Suporte a 9H e 18H, 1 a N rondas
 */
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSort } from "../hooks/useSort";
import { useAppContext } from "../context/AppContext";
import { loadPlayers } from "../data/loader";
import { scClass, sdClassByHcp } from "../utils/scoreDisplay";
import { buildEscLookup, type EscLookup } from "../utils/playerUtils";
import { getTeeHex } from "../utils/teeColors";
import { PILL_SSERRA, SIDEBAR_ACCENT, EscPill, ESC_STYLE, PillBadge } from "../ui/PillBadge";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import SexBadge from "../ui/SexBadge";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import SortableHdr from "../ui/SortableHdr";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import FilterChip from "../ui/FilterChip";
import PlayerLink from "../ui/PlayerLink";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { C } from "../utils/colors";
import { fmtDate, fmtToPar, MONTHS_PT, norm, monthLabel } from "../utils/format";
import { toggleArr } from "../utils/mathUtils";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import { MultiRoundLeaderboard } from "../ui/MultiRoundLeaderboard";
import { EMPTY_FILTER, type MultiRoundRow as MRRow } from "../ui/multiRoundTypes";
import { CrossSeasonTable, SortTh as CSortTh } from "../ui/CrossSeasonTable";
import {
  MANUEL_FED,
  isManuel,
  fmtTP,
  tpColor,
  TeeDot,
  TournPName,
  SDPill,
  type PlayersDB,
} from "../ui/tournamentPrimitives";

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
   ───────────────────────────────────────────── */
const DATA_BASE_URL = "/data/pull-torneios";   // prefixo dos ficheiros
const DATA_EXT      = ".json";                  // extensão
const DATA_DIGITS   = 3;                        // 000, 001, 002 ...
const DATA_MAX      = 50;                       // segurança: parar após N ficheiros

type TournPill = "REGIONAL" | "NACIONAL" | "INTL" | "PJA" | "SSERRA";

/* ─────────────────────────────────────────────
   TIPOS + DADOS — Campeonato Nacional de Clubes
   ───────────────────────────────────────────── */
interface GrupoJogador { nome: string; fed: string | null; hcp: number | string; }
interface GrupoEntry   { grupo: string; clube: string; jogadores: GrupoJogador[]; suplente?: string; capitao?: string; }

/** Quantos scores por ronda contam para o total de equipa */
const CLUBES_BEST_N = 3;
/** Score máximo por buraco (regra do torneio) */
const MAX_HOLE_SCORE = 10;

const CLUBES_GRUPOS: Record<"sub14" | "sub18", GrupoEntry[]> = {
  sub14: [
    { grupo: "A", clube: "Club de Golf de Miramar", suplente: "Raul Pazos", capitao: "Sérgio Ribeiro", jogadores: [
      { nome: "Tomás Rente",           fed: "46311", hcp: 6.9 },
      { nome: "Margarida Silva Pinto", fed: "46310", hcp: 4.1 },
      { nome: "Francisco Nunes (jr)",  fed: "46299", hcp: 5.4 },
      { nome: "Henrique Pereira",      fed: "53646", hcp: 12.5 },
      { nome: "Raul Pazos",            fed: "46296", hcp: 0 },
    ]},
    { grupo: "B", clube: "Clube de Golfe Citynorte", capitao: "Cândida Santos", jogadores: [
      { nome: "Gil Ribeiro",           fed: "47810", hcp: 22.9 },
      { nome: "Madalena Policarpo",    fed: "45608", hcp: 15.7 },
      { nome: "João Pedro Frade",      fed: "45424", hcp: 18.5 },
      { nome: "Pedro Luís Fernandes",  fed: "52168", hcp: 17.0 },
    ]},
    { grupo: "C", clube: "Clube de Golf do Estoril", suplente: "Salvador Ivo de Carvalho", capitao: "Tiago Cruz", jogadores: [
      { nome: "João Rocha",              fed: "48297", hcp: 6.1 },
      { nome: "Ruiqi Li",                fed: "49076", hcp: 3.8 },
      { nome: "Nuno Palmares Jr.",       fed: "49124", hcp: 3.9 },
      { nome: "Ricardo Castro Ferreira", fed: "49085", hcp: 7.4 },
      { nome: "Salvador Ivo de Carvalho", fed: "43968", hcp: 0 },
    ]},
    { grupo: "D", clube: "Clube de Golfe de Vilamoura", suplente: "Tomás Valério", capitao: "Hugo Santos", jogadores: [
      { nome: "Catarina Valério",           fed: "46873", hcp: 18.1 },
      { nome: "Catarina Sousa Conceição",   fed: "48794", hcp: 10.7 },
      { nome: "Tomás Lima Pinto",           fed: "46037", hcp: 8.9  },
      { nome: "Sabrina Ribeiro Crisóstomo", fed: "48971", hcp: 8.0  },
      { nome: "Tomás Valério",              fed: "50011", hcp: 0 },
    ]},
    { grupo: "E", clube: "Oporto Golf Clube A", suplente: "Lucas Amorim", capitao: "Miguel Valença", jogadores: [
      { nome: "Sebastião Soares",      fed: "47341", hcp: 15.3 },
      { nome: "Afonso de Sousa Pinto", fed: "46480", hcp: 10.3 },
      { nome: "Francisco Saraiva",     fed: "39097", hcp: 7.9  },
      { nome: "Santiago Dias",         fed: "42908", hcp: 1.0  },
      { nome: "Lucas Pereira Amorim",  fed: "54330", hcp: 0 },
    ]},
    { grupo: "F", clube: "Clube de Golf da Quinta do Peru", capitao: "Cláudia Dantas", jogadores: [
      { nome: "David Filip Jr",     fed: "51949", hcp: 9.7  },
      { nome: "Mário Novaes Moura", fed: "53939", hcp: 38.3 },
      { nome: "Beatriz Mendes",     fed: "46026", hcp: 36.0 },
      { nome: "William Gao",        fed: "51524", hcp: 9.5  },
    ]},
    { grupo: "G", clube: "Oporto Golf Clube B", capitao: "Ricardo Garcia", jogadores: [
      { nome: "Catarina Loureiro", fed: "49328", hcp: 20.1 },
      { nome: "Maksim Mutalapov",  fed: "54475", hcp: 32.1 },
      { nome: "Ricardo Ferreira",  fed: "45366", hcp: 23.1 },
      { nome: "Diogo Guilherme",   fed: "56632", hcp: 19.0 },
    ]},
    { grupo: "H", clube: "Lisbon Sports Club", capitao: "Catarina Inocentes", jogadores: [
      { nome: "Filipe Delicado",             fed: "53124", hcp: 36.6 },
      { nome: "Guilherme Pereira",           fed: "47658", hcp: 37.2 },
      { nome: "David Stocksreiter Ferreira", fed: "48164", hcp: 35.4 },
      { nome: "Diogo Vaz Pinto Jr.",         fed: "51432", hcp: 32.9 },
    ]},
    { grupo: "I", clube: "Clube de Golfe Citynorte A", suplente: "Tomás Araújo", capitao: "Cândida Santos", jogadores: [
      { nome: "Marc Costa",               fed: "46308", hcp: 13.7 },
      { nome: "Tomás Sarmento de Beires", fed: "48046", hcp: 16.2 },
      { nome: "Afonso Paiva Gonçalves",   fed: "47819", hcp: 14.5 },
      { nome: "Diogo Lima",               fed: "49717", hcp: 12.0 },
      { nome: "Tomás Araújo",             fed: "49011", hcp: 0 },
    ]},
    { grupo: "J", clube: "Club de Golf de Miramar B", capitao: "Sérgio Ribeiro", jogadores: [
      { nome: "José Maria Pereira",     fed: "53645", hcp: 20.7 },
      { nome: "Eduardo Rocha Ferreira", fed: "51182", hcp: 22.4 },
      { nome: "Ricardo Rocha Ferreira", fed: "51180", hcp: 17.3 },
      { nome: "João Balixa",            fed: "46038", hcp: 9.5  },
    ]},
    { grupo: "K", clube: "Quinta das Lágrimas Clube de Golfe", suplente: "Vicente Poeira", jogadores: [
      { nome: "Guido Martins Gonçalves", fed: "46414", hcp: 14.6 },
      { nome: "Gil Martins Gonçalves",   fed: "46415", hcp: 18.7 },
      { nome: "Miguel Silva",            fed: "45661", hcp: 36.9 },
      { nome: "Valentin Iria",           fed: "57233", hcp: 31.8 },
      { nome: "Vicente Poeira",          fed: "50885", hcp: 39.7 },
    ]},
  ],
  sub18: [
    { grupo: "A", clube: "CG Vilamoura", suplente: "Igor Kostyn", capitao: "Hugo Santos", jogadores: [
      { nome: "Rodrigo Sousa Correia", fed: "44934", hcp: 3.4     },
      { nome: "Francisco Reis",        fed: "40534", hcp: 0.3     },
      { nome: "Martim Pinto Johansen", fed: "40115", hcp: "+0.8"  },
      { nome: "Jack Murtagh",          fed: "41593", hcp: 8.4     },
    ]},
    { grupo: "B", clube: "Clube de Golf da Quinta do Peru", capitao: "Cláudia Dantas", jogadores: [
      { nome: "Salvador Paulo Rodrigues", fed: "58051", hcp: 29.3 },
      { nome: "Angelina Gao",             fed: "51523", hcp: 3.9  },
      { nome: "Diogo Sequeira",           fed: "56654", hcp: 3.6  },
      { nome: "João Setúbal",             fed: "43732", hcp: 0.2  },
    ]},
    { grupo: "C", clube: "Club de Golf de Miramar", suplente: "Margarida Alves", capitao: "Sérgio Ribeiro", jogadores: [
      { nome: "Afonso Silva Pinto",          fed: "46309", hcp: 5.4    },
      { nome: "Gaspard Maes",                fed: "51074", hcp: 1.8    },
      { nome: "Camila Pazos",                fed: "46297", hcp: 2.9    },
      { nome: "Francisca Ferreira Da Costa", fed: "40981", hcp: "+1.8" },
    ]},
    { grupo: "D", clube: "Clube Palheiro Golfe", capitao: "Edgar Rodrigues", jogadores: [
      { nome: "André Gonçalves",    fed: "41121", hcp: 6.7 },
      { nome: "Maria Cunha",        fed: "46482", hcp: 4.6 },
      { nome: "Salvador Rodrigues", fed: "39465", hcp: 6.2 },
      { nome: "José Pedro Miranda", fed: "38976", hcp: 7.0 },
    ]},
    { grupo: "E", clube: "Estela Golf Club", suplente: "Afonso Polery", capitao: "Luís Cameira", jogadores: [
      { nome: "Gabriel Marques Guerreiro", fed: "43053", hcp: 4.4  },
      { nome: "André Von Hafe",            fed: "40473", hcp: 15.4 },
      { nome: "Manuel Rouco Castro",       fed: "47576", hcp: 16.3 },
      { nome: "Afonso Poiarez",            fed: "46079", hcp: 16.2 },
    ]},
    { grupo: "F", clube: "Oporto Golf Club A", suplente: "Henrique Montenegro", capitao: "Miguel Valença", jogadores: [
      { nome: "Eva Silva",                fed: "46437", hcp: 1.4    },
      { nome: "Pedro Ferreira",           fed: "43810", hcp: 0.7    },
      { nome: "Guilherme Grabner Moreira",fed: "42205", hcp: 0.6    },
      { nome: "Luis António Silva",       fed: "42845", hcp: "+3.0" },
      { nome: "Henrique Montenegro",      fed: "39552", hcp: 2.2    },
    ]},
    { grupo: "G", clube: "Clube de Golf da Ilha Terceira", suplente: "Tomás Valadão", capitao: "Michael Duarte", jogadores: [
      { nome: "João Lucas Fagundes",           fed: "44677", hcp: 17.8 },
      { nome: "Madalena Alexandra Van Zeller", fed: "47078", hcp: 8.0  },
      { nome: "Maria Fonseca Azevedo",         fed: "44019", hcp: 14.9 },
      { nome: "Rafael Ourique Azevedo",        fed: "44018", hcp: 27.0 },
      { nome: "Tomás Valadão",                 fed: "36625", hcp: 0    },
    ]},
    { grupo: "H", clube: "Clube de Golfe de Belas", suplente: "Frederico Almeida da Silva", capitao: "José Augusto", jogadores: [
      { nome: "Clara Trindade",           fed: "45812", hcp: 8.2 },
      { nome: "Henrique Almeida da Silva",fed: "41612", hcp: 6.4 },
      { nome: "Ryan Dantas",              fed: "45439", hcp: 6.9 },
      { nome: "Filipe Pinheiro",          fed: "46591", hcp: 3.1 },
    ]},
    { grupo: "I", clube: "Oporto Golf Clube B", suplente: "Gonçalo Maia", capitao: "Miguel Montenegro", jogadores: [
      { nome: "Teresa Ferreira",          fed: "46589", hcp: 6.7 },
      { nome: "Jorge Xavier Graça Silva", fed: "48705", hcp: 8.0 },
      { nome: "Maria Francisca Santos",   fed: "46853", hcp: 4.6 },
      { nome: "Maria Loureiro",           fed: "46489", hcp: 5.8 },
    ]},
    { grupo: "J", clube: "P.G.C. - Paredes Golfe Clube", suplente: "Guilherme Alves", capitao: "Tomás Ribeiro", jogadores: [
      { nome: "Rafael Nogueira", fed: null, hcp: 15.5 },
      { nome: "João Oliveira",   fed: null, hcp: 29.3 },
      { nome: "Gustavo Castro",  fed: null, hcp: 16.7 },
      { nome: "Elisa Garcez",    fed: null, hcp: 4.9  },
    ]},
    { grupo: "K", clube: "Clube de Golf do Estoril", suplente: "Reuben Thapa", capitao: "Miguel Nunes Pedro", jogadores: [
      { nome: "Paul Devillers",             fed: "49770", hcp: 2.5    },
      { nome: "João Maria Ivo de Carvalho", fed: "38334", hcp: "+1.8" },
      { nome: "Duarte Soares Franco",       fed: "48531", hcp: 8.1    },
      { nome: "Pedro Costa Alemão",         fed: "46706", hcp: 4.0    },
      { nome: "Reuben Thapa",               fed: "47552", hcp: 3.6    },
    ]},
    { grupo: "L", clube: "Lisbon Sports Club", capitao: "Rita Nunes", jogadores: [
      { nome: "Francisca Vilela", fed: "36700", hcp: 16.3 },
      { nome: "Manuel Vaz Pinto", fed: "51430", hcp: 17.8 },
      { nome: "João Gomes",       fed: "53715", hcp: 10.5 },
      { nome: "Ana Bianchi",      fed: "36861", hcp: 13.9 },
    ]},
  ],
};

/* ── Grupos 2025 ─────────────────────────────────────────────────────────── */
const CLUBES_GRUPOS_2025: Record<"sub14" | "sub18", GrupoEntry[]> = {
  sub18: [
    { grupo: "A", clube: "CG Vilamoura", jogadores: [
      { nome: "João Crasi Alves",           fed: "39701", hcp: 0 },
      { nome: "João Maria Ivo de Carvalho", fed: "38334", hcp: 0 },
      { nome: "Francisco Reis",             fed: "40534", hcp: 0 },
      { nome: "Martim Pinto Johansen",      fed: "40115", hcp: 0 },
    ]},
    { grupo: "B", clube: "Oporto Golf Clube A", jogadores: [
      { nome: "Guilherme Grabner Moreira",  fed: "42205", hcp: 0 },
      { nome: "Luis António Silva",         fed: "42845", hcp: 0 },
      { nome: "Henrique Montenegro",        fed: "39552", hcp: 0 },
      { nome: "Pedro Ferreira",             fed: "43810", hcp: 0 },
    ]},
    { grupo: "C", clube: "Club de Golf de Miramar", jogadores: [
      { nome: "Tomás Afonso Araujo",        fed: "35849", hcp: 0 },
      { nome: "Francisca Ferreira Da Costa",fed: "40981", hcp: 0 },
      { nome: "João Alvim",                 fed: "45340", hcp: 0 },
      { nome: "Margarida Alves",            fed: "45499",    hcp: 0 },
      { nome: "Henrique Ferreira da Costa", fed: "41080", hcp: 0 },
    ]},
    { grupo: "D", clube: "Clube de Golf do Estoril", jogadores: [
      { nome: "Reuben Thapa",              fed: "47552", hcp: 0 },
      { nome: "Gino Vassily Sganzerla",    fed: "41461", hcp: 0 },
      { nome: "Eleonora Savanovich",       fed: "51319", hcp: 0 },
      { nome: "Paul Devillers",            fed: "49770",    hcp: 0 },
    ]},
    { grupo: "E", clube: "Clube Palheiro Golfe", jogadores: [
      { nome: "André Gonçalves",           fed: "41121", hcp: 0 },
      { nome: "José Pedro Miranda",        fed: "38976", hcp: 0 },
      { nome: "Maria Cunha",               fed: "46482", hcp: 0 },
      { nome: "Salvador Rodrigues",        fed: "39465", hcp: 0 },
    ]},
    { grupo: "F", clube: "Oporto Golf Clube B", jogadores: [
      { nome: "Sebastiao Sardinha Saraiva",fed: "46195", hcp: 0 },
      { nome: "Eva Silva",                 fed: "46437", hcp: 0 },
      { nome: "Maria Loureiro",            fed: "46489", hcp: 0 },
      { nome: "Teresa Ferreira",           fed: "46589", hcp: 0 },
      { nome: "Gonçalo Maia",              fed: "46395",    hcp: 0 },
    ]},
    { grupo: "G", clube: "Clube de Golfe de Belas", jogadores: [
      { nome: "Henrique Almeida da Silva", fed: "41612", hcp: 0 },
      { nome: "Martim Sousa de Morais",    fed: "41609", hcp: 0 },
      { nome: "Callum Ferguson",           fed: "55697", hcp: 0 },
      { nome: "Carolina Gaspar",           fed: "44581", hcp: 0 },
      { nome: "Luís Pinheiro Jr.",         fed: "46590",    hcp: 0 },
    ]},
    { grupo: "H", clube: "Lisbon Sports Club", jogadores: [
      { nome: "Francisco Anahory Assis",      fed: "46009", hcp: 0 },
      { nome: "Lourenço de Castro Fernandes", fed: "37633", hcp: 0 },
      { nome: "Ana Bianchi",                  fed: "36861",    hcp: 0 },
      { nome: "João Gomes",                   fed: "53715", hcp: 0 },
      { nome: "Francisca Vilela",             fed: "36700", hcp: 0 },
    ]},
    { grupo: "I", clube: "CityGolf", jogadores: [
      { nome: "Diogo Afonso",             fed: "45343", hcp: 0 },
      { nome: "Francisco Costa Mendes",   fed: "40318", hcp: 0 },
      { nome: "Pedro Aires",              fed: "42068", hcp: 0 },
    ]},
    { grupo: "J", clube: "Clube de Golf da Ilha Terceira", jogadores: [
      { nome: "Bia Sampaio Mesquita",              fed: "51937", hcp: 0 },
      { nome: "Madalena Alexandra Van Zeller",     fed: "47078", hcp: 0 },
      { nome: "João Lucas Fagundes",               fed: "44677", hcp: 0 },
      { nome: "Maria Fonseca Azevedo",             fed: "44019", hcp: 0 },
    ]},
  ],
  sub14: [
    { grupo: "A", clube: "Club de Golf de Miramar", jogadores: [
      { nome: "Santiago Dias",             fed: "42908", hcp: 0 },
      { nome: "Gaspard Maes",              fed: "51074", hcp: 0 },
      { nome: "Afonso Silva Pinto",        fed: "46309", hcp: 0 },
      { nome: "Maria Francisca Santos",    fed: "46853",    hcp: 0 },
      { nome: "Camila Pazos",              fed: "46297", hcp: 0 },
    ]},
    { grupo: "B", clube: "CG Vilamoura", jogadores: [
      { nome: "Rodrigo Sousa Correia",     fed: "44934", hcp: 0 },
      { nome: "João Setúbal",              fed: "43732", hcp: 0 },
      { nome: "Grace Gordon",              fed: "55270", hcp: 0 },
      { nome: "Salvador Ivo de Carvalho",  fed: "43968", hcp: 0 },
    ]},
    { grupo: "C", clube: "Clube de Golfe de Belas", jogadores: [
      { nome: "Filipe Pinheiro",           fed: "46591", hcp: 0 },
      { nome: "Frederico Almeida da Silva",fed: "41613", hcp: 0 },
      { nome: "Clara Trindade",            fed: "45812", hcp: 0 },
      { nome: "Ryan Dantas",               fed: "45439", hcp: 0 },
      { nome: "Martim Moreira",            fed: "42985", hcp: 0 },
    ]},
    { grupo: "D", clube: "Clube de Golf do Estoril", jogadores: [
      { nome: "Pedro Costa Alemão",        fed: "46706", hcp: 0 },
      { nome: "Ruiqi Li",                  fed: "49076", hcp: 0 },
      { nome: "Nuno Palmares Jr.",         fed: "49124", hcp: 0 },
      { nome: "Ricardo Castro Ferreira",   fed: "49085",    hcp: 0 },
      { nome: "João Rocha",                fed: "48297", hcp: 0 },
    ]},
    { grupo: "E", clube: "Club de Golf de Miramar B", jogadores: [
      { nome: "Tomás Rente",               fed: "46311", hcp: 0 },
      { nome: "Margarida Silva Pinto",     fed: "46310", hcp: 0 },
      { nome: "Francisco Nunes (jr)",      fed: "46299", hcp: 0 },
      { nome: "Raul Pazos (jr)",           fed: "46296",    hcp: 0 },
      { nome: "João Balixa",               fed: "46038", hcp: 0 },
    ]},
    { grupo: "F", clube: "CG Vilamoura B", jogadores: [
      { nome: "Finn Gordon",               fed: "55269", hcp: 0 },
      { nome: "Catarina Sousa Conceição",  fed: "48794", hcp: 0 },
      { nome: "Tomás Lima Pinto",          fed: "46037", hcp: 0 },
      { nome: "Sabrina Ribeiro Crisóstomo",fed: "48971", hcp: 0 },
    ]},
    { grupo: "G", clube: "CityGolf", jogadores: [
      { nome: "João Araújo",               fed: "49012", hcp: 0 },
      { nome: "Marc Costa",                fed: "46308", hcp: 0 },
      { nome: "Afonso Paiva Gonçalves",    fed: "47819", hcp: 0 },
      { nome: "João Pedro Frade",          fed: "45424", hcp: 0 },
      { nome: "Diogo Lima",                fed: "49717", hcp: 0 },
    ]},
    { grupo: "H", clube: "Oporto Golf Clube", jogadores: [
      { nome: "Dinis Seabra",              fed: "44821", hcp: 0 },
      { nome: "Diogo Guilherme",           fed: "56632", hcp: 0 },
      { nome: "Sebastião Soares",          fed: "47341", hcp: 0 },
      { nome: "Francisco Saraiva",         fed: "39097", hcp: 0 },
      { nome: "Afonso de Sousa Pinto",     fed: "46480", hcp: 0 },
    ]},
    { grupo: "I", clube: "Estela Golf Club", jogadores: [
      { nome: "Afonso Poiarez",                              fed: "46079", hcp: 0 },
      { nome: "António R. P. Monteiro",                      fed: "55094", hcp: 0 },
      { nome: "Afonso Polery",                               fed: "55093", hcp: 0 },
      { nome: "Julio Brito",                                 fed: "55092", hcp: 0 },
    ]},
    { grupo: "J", clube: "Santo Serra Golf Club", jogadores: [
      { nome: "Manuel Goulartt Medeiros",  fed: "52884", hcp: 0 },
      { nome: "Mateus Penucho",            fed: "52393", hcp: 0 },
      { nome: "Gonçalo Gouveia",           fed: "50398", hcp: 0 },
    ]},
    { grupo: "K", clube: "Lisbon Sports Club", jogadores: [
      { nome: "David Stocksreiter Ferreira",fed: "48164", hcp: 0 },
      { nome: "Francisco Trinité",          fed: "52044", hcp: 0 },
      { nome: "David Filip",                fed: "51949",    hcp: 0 },
      { nome: "Filipe Delicado",            fed: "53124", hcp: 0 },
      { nome: "Diogo Vaz Pinto Jr.",        fed: "51432", hcp: 0 },
    ]},
  ],
};

/** Lookup de grupos por ano — adicionar anos futuros aqui */
const CLUBES_GRUPOS_BY_YEAR: Record<string, Record<"sub14" | "sub18", GrupoEntry[]>> = {
  "2026": CLUBES_GRUPOS,
  "2025": CLUBES_GRUPOS_2025,
  "2024": {
    sub14: [
      { grupo: "A", clube: "CG Vilamoura A", jogadores: [
        { nome: "Martim Pinto Johansen",       fed: "40115", hcp: 0 },
        { nome: "Francisco Reis",              fed: "40534", hcp: 0 },
        { nome: "Brooks Barker",               fed: "43359", hcp: 0 },
        { nome: "Rodrigo Sousa Correia",       fed: "44934", hcp: 0 },
      ]},
      { grupo: "B", clube: "Club de Golf de Miramar Azul", jogadores: [
        { nome: "João Alvim",                  fed: "45340", hcp: 0 },
        { nome: "Santiago Dias",               fed: "42908", hcp: 0 },
        { nome: "Francisca Ferreira da Costa", fed: "40981", hcp: 0 },
        { nome: "Gaspard Maes",                fed: "51074",    hcp: 0 },
        { nome: "Henrique Ferreira da Costa",  fed: "41080", hcp: 0 },
      ]},
      { grupo: "C", clube: "CG Vilamoura B", jogadores: [
        { nome: "Grace Gordon",                fed: "55270", hcp: 0 },
        { nome: "Finn Gordon",                 fed: "55269", hcp: 0 },
        { nome: "Salvador Ivo de Carvalho",    fed: "43968", hcp: 0 },
        { nome: "Tomás Lima Pinto",            fed: "46037", hcp: 0 },
      ]},
      { grupo: "D", clube: "Club de Golf de Miramar Branco", jogadores: [
        { nome: "Margarida Alves",             fed: "45499", hcp: 0 },
        { nome: "Camila Pazos",                fed: "46297", hcp: 0 },
        { nome: "Maria Francisca Santos",      fed: "46853", hcp: 0 },
        { nome: "Raul Pazos (jr)",             fed: "46296",    hcp: 0 },
        { nome: "Francisco Nunes (jr)",        fed: "46299", hcp: 0 },
      ]},
      { grupo: "E", clube: "Clube de Golfe Citynorte", jogadores: [
        { nome: "Afonso Silva Pinto",          fed: "46309", hcp: 0 },
        { nome: "Francisco Saraiva",           fed: "39097", hcp: 0 },
        { nome: "Tomás Rente",                 fed: "46311", hcp: 0 },
        { nome: "Margarida Silva Pinto",       fed: "46310", hcp: 0 },
      ]},
      { grupo: "F", clube: "Clube de Golfe de Belas", jogadores: [
        { nome: "Filipe Pinheiro",             fed: "46591", hcp: 0 },
        { nome: "Frederico Almeida da Silva",  fed: "41613", hcp: 0 },
        { nome: "Martim Moreira",              fed: "42985", hcp: 0 },
        { nome: "João Rocha",                  fed: "48297", hcp: 0 },
      ]},
      { grupo: "G", clube: "Oporto Golf Clube", jogadores: [
        { nome: "Eva Silva",                   fed: "46437", hcp: 0 },
        { nome: "Gonçalo Maia",                fed: "46395", hcp: 0 },
        { nome: "Afonso de Sousa Pinto",       fed: "46480", hcp: 0 },
        { nome: "Dinis Seabra",                fed: "44821", hcp: 0 },
      ]},
    ],
    sub18: [
      { grupo: "A", clube: "Aroeira Golf Club", jogadores: [
        { nome: "Inês Belchior",               fed: "38424", hcp: 0 },
        { nome: "Rodrigo Marques Santos",      fed: "37152", hcp: 0 },
        { nome: "António Teixeira e Costa",    fed: "37680", hcp: 0 },
        { nome: "Pedro Santos Pereira",        fed: "46577", hcp: 0 },
      ]},
      { grupo: "B", clube: "Oporto Golf Clube A", jogadores: [
        { nome: "Francisca Rocha",             fed: "40958", hcp: 0 },
        { nome: "Luis António Silva",          fed: "42845", hcp: 0 },
        { nome: "Henrique Montenegro",         fed: "39552", hcp: 0 },
        { nome: "André Neto Lopes",            fed: "41173",    hcp: 0 },
        { nome: "Guilherme Grabner Moreira",   fed: "42205", hcp: 0 },
      ]},
      { grupo: "C", clube: "Club de Golf de Miramar", jogadores: [
        { nome: "Diogo Silva Pinto Rocha",     fed: "34186", hcp: 0 },
        { nome: "Bernardo Costa Pinheiro",     fed: "40682", hcp: 0 },
        { nome: "Miguel Silveira",             fed: "35404", hcp: 0 },
        { nome: "Tomás Afonso Araujo",         fed: "35849",    hcp: 0 },
        { nome: "Duarte Gonçalves",            fed: "35814", hcp: 0 },
      ]},
      { grupo: "D", clube: "Clube de Golf do Estoril", jogadores: [
        { nome: "Konstantin Mikirtumov",       fed: "34238", hcp: 0 },
        { nome: "José Miguel Franco de Sousa", fed: "40112", hcp: 0 },
        { nome: "Leonardo Miguel Tilly Alves", fed: "44453", hcp: 0 },
        { nome: "Reuben Thapa",                fed: "47552", hcp: 0 },
      ]},
      { grupo: "E", clube: "CG Vilamoura", jogadores: [
        { nome: "Tiago Abrantes",              fed: "38315", hcp: 0 },
        { nome: "João Crasi Alves",            fed: "39701", hcp: 0 },
        { nome: "Dinis Silva Rebelo",          fed: "36678", hcp: 0 },
        { nome: "João Maria Ivo de Carvalho",  fed: "38334", hcp: 0 },
      ]},
      { grupo: "F", clube: "Oporto Golf Clube B", jogadores: [
        { nome: "Pedro Ferreira",              fed: "43810", hcp: 0 },
        { nome: "Miguel Dinis Ferreira",       fed: "41744", hcp: 0 },
        { nome: "Simão Oliveira",              fed: "47002", hcp: 0 },
        { nome: "Teresa Ferreira",             fed: "46589", hcp: 0 },
      ]},
      { grupo: "G", clube: "Clube de Golfe Citynorte", jogadores: [
        { nome: "Diogo Marques Lopes",         fed: "35874", hcp: 0 },
        { nome: "Pedro Aires",                 fed: "42068", hcp: 0 },
        { nome: "Diogo Afonso",                fed: "45343", hcp: 0 },
        { nome: "Diogo Vieira",                fed: "45475", hcp: 0 },
      ]},
      { grupo: "H", clube: "Clube de Golfe de Belas", jogadores: [
        { nome: "Sebastião Cadete",            fed: "43972", hcp: 0 },
        { nome: "Ricardo Morna",               fed: "39899", hcp: 0 },
        { nome: "Pedro Castro Mendes",         fed: "44561", hcp: 0 },
        { nome: "Henrique Almeida da Silva",   fed: "41612", hcp: 0 },
      ]},
      { grupo: "I", clube: "Vale de Janelas Golf Club", jogadores: [
        { nome: "Francisca Salgado",           fed: "43832", hcp: 0 },
        { nome: "Mafalda Bandeira",            fed: "46646", hcp: 0 },
        { nome: "Marie Pinto da Cunha",        fed: "48049", hcp: 0 },
        { nome: "Maximilian Hermelin",         fed: "46434", hcp: 0 },
      ]},
      { grupo: "J", clube: "Lisbon Sports Club", jogadores: [
        { nome: "Lourenço de Castro Fernandes",fed: "37633", hcp: 0 },
        { nome: "Vasco Dias Agudo",            fed: "36810", hcp: 0 },
        { nome: "Ana Bianchi",                 fed: "36861", hcp: 0 },
        { nome: "Joaquim Gomes",               fed: "53714", hcp: 0 },
      ]},
      { grupo: "K", clube: "Clube de Golf da Ilha Terceira", jogadores: [
        { nome: "Bia Sampaio Mesquita",              fed: "51937", hcp: 0 },
        { nome: "Madalena Alexandra Van Zeller",     fed: "47078", hcp: 0 },
        { nome: "Maria Fonseca Azevedo",             fed: "44019", hcp: 0 },
        { nome: "João Lucas Fagundes",               fed: "44677", hcp: 0 },
      ]},
    ],
  },
};

/**
 * Mapa tcode → pill de torneio.
 * Adicionar aqui novos torneios conforme necessário.
 */
const TOURN_PILLS: Record<string, TournPill> = {
  "10444": "PJA",   // AT&T PEBBLE BEACH PRO-AM BY TITLEIST
  "10492": "PJA",   // Aroeira Master by Details
  "10036": "PJA",   // Ribagolfe Oaks Masters 2025
  "10019": "PJA",   // Race to Dunas G. Final
};


const SSERRA_CCODE = "007";

function TournPillBadge({ tcode, dynamicPills }: { tcode?: string; dynamicPills?: Record<string, TournPill> }) {
  if (!tcode) return null;
  const tcodes = tcode.split("+");
  const pill = tcodes.map(tc => TOURN_PILLS[tc] || dynamicPills?.[tc]).find(Boolean);
  if (!pill) return null;
  if (pill === "PJA")    return <span className="p p-sm p-tourn p-pja">PJA</span>;
  if (pill === "SSERRA") return <span className="p p-sm p-tourn" style={PILL_SSERRA}>SSerra</span>;
  return <PillBadge pill={pill} />;
}

/** Constrói o URL de um índice: 0 → /data/pull-torneios000.json */
function dataUrl(idx: number): string {
  return DATA_BASE_URL + String(idx).padStart(DATA_DIGITS, "0") + DATA_EXT;
}

/**
 * Carrega todos os ficheiros sequencialmente até 404 (ou DATA_MAX).
 * Retorna array com todos os torneios de todos os ficheiros, preservando
 * o campo _sourceFile para referência futura.
 */
async function loadAllFiles(): Promise<{ tournaments: Tournament[]; meta: FileMeta[] }> {
  const allTournaments: Tournament[] = [];
  const meta: FileMeta[] = [];

  for (let i = 0; i < DATA_MAX; i++) {
    const url = dataUrl(i);
    let resp: Response;
    try { resp = await fetch(url); } catch { break; }
    if (!resp.ok) break;  // 404 ou outro erro → parar

    const d: DriveData = await resp.json();
    const normalised = (d.tournaments || []).map(t => ({
      ...t,
      _sourceFile: url,
      _sourceIndex: i,
      players: t.players.map(normalizePlayer),
    }));
    allTournaments.push(...normalised);
    meta.push({
      file: url,
      index: i,
      lastUpdated: d.lastUpdated,
      source: d.source,
      count: normalised.length,
    });
  }

  return { tournaments: allTournaments, meta };
}

interface FileMeta {
  file: string; index: number;
  lastUpdated?: string; source?: string; count: number;
}

/* PlayersDB, MANUEL_FED importados de tournamentPrimitives */

function resolveEsc(p: Player, escLookup: EscLookup): string {
  // Prioridade 1: escalão gravado no próprio registo do torneio (histórico)
  const historic = (p as any).escalao || (p as any).ageCategory;
  if (historic) return historic.replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim();
  // Prioridade 2: lookup atual (players.json) — só usado se não há dado histórico
  const fed = p.fedCode || (p as any).fed;
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

/* ─────────────────────────────────────────────
   TIPOS (subset do formato Drive)
   ───────────────────────────────────────────── */
export interface RoundScore {
  round: number; gross: number;
  scores: number[]; pars: number[]; si: number[]; meters: number[];
  courseRating?: number; slope?: number; teeName?: string; teeColorId?: number;
}
export interface Player {
  scoreId: string; pos: number | string | null; name: string; club: string;
  grossTotal: number | string | null; toPar: number | string | null;
  fedCode?: string; hcpExact?: number; hcpPlay?: number;
  course?: string; courseRating?: number; slope?: number; teeName?: string;
  nholes?: number; parTotal?: number;
  scores?: number[]; par?: number[]; si?: number[]; meters?: number[];
  roundScores?: RoundScore[];
  // flags internas de multi-ronda (não vêm do JSON — atribuídas por expandMultiRound)
  _wd?: boolean;          // desistiu em ≥1 ronda
  _incomplete?: boolean;  // jogou menos rondas que o máximo disponível
  _roundsPlayed?: number; // rondas válidas jogadas
}
export interface Tournament {
  name: string; ccode?: string; tcode: string; date: string;
  campo: string; clube?: string; circuit?: string; series?: string;
  region?: string; escalao?: string | null; num?: number;
  links?: Record<string, string>;
  rounds?: number; playerCount: number; players: Player[];
  _sourceFile?: string;
  _sourceIndex?: number;
}
interface DriveData {
  lastUpdated?: string; source?: string;
  totalTournaments: number; totalPlayers: number;
  tournaments: Tournament[];
}

/* ─────────────────────────────────────────────
   NORMALIZAÇÃO (como DrivePage)
   ───────────────────────────────────────────── */
/** Converte "SOBRENOME,Nome" → "Nome Sobrenome" (capitalização título) */
function formatPlayerName(raw: string): string {
  if (!raw) return raw;
  // Detectar formato "SOBRENOME,Nome" ou "SOBRENOME, Nome"
  const commaIdx = raw.indexOf(",");
  if (commaIdx > 0) {
    const last  = raw.substring(0, commaIdx).trim();
    const first = raw.substring(commaIdx + 1).trim();
    // Capitalizar cada palavra (ex: "IVO DE CARVALHO" → "Ivo de Carvalho")
    const cap = (s: string) => s.split(" ").map((w, i) => {
      const lower = w.toLowerCase();
      // Partículas que ficam minúsculas quando não são a primeira palavra
      if (i > 0 && ["de","da","do","das","dos","e","van","von","de la"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(" ");
    return `${cap(first)} ${cap(last)}`.trim();
  }
  return raw;
}

function normalizePlayer(p: any): Player {
  const r1: RoundScore | undefined = p.roundScores?.[0];
  return {
    ...p,
    name: formatPlayerName(p.name),
    scores: p.scores || r1?.scores,
    par: p.par || r1?.pars,
    si: p.si || r1?.si,
    meters: p.meters || r1?.meters,
    courseRating: p.courseRating ?? r1?.courseRating,
    slope: p.slope ?? r1?.slope,
    teeName: p.teeName || r1?.teeName,
  };
}

/** Expand multi-round: 1 torneio → R1 + R2 + ... + Total */
export function expandMultiRound(t: Tournament): Tournament[] {
  const nRounds = t.rounds || 1;
  const hasMulti = t.players.some(p => (p.roundScores?.length ?? 0) > 1);
  if (nRounds <= 1 || !hasMulti) return [t];

  const out: Tournament[] = [];

  // Per-round entries
  for (let rd = 1; rd <= nRounds; rd++) {
    const rdPlayers: Player[] = [];
    for (const p of t.players) {
      const rs = p.roundScores?.find(r => r.round === rd);
      if (!rs) continue;
      const parT = p.parTotal || rs.pars.reduce((a, b) => a + b, 0);
      rdPlayers.push(normalizePlayer({
        ...p,
        scoreId: p.scoreId + "_R" + rd,
        grossTotal: rs.gross,
        toPar: rs.gross - parT,
        scores: rs.scores, par: rs.pars, si: rs.si, meters: rs.meters,
        courseRating: rs.courseRating, slope: rs.slope, teeName: rs.teeName,
        roundScores: [rs],
      }));
    }
    // Sort by gross for this round — WD players sempre no fim
    rdPlayers.sort((a, b) => {
      const aWD = a._wd; const bWD = b._wd;
      if (aWD && !bWD) return 1;
      if (!aWD && bWD) return -1;
      return numGross(a) - numGross(b);
    });
    out.push({ ...t, players: rdPlayers, _roundLabel: `R${rd}` } as any);
  }

  // Total (accumulated) entry — jogadores incompletos vão para o fim
  // playedRounds = máximo de rondas realmente jogadas (não o total declarado do torneio)
  // Isto evita marcar todos como "incompletos" quando ainda faltam rondas futuras.
  const playedRounds = Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0));

  const totalPlayers: Player[] = [];
  for (const p of t.players) {
    if (!p.roundScores?.length) continue;

    // Rondas válidas: excluir WD (gross>=999 ou scorecard todo zeros)
    const validRounds = p.roundScores.filter(rs =>
      rs.gross < 999 && !(rs.scores?.length && rs.scores.every(s => s === 0))
    );
    const isWD = validRounds.length < p.roundScores.length;   // desistiu em ≥1 ronda
    const nPlayed = validRounds.length;

    // "incompleto" = menos rondas válidas do que o máximo disponível, sem ser WD
    const incomplete = !isWD && nPlayed < playedRounds;

    const gross = validRounds.reduce((s, rs) => s + rs.gross, 0);
    const parPerRound = p.parTotal || (p.roundScores[0]?.pars.reduce((a, b) => a + b, 0) || 0);
    const parT = parPerRound * nPlayed;

    totalPlayers.push(normalizePlayer({
      ...p,
      grossTotal: gross,
      toPar: gross - parT,
      _incomplete: incomplete,
      _wd: isWD,
      _roundsPlayed: nPlayed,
    } as any));
  }
  // Completos ordenados por gross; incompletos no fim; WD no fim de tudo
  const complete   = totalPlayers.filter(p => !p._incomplete && !p._wd).sort((a, b) => numGross(a) - numGross(b));
  const wdPlayers  = totalPlayers.filter(p => p._wd);
  const incomplete = totalPlayers.filter(p =>  p._incomplete && !p._wd).sort((a, b) => numGross(a) - numGross(b));
  // Positions only for complete players
  let pos = 1;
  complete.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(complete[i - 1])) pos = i + 1;
    (p as any)._pos = pos;
  });
  incomplete.forEach(p => { (p as any)._pos = null; });
  // Label do tab: "Resumo" quando terminou, "Resumo R1–R2" quando ainda faltam rondas
  const accumLabel = playedRounds < nRounds ? `Resumo R1–R${playedRounds}` : "Resumo";
  out.push({ ...t, players: [...complete, ...incomplete, ...wdPlayers], _roundLabel: accumLabel, _isTotal: true } as any);

  return out;
}

function numGross(p: Player): number {
  return typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number) ?? 999;
}

/* fmtTP importado de tournamentPrimitives */

/* ─────────────────────────────────────────────
   AGRUPAMENTO AUTOMÁTICO DE RONDAS (Dia 1 / Dia 2 → torneio sintético)
   ───────────────────────────────────────────── */

/** "PJA TOUR Vale Pisão - Dia 1" → "PJA TOUR Vale Pisão" */
function extractBaseName(name: string): string {
  // Suporta: "– Dia 2", "- Dia1", " Dia 2", " Dia1", "- Round 1", etc.
  return name.replace(/\s*[-–]?\s*(?:dia|round|ronda)\s*\d+\s*$/i, "").trim();
}
function detectRoundNumber(name: string): number | null {
  const m = name.match(/[-–]?\s*(?:dia|round|ronda)\s*(\d+)\s*$/i);
  return m ? parseInt(m[1]) : null;
}

/** Detecta a série/circuito de um torneio */
/** Funde N torneios (rondas separadas) num único torneio multi-ronda sintético */
function mergeTournamentRounds(rounds: Tournament[]): Tournament {
  // Ordenar por número da ronda, fallback por data
  const sorted = [...rounds].sort((a, b) => {
    const ra = detectRoundNumber(a.name) ?? 99;
    const rb = detectRoundNumber(b.name) ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.date || "").localeCompare(b.date || "");
  });

  const nRounds = sorted.length;
  const byKey = new Map<string, { player: Player; rsArr: RoundScore[] }>();

  sorted.forEach((t, ri) => {
    for (const p of t.players) {
      const key = p.fedCode || ("name:" + p.name.toLowerCase().trim());
      const rs: RoundScore = {
        round: ri + 1,
        gross: numGross(p),
        scores: p.scores || p.roundScores?.[0]?.scores || [],
        pars: p.par || p.roundScores?.[0]?.pars || [],
        si: p.si || p.roundScores?.[0]?.si || [],
        meters: p.meters || p.roundScores?.[0]?.meters || [],
        courseRating: p.courseRating ?? p.roundScores?.[0]?.courseRating,
        slope: p.slope ?? p.roundScores?.[0]?.slope,
        teeName: p.teeName ?? p.roundScores?.[0]?.teeName,
      };
      if (byKey.has(key)) {
        byKey.get(key)!.rsArr.push(rs);
      } else {
        byKey.set(key, { player: p, rsArr: [rs] });
      }
    }
  });

  const refParTotal = sorted[0].players[0]?.parTotal
    || sorted[0].players[0]?.par?.reduce((a, b) => a + b, 0)
    || 72;

  const players: Player[] = [];
  for (const { player, rsArr } of byKey.values()) {
    const grossTotal = rsArr.reduce((s, r) => s + r.gross, 0);
    players.push({
      ...player,
      roundScores: rsArr,
      grossTotal,
      toPar: grossTotal - refParTotal * rsArr.length,
      parTotal: refParTotal,
      scores: rsArr[0]?.scores,
      par:    rsArr[0]?.pars,
      si:     rsArr[0]?.si,
      meters: rsArr[0]?.meters,
    });
  }

  const baseName  = extractBaseName(sorted[0].name);
  const lastDate  = sorted[sorted.length - 1].date;
  // Tcodes mostrados como "10370+10371"
  const tcodeList = sorted.map(t => t.tcode).join("+");

  return {
    ...sorted[0],
    name: baseName,
    date: lastDate,
    rounds: nRounds,
    playerCount: players.length,
    players,
    tcode: tcodeList,
    _sourceFile: sorted[0]._sourceFile,
    _sourceIndex: sorted[0]._sourceIndex,
    _isSynthetic: true,
    _subRounds: sorted,
  } as any;
}

/**
 * Constrói a lista de display: detecta pares "Dia 1/Dia 2" com mesmo ccode+baseName,
 * cria torneios sintéticos e esconde os originais da sidebar.
 */
function buildDisplayList(tournaments: Tournament[]): Tournament[] {
  // Agrupa apenas torneios com sufixo explícito "Dia N / Round N / Ronda N"
  // (com ou sem travessão). Evita fusões acidentais de edições anuais do mesmo torneio.
  const candidates = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    if (detectRoundNumber(t.name) == null) continue;
    const base = extractBaseName(t.name);
    // Usar ccode + baseName como chave para evitar fusão entre torneios homónimos de clubes diferentes
    const key  = `${t.ccode || "?"}_${base.toLowerCase().trim()}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(t);
  }

  const hiddenTcodes = new Set<string>();
  const synthetics: Tournament[] = [];
  for (const group of candidates.values()) {
    if (group.length < 2) continue;
    group.forEach(t => hiddenTcodes.add(t.tcode));
    synthetics.push(mergeTournamentRounds(group));
  }

  const standalone = tournaments.filter(t => !hiddenTcodes.has(t.tcode));
  return [...standalone, ...synthetics].sort(
    (a, b) => (b.date || "").localeCompare(a.date || "")
  );
}

/* ─────────────────────────────────────────────
   CÁLCULO SD (replicado do DrivePage)
   ───────────────────────────────────────────── */
interface SDResult { sd: number | null; source: "ags" | "raw" | null }
function computeSD(p: Player): SDResult {
  const scores = p.scores || [];
  const parArr = p.par || [];
  const si = p.si || [];
  const nh = p.nholes || scores.length || (parArr.length > 0 ? parArr.length : 18);
  const is9 = nh <= 9;
  const cr = p.courseRating;
  const slope = p.slope;
  const hcp = p.hcpExact;
  const gross = numGross(p);
  if (!cr || !slope || gross == null || isNaN(gross)) return { sd: null, source: null };
  if (hcp != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
    const ags = calcAGS(scores, parArr, si, cr, slope, hcp, nh);
    const raw = (113 / slope) * (ags - cr);
    const sd = is9 ? raw + expectedSD9(hcp) : raw;
    return { sd: Math.max(0, Math.round(sd * 10) / 10), source: "ags" };
  }
  if (!is9) {
    const sd = Math.max(0, Math.round((113 / slope) * (gross - cr) * 10) / 10);
    return { sd, source: "raw" };
  }
  if (hcp != null) {
    const raw = (113 / slope) * (gross - cr);
    const sd = Math.max(0, Math.round((raw + expectedSD9(hcp)) * 10) / 10);
    return { sd, source: "raw" };
  }
  return { sd: null, source: null };
}


/* ─────────────────────────────────────────────
   FILTROS DE JOGADORES (ScorecardLB — usa Player[])
   Nota: MultiRoundLeaderboard tem versão própria para MultiRoundRow[]
   ───────────────────────────────────────────── */
interface PlayerFilter {
  name: string; escs: string[]; tees: string[]; club: string;
}

function filterPlayers(players: Player[], f: PlayerFilter, escLookup: EscLookup, playersDB: PlayersDB): Player[] {
  let ps = players;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(p => p.name.toLowerCase().includes(q) || (p.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(p => f.escs.includes(resolveEsc(p, escLookup)));
  if (f.tees.length) ps = ps.filter(p => p.teeName != null && f.tees.includes(p.teeName));
  if (f.club) ps = ps.filter(p => p.club === f.club);
  return ps;
}
function PlayerFilterBar({ players, filter, onChange, escLookup, playersDB, total }: {
  players: Player[]; filter: PlayerFilter; onChange: (f: PlayerFilter) => void;
  escLookup: EscLookup; playersDB: PlayersDB; total: number;
}) {
  const availEsc   = useMemo(() => { const s = new Set<string>(); for (const p of players) { const e = resolveEsc(p, escLookup); if (e) s.add(e); } return [...s].sort((a,b) => a.localeCompare(b)); }, [players, escLookup]);
  const availTees  = useMemo(() => { const s = new Set<string>(); for (const p of players) if (p.teeName) s.add(p.teeName); return [...s].sort(); }, [players]);
  const availClubs = useMemo(() => { const s = new Set<string>(); for (const p of players) if (p.club) s.add(p.club); return [...s].sort((a,b) => a.localeCompare(b,"pt")); }, [players]);
  const isActive = filter.name || filter.escs.length || filter.tees.length || filter.club;
  const filtered = useMemo(() => filterPlayers(players, filter, escLookup, playersDB), [players, filter, escLookup, playersDB]);
  const hasOpts = availClubs.length > 1 || availEsc.length > 1 || availTees.length > 1;
  if (total < 8 && !isActive) return null;

  return (
    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, padding:"6px 0 8px", borderBottom:"1px solid var(--border)", marginBottom:8 }}>
      <div style={{ position:"relative", flexShrink:0 }}>
        <span style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"var(--text-muted)", pointerEvents:"none" }}>🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={filter.name} onChange={e => onChange({ ...filter, name:e.target.value })}
          style={{ fontSize:11, padding:"3px 8px 3px 22px", borderRadius:6, border:"1px solid var(--border)", background:"var(--bg-card,#fff)", color:"var(--text)", width:140, outline:"none" }} />
      </div>
      {hasOpts && <span style={{ color:"var(--border)", fontSize:11 }}>|</span>}
      {availEsc.length > 1 && availEsc.map(e => { const k = e.toLowerCase().replace(/[\s-]/g,""); const s = ESC_STYLE[k]; return <FilterChip key={e} active={filter.escs.includes(e)} onClick={() => onChange({ ...filter, escs:toggleArr(filter.escs,e) })} color={s?.bg}>{e}</FilterChip>; })}
      {availTees.length > 1 && availTees.map(t => { const hex = getTeeHex(t); return <FilterChip key={t} active={filter.tees.includes(t)} onClick={() => onChange({ ...filter, tees:toggleArr(filter.tees,t) })} color={hex}><span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:hex, border:"1px solid rgba(0,0,0,.18)" }} />{t}</span></FilterChip>; })}
      {availClubs.length > 2 && <select value={filter.club} onChange={e => onChange({ ...filter, club:e.target.value })} style={{ fontSize:11, padding:"3px 6px", borderRadius:6, border:`1px solid ${filter.club?"var(--accent)":"var(--border)"}`, background:"var(--bg-card,#fff)", color:"var(--text)", cursor:"pointer", fontWeight:filter.club?700:400 }}><option value="">Todos os clubes</option>{availClubs.map(c => <option key={c} value={c}>{c}</option>)}</select>}
      {isActive && <><span style={{ fontSize:10, color:"var(--text-muted)", marginLeft:2 }}>{filtered.length} de {total}</span><button onClick={() => onChange(EMPTY_FILTER)} style={{ fontSize:10, padding:"2px 8px", borderRadius:20, border:"1px solid var(--border)", background:"var(--bg-hover)", color:"var(--text-muted)", cursor:"pointer" }}>✕ limpar</button></>}
    </div>
  );
}

/* EscPill, TeeDot, isManuel importados de tournamentPrimitives */

/* PName — alias local */
const PName = ({ name, fedCode, playersDB }: { name: string; fedCode?: string; playersDB: PlayersDB }) =>
  <TournPName name={name} fedCode={fedCode} playersDB={playersDB} />;

/* SortKey — usado pelo ScorecardLB */
type SortKey = "pos" | "name" | "club" | "esc" | "hcp" | "gross" | "toPar" | "tee" | "sd";

/* ─────────────────────────────────────────────
   LEADERBOARD PRINCIPAL (1 ronda)
   Colunas idênticas ao Drive: ESC · FED · CLUBE · HCP · TEE · Tot · ± · SD · 🐦 · Par · ■
   ───────────────────────────────────────────── */
export function ScorecardLB({ tournament, escLookup, playersDB, siLabel, parLabelColSpan = 5 }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB; siLabel?: string; parLabelColSpan?: number }) {
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<SortKey>("pos");
  const [showScorecard, setShowScorecard] = useState(true);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  // Reset filtros quando muda de torneio
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) { setLastTcode(tournament.tcode); setFilter(EMPTY_FILTER); }

  const rawPlayers = tournament.players.filter(p => p.scores && p.scores.length > 0);

  // ─── Calcular ref, par, posições ANTES de qualquer early return ───────────
  // (React exige que todos os hooks sejam chamados incondicionalmente)
  const refP    = rawPlayers[0];
  const par     = refP?.par || [];
  const nh      = par.length;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si      = refP?.si || [];

  const nonWD   = rawPlayers.filter(p => !p._wd);
  const wdOnly  = rawPlayers.filter(p =>  p._wd);
  const byGross = [...nonWD].sort((a, b) => numGross(a) - numGross(b));
  let posCounter = 1;
  byGross.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(byGross[i - 1])) posCounter = i + 1;
    (p as any)._pos = posCounter;
  });
  wdOnly.forEach(p => { (p as any)._pos = 9999; });
  const grosses = byGross.map(p => numGross(p)).filter(g => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  // Hooks têm de vir ANTES de qualquer return condicional
  const filteredPlayers = useMemo(
    () => filterPlayers(rawPlayers, filter, escLookup, playersDB),
    [rawPlayers, filter, escLookup, playersDB]
  );



  const sorted = useMemo(() => [...filteredPlayers].sort((a, b) => {
    // WD players sempre no fim, independentemente do sortKey
    const aWD = a._wd; const bWD = b._wd;
    if (aWD && !bWD) return 1;
    if (!aWD && bWD) return -1;
    let av: any, bv: any;
    switch (sortKey) {
      case "pos":   av = (a as any)._pos ?? 999; bv = (b as any)._pos ?? 999; break;
      case "name":  av = a.name; bv = b.name; break;
      case "club":  av = a.club || ""; bv = b.club || ""; break;
      case "esc":   av = resolveEsc(a, escLookup) || ""; bv = resolveEsc(b, escLookup) || ""; break;
      case "hcp":   av = a.hcpExact ?? 999; bv = b.hcpExact ?? 999; break;
      case "gross": av = numGross(a); bv = numGross(b); break;
      case "toPar": av = numGross(a) - parTotal; bv = numGross(b) - parTotal; break;
      case "tee":   av = a.teeName || ""; bv = b.teeName || ""; break;
      case "sd":    av = computeSD(a).sd ?? 999; bv = computeSD(b).sd ?? 999; break;
      default:      av = 0; bv = 0;
    }
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? av - bv : bv - av;
  }), [filteredPlayers, sortKey, sortDir, parTotal, escLookup]);

  // Agora é seguro fazer early return — todos os hooks já foram chamados
  if (!rawPlayers.length) return <EmptyState size="sm" message="Scorecards não disponíveis." />;

  const rows: ScorecardRow[] = sorted.map((p, idx) => {
    const isWDPlayer = !!p._wd || p.grossTotal == null || numGross(p) >= 999;
    const gross = isWDPlayer ? 0 : numGross(p);
    const dp = (p as any)._pos;
    const showPos = idx === 0 || dp !== (sorted[idx - 1] as any)._pos;
    const medal = dp === 1 ? "🥇" : dp === 2 ? "🥈" : dp === 3 ? "🥉" : null;
    const posDisplay = isWDPlayer ? "WD" : (sortKey === "pos" ? (showPos ? (medal ?? dp) : "") : (medal ?? dp));
    const esc = resolveEsc(p, escLookup) || tournament.escalao || "";
    const { sd, source } = computeSD(p);
    const rowManuel = isManuel(p);
    const rowBg = rowManuel ? "var(--bg-success-subtle)" : undefined;
    const stickyBg = rowManuel ? "var(--bg-manuel-sticky)" : undefined;

    // Birdies / pars / bogeys
    const scores = p.scores || [];
    let birds = 0, pars = 0, bogs = 0;
    for (let i = 0; i < scores.length && i < par.length; i++) {
      const d = scores[i] - par[i];
      if (d <= -1) birds++;
      else if (d === 0) pars++;
      else bogs++;
    }

    return {
      key: p.scoreId || idx,
      pos: posDisplay,
      gross,
      toPar: isWDPlayer ? null : gross - parTotal,
      scores,
      rowBg,
      stickyBg,
      nameContent: <PName name={p.name} fedCode={p.fedCode} playersDB={playersDB} highlight={isManuel(p)} />,
      prefixCells: <>
        <td className="lb-esc">{esc ? <EscPill esc={esc} /> : <span className="muted">–</span>}</td>
        <td className="lb-fed">{p.fedCode || "–"}</td>
        <td className="lb-club">{p.club || "–"}</td>
        <td className="lb-hcp">{p.hcpExact != null ? p.hcpExact.toFixed(1) : "–"}</td>
        <td className="lb-tee"><TeeDot teeName={p.teeName} /></td>
      </>,
      postScorecardCells: <>
        <td className="lb-sd">
          {sd != null
            ? <SDPill sd={sd} source={source} hcp={p.hcpExact ?? null} />
            : <span className="muted">–</span>}
        </td>
        <td className="lb-bird">{birds || ""}</td>
        <td className="lb-par-stat">{pars || ""}</td>
        <td className="lb-bog">{bogs || ""}</td>
      </>,
    };
  });

  return (
    <ScorecardLeaderboard
      par={par}
      si={si.length >= nh ? si : undefined}
      siLabel={siLabel}
      rows={rows}
      parLabelColSpan={parLabelColSpan}
      postTotalColCount={0}
      showScorecard={showScorecard}
      onToggleScorecard={() => setShowScorecard(v => !v)}
      metaLine={<>
        <span>{rawPlayers.length} jog · Par {parTotal} · {nh}h</span>
        {avg > 0 && <span>· Média {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})</span>}
        {refP.course && <span>· 📍 {refP.course}</span>}
        {refP.courseRating && <span>· CR {refP.courseRating}</span>}
        {refP.slope && <span>· Slope {refP.slope}</span>}
      </>}
      filterBar={
        <PlayerFilterBar
          players={rawPlayers} filter={filter} onChange={setFilter}
          escLookup={escLookup} playersDB={playersDB} total={rawPlayers.length}
        />
      }
      prefixHeaderCells={<>
        <SortableHdr k="esc" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-esc">ESC.</SortableHdr>
        <th className="lb-fed">FED</th>
        <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-club">CLUBE</SortableHdr>
        <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-hcp">HCP</SortableHdr>
        <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-tee">TEE</SortableHdr>
      </>}
      postScorecardHeaderCells={<>
        <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-sd">SD</SortableHdr>
        <th className="lb-bird">🐦</th>
        <th className="lb-par-stat">Par</th>
        <th className="lb-bog">■</th>
      </>}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
      onSortPos={() => handleSort("pos")}
      onSortName={() => handleSort("name")}
    />
  );
}

/* ─────────────────────────────────────────────
   LEADERBOARD ACUMULADO (multi-ronda)
   ───────────────────────────────────────────── */
export function AccumulatedLB({ tournament, nRounds, escLookup, playersDB }: { tournament: Tournament; nRounds: number; escLookup: EscLookup; playersDB: PlayersDB }) {
  const rawPlayers = tournament.players;

  const complete   = rawPlayers.filter(p => !p._incomplete);
  const incomplete = rawPlayers.filter(p =>  p._incomplete);
  const parPerRound = complete[0]?.parTotal ?? incomplete[0]?.parTotal ?? 72;

  // useMemo ANTES do early return — regra dos hooks React
  const rows: MRRow[] = useMemo(() => rawPlayers.map(p => {
    const esc = resolveEsc(p, escLookup) || tournament.escalao || "";
    const roundScores = p.roundScores || [];
    // Posicionar cada ronda pelo seu número real (rounds[0]=R1, rounds[1]=R2, ...)
    // para que jogadores parciais mostrem "–" nas rondas que não jogaram
    const mappedRounds = Array.from({ length: nRounds }, (_, i) => {
      const rdNum = i + 1;
      const rs = roundScores.find(r => r.round === rdNum);
      if (!rs) return undefined;
      const sdP: Player = { ...p, scores: rs.scores, par: rs.pars, si: rs.si,
        courseRating: rs.courseRating, slope: rs.slope, nholes: rs.pars?.length };
      const { sd } = computeSD(sdP);
      let birdies = 0, pars = 0, bogeys = 0;
      for (let i = 0; i < (rs.scores?.length ?? 0); i++) {
        const d = (rs.scores[i] || 0) - (rs.pars[i] || 0);
        if (d <= -1) birdies++; else if (d === 0) pars++; else bogeys++;
      }
      return {
        gross: rs.gross,
        parPerRound: rs.pars?.reduce((a, b) => a + b, 0) || parPerRound,
        sd, sdSource: null as string | null,
        birdies, pars, bogeys,
      };
    }) as MRRound[];
    return {
      key: p.scoreId || p.name,
      name: p.name,
      fed: p.fedCode,
      club: p.club || "",
      hcp: p.hcpExact ?? null,
      esc: esc || undefined,
      teeName: p.teeName,
      gross: numGross(p),
      parTotal: parPerRound * nRounds,
      isIncomplete: !!p._incomplete,
      isWD: !!p._wd,
      isHighlighted: isManuel(p),
      rounds: mappedRounds,
    };
  }), [rawPlayers, escLookup, nRounds, parPerRound]);

  // Referência para meta-informação do campo (mesmo que ScorecardLB)
  const refP0     = complete[0] ?? rawPlayers[0];
  const refRS     = refP0?.roundScores?.find(rs => rs.round === 1);
  const cr        = refRS?.courseRating ?? refP0?.courseRating;
  const slope     = refRS?.slope       ?? refP0?.slope;
  const campo     = tournament.campo || "";
  const grosses   = complete.map(p => numGross(p)).filter(g => !isNaN(g) && g > 0);
  const avgGross  = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : null;

  const info = [
    `${complete.length} classif.`,
    incomplete.length > 0 ? `${incomplete.length} inc.` : null,
    `${nRounds}R`,
    `Par ${parPerRound * nRounds}`,
    avgGross != null ? `Média ${avgGross.toFixed(1)} (${avgGross - parPerRound * nRounds >= 0 ? "+" : ""}${(avgGross - parPerRound * nRounds).toFixed(1)})` : null,
    campo ? `📍 ${campo}` : null,
    cr    ? `CR ${cr}`    : null,
    slope ? `Slope ${slope}` : null,
  ].filter(Boolean).join(" · ");

  // Early return seguro — useMemo já foi chamado acima
  if (!rawPlayers.length) return <EmptyState size="sm" message="Sem resultados." />;

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">{info}</div>
      <MultiRoundLeaderboard
        rows={rows}
        nRounds={nRounds}
        playersDB={playersDB}
        showCols={{ esc: true, fed: true, tee: true }}
        sortable
        filterable
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   TOURNAMENT DETAIL VIEW
   ───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   LINKS BAR — Draw / Classificação agrupados por escalão
   ───────────────────────────────────────────── */
type LinkGroup = { label: string; color: string; items: { name: string; url: string }[] };

function buildLinkGroups(links: Record<string, string>, escalao?: string | null): LinkGroup[] {
  const ESC_COLORS: Record<string, string> = {
    wagr:  "var(--accent)",
    sub16: C.esc.sub16.bg,
    sub14: C.esc.sub14.bg,
    sub12: C.chartBlue,
  };
  const LABELS: Record<string, string> = {
    draw_wagr_r1: "Draw R1", draw_wagr_r2: "Draw R2", draw_wagr_r3: "Draw R3",
    results_wagr: "Classificação",
    draw_sub16_r1: "Draw R1", draw_sub16_r2: "Draw R2", draw_sub16: "Draw R1", results_sub16: "Classificação",
    draw_sub14: "Draw R1", draw_sub14_r2: "Draw R2", results_sub14: "Classificação",
    draw_sub12: "Draw R1", draw_sub12_r2: "Draw R2", results_sub12: "Classificação",
  };
  const GROUP_ORDER = ["wagr", "sub16", "sub14", "sub12"];
  const grouped: Record<string, { name: string; url: string }[]> = {};

  for (const [key, url] of Object.entries(links)) {
    const grp = GROUP_ORDER.find(g => key.includes(g)) || "outro";
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push({ name: LABELS[key] || key, url });
  }

  const GROUPLABELS: Record<string, string> = {
    wagr: "Tour / WAGR", sub16: "Sub 16", sub14: "Sub 14", sub12: "Sub 12", outro: "Outros"
  };

  // If escalao specified, only show relevant group + maybe wagr
  const esc = escalao?.toLowerCase().replace(/\s/g, "");
  const filteredOrder = esc
    ? GROUP_ORDER.filter(g => g === "wagr" || esc.includes(g))
    : GROUP_ORDER;

  return filteredOrder
    .filter(g => grouped[g]?.length)
    .map(g => ({
      label: GROUPLABELS[g] || g,
      color: ESC_COLORS[g] || "var(--text-muted)",
      items: grouped[g],
    }));
}

function LinksBar({ links, escalao }: { links?: Record<string, string>; escalao?: string | null }) {
  if (!links || Object.keys(links).length === 0) return null;
  const groups = buildLinkGroups(links, escalao);
  if (!groups.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
      {groups.map((g, gi) => (
        <React.Fragment key={g.label}>
          {gi > 0 && <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>}
          <span className="label-caps c-muted" style={{ marginRight: 2 }}>{g.label}</span>
          {g.items.map(item => (
            <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer"
              className="tourn-ext-link"
              style={{ color: g.color, borderColor: g.color }}>
              {item.name} ↗
            </a>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SCORECARD COMBINADO — todas as rondas lado a lado
   Mostra buraco-a-buraco de cada ronda em linha única por jogador.
   Implementação global: usado em todos os torneios multi-ronda.
   ───────────────────────────────────────────── */


/* ─────────────────────────────────────────────
   SCORECARD COMBINADO — visual idêntico ao R1/R2
   Um dia por baixo do outro, mesmo aspecto dos círculos.
   Implementação global para todos os torneios multi-ronda.
   ───────────────────────────────────────────── */
export function AllRoundsScorecardLB({
  tournament, escLookup, playersDB,
}: {
  tournament: Tournament;
  escLookup: EscLookup;
  playersDB: PlayersDB;
}) {
  const [filter, setFilter]   = useState<PlayerFilter>(EMPTY_FILTER);
  const { sortKey, sortDir, toggleSort } = useSort<string>("pos");
  const [showSC, setShowSC]   = useState(true);
  const [groupMode, setGroupMode] = useState(true); // true = agrupado por jogador; false = linha por ronda

  // Quantas rondas foram efectivamente jogadas
  const playedRounds = useMemo(() =>
    Math.max(0, ...tournament.players.map(p => p.roundScores?.length ?? 0)),
  [tournament]);

  // Par e SI de referência (R1 — assume mesmo campo em todas as rondas)
  const refRef = useMemo(() => {
    for (const p of tournament.players) {
      const rs = p.roundScores?.find(r => r.round === 1);
      if (rs?.pars?.length) return { pars: rs.pars, si: rs.si || [] };
    }
    // fallback: usar dados de nível de jogador
    const p0 = tournament.players[0];
    if (p0?.par?.length) return { pars: p0.par, si: p0.si || [] };
    return { pars: [] as number[], si: [] as number[] };
  }, [tournament]);

  const par    = refRef.pars;
  const si     = refRef.si;
  const nh     = par.length || 18;
  const is9    = nh <= 9;
  const parF9  = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9  = !is9 ? par.slice(9).reduce((a, b) => a + b, 0) : 0;
  const parTot = par.reduce((a, b) => a + b, 0);
  const hasSI  = si.length >= nh;

  /* Construir linha por jogador com dados de cada ronda */
  interface RdData {
    scores: number[];
    gross: number;
    toPar: number;
    sd: number | null;
    birds: number; pars: number; bogs: number;
  }
  interface PRow {
    key: string; name: string; club: string; fed?: string;
    hcp: number | null; esc: string; teeName?: string;
    rds: (RdData | null)[];   // null = não jogou / WD
    total: number | null; totalTP: number | null;
    isWD: boolean; pos: number | null;
  }

  function buildRdData(p: Player, rdNum: number): RdData | null {
    const rs = p.roundScores?.find(r => r.round === rdNum);
    if (!rs) return null;
    if (rs.gross >= 999 || (rs.scores?.length > 0 && rs.scores.every(s => s === 0))) return null;
    const capped = rs.scores?.map(s => Math.min(s, MAX_HOLE_SCORE)) ?? [];
    const gross  = capped.length ? capped.reduce((a, b) => a + b, 0) : rs.gross;
    const rdPar  = rs.pars?.reduce((a, b) => a + b, 0) ?? parTot;
    let birds = 0, pars2 = 0, bogs = 0;
    capped.forEach((s, h) => {
      const d = s - (rs.pars?.[h] ?? par[h] ?? 0);
      if (d <= -1) birds++; else if (d === 0) pars2++; else bogs++;
    });
    // SD desta ronda
    const sdP: Player = { ...p, scores: capped, par: rs.pars, si: rs.si,
      courseRating: rs.courseRating, slope: rs.slope, nholes: rs.pars?.length };
    const { sd } = computeSD(sdP);
    return { scores: capped, gross, toPar: gross - rdPar, sd, birds, pars: pars2, bogs };
  }

  /* ── Estrutura agrupada: um PRow por jogador com array de rondas ── */
  interface PRow {
    key: string; name: string; club: string; fed?: string;
    hcp: number | null; esc: string;
    rds: (RdData | null)[];
    total: number | null; totalTP: number | null;
    isWD: boolean; pos: number | null;
    _rdCount: number; _fullCount: number;
  }

  const groupedRows: PRow[] = useMemo(() => tournament.players.map(p => {
    const rds = Array.from({ length: playedRounds }, (_, ri) => buildRdData(p, ri + 1));
    const validRds = rds.filter(r => r != null) as RdData[];
    const anyWD = rds.some((r, ri) => r == null && !!p.roundScores?.find(rs => rs.round === ri + 1));
    const total   = validRds.length ? validRds.reduce((s, r) => s + r.gross, 0) : null;
    const totalTP = validRds.length ? validRds.reduce((s, r) => s + r.toPar, 0) : null;
    return {
      key: p.scoreId || p.name, name: p.name, club: p.club || "",
      fed: p.fedCode, hcp: p.hcpExact ?? null,
      esc: resolveEsc(p, escLookup) || tournament.escalao || "",
      rds, total, totalTP, isWD: anyWD, pos: null,
      _rdCount: validRds.length, _fullCount: 0,
    };
  }), [tournament, playedRounds, escLookup]);

  const rankedGrouped = useMemo(() => {
    const fullCount = Math.max(0, ...groupedRows.map(r => r._rdCount));
    const pm = new Map<string, number>();
    const complete = groupedRows.filter(r => r._rdCount === fullCount && r.total != null && !r.isWD)
      .sort((a, b) => a.total! - b.total!);
    let cnt = 1;
    complete.forEach((r, i) => {
      if (i > 0 && r.total !== complete[i - 1].total) cnt = i + 1;
      pm.set(r.key, cnt);
    });
    return groupedRows.map(r => ({ ...r, pos: pm.get(r.key) ?? null, _fullCount: fullCount }));
  }, [groupedRows]);

  /* ── Estrutura achata: uma linha por (jogador, ronda) ── */
  interface FlatRow {
    key: string; playerKey: string;
    name: string; club: string; fed?: string;
    hcp: number | null; esc: string; teeName?: string;
    rd: RdData; ri: number; rdLabel: string;
    isWD: boolean; pos: number | null;
  }

  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    for (const p of tournament.players) {
      const isWD = !!p._wd;
      for (let ri = 0; ri < playedRounds; ri++) {
        const rd = buildRdData(p, ri + 1);
        if (rd == null) continue; // não jogou esta ronda
        out.push({
          key: `${p.scoreId || p.name}_${ri}`,
          playerKey: p.scoreId || p.name,
          name: p.name, club: p.club || "",
          fed: p.fedCode, hcp: p.hcpExact ?? null,
          esc: resolveEsc(p, escLookup) || tournament.escalao || "",
          teeName: p.teeName,
          rd, ri, rdLabel: `R${ri + 1}`,
          isWD, pos: null,
        });
      }
    }
    return out;
  }, [tournament, playedRounds, escLookup]);

  // Ranking por gross de cada linha individual
  const rankedFlat = useMemo(() => {
    const valid = [...flatRows.filter(r => !r.isWD)].sort((a, b) => a.rd.gross - b.rd.gross);
    const pm = new Map<string, number>();
    let cnt = 1;
    valid.forEach((r, i) => {
      if (i > 0 && r.rd.gross !== valid[i - 1].rd.gross) cnt = i + 1;
      pm.set(r.key, cnt);
    });
    return flatRows.map(r => ({ ...r, pos: pm.get(r.key) ?? null }));
  }, [flatRows]);



  const sorted = useMemo(() => {
    const INF = 9999;
    function cmp(a: FlatRow, b: FlatRow) {
      if (sortKey === "topar")  { const d = (a.rd.toPar ?? INF) - (b.rd.toPar ?? INF); return sortDir === "asc" ? d : -d; }
      if (sortKey === "gross")  { const d = (a.rd.gross ?? INF) - (b.rd.gross ?? INF); return sortDir === "asc" ? d : -d; }
      if (sortKey.startsWith("h")) {
        const h = parseInt(sortKey.slice(1));
        const d = (a.rd.scores?.[h] ?? INF) - (b.rd.scores?.[h] ?? INF);
        return sortDir === "asc" ? d : -d;
      }
      switch (sortKey) {
        case "pos":  return sortDir === "asc" ? (a.pos ?? INF) - (b.pos ?? INF) : (b.pos ?? INF) - (a.pos ?? INF);
        case "name": return sortDir === "asc" ? a.name.localeCompare(b.name,"pt") : b.name.localeCompare(a.name,"pt");
        case "club": return sortDir === "asc" ? a.club.localeCompare(b.club,"pt") : b.club.localeCompare(a.club,"pt");
        case "hcp":  return sortDir === "asc" ? (a.hcp ?? INF) - (b.hcp ?? INF) : (b.hcp ?? INF) - (a.hcp ?? INF);
        default: return 0;
      }
    }
    const normal = rankedFlat.filter(r => !r.isWD).sort(cmp);
    const wd     = rankedFlat.filter(r => r.isWD);
    return [...normal, ...wd];
  }, [rankedFlat, sortKey, sortDir]);

  // Filtro — lista achata para modo independente
  const displayed = useMemo(() => {
    const q = filter.name.toLowerCase();
    return sorted.filter(r =>
      (!q || r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q)) &&
      (!filter.club || r.club === filter.club)
    );
  }, [sorted, filter]);

  // Lista agrupada filtrada para modo agrupado (contagem correcta de jogadores)
  const gDisplayed = useMemo(() => {
    const INF = 9999;
    const q = filter.name.toLowerCase();
    return [...rankedGrouped]
      .sort((a, b) => {
        if (a.isWD && !b.isWD) return 1;
        if (!a.isWD && b.isWD) return -1;
        return (a.pos ?? INF) - (b.pos ?? INF);
      })
      .filter(r =>
        (!q || r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q)) &&
        (!filter.club || r.club === filter.club)
      );
  }, [rankedGrouped, filter]);

  const availClubs = useMemo(() => {
    const s = new Set<string>();
    for (const r of sorted) if (r.club) s.add(r.club);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [sorted]);

  const medals = ["🥇","🥈","🥉"];

  /* Renderizar células de score buraco-a-buraco */
  function ScoreCells({ scores, pars }: { scores: number[]; pars: number[] }) {
    const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
    const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
    return (<>
      {scores.slice(0, 9).map((sc, i) => (
        <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
          <span className={"sc-score " + scClass(sc, pars[i] ?? par[i])}>{sc || ""}</span>
        </td>
      ))}
      <td className="lb-halftot">
        {f9} <span className="fs-8 c-text-3">({fmtToPar(f9 - parF9)})</span>
      </td>
      {!is9 && (<>
        {scores.slice(9, 18).map((sc, i) => (
          <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
            <span className={"sc-score " + scClass(sc, pars[9 + i] ?? par[9 + i])}>{sc || ""}</span>
          </td>
        ))}
        <td className="lb-halftot">
          {b9} <span className="fs-8 c-text-3">({fmtToPar(b9 - parB9)})</span>
        </td>
      </>)}
    </>);
  }

  const postCols = 4; // SD 🐦 Par ■

  return (
    <div>
      {/* Info + toggles */}
      <div className="muted fs-11 mb-8 p-0-4px" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{groupMode ? gDisplayed.length : displayed.length} {groupMode ? "jogadores" : "scorecards"} · {playedRounds}R · Par {parTot}</span>
        {/* Toggle modo */}
        <span style={{ display: "flex", gap: 2, marginLeft: 4, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {([true, false] as const).map(g => (
            <button key={String(g)} onClick={() => setGroupMode(g)}
              style={{
                fontSize: 10, padding: "2px 9px", border: "none", cursor: "pointer",
                background: groupMode === g ? "var(--accent)" : "transparent",
                color: groupMode === g ? "#fff" : "var(--text-muted)",
                fontWeight: groupMode === g ? 700 : 400,
              }}>
              {g ? "Agrupado" : "Independente"}
            </button>
          ))}
        </span>
        <button onClick={() => setShowSC(v => !v)} className="btn" style={{ marginLeft: "auto" }}>
          {showSC ? "Ocultar scorecard" : "Ver scorecard"}
        </button>
      </div>

      {/* Barra de filtro compacta */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
          <input type="text" placeholder="Nome ou clube…" value={filter.name}
            onChange={e => setFilter({ ...filter, name: e.target.value })}
            style={{ fontSize: 11, padding: "3px 8px 3px 22px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card,#fff)", color: "var(--text)", width: 150, outline: "none" }} />
        </div>
        {availClubs.length > 2 && (
          <select value={filter.club} onChange={e => setFilter({ ...filter, club: e.target.value })}
            style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `1px solid ${filter.club ? "var(--accent)" : "var(--border)"}`, background: "var(--bg-card,#fff)", color: "var(--text)", cursor: "pointer" }}>
            <option value="">Todos os clubes</option>
            {availClubs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(filter.name || filter.club) && (
          <button onClick={() => setFilter({ name: "", escs: [], tees: [], club: "" })}
            style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text-muted)", cursor: "pointer" }}>
            ✕ limpar
          </button>
        )}
      </div>

      <div className="bjgt-chart-scroll">
        <table className={"sc-lb" + (showSC ? " sc-lb-with-sc" : "")} data-sc-table="1">
          <thead>
            {/* Linha S.I. */}
            {showSC && hasSI && (
              <tr className="lb-si-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={4}>S.I.</td>
                <td className="lb-topar" /><td className="lb-gross">{si.reduce((a, b) => a + b, 0) || ""}</td>
                {si.slice(0, 9).map((v, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>)}
                <td className="lb-halftot">{si.slice(0,9).reduce((a,b)=>a+b,0) || ""}</td>
                {!is9 && si.slice(9, 18).map((v, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>)}
                {!is9 && <td className="lb-halftot">{si.slice(9).reduce((a,b)=>a+b,0) || ""}</td>}
                {Array.from({ length: postCols }, (_, i) => <td key={i} />)}
              </tr>
            )}
            {/* Linha PAR */}
            {showSC && (
              <tr className="lb-par-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={4}>PAR</td>
                <td className="lb-topar" /><td className="lb-gross">{parTot}</td>
                {par.slice(0, 9).map((v, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v}</td>)}
                <td className="lb-halftot">{parF9}</td>
                {!is9 && par.slice(9, 18).map((v, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v}</td>)}
                {!is9 && <td className="lb-halftot">{parB9}</td>}
                {Array.from({ length: postCols }, (_, i) => <td key={i} />)}
              </tr>
            )}
            {/* Headers — ± Tot e buracos clicáveis (melhor ronda de cada jogador) */}
            <tr>
              <th className="lb-pos sticky-col-0">#</th>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-name sticky-col-1">Jogador</SortableHdr>
              <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-club">Clube</SortableHdr>
              <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-hcp">HCP</SortableHdr>
              <th className="lb-tee" style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>Rnd</th>
              <SortableHdr k="topar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-topar">±</SortableHdr>
              <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-gross">Tot</SortableHdr>
              {showSC && (<>
                {Array.from({ length: 9 }, (_, h) => (
                  <SortableHdr key={h} k={`h${h}`} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={"lb-hole" + (h === 0 ? " lb-hole-first" : "")} style={{ fontSize: 10 }}>
                    {h + 1}
                  </SortableHdr>
                ))}
                <th className="lb-halftot">{is9 ? "Tot" : "Out"}</th>
                {!is9 && Array.from({ length: 9 }, (_, h) => (
                  <SortableHdr key={h + 9} k={`h${h + 9}`} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={"lb-hole" + (h === 0 ? " lb-hole-first" : "")} style={{ fontSize: 10 }}>
                    {h + 10}
                  </SortableHdr>
                ))}
                {!is9 && <th className="lb-halftot">In</th>}
              </>)}
              <th className="lb-sd">SD</th>
              <th className="lb-bird">🐦</th>
              <th className="lb-par-stat">Par</th>
              <th className="lb-bog">■</th>
            </tr>
          </thead>
          <tbody>
            {groupMode
              /* ── MODO AGRUPADO: R1+R2 do mesmo jogador juntos ── */
              ? gDisplayed.map((row, playerIdx) => {
                  const prevPos = playerIdx > 0 ? gDisplayed[playerIdx - 1].pos : undefined;
                    const showPos = row.pos !== prevPos || row.isWD;
                    const medal   = row.pos != null && row.pos <= 3 ? medals[row.pos - 1] : null;
                    const posStr  = row.isWD ? "WD" : row.pos != null ? (medal ?? String(row.pos)) : "–";
                    const playerBg = playerIdx % 2 === 0 ? undefined : "var(--bg-muted)";
                    const isFirst  = playerIdx === 0;
                    return (
                      <React.Fragment key={row.key}>
                        {row.rds.map((rd, ri) => {
                          if (rd == null) return null;
                          const firstRi = row.rds.findIndex(r => r != null);
                          const isFirstRd = ri === firstRi;
                          const rdBg = isFirstRd ? playerBg
                            : playerBg ? "color-mix(in srgb,var(--bg-muted) 60%,transparent)"
                            : "var(--bg-muted-alt,rgba(0,0,0,.02))";
                          const bTop = isFirstRd && !isFirst ? "2px solid var(--border)" : undefined;
                          return (
                            <tr key={ri} style={{ background: rdBg, borderTop: bTop }}>
                              <td className="lb-pos sticky-col-0" style={{ background: rdBg, borderTop: bTop }}>
                                {isFirstRd ? (showPos ? posStr : "") : ""}
                              </td>
                              <td className="lb-name sticky-col-1" style={{ background: rdBg, fontWeight: isFirstRd ? 600 : 400, borderTop: bTop }}>
                                {isFirstRd
                                  ? (row.fed
                                      ? <PlayerLink fed={row.fed} name={abreviarNome(row.name)} />
                                      : abreviarNome(row.name))
                                  : <span className="muted fs-10" style={{ paddingLeft: 8 }}>↳</span>}
                              </td>
                              <td className="lb-club" style={{ borderTop: bTop, color: isFirstRd ? undefined : "var(--text-muted)", fontSize: isFirstRd ? undefined : 11 }}>{row.club || "–"}</td>
                              <td className="lb-hcp" style={{ borderTop: bTop, color: isFirstRd ? undefined : "var(--text-muted)" }}>{row.hcp != null ? row.hcp.toFixed(1) : "–"}</td>
                              <td className="lb-tee" style={{ fontWeight:600, fontSize:10, color:"var(--text-muted)", borderTop: bTop }}>{`R${ri+1}`}</td>
                              <td className="lb-topar" style={{ color: rd.toPar<0?"var(--color-good)":rd.toPar>0?"var(--color-danger)":"var(--text)", borderTop: bTop }}>{fmtToPar(rd.toPar)}</td>
                              <td className="lb-gross" style={{ borderTop: bTop }}>{rd.gross}</td>
                              {showSC && <ScoreCells scores={rd.scores} pars={par} />}
                              <td className="lb-sd" style={{ borderTop: bTop }}>{rd.sd!=null?<SDPill sd={rd.sd} source={null} hcp={row.hcp}/>:<span className="muted">–</span>}</td>
                              <td className="lb-bird" style={{ borderTop: bTop }}>{rd.birds||""}</td>
                              <td className="lb-par-stat" style={{ borderTop: bTop }}>{rd.pars||""}</td>
                              <td className="lb-bog" style={{ borderTop: bTop }}>{rd.bogs||""}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
              /* ── MODO INDEPENDENTE: uma linha por ronda, ordenável ── */
              : displayed.map((row, idx) => {
                  const prevPos = idx > 0 ? displayed[idx - 1].pos : undefined;
                  const showPos = row.pos !== prevPos || row.isWD;
                  const medal   = row.pos != null && row.pos <= 3 ? medals[row.pos - 1] : null;
                  const posStr  = row.isWD ? "WD" : row.pos != null ? (medal ?? String(row.pos)) : "–";
                  const bg      = idx % 2 === 0 ? undefined : "var(--bg-muted)";
                  const bTop    = idx > 0 ? "1px solid var(--border-light)" : undefined;
                  const rd      = row.rd;
                  return (
                    <tr key={row.key} style={{ background: bg, borderTop: bTop }}>
                      <td className="lb-pos sticky-col-0" style={{ background: bg }}>{showPos ? posStr : ""}</td>
                      <td className="lb-name sticky-col-1" style={{ background: bg, fontWeight: 600 }}>
                        {row.fed ? <PlayerLink fed={row.fed} name={abreviarNome(row.name)} /> : abreviarNome(row.name)}
                      </td>
                      <td className="lb-club">{row.club || "–"}</td>
                      <td className="lb-hcp">{row.hcp != null ? row.hcp.toFixed(1) : "–"}</td>
                      <td className="lb-tee" style={{ fontWeight:600, fontSize:10, color:"var(--text-muted)" }}>{row.rdLabel}</td>
                      <td className="lb-topar" style={{ color: rd.toPar<0?"var(--color-good)":rd.toPar>0?"var(--color-danger)":"var(--text)" }}>{fmtToPar(rd.toPar)}</td>
                      <td className="lb-gross">{rd.gross}</td>
                      {showSC && <ScoreCells scores={rd.scores} pars={par} />}
                      <td className="lb-sd">{rd.sd!=null?<SDPill sd={rd.sd} source={null} hcp={row.hcp}/>:<span className="muted">–</span>}</td>
                      <td className="lb-bird">{rd.birds||""}</td>
                      <td className="lb-par-stat">{rd.pars||""}</td>
                      <td className="lb-bog">{rd.bogs||""}</td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}


export function TournamentDetail({ tournament, escLookup, playersDB }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB }) {
  const isMulti = (tournament.rounds || 1) > 1 && tournament.players.some(p => (p.roundScores?.length ?? 0) > 1);
  const nRounds = tournament.rounds || 1;

  // Expanded list: R1, R2, ..., Resumo
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

  // Tab labels: R1 · R2 · R3 · Resumo · 📋 Scorecards
  const COMBINED_TAB = "📋 Scorecards";
  const tabs = useMemo(() => {
    if (!isMulti) return ["Scorecard"];
    return [...expanded.map((t: any) => t._roundLabel || "?"), COMBINED_TAB];
  }, [isMulti, expanded]);

  const [tab, setTab] = useState(0);
  // Reset tab when tournament changes
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) {
    setLastTcode(tournament.tcode);
    setTab(0);
  }

  const curT       = isMulti ? expanded[Math.min(tab, expanded.length - 1)] : tournament;
  const isAcc      = isMulti && !!(curT as any)?._isTotal;
  const isCombined = isMulti && tabs[tab] === COMBINED_TAB;

  // Info about tournament
  const refPlayer = tournament.players[0];
  const nholes = refPlayer?.nholes || refPlayer?.par?.length || refPlayer?.roundScores?.[0]?.pars?.length || 18;
  const parTotal = refPlayer?.parTotal || refPlayer?.par?.reduce((a, b) => a + b, 0) || refPlayer?.roundScores?.[0]?.pars.reduce((a, b) => a + b, 0) || 0;

  const tabStyle = (i: number): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: tab === i ? 700 : 500,
    color: tab === i ? "var(--text)" : "var(--text-muted)",
    background: tab === i ? "var(--bg-card,#fff)" : "transparent",
    border: "none",
    borderBottom: tab === i ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all .15s",
  });

  return (
    <div>
      {/* Cabeçalho */}
      <div className="detail-header">
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {tournament.ccode && (
              <span title="tclub" style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                background: "var(--bg-hover)", color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.ccode}
              </span>
            )}
            {tournament.tcode && (
              <span title="tcode" style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                background: "var(--accent)", color: "#fff",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.tcode}
              </span>
            )}
            {(tournament as any)._isSynthetic
              ? ((tournament as any)._subRounds as Tournament[]).map((sr, i) => (
                  sr.ccode && sr.tcode
                    ? <a key={sr.tcode}
                        href={`https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${sr.ccode}&tcode=${sr.tcode}`}
                        target="_blank" rel="noopener noreferrer"
                        title={`Abre a classificação do Dia ${i + 1} na Federação — abre primeiro a página FPG Torneios (tcode ${sr.tcode})`}
                        style={{
                          fontSize: 10, fontWeight: 600,
                          color: "var(--accent)",
                          border: "1px solid var(--accent)",
                          borderRadius: 4, padding: "1px 6px",
                          textDecoration: "none", whiteSpace: "nowrap", lineHeight: 1.6,
                        }}
                      >
                        Dia {i + 1} ↗
                      </a>
                    : null
                ))
              : tournament.ccode && tournament.tcode && (
                  <a
                    href={`https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${tournament.ccode}&tcode=${tournament.tcode}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Abre a classificação na Federação — abre primeiro a página FPG Torneios"
                    style={{
                      fontSize: 10, fontWeight: 600,
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      borderRadius: 4, padding: "1px 6px",
                      textDecoration: "none", whiteSpace: "nowrap", lineHeight: 1.6,
                    }}
                  >
                    Link Federação ↗
                  </a>
                )
            }
          </div>
        </div>
        <div className="detail-sub">
          {tournament.campo && <span className="muted">📍 {tournament.campo}</span>}
          <span className="muted" style={{ marginLeft: 8 }}>{fmtDate(tournament.date)}</span>
          <span className="chip" style={{ marginLeft: 8 }}>
            {tournament.playerCount} jog · {nRounds}R · {nholes}h · Par {parTotal}
          </span>

        </div>
        <LinksBar links={tournament.links} escalao={tournament.escalao} />
      </div>

      {/* Tabs */}
      {isMulti && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 12, gap: 2, overflowX: "auto" }}>
          {tabs.map((label: string, i: number) => (
            <button key={i} style={tabStyle(i)} onClick={() => setTab(i)}>{label}</button>
          ))}
        </div>
      )}

      {/* Conteúdo */}
      {isCombined
        ? <AllRoundsScorecardLB tournament={tournament} escLookup={escLookup} playersDB={playersDB} />
        : isAcc
          ? <AccumulatedLB tournament={curT} nRounds={nRounds} escLookup={escLookup} playersDB={playersDB} />
          : <ScorecardLB tournament={curT} escLookup={escLookup} playersDB={playersDB} />
      }
    </div>
  );
}

/* ─────────────────────────────────────────────
   RANKING PJA
   Tabela simples de ranking: # · Jogador · Esc · Clube · Voltas · Pts
   Filtros: escalão + pesquisa nome
   Pontos: par=25, −1 por pancada acima, +1 abaixo (mín 0); GF×1.5
   Top 14 voltas por ano contam para o total.
   ───────────────────────────────────────────── */

function pjaPts(toPar: number, gf: boolean): number {
  return Math.max(0, 25 - toPar) * (gf ? 1.5 : 1);
}
function fmtPts(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1);
}
function isGFTournament(t: Tournament): boolean {
  return /dunas/i.test(t.name) || /grande\s*final/i.test(t.name);
}

interface PJARound {
  roundKey: string;
  label: string;
  date: string;
}
interface PJATournCol {
  tournKey: string;
  name: string;
  date: string;
  campo: string;
  isGF: boolean;
  rounds: PJARound[];
  colSpan: number;
}
interface PJARoundResult {
  toPar: number;
  pts: number;
  inTop14: boolean;
}
interface PJAPRow {
  key: string;
  name: string;
  fedCode?: string;
  club: string;
  escalao: string;
  sex: string;
  hcp: number | null;
  results: Map<string, PJARoundResult>;
  allRounds: { roundKey: string; pts: number }[];
  total: number;
  voltas: number;
  eligible: boolean;
}

function PJARankingView({
  pjaList, playersDB, loading,
}: {
  pjaList: Tournament[];
  playersDB: PlayersDB;
  loading: boolean;
}) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const t of pjaList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [pjaList]);

  const [activeYear, setActiveYear] = useState<string>("");
  const year = activeYear || years[0] || "";

  const { sortKey, sortDir, toggleSort: handleSort, resetSort: resetYearSort } = useSort<string>("total", "desc");
  const [filterEsc, setFilterEsc] = useState<string[]>([]);
  const [filterName, setFilterName] = useState("");


  function toggleEsc(e: string) {
    setFilterEsc(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const yearTournaments: Tournament[] = useMemo(() =>
    pjaList
      .filter(t => (t.date || "").startsWith(year))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
  , [pjaList, year]);

  const tournCols: PJATournCol[] = useMemo(() => {
    const cols: PJATournCol[] = [];
    for (const t of yearTournaments) {
      const isSynth = !!(t as any)._isSynthetic;
      const subRounds: Tournament[] = (t as any)._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      if (isSynth && subRounds.length > 1) {
        const rounds: PJARound[] = subRounds.map((sr, i) => ({
          roundKey: tournKey + "_r" + (i + 1),
          label: "R" + (i + 1),
          date: sr.date || t.date,
        }));
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds, colSpan: rounds.length * 2 });
      } else {
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds: [{ roundKey: tournKey + "_r1", label: "", date: t.date || "" }], colSpan: 2 });
      }
    }
    return cols;
  }, [yearTournaments]);

  const allRows: PJAPRow[] = useMemo(() => {
    const map = new Map<string, PJAPRow>();

    for (const t of yearTournaments) {
      const isSynth = !!(t as any)._isSynthetic;
      const subRounds: Tournament[] = (t as any)._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      for (const p of t.players) {
        const playerKey = p.fedCode || ("name:" + p.name.toLowerCase().trim());

        if (!map.has(playerKey)) {
          const db = p.fedCode ? playersDB[p.fedCode] : null;
          const clubRaw = db?.club;
          const club = clubRaw
            ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
            : (p.club || "");
          map.set(playerKey, {
            key: playerKey, name: p.name, fedCode: p.fedCode,
            club, escalao: db?.escalao || (p as any).escalao || "",
            sex: db?.sex || "", hcp: p.hcpExact ?? null,
            results: new Map(), allRounds: [], total: 0, voltas: 0, eligible: false,
          });
        }
        const row = map.get(playerKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;

        if (isSynth && subRounds.length > 1 && p.roundScores && p.roundScores.length > 0) {
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0);
            if (!parR || !rs.gross) return;
            const tp = rs.gross - parR;
            const pts = pjaPts(tp, isGF);
            const roundKey = tournKey + "_r" + (i + 1);
            row.results.set(roundKey, { toPar: tp, pts, inTop14: false });
            row.allRounds.push({ roundKey, pts });
          });
        } else {
          const tp = typeof p.toPar === "string" ? parseInt(p.toPar) : p.toPar as number;
          const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal as number;
          if (tp == null || isNaN(tp) || gross == null || isNaN(gross) || gross >= 900) continue;
          const pts = pjaPts(tp, isGF);
          const roundKey = tournKey + "_r1";
          row.results.set(roundKey, { toPar: tp, pts, inTop14: false });
          row.allRounds.push({ roundKey, pts });
        }
      }
    }

    for (const row of map.values()) {
      const sorted = [...row.allRounds].sort((a, b) => b.pts - a.pts);
      const top14Keys = new Set(sorted.slice(0, 14).map(r => r.roundKey));
      for (const [rk, res] of row.results.entries()) {
        res.inTop14 = top14Keys.has(rk);
      }
      row.total = sorted.slice(0, 14).reduce((s, r) => s + r.pts, 0);
      row.voltas = row.allRounds.length;
      row.eligible = row.voltas >= 14;
    }

    return [...map.values()].filter(r => r.voltas > 0);
  }, [yearTournaments, playersDB]);

  const availEscs = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.escalao) s.add(r.escalao);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const sortedRows = useMemo(() => {
    let rows = allRows;
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    const INF = 99999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name")    return mult * a.name.localeCompare(b.name, "pt");
      if (sortKey === "club")    return mult * a.club.localeCompare(b.club, "pt");
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao, "pt");
      if (sortKey === "voltas")  return mult * (a.voltas - b.voltas);
      if (sortKey.startsWith("toPar_")) {
        const rk = sortKey.slice(6);
        return mult * ((a.results.get(rk)?.toPar ?? INF) - (b.results.get(rk)?.toPar ?? INF));
      }
      if (sortKey.startsWith("pts_")) {
        const rk = sortKey.slice(4);
        return mult * ((a.results.get(rk)?.pts ?? -1) - (b.results.get(rk)?.pts ?? -1));
      }
      return mult * (a.total - b.total);
    });
  }, [allRows, filterEsc, filterName, sortKey, sortDir]);



  if (loading && pjaList.length === 0) return <LoadingState size="sm" />;
  if (!year) return <div className="muted fs-11" style={{ padding: 24 }}>Sem torneios PJA.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 10px", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Ranking PJA</span>
        <div style={{ display: "flex", gap: 6 }}>
          {years.map(yr => (
            <button key={yr}
              className={"tourn-tab tourn-tab-sm" + (yr === year ? " active" : "")}
              onClick={() => { setActiveYear(yr); setFilterEsc([]); setFilterName(""); resetYearSort(); }}
              style={yr === year ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
              {yr}
            </button>
          ))}
        </div>
        <span className="muted fs-11" style={{ marginLeft: 4 }}>Par=25pts · top 14 rondas · GF×1,5</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
          <input type="text" placeholder="Nome ou clube…" value={filterName}
            onChange={e => setFilterName(e.target.value)}
            style={{ fontSize: 11, padding: "3px 8px 3px 22px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card,#fff)", color: "var(--text)", width: 150, outline: "none" }} />
        </div>
        {availEscs.length > 1 && <span style={{ color: "var(--border)" }}>|</span>}
        {availEscs.map(e => {
          const k = e.toLowerCase().replace(/[\s-]/g, "");
          const s = ESC_STYLE[k];
          return <FilterChip key={e} active={filterEsc.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>{e}</FilterChip>;
        })}
        {(filterEsc.length > 0 || filterName) && <>
          <span className="muted fs-10">{sortedRows.length} de {allRows.length}</span>
          <FilterChip active={false} onClick={() => { setFilterEsc([]); setFilterName(""); }}>✕ limpar</FilterChip>
        </>}
        <span className="chip" style={{ marginLeft: "auto" }}>{allRows.length} jogadores · {tournCols.length} torneios</span>
      </div>

      {sortedRows.length === 0
        ? <EmptyState size="sm" message={`Sem dados para ${year}.`} />
        : (
          <CrossSeasonTable
            identityHeaders={<>
              <CSortTh k="rank"    s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">#</CSortTh>
              <CSortTh k="name"    s={sortKey} d={sortDir} on={handleSort} className="cs-name sticky-col-1">Jogador</CSortTh>
              <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">Esc.</CSortTh>
              <CSortTh k="club"    s={sortKey} d={sortDir} on={handleSort} className="cs-club cs-id-end">Clube</CSortTh>
            </>}
            groups={tournCols.map(tc => ({
              key: tc.tournKey,
              headerTh: (
                <th key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" style={{ lineHeight: 1.3 }}>
                  <div className="fw-800" style={{ fontSize: 12 }}>
                    {tc.name}
                    {tc.isGF && <span className="badge-gf">★ GF×1.5</span>}
                  </div>
                  <div className="c-muted-fs10-fw5">
                    {fmtDate(tc.date)}{tc.campo ? " · " + tc.campo : ""}{tc.rounds.length > 1 ? ` · ${tc.rounds.length}R` : ""}
                  </div>
                </th>
              ),
              subHeaderThs: (
                <>
                  {tc.rounds.map(r => (
                    <React.Fragment key={r.roundKey}>
                      <CSortTh k={"toPar_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-grp">
                        {r.label ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--color-good-dark)" }}>{r.label}</span> : "±Par"}
                      </CSortTh>
                      <CSortTh k={"pts_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>Pts</CSortTh>
                    </React.Fragment>
                  ))}
                </>
              ),
            }))}
            summaryGroupTh={<th className="cs-grp u-fw8-fs12" colSpan={2}>Ranking</th>}
            summarySubHeaders={<>
              <CSortTh k="voltas" s={sortKey} d={sortDir} on={handleSort} className="cs-s-games cs-grp">Voltas</CSortTh>
              <CSortTh k="total"  s={sortKey} d={sortDir} on={handleSort} className="cs-s-pts cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 800 }}>Total</CSortTh>
            </>}
          >
            {sortedRows.map((row, idx) => {
              const escCls = row.escalao ? "p p-sm p-" + row.escalao.toLowerCase().replace(/[\s-]/g, "") : "";
              return (
                <tr key={row.key} className={isManuel(row) ? "row-manuel" : undefined}>
                  <td className="cs-pos sticky-col-0">{idx + 1}</td>
                  <td className="cs-name sticky-col-1">
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} />
                    {row.sex === "F" && <SexBadge sex="F" className="ml-4" />}
                  </td>
                  <td className="cs-esc">
                    {row.escalao ? <span className={escCls + " fs-9"}>{row.escalao}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="cs-club cs-id-end">{row.club || "–"}</td>

                  {tournCols.map(tc => {
                    const hasAny = tc.rounds.some(r => row.results.has(r.roundKey));
                    if (!hasAny) return <td key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" />;
                    return (
                      <React.Fragment key={tc.tournKey}>
                        {tc.rounds.map(r => {
                          const res = row.results.get(r.roundKey);
                          if (!res) return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" />
                              <td className="cs-t-gross cs-col" />
                            </React.Fragment>
                          );
                          const tpStr = fmtTP(res.toPar);
                          const tpCol = tpColor(res.toPar);
                          return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" style={{ color: tpCol }}>{tpStr}</td>
                              <td className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)" }}>{fmtPts(res.pts)}</td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="cs-s-games cs-grp">
                    {row.voltas}
                    {!row.eligible && <span title="< 14 rondas — não elegível para GF" className="badge-warn-sm ml-3">⚠</span>}
                  </td>
                  <td className="cs-s-pts cs-col" style={{ fontWeight: 800, color: "var(--color-warn-dark)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtPts(row.total)}
                  </td>
                </tr>
              );
            })}
          </CrossSeasonTable>
        )
      }
    </div>
  );
}


/* ─────────────────────────────────────────────
   CLUBES GRUPOS VIEW
   Grelha de cards por equipa com scores cruzados com o torneio.
   Mostra por ronda o gross de cada jogador e o total de equipa
   calculado como soma dos melhores CLUBES_BEST_N scores.
   ───────────────────────────────────────────── */

/** Gross de um jogador para uma dada ronda, com cap por buraco aplicado */
/** Abrevia nomes muito longos: mantém primeiro nome + iniciais do meio + último apelido */
function abreviarNome(nome: string, maxLen = 25): string {
  if (!nome || nome.length <= maxLen) return nome;
  const parts = nome.trim().split(/\s+/);
  if (parts.length <= 2) return nome; // só 2 partes, não abrevia
  const primeiro = parts[0];
  const ultimo = parts[parts.length - 1];
  const meios = parts.slice(1, -1).map(p => p[0] + ".").join(" ");
  const abrev = primeiro + " " + meios + " " + ultimo;
  return abrev.length < nome.length ? abrev : nome;
}


function grossForRound(p: Player, rd: number): number | null {
  const rs = p.roundScores?.find(r => r.round === rd);
  if (rs) {
    // WD: gross >= 999 (marcador de desistência da federação)
    if (rs.gross >= 999) return null;
    // aplicar cap por buraco se tivermos scores individuais
    if (rs.scores?.length) {
      // WD: scorecard completamente vazio (todos zeros) = desistência sem scores
      if (rs.scores.every(s => s === 0)) return null;
      return rs.scores.reduce((sum, s) => sum + Math.min(s, MAX_HOLE_SCORE), 0);
    }
    return rs.gross;
  }
  // fallback: só para torneios de 1 ronda sem roundScores explícitos
  // Em multi-ronda, grossTotal é a soma de todas as rondas — não deve aparecer como R1
  if (rd === 1 && p.grossTotal != null && (!p.roundScores || p.roundScores.length === 0)) {
    const g = typeof p.grossTotal === "number" ? p.grossTotal : parseInt(String(p.grossTotal));
    return isNaN(g) ? null : g;
  }
  return null;
}

/** Melhor N de uma lista de números (sem nulos) */
function bestN(scores: number[], n: number): number {
  if (!scores.length) return 0;
  return [...scores].sort((a, b) => a - b).slice(0, n).reduce((s, v) => s + v, 0);
}

// Cores para clubes com 2+ equipas — atribuídas por ordem alfabética do clube
// Cores de séries de dados — mapeiam para C.charts[8..] de colors.ts
import { C as _C } from "../utils/colors";
const MULTI_ACCENTS = [_C.chartRust, _C.chartPurple, _C.chartCyan, _C.chartRose, _C.chartLime, _C.chartBlue];
// Cor neutra para clubes com apenas 1 equipa — verde escuro
const SINGLE_COLOR = "var(--color-good-dark)";

type SortCol = "grupo" | "total" | number; // number = ronda (1-based)

function ClubesGruposView({
  grupos, tournament,
}: {
  grupos: GrupoEntry[];
  tournament: Tournament | null;
  escKey: "sub14" | "sub18";
}) {
  const { sortKey: sortCol, sortDir, toggleSort: toggleSortCol } = useSort<SortCol>("total");
  // ordenação dos jogadores dentro de cada card
  const [playerSort, setPlayerSort] = useState<"nome" | "hcp" | number>("nome");
  const [playerSortDir, setPlayerSortDir] = useState<"asc" | "desc">("asc");


  function togglePlayerSort(col: "nome" | "hcp" | number) {
    if (playerSort === col) setPlayerSortDir(d => d === "asc" ? "desc" : "asc");
    else { setPlayerSort(col); setPlayerSortDir(col === "nome" ? "asc" : "asc"); }
  }

  /** BPB acumulado de todas as rondas jogadas */
  function calcAllBPB(p: Player) {
    let bir = 0, par = 0, bog = 0, hasData = false;
    for (const rs of p.roundScores || []) {
      const b = calcBPB(p, rs.round);
      if (b) { bir += b.bir; par += b.par; bog += b.bog; hasData = true; }
    }
    return hasData ? { bir, par, bog } : null;
  }
  const byFed = useMemo(() => {
    const m = new Map<string, Player>();
    if (!tournament) return m;
    for (const p of tournament.players) if (p.fedCode) m.set(p.fedCode, p);
    return m;
  }, [tournament]);

  const nRounds      = tournament?.rounds ?? 1;
  const playedRounds = tournament
    ? Math.max(0, ...tournament.players.map(p => p.roundScores?.length ?? 0))
    : 0;
  const rdCols = Array.from({ length: playedRounds }, (_, i) => i + 1);
  const viewRd: number | null = typeof sortCol === "number" ? sortCol as number : null;
  const showGroupBPB = sortCol === "grupo" && rdCols.length > 1;
  // Grupo: sem colunas de ronda (só BPB acumulado)
  // R1/R2/R3: só essa ronda
  // Total: todas as rondas
  const viewCols = showGroupBPB ? [] : viewRd != null ? rdCols.filter(rd => rd === viewRd) : rdCols;

  /** Birdie / Par / Bogey+ para um jogador numa ronda específica */
  function calcBPB(p: Player, rd: number) {
    const rs = p.roundScores?.find(r => r.round === rd);
    if (!rs?.scores?.length || !rs?.pars?.length) return null;
    let bir = 0, par = 0, bog = 0;
    rs.scores.forEach((s, h) => {
      const diff = Math.min(s, MAX_HOLE_SCORE) - (rs.pars[h] || 0);
      if (diff <= -1) bir++; else if (diff === 0) par++; else bog++;
    });
    return { bir, par, bog };
  }

  const parTotal = useMemo(() =>
    tournament?.players[0]?.parTotal
    || tournament?.players[0]?.par?.reduce((a, b) => a + b, 0)
    || tournament?.players[0]?.roundScores?.[0]?.pars.reduce((a, b) => a + b, 0)
    || 0,
  [tournament]);

  /* detectar clubes com 2+ equipas e atribuir cor */
  const { clubColorMap, clubCount, clubTeamOrder } = useMemo(() => {
    const counts = new Map<string, number>();
    const order  = new Map<string, string[]>();
    for (const g of grupos) {
      counts.set(g.clube, (counts.get(g.clube) || 0) + 1);
      if (!order.has(g.clube)) order.set(g.clube, []);
      order.get(g.clube)!.push(g.grupo);
    }
    const multiClubs = [...counts.entries()]
      .filter(([, n]) => n > 1).map(([name]) => name).sort((a, b) => a.localeCompare(b, "pt"));
    const colorMap = new Map<string, string>();
    multiClubs.forEach((name, i) => colorMap.set(name, MULTI_ACCENTS[i % MULTI_ACCENTS.length]));
    return { clubColorMap: colorMap, clubCount: counts, clubTeamOrder: order };
  }, [grupos]);

  /* pré-computar dados de cada equipa */
  interface JRow { j: GrupoJogador; p: Player | undefined; rds: (number | null)[]; total: number | null; }
  interface TeamData {
    g: GrupoEntry; color: string; isMulti: boolean; teamIdx: number;
    jRows: JRow[]; rdTeam: (number | null)[]; teamTotal: number | null;
  }

  const teamDataList: TeamData[] = useMemo(() => grupos.map(g => {
    const color   = clubColorMap.get(g.clube) ?? SINGLE_COLOR;
    const isMulti = (clubCount.get(g.clube) ?? 1) > 1;
    const teamIdx = (clubTeamOrder.get(g.clube) ?? []).indexOf(g.grupo);

    const jRows: JRow[] = g.jogadores.map(j => {
      const p   = j.fed ? byFed.get(j.fed) : undefined;
      const rds = rdCols.map(rd => p ? grossForRound(p, rd) : null);
      const played = rds.filter(v => v != null) as number[];
      return { j, p, rds, total: played.length ? played.reduce((s, v) => s + v, 0) : null };
    });

    const rdTeam = rdCols.map((_, ri) => {
      const scores = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
      return scores.length ? bestN(scores, CLUBES_BEST_N) : null;
    });
    const playedTeamRds = rdTeam.filter(v => v != null) as number[];
    const teamTotal = playedTeamRds.length ? playedTeamRds.reduce((s, v) => s + v, 0) : null;

    return { g, color, isMulti, teamIdx, jRows, rdTeam, teamTotal };
  }), [grupos, byFed, rdCols, clubColorMap, clubCount, clubTeamOrder]);

  /* ranking por total (crescente) */
  const rankMap = useMemo(() => {
    const withT = [...teamDataList]
      .filter(td => td.teamTotal != null)
      .sort((a, b) => a.teamTotal! - b.teamTotal!);
    const m = new Map<string, number>();
    let pos = 1;
    withT.forEach((td, i) => {
      if (i > 0 && td.teamTotal !== withT[i - 1].teamTotal) pos = i + 1;
      m.set(td.g.grupo, pos);
    });
    return m;
  }, [teamDataList]);

  /* ordenação */
  const sorted = useMemo(() => [...teamDataList].sort((a, b) => {
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    let av: number | string, bv: number | string;
    if (sortCol === "grupo")      { av = a.g.grupo;          bv = b.g.grupo; }
    else if (sortCol === "total") { av = a.teamTotal ?? INF;  bv = b.teamTotal ?? INF; }
    else { const ri = (sortCol as number) - 1; av = a.rdTeam[ri] ?? INF; bv = b.rdTeam[ri] ?? INF; }
    if (typeof av === "string")
      return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  }), [teamDataList, sortCol, sortDir]);

  /* estilos base */
  const tdC: React.CSSProperties = { padding: "5px 6px", fontSize: 12, textAlign: "center", borderBottom: "1px solid var(--border)" };
  const tdL: React.CSSProperties = { ...tdC, textAlign: "left" };
  const thC: React.CSSProperties = { ...tdC, fontWeight: 700, fontSize: 11, color: "var(--text-muted)", background: "var(--bg-muted)", textTransform: "uppercase", letterSpacing: "0.04em" };

  function fmtHcp(h: number | string) { return typeof h === "string" ? h : h % 1 === 0 ? String(h) : h.toFixed(1); }

  function SortBtn({ label, col }: { label: string; col: SortCol }) {
    const active = sortCol === col;
    return (
      <button onClick={() => toggleSortCol(col)} style={{
        fontSize: 11, fontWeight: active ? 700 : 500, padding: "3px 9px", borderRadius: 4,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent)" : "var(--bg-hover)",
        color: active ? "#fff" : "var(--text-muted)", cursor: "pointer",
      }}>{label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</button>
    );
  }

  const multiEntries = [...clubCount.entries()]
    .filter(([, n]) => n > 1)
    .sort(([a], [b]) => a.localeCompare(b, "pt"));

  return (
    <div style={{ padding: "12px 16px 24px" }}>

      {/* Barra de ordenação */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Ordenar:</span>
        <SortBtn label="Grupo" col="grupo" />
        {rdCols.map(rd => <SortBtn key={rd} label={`R${rd}`} col={rd} />)}
        <SortBtn label="Total" col="total" />
        <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
          Melhores {CLUBES_BEST_N} de 4 · Máximo {MAX_HOLE_SCORE} pancadas por buraco
          {nRounds > 1 && (
            <span style={{ marginLeft: 8, fontWeight: 600,
              color: playedRounds >= nRounds ? "var(--color-good)" : "var(--color-warn)" }}>
              · R{playedRounds}/{nRounds}
            </span>
          )}
        </span>
      </div>

      {/* Legenda clubes com 2 equipas */}
      {multiEntries.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {multiEntries.map(([clube]) => {
            const color = clubColorMap.get(clube)!;
            const teams = (clubTeamOrder.get(clube) ?? []).sort().join(" + ");
            return (
              <span key={clube} style={{
                fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5,
                border: `1px solid ${color}`, borderRadius: 4, padding: "2px 8px",
                background: `${color}12`,
              }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0, display: "inline-block" }} />
                <strong style={{ color }}>{teams}</strong>
                <span style={{ color: "var(--text-muted)" }}>— {clube}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Grelha */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
        {sorted.map(({ g, color, isMulti, teamIdx, jRows, rdTeam, teamTotal }) => {
          const pos   = rankMap.get(g.grupo);
          const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null;
          const teamPar = parTotal > 0 && playedRounds > 0 ? parTotal * CLUBES_BEST_N * playedRounds : 0;
          const teamTP  = teamTotal != null && teamPar > 0 ? teamTotal - teamPar : null;

          return (
            <div key={g.grupo} style={{
              background: "var(--bg-card,#fff)",
              border: `1px solid ${isMulti ? color + "80" : "var(--border)"}`,
              borderRadius: 8, overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            }}>
              {/* Header do card */}
              <div style={{ background: color, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                {/* Letra do grupo em caixa */}
                <div style={{
                  width: 34, height: 34, flexShrink: 0,
                  background: "rgba(255,255,255,0.18)", borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 900, lineHeight: 1,
                }}>
                  {g.grupo}
                </div>

                {/* Nome do clube */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.clube}
                  </div>
                  {isMulti && (
                    <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.8, marginTop: 1 }}>equipa {teamIdx + 1}</div>
                  )}
                </div>

                {/* Posição + total ou score da ronda seleccionada */}
                {pos != null && (viewRd != null ? rdTeam[viewRd - 1] != null : teamTotal != null) && (() => {
                  const dispScore = viewRd != null ? rdTeam[viewRd - 1]! : teamTotal!;
                  const dispTP = viewRd != null
                    ? (parTotal > 0 ? dispScore - parTotal * CLUBES_BEST_N : null)
                    : teamTP;
                  return (
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 10, opacity: 0.85, lineHeight: 1, marginBottom: 2 }}>
                        {viewRd != null ? `R${viewRd}` : (medal ?? `#${pos}`)}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{dispScore}</div>
                      {dispTP != null && (
                        <div style={{ fontSize: 10, opacity: 0.85, lineHeight: 1, marginTop: 1 }}>
                          ({dispTP >= 0 ? `+${dispTP}` : dispTP})
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Tabela jogadores */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {(() => {
                      function PHdr({ label, col, style }: { label: string; col: "nome" | "hcp" | number; style?: React.CSSProperties }) {
                        const active = playerSort === col;
                        return (
                          <th onClick={() => togglePlayerSort(col)} style={{
                            ...thC, cursor: "pointer", userSelect: "none",
                            color: active ? color : "var(--text-muted)",
                            ...style,
                          }}>
                            {label}{active ? (playerSortDir === "asc" ? "▲" : "▼") : ""}
                          </th>
                        );
                      }
                      return (<>
                        <PHdr label="Jogador" col="nome" style={{ textAlign: "left", paddingLeft: 10 }} />
                        <PHdr label="HCP" col="hcp" />
                        {viewCols.map(rd => <PHdr key={rd} label={`R${rd}`} col={rd} />)}
                        {viewRd != null ? (<>
                          <th style={{ ...thC, color: "var(--color-good)", borderLeft: "1px solid var(--border)" }}>🐦</th>
                          <th style={{ ...thC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>○</th>
                          <th style={{ ...thC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>■</th>
                        </>) : showGroupBPB ? (<>
                          <th style={{ ...thC, color: "var(--color-good)", borderLeft: "1px solid var(--border)" }}>🐦</th>
                          <th style={{ ...thC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>○</th>
                          <th style={{ ...thC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>■</th>
                        </>) : (
                          viewCols.length > 1 && <th style={thC}>Tot.</th>
                        )}
                      </>);
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sortedJRows = [...jRows].sort((a, b) => {
                      let av: number | string, bv: number | string;
                      if (playerSort === "nome") { av = a.j.nome; bv = b.j.nome; }
                      else if (playerSort === "hcp") {
                        av = typeof a.j.hcp === "string" ? parseFloat(a.j.hcp.replace("+","")) * (a.j.hcp.startsWith("+") ? -1 : 1) : (a.j.hcp as number);
                        bv = typeof b.j.hcp === "string" ? parseFloat(b.j.hcp.replace("+","")) * (b.j.hcp.startsWith("+") ? -1 : 1) : (b.j.hcp as number);
                      } else {
                        const ri = (playerSort as number) - 1;
                        av = a.rds[ri] ?? (playerSortDir === "asc" ? Infinity : -Infinity);
                        bv = b.rds[ri] ?? (playerSortDir === "asc" ? Infinity : -Infinity);
                      }
                      if (typeof av === "string") return playerSortDir === "asc" ? av.localeCompare(bv as string, "pt") : (bv as string).localeCompare(av, "pt");
                      return playerSortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
                    });

                    return sortedJRows.map(({ j, p, rds, total }, ji) => {
                      const counts = viewCols.map((rd) => {
                        const ri = rdCols.indexOf(rd);
                        const allS = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
                        const threshold = [...allS].sort((a, b) => a - b)[CLUBES_BEST_N - 1];
                        const mine = rds[ri];
                        return mine != null && threshold != null && mine <= threshold;
                      });
                      // Fade apenas se o jogador não tem NENHUM score (suplente que não jogou)
                      const hasAnyScore = rds.some(v => v != null);
                      const bpb = viewRd != null && p ? calcBPB(p, viewRd) : null;
                      const allBpb = showGroupBPB && p ? calcAllBPB(p) : null;
                      return (
                        <tr key={j.fed ?? j.nome}>
                          <td style={{ ...tdL, paddingLeft: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            color: hasAnyScore ? "var(--text)" : "var(--text-muted)",
                            fontWeight: hasAnyScore ? 500 : 400,
                            opacity: hasAnyScore ? 1 : 0.55 }}>
                            {p && j.fed
                              ? <a href={`/jogadores/${j.fed}`}
                                  target="_blank" rel="noopener noreferrer"
                                  style={{ color: "inherit", textDecoration: "none" }}
                                  onClick={e => e.stopPropagation()}>{abreviarNome(j.nome)}</a>
                              : abreviarNome(j.nome)}
                          </td>
                          <td style={{ ...tdC, color: "var(--text-muted)", opacity: hasAnyScore ? 1 : 0.55 }}>
                            {p?.hcpExact != null ? fmtHcp(p.hcpExact) : j.hcp > 0 ? fmtHcp(j.hcp) : "–"}
                          </td>
                          {viewCols.map((rd, ci) => {
                            const ri = rdCols.indexOf(rd);
                            const score = rds[ri];
                            const c = counts[ci];
                            const tp = score != null && parTotal > 0 ? score - parTotal : null;
                            return (
                              <td key={ri} style={{
                                ...tdC,
                                fontWeight: c ? 700 : 400,
                                color: c ? color : score != null ? "var(--text)" : "var(--text-muted)",
                                padding: "4px 4px",
                                verticalAlign: "middle",
                              }}>
                                {score != null ? (
                                  <div style={{ lineHeight: 1.2 }}>
                                    <div style={{ fontWeight: c ? 700 : 400 }}>{score}</div>
                                    {tp != null && (
                                      <div style={{
                                        fontSize: 9, lineHeight: 1,
                                        color: c ? color : "var(--text-muted)",
                                        opacity: c ? 0.85 : 0.65,
                                      }}>
                                        ({tp >= 0 ? `+${tp}` : tp})
                                      </div>
                                    )}
                                  </div>
                                ) : <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>–</span>}
                              </td>
                            );
                          })}
                          {viewRd != null ? (<>
                            <td style={{ ...tdC, color: "var(--color-good)", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>{bpb ? (bpb.bir || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>{bpb ? (bpb.par || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>{bpb ? (bpb.bog || "") : "–"}</td>
                          </>) : showGroupBPB ? (<>
                            <td style={{ ...tdC, color: "var(--color-good)", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>{allBpb ? (allBpb.bir || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>{allBpb ? (allBpb.par || "") : "–"}</td>
                            <td style={{ ...tdC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>{allBpb ? (allBpb.bog || "") : "–"}</td>
                          </>) : (
                            viewCols.length > 1 && (
                              <td style={{ ...tdC, fontWeight: hasAnyScore ? 500 : 400, color: hasAnyScore ? "var(--text)" : "var(--text-muted)", opacity: hasAnyScore ? 1 : 0.55 }}>
                                {total != null ? total : "–"}
                              </td>
                            )
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                {/* Rodapé: apenas total dos 4 jogadores */}
                <tfoot>
                  <tr style={{ background: color }}>
                    <td colSpan={2} style={{ ...tdL, paddingLeft: 10, fontWeight: 600, fontSize: 10, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Total {g.jogadores.length} Jogadores
                    </td>
                    {viewCols.map((rd) => {
                      const ri = rdCols.indexOf(rd);
                      const allS = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
                      const tot = allS.length ? allS.reduce((s, v) => s + v, 0) : null;
                      return <td key={ri} style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none" }}>{tot != null ? tot : "–"}</td>;
                    })}
                    {viewRd != null ? (() => {
                      // BPB totais do grupo para esta ronda
                      let tb = 0, tp2 = 0, tbo = 0, hasData = false;
                      jRows.forEach(({ p }) => {
                        if (!p) return;
                        const b = calcBPB(p, viewRd);
                        if (b) { tb += b.bir; tp2 += b.par; tbo += b.bog; hasData = true; }
                      });
                      return (<>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.3)", opacity: 0.9 }}>{hasData ? (tb || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tp2 || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tbo || "") : "–"}</td>
                      </>);
                    })() : showGroupBPB ? (() => {
                      // BPB acumulado de todas as rondas
                      let tb = 0, tp2 = 0, tbo = 0, hasData = false;
                      jRows.forEach(({ p }) => {
                        if (!p) return;
                        const b = calcAllBPB(p);
                        if (b) { tb += b.bir; tp2 += b.par; tbo += b.bog; hasData = true; }
                      });
                      return (<>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.3)", opacity: 0.9 }}>{hasData ? (tb || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tp2 || "") : "–"}</td>
                        <td style={{ ...tdC, color: "#fff", fontWeight: 400, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{hasData ? (tbo || "") : "–"}</td>
                      </>);
                    })() : (
                      viewCols.length > 1 && (() => {
                        const allRdTotals = viewCols.map(rd => {
                          const ri = rdCols.indexOf(rd);
                          const allS = jRows.map(r => r.rds[ri]).filter(v => v != null) as number[];
                          return allS.length ? allS.reduce((s, v) => s + v, 0) : null;
                        });
                        const grand = allRdTotals.every(v => v != null) ? (allRdTotals as number[]).reduce((s, v) => s + v, 0) : null;
                        return <td style={{ ...tdC, color: "#fff", fontWeight: 700, borderBottom: "none" }}>{grand != null ? grand : "–"}</td>;
                      })()
                    )}
                  </tr>
                </tfoot>
              </table>

              {/* Capitão e Suplente */}
              {(g.capitao || g.suplente) && (
                <div style={{
                  display: "flex", gap: 0,
                  borderTop: "1px solid var(--border)",
                  fontSize: 11,
                }}>
                  {g.capitao && (
                    <div style={{
                      flex: 1, padding: "5px 10px",
                      display: "flex", alignItems: "center", gap: 5,
                      borderRight: g.suplente ? "1px solid var(--border)" : "none",
                      color: "var(--text-2)",
                    }}>
                      <span style={{ fontSize: 13 }}>🎖️</span>
                      <span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", lineHeight: 1 }}>Capitão</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{g.capitao}</span>
                      </span>
                    </div>
                  )}
                  {g.suplente && (
                    <div style={{
                      flex: 1, padding: "5px 10px",
                      display: "flex", alignItems: "center", gap: 5,
                      color: "var(--text-2)",
                    }}>
                      <span style={{ fontSize: 13 }}>🔄</span>
                      <span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", lineHeight: 1 }}>Suplente</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{g.suplente}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* ─────────────────────────────────────────────
   MAIN CONTENT
   ───────────────────────────────────────────── */


/* ═══════════════════════════════════════════════════════
   NACIONAIS — Tipos, helpers e componentes de inscrições
   (movido de NacionaisPage.tsx)
   ═══════════════════════════════════════════════════════ */

/* ── Tipos ── */
interface InscricaoJogador {
  fed: string | null; nome: string; clube: string;
  hcp: number | null; vac: number | null; dataInscricao: string | null;
}
interface TorneioData {
  tcode: string; nome: string; escalao: string; sex: string;
  totalInscritos: number; jogadores: InscricaoJogador[];
  lastFetched: string | null; lastChanged: string | null; fpgUrl?: string;
  fromCache?: boolean; fetchError?: string;
  diff?: { added: string[]; removed: string[] } | null;
  _status: "idle" | "loading" | "ok" | "error";
}
type BdPlayer = { name: string; escalao: string; sex: string; fed: string; clube: string; dob: string };
interface PlayerStats {
  avgSD5: number | null; lastSD: number | null; currentHcp: number | null;
  hcpTrend: string | null; hcpDelta3m: number | null;
  roundsLast3m: number | null; formAlert: string | null;
}
type StatsDb = Record<string, PlayerStats>;

function usePlayerStats() {
  const [stats, setStats] = useState<StatsDb>({});
  useEffect(() => {
    fetch("/player-stats.json").then(r => r.ok ? r.json() : {}).then(setStats).catch(() => {});
  }, []);
  return stats;
}

const TORNEIOS_CONFIG = [
  { tcode: "10935", nome: "Sub-18 H", escalao: "Sub-18", sex: "M" },
  { tcode: "10936", nome: "Sub-18 S", escalao: "Sub-18", sex: "F" },
  { tcode: "10937", nome: "Sub-16 H", escalao: "Sub-16", sex: "M" },
  { tcode: "10938", nome: "Sub-16 S", escalao: "Sub-16", sex: "F" },
  { tcode: "10939", nome: "Sub-14 H", escalao: "Sub-14", sex: "M" },
  { tcode: "10940", nome: "Sub-14 S", escalao: "Sub-14", sex: "F" },
  { tcode: "10941", nome: "Sub-12 H", escalao: "Sub-12", sex: "M" },
  { tcode: "10942", nome: "Sub-12 S", escalao: "Sub-12", sex: "F" },
  { tcode: "10943", nome: "Sub-10 H", escalao: "Sub-10", sex: "M" },
  { tcode: "10944", nome: "Sub-10 S", escalao: "Sub-10", sex: "F" },
];

function escShort(esc: string) { return esc.replace("Sub-", "S"); }
function escCls(esc: string) {
  return esc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
// norm importada de ../utils/format
function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}
function fmtDataInscricao(s: string | null) {
  if (!s) return "–";
  return s.replace(/^\d{4}\//, "").replace("/", "/");
}
function anoEscalao(dob: string, escalao: string): "1A" | "2A" | null {
  if (!dob) return null;
  const anoNasc = parseInt(dob.slice(0, 4));
  const idadeMax = parseInt(escalao.replace("Sub-", ""));
  if (isNaN(anoNasc) || isNaN(idadeMax)) return null;
  return anoNasc === (new Date().getFullYear() - idadeMax) ? "2A" : "1A";
}
function AnoEscalaoPill({ dob, escalao }: { dob: string; escalao: string }) {
  if (!dob) return null;
  const anoNasc = dob.slice(0, 4);
  const isUltimo = anoEscalao(dob, escalao) === "2A";
  return (
    <span title={isUltimo ? `${anoNasc} — 2o ano` : `${anoNasc} — 1o ano`}
      style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, lineHeight: 1.4,
        background: isUltimo ? "var(--color-bad)" : "var(--color-good)", color: "#fff", flexShrink: 0 }}>
      {anoNasc}
    </span>
  );
}
function TrendBadge({ trend, delta }: { trend: string | null; delta: number | null }) {
  if (!trend || trend === "stable") return <span className="muted" style={{ fontSize: 11 }}>–</span>;
  const up = trend === "up";
  return (
    <span style={{ color: up ? "var(--color-good)" : "var(--color-bad)", fontWeight: 700, fontSize: 13 }}
      title={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} (3m)` : ""}>
      {up ? "↓" : "↑"}
    </span>
  );
}


/* ═══════════════════════════════════════════════════════
   PAINEL DE RESUMO — sempre visível
   ═══════════════════════════════════════════════════════ */
function PainelResumo({ torneios, nossosByFed }: {
  torneios: TorneioData[];
  nossosByFed: Map<string, BdPlayer>;
}) {
  const [clubeSel, setClubesSel] = React.useState<string | null>(null);

  const carregados = torneios.filter(t => t.totalInscritos > 0 || t._status === "ok");
  const totalGeral = carregados.reduce((s, t) => s + t.totalInscritos, 0);
  if (totalGeral === 0) return null;

  const escaloes = ["Sub-18", "Sub-16", "Sub-14", "Sub-12", "Sub-10"];
  const byEsc: Record<string, { M: number; F: number }> =
    Object.fromEntries(escaloes.map(e => [e, { M: 0, F: 0 }]));
  for (const t of carregados) {
    if (byEsc[t.escalao]) byEsc[t.escalao][t.sex as "M" | "F"] = t.totalInscritos;
  }

  const anoTotals: Record<"1A" | "2A", number> = { "1A": 0, "2A": 0 };
  let anoBase = 0;
  for (const t of carregados) {
    for (const j of t.jogadores) {
      const p = j.fed ? nossosByFed.get(j.fed) : undefined;
      if (!p?.dob) continue;
      const a = anoEscalao(p.dob, t.escalao);
      if (a) { anoTotals[a]++; anoBase++; }
    }
  }

  const clubeMap = new Map<string, {
    n: number;
    jogadores: { fed: string; nome: string; escalao: string; sex: string }[];
  }>();
  for (const t of carregados) {
    for (const j of t.jogadores) {
      const p = j.fed ? nossosByFed.get(j.fed) : undefined;
      const clube = (p?.clube || j.clube || "").trim();
      if (!clube) continue;
      if (!clubeMap.has(clube)) clubeMap.set(clube, { n: 0, jogadores: [] });
      const entry = clubeMap.get(clube)!;
      entry.n++;
      entry.jogadores.push({
        fed: j.fed ?? "",
        nome: p?.name ?? j.nome,
        escalao: p?.escalao ?? t.escalao,
        sex: p?.sex ?? t.sex,
      });
    }
  }
  const clubes = [...clubeMap.entries()].sort((a, b) => b[1].n - a[1].n);
  const selData = clubeSel ? clubeMap.get(clubeSel) : null;

  return (
    <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
      {/* Linha 1: total + escalões + anos */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: clubes.length > 0 ? 5 : 0 }}>
        <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{totalGeral} inscritos</span>
        <span className="muted" style={{ fontSize: 11 }}>·</span>
        {escaloes.flatMap((e, ei) => {
          const g = byEsc[e];
          if (g.M === 0 && g.F === 0) return [];
          const items: React.ReactNode[] = [];
          if (g.M > 0) items.push(
            <span key={`${e}M`} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <span className="muted" style={{ fontSize: 10 }}>{e.replace("Sub-", "S")}</span>
              <span className="sex-badge sex-M" style={{ minWidth: 20, textAlign: "center" }}>{g.M}</span>
            </span>
          );
          if (g.F > 0) items.push(
            <span key={`${e}F`} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              {g.M === 0 && <span className="muted" style={{ fontSize: 10 }}>{e.replace("Sub-", "S")}</span>}
              <span className="sex-badge sex-F" style={{ minWidth: 20, textAlign: "center" }}>{g.F}</span>
            </span>
          );
          if (ei < escaloes.length - 1) items.push(
            <span key={`sep${ei}`} className="muted" style={{ fontSize: 10 }}>·</span>
          );
          return items;
        })}
        {anoBase > 0 && (
          <>
            <span className="muted" style={{ fontSize: 11 }}>·</span>
            <span style={{ fontSize: 11, flexShrink: 0, display: "inline-flex", gap: 5, alignItems: "center" }}>
              <span className="muted">1º ano</span>
              <span style={{ fontWeight: 700, color: "var(--color-good)" }}>{anoTotals["1A"]}</span>
              <span className="muted">2º ano</span>
              <span style={{ fontWeight: 700, color: "var(--color-bad)" }}>{anoTotals["2A"]}</span>
            </span>
          </>
        )}
      </div>

      {/* Linha 2: clubes */}
      {clubes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 10, flexShrink: 0 }}>Clubes:</span>
          {clubes.map(([c, d]) => (
            <button key={c}
              onClick={() => setClubesSel(prev => prev === c ? null : c)}
              style={{
                cursor: "pointer", fontSize: 11, padding: "1px 8px", borderRadius: 10,
                fontWeight: 600, border: "1px solid var(--border)",
                background: clubeSel === c ? "var(--accent)" : "var(--bg-muted)",
                color: clubeSel === c ? "#fff" : "var(--text-1)",
              }}>
              {c} {d.n}
            </button>
          ))}
        </div>
      )}

      {/* Jogadores do clube seleccionado */}
      {selData && clubeSel && (
        <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg-page)",
          border: "1px solid var(--border)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 5, color: "var(--text-1)" }}>
            {clubeSel} — {selData.n} inscrito{selData.n !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {selData.jogadores.map((jj, i) => (
              <span key={i} style={{
                fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 10,
                background: "var(--bg-card)", border: "1px solid var(--border)",
              }}>
                <SexBadge sex={jj.sex} size="sm" />
                <span className={`p p-sm p-${escCls(jj.escalao)}`} style={{ fontSize: 9 }}>{escShort(jj.escalao)}</span>
                <span>{jj.nome || jj.fed}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card de escalao — usa o mesmo estilo das pills de escalao da app ── */
function TorneioCard({ t, active, onClick }: {
  t: TorneioData; active: boolean; onClick: () => void;
}) {
  return (
    <button
      className={"tourn-tab tourn-tab-sm" + (active ? " active" : "")}
      onClick={onClick}
      title={`Campeonato Nacional de Jovens ${t.nome}`}
      style={active ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
    >
      {escShort(t.escalao)}
      <SexBadge sex={t.sex} size="sm" />
      {t._status === "loading" && <span style={{ opacity: 0.7 }}>⟳</span>}
      {t._status === "error"   && <span style={{ color: "var(--color-bad)", fontWeight: 700 }}>!</span>}
      {t._status === "ok" && t.totalInscritos > 0 && (
        <span style={{
          background: active ? "rgba(255,255,255,0.25)" : "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10, padding: "0px 5px",
          fontSize: 11, fontWeight: 700,
          color: active ? "inherit" : "var(--text-1)",
          marginLeft: 2,
        }}>{t.totalInscritos}</span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   VISTA INSCRIÇÕES — tabela completa
   ═══════════════════════════════════════════════════════ */
type InscSortKey = "pos" | "nome" | "hcp" | "vac" | "sd5" | "data" | "trend" | "rondas";

function InscricoesView({ t, nossosFedSet, nossosByFed, statsDb }: {
  t: TorneioData; nossosFedSet: Set<string>; nossosByFed: Map<string, BdPlayer>; statsDb: StatsDb;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<InscInscSortKey>("pos");
  const [sortAsc, setSortAsc] = useState(true);
  const term = norm(search);

  const nossosCount = useMemo(
    () => t.jogadores.filter(j => j.fed && nossosFedSet.has(j.fed)).length,
    [t.jogadores, nossosFedSet]
  );
  const lista = useMemo(() => {
    let base = t.jogadores;
    if (term) base = base.filter(j => norm(j.nome).includes(term) || (j.fed || "").includes(term));
    if (sortKey === "pos") return sortAsc ? base : [...base].reverse();
    return [...base].sort((a, b) => {
      const sa = a.fed ? statsDb[a.fed] : null;
      const sb = b.fed ? statsDb[b.fed] : null;
      let v = 0;
      if      (sortKey === "nome")   { const pa = a.fed ? nossosByFed.get(a.fed) : null; const pb = b.fed ? nossosByFed.get(b.fed) : null; v = (pa?.name ?? a.nome).localeCompare(pb?.name ?? b.nome, "pt"); }
      else if (sortKey === "hcp")    { v = (a.hcp ?? 999) - (b.hcp ?? 999); }
      else if (sortKey === "vac")    { v = (a.vac ?? 999) - (b.vac ?? 999); }
      else if (sortKey === "sd5")    { v = (sa?.avgSD5 ?? 999) - (sb?.avgSD5 ?? 999); }
      else if (sortKey === "data")   { v = (a.dataInscricao ?? "").localeCompare(b.dataInscricao ?? ""); }
      else if (sortKey === "rondas") { v = (sb?.roundsLast3m ?? -1) - (sa?.roundsLast3m ?? -1); }
      else if (sortKey === "trend")  { const ord = { improving: 0, stable: 1, worsening: 2 }; v = (ord[sa?.hcpTrend as keyof typeof ord] ?? 3) - (ord[sb?.hcpTrend as keyof typeof ord] ?? 3); }
      return sortAsc ? v : -v;
    });
  }, [t.jogadores, term, sortKey, sortAsc, nossosByFed, statsDb]);

  function toggleSort(key: InscSortKey) {
    if (sortKey === key) setSortAsc(v => !v); else { setSortKey(key); setSortAsc(true); }
  }
  function SortTh({ label, col, cls }: { label: string; col: InscSortKey; cls?: string }) {
    const active = sortKey === col;
    return <th className={cls} onClick={() => toggleSortCol(col)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {label}{active ? (sortAsc ? " ↑" : " ↓") : " ↕"}
    </th>;
  }

  if (t._status !== "ok" && t._status !== "loading") return null;
  if (t._status === "loading") return <LoadingState size="sm" />;

  return (
    <div>
      <div className="detail-toolbar">
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nome, num fed..." style={{ maxWidth: 200 }} />
        <span className="muted" style={{ fontSize: 12 }}>{nossosCount} da BD · {t.totalInscritos} total</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {t.diff && (t.diff.added.length > 0 || t.diff.removed.length > 0) && (
            <span style={{ fontSize: 10, background: "var(--color-warn)", color: "#fff", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}
              title={[t.diff.added.length ? `+${t.diff.added.join(", ")}` : "", t.diff.removed.length ? `-${t.diff.removed.join(", ")}` : ""].filter(Boolean).join(" · ")}>
              {t.diff.added.length > 0 && `+${t.diff.added.length} novo${t.diff.added.length > 1 ? "s" : ""}`}
              {t.diff.added.length > 0 && t.diff.removed.length > 0 && " · "}
              {t.diff.removed.length > 0 && `-${t.diff.removed.length} removido${t.diff.removed.length > 1 ? "s" : ""}`}
            </span>
          )}
          {t.lastFetched && (
            <span className="muted" style={{ fontSize: 10 }}
              title={t.fromCache ? `Cache de ${t.lastFetched}${t.lastChanged && t.lastChanged !== t.lastFetched ? " · alterado " + t.lastChanged : ""}` : "Dados frescos"}>
              {t.fromCache ? "💾" : "🔄"} {fmtTime(t.lastFetched)}
            </span>
          )}
          {t.fetchError && <span className="muted" style={{ fontSize: 10, color: "var(--color-warn)" }} title={t.fetchError}>⚠️ cache</span>}
          {t.fpgUrl && <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--chart-2)" }}>datagolf ↗</a>}
        </div>
      </div>
      <div className="table-wrap">
        <table className="dtable-lg">
          <colgroup>
            <col style={{ width: "4%" }} /><col style={{ width: "17%" }} />
            <col style={{ width: "7%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "4%" }} /><col style={{ width: "4%" }} />
            <col style={{ width: "9%" }} /><col style={{ width: "40%" }} />
          </colgroup>
          <thead>
            <tr>
              <SortTh label="#"     col="pos"    />
              <SortTh label="Nome"  col="nome"   />
              <th className="r">Fed</th>
              <SortTh label="HCP"   col="hcp"    cls="r" />
              <SortTh label="VAC"   col="vac"    cls="r" />
              <SortTh label="SD5"   col="sd5"    cls="r" />
              <SortTh label="T"     col="trend"  cls="r" />
              <SortTh label="R3m"   col="rondas" cls="r" />
              <SortTh label="Insc"  col="data"   cls="r" />
              <th>Na BD</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((j, i) => {
              const p  = j.fed ? nossosByFed.get(j.fed) : undefined;
              const st = j.fed ? statsDb[j.fed] : null;
              const sd5 = st?.avgSD5 ?? null;
              return (
                <tr key={`${j.fed ?? j.nome}-${i}`} className={p ? "row-match" : ""}>
                  <td className="muted r" style={{ fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}>
                    {p ? <PlayerLink fed={j.fed} name={p.name} query="?view=by_date" style={{ fontWeight: 700 }} /> : <span className="muted">{j.nome || "–"}</span>}
                  </td>
                  <td className="r">
                    {j.fed ? <PlayerLink fed={j.fed} name={j.fed} query="?view=by_date" style={{ color: "var(--chart-2)", fontSize: 12 }} /> : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 12 }}>{j.hcp != null ? j.hcp.toFixed(1) : "–"}</td>
                  <td className="r" style={{ fontSize: 12, fontWeight: 600 }}>{j.vac != null ? j.vac.toFixed(1) : "–"}</td>
                  <td className="r" style={{ fontSize: 11 }}>
                    {sd5 != null ? <span className={`p p-${sdClassByHcp(sd5, st?.currentHcp ?? j.hcp ?? null)}`} style={{ fontSize: 11 }}>{sd5.toFixed(1)}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="r"><TrendBadge trend={st?.hcpTrend ?? null} delta={st?.hcpDelta3m ?? null} /></td>
                  <td className="r" style={{ fontSize: 12 }}>
                    {st?.roundsLast3m != null
                      ? <span style={{ fontWeight: st.roundsLast3m >= 4 ? 600 : 400, color: st.roundsLast3m === 0 ? "var(--color-bad)" : "inherit" }}>{st.roundsLast3m}</span>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 11 }}>{fmtDataInscricao(j.dataInscricao)}</td>
                  <td>
                    {p ? <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <SexBadge sex={p.sex} size="sm" />
                        <span className={`p p-sm p-${escCls(p.escalao)}`} style={{ fontSize: 10 }}>{escShort(p.escalao)}</span>
                        {p.dob && <AnoEscalaoPill dob={p.dob} escalao={t.escalao} />}
                        {p.clube && <span className="muted" style={{ fontSize: 11 }}>{p.clube}</span>}
                      </span>
                    : <span className="muted" style={{ fontSize: 11 }}>{j.fed ? "Nao na BD" : "–"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <EmptyState size="sm" message="Sem resultados" />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VISTA ANÁLISE — Análise profissional para o Campeonato Nacional
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Termos de Competição ── */
const TERMOS_COMPETICAO = `CAMPEONATO NACIONAL DE JOVENS Sub 18, 16, 14, 12 e 10
PGA Aroeira II · 01 a 03 de Maio de 2026

1. PARTICIPAÇÃO
Escalões Sub-18, Sub-16, Sub-14, Sub-12 e Sub-10, filiados na FPG.
Handicap máximo: Sub-18 → 9,0 · Sub-16 → 12,0 · Sub-14 → 16,0 · Sub-12 → 36,0 · Sub-10 → 50,0
Para Sub-14, 12 e 10: obrigatória participação prévia em ≥3 torneios Drive Challenge / Drive Tour nos últimos 12 meses, ou C.N. de Jovens.

2. INSCRIÇÕES
Via formulário on-line em www.fpg.pt até às 12h de 27 de Abril (segunda-feira).
Critério de aceitação: Índice de handicap WHS™ e VAC-F registado no servidor da FPG no momento do encerramento.

3. LIMITE DE INSCRIÇÕES
30 jogadores por escalão (15 Rapazes + 15 Raparigas).
Se excedido o limite: exclusão pelos VAC-F mais altos.
Vagas não preenchidas transferidas primeiro para o mesmo escalão, depois para o field geral, sempre por ordem de VAC-F, sem consideração de género.

4. VALOR DA INSCRIÇÃO
Gratuita (0€). Cancelamentos após publicação do draw: 10€.

5. MODALIDADE
Sub-18, 16 e 14: 54 buracos por pancadas (18/dia). Sem cut.
Sub-12: 54 buracos por pancadas (18/dia), máximo 10 pancadas/buraco. Sem cut.
Sub-10: 27 buracos por pancadas (9/dia), máximo 10 pancadas/buraco. Sem cut.

6. REGRAS
Regras R&A · Regras Locais de Aplicação Permanente da FPG · Regras Locais da Comissão Técnica.

7. MARCAS DE SAÍDA
Sub-18 e Sub-16 → Brancas e Azuis
Sub-14 → Amarelas e Vermelhas
Sub-12 → Vermelhas
Sub-10 → Verdes

8. EMPATES
Campeão: Sudden Death Play Off.
Vice-Campeão: melhores últimos 36, 18, 9, 6, 3 buracos e melhor último buraco. Persistindo: sorteio.
Restantes lugares: sem desempate.

9. PRÉMIOS
Campeão(ã) Nacional · Vice-Campeão(ã) Nacional
(Títulos de Campeão Nacional apenas para cidadãos nacionais.)

10. CADDIES
Não são permitidos.

11. COMISSÃO TÉCNICA E ÁRBITROS
Designados pela FPG. Dúvidas: campeonatos@fpg.pt`;

/* ═══════════════════════════════════════════════════════
   InscricoesPanel — inscrições do Nacional, integrado no Jovens
   ═══════════════════════════════════════════════════════ */
function InscricoesPanel() {
  const { players } = useAppContext();
  const statsDb = usePlayerStats();
  const inFlight = useRef(new Set<string>());

  const [torneios, setTorneios] = useState<TorneioData[]>(() =>
    TORNEIOS_CONFIG.map(t => ({ ...t, totalInscritos: 0, jogadores: [], lastFetched: null, lastChanged: null, fromCache: undefined, diff: null, _status: "idle" as const }))
  );
  const [activeTcode, setActiveTcode] = useState<string>("10941");

  const nossosByFed = useMemo(() => {
    const m = new Map<string, BdPlayer>();
    const lista = Array.isArray(players) ? players : Object.values(players ?? {});
    for (const p of lista) {
      const fed = String((p as any).nfed ?? (p as any).fed ?? "").trim();
      if (!fed) continue;
      m.set(fed, { name: p.name, escalao: p.escalao, sex: p.sex, fed, clube: (p as any).club?.short ?? "", dob: (p as any).dob ?? "" });
    }
    return m;
  }, [players]);

  const nossosFedSet = useMemo(() => new Set(nossosByFed.keys()), [nossosByFed]);

  const tryStaticCache = useCallback(async (tcode: string): Promise<boolean> => {
    try {
      const r = await fetch("/data/inscricoes_nacionais.json");
      if (!r.ok) return false;
      const all = await r.json() as Record<string, unknown>;
      const entry = all[tcode];
      if (!entry) return false;
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, ...(entry as object), _status: "ok", fromCache: true } : t));
      return true;
    } catch { return false; }
  }, []);

  const fetchTorneio = useCallback(async (tcode: string, forceRefresh = false) => {
    inFlight.current.delete(tcode); inFlight.current.add(tcode);
    setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "loading" } : t));
    try {
      const apiUrl = `/api/inscricoes?tcode=${tcode}${forceRefresh ? "&refresh=1" : ""}`;
      let res: Response;
      try { res = await fetch(apiUrl); }
      catch { if (await tryStaticCache(tcode)) return; throw new Error("API inacessivel"); }
      if (!res.ok) { if (await tryStaticCache(tcode)) return; throw new Error(`HTTP ${res.status}`); }
      const data = await res.json();
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, ...data, _status: "ok" } : t));
    } catch { setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "error" } : t)); }
    finally { inFlight.current.delete(tcode); }
  }, [tryStaticCache]);

  useEffect(() => {
    const t = torneios.find(x => x.tcode === activeTcode);
    if (t && t._status === "idle") fetchTorneio(activeTcode, false);
  }, [activeTcode, torneios, fetchTorneio]);

  const refreshAll = useCallback(() => {
    inFlight.current.clear();
    TORNEIOS_CONFIG.reduce((chain, cfg) =>
      chain.then(() => fetchTorneio(cfg.tcode, true).then(() => new Promise<void>(r => setTimeout(r, 350)))),
      Promise.resolve()
    );
  }, [fetchTorneio]);

  const torneioActivo = torneios.find(t => t.tcode === activeTcode) ?? torneios[0];
  const totalNossosInscritos = useMemo(() => {
    const feds = new Set<string>();
    for (const t of torneios) for (const j of t.jogadores) if (j.fed && nossosFedSet.has(j.fed)) feds.add(j.fed);
    return feds.size;
  }, [torneios, nossosFedSet]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Selector de escalão */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", flexShrink: 0,
        padding: "6px 12px", overflowX: "auto", scrollbarWidth: "none" as const,
        borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)",
      }}>
        {torneios.map(t => (
          <TorneioCard key={t.tcode} t={t} active={activeTcode === t.tcode} onClick={() => setActiveTcode(t.tcode)} />
        ))}
        <div style={{ flex: 1, minWidth: 8 }} />
        {totalNossosInscritos > 0 && <span className="chip" style={{ flexShrink: 0 }}>{totalNossosInscritos} na BD</span>}
        <button className="tourn-tab tourn-tab-sm" onClick={refreshAll}
          style={{ flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
          title="Actualizar inscrições da FPG">↺</button>
      </div>
      <PainelResumo torneios={torneios} nossosByFed={nossosByFed} />
      <div className="course-detail">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0 8px",
          borderBottom: "1px solid var(--border)", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            Campeonato Nacional de Jovens — {torneioActivo.nome}
          </span>
          <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${torneioActivo.tcode}`}
             target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--chart-2)" }}>
            inscrições datagolf ↗
          </a>
          <a href="https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/"
             target="_blank" rel="noopener noreferrer"
             style={{ fontSize: 11, fontWeight: 700, color: "var(--color-good-dark)",
               background: "var(--bg-success-subtle)", border: "1px solid var(--color-good)",
               borderRadius: 6, padding: "2px 8px", textDecoration: "none", whiteSpace: "nowrap" as const }}>
            🏆 página oficial FPG ↗
          </a>
        </div>
        <InscricoesView t={torneioActivo} nossosFedSet={nossosFedSet} nossosByFed={nossosByFed} statsDb={statsDb} />
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   JOVENS — agrupamento por evento (date + ccode)
   ═══════════════════════════════════════════════════════════════ */
interface JovensGroup {
  key: string; date: string; campo: string; name: string;
  year: string; isRegional: boolean; isNacional: boolean; entries: Tournament[];
}

const ESC_ORDER_JOV = ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Sub 24","Sub 25"];

/** Extrai escalão do nome quando t.escalao é null */
function inferEscalao(name: string): string | null {
  const m = name.match(/Sub[\s-]*(\d+)/i);
  return m ? "Sub " + m[1] : null;
}

function buildJovensGroups(tournaments: Tournament[]): JovensGroup[] {
  const escIdx = (esc: string | null | undefined) => {
    const i = ESC_ORDER_JOV.indexOf(esc || "");
    return i >= 0 ? i : 99;
  };
  const getEsc = (t: Tournament) => t.escalao || inferEscalao(t.name || "");

  // Phase 1: agrupar por date+ccode (mesmo dia, mesmo local)
  const phase1 = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    const k = (t.date || "") + "-" + (t.ccode || t.campo || "?");
    if (!phase1.has(k)) phase1.set(k, []);
    phase1.get(k)!.push(t);
  }

  // Phase 2: fundir grupos "Dia 1"/"Dia 2" do mesmo evento multi-dia
  // Chave: ano + ccode + nome sem "Dia X" nem ano de 4 dígitos
  const normDia = (name: string) => name
    .replace(/\s*\bDia\b\s*\d+/gi, "")
    .replace(/\s*\b20\d{2}\b\s*/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();

  const phase2 = new Map<string, Tournament[]>();
  for (const [, entries] of phase1) {
    const t0 = entries[0];
    const year = (t0.date || "").substring(0, 4);
    const norm = normDia(t0.name || "");
    const k2 = year + "|" + (t0.ccode || t0.campo || "?") + "|" + norm;
    if (!phase2.has(k2)) phase2.set(k2, []);
    phase2.get(k2)!.push(...entries);
  }

  return [...phase2.entries()].map(([, entries]) => {
    entries.sort((a, b) => {
      const dCmp = (a.date || "").localeCompare(b.date || "");
      if (dCmp !== 0) return dCmp;
      return escIdx(getEsc(a)) - escIdx(getEsc(b));
    });
    const t0 = entries[0];
    const cleanName = (t0.name || "")
      .replace(/\s*-?\s*(Rapazes?|Raparigas?)\s*$/i, "")
      .replace(/\s*Sub[\s-]*\d+\s*[HMS]?\s*$/i, "")
      .replace(/\s*\bDia\b\s*\d+\s*$/i, "")
      .replace(/[\s\-–]+$/, "").trim();
    const isRegional = /regional/i.test(t0.name || "");
    const isNacional = /nacional/i.test(t0.name || "");
    return {
      key:       t0.date + "-" + (t0.ccode || t0.campo || "?"),
      date:      t0.date,
      campo:     t0.campo,
      name:      cleanName || t0.name,
      year:      (t0 as any)._jovensYear ?? t0.date?.substring(0, 4) ?? "?",
      isRegional,
      isNacional,
      entries:   entries.map(e => e.escalao ? e : { ...e, escalao: inferEscalao(e.name || "") } as Tournament),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function Content() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("A carregar ficheiros...");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
    const md = useMasterDetail();
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12">("torneios");
  const [seriesFilter, setSeriesFilter] = useState<"" | "circuit" | "santo" | "clubes" | "jovens">(""); // filtro de série dentro de Torneios
  const [yearFilter, setYearFilter]    = useState<string | null>(null);
  const [filterManuel, setFilterManuel] = useState(true);
  const [escLookup, setEscLookup] = useState<EscLookup>(new Map());
  const [playersDB, setPlayersDB] = useState<PlayersDB>({});

  // ── Estado Clubes ─────────────────────────────────────────────────────────
  const [clubesTournaments, setClubesTournaments] = useState<Tournament[]>([]);
  const [clubesLoading, setClubesLoading]         = useState(false);
  const [clubesLoaded, setClubesLoaded]           = useState(false);
  const [clubesSelected, setClubesSelected]       = useState<number>(0);
  const [clubesEsc, setClubesEsc]                 = useState<string>("sub14"); // "sub14" | "sub18"
  const [clubesView, setClubesView]               = useState<"individual" | "grupos">("grupos");

  // ── Estado Jovens ─────────────────────────────────────────────────────────
  const [jovensTournaments, setJovensTournaments] = useState<Tournament[]>([]);
  const [jovensLoading, setJovensLoading]         = useState(false);
  const [jovensLoaded, setJovensLoaded]           = useState(false);
  const [jovensGroupKey, setJovensGroupKey]        = useState<string | null>(null);
  const [jovensEscIdx, setJovensEscIdx]            = useState<number>(0);
  const [jovensShowInscricoes, setJovensShowInscricoes] = useState(false);

  const { melhorias } = useAppContext();

  const tcodePills = useMemo<Record<string, TournPill>>(() => {
    const pills: Record<string, TournPill> = {};
    for (const playerData of Object.values(melhorias)) {
      if (typeof playerData !== "object" || !playerData) continue;
      for (const entry of Object.values(playerData as Record<string, any>)) {
        if (typeof entry !== "object" || !entry || Array.isArray(entry) || !entry.pill) continue;
        // Extrair TODOS os tcodes dos links desta entrada (ex: classificacao_d1 + classificacao_d2)
        for (const v of Object.values((entry as any).links || {})) {
          const match = String(v).match(/tcode=(\d+)/);
          if (match) pills[match[1]] = (entry as any).pill as TournPill;
        }
      }
    }
    return pills;
  }, [melhorias]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        // loadPlayers() usa fetchCache — 1 único fetch por sessão mesmo que FPGPage,
        // DrivePage e App.tsx o peçam em simultâneo.
        const [pdb, linksResp] = await Promise.all([
          loadPlayers().catch(() => ({} as PlayersDB)),
          fetch("/data/tournament-links.json").catch(() => null),
        ]);
        if (alive) { setEscLookup(buildEscLookup(pdb)); setPlayersDB(pdb); }
        let externalLinks: Record<string, Record<string, string>> = {};
        if (linksResp?.ok) {
          externalLinks = await linksResp.json().catch(() => ({}));
        }

        const allT: Tournament[] = [];
        const meta: FileMeta[] = [];

        for (let i = 0; i < DATA_MAX; i++) {
          if (!alive) return;
          const url = dataUrl(i);
          let resp: Response;
          try { resp = await fetch(url); } catch { break; }
          if (!resp.ok) break;  // 404 → parar

          let d: DriveData;
          try { d = await resp.json(); }
          catch { break; }  // resposta não é JSON (ex: HTML de erro) → parar
          const normalised = (d.tournaments || []).map(t => {
            const extLinks = externalLinks[String(t.tcode)];
            return {
              ...t,
              _sourceFile: url,
              _sourceIndex: i,
              players: t.players.map(normalizePlayer),
              ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}),
            };
          });
          allT.push(...normalised);
          meta.push({
            file: url, index: i,
            lastUpdated: d.lastUpdated,
            source: d.source,
            count: normalised.length,
          });
          if (alive) {
            setTournaments([...allT]);
            setFileMeta([...meta]);
            setLoadingMsg(`A carregar... ${meta.length} ficheiro(s) · ${allT.length} torneios`);
          }
        }

        if (alive) {
          if (allT.length === 0) {
            setError(`Ficheiro não encontrado: ${dataUrl(0)}`);
          }

          // Carregar os 3 ficheiros de Clubes em paralelo com o loader principal
          const CLUBES_FILES_MAIN = [
            { url: "/data/clubes_sub_14&18_2026.json", year: "2026" },
            { url: "/data/clubes_sub_14&18_2025.json", year: "2025" },
            { url: "/data/clubes_sub_14&18_2024.json", year: "2024" },
          ];
          const resolveEscKeyMain = (escalao: string | null | undefined): string => {
            if (escalao && /14/i.test(escalao)) return "sub14";
            if (escalao && /18/i.test(escalao)) return "sub18";
            return "sub14";
          };
          const clubesResults = await Promise.all(CLUBES_FILES_MAIN.map(async ({ url, year }) => {
            try {
              const r = await fetch(url);
              if (!r.ok) return [];
              const d: DriveData = await r.json();
              return (d.tournaments || []).map(t => ({
                ...t,
                series: "clubes" as const,
                _clubesEsc: resolveEscKeyMain((t as any).escalao),
                _clubesYear: year,
                players: t.players.map(normalizePlayer),
              }));
            } catch { return []; }
          }));
          const clubesFlat = clubesResults.flat();
          // Deduplicar por tcode
          const seen = new Map<string, Tournament>();
          for (const t of clubesFlat) seen.set(String(t.tcode), t as Tournament);
          if (alive) {
            const uniqueClubes = [...seen.values()];
            setClubesTournaments(uniqueClubes);
            setClubesLoaded(true);
            // Adicionar ao allT para aparecerem em Todos
            setTournaments([...allT, ...uniqueClubes]);
          }

          setLoading(false);
        }
      } catch {
        // erro inesperado — não mostrar stack trace técnico
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  // ── Loader Clubes (D1 — só quando activado, para dados parciais de 2026) ────
  useEffect(() => {
    if (!(navMode === "torneios" && (seriesFilter === "clubes" || seriesFilter === "")) || clubesLoaded) return;
    let alive = true;
    setClubesLoading(true);

    // Ficheiros combinados (sub14 + sub18 no mesmo JSON) — escalão lido de t.escalao
    // Ficheiros D1 têm só um escalão (determinado pelo nome)
    const CLUBES_FILES: { url: string; escFallback: string | null; year: string }[] = [
      { url: "/data/clubes_sub_14_D1.json",    escFallback: "sub14", year: "2026" },
      { url: "/data/clubes_sub_18_D1.json",    escFallback: "sub18", year: "2026" },
      { url: "/data/clubes_sub_14&18_2026.json", escFallback: null,  year: "2026" },
      { url: "/data/clubes_sub_14&18_2025.json", escFallback: null,  year: "2025" },
      { url: "/data/clubes_sub_14&18_2024.json", escFallback: null,  year: "2024" },
    ];

    function resolveEscKey(escalao: string | undefined | null, fallback: string | null): string {
      if (escalao && /14/i.test(escalao)) return "sub14";
      if (escalao && /18/i.test(escalao)) return "sub18";
      return fallback ?? "sub14";
    }

    Promise.all(
      CLUBES_FILES.map(async ({ url, escFallback, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const d: DriveData = await r.json();
          return (d.tournaments || []).map(t => ({
            ...t,
            _clubesEsc: resolveEscKey((t as any).escalao, escFallback),
            _clubesYear: year,
            _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
        } catch { return []; }
      })
    ).then(results => {
      if (!alive) return;
      // Deduplicar por tcode — se o ficheiro D1 e o combined 2026 tiverem o mesmo torneio, fica o combined
      const seen = new Map<string, Tournament>();
      for (const t of results.flat()) {
        const key = (t as any).tcode;
        const existing = seen.get(key);
        // Preferir o combined (escFallback null) sobre D1 (escFallback não null)
        if (!existing || (existing as any)._sourceFile?.includes("D1")) {
          seen.set(key, t as Tournament);
        }
      }
      setClubesTournaments([...seen.values()] as Tournament[]);
      setClubesLoaded(true);
      setClubesLoading(false);
    });
    return () => { alive = false; };
  }, [navMode, seriesFilter, clubesLoaded]);

  // ── Loader Jovens (lazy — só quando activado) ─────────────────────────────
  useEffect(() => {
    if (!(navMode === "torneios" && seriesFilter === "jovens") || jovensLoaded) return;
    let alive = true;
    setJovensLoading(true);
    const JOVENS_FILES = [
      { url: "/data/jovens_2026.json", year: "2026" },
      { url: "/data/jovens_2025.json", year: "2025" },
      { url: "/data/jovens_2024.json", year: "2024" },
      { url: "/data/jovens_2023.json", year: "2023" },
      { url: "/data/jovens_2022.json", year: "2022" },
    ];
    Promise.all(
      JOVENS_FILES.map(async ({ url, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const d: DriveData = await r.json();
          return (d.tournaments || []).map(t => ({
            ...t, _jovensYear: year, _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
        } catch { return []; }
      })
    ).then(results => {
      if (!alive) return;
      const seen = new Map<string, Tournament>();
      for (const t of results.flat()) seen.set(t.ccode + "/" + String((t as any).tcode), t as Tournament);
      setJovensTournaments([...seen.values()] as Tournament[]);
      setJovensLoaded(true);
      setJovensLoading(false);
    });
    return () => { alive = false; };
  }, [navMode, seriesFilter, jovensLoaded]);

  // Lista filtrada por escalão dentro de Clubes, agrupada por ano
  const clubesList = useMemo(
    () => clubesTournaments
      .filter(t => !filterManuel || t.players.some(p => isManuel(p)))
      .filter(t => !yearFilter || ((t as any)._clubesYear ?? t.date?.substring(0, 4)) === yearFilter)
      .sort((a, b) => {
        const yCmp = ((b as any)._clubesYear ?? "").localeCompare((a as any)._clubesYear ?? "");
        if (yCmp !== 0) return yCmp;
        return ((a as any)._clubesEsc ?? "").localeCompare((b as any)._clubesEsc ?? "");
      }),
    [clubesTournaments, filterManuel, yearFilter]
  );
  const clubesByYear = useMemo(() => {
    const m: Record<string, Tournament[]> = {};
    for (const t of clubesList) {
      const yr = (t as any)._clubesYear ?? t.date?.substring(0, 4) ?? "?";
      if (!m[yr]) m[yr] = [];
      m[yr].push(t);
    }
    return m;
  }, [clubesList]);
  const clubesYears = useMemo(() => Object.keys(clubesByYear).sort().reverse(), [clubesByYear]);
  const curClubes = clubesList[clubesSelected] ?? null;
  const curClubesYear: string = (curClubes as any)?._clubesYear ?? curClubes?.date?.substring(0, 4) ?? "";

  const jovensGroups = useMemo(() => {
    const filtered = jovensTournaments
      .filter(t => !filterManuel || t.players.some(p => isManuel(p)))
      .filter(t => !yearFilter || ((t as any)._jovensYear ?? t.date?.substring(0, 4)) === yearFilter);
    return buildJovensGroups(filtered);
  }, [jovensTournaments, filterManuel, yearFilter]);

  const jovensByYear = useMemo(() => {
    const m: Record<string, JovensGroup[]> = {};
    for (const g of jovensGroups) {
      if (!m[g.year]) m[g.year] = [];
      m[g.year].push(g);
    }
    return m;
  }, [jovensGroups]);
  const jovensYears = useMemo(() => Object.keys(jovensByYear).sort().reverse(), [jovensByYear]);
  const curJovensGroup = jovensGroups.find(g => g.key === jovensGroupKey) ?? jovensGroups[0] ?? null;
  const curJovens = curJovensGroup?.entries[jovensEscIdx] ?? curJovensGroup?.entries[0] ?? null;

  const displayList = useMemo(() => buildDisplayList(tournaments), [tournaments]);
  const cur = displayList[selected];

  // Anos disponíveis no modo Torneios
  const availYears = useMemo(() => {
    const s = new Set<string>();
    for (const t of displayList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [displayList]);
  const activeYear = yearFilter ?? null;
  const inYear = (t: Tournament) => !activeYear || (t.date || "").startsWith(activeYear);

  // Agrupamento por mês — todos os torneios incluindo Clubes (usados em seriesFilter === "")
  const { groups: monthGroups, groupKeys: monthKeys } = useMemo(() => {
    const g: Record<string, Tournament[]> = {};
    for (const t of displayList) {
      if (!inYear(t)) continue;
      if (filterManuel && !t.players.some(p => isManuel(p))) continue;
      if (seriesFilter === "clubes") continue; // clubes tem sidebar própria
      if (seriesFilter === "jovens") continue; // jovens tem sidebar própria
      const key = t.date ? t.date.substring(0, 7) : "?";
      if (!g[key]) g[key] = [];
      g[key].push(t);
    }
    return { groups: g, groupKeys: Object.keys(g).sort().reverse() };
  }, [displayList, filterManuel, activeYear, seriesFilter]);

  // Lista apenas PJA (para o modo circuito) — exclui explicitamente SSerra
  const pjaList = useMemo(
    () => displayList.filter(t => {
      if (t.ccode === SSERRA_CCODE) return false;  // SSerra tem tab próprio
      if (/PJA/i.test(t.name)) return true;
      const tcodes = t.tcode?.split("+") || [];
      return tcodes.some(tc => TOURN_PILLS[tc] === "PJA");
    }),
    [displayList]
  );

  const pjaByYear = useMemo(() => {
    const byYear: Record<string, Tournament[]> = {};
    for (const t of pjaList) {
      if (!inYear(t)) continue;
      if (filterManuel && !t.players.some(p => isManuel(p))) continue;
      const yr = t.date ? t.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(t);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
  }, [pjaList, activeYear, filterManuel]);

  // ── Santo da Serra ──
  const santoList = useMemo(
    () => displayList.filter(t => t.ccode === SSERRA_CCODE),
    [displayList]
  );
  const santoByYear = useMemo(() => {
    const byYear: Record<string, Tournament[]> = {};
    for (const t of santoList) {
      if (!inYear(t)) continue;
      if (filterManuel && !t.players.some(p => isManuel(p))) continue;
      const yr = t.date ? t.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(t);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
  }, [santoList, activeYear, filterManuel]);

  function renderSidebarItem(t: Tournament) {
    const isClubesItem = (t as any)._clubesEsc !== undefined;
    const idx = isClubesItem ? -1 : displayList.indexOf(t);
    const clubesIdx = isClubesItem ? clubesList.indexOf(t) : -1;
    const isActive = isClubesItem ? clubesSelected === clubesIdx && seriesFilter === "clubes" : selected === idx;
    const handleClick = () => {
      if (isClubesItem) {
        setSeriesFilter("clubes");
        if (clubesIdx >= 0) setClubesSelected(clubesIdx);
      } else {
        setSelected(idx);
      }
      md.onSelect();
    };
    // Determinar pill dinâmico (REGIONAL, NACIONAL, etc.)
    const tcodes = (t.tcode || "").split("+");
    const pillVal = tcodes.map(tc => TOURN_PILLS[tc] || tcodePills?.[tc]).find(Boolean);
    const extraPills = pillVal && pillVal !== "PJA" && pillVal !== "SSERRA"
      ? <span className={`p p-sm p-tourn p-${pillVal.toLowerCase()}`}>{pillVal}</span>
      : null;
    // Número de jogadores
    const nJog = t.playerCount || t.players.filter(p => !isDNS(p)).length;
    const tData: SidebarItemTournament = {
      ...(t as any),
      playerCount: nJog,
      pill: pillVal,
    };
    return (
      <TournSidebarItem
        key={(t as any)._isSynthetic ? "synth_" + t.tcode : (isClubesItem ? "clubes_" : "") + t.tcode + "_" + t.date}
        t={tData}
        isActive={isActive}
        onClick={handleClick}
        extraPills={extraPills}
      />
    );
  }

  return (
    <div className="tourn-layout">

      {/* ── Toolbar mobile-first: scroll horizontal em vez de grid ── */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>

        {/* Linha 1: toda numa linha scrollável */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          {!loading && (<>
            <ToolbarSep />
            {([
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-pja",   label: "📊 Ranking PJA" },
              { key: "ranking-sub12", label: "🏅 Ranking Sub-12" },
            ] as const).map(({ key, label }) => (
              <button key={key}
                className={"tourn-tab tourn-tab-sm" + (navMode === key ? " active" : "")}
                onClick={() => { setNavMode(key); setSeriesFilter(""); setYearFilter(null); }}
                style={navMode === key
                  ? { flexShrink: 0 }
                  : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                {label}
              </button>
            ))}
            {navMode === "torneios" && availYears.length > 1 && (<>
              <ToolbarSep />
              {availYears.map(y => (
                <button key={y}
                  className={"tourn-tab tourn-tab-sm" + (activeYear === y ? " active" : "")}
                  onClick={() => setYearFilter(activeYear === y ? null : y)}
                  style={activeYear === y
                    ? { flexShrink: 0 }
                    : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                  {y}
                </button>
              ))}
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : "")}
                onClick={() => setFilterManuel(v => !v)}
                style={filterManuel
                  ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" }
                  : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)", whiteSpace: "nowrap" }}>
                ★ Manuel
              </button>
            </>)}
            <div style={{ flex: 1, minWidth: 8 }} />
            {/* Contadores à direita */}
            <a href="https://scoring.datagolf.pt/pt/tournaments.aspx" target="_blank" rel="noopener noreferrer"
              style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 8px", lineHeight: 1.6, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>
              FPG Torneios ↗
            </a>
            {loading
              ? <span className="muted fs-11" style={{ fontStyle: "italic", flexShrink: 0 }}>{loadingMsg}</span>
              : <>
                  {navMode === "torneios" && (() => {
                    const count = seriesFilter === "santo"   ? santoByYear.years.reduce((s, y) => s + (santoByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "circuit" ? pjaByYear.years.reduce((s, y) => s + (pjaByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "clubes"  ? clubesList.length
                                : seriesFilter === "jovens"  ? jovensGroups.length
                                : activeYear
                                  ? displayList.filter(t => (t.date || "").startsWith(activeYear)).length
                                  : displayList.length;
                    return <span className="chip" style={{ flexShrink: 0 }}>{count} torneios</span>;
                  })()}
                  {seriesFilter !== "santo" && seriesFilter !== "clubes" && seriesFilter !== "jovens" && navMode === "torneios" && (
                    <span className="chip" style={{ flexShrink: 0, marginLeft: 4, background: "var(--bg-hover)" }}>
                      {fileMeta.length} ficheiro{fileMeta.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </>
            }
          </>)}
        </Toolbar>

        {/* Linha 2: filtros de série */}
        {!loading && navMode === "torneios" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px 6px", overflowX: "auto", flexWrap: "nowrap",
            scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
            borderTop: "1px solid var(--border-light)",
          }}>
            {([
              { key: "",        label: "Todos" },
              { key: "circuit", label: "🏆 PJA Tour" },
              { key: "santo",   label: "⛳ Santo da Serra" },
              { key: "clubes",  label: "🏅 Clubes" },
              { key: "jovens",  label: "🏆 Jovens" },
            ] as const).map(({ key, label }) => {
              const active = seriesFilter === key;
              const st = active
                ? key === "santo"  ? { flexShrink: 0, ...PILL_SSERRA, borderColor: PILL_SSERRA.background as string }
                : key === "clubes" ? { flexShrink: 0, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                : key === "jovens"    ? { flexShrink: 0, background: "var(--chart-2)", borderColor: "var(--chart-2)", color: "#fff" }
                : { flexShrink: 0 }
                : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" };
              return (
                <button key={key}
                  className={"tourn-tab tourn-tab-sm" + (active ? " active" : "")}
                  onClick={() => { setSeriesFilter(key); }}
                  style={st}>
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "16px 20px", color: "var(--danger)", fontWeight: 600, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Master-detail (modos "month" e "circuit") */}
      {navMode === "torneios" && seriesFilter !== "clubes" && seriesFilter !== "jovens" && (
      <div className="master-detail">
        {/* Sidebar */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {loading && displayList.length === 0 && (
            <div className="muted fs-11 u-pad-italic">
              A carregar...
            </div>
          )}

          {seriesFilter === ""
            ? monthKeys.map(gk => (
                <React.Fragment key={gk}>
                  <div className="sidebar-section-title-dark">{monthLabel(gk)}</div>
                  {monthGroups[gk].map(t => renderSidebarItem(t))}
                </React.Fragment>
              ))
            : seriesFilter === "santo"
              ? santoByYear.years.length === 0
                ? <div className="muted fs-11 u-pad-italic">Sem torneios Santo da Serra</div>
                : santoByYear.years.map(yr => {
                    const items = santoByYear.byYear[yr].filter(t =>
                      !filterManuel || t.players.some(p => isManuel(p))
                    );
                    if (items.length === 0) return null;
                    return (
                      <React.Fragment key={yr}>
                        <div className="sidebar-section-title-dark">⛳ Santo da Serra {yr}</div>
                        {items.map(t => renderSidebarItem(t))}
                      </React.Fragment>
                    );
                  })
              : pjaByYear.years.length === 0
                ? <div className="muted fs-11 u-pad-italic">Sem torneios PJA</div>
                : pjaByYear.years.map(yr => (
                    <React.Fragment key={yr}>
                      <div className="sidebar-section-title-dark">🏆 {yr}</div>
                      {pjaByYear.byYear[yr].map(t => renderSidebarItem(t))}
                    </React.Fragment>
                  ))
          }
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {cur
            ? <TournamentDetail tournament={cur} escLookup={escLookup} playersDB={playersDB} />
            : !loading && <div className="center-msg muted">Selecciona um torneio</div>
          }
        </div>
      </div>
      )}

      {/* ── Clubes ─────────────────────────────────────────────────────── */}
      {navMode === "torneios" && seriesFilter === "clubes" && (
        <div className="master-detail">
          {/* Sidebar Clubes */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            {clubesLoading && (
              <div className="muted fs-11 u-pad-italic">A carregar...</div>
            )}
            {clubesLoaded && clubesList.length === 0 && !clubesLoading && (
              <div className="muted fs-11 u-pad-italic">
                Ficheiro não encontrado (ainda)
              </div>
            )}
            {clubesYears.map(yr => (
              <React.Fragment key={yr}>
                <div className="sidebar-section-title-dark">🏅 {yr}</div>
                {clubesByYear[yr].map(t => {
                  const idx = clubesList.indexOf(t);
                  const playedR = Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0));
                  const nR = t.rounds || 1;
                  // Sufixo de progresso: "R2/3" no campo quando torneio incompleto
                  const progressSuffix = nR > 1 && playedR > 0 && playedR < nR
                    ? ` · R${playedR}/${nR}` : "";
                  const tWithProgress = {
                    ...(t as any),
                    playerCount: t.playerCount || t.players.length,
                    campo: (t.campo || "Oporto") + progressSuffix,
                  } as SidebarItemTournament;
                  return (
                    <TournSidebarItem
                      key={t.tcode + "_" + t.date}
                      t={tWithProgress}
                      isActive={clubesSelected === idx}
                      onClick={() => { setClubesSelected(idx); md.onSelect(); }}
                      accentColor={SIDEBAR_ACCENT.clubes}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Detail Clubes */}
          <div className="course-detail">
            {/* Tabs Individual / Grupos */}
            <div style={{
              display: "flex", borderBottom: "1px solid var(--border)",
              background: "var(--bg-card,#fff)", position: "sticky", top: 0, zIndex: 10,
            }}>
              {(["grupos", "individual"] as const).map(v => {
                const label = v === "grupos" ? "🏅 Grupos" : "📋 Individual";
                const active = clubesView === v;
                return (
                  <button key={v} onClick={() => setClubesView(v)} style={{
                    padding: "8px 16px", fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? "var(--text)" : "var(--text-muted)",
                    background: "transparent", border: "none",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    cursor: "pointer", transition: "all .15s",
                  }}>{label}</button>
                );
              })}
            </div>

            {clubesView === "individual"
              ? curClubes
                  ? <TournamentDetail tournament={curClubes} escLookup={escLookup} playersDB={playersDB} />
                  : !clubesLoading && (
                      <div className="center-msg muted">
                        {clubesLoaded ? "Selecciona um torneio" : "A carregar…"}
                      </div>
                    )
              : (() => {
                  const gruposData = curClubesYear ? CLUBES_GRUPOS_BY_YEAR[curClubesYear] : null;
                  if (gruposData) {
                    return <ClubesGruposView
                      grupos={gruposData[(curClubes as any)?._clubesEsc as "sub14" | "sub18"] ?? gruposData[clubesEsc as "sub14" | "sub18"] ?? []}
                      tournament={curClubes}
                      escKey={((curClubes as any)?._clubesEsc ?? clubesEsc) as "sub14" | "sub18"}
                    />;
                  }
                  if (!curClubes && !clubesLoading) {
                    return <div className="center-msg muted">Selecciona um torneio</div>;
                  }
                  return (
                    <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Vista de grupos não disponível para {curClubesYear}</div>
                      <div style={{ fontSize: 12 }}>Os dados de composição de grupos desta edição não estão carregados.<br/>Use o tab <strong>Individual</strong> para ver os resultados.</div>
                    </div>
                  );
                })()
            }
          </div>
        </div>
      )}

      {/* Master-detail Jovens */}
      {navMode === "torneios" && seriesFilter === "jovens" && (
        <div className="master-detail">
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            {jovensLoading && <div className="muted fs-11 u-pad-italic">A carregar...</div>}
            {jovensLoaded && jovensGroups.length === 0 && !jovensLoading && (
              <div className="muted fs-11 u-pad-italic">Ficheiro não encontrado (ainda)</div>
            )}
            {/* Entrada especial: Inscrições */}
            <div
              onClick={() => { setJovensShowInscricoes(true); setJovensGroupKey(null); md.onSelect(); }}
              style={{
                padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-light)",
                background: jovensShowInscricoes ? "var(--bg-success-subtle)" : "var(--bg-card)",
                borderLeft: jovensShowInscricoes ? "3px solid var(--color-good)" : "3px solid transparent",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12, color: jovensShowInscricoes ? "var(--color-good-dark)" : "var(--text)" }}>
                📋 Inscrições 2026
              </div>
              <div className="muted" style={{ fontSize: 11 }}>Campeonatos Nacionais de Jovens</div>
            </div>
            {jovensYears.map(yr => (
              <React.Fragment key={yr}>
                <div className="sidebar-section-title-dark">🏆 {yr}</div>
                {jovensByYear[yr].map(g => {
                  const totalJog = g.entries.reduce((s, e) => s + (e.playerCount || e.players.length), 0);
                  const t0 = g.entries[0];
                  // Mapa ccode → nome de região/organização
                  const REGION_LABEL: Record<string, string> = {
                    "000": "Nacional", "988": "Sul", "987": "Norte",
                    "985": "Tejo", "983": "Açores", "982": "Madeira",
                    "051": "Açores", "007": "Madeira", "910": "Norte",
                    "059": "Palheiro", "005": "Açores",
                  };
                  const regionLabel = REGION_LABEL[t0.ccode ?? ""] ?? t0.ccode ?? "";
                  // Data só dd/mm (ano já está no cabeçalho de secção)
                  const ddmm = g.date ? g.date.substring(8, 10) + "/" + g.date.substring(5, 7) : "";
                  const sidebarT: SidebarItemTournament = {
                    ...(t0 as any),
                    name: g.name,
                    playerCount: totalJog,
                    escalao: null,
                    ccode: "",     // sem ClubePill automático
                    date: undefined,  // sem data automática
                  };
                  return (
                    <TournSidebarItem
                      key={g.key}
                      t={sidebarT}
                      isActive={jovensGroupKey === g.key}
                      onClick={() => { setJovensGroupKey(g.key); setJovensEscIdx(0); setJovensShowInscricoes(false); md.onSelect(); }}
                      accentColor={SIDEBAR_ACCENT.tour}
                      extraPills={
                        <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                          {g.isRegional && !g.isNacional && <PillBadge pill="REGIONAL" />}
                          {g.entries.map(e => (
                            <EscPill key={e.tcode} escalao={e.escalao ?? ""} size="xs" />
                          ))}
                        </span>
                      }
                      footer={
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          {regionLabel && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px",
                              borderRadius: 10, background: "var(--bg-hover)", color: "var(--text-2)",
                              border: "1px solid var(--border)" }}>
                              {regionLabel}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ddmm}</span>
                        </div>
                      }
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="course-detail">
            {jovensShowInscricoes ? (
              <InscricoesPanel />
            ) : curJovensGroup ? (
              <>
                {/* Tabs por escalão */}
                {curJovensGroup.entries.length > 1 && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap",
                    borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
                    {curJovensGroup.entries.map((e, ri) => (
                      <button key={e.tcode + "_" + ri}
                        className={"tourn-tab tourn-tab-sm" + (jovensEscIdx === ri ? " active" : "")}
                        onClick={() => setJovensEscIdx(ri)}
                        style={jovensEscIdx === ri ? { marginBottom: 6 } : { marginBottom: 6, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                        {e.escalao ?? "Esc " + (ri + 1)}
                        <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.7 }}>
                          ({(e.playerCount || e.players.length)} jog)
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {curJovens
                  ? <TournamentDetail tournament={curJovens} escLookup={escLookup} playersDB={playersDB} />
                  : <div className="center-msg muted">Selecciona um torneio</div>
                }
              </>
            ) : (
              !jovensLoading && <div className="center-msg muted">{jovensLoaded ? "Selecciona um torneio" : "A carregar…"}</div>
            )}
          </div>
        </div>
      )}

      {/* Ranking PJA */}
      {navMode === "ranking-pja" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <PJARankingView pjaList={pjaList} playersDB={playersDB} loading={loading} />
        </div>
      )}
    </div>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
