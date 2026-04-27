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
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { loadPlayers } from "../data/loader";
import { buildEscLookup, type EscLookup, escCls, escPillCls, formatPlayerName, normalizePlayer } from "../utils/playerUtils";
import { TORNEIOS_CONFIG } from "../constants/config";
import { PILL_SSERRA, SIDEBAR_ACCENT, EscPill, PillBadge, RoundPill, NineHPill, SserraPill, NacionalPill, JuniorPill, ClubePill, ManuelPill } from "../ui/PillBadge";
import { TournSidebarItem, SSERRA_CCODE, type SidebarItemTournament } from "../ui/TournSidebarItem";
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
import { fmtDate, fmtToPar, MONTHS_PT, norm, monthLabel, fmtHcp, escShort, fmtTime, fmtDataInscricao, anoEscalao, abreviarNome, medal, fpgDrawUrl, fpgScoringUrl, fpgAdmissionsUrl, tournamentKey, tournamentUrl, parseTournKey } from "../utils/format";
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
import { numGross, resolveEsc, computeSD, filterPlayers, expandMultiRound, buildDisplayList, tournamentHasManuel } from "../data/fpgUtils";
// Leaderboard components — extraídos para fpg/LeaderboardComponents.tsx
import { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";
import Aroeira2AnaliseView from "../ui/Aroeira2AnaliseView";
import { LinksBar } from "../ui/LinksBar";
// Inscrições e Jovens — extraídos para fpg/InscricoesComponents.tsx
import { InscricoesPanel, buildJovensGroups, buildEventGroups, TERMOS_COMPETICAO, type JovensGroup, type EventGroup } from "../ui/InscricoesComponents";
import { JovensAnaliseView } from "../ui/JovensAnaliseView";
// Admissions + draws (browser scrape + merge) — ver CLAUDE.md
import { loadFpgAdmissionsDraws, indexFpgAdmissionsDraws, NACIONAL_2026_META, NACIONAL_2026_TCODES, type FpgTournamentData } from "../data/nacional2026Loader";
import AdmissionsTab from "../ui/AdmissionsTab";
import DrawTab from "../ui/DrawTab";
import PrintButton from "../ui/PrintButton";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
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
      // Tab "Análise Aroeira II" — só para o PJA Aroeira Masters 2026 (029/10543)
      if (tournament.ccode === "029" && tournament.tcode === "10543") {
        out.push({ key: "analise-aroeira2", label: "🎯 Análise" });
      }
    } else if (hasAnyRounds) {
      // 1-round OU multi-round parcialmente jogado (ex: R1 com scorecards, R2
      // ainda só draw publicado). Mostrar:
      //   - Draw R1 (se existir) → Scorecard (R1) → Draw R2..N (se houver)
      if (drawsByRound.has(1)) out.push({ key: "draw:1", label: "Draw R1" });
      out.push({ key: "round:0", label: nRounds > 1 ? "R1" : "Scorecard" });
      // Draws de rondas futuras ainda não jogadas (R2, R3, ...)
      const futureDraws = [...drawsByRound.keys()].filter(r => r >= 2).sort((a, b) => a - b);
      for (const r of futureDraws) {
        out.push({ key: `draw:${r}`, label: `Draw R${r}` });
      }
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
  const isAnaliseAroeiraTab = activeKey === "analise-aroeira2";
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
          {/* Título clicável: link canónico `/FPG/torneio/{ccode}-{tcode}`.
              Preserva right-click "abrir em nova aba", Ctrl/Cmd+click, middle-click,
              preview de URL. O próprio h2 continua visualmente inalterado. */}
          {(() => {
            const canonicalUrl = tournamentUrl("FPG", tournament.ccode, tournament.tcode);
            return canonicalUrl ? (
              <a
                href={canonicalUrl}
                title="Link canónico do torneio (abrir em nova aba para partilhar)"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "none" }}>
                <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
              </a>
            ) : (
              <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
            );
          })()}
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
            {/* Links extra específicos do torneio — regulamento, página do
                clube/evento, etc. Carregados de Tournament.extraLinks. */}
            {(tournament.extraLinks || []).map((lnk) => (
              <a key={lnk.url} href={lnk.url}
                target="_blank" rel="noopener noreferrer"
                title={lnk.label}
                className="tourn-ext-link">
                {lnk.icon ? `${lnk.icon} ` : ""}{lnk.label} ↗
              </a>
            ))}
            <PrintButton />
          </div>
        </div>
        <div className="detail-sub">
          {tournament.campo && <span className="muted">📍 {tournament.campo}</span>}
          <span className="muted ml-8" >{fmtDate(tournament.date)}</span>
          {/* Pills individuais — reutilizam os componentes globais (consistência com a sidebar).
              Ordem: stats básicos (jog, ronda, 9H, par) → características do torneio (escalão,
              NACIONAL, JUNIOR, SSerra, Clube, Manuel). */}
          <span className="gap-4 ml-8" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
            {tournament.playerCount != null && (
              <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                {tournament.playerCount} jog
              </span>
            )}
            {nRounds > 1 && <RoundPill nR={nRounds} />}
            {nholes <= 9 && <NineHPill />}
            {parTotal > 0 && (
              <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                Par {parTotal}
              </span>
            )}
            {tournament.escalao && <EscPill esc={tournament.escalao} />}
            {/NACIONAL/i.test(tournament.name || "") && <NacionalPill />}
            {/JUNIOR|J[ÚU]NIOR/i.test(tournament.name || "") && <JuniorPill />}
            {tournament.ccode === SSERRA_CCODE && <SserraPill />}
            {tournament.ccode !== SSERRA_CCODE && <ClubePill clube={tournament.clube} ccode={tournament.ccode} />}
            {tournamentHasManuel(tournament) && <ManuelPill />}
          </span>

        </div>
        <LinksBar links={tournament.links} escalao={tournament.escalao} />
      </div>

      {/* Nota editorial do torneio (_note) — usada para contexto cross-torneio
          (ex: "alguns jogadores jogaram simultaneamente no Absoluto").
          Estilo de ALERTA (amber/warning) para chamar à atenção. */}
      {(tournament as any)._note && (
        <div className="fs-12 fw-600" style={{
          padding: "10px 14px", margin: "8px 12px",
          background: "var(--bg-warn-subtle, #fef3c7)",
          border: "1px solid var(--color-warn, #f59e0b)",
          borderRadius: 6,
          color: "var(--text-1, #1f2937)", lineHeight: 1.45,
        }}>
          ⚠️ {(tournament as any)._note}
        </div>
      )}

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
              admissions={admissions}
            />
          : isCombined
            ? <AllRoundsScorecardLB tournament={tournament} escLookup={escLookup} playersDB={playersDB} />
            : isAnaliseAroeiraTab
              ? <Aroeira2AnaliseView tournament={tournament} />
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

// Mapa URL-segment ↔ navMode (tabs "Torneios" / "Ranking PJA" / "Ranking Sub-12").
// ⚠ As chaves têm de ser lowercase porque `urlSeg = params.filter.toLowerCase()`.
// Para preservar leitura natural na URL ("rankingPJA"), usamos redirect no lookup.
const URL_TO_NAV: Record<string, "torneios" | "ranking-pja" | "ranking-sub12"> = {
  rankingpja:   "ranking-pja",
  rankingsub12: "ranking-sub12",
};
// URLs geradas — mantemos o case "camelCase" para leitura, mas o comparison
// com urlSeg é sempre lowercase.
const NAV_TO_URL: Record<"torneios" | "ranking-pja" | "ranking-sub12", string> = {
  "torneios":      "",
  "ranking-pja":   "rankingPJA",
  "ranking-sub12": "rankingSub12",
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
  const params   = useParams<{ filter?: string; sub?: string; tkey?: string }>();

  // Deep-link de torneio (`/FPG/torneio/{ccode}-{tcode}`) — prioritário sobre
  // os filtros de série. Quando presente, fazemos auto-select do torneio no
  // useEffect mais abaixo, assim que o displayList/jovensTournaments carregar.
  const urlTkey = params.tkey || null;

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
  // Deep-link em curso → começar com selected=-1 para que `cur = displayList[selected]`
  // fique undefined até o URL→state encontrar o match correcto e chamar setSelected(idx).
  // Sem esta guarda, selected=0 faz o render mostrar displayList[0] (torneio aleatório,
  // dependendo de qual ficheiro pull-torneios carregou primeiro) enquanto pjaExtra
  // ou jovens ainda carregam — dando a ilusão de "várias páginas a piscar".
  const [selected, setSelected] = useState<number>(() => params.tkey ? -1 : 0);
    const md = useMasterDetail();
  // Filtros sincronizados com URL query params para partilha directa.
  // Ex: `/FPG?year=2026&manuel=0&q=pedro`. Declarado ANTES dos useStates que
  // dependem dele (Temporal Dead Zone).
  const [searchParams, setSearchParams] = useSearchParams();
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12">(
    URL_TO_NAV[urlSeg] ?? "torneios"
  );
  const [seriesFilter, setSeriesFilter] = useState<"" | "circuit" | "santo" | "clubes" | "jovens">(
    (startInscritos || urlSeg === "jovens") ? "jovens" : ""
  );
  const [yearFilter, setYearFilter]    = useState<string | null>(() => searchParams.get("year"));
  const [filterManuel, setFilterManuel] = useState(() => searchParams.get("manuel") !== "0");
  const [searchQuery, setSearchQuery]  = useState(() => searchParams.get("q") || "");  // filtro de texto: nome ou campo/clube
  const [escLookup, setEscLookup] = useState<EscLookup>(new Map());
  const [playersDB, setPlayersDB] = useState<PlayersDB>({});
  // Lista de fedCodes inscritos no circuito PJA por ano.
  // Carregado de /data/pja-members.json — ver PJARankingView para uso.
  const [pjaMembers, setPjaMembers] = useState<Record<string, string[]>>({});
  // Snapshot do PDF oficial PJA para comparação — se definido, a tabela mostra
  // Δ pts e Δ rondas vs PDF e destaca células com disparidade.
  const [pjaPdfSnapshot, setPjaPdfSnapshot] = useState<Record<string, Array<{fed:string;name:string;rounds:number;pts:number;pos:number}>>>({});

  // ── Estado Clubes ─────────────────────────────────────────────────────────
  const [clubesTournaments, setClubesTournaments] = useState<Tournament[]>([]);
  const [clubesLoading, setClubesLoading]         = useState(false);
  const [clubesLoaded, setClubesLoaded]           = useState(false);
  const [clubesSelected, setClubesSelected]       = useState<number>(0);
  const [clubesEsc, setClubesEsc]                 = useState<string>("sub14"); // "sub14" | "sub18"
  const [clubesView, setClubesView]               = useState<"individual" | "grupos">("grupos");

  // ── Estado PJA (drive/aquapor mensais, para o Ranking PJA 2026+) ─────────
  // Carregamos separadamente para não afectar o displayList principal (tabs
  // Todos/Circuito/Santo continuam a ver apenas pull-torneios).
  const [pjaExtraTournaments, setPjaExtraTournaments] = useState<Tournament[]>([]);

  // Sincronização state → URL (query string). Só parâmetros com valor
  // não-default vão para o URL. replace:true evita poluir o histórico.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    // year
    if (yearFilter) sp.set("year", yearFilter); else sp.delete("year");
    // manuel (default: true — só guardar "0" se desligado)
    if (!filterManuel) sp.set("manuel", "0"); else sp.delete("manuel");
    // search
    if (searchQuery.trim()) sp.set("q", searchQuery.trim()); else sp.delete("q");
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter, filterManuel, searchQuery]);

  // ── Estado Jovens ─────────────────────────────────────────────────────────
  const [jovensTournaments, setJovensTournaments] = useState<Tournament[]>([]);
  const [jovensLoading, setJovensLoading]         = useState(false);
  const [jovensLoaded, setJovensLoaded]           = useState(false);
  const [jovensGroupKey, setJovensGroupKey]        = useState<string | null>(null);
  const [jovensEscIdx, setJovensEscIdx]            = useState<number>(0);
  const [jovensShowInscricoes, setJovensShowInscricoes] = useState(startInscritos);
  // /FPG/jovens sem sub-segmento → abre directamente na vista de Análise.
  // /FPG/jovens/inscritosCN → Inscrições. /FPG/torneio/X-Y → torneio específico.
  const startAnalise = urlSeg === "jovens" && !urlSub && !params.tkey;
  const [jovensShowAnalise, setJovensShowAnalise] = useState(startAnalise);

  // ── Sync URL→seriesFilter quando o utilizador navega entre /FPG, /FPG/jovens,
  //     /FPG/sto, /FPG/clubes, /FPG/pja sem remontar a página.
  // useState só inicializa UMA vez → se o user entrou em /FPG/jovens e depois
  // clica no topo em "FPG" (→ /FPG), o seriesFilter ficaria preso em "jovens".
  // Este effect alinha o estado com a URL sempre que urlSeg muda.
  //
  // ⚠ Early-return em `/FPG/torneio/:tkey`: essa rota não tem `:filter`, logo
  // urlSeg="" — o effect interpretaria como "volta a Todos" e arrancaria o
  // utilizador da tab em que está (Jovens/Santo/PJA). Nesse caso, a selecção
  // de torneio deve ser local à tab; não é uma mudança de tab.
  useEffect(() => {
    if (params.tkey) return;  // rota /FPG/torneio/:tkey → preservar tab actual

    // Navegação por tabs (Ranking PJA / Ranking Sub-12 / Torneios)
    const targetNav = URL_TO_NAV[urlSeg] ?? "torneios";
    if (targetNav !== navMode) setNavMode(targetNav);

    // Series-filter (apenas relevante em navMode=torneios)
    const targetSeries: SeriesKey = isInscritosShortcut
      ? "jovens"
      : (URL_TO_FILTER[urlSeg] ?? "");
    if (targetSeries !== seriesFilter) {
      setSeriesFilter(targetSeries);
    }
    // Se voltou para /FPG puro (sem segmento) a partir de /FPG/jovens, limpar
    // também as views jovens-específicas que podem ter ficado activas.
    if (urlSeg === "") {
      if (jovensShowInscricoes) setJovensShowInscricoes(false);
      if (jovensShowAnalise) setJovensShowAnalise(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSeg, urlSub, isInscritosShortcut, params.tkey]);

  // ── Sources secundárias (para o painel DataSourcesChip) ─────────────────
  //   Cada secção (clubes, jovens, admissions) regista ficheiros tentados/lidos.
  //   fileMeta cobre apenas os pull-torneios; estes cobrem o resto.
  const [clubesMeta, setClubesMeta] = useState<DataSource[]>([]);
  const [jovensMeta, setJovensMeta] = useState<DataSource[]>([]);
  const [admissionsMeta, setAdmissionsMeta] = useState<DataSource[]>([]);

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
        const [pdb, linksResp, kidsLinksResp] = await Promise.all([
          loadPlayers().catch(() => ({} as PlayersDB)),
          fetch("/data/tournament-links.json").catch(() => null),
          fetch("/data/kids-links.json").catch(() => null),
        ]);
        // Merge kids-links.json no playersDB — adiciona entries virtuais com
        // fedKey sintético "intl:<name>" para jogadores internacionais, para que
        // o TournPName encontre o `kidsHash` via name-match e rendirize ↗ Kids.
        if (kidsLinksResp?.ok) {
          try {
            const kl = await kidsLinksResp.json();
            for (const entry of (kl.players || [])) {
              if (!entry.name || !entry.kidsHash) continue;
              const key = "intl:" + entry.name.toLowerCase().replace(/\s+/g, "_");
              (pdb as any)[key] = {
                name: entry.name,
                kidsHash: entry.kidsHash,
                ...(entry.country ? { country: entry.country } : {}),
                ...(entry.escalao ? { escalao: entry.escalao } : {}),
                ...(entry.sex ? { sex: entry.sex } : {}),
              };
            }
          } catch { /* ignore */ }
        }
        if (alive) { setEscLookup(buildEscLookup(pdb)); setPlayersDB(pdb); }
        let externalLinks: Record<string, Record<string, string>> = {};
        if (linksResp?.ok) {
          externalLinks = await linksResp.json().catch(() => ({}));
        }

        const allT: Tournament[] = [];
        const meta: FileMeta[] = [];

        // Paraleliza os fetches dos pull-torneios*.json em lotes de PARALLEL_BATCH.
        // Antes: loop sequencial com await (6 ficheiros → 6× latência da rede).
        // Agora: 1 único batch de até DATA_MAX fetches concorrentes, pára no
        // primeiro null consecutivo que vier (via findIndex).
        const PARALLEL_BATCH = 10;
        let stopAt = DATA_MAX;
        for (let start = 0; start < stopAt; start += PARALLEL_BATCH) {
          if (!alive) return;
          const batchEnd = Math.min(start + PARALLEL_BATCH, stopAt);
          const batch = await Promise.all(
            Array.from({ length: batchEnd - start }, (_, k) => start + k).map(async (i) => {
              const url = dataUrl(i);
              try {
                const resp = await fetch(url);
                if (!resp.ok) return { i, url, d: null as DriveData | null, parseErr: null as string | null };
                const d = await resp.json() as DriveData;
                return { i, url, d, parseErr: null };
              } catch (e) {
                return { i, url, d: null, parseErr: String(e).slice(0, 120) };
              }
            })
          );
          let consecutiveMisses = 0;
          let hitStop = false;
          for (const { i, url, d, parseErr } of batch) {
            if (!d) {
              if (parseErr) console.warn(`[FPGPage] Falhou a parsear ${url}: ${parseErr} — a continuar`);
              consecutiveMisses++;
              if (consecutiveMisses >= 2) { stopAt = i; hitStop = true; break; }
              continue;
            }
            consecutiveMisses = 0;
            const normalised = (d.tournaments || []).map(t => {
              const extLinks = externalLinks[String(t.tcode)];
              return { ...t, _sourceFile: url, _sourceIndex: i,
                players: t.players.map(normalizePlayer),
                ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
            });
            allT.push(...normalised);
            meta.push({ file: url, index: i, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
          }
          if (alive) {
            setTournaments([...allT]);
            setFileMeta([...meta]);
            setLoadingMsg(`A carregar... ${meta.length} ficheiro(s) · ${allT.length} torneios`);
          }
          if (hitStop) break;
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
          const clubesMetaLocal: DataSource[] = [];
          const clubesResults = await Promise.all(CLUBES_FILES_MAIN.map(async ({ url, year }) => {
            try {
              const r = await fetch(url);
              if (!r.ok) {
                clubesMetaLocal.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "clubes" });
                return [];
              }
              const d: DriveData = await r.json();
              const rows = (d.tournaments || []).map(t => ({
                ...t,
                series: "clubes" as const,
                _clubesEsc: resolveEscKeyMain((t as any).escalao),
                _clubesYear: year,
                _sourceFile: url,
                players: t.players.map(normalizePlayer),
              }));
              clubesMetaLocal.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "clubes" });
              return rows;
            } catch (e) {
              clubesMetaLocal.push({ path: url, status: "error", error: String(e), group: "clubes" });
              return [];
            }
          }));
          if (alive) setClubesMeta(clubesMetaLocal);
          const clubesFlat = clubesResults.flat();
          // Deduplicar por tcode
          const seen = new Map<string, Tournament>();
          for (const t of clubesFlat) seen.set(String(t.tcode), t as Tournament);
          if (alive) {
            const uniqueClubes = [...seen.values()];
            setClubesTournaments(uniqueClubes);
            setClubesLoaded(true);
            // Carregar admissions+draws UMA vez e enriquecer TODOS os torneios
            // (pull-torneios + clubes) para aparecerem com draws/pairings nos
            // tabs STO, PJA, Clubes e Todos. Os tabs Jovens e Clubes detalhe
            // fazem o mesmo enrichment nos seus loaders próprios.
            const admFile = await loadFpgAdmissionsDraws().catch(() => null);
            const admIdx = admFile ? indexFpgAdmissionsDraws(admFile) : new Map<string, FpgTournamentData>();
            const enrich = (t: Tournament): Tournament => {
              const ad = admIdx.get(`${t.ccode}-${t.tcode}`);
              if (ad) {
                (t as any)._admissions = ad.admissions;
                (t as any)._draws = ad.draws;
              }
              return t;
            };
            const enrichedAllT = allT.map(enrich);
            const enrichedClubes = uniqueClubes.map(enrich);
            setTournaments([...enrichedAllT, ...enrichedClubes]);
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

  // ── Loader PJA (Drive Tour + Aquapor mensais, para Ranking PJA 2026+) ────
  // Estes torneios NÃO entram em tournaments/displayList (para não poluir as
  // outras tabs). São carregados num state separado e combinados só quando
  // construímos `pjaRankingList`. Activado apenas quando a tab Ranking PJA
  // está activa.
  useEffect(() => {
    // Carregar drive-data/aquapor SEMPRE (não só no tab Ranking PJA) — assim
    // deep-links em nova aba para `/FPG/torneio/{ccode}-{tcode}` de um Drive
    // Tour ou Aquapor conseguem encontrar o torneio no displayList em vez de
    // cair no default (primeiro torneio).
    if (pjaExtraTournaments.length > 0) return;  // já carregado
    let alive = true;
    // Monta lista de URLs a tentar (todos os meses desde startYear até agora),
    // faz fetch em PARALELO com Promise.all. Cada fetch individual falha
    // silenciosamente (muitos meses podem não existir). Isto é 10-30× mais
    // rápido que o loop sequencial com await.
    const loadMonthly = async (prefix: string, startYear: number): Promise<Tournament[]> => {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      const urls: string[] = [];
      for (let y = startYear; y <= curYear; y++) {
        const endMonth = (y === curYear) ? curMonth : 12;
        for (let m = 1; m <= endMonth; m++) {
          urls.push(`/data/${prefix}-${y}-${String(m).padStart(2, "0")}.json`);
        }
      }
      const results = await Promise.all(urls.map(async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const ct = r.headers.get("content-type") || "";
          if (!ct.includes("json")) return [];
          const d = await r.json();
          return (d.tournaments || []).map((t: any) => ({
            ...t, _sourceFile: url,
            players: (t.players || []).map(normalizePlayer),
          })) as Tournament[];
        } catch { return []; }
      }));
      if (!alive) return [];
      return results.flat();
    };
    const loadPjaMembers = async (): Promise<Record<string, string[]>> => {
      try {
        const r = await fetch("/data/pja-members.json");
        if (!r.ok) return {};
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) return {};
        const d = await r.json();
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_")) continue;
          if (Array.isArray(v)) out[k] = v.map(String);
        }
        return out;
      } catch { return {}; }
    };
    const loadPdfSnapshot = async (): Promise<Record<string, any[]>> => {
      try {
        const r = await fetch("/data/pja-pdf-snapshot.json");
        if (!r.ok) return {};
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) return {};
        const d = await r.json();
        const out: Record<string, any[]> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_")) continue;
          if (Array.isArray(v)) out[k] = v as any[];
        }
        return out;
      } catch { return {}; }
    };
    Promise.all([
      loadMonthly("drive-data", 2026),
      loadMonthly("aquapor-data", 2026),
      loadPjaMembers(),
      loadPdfSnapshot(),
    ]).then(([drive, aq, members, pdfSnap]) => {
      if (!alive) return;
      // NÃO chamar buildDisplayList aqui — drive-data é single-round por design,
      // aquapor já vem como entrada única multi-round. buildDisplayList só
      // agruparia se houvesse padrões "Dia 1/Dia 2" no nome (não é o caso).
      // Torneios manuais (PJA exclusivos, Santo da Serra juniores) são agora
      // lidos no loader principal via pull-torneios003.json — incluídos em
      // `tournaments` e `displayList` naturalmente, aparecendo em todas as tabs
      // (Torneios, Ranking PJA, Draw) tal como o Nacional sintético.
      setPjaExtraTournaments([...drive, ...aq]);
      setPjaMembers(members);
      setPjaPdfSnapshot(pdfSnap);
    });
    return () => { alive = false; };
  }, [navMode, pjaExtraTournaments.length]);

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

    // Carregar também admissions+draws em paralelo para enriquecer torneios
    // Clubes (permite mostrar pairings/tee times na UI). Alinhado com loader
    // Jovens que já faz isto.
    Promise.all([
      ...CLUBES_FILES.map(async ({ url, escFallback, year }) => {
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
      }),
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admDrawsFile = all[all.length - 1] as Awaited<ReturnType<typeof loadFpgAdmissionsDraws>> | null;
      const admDrawsIdx = admDrawsFile ? indexFpgAdmissionsDraws(admDrawsFile) : new Map<string, FpgTournamentData>();
      const results = all.slice(0, -1) as any[];
      // Deduplicar por tcode — se o ficheiro D1 e o combined 2026 tiverem o mesmo torneio, fica o combined
      const seen = new Map<string, Tournament>();
      for (const t of results.flat()) {
        const key = (t as any).tcode;
        const existing = seen.get(key);
        // Preferir o combined (escFallback null) sobre D1 (escFallback não null)
        if (!existing || (existing as any)._sourceFile?.includes("D1")) {
          // Enriquecer com admissions/draws do fpg-admissions-draws.json se houver match
          const idxKey = `${t.ccode}-${(t as any).tcode}`;
          const ad = admDrawsIdx.get(idxKey);
          if (ad) {
            (t as any)._admissions = ad.admissions;
            (t as any)._draws = ad.draws;
          }
          seen.set(key, t as Tournament);
        }
      }
      setClubesTournaments([...seen.values()] as Tournament[]);
      setClubesLoaded(true);
      setClubesLoading(false);
    });
    return () => { alive = false; };
  }, [navMode, seriesFilter, clubesLoaded]);

  // ── Loader Jovens (arranca automaticamente no mount, para aparecerem em "Todos") ──
  useEffect(() => {
    if (jovensLoaded) return;
    let alive = true;
    setJovensLoading(true);
    const JOVENS_FILES = [
      { url: "/data/jovens_2026.json", year: "2026" },
      { url: "/data/jovens_2025.json", year: "2025" },
      { url: "/data/jovens_2024.json", year: "2024" },
      { url: "/data/jovens_2023.json", year: "2023" },
      { url: "/data/jovens_2022.json", year: "2022" },
      { url: "/data/jovens_2020.json", year: "2020" },
      { url: "/data/jovens_2019.json", year: "2019" },
    ];
    const jovensMetaLocal: DataSource[] = [];
    Promise.all([
      ...JOVENS_FILES.map(async ({ url, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) {
            jovensMetaLocal.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
            return [];
          }
          const d: DriveData = await r.json();
          const rows = (d.tournaments || []).map(t => ({
            ...t, _jovensYear: year, _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
          jovensMetaLocal.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
          return rows;
        } catch (e) {
          jovensMetaLocal.push({ path: url, status: "error", error: String(e), group: "jovens" });
          return [];
        }
      }),
      // Carrega também admissions + draws (107 torneios) para enriquecer existentes
      // e injectar sinteticamente os 10 Nacional 2026 (que ainda não estão em jovens_2026).
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admLoaded = all[all.length - 1];
      setAdmissionsMeta([{
        path: "/data/fpg-admissions-draws.json",
        status: admLoaded ? "loaded" : "error",
        count: admLoaded ? (admLoaded.tournaments?.length || 0) : undefined,
        source: (admLoaded as any)?.source,
        lastUpdated: (admLoaded as any)?.scrapedAt,
        group: "admissions",
      }]);
      setJovensMeta(jovensMetaLocal);
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
  }, [jovensLoaded]);

  // Match do filtro de pesquisa por nome/campo/clube (normalizado, case+accent insensitive)
  // Declarado ANTES dos useMemo que o consomem (ordem importante no JS — temporal dead zone).
  const searchTerm = searchQuery.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const matchesSearch = (t: Tournament): boolean => {
    if (!searchTerm) return true;
    const fields = [t.name, t.campo, (t as any).clube, t.tcode, t.ccode]
      .map(v => String(v ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
    return fields.some(f => f.includes(searchTerm));
  };

  // Lista filtrada por escalão dentro de Clubes, agrupada por ano
  const clubesList = useMemo(
    () => clubesTournaments
      .filter(t => !filterManuel || t.players.some(p => isManuel(p)))
      .filter(t => !yearFilter || ((t as any)._clubesYear ?? t.date?.substring(0, 4)) === yearFilter)
      .filter(t => matchesSearch(t))
      .sort((a, b) => {
        const yCmp = ((b as any)._clubesYear ?? "").localeCompare((a as any)._clubesYear ?? "");
        if (yCmp !== 0) return yCmp;
        return ((a as any)._clubesEsc ?? "").localeCompare((b as any)._clubesEsc ?? "");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubesTournaments, filterManuel, yearFilter, searchTerm]
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
    // Input do tab JOVENS:
    //   1. jovensTournaments — Nacionais Jovens + sintéticos 2026 Aroeira
    //   2. Torneios com "Junior" no nome de outras fontes (Vila Sol Junior,
    //      GJG Junior Classics, ESTORIL Junior Open, Academia Junior, etc.) —
    //      têm pill JUNIOR na sidebar e faz sentido também aparecerem aqui
    //      já que são competições juvenis, mesmo que de clubes não-FPG.
    //      PJA e Greatgolf já têm os seus tabs próprios — excluídos por
    //      terem pill PJA em vez de pill JUNIOR genérica.
    const jovensKeys = new Set(
      jovensTournaments.map(j => (j.ccode || "") + "/" + String(j.tcode || ""))
    );
    const juniorExtras = tournaments.filter(t => {
      if (!/\bjunior\b/i.test(t.name || "")) return false;
      if (/PJA/i.test(t.name || "")) return false;                // já em tab PJA
      if (/greatgolf.*junior/i.test(t.name || "")) return false;  // já em tab PJA (excepção)
      const k = (t.ccode || "") + "/" + String(t.tcode || "");
      return !jovensKeys.has(k);
    });
    const combined = [...jovensTournaments, ...juniorExtras];

    // Para torneios pré-jogo o Manuel só aparece em _admissions.players ou
    // _draws.*.groups.*.players. `tournamentHasManuel` cobre todos os sítios.
    const filtered = combined
      .filter(t => !filterManuel || tournamentHasManuel(t))
      .filter(t => !yearFilter || ((t as any)._jovensYear ?? t.date?.substring(0, 4)) === yearFilter)
      .filter(t => matchesSearch(t));
    return buildJovensGroups(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jovensTournaments, tournaments, filterManuel, yearFilter, searchTerm]);

  const jovensByYear = useMemo(() => {
    const m: Record<string, JovensGroup[]> = {};
    for (const g of jovensGroups) {
      if (!m[g.year]) m[g.year] = [];
      m[g.year].push(g);
    }
    return m;
  }, [jovensGroups]);
  const jovensYears = useMemo(() => Object.keys(jovensByYear).sort().reverse(), [jovensByYear]);
  // Quando jovensGroupKey é null (estado inicial em /FPG/jovens, sem deep-link)
  // NÃO fazer fallback para jovensGroups[0]. Senão o auto-select escolhe sempre
  // o grupo mais futuro (Nacional 2026-05-01 > Regional 2026-04-17), faz
  // state→URL navegar para essa URL, e o utilizador é "atirado" para o Nacional
  // ao abrir Jovens. Com null, render mostra "Selecciona um torneio" e a URL
  // fica /FPG/jovens limpa até o utilizador escolher.
  const curJovensGroup = jovensGroupKey
    ? (jovensGroups.find(g => g.key === jovensGroupKey) ?? null)
    : null;
  const curJovens = curJovensGroup?.entries[jovensEscIdx] ?? curJovensGroup?.entries[0] ?? null;

  // Anti-loop: quando URL→state ou escIdx-sync aplicam actualizações de estado,
  // levantam este flag para que o state→URL a seguir SALTE uma navegação. Sem
  // isto o state→URL pode disparar com estado "stale" (old groupKey/escIdx)
  // enquanto URL→state ainda está a sincronizar, e navegar para URL errada,
  // criando ping-pong entre dois torneios. Ver logs do 2026-04-19.
  const skipNextStateUrlRef = useRef(false);

  /** Lista unificada que alimenta o tab "Todos":
   *  - tournaments (pull-torneios + clubes merged no loader principal)
   *  - jovensTournaments (jovens_YYYY.json + Nacional 2026 sintético) — dedup por ccode/tcode
   *  Clubes (seriesFilter === "clubes") mantém sidebar própria, mas também fazem parte de `tournaments`. */
  const displayList = useMemo(() => {
    const base: Tournament[] = [...tournaments];
    const seen = new Set<string>(base.map(t => (t.ccode || "?") + "/" + String(t.tcode ?? "?")));
    for (const j of jovensTournaments) {
      const k = (j.ccode || "?") + "/" + String(j.tcode ?? "?");
      if (seen.has(k)) continue;
      seen.add(k);
      base.push(j);
    }
    // Drive Tour + Aquapor NÃO entram aqui — esses torneios estão na DrivePage
    // e os deep-links usam /drive/torneio/{ccode}-{tcode} (não /FPG/torneio/...).
    // pjaExtraTournaments só é usado internamente pelo Ranking PJA.
    return buildDisplayList(base);
  }, [tournaments, jovensTournaments]);
  const cur = displayList[selected];

  // ── Deep-link: sync URL (:tkey) → estado ────────────────────────────────
  // Ao carregar com `/FPG/torneio/{ccode}-{tcode}` (ou ao navegar para uma URL
  // desse formato), procurar o torneio em displayList E em jovensTournaments
  // e fazer DUAS actualizações em paralelo:
  //   - se estiver em displayList → setSelected (alimenta `cur` para vistas
  //     "Todos"/"Circuito"/"Santo")
  //   - se estiver em jovensTournaments → setSeriesFilter("jovens") +
  //     setJovensGroupKey (alimenta `curJovens` para a vista "Jovens")
  //
  // ⚠ Bug anterior: fazia early-return depois do setSelected, deixando
  // jovensGroupKey por sincronizar. Como displayList contém os torneios de
  // jovens (fundidos no `displayList` useMemo), o early-return triggava SEMPRE
  // para deep-links de jovens, e o jovensGroupKey ficava preso ao default
  // (null → fallback para jovensGroups[0] → Nacional 2026-05-01) mesmo com a
  // URL a apontar para outro torneio (ex: Regional 007-11010). O state→URL
  // depois reverteia a URL para o do default, criando o "loop" Nacional↔Regional.
  useEffect(() => {
    if (!urlTkey || displayList.length === 0) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    const matchesT = (t: Tournament) =>
      t.ccode === ccode && (
        t.tcode === tcode ||
        // Torneios sintéticos (multi-dia) guardam tcode como "10935+10936" — match contém
        (t.tcode || "").split("+").includes(tcode)
      );
    const idx = displayList.findIndex(matchesT);
    if (import.meta.env.DEV) console.log("[URL→state]", { urlTkey, idx, selected, seriesFilter, jovensGroupKey, jovensEscIdx });

    let anyUpdate = false;
    if (idx >= 0 && idx !== selected) { setSelected(idx); anyUpdate = true; }

    // Se também é um torneio de Jovens E o utilizador JÁ ESTÁ na vista Jovens,
    // sincronizar o grupo seleccionado para refrescar os tabs de escalão.
    //
    // ⚠ NÃO forçar setSeriesFilter("jovens") aqui — antes fazia-se e causava
    // um bug: clicar num torneio Nacional Jovens a partir do tab "Todos"
    // arrastava o utilizador de volta para o tab "Jovens". O "Todos" já
    // mostra os mesmos torneios com escalão-tabs no detalhe, por isso não
    // há razão para mudar de tab. Para deep-links externos (`/FPG/torneio/...`)
    // o utilizador fica em Todos por default, o que é aceitável.
    //
    // ⚠ NÃO pôr jovensGroups em deps — quando jovensGroups muda referência
    // (ex: toggle filterManuel), URL→state re-fire-ava e competia com
    // state→URL, causando loops entre torneios. O sync de jovensEscIdx é
    // deixado ao useEffect dedicado abaixo.
    const jovT = jovensTournaments.find(matchesT);
    if (jovT && seriesFilter === "jovens") {
      // Usar `entries.some(...)` em vez de construir a key: as keys agora
      // incluem um discriminator (tcode) para suportar Phase 3 Jaccard split.
      const grp = jovensGroups.find(g => g.entries.some(e => e.ccode === jovT.ccode && e.tcode === jovT.tcode));
      if (grp && jovensGroupKey !== grp.key) { setJovensGroupKey(grp.key); anyUpdate = true; }
      if (jovensShowInscricoes) { setJovensShowInscricoes(false); anyUpdate = true; }
      // Se o torneio pedido pela URL é histórico/sem Manuel, o filtro
      // filterManuel (default=true) escondê-lo-ia da sidebar e da view.
      // Auto-desactiva para que o deep-link funcione sempre.
      const tHasManuel = tournamentHasManuel(jovT);
      if (filterManuel && !tHasManuel) { setFilterManuel(false); anyUpdate = true; }
    }

    // Se actualizámos alguma coisa, sinalizar ao state→URL para não navegar
    // no próximo ciclo (URL é a fonte de verdade; estado está-se a alinhar).
    if (anyUpdate) skipNextStateUrlRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, displayList, jovensTournaments]);

  // ── Sync jovensEscIdx com o tcode exacto pedido na URL ──
  // Quando urlTkey aponta para um torneio de Jovens numa posição do grupo
  // diferente de entries[0] (ex: /FPG/torneio/007-11011 = Sub 14/24, posição 1),
  // sincroniza jovensEscIdx. Separado do effect principal para evitar que deps
  // de jovensGroups causem loops (ver comentário acima).
  useEffect(() => {
    if (!urlTkey || !jovensGroupKey) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const curGroup = jovensGroups.find(g => g.key === jovensGroupKey);
    if (!curGroup) return;
    const escIdx = curGroup.entries.findIndex(
      e => e.ccode === parsed.ccode && e.tcode === parsed.tcode
    );
    if (escIdx >= 0 && escIdx !== jovensEscIdx) {
      setJovensEscIdx(escIdx);
      // Guarda anti-loop: a alteração de escIdx é consequência da URL, não
      // uma decisão nova do utilizador — o state→URL não deve reagir.
      skipNextStateUrlRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, jovensGroupKey, jovensGroups]);

  // ── Deep-link: sync estado (torneio seleccionado) → URL ────────────────
  // Quando o utilizador clica num torneio na sidebar, actualizar a URL para
  // reflectir a selecção (`/FPG/torneio/{ccode}-{tcode}` com `replace: true`
  // para não poluir o histórico do browser).
  //
  // IMPORTANTE: deps=[cur, curJovens] APENAS. Não incluir `seriesFilter` nem
  // `jovensShowInscricoes` — se incluídos, clicar num tab (ex: "SSerra" →
  // navega para `/FPG/sto`) dispara este effect e sobrepõe a URL com
  // `/FPG/torneio/...` (o `cur` do displayList não muda com troca de tab).
  // O effect apenas deve disparar quando o TORNEIO muda de facto.
  //
  // Skip explícito (lido via closure, não por deps):
  //   - Painel de inscrições (`jovensShowInscricoes`) — URL dedicada
  //   - Vista Clubes — a URL `/FPG/clubes` não conflita e a selecção é local
  //
  // Não há loop: o useEffect URL→estado acima só muda `selected` se
  // `idx !== selected`, por isso navegar para a URL actual é no-op.
  useEffect(() => {
    if (jovensShowInscricoes) return;
    if (jovensShowAnalise) return;
    if (seriesFilter === "clubes") return;
    // Nas tabs Ranking PJA / Ranking Sub-12 a selecção de torneio não é visível
    // e a URL deve manter-se em /FPG/rankingPJA ou /FPG/rankingSub12. Guarda
    // dupla:
    //  (a) navMode actual (o tab pickado no state)
    //  (b) urlSeg actual (a URL pode já estar numa rota de ranking mesmo antes
    //      do URL→state effect ter sincronizado o navMode — ex: load inicial
    //      em /FPG/rankingPJA)
    // Sem esta guarda, cada mudança em `cur` (que acontece quando o displayList
    // carrega) sobrescreve a URL para /FPG/torneio/... e empurra o utilizador
    // para fora do ranking.
    if (navMode !== "torneios") return;
    // urlSeg é sempre lowercase (.toLowerCase() em params.filter) — comparar em lowercase.
    if (urlSeg === "rankingpja" || urlSeg === "rankingsub12") return;
    // Guarda anti-loop: se URL→state ou escIdx-sync acabaram de actualizar
    // estado, esse estado pode ainda não reflectir TUDO (ex: escIdx actualizado
    // mas groupKey acabou de mudar e entries[escIdx] aponta noutro lado). Saltar
    // esta execução — próximo render terá estado consistente e a URL coincidirá.
    if (skipNextStateUrlRef.current) {
      skipNextStateUrlRef.current = false;
      if (import.meta.env.DEV) console.log("[state→URL] SKIPPED (URL→state in flight)");
      return;
    }
    const t: Tournament | null =
      seriesFilter === "jovens" ? curJovens : cur;
    if (!t || !t.ccode || !t.tcode) return;
    const target = tournamentUrl("FPG", t.ccode, t.tcode);
    // Guarda anti-race: se o URL actual já é `/FPG/torneio/{tkey}` E esse
    // tkey NÃO corresponde ao `cur`, significa que URL→state ainda não
    // encontrou o torneio no displayList (provavelmente pjaExtraTournaments
    // ou jovensTournaments ainda não carregou). NÃO navegar — ficaria preso
    // a redireccionar para o displayList[0] e o deep-link perder-se-ia.
    // Aceitar também tcode sintético "A+B" quando o params.tkey é "A".
    if (params.tkey) {
      const parsed = parseTournKey(params.tkey);
      if (parsed) {
        const curCcode = t.ccode || "";
        const curTcodes = String(t.tcode || "").split("+");
        const matches = curCcode === parsed.ccode && (curTcodes.includes(parsed.tcode) || String(t.tcode) === parsed.tcode);
        if (!matches) {
          if (import.meta.env.DEV) console.log("[state→URL] SKIPPED — urlTkey", params.tkey, "não bate com cur", `${curCcode}-${t.tcode}`, "(aguardar URL→state)");
          return;
        }
      }
    }
    if (import.meta.env.DEV) console.log("[state→URL]", { from: location.pathname, target, seriesFilter, source: seriesFilter === "jovens" ? "curJovens" : "cur", tcode: t.tcode });
    if (target && location.pathname !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, curJovens, navMode]);

  /** Lista de torneios indexados pelo seu ficheiro de origem — alimenta o
   *  popover do clique-direito no FileBadge. Inclui clubes e jovens (que têm
   *  _sourceFile próprio) além dos pull-torneios. */
  const providerTournaments = useMemo(() => {
    const base = [...tournaments, ...jovensTournaments];
    return base.map(t => ({
      _sourceFile: (t as any)._sourceFile,
      name: t.name,
      date: t.date,
      tcode: t.tcode,
      ccode: t.ccode,
    }));
  }, [tournaments, jovensTournaments]);

  /** Lista de todos os ficheiros lidos pela página — alimenta o DataSourcesChip. */
  const allSources = useMemo<DataSource[]>(() => {
    const main: DataSource[] = fileMeta.map(m => ({
      path: m.file,
      status: "loaded",
      count: m.count,
      source: m.source,
      lastUpdated: m.lastUpdated,
      group: "main",
    }));
    return [...main, ...clubesMeta, ...jovensMeta, ...admissionsMeta];
  }, [fileMeta, clubesMeta, jovensMeta, admissionsMeta]);

  // Anos disponíveis no modo Torneios
  const availYears = useMemo(() => {
    const s = new Set<string>();
    for (const t of displayList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [displayList]);
  const activeYear = yearFilter ?? null;
  const inYear = (t: Tournament) => !activeYear || (t.date || "").startsWith(activeYear);

  // Event-groups globais — os mesmos torneios agrupados por (date+ccode) com
  // nome simplificado e split por Jaccard<0.5. Usado pelos tabs "Todos",
  // "Santo" e "PJA" para mostrar 1 linha por evento físico (não 1 por tcode).
  const allEventGroups = useMemo(
    () => buildEventGroups(displayList),
    [displayList]
  );

  /** Map rápido (ccode/tcode) → EventGroup que o contém. Permite descobrir o
   *  grupo do `cur` activo em O(1) para renderizar os tabs de escalão. */
  const eventGroupByKey = useMemo(() => {
    const m = new Map<string, EventGroup>();
    for (const g of allEventGroups) {
      for (const e of g.entries) {
        m.set((e.ccode || "?") + "/" + String(e.tcode ?? "?"), g);
      }
    }
    return m;
  }, [allEventGroups]);

  // Agrupamento por mês — todos os torneios (pull + clubes + jovens) — alimenta o tab "Todos"
  const { groups: monthGroups, groupKeys: monthKeys } = useMemo(() => {
    const g: Record<string, EventGroup[]> = {};
    for (const eg of allEventGroups) {
      if (!eg.entries.some(inYear)) continue;
      // Usa tournamentHasManuel para também cobrir _admissions.players e _draws
      // (torneios pré-jogo onde a inscrição existe mas players[] ainda é vazio).
      if (filterManuel && !eg.entries.some(e => tournamentHasManuel(e))) continue;
      if (!eg.entries.some(matchesSearch)) continue;
      const key = eg.date ? eg.date.substring(0, 7) : "?";
      if (!g[key]) g[key] = [];
      g[key].push(eg);
    }
    return { groups: g, groupKeys: Object.keys(g).sort().reverse() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEventGroups, filterManuel, activeYear, searchTerm]);

  // Lista PJA (modo circuito) — apenas torneios com "PJA" no nome ou
  // registados em TOURN_PILLS como PJA. Exclui SSerra (tab próprio).
  //
  // Excepção: "Greatgolf Junior Open" não tem "PJA" no nome mas é considerado
  // parte do circuito PJA pela Mariana — incluído explicitamente.
  const pjaList = useMemo(
    () => displayList.filter(t => {
      if (t.ccode === SSERRA_CCODE) return false;  // SSerra tem tab próprio
      if (/PJA/i.test(t.name)) return true;
      if (/greatgolf.*junior/i.test(t.name)) return true;
      const tcodes = t.tcode?.split("+") || [];
      return tcodes.some(tc => TOURN_PILLS[tc] === "PJA");
    }),
    [displayList]
  );

  // Lista EXPANDIDA para o Ranking PJA — a partir de 2026 o ranking inclui,
  // além dos torneios exclusivos PJA, os torneios Drive Tour (FPG), Aquapor
  // (2 primeiros do ano) e Greatgolf Junior Open. Para anos anteriores,
  // mantém o comportamento antigo (só torneios PJA exclusivos).
  // A classificação do tipo e aplicação das regras (GG só R2+R3, Aquapor só
  // para quem não jogou DT, etc.) é feita dentro de PJARankingView.
  const pjaRankingList = useMemo(
    () => {
      const isPJA = (t: Tournament) => {
        // Torneios manuais marcados explicitamente como PJA
        if ((t as any)._manual && (t as any)._origin === "PJA") return true;
        if (t.ccode === SSERRA_CCODE) return false;
        const year = (t.date || "").slice(0, 4);
        const name = t.name || "";
        if (/PJA/i.test(name)) return true;
        const tcodes = t.tcode?.split("+") || [];
        if (tcodes.some(tc => TOURN_PILLS[tc] === "PJA")) return true;
        if (year >= "2026") {
          if (/greatgolf.*junior/i.test(name)) return true;
          if (/Drive\s+Tour/i.test(name) && !/Challenge/i.test(name)) return true;
          if (/Circuito\s+Aquapor/i.test(name)) return true;
        }
        return false;
      };
      // Combinar displayList (pull-torneios) + drive/aquapor mensais,
      // deduplicando por tcode+ccode+date.
      const out: Tournament[] = displayList.filter(isPJA);
      const seen = new Set(out.map(t => `${t.ccode || "?"}/${t.tcode ?? "?"}/${t.date || "?"}`));
      for (const t of pjaExtraTournaments) {
        if (!isPJA(t)) continue;
        const k = `${t.ccode || "?"}/${t.tcode ?? "?"}/${t.date || "?"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    },
    [displayList, pjaExtraTournaments]
  );

  const pjaEventGroups = useMemo(() => buildEventGroups(pjaList), [pjaList]);

  const pjaByYear = useMemo(() => {
    const byYear: Record<string, EventGroup[]> = {};
    for (const eg of pjaEventGroups) {
      if (!eg.entries.some(inYear)) continue;
      // Usa tournamentHasManuel para também cobrir _admissions.players e _draws
      // (torneios pré-jogo onde a inscrição existe mas players[] ainda é vazio).
      if (filterManuel && !eg.entries.some(e => tournamentHasManuel(e))) continue;
      if (!eg.entries.some(matchesSearch)) continue;
      const yr = eg.date ? eg.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(eg);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pjaEventGroups, activeYear, filterManuel, searchTerm]);

  // ── Santo da Serra ──
  const santoList = useMemo(
    () => displayList.filter(t => t.ccode === SSERRA_CCODE),
    [displayList]
  );
  const santoEventGroups = useMemo(() => buildEventGroups(santoList), [santoList]);

  const santoByYear = useMemo(() => {
    const byYear: Record<string, EventGroup[]> = {};
    for (const eg of santoEventGroups) {
      if (!eg.entries.some(inYear)) continue;
      // Usa tournamentHasManuel para também cobrir _admissions.players e _draws
      // (torneios pré-jogo onde a inscrição existe mas players[] ainda é vazio).
      if (filterManuel && !eg.entries.some(e => tournamentHasManuel(e))) continue;
      if (!eg.entries.some(matchesSearch)) continue;
      const yr = eg.date ? eg.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(eg);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [santoEventGroups, activeYear, filterManuel, searchTerm]);

  /** Encontra o índice de um torneio em displayList por (ccode, tcode) — NÃO
   *  por referência, porque buildEventGroups pode embrulhar entradas em novos
   *  objectos para injectar o escalão inferido (quebra a igualdade `===`). */
  const findInDisplayList = (t: Tournament): number =>
    displayList.findIndex(d => d.ccode === t.ccode && d.tcode === t.tcode);

  /** Renderiza item de sidebar para uma EventGroup.
   *  - Singleton (entries.length === 1): comportamento idêntico ao anterior.
   *  - Grupo (entries.length > 1): nome simplificado + pill "N escalões" +
   *    pills agregados de todas as entradas; clique vai à entrada activa
   *    se `cur` já pertence ao grupo, senão vai à primeira entrada. */
  function renderSidebarItem(g: EventGroup) {
    const isMulti = g.entries.length > 1;
    // Entrada activa dentro do grupo (ou a primeira, se nenhuma está activa).
    const activeEntryIdx = cur
      ? g.entries.findIndex(e => e.ccode === cur.ccode && e.tcode === cur.tcode)
      : -1;
    const activeEntry = activeEntryIdx >= 0 ? g.entries[activeEntryIdx] : g.entries[0];
    const idx = findInDisplayList(activeEntry);
    const isActive = activeEntryIdx >= 0 && selected === idx;

    const handleClick = () => {
      if (idx >= 0) setSelected(idx);
      md.onSelect();
    };

    // Pill dinâmico (REGIONAL, NACIONAL, etc.) agregando todos os tcodes do grupo.
    const allTcodes = g.entries.flatMap(e => (e.tcode || "").split("+"));
    const pillVal = allTcodes.map(tc => TOURN_PILLS[tc] || tcodePills?.[tc]).find(Boolean);

    // Contagem de escalões (só se houver mais que 1 entrada).
    const counterPill = isMulti ? (
      <span className="p p-sm p-muted" title={g.entries.map(e => e.escalao || "?").join(" · ")}>
        {g.entries.length} esc.
      </span>
    ) : null;
    const tournPill = pillVal && pillVal !== "PJA" && pillVal !== "SSERRA"
      ? <span className={`p p-sm p-tourn p-${pillVal.toLowerCase()}`}>{pillVal}</span>
      : null;
    const extraPills = (counterPill || tournPill) ? <>{counterPill}{tournPill}</> : null;

    // Número de jogadores: quando grupo, soma distinct por jogador (um player
    // pode aparecer em múltiplos escalões se o organizador o listou assim —
    // raro). Simples e suficiente: somar playerCount de cada entrada.
    const nJog = isMulti
      ? g.entries.reduce((s, e) => s + (e.playerCount || e.players.filter(p => !isDNS(p)).length), 0)
      : (activeEntry.playerCount || activeEntry.players.filter(p => !isDNS(p)).length);

    // Nome a mostrar: simplificado se grupo; original se singleton (preserva
    // aspectos como "R1/R2/Total" em torneios multi-ronda sintéticos).
    const displayName = isMulti ? g.name : (activeEntry.name || g.name);

    // tcode "combinado" para a chave React — apenas para diferenciar elementos.
    const keyTcodes = g.entries.map(e => e.tcode).join("+");

    const tData: SidebarItemTournament = {
      ...(activeEntry as any),
      name: displayName,
      // Escalão: só mostrar no pill quando é singleton; em grupo o escalão
      // varia por entrada → não cabe num pill único.
      escalao: isMulti ? null : activeEntry.escalao,
      playerCount: nJog,
      pill: pillVal,
      _manuelInscrito: g.entries.some(tournamentHasManuel),
    };
    // Deep-link canónico — o TournSidebarItem vira <a href>. Para sintéticos
    // com tcode "A+B" usa o primeiro tcode no URL (parseTournKey match ambos).
    const firstTcode = (activeEntry.tcode || "").split("+")[0];
    const href = (activeEntry.ccode && firstTcode) ? tournamentUrl("FPG", activeEntry.ccode, firstTcode) : undefined;
    return (
      <TournSidebarItem
        key={(activeEntry._isSynthetic ? "synth_" : "") + keyTcodes + "_" + g.date}
        t={tData}
        isActive={isActive}
        onClick={handleClick}
        extraPills={extraPills}
        href={href}
      />
    );
  }

  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="tourn-layout">

      {/* ── Toolbar mobile-first: scroll horizontal em vez de grid ── */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>

        {/* Linha 1: toda numa linha scrollável */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          {!loading && (<>
            <ToolbarSep />
            {/* Search unificado — mesmo local e tamanho em todos os modos.
                Filtra torneios em modo Torneios, jogadores em modo Ranking PJA,
                etc. O valor é partilhado (searchQuery). */}
            <div style={{ flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center" }}>
              <span aria-hidden="true" style={{
                position: "absolute", left: 8, fontSize: 11, color: "var(--text-muted)", pointerEvents: "none",
              }}>🔎</span>
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  navMode === "ranking-pja" ? "jogador ou clube..."
                    : navMode === "ranking-sub12" ? "jogador..."
                    : "nome, campo, clube..."
                }
                aria-label="Pesquisar"
                style={{
                  fontSize: 12,
                  padding: "4px 22px 4px 24px",
                  width: 200,
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "var(--bg-card)",
                  color: "var(--text)",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: 2,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", fontSize: 14, padding: "0 4px",
                    lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          </>)}
          {!loading && (<>
            <ToolbarSep />
            {([
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-pja",   label: "📊 Ranking PJA" },
              { key: "ranking-sub12", label: "🏅 Ranking Sub-12" },
            ] as const).map(({ key, label }) => (
              <button key={key}
                className={"tourn-tab tourn-tab-sm" + (navMode === key ? " active" : " tourn-tab-muted")}
                onClick={() => {
                  setNavMode(key);
                  setSeriesFilter("");
                  setYearFilter(null);
                  const seg = NAV_TO_URL[key];
                  const target = seg ? `/FPG/${seg}` : "/FPG";
                  if (location.pathname !== target) navigate(target);
                }}
                style={{ flexShrink: 0 }}>
                {label}
              </button>
            ))}
            {/* Slot de portal: o PJARankingView renderiza os seus filtros
                (years, search, escalões) aqui via createPortal em vez de ter
                uma toolbar separada. */}
            {navMode === "ranking-pja" && <>
              <ToolbarSep />
              <div id="pja-toolbar-slot" style={{ display: "contents" }} />
            </>}
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
            <ExtLink href="https://scoring.datagolf.pt/pt/tournaments.aspx"
              className="fs-11 fw-600"
              style={{ flexShrink: 0, cursor: "pointer", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 8px", lineHeight: 1.6, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>
              FPG Torneios ↗
            </ExtLink>
            {loading
              ? <span className="muted fs-11 shrink-0"  style={{ fontStyle: "italic" }}>{loadingMsg}</span>
              : <>
                  {navMode === "torneios" && (() => {
                    const count = seriesFilter === "santo"   ? santoByYear.years.reduce((s, y) => s + (santoByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "circuit" ? pjaByYear.years.reduce((s, y) => s + (pjaByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "clubes"  ? clubesList.length
                                : seriesFilter === "jovens"  ? jovensGroups.length
                                : monthKeys.reduce((s, k) => s + (monthGroups[k]?.length ?? 0), 0);  // "Todos" respeita search + year + manuel
                    return <span className="chip shrink-0" title={searchTerm ? `Com filtro "${searchQuery}"` : undefined}>
                      {count} torneio{count !== 1 ? "s" : ""}{searchTerm ? " ✓" : ""}
                    </span>;
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
            <LoadingState size="sm" message="A carregar…" />
          )}

          {seriesFilter === ""
            ? monthKeys.map(gk => (
                <React.Fragment key={gk}>
                  <div className="sidebar-section-title-dark">{monthLabel(gk)}</div>
                  {monthGroups[gk].map(eg => renderSidebarItem(eg))}
                </React.Fragment>
              ))
            : seriesFilter === "santo"
              ? santoByYear.years.length === 0
                ? <div className="muted fs-11 u-pad-italic">Sem torneios Santo da Serra</div>
                : santoByYear.years.map(yr => {
                    const items = santoByYear.byYear[yr];  // já filtrado no useMemo
                    if (items.length === 0) return null;
                    return (
                      <React.Fragment key={yr}>
                        <div className="sidebar-section-title-dark">⛳ Santo da Serra {yr}</div>
                        {items.map(eg => renderSidebarItem(eg))}
                      </React.Fragment>
                    );
                  })
              : pjaByYear.years.length === 0
                ? <div className="muted fs-11 u-pad-italic">Sem torneios PJA</div>
                : pjaByYear.years.map(yr => (
                    <React.Fragment key={yr}>
                      <div className="sidebar-section-title-dark">🏆 {yr}</div>
                      {pjaByYear.byYear[yr].map(eg => renderSidebarItem(eg))}
                    </React.Fragment>
                  ))
          }
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {/* Deep-link em curso: URL tem /FPG/torneio/{tkey} mas `cur` ainda
              não corresponde (displayList incompleto — pull-torneios,
              pjaExtra, jovens estão a carregar). Mostra "A carregar..." em
              vez do torneio errado, evitando que o utilizador veja várias
              páginas diferentes a piscar até o match ser encontrado.
              Aceita tcode sintético "A+B" quando o URL pede apenas "A". */}
          {(() => {
            if (!params.tkey) return false;  // sem deep-link, não aplicar
            if (!cur) return true;  // deep-link mas sem cur ainda → loading
            const parsed = parseTournKey(params.tkey);
            if (!parsed) return false;
            const curTcodes = String(cur.tcode || "").split("+");
            const matches = cur.ccode === parsed.ccode && (curTcodes.includes(parsed.tcode) || String(cur.tcode) === parsed.tcode);
            return !matches;
          })()
            ? <div className="center-msg muted" style={{ padding: 40 }}>A carregar torneio {params.tkey}…</div>
            : cur
            ? (() => {
                const curGroup = eventGroupByKey.get((cur.ccode || "?") + "/" + String(cur.tcode ?? "?"));
                const showTabs = curGroup && curGroup.entries.length > 1;
                return (
                  <>
                    {showTabs && (
                      <div style={{ display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap",
                        borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
                        {curGroup!.entries.map((e) => {
                          const active = e.ccode === cur.ccode && e.tcode === cur.tcode;
                          const label = (e as any)._tabLabel
                            ?? e.escalao
                            ?? (e.name && e.name.length <= 20 ? e.name : "Esc");
                          const nJog = e.playerCount || e.players.length;
                          const entryIdx = findInDisplayList(e);
                          return (
                            <button key={e.tcode + "_" + e.date}
                              className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                              onClick={() => { if (entryIdx >= 0) setSelected(entryIdx); }}
                              style={{ marginBottom: 6 }}>
                              {label}
                              {nJog > 0 && (
                                <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>
                                  ({nJog} jog)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <TournamentDetail tournament={cur} escLookup={escLookup} playersDB={playersDB} />
                  </>
                );
              })()
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
            {clubesLoading && <LoadingState size="sm" message="A carregar…" />}
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
            {jovensLoading && <LoadingState size="sm" message="A carregar…" />}
            {jovensLoaded && jovensGroups.length === 0 && !jovensLoading && (
              <div className="muted fs-11 u-pad-italic">Ficheiro não encontrado (ainda)</div>
            )}
            {/* Entrada especial: Análise (landing/landing page) */}
            <a
              href="/FPG/jovens"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  setJovensShowAnalise(true);
                  setJovensShowInscricoes(false);
                  setJovensGroupKey(null);
                  md.onSelect();
                  if (location.pathname !== "/FPG/jovens") navigate("/FPG/jovens");
                }
              }}
              className={`course-item${jovensShowAnalise ? " active" : ""}`}
              style={{
                borderLeft: `4px solid ${SIDEBAR_ACCENT.tour}`, borderRadius: "0 6px 6px 0",
              }}
            >
              <div className="fw-700 fs-12">
                📊 Análise 4 anos
              </div>
              <div className="muted fs-11">Campeões Regional + Nacional · jogadores frequentes</div>
            </a>
            {/* Entrada especial: Inscrições */}
            <a
              href="/FPG/jovens/inscritosCN"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  setJovensShowInscricoes(true);
                  setJovensShowAnalise(false);
                  setJovensGroupKey(null);
                  md.onSelect();
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
                  // Manuel detection: procurar em TODAS as entries do grupo (o grupo
                  // pode ter Sub 10 e Sub 14 do mesmo Regional — Manuel está só numa).
                  const groupHasManuel = g.entries.some(e => tournamentHasManuel(e));
                  const sidebarT: SidebarItemTournament = {
                    ...(t0 as any),
                    name: g.name,
                    playerCount: totalJog,
                    escalao: null,
                    ccode: "",     // sem ClubePill automático
                    date: undefined,  // sem data automática
                    _manuelInscrito: groupHasManuel,
                  };
                  return (
                    <TournSidebarItem
                      key={g.key}
                      t={sidebarT}
                      isActive={jovensGroupKey === g.key}
                      onClick={() => {
                        setJovensGroupKey(g.key); setJovensEscIdx(0); setJovensShowInscricoes(false); setJovensShowAnalise(false); md.onSelect();
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
            {jovensShowAnalise ? (
              <JovensAnaliseView jovensTournaments={jovensTournaments} playersDB={playersDB} />
            ) : jovensShowInscricoes ? (
              <InscricoesPanel />
            ) : curJovensGroup ? (
              <>
                {/* Tabs por escalão — fundo com a cor do escalão (tokens --esc-subN-*).
                    Quando o grupo tem tanto M como F, border da cor do sexo (azul/rosa).
                    Se o grupo tem só um sexo, sem border (não é preciso distinguir). */}
                {curJovensGroup.entries.length > 1 && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap",
                    borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
                    {curJovensGroup.entries.map((e, ri) => {
                      const active = jovensEscIdx === ri;
                      // Estilo default (.tourn-tab / .active) — SEM cores do escalão
                      // (ver memória "Sem cores nos botões de escalão"). Os pills
                      // na sidebar continuam coloridos; só aqui nos botões é default.
                      // Label: _tabLabel (override p/ torneios combinados "Sub 10 e 12"
                      // ou "Sub 14 a 24") → escalao → fallback "Esc N".
                      const label = (e as any)._tabLabel ?? e.escalao ?? "Esc " + (ri + 1);
                      return (
                        <button key={e.tcode + "_" + ri}
                          className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                          onClick={() => setJovensEscIdx(ri)}
                          style={{ marginBottom: 6 }}>
                          {label}
                          <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>
                            ({(e.playerCount || e.players.length)} jog)
                          </span>
                        </button>
                      );
                    })}
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
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView pjaList={pjaRankingList} playersDB={playersDB} loading={loading} pjaMembersByYear={pjaMembers} pjaPdfSnapshotByYear={pjaPdfSnapshot} externalFilterName={searchQuery} />
        </div>
      )}
    </div>
    </DataSourcesProvider>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
