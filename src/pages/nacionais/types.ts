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

