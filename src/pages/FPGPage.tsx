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
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { loadPlayers } from "../data/loader";
import { buildEscLookup, type EscLookup, escCls, escPillCls, formatPlayerName, normalizePlayer } from "../utils/playerUtils";
import { TORNEIOS_CONFIG } from "../constants/config";
import { PILL_SSERRA, SIDEBAR_ACCENT, EscPill, PillBadge, RoundPill } from "../ui/PillBadge";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import SexBadge from "../ui/SexBadge";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import SortableHdr from "../ui/SortableHdr";
import DetailHeader from "../ui/DetailHeader";
import ExtLink from "../ui/ExternalLink";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import PlayerLink from "../ui/PlayerLink";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { C } from "../utils/colors";
import { fmtDate, fmtToPar, MONTHS_PT, norm, monthLabel, fmtHcp, escShort, fmtTime, fmtDataInscricao, anoEscalao, abreviarNome, medal, fpgDrawUrl, fpgScoringUrl, fpgAdmissionsUrl } from "../utils/format";
import { AnoEscalaoPill, TrendBadge } from "../ui/AnoEscalaoPill";
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
import { PJARankingView } from "../ui/PJARankingView";
import ClubesGruposView from "../ui/ClubesGruposView";
// Tipos e utilitários FPG — fonte canónica em ../data/fpgTypes.ts e ../data/fpgUtils.ts
import type { RoundScore, Player, Tournament, ScorecardOptions, SDResult, PlayerFilter, GrupoJogador, GrupoEntry } from "../data/fpgTypes";
import { numGross, resolveEsc, computeSD, filterPlayers, expandMultiRound, buildDisplayList } from "../data/fpgUtils";
// Leaderboard components — extraídos para fpg/LeaderboardComponents.tsx
import { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";
import { LinksBar } from "../ui/LinksBar";
// Inscrições e Jovens — extraídos para fpg/InscricoesComponents.tsx
import { InscricoesPanel, buildJovensGroups, TERMOS_COMPETICAO, type JovensGroup } from "../ui/InscricoesComponents";
// Admissions + draws (browser scrape + merge) — ver CLAUDE.md
import { loadFpgAdmissionsDraws, indexFpgAdmissionsDraws, NACIONAL_2026_META, NACIONAL_2026_TCODES, type FpgTournamentData } from "../data/nacional2026Loader";
import AdmissionsTab from "../ui/AdmissionsTab";
import DrawTab from "../ui/DrawTab";
// Re-exports para consumidores que ainda importam de FPGPage
export type { RoundScore, Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
export { expandMultiRound } from "../data/fpgUtils";
export { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";

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
// GrupoJogador e GrupoEntry importados de fpgTypes

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

interface DriveData {
  lastUpdated?: string; source?: string;
  totalTournaments: number; totalPlayers: number;
  tournaments: Tournament[];
}


export function TournamentDetail({ tournament, escLookup, playersDB }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB }) {
  const isMulti = (tournament.rounds || 1) > 1 && tournament.players.some(p => (p.roundScores?.length ?? 0) > 1);
  const nRounds = tournament.rounds || 1;
  const hasAnyRounds = (tournament.players?.length ?? 0) > 0;

  // Dados extra (admissions + draws) — injectados no loader Jovens
  const admissions = (tournament as any)._admissions as import("../data/nacional2026Loader").FpgAdmissions | undefined;
  const draws      = (tournament as any)._draws as Record<string, import("../data/nacional2026Loader").FpgDraw> | undefined;
  const hasAdmissions = !!admissions && !admissions.error && (admissions.players?.length ?? 0) > 0;
  const drawsByRound = useMemo(() => {
    const out = new Map<number, import("../data/nacional2026Loader").FpgDraw>();
    if (draws) for (const [k, d] of Object.entries(draws)) {
      if (d && (d.groups?.length ?? 0) > 0) out.set(parseInt(k, 10), d);
    }
    return out;
  }, [draws]);

  // Expanded list: R1, R2, ..., Resumo
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

  /**
   * Ordem canónica das tabs:
   *   Inscrições → Draw R1 → R1 → Draw R2 → R2 → Draw R3 → R3 → Resumo → 📋 Scorecards
   * Só aparecem tabs cujos dados existem.
   *
   * Internamente cada tab é identificada por uma chave:
   *   "admissions", "draw:N" (N=1..3), "round:I" (I=índice em expanded, exclui Resumo),
   *   "resumo", "scorecards"
   */
  const COMBINED_TAB = "📋 Scorecards";
  type TabDef = { key: string; label: string };
  const tabs: TabDef[] = useMemo(() => {
    const out: TabDef[] = [];
    if (hasAdmissions) out.push({ key: "admissions", label: "Inscrições" });
    if (isMulti) {
      // expanded é [R1, R2, ..., RN, Resumo] — últio elemento é o Resumo.
      const rondas = expanded.filter((e: any) => !e._isTotal);
      const temResumo = expanded.some((e: any) => e._isTotal);
      for (let i = 0; i < rondas.length; i++) {
        const roundNum = i + 1;
        if (drawsByRound.has(roundNum)) {
          out.push({ key: `draw:${roundNum}`, label: `Draw R${roundNum}` });
        }
        out.push({ key: `round:${i}`, label: (rondas[i] as any)._roundLabel || `R${roundNum}` });
      }
      if (temResumo) out.push({ key: "resumo", label: "Resumo" });
      out.push({ key: "scorecards", label: COMBINED_TAB });
    } else if (hasAnyRounds) {
      // 1-round: Draw R1 (se existir) + Scorecard
      if (drawsByRound.has(1)) out.push({ key: "draw:1", label: "Draw R1" });
      out.push({ key: "round:0", label: "Scorecard" });
    } else {
      // Sem rondas jogadas — pode ter só draws (torneio prestes a começar)
      const drawKeys = [...drawsByRound.keys()].sort((a, b) => a - b);
      for (const r of drawKeys) out.push({ key: `draw:${r}`, label: `Draw R${r}` });
    }
    return out;
  }, [hasAdmissions, isMulti, expanded, drawsByRound, hasAnyRounds]);

  const [tab, setTab] = useState(0);
  // Reset tab when tournament changes
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) {
    setLastTcode(tournament.tcode);
    setTab(0);
  }

  const activeTab = tabs[Math.min(tab, Math.max(0, tabs.length - 1))];
  const activeKey = activeTab?.key || "";
  const isAdmissionsTab = activeKey === "admissions";
  const isDrawTab = activeKey.startsWith("draw:");
  const drawRoundNum = isDrawTab ? parseInt(activeKey.slice(5), 10) : 0;
  const isResumoTab = activeKey === "resumo";
  const isCombinedTab = activeKey === "scorecards";
  const isRoundTab = activeKey.startsWith("round:");
  const roundIdx = isRoundTab ? parseInt(activeKey.slice(6), 10) : 0;

  // curT só é relevante para round/resumo tabs (lógica existente)
  const expandedIdxForCurT = isResumoTab
    ? expanded.findIndex((e: any) => e._isTotal)
    : isRoundTab
      ? expanded.findIndex((e: any, i: number) => !e._isTotal && expanded.filter((x: any, j: number) => !x._isTotal && j <= i).length === roundIdx + 1)
      : -1;
  const curT = expandedIdxForCurT >= 0 && expanded[expandedIdxForCurT] ? expanded[expandedIdxForCurT] : tournament;
  const isAcc = isResumoTab;
  const isCombined = isCombinedTab;

  // Info about tournament
  const refPlayer = tournament.players[0];
  const nholes = refPlayer?.nholes || refPlayer?.par?.length || refPlayer?.roundScores?.[0]?.pars?.length || 18;
  const parTotal = refPlayer?.parTotal || refPlayer?.par?.reduce((a, b) => a + b, 0) || refPlayer?.roundScores?.[0]?.pars.reduce((a, b) => a + b, 0) || 0;


  return (
    <div>
      {/* Cabeçalho */}
      <div className="detail-header">
        <div className="flex-wrap gap-8" style={{ display: "flex", alignItems: "baseline" }}>
          <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
          <div className="gap-4" style={{ display: "flex", alignItems: "center" }}>
            {tournament.ccode && (
              <span title="tclub" className="fs-10 fw-600 mono" style={{
                background: "var(--bg-hover)", color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.ccode}
              </span>
            )}
            {tournament.tcode && (
              <span title="tcode" className="fs-10 fw-700 mono" style={{
                background: "var(--accent)", color: "#fff",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.tcode}
              </span>
            )}
            {/* Botões INSCRIÇÕES + DRAW + SCORING — todos mesmo tamanho/estilo.
                Uniformizados para consistência em todas as páginas de torneio. */}
            {tournament._isSynthetic
              ? (tournament._subRounds ?? []).map((sr, i) => (
                  sr.ccode && sr.tcode
                    ? <React.Fragment key={sr.tcode}>
                        <a href={fpgAdmissionsUrl(sr.ccode, sr.tcode)}
                          target="_blank" rel="noopener noreferrer"
                          title={`Inscrições do Dia ${i + 1}`}
                          className="tourn-ext-link">
                          Inscrições D{i + 1} ↗
                        </a>
                        <a href={fpgDrawUrl(sr.ccode, sr.tcode)}
                          target="_blank" rel="noopener noreferrer"
                          title={`Draw do Dia ${i + 1}`}
                          className="tourn-ext-link">
                          Draw D{i + 1} ↗
                        </a>
                        <a href={fpgScoringUrl(sr.ccode, sr.tcode)}
                          target="_blank" rel="noopener noreferrer"
                          title={`Classificação do Dia ${i + 1}`}
                          className="tourn-ext-link">
                          Scoring D{i + 1} ↗
                        </a>
                      </React.Fragment>
                    : null
                ))
              : tournament.ccode && tournament.tcode && (
                  <>
                    <a href={fpgAdmissionsUrl(tournament.ccode, tournament.tcode)}
                      target="_blank" rel="noopener noreferrer"
                      title="Inscrições (tournAdmissions) na Federação"
                      className="tourn-ext-link">
                      Inscrições ↗
                    </a>
                    <a href={fpgDrawUrl(tournament.ccode, tournament.tcode)}
                      target="_blank" rel="noopener noreferrer"
                      title="Emparelhamentos (Draw) na Federação"
                      className="tourn-ext-link">
                      Draw ↗
                    </a>
                    <a href={fpgScoringUrl(tournament.ccode, tournament.tcode)}
                      target="_blank" rel="noopener noreferrer"
                      title="Classificação (Scoring) na Federação"
                      className="tourn-ext-link">
                      Scoring ↗
                    </a>
                  </>
                )
            }
          </div>
        </div>
        <div className="detail-sub">
          {tournament.campo && <span className="muted">📍 {tournament.campo}</span>}
          <span className="muted ml-8" >{fmtDate(tournament.date)}</span>
          <span className="chip ml-8" >
            {tournament.playerCount} jog{nRounds > 1 && <> · <RoundPill nR={nRounds} /></>} · {nholes}h · Par {parTotal}
          </span>

        </div>
        <LinksBar links={tournament.links} escalao={tournament.escalao} />
      </div>

      {/* Tabs (só mostra se há mais do que uma) */}
      {tabs.length > 1 && (
        <div className="tab-bar">
          {tabs.map((t, i) => (
            <button key={t.key} className={`tab-under${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Conteúdo */}
      {isAdmissionsTab && admissions
        ? <AdmissionsTab
            admissions={admissions}
            playersDB={playersDB as any}
            date={tournament.date}
            fpgUrl={tournament.ccode && tournament.tcode ? `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${tournament.ccode}&tcode=${tournament.tcode}` : undefined}
            tournamentEscalao={tournament.escalao || undefined}
            tournamentSex={/\bF\b|\bS\b|Feminino/i.test(tournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(tournament.name || "") ? "M" : undefined}
          />
        : isDrawTab
          ? <DrawTab
              draw={drawsByRound.get(drawRoundNum) || { groups: [] }}
              roundNum={drawRoundNum}
              playersDB={playersDB as any}
              tournamentEscalao={tournament.escalao || undefined}
              tournamentSex={/\bF\b|\bS\b|Feminino/i.test(tournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(tournament.name || "") ? "M" : undefined}
              tournamentDate={tournament.date}
            />
          : isCombined
            ? <AllRoundsScorecardLB tournament={tournament} escLookup={escLookup} playersDB={playersDB} />
            : isAcc
              ? <AccumulatedLB tournament={curT} nRounds={nRounds} escLookup={escLookup} playersDB={playersDB} />
              : isRoundTab || !isMulti
                ? <ScorecardLB tournament={curT} escLookup={escLookup} playersDB={playersDB} />
                : null /* sem tabs válidas — pode ser torneio futuro sem admissions (unlikely) */
      }
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN CONTENT
   ───────────────────────────────────────────── */


/* InscricoesPanel, buildJovensGroups, TERMOS_COMPETICAO, JovensGroup — importados de fpg/InscricoesComponents */

// Mapa URL-segment ↔ seriesFilter — usado para sincronizar URL e estado.
type SeriesKey = "" | "circuit" | "santo" | "clubes" | "jovens";
const URL_TO_FILTER: Record<string, SeriesKey> = {
  jovens:  "jovens",
  clubes:  "clubes",
  sto:     "santo",
  santo:   "santo",    // alias
  pja:     "circuit",
  circuit: "circuit",  // alias
};
const FILTER_TO_URL: Record<SeriesKey, string> = {
  "":        "",
  jovens:    "jovens",
  clubes:    "clubes",
  santo:     "sto",
  circuit:   "pja",
};
// Atalhos que abrem directamente JOVENS com o painel de inscrições (case-insensitive)
const INSCRITOS_SHORTCUTS = new Set(["inscritoscn", "inscritos"]);

function Content() {
  const location = useLocation();
  const navigate = useNavigate();
  const params   = useParams<{ filter?: string; sub?: string }>();

  // Resolver filtro inicial pela URL. Dois formatos válidos para inscrições:
  //   /FPG/jovens/inscritosCN  (canónico, nested)
  //   /FPG/inscritosCN         (atalho top-level — também funciona)
  const urlSeg = (params.filter || "").toLowerCase();
  const urlSub = (params.sub    || "").toLowerCase();
  const isInscritosShortcut = INSCRITOS_SHORTCUTS.has(urlSeg);
  const startSeries: SeriesKey = isInscritosShortcut
    ? "jovens"
    : (URL_TO_FILTER[urlSeg] ?? "");
  const startInscritos = isInscritosShortcut
    || (startSeries === "jovens" && INSCRITOS_SHORTCUTS.has(urlSub));
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("A carregar ficheiros...");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
    const md = useMasterDetail();
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12">("torneios");
  const [seriesFilter, setSeriesFilter] = useState<"" | "circuit" | "santo" | "clubes" | "jovens">(startInscritos ? "jovens" : ""); // filtro de série dentro de Torneios
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
  const [jovensShowInscricoes, setJovensShowInscricoes] = useState(startInscritos);

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
    Promise.all([
      ...JOVENS_FILES.map(async ({ url, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const d: DriveData = await r.json();
          return (d.tournaments || []).map(t => ({
            ...t, _jovensYear: year, _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
        } catch { return []; }
      }),
      // Carrega também admissions + draws (107 torneios) para enriquecer existentes
      // e injectar sinteticamente os 10 Nacional 2026 (que ainda não estão em jovens_2026).
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admDrawsFile = all[all.length - 1] as Awaited<ReturnType<typeof loadFpgAdmissionsDraws>> | null;
      const admDrawsIdx = admDrawsFile ? indexFpgAdmissionsDraws(admDrawsFile) : new Map<string, FpgTournamentData>();
      const tournaments = (all.slice(0, -1) as any[]).flat() as Tournament[];

      const seen = new Map<string, Tournament>();
      // 1) Torneios existentes — dedup + enriquecer com admissions/draws quando houver match
      for (const t of tournaments) {
        const key = t.ccode + "/" + String((t as any).tcode);
        if (seen.has(key)) continue;
        const idxKey = `${t.ccode}-${(t as any).tcode}`;
        const ad = admDrawsIdx.get(idxKey);
        if (ad) {
          (t as any)._admissions = ad.admissions;
          (t as any)._draws = ad.draws;
        }
        seen.set(key, t);
      }
      // 2) Injectar Nacional 2026 (tcodes 10935-10944) como torneios sintéticos
      //    se não existirem já em jovens_2026.json.
      for (const tcode of NACIONAL_2026_TCODES) {
        const key = "000/" + tcode;
        if (seen.has(key)) continue;
        const meta = NACIONAL_2026_META[tcode];
        const ad = admDrawsIdx.get(`000-${tcode}`);
        if (!ad) continue;  // sem dados scraped, não injecta
        const playerCount = ad.admissions?.totalInscritos ?? (ad.admissions?.players?.length ?? 0);
        const synthetic = {
          name: meta.name,
          ccode: "000",
          tcode,
          date: "2026-05-01",
          campo: "PGA Aroeira II",
          clube: "000",
          circuit: "tour",
          series: "jovens",
          region: "nacional",
          escalao: meta.escalao,
          num: 1,
          rounds: 3,
          playerCount,
          players: [],
          _jovensYear: "2026",
          _sourceFile: "fpg-admissions-draws.json",
          _admissions: ad.admissions,
          _draws: ad.draws,
        } as unknown as Tournament;
        seen.set(key, synthetic);
      }
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
        key={t._isSynthetic ? "synth_" + t.tcode : (isClubesItem ? "clubes_" : "") + t.tcode + "_" + t.date}
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
                className={"tourn-tab tourn-tab-sm" + (navMode === key ? " active" : " tourn-tab-muted")}
                onClick={() => { setNavMode(key); setSeriesFilter(""); setYearFilter(null); }}
                style={{ flexShrink: 0 }}>
                {label}
              </button>
            ))}
            {navMode === "torneios" && availYears.length > 1 && (<>
              <ToolbarSep />
              {availYears.map(y => (
                <button key={y}
                  className={"tourn-tab tourn-tab-sm" + (activeYear === y ? " active" : " tourn-tab-muted")}
                  onClick={() => setYearFilter(activeYear === y ? null : y)}
                  style={{ flexShrink: 0 }}>
                  {y}
                </button>
              ))}
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : " tourn-tab-muted")}
                onClick={() => setFilterManuel(v => !v)}
                style={filterManuel
                  ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" }
                  : { flexShrink: 0, whiteSpace: "nowrap" }}>
                ★ Manuel
              </button>
            </>)}
            <div className="flex-1" style={{ minWidth: 8 }} />
            {/* Contadores à direita */}
            <a href="https://scoring.datagolf.pt/pt/tournaments.aspx" target="_blank" rel="noopener noreferrer"
              className="fs-11 fw-600"
              style={{ flexShrink: 0, cursor: "pointer", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 8px", lineHeight: 1.6, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>
              FPG Torneios ↗
            </a>
            {loading
              ? <span className="muted fs-11 shrink-0"  style={{ fontStyle: "italic" }}>{loadingMsg}</span>
              : <>
                  {navMode === "torneios" && (() => {
                    const count = seriesFilter === "santo"   ? santoByYear.years.reduce((s, y) => s + (santoByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "circuit" ? pjaByYear.years.reduce((s, y) => s + (pjaByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "clubes"  ? clubesList.length
                                : seriesFilter === "jovens"  ? jovensGroups.length
                                : activeYear
                                  ? displayList.filter(t => (t.date || "").startsWith(activeYear)).length
                                  : displayList.length;
                    return <span className="chip shrink-0" >{count} torneios</span>;
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
              { key: "jovens",  label: "🏆 JOVENS" },
              { key: "clubes",  label: "🏅 CLUBES" },
              { key: "santo",   label: "⛳ STO" },
              { key: "circuit", label: "🏆 PJA" },
            ] as const).map(({ key, label }) => {
              const active = seriesFilter === key;
              const st = active
                ? key === "santo"  ? { flexShrink: 0, ...PILL_SSERRA, borderColor: PILL_SSERRA.background as string }
                : key === "clubes" ? { flexShrink: 0, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                : key === "jovens"    ? { flexShrink: 0, background: SIDEBAR_ACCENT.tour, borderColor: SIDEBAR_ACCENT.tour, color: "#fff" }
                : { flexShrink: 0 }
                : { flexShrink: 0 };
              const urlSeg = FILTER_TO_URL[key];
              const href = urlSeg ? `/FPG/${urlSeg}` : "/FPG";
              return (
                <a key={key}
                  href={href}
                  className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
                  onClick={e => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      setSeriesFilter(key);
                      setJovensShowInscricoes(false);
                      navigate(urlSeg ? `/FPG/${urlSeg}` : "/FPG");
                    }
                  }}
                  style={st}>
                  {label}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="fw-600 fs-13" style={{ padding: "16px 20px", color: "var(--danger)" }}>
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
          <div className="course-detail" ref={md.detailRef}>
            {/* Tabs Individual / Grupos */}
            <div style={{
              display: "flex", borderBottom: "1px solid var(--border)",
              background: "var(--bg-card,#fff)", position: "sticky", top: 0, zIndex: 10,
            }}>
              {(["grupos", "individual"] as const).map(v => {
                const label = v === "grupos" ? "🏅 Grupos" : "📋 Individual";
                const active = clubesView === v;
                return (
                  <button key={v} onClick={() => setClubesView(v)} className="fs-12" style={{
                    padding: "8px 16px", fontWeight: active ? 700 : 500,
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
                    <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>
                      <div className="mb-12" style={{ fontSize: 32 }}>📋</div>
                      <div className="fw-600 mb-6">Vista de grupos não disponível para {curClubesYear}</div>
                      <div className="fs-12">Os dados de composição de grupos desta edição não estão carregados.<br/>Use o tab <strong>Individual</strong> para ver os resultados.</div>
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
            <a
              href="/FPG/jovens/inscritosCN"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  setJovensShowInscricoes(true); setJovensGroupKey(null); md.onSelect();
                  navigate("/FPG/jovens/inscritosCN");
                }
              }}
              className={`course-item${jovensShowInscricoes ? " active" : ""}`}
              style={{
                borderLeft: `4px solid ${SIDEBAR_ACCENT.tour}`, borderRadius: "0 6px 6px 0",
              }}
            >
              <div className="fw-700 fs-12">
                📋 Inscrições 2026
              </div>
              <div className="muted fs-11" >Campeonatos Nacionais de Jovens</div>
            </a>
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
                      onClick={() => {
                        setJovensGroupKey(g.key); setJovensEscIdx(0); setJovensShowInscricoes(false); md.onSelect();
                        // volta à URL do filtro JOVENS (sem subfiltro inscritosCN)
                        if (/\/inscritos/i.test(location.pathname)) navigate("/FPG/jovens");
                      }}
                      accentColor={SIDEBAR_ACCENT.tour}
                      extraPills={
                        <span className="flex-wrap" style={{ display: "inline-flex", gap: 3, marginTop: 2 }}>
                          {g.isRegional && !g.isNacional && <PillBadge pill="REGIONAL" />}
                          {g.entries.map(e => (
                            <EscPill key={e.tcode} escalao={e.escalao ?? ""} size="xs" />
                          ))}
                        </span>
                      }
                      footer={
                        <div className="mt-3" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {regionLabel && (
                            <span className="fs-10 fw-600" style={{ padding: "1px 6px",
                              borderRadius: 10, background: "var(--bg-hover)", color: "var(--text-2)",
                              border: "1px solid var(--border)" }}>
                              {regionLabel}
                            </span>
                          )}
                          <span className="fs-11 c-muted">{ddmm}</span>
                        </div>
                      }
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="course-detail" ref={md.detailRef}>
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
                        className={"tourn-tab tourn-tab-sm" + (jovensEscIdx === ri ? " active" : " tourn-tab-muted")}
                        onClick={() => setJovensEscIdx(ri)}
                        style={{ marginBottom: 6 }}>
                        {e.escalao ?? "Esc " + (ri + 1)}
                        <span className="fs-10" style={{ marginLeft: 3, opacity: 0.7 }}>
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
        <div className="flex-1" style={{ overflow: "auto" }}>
          <PJARankingView pjaList={pjaList} playersDB={playersDB} loading={loading} />
        </div>
      )}
    </div>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
