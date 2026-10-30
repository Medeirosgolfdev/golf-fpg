/**
 * types.ts — Formatos das fontes de Espanha (RFEGolf/mitarjeta, NextCaddy,
 * livegolfscoring, golfdirecto) e dos lookups por licença.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */

/* ── Types ──────────────────────────────────────────────── */

export interface RFEGIndexEntry {
  source: "rfegolf" | "nextcaddy" | "livegolfscoring" | "golfdirecto";
  id: number | string;
  compId?: number;
  tourId?: number;
  file: string;
  filePath: string;
  name: string;
  year: number | null;
  category: string | null;
  sex: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  dateStartIso: string | null;
  dateEndIso: string | null;
  course: string | null;
  courseClubId?: number | null;
  courseCode?: string | null;
  organizer?: string | null;
  format?: string | null;
  categories?: string[];
  mode?: string | null;
  style?: string | null;
  hcpLimitMen?: number | null;
  hcpLimitWomen?: number | null;
  counts: {
    admitidos: number;
    reservas: number;
    bajas: number;
    invitados: number;
    noAdmitidos: number;
    provisional: number;
  };
  leaderboardPlayers?: number;
  /** Número de rondas (LGS expõe; NC/RFEGolf ficam undefined). */
  nRounds?: number;
  /** Federação organizadora (RFEGolf detail meta.federation). */
  federation?: string | null;
  /** Pré-computados pelo build do índice (páginas lazy): há Manuel / portugueses? */
  hasManuel?: boolean;
  hasPt?: boolean;
  /** Fingerprint de roster (nomes normalizados, ordenados+únicos) gerado pelo
   *  build do índice. Permite confirmar "é o mesmo evento?" por JOGADORES no
   *  buildRfegEntries sem carregar as divisões. Vazio p/ torneios só-inscritos. */
  roster?: string[];
  /** Nº de buracos (dos dados ou do nome — build-rfegolf-index.js). Menos de
   *  18 = escalões muito novos (4/5/9 buracos): saem da /rfeg. */
  holes?: number;
  /** LGS por equipas: ficheiro da fase de match play (MatchplayFile), gerado
   *  pelo scrape-lgs-matchplay.js — ex. "lgs-matchplay/393.json". */
  matchplayFile?: string;
  scrapedAt: string | null;
}

export interface RFEGIndex {
  generatedAt: string;
  source?: string;
  total: number;
  totalCompetitions?: number;
  byYear: Record<string, number>;
  byCategory: Record<string, number>;
  bySource?: Record<string, number>;
  tournaments: RFEGIndexEntry[];
}

export interface RFEGPlayer {
  pos: number | null;
  name: string | null;
  licencia: string | null;
  pais: string | null;
  hcp: number | null;
  catEdad: string | null;
  sexo: string | null;
  club: string | null;
  dob: string | null;
  estado: string | null;
  rounds?: { round: number; gross: number | null; scores?: number[]; meters?: number[] | null }[];
  total?: number | null;
  toPar?: number | null;
  teeMeters?: number | null;   // distância total do tee deste jogador (rapazes/raparigas jogam tees distintos)
  courseHcp?: number | null;   // hándicap de campo (do "HcpJuego" NextCaddy) — deriva CR/Slope
}

export interface RFEGDetail {
  compId: number;
  ok: boolean;
  scrapedAt: string;
  meta: {
    name: string | null;
    dateStart: string | null;
    dateEnd: string | null;
    course: string | null;
    courseClubId: number | null;
    players: number | null;
    hcpLimitMen: number | null;
    hcpLimitWomen: number | null;
    mode: string | null;
    style: string | null;
    category: string | null;
    sex: string | null;
    federation: string | null;
    federationCatId: number | null;
  };
  /** Par real do campo (vem do JSON quando disponível — para NextCaddy é inferido
   *  a partir dos scores hole-by-hole, para RFEGolf vem como null; para mitarjeta
   *  vem do cartão do campo). */
  coursePar?: number[] | null;
  parConfidence?: "high" | "medium" | "low";
  /** mitarjeta.golf (Campeonatos de España juvenis ao vivo): id do torneo +
   *  SI/metros reais por buraco + draw R1. Quando presente, o conversor usado é
   *  mitarjetaToFPGTournament (scorecards hole-by-hole + HCP + idade). */
  mitarjetaTorneo?: number;
  _rfegCourseSi?: number[] | null;
  _rfegCourseMeters?: number[] | null;
  teeTimes?: { round: number; groups: Array<{ tee: number | string; time: string; players: string[] }> };
  /** Draw multi-ronda (mitarjeta): todas as rondas. R1 também vem em `teeTimes`
   *  (retro-compat). Populado por scrape-mitarjeta.js (segue os links de ronda). */
  teeTimesAll?: Array<{ round: number; groups: Array<{ tee: number | string; time: string; players: string[] }> }>;
  inscritos: {
    admitidos: RFEGPlayer[];
    reservas: RFEGPlayer[];
    bajas: RFEGPlayer[];
    invitados: RFEGPlayer[];
    noAdmitidos: RFEGPlayer[];
    provisional: RFEGPlayer[];
    counts: RFEGIndexEntry["counts"];
  };
  /** Leaderboards finais parseados a partir dos PDFs anexos em ListaResultados.aspx.
   *  Cada grupo tem categoria/sexo + array de jogadores com R1..Rn + total + ±par.
   *  Vazio quando a federação ainda não publicou PDFs (~65% dos torneios). */
  results?: Array<{
    label: string;
    sexo: string;
    categoria: string;
    pdfUrl: string;
    nRounds: number | null;
    courseRating: number | null;
    slope: number | null;
    // ── mitarjeta extras (cartão do campo) ──
    source?: string;
    parTotal?: number | null;
    metersTotal?: number | null;
    perHole?: Array<{ hole: number; par: number; si: number; meters: number }>;
    players: Array<{
      pos: number | null;
      name: string;
      toPar: number;
      hoy: number;
      rounds: number[];
      total: number;
      // ── mitarjeta enrichment (opcional) ──
      hcp?: number | null;
      dob?: string | null;
      licencia?: string | null;
      club?: string | null;
      catEdad?: string | null;
      sexo?: string | null;
      holeScores?: Record<string, number[]>; // round → strokes[18]
      startHole?: number | null;             // saída R1 (1 ou 10)
      region?: string | null;
    }>;
  }>;
}


/* ── NextCaddy adapter ─────────────────────────────────── */

export interface NCRoundScore {
  round: number;
  scores?: number[];
  total?: number | null;
  meters?: number[] | null;   // metros do TEE deste jogador (rapazes/raparigas jogam tees distintos)
}
export interface NCPlayer {
  pos?: number | null;
  name: string | null;
  licencia?: string | null;
  hcp?: number | null;
  nivel?: string | null;
  rounds?: { round: number; gross: number | null }[];
  /** Hándicap de juego (= de campo) por ronda, da coluna oculta "HcpJuego J{n}". */
  hcpJuego?: { round: number; ch: number | null }[];
  roundScores?: NCRoundScore[];
  total?: number | null;
  toPar?: number | null;
  inscribedId?: number | null;
}
export interface NCInsc {
  orden?: number | null;
  name: string | null;
  licencia?: string | null;
  hcp?: number | null;
  nivel?: string | null;
}
export interface NCHorario {
  round: number;
  players: Array<{
    time: string | null;
    tee: number | null;
    name: string;
    hcp: number | null;
    nivel?: string | null;
    ins?: string;
    jid?: string;
  }>;
}
export interface NCDetail {
  tourId: number;
  scrapedAt: string;
  meta: {
    name: string | null;
    course: string | null;
    courseCode?: string | null;
    organizer?: string | null;
    format?: string | null;
    categories?: string[];
    /** Data da listagem (scope da descoberta), injectada pelo scraper — "YYYY-MM-DD". */
    dateStart?: string | null;
  };
  /** Horarios (draw / tee times). Populado por scripts/scrape-nextcaddy-horarios.js. */
  horarios?: NCHorario[];
  /** par[] inferido a partir dos scores (script infer-nextcaddy-par.js).
   *  parInferred=true assinala que não vem da fonte directa.
   *  parConfidence ∈ {high, medium, low} indica quanto se pode confiar no par. */
  course?: {
    par?: number[] | null;
    si?: number[] | null;
    meters?: number[] | null;
    parTotal?: number;
    parInferred?: boolean;
    // total-high/total-low: só o par TOTAL foi inferido (sem par por buraco).
    parConfidence?: "high" | "medium" | "low" | "total-high" | "total-low";
  };
  leaderboard: { category: number; categoryName?: string | null; players: NCPlayer[] }[];
  inscritos: NCInsc[];
  /** Resultados publicados só em PDF (sem tabela HTML parseável). */
  leaderboardPdfOnly?: boolean;
  /** Destaques de live-scoring (birdies/eagles/hole-in-one por jogador+buraco),
   *  capturados mesmo quando o leaderboard final só sai em PDF. */
  scoreTypes?: Record<string, { scoreTypeKey?: string; players?: { playerName?: string; holeNumber?: number }[] }>;
}

/* livegolfscoring.es format — fonte primária dos resultados/scorecards RFEGolf */
export interface LgsPlayer {
  memberId?: string | null;
  pos: number | null;
  name: string;
  toPar: number;
  hoy: number;
  scores: number[] | null;
  halves: number[] | null;
  total: number | null;
}
export interface LgsRound {
  round: number;
  label: string;
  par: number[] | null;
  players: LgsPlayer[];
}
export interface LgsDetail {
  id: number;
  ok: boolean;
  scrapedAt: string;
  meta: {
    name: string | null;
    course: string | null;
    dateRange: string | null;
    dateIso?: string | null;
    year?: number | null;
    rounds: { round: number; label: string }[];
  };
  rounds: LgsRound[];
  course?: { meters: (number | null)[]; si: (number | null)[]; par: (number | null)[]; avg?: (number | null)[]; metersTotal?: number | null; holes?: number } | null;
  horarios?: LgsHorarioRound[];
  /** Classificação final do LGS: traz o resultado de cada volta (`roundTotals`)
   *  mesmo quando o «hoyo a hoyo» das voltas vem sem cartões nem totais. */
  classification?: { memberId?: string | null; name: string; roundTotals?: (number | null)[] | null }[];
}

export interface LgsHorarioRound {
  round: number;
  subid: string | null;
  groups: { teeTime: string | null; startHole: number | null; players: string[] }[];
}

/** Lookups por licença — os mesmos do golfdirecto (fcgAdapter); vivem em intlCommon. */
export type { DobLookupEntry, DobLookup, DobLookupFile, HcpLookupEntry, HcpLookup, HcpLookupFile } from "../intlCommon";
