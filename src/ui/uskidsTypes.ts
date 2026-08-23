/**
 * uskidsTypes.ts — Type definitions for USKids page components
 *
 * Constants have been moved to uskidsConstants.ts for cleaner separation.
 * This module re-exports them for backward compatibility.
 */

// Re-export all constants from uskidsData.ts for backward compatibility
export {
  
  ESCALOES_DESTAQUE_USKIDS,
  
  
  
  
  sortEscaloes,
} from "./uskidsData";

// ─────────────────────────────────────────────
// TIPOS — CAMPO (inscritos)
// ─────────────────────────────────────────────
interface Jogador {
  nome: string;
  pais: string;
  cidade: string;
  firstSeen?: string;
  /** pid do signupanytime — auto-incremento global da tabela de inscrições. */
  pid?: number | null;
  /** Dia da inscrição: observado por nós ou estimado pelo pid (ver regObs). */
  regDia?: string;
  /** true = data observada; false = estimada por interpolação do pid. */
  regObs?: boolean;
}

interface PaisContagem {
  pais: string;
  n: number;
}

interface Desinscrito {
  nome: string;
  removedAt: string;      // ISO — data em que foi detetado como desinscrito
  pais?: string | null;
}

interface Escalao {
  age_group: number;
  nome: string;
  genero: string | null;
  holes: number;
  flight_id: number;
  inscritos: number;
  maximo: number;
  vagas: number;
  pct_cheio: number;
  jogadores: Jogador[] | null;
  paises: PaisContagem[] | null;
  removed?: Desinscrito[];
}

export interface Torneio {
  t: number;
  name: string;
  emoji?: string;
  date_inicio: string;
  date_fim?: string;
  rondas?: number;
  campo: string | null;
  fee_18?: string | null;
  total_inscritos: number;
  total_maximo: number;
  escaloes: Escalao[];
  ultima_atualizacao: string;
  sem_flights?: boolean;
  erro?: string;
  url_uskids?: string | null;
}

export interface FieldData {
  gerado_em: string;
  torneios: Torneio[];
}

interface GGEntry {
  pos: number | null;
  name: string;
  fed: string | null;
  club: string;
  toPar: number | null;
  gross: number | null;
  status: string;
}

export interface GreatgolfData {
  name: string;
  course: string;
  dates: string[];
  results: {
    d1: GGEntry[];
    sub14: GGEntry[];
    sub12: GGEntry[];
  };
}

// ─────────────────────────────────────────────
// TIPOS — RESULTADOS
// ─────────────────────────────────────────────
export interface RondaJogador {
  nome: string;
  pais: string;
  cidade: string;
  pontos: number;
  score: number;
  tee: string;
  to_par: number | null;
  buracos: number;
  start_time: string;
  grupo: number;
  strokes: number[];
  // legacy (estrutura antiga — manter compatibilidade)
  rondas?: Record<
    string,
    {
      strokes: number[];
      total: number;
      buracos: number;
      start_time: string;
      grupo: number;
    }
  >;
}

export interface RondaResult {
  ronda: number;
  par: number[];
  si: number[];
  metros?: number[];
  buracos: number;
  total_par: number | null;
  leaderboard: RondaJogador[];
  jogadores?: RondaJogador[];
}

export interface EscalaoResult {
  age_group: number;
  nome: string;
  holes: number;
  is_manuel: boolean;
  rondas: RondaResult[];
  campo?: string;
}

export interface TorneioResult {
  t: number;
  name: string;
  date_inicio: string;
  date_fim?: string;
  campo: string | null;
  rondas_total: number;
  escalao_manuel?: number;
  url_resultados?: string;
  escaloes: EscalaoResult[];
  ultima_atualizacao: string;
}

export interface ResultsData {
  gerado_em: string;
  resultados: TorneioResult[];
}

export interface TeeInfo {
  campo: string;
  tee: string;
  par: number[];
  metros: number[];
  /** Course Rating (opcional) — necessário para cálculo de SD (Score Differential).
   *  Quando ausente, a UI mostra "—" na coluna SD para este escalão. */
  cr?: number;
  /** Slope Rating (opcional, 55-155) — necessário para cálculo de SD.
   *  Quando ausente, a UI mostra "—" na coluna SD para este escalão. */
  slope?: number;
}

// ─────────────────────────────────────────────
// TIPOS — DRAWS (pairings/tee times pré-jogo)
// Gerado por scripts/fetch-uskids-draws.js
// Foco no Manuel + escalões adjacentes (±1 idade).
// ─────────────────────────────────────────────
interface UskidsDrawJogador {
  nome: string;
  pais: string;
  cidade: string;
}

interface UskidsDrawGrupo {
  group_number: number;
  tee_time: string;
  start_hole: number;
  course: string;
  jogadores: UskidsDrawJogador[];
}

export interface UskidsDrawRonda {
  ronda: number;
  grupos: UskidsDrawGrupo[];
}

interface UskidsDrawEscalao {
  age_group: number;
  nome: string;
  flight_id: number;
  is_manuel: boolean;
  adjacent: boolean;
  rondas: UskidsDrawRonda[];
}

interface UskidsDrawTorneio {
  t: number;
  name: string;
  date_inicio: string | null;
  date_fim: string | null;
  campo: string | null;
  rondas_total: number;
  escaloes: UskidsDrawEscalao[];
  ultima_atualizacao: string;
}

export interface UskidsDrawsData {
  gerado_em: string;
  manuel_focus: boolean;
  janela_dias_antes: number;
  torneios: UskidsDrawTorneio[];
}
