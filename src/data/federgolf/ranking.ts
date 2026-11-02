/**
 * ranking.ts — ranking juvenil nacional da Federgolf (scripts/scrape-federgolf-ranking.js):
 * as listas por ano, sexo e categoria, e as voltas de cada jogador.
 */
import { cachedFetchJson } from "../fetchCache";
import { escalaoCanon } from "../model/escalao";

export const FG_RANKING_URL = "/data/federgolf-ranking.json";
export const FG_RANKING_VOLTAS_URL = "/data/federgolf-ranking-voltas.json";

export interface FgRankingLinha {
  pos: number | null;
  /** «APELIDO, NOME» quando o jogador está nalguma prova gravada; senão
   *  «APELIDO NOME» (sem vírgula, como no ranking). Mostrar com `fgNome`. */
  nome: string;
  clube: string | null;
  zona: number | null;
  idade: number | null;
  qual: string | null;
  voltas: number | null;
  /** Cumpriu o mínimo de voltas do ranking. */
  minimo: boolean;
  /** Média de (gross − CR) das voltas que contam — mais baixa = melhor. */
  media: number | null;
  /** O mesmo id das classificações das provas. */
  id: string | null;
}

/** anos → «M-12» (sexo-categoria) → linhas. */
export interface FgRanking {
  geradoEm: string;
  anos: Record<string, Record<string, FgRankingLinha[]>>;
}

/** [prova, data ISO, clube, volta, gross, par, CR, gross − CR] */
export type FgRankingVolta = [string, string | null, string | null, number | null, number | null, number | null, number | null, number | null];

export interface FgRankingVoltas {
  geradoEm: string;
  anos: Record<string, Record<string, FgRankingVolta[]>>;
}

/** Categorias do ranking (código da Federgolf → nome; escalão pela tabela única). */
export const FG_RANKING_CATS: { cod: string; nome: string; escalao: string }[] =
  [["12", "Baby"], ["14", "Pulcini"], ["16", "Cadetti"], ["18", "Ragazzi"]]
    .map(([cod, nome]) => ({ cod, nome, escalao: escalaoCanon(nome, "it") ?? nome }));

export const loadFgRanking = () => cachedFetchJson<FgRanking>(FG_RANKING_URL);
export const loadFgRankingVoltas = () => cachedFetchJson<FgRankingVoltas>(FG_RANKING_VOLTAS_URL);

/** Uma entrada do jogador no ranking: o ano mais recente em que aparece. */
export interface FgRankingDoJogador extends FgRankingLinha {
  ano: string;
  sexo: "M" | "F";
  categoria: string;
  /** Jogadores dessa lista. */
  de: number;
}

/** Todas as listas (anos, sexos, categorias) em que o jogador aparece, do ano mais recente para trás. */
export function fgRankingDoJogador(r: FgRanking, id: string): FgRankingDoJogador[] {
  const out: FgRankingDoJogador[] = [];
  for (const ano of Object.keys(r.anos).sort().reverse()) {
    for (const [k, linhas] of Object.entries(r.anos[ano])) {
      const l = linhas.find((x) => x.id === id);
      if (!l) continue;
      const [sexo, cod] = k.split("-");
      out.push({ ...l, ano, sexo: sexo === "F" ? "F" : "M", categoria: FG_RANKING_CATS.find((c) => c.cod === cod)?.nome ?? cod, de: linhas.length });
    }
  }
  return out;
}
