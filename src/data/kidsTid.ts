/**
 * src/data/kidsTid.ts — o código («tid») de cada flight do canónico e o
 * resultado compacto de um junior nesse flight, como os rivais os guardam.
 *
 * Partilhado pelo browser (KIDSdataLoader) e pelo agregador
 * (scripts/aggregator/util/scout.js, que o carrega pelo Node — como o
 * juniorCalc.ts): por isso só tipos e funções puras, nada de imports.
 *
 * Os tids antigos (e.g. "wjgc26", "usk21080_b11", "doral25_b1011") ainda são
 * referenciados em vários componentes (KIDSPage, RivalDetail, dobInference).
 * Mantém-se o formato.
 */

export interface TidTournament {
  sourceId: string;
  sourceKey: string;
  date?: string;
  holesPerRound?: number;
}
export interface TidFlight {
  label: string;
  ageMin?: number | null;
  ageMax?: number | null;
  sex?: "M" | "F" | "mixed" | null;
}
export interface TidResult {
  pos?: number | null;
  status?: string;
  totalGross?: number | null;
  toPar?: number | null;
  rounds?: Array<{ gross?: number | null }>;
}

/** Resultado de um junior num torneio (o `r[tid]` dos rivais). */
export interface AutoTournResult {
  p: number | "WD" | null;
  t: number | null;
  tp: number | null;
  rd: number[];
  ageGroup?: string;
  nholes?: number;
}

/** WJGC/EOWAGR/Doral usavam tids hardcoded por sourceKey de ficheiro. */
const FILE_TO_LEGACY_TID: Record<string, string> = {
  "wjgc_2025_b89": "wjgc25_b89",
  "wjgc_2025_b1011": "wjgc25_b1011",
  "wjgc_2026_b1011": "wjgc26",
  "wjgc_2026_b1213": "wjgc26_1213",
  "eowagr25_contest121": "eowagr25_b78",
  "eowagr25_contest13": "eowagr25_b910",
  "eowagr25_contest21": "eowagr25",
  "eowagr25_contest77": "eowagr25_b1314",
  "ftm_doral_2018": "doral18",
  "ftm_doral_2019": "doral19",
  "ftm_doral_2020": "doral20",
  "ftm_doral_2021": "doral21",
  "ftm_doral_2022": "doral22",
  "ftm_doral_2023": "doral23",
  "ftm_doral_2024": "doral24",
  "ftm_doral_2025": "doral25",
};

export function legacyTid(t: TidTournament, f: TidFlight): string | null {
  const sid = t.sourceId;
  const skey = t.sourceKey;

  if (sid === "uskids") {
    if (f.ageMin == null && f.ageMax == null) return `usk${skey}`;
    const sexCh = f.sex === "F" ? "g" : "b";
    const age = f.ageMin ?? f.ageMax;
    return `usk${skey}_${sexCh}${age}`;
  }
  if (sid === "wjgc" || sid === "eowagr") {
    return FILE_TO_LEGACY_TID[skey] || `${sid}-${skey}`;
  }
  if (sid === "doral") {
    const base = FILE_TO_LEGACY_TID[skey] || `doral${(t.date || "").slice(2, 4)}`;
    if (f.ageMin == null && f.ageMax == null) return base;
    const ages = `${f.ageMin || ""}${f.ageMax && f.ageMax !== f.ageMin ? f.ageMax : ""}`;
    return `${base}_b${ages}`;
  }
  if (sid === "fpg") {
    // sourceKey: "ccode-tcode-date-escSlug" → tid: "fpg{tcode}_{date}_{escSlug}"
    const parts = String(skey).split("-");
    const tcode = parts[1] || parts[0] || skey;
    const date = parts[2] || "";
    const esc = parts[3] || "";
    return `fpg${tcode}${date ? "_" + date : ""}${esc && esc !== "all" ? "_" + esc : ""}`;
  }
  if (sid === "rfeg") return String(skey); // já vem no formato "nc{id}_{escalão}" ou "lgs{id}"
  if (sid === "ffgolf") return `ff-${skey}`;
  return `${sid}-${skey}`;
}

/** O resultado compacto de um junior num flight. */
export function toAutoResult(result: TidResult, flight: TidFlight, tournament: TidTournament): AutoTournResult {
  const rd: number[] = [];
  for (const r of result.rounds || []) {
    if (typeof r.gross === "number") rd.push(r.gross);
  }
  const status = result.status;
  let pos: number | "WD" | null;
  if (status === "WD" || status === "DNS" || status === "DQ" || status === "IE") pos = "WD";
  else if (typeof result.pos === "number") pos = result.pos;
  else pos = null;
  return {
    p: pos,
    t: typeof result.totalGross === "number" ? result.totalGross : null,
    tp: typeof result.toPar === "number" ? result.toPar : null,
    rd,
    ageGroup: flight.label,
    nholes: tournament.holesPerRound || 18,
  };
}

/** Dois resultados no mesmo tid (o torneio chega por duas fontes): fica o que tem mais voltas. */
export function keepBetter(existing: AutoTournResult | undefined, tr: AutoTournResult): AutoTournResult {
  return !existing || tr.rd.length >= (existing.rd?.length || 0) ? tr : existing;
}

/** As séries «extra» que os Próximos torneios do kids2 mostram (colunas e Passados). */
export const EXTRA_SOURCES = ["wjgc", "doral", "eowagr"] as const;
