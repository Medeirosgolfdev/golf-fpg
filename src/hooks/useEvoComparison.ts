/**
 * useEvoComparison — Hook unificado para comparação ano-a-ano (evolução)
 *
 * Usado em BJGTPage e DORALPage. Lógica core partilhada:
 *   1. Encontrar jogadores que repetiram (name matching)
 *   2. Calcular delta
 *   3. Classificar como UP/EQ/NEW
 *
 * As diferenças (toPar vs total, prevPos, fieldSize, bidirecional)
 * são parametrizadas via opções.
 */

import { useMemo } from "react";

/* ── Types ── */

export interface EvoPlayer {
  name: string;
  /** Valor comparável (total bruto ou toPar — quem chama decide) */
  value: number | null;
  /** Categoria/escalão (e.g. "Boys 10-11") */
  category: string;
  /** Posição no torneio (opcional, para EvoBadge com prevPos) */
  pos?: number | null;
}

export interface EvoEntry {
  /** Valor do jogador no outro ano */
  otherValue: number;
  /** Diferença: curValue - otherValue (negativo = melhorou) */
  delta: number;
  /** Categoria de origem */
  from: string;
  /** Categoria de destino */
  to: string;
  /** Classificação do percurso */
  pill: "UP" | "EQ" | "NEW";
  /** Posição no outro ano (opcional) */
  prevPos?: number | null;
  /** Tamanho do field no outro ano (opcional) */
  fieldSize?: number;
}

export interface EvoInput {
  /** Jogadores do torneio actual */
  currentPlayers: EvoPlayer[];
  /** Jogadores dos torneios de referência (outro ano) */
  referencePlayers: EvoPlayer[];
  /** Ano de referência (label para o header, e.g. "2025") */
  referenceYear?: string;
  /** Se true, incluir fieldSize no EvoEntry (conta jogadores completos na ref) */
  includeFieldSize?: boolean;
  /** Nome do Manuel para detectar manuelEvo (opcional) */
  isManuel?: (name: string) => boolean;
}

export interface EvoResult {
  /** Mapa nome → EvoEntry */
  evoMap: Map<string, EvoEntry> | undefined;
  /** Ano de referência (e.g. "2025") */
  evoYear: string | undefined;
  /** Entrada do Manuel (se encontrado) */
  manuelEvo: EvoEntry | undefined;
}

/* ── Name matching (partilhado — mesmo algoritmo de ambas as páginas) ── */

function nameMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (na === nb) return true;
  const aParts = na.split(" ");
  const bParts = nb.split(" ");
  return (
    aParts[0] === bParts[0] &&
    aParts[aParts.length - 1] === bParts[bParts.length - 1]
  );
}

/* ── Core builder (puro, sem hooks — testável) ── */

export function buildEvoMap(input: EvoInput): EvoResult {
  const { currentPlayers, referencePlayers, referenceYear, includeFieldSize, isManuel } = input;

  if (!referencePlayers.length)
    return { evoMap: undefined, evoYear: referenceYear, manuelEvo: undefined };

  const evoMap = new Map<string, EvoEntry>();
  let manuelEvo: EvoEntry | undefined;

  // Pre-compute fieldSize se necessário (jogadores com value no referenceYear)
  const fieldSize = includeFieldSize
    ? referencePlayers.filter((p) => p.value != null).length
    : undefined;

  for (const cur of currentPlayers) {
    if (cur.value == null) continue;
    const match = referencePlayers.find((ref) => nameMatch(cur.name, ref.name));
    if (!match || match.value == null) continue;

    const delta = cur.value - match.value;
    const entry: EvoEntry = {
      otherValue: match.value,
      delta,
      from: match.category,
      to: cur.category,
      pill: match.category === cur.category ? "EQ" : "UP",
      prevPos: includeFieldSize ? (match.pos ?? null) : undefined,
      fieldSize,
    };

    evoMap.set(cur.name, entry);
    if (isManuel?.(cur.name)) manuelEvo = entry;
  }

  return {
    evoMap: evoMap.size ? evoMap : undefined,
    evoYear: referenceYear,
    manuelEvo,
  };
}

/* ── Hook (memoiza o resultado) ── */

export function useEvoComparison(input: EvoInput | null): EvoResult {
  return useMemo(
    () => (input ? buildEvoMap(input) : { evoMap: undefined, evoYear: undefined, manuelEvo: undefined }),
    [input],
  );
}
