/* Types partilhados entre NacionaisPage e sub-componentes */

interface InscricaoJogador {
  fed: string | null; nome: string; clube: string;
  hcp: number | null; vac: number | null; dataInscricao: string | null;
}

export interface TorneioData {
  tcode: string; nome: string; escalao: string; sex: string;
  totalInscritos: number; jogadores: InscricaoJogador[];
  lastFetched: string | null; lastChanged: string | null; fpgUrl?: string;
  fromCache?: boolean; fetchError?: string;
  diff?: { added: string[]; removed: string[] } | null;
  _status: "idle" | "loading" | "ok" | "error";
}

export type BdPlayer = { name: string; escalao: string; sex: string; fed: string; clube: string; dob: string };

interface PlayerStats {
  avgSD5: number | null; lastSD: number | null; currentHcp: number | null;
  hcpTrend: string | null; hcpDelta3m: number | null;
  roundsLast3m: number | null; formAlert: string | null;
}

export type StatsDb = Record<string, PlayerStats>;

interface AggStats {
  nRounds: number; nRoundsWithCard: number;
  avgGross: number | null; bestGross: number | null; grossStdDev: number | null;
  avgSD: number | null; bestSD: number | null; last5AvgSD: number | null; sdStdDev: number | null;
  scoreDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  byPar: Record<number, { avgVsPar: number; subParPct: number; n: number }>;
  f9avg: number | null; b9avg: number | null;
  aroeira: {
    nRounds: number; avgGross: number | null; tees: string[];
    holes: { h: number; par: number | null; avg: number | null; diff: number | null }[];
  };
}

type PlayerLoad = {
  fed: string; nome: string; hcp: number | null; vac: number | null;
  status: "idle" | "loading" | "ok" | "nodata" | "error";
  agg: AggStats | null;
};

interface ScoutingReport {
  nome: string; fed: string; hcp: number | null; vac: number | null;
  rank: number; fieldSize: number;
  formDelta: number | null;
  sdAvg: number | null; sd5: number | null; sdStdDev: number | null;
  par5avg: number | null; par3avg: number | null; par4avg: number | null;
  blowupPct: number; birdiePct: number;
  grossStdDev: number | null;
  f9: number | null; b9: number | null;
  aroeiraRounds: number; aroeiraAvg: number | null;
  r3m: number | null; agg: AggStats;
}
