/**
 * types.ts — Formatos dos ficheiros da Federgolf (Itália), gravados por
 * `scripts/scrape-federgolf.js`: o índice e uma prova (um sexo) por ficheiro.
 */

/** Tee, CR/Slope e SD oficial de uma volta (relatório de handicap da prova). */
export interface FgRating {
  tee: string | null;
  cr: number | null;
  slope: number | null;
  sd: number | null;
  data: string | null;
}

export interface FgJogador {
  pos: number | null;
  /** «APELIDO, NOME» como a Federgolf o escreve. */
  nome: string;
  id: string;
  clube: string | null;
  indice: number | null;
  /** Categoria do jogador: B Baby · P Pulcini · C Cadetti · R Ragazzi. */
  cat: string | null;
  qual: string | null;
  /** Lugar na ordem de mérito. */
  odm: number | null;
  /** Lugar no WAGR (lista de inscritos). */
  wagr?: number | null;
  /** HCP de jogo da classificação. */
  hcp: number | null;
  /** Gross de cada volta (null = não jogou). */
  voltas: (number | null)[];
  total: number | null;
  /** ±par da fonte (só com todas as voltas jogadas). */
  toPar: number | null;
  /** Cartão de 18 buracos de cada volta (null = sem cartão). */
  cartoes: (number[] | null)[];
  rating: (FgRating | null)[];
}

export interface FgProva {
  fonte: string;
  id: string;
  nome: string;
  data: string | null;
  clube: string;
  tipo: string;
  /** Baby, Pulcini, Cadetti, Ragazzi, U16, TGF, TGF WAGR… */
  categoria: string;
  sexo: "M" | "F" | null;
  voltas: number;
  url: string;
  campo: { par: (number | null)[]; metros: (number | null)[] } | null;
  /** Par de uma volta (do relatório de handicap) — para as provas sem cartões. */
  parTotal?: number | null;
  jogadores: FgJogador[];
  /** Lista de inscritos (separador «Lista iscritti»); falta nas provas gravadas antes de 02/11/2026. */
  inscritos?: FgInscrito[];
  completo: boolean;
  extraidoEm: string;
}

/** Uma linha da «Lista iscritti». Estrangeiros: `clube` é o país (FRA, ENG…). */
export interface FgInscrito {
  n: number | null;
  nome: string;
  clube: string | null;
  /** B Baby · P Pulcini · C Cadetti · R Ragazzi · D Dilettanti · M Mid-Amateur · S Senior · Ss Super senior. */
  cat: string | null;
  /** B Brevetto · BG Brevetto Giovanile · BN Brevetto Nazionale · GIF Interesse Federale · GIN Interesse Nazionale. */
  qual: string | null;
  wagr: number | null;
  indice: number | null;
  odm: number | null;
  data: string | null;
  estado: "ammesso" | "attesa" | "cancellato" | "wildcard" | null;
}

export interface FgIndiceProva {
  id: string;
  nome: string;
  data: string | null;
  clube: string;
  tipo: string;
  categoria: string;
  sexo: "M" | "F" | null;
  voltas: number;
  jogadores: number;
  parTotal: number | null;
  tees: string[];
  completo: boolean;
  /** Há cartões buraco a buraco (a passagem rápida grava só os totais). */
  cartoes?: boolean;
  /** Há portugueses / o Manuel (classificação ou inscritos) — filtros 🇵🇹 e ★. */
  hasPt?: boolean;
  hasManuel?: boolean;
  /** Prova por jogar (só a lista de inscritos). */
  futura?: boolean;
}

export interface FgIndice {
  fonte: string;
  geradoEm: string;
  provas: FgIndiceProva[];
}
