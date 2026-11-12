/**
 * src/ui/circuit/scoutModel.ts — contas da aba «Scout» (20/10/2026).
 *
 * O Scout dos circuitos é o field de hoje cruzado com a carreira de cada
 * jogador: as edições anteriores desta prova (o antigo «Quem repete») MAIS os
 * extras que viviam no Scout do kids2 — nível, vitórias, HCP, idade, confrontos
 * com o Manuel e próximas inscrições. Os dados vêm de dois resumos pequenos do
 * agregador (juniors-scout.json, que traz também a forma), nunca dos ~180 MB do kids2.
 * O modelo de ameaça veio do kids2/ScoutView.tsx sem mudar a lógica.
 */
import { getTierLabel, getTournWeight, nivelIncerto, type TierKey, type RankingRow } from "../../pages/kids2/juniorCalc";

import { fmtOrd } from "../../utils/format";
import { round1, somaDe } from "../../utils/mathUtils";
/** Um dos últimos torneios (`u` do juniors-scout.json, 02/11/2026 — Kids 2 +
 *  as provas de clube dos cartões FPG): [data, índice do nome em `tn`, lugar
 *  (ou "WD"/"DQ"/"DNS"; null nas provas de clube, sem classificação), field,
 *  voltas, pancadas, ±par, buracos, SD oficial médio]. */
export type ScoutTorneioRaw = [string, number, number | string | null, number | null, number, number | null, number | null, number, number | null];
export interface ScoutTorneio {
  data: string; nome: string; lugar: number | null; estado: string | null; field: number | null;
  voltas: number; pancadas: number | null; toPar: number | null; buracos: number; sd: number | null;
}
export function ultimosTorneios(u: readonly ScoutTorneioRaw[] | undefined, tn: readonly string[] | undefined): ScoutTorneio[] {
  return (u ?? []).map(([data, i, l, field, voltas, pancadas, toPar, buracos, sd]) => ({
    data, nome: tn?.[i] ?? "", lugar: typeof l === "number" ? l : null, estado: typeof l === "string" ? l : null,
    field, voltas, pancadas, toPar, buracos, sd,
  }));
}

/** Uma prova em comum com o Manuel: [data, torneio, lugar dele, lugar do Manuel,
 *  pancadas dele − Manuel, voltas, buracos por volta]. As pancadas são só das
 *  voltas que os dois jogaram; sem `voltas`/`buracos` (provas da página, ex.
 *  FPG) conta como 1 volta de 18. */
export type ScoutComManuel = [string, string, number | null, number | null, number, number?, number?];

/** Pancadas dele − Manuel por volta de 18 buracos, em todas as provas em comum. */
export function porVolta(m: readonly ScoutComManuel[]): number | null {
  let soma = 0, voltas = 0;
  for (const x of m) { soma += (x[4] * 18) / (x[6] || 18); voltas += x[5] || 1; }
  return voltas ? Math.round((soma / voltas) * 10) / 10 : null;
}

/** juniors-scout.json (scripts/aggregator/util/scout.js). */
export interface JuniorScout {
  /** Torneios na carreira. */
  n?: number;
  /** Último ano (365 dias): [torneios, vitórias, top-3]. */
  a?: [number, number, number];
  /** Voltas de 18 buracos no último ano: [voltas, média, melhor, ±par médio, ±par da melhor] (±par null sem par oficial). */
  v?: [number, number, number, number | null, number | null];
  t?: TierKey; w?: number; t3?: number; h?: number; d?: string; c?: string; p?: string;
  /** Provas em comum com o Manuel: [data, torneio, lugar dele, lugar do Manuel, pancadas dele − Manuel]. */
  m?: ScoutComManuel[];
  /** Confrontos no mesmo flight. */
  mf?: number;
  /** Ranking da geração (ano × sexo) pelo nível em pancadas, compacto — `decodeRanking` do juniorCalc:
   *  [ano, sexo, posição, nível, peso das voltas]. */
  r?: RankingRow;
  /** Os últimos torneios (os nomes em `ScoutFile.tn`). */
  u?: ScoutTorneioRaw[];
  /** O `h` é o hándicap OFICIAL actual da RFEG: [hcp, "AAAA-MM-DD" da última actualização]. */
  hr?: [number, string | null];
}
export interface ScoutFile { players: Record<string, JuniorScout>; tn?: string[] }

/** O Nível deste jogador assenta em poucas voltas do último ano? (aviso «poucas voltas») */
export function nivelPoucoSeguro(sc: JuniorScout | null | undefined): boolean {
  return nivelIncerto({ peso: sc?.r?.[4] });
}

export const N_FORMA = 5;
/** ±par médio por 18 buracos nos últimos torneios acabados (9 buracos contam
 *  metade). Torneios com menos de 9 buracos ficam de fora: levados a 18
 *  explodiam (+248 numa volta de 1 buraco, 20/10/2026). */
export function formaMedia(u: readonly ScoutTorneioRaw[] | undefined): number | null {
  const r = (u ?? []).filter((x) => x[6] != null && x[7] >= 9).slice(0, N_FORMA);
  if (!r.length) return null;
  return Math.round((somaDe(r, x => (x[6]! * 18) / x[7]) / r.length) * 10) / 10;
}
/** O lugar mais recente conhecido (as provas de clube não têm classificação). */
export function ultimoLugar(u: readonly ScoutTorneioRaw[] | undefined): number | null {
  const x = (u ?? []).find((t) => typeof t[2] === "number");
  return x ? (x[2] as number) : null;
}

/** Idade hoje a partir de "AAAA-MM-DD". */
export function idade(dob: string | undefined, hoje = new Date()): number | null {
  const m = String(dob || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let a = hoje.getFullYear() - +m[1];
  if (hoje.getMonth() + 1 < +m[2] || (hoje.getMonth() + 1 === +m[2] && hoje.getDate() < +m[3])) a--;
  return a;
}

// ── Modelo de ameaça (quão perigoso é o rival para o Manuel) ──────────
// Combina 4 sinais, do mais forte ao mais fraco:
//   1. Confronto directo vs Manuel — se o rival costuma bater o Manuel é o
//      sinal decisivo, ponderado pela confiança (nº de confrontos).
//   2. Tier (Elite / Forte / Sólido / ...).
//   3. Forma recente (último lugar conhecido).
//   4. Vitórias na carreira.
export type ThreatLevel = "high" | "med" | "low" | "none";
export const THREAT_LABEL: Record<ThreatLevel, string> = { high: "alta", med: "média", low: "baixa", none: "—" };

export interface ThreatArgs {
  hasManuel: boolean;
  /** Pancadas do rival − Manuel, em média (negativo = rival melhor). */
  vsMTotal: number | null;
  vsMCount: number;
  vsMSameFlight: number;
  tier: TierKey | null;
  recentPos: number | null;
  wins: number;
}
export interface ThreatInfo { score: number; level: ThreatLevel; reasons: string[] }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
function fmtMargin(n: number): string {
  const r = round1(n);
  return (Number.isInteger(r) ? String(r) : r.toFixed(1));
}

export function computeThreat(a: ThreatArgs): ThreatInfo {
  const reasons: string[] = [];
  let score = 0;
  let h2hStrong = false;
  let h2hBeatsManuel = false;
  if (a.hasManuel && a.vsMCount > 0 && a.vsMTotal != null) {
    const margin = -a.vsMTotal; // positivo → rival bate o Manuel
    const conf = clamp((a.vsMSameFlight || a.vsMCount) / 4, 0, 1);
    score += clamp(margin, -15, 15) * (0.6 + 0.4 * conf);
    if (margin > 0.5) {
      h2hBeatsManuel = true;
      reasons.push(`Bate o Manuel em média (${fmtMargin(margin)} pancadas, ${a.vsMCount} confronto${a.vsMCount > 1 ? "s" : ""})`);
      if (margin >= 3) h2hStrong = true;
    } else if (margin < -0.5) {
      reasons.push(`Manuel costuma bater (${fmtMargin(-margin)} pancadas a menos)`);
    } else {
      reasons.push(`Equilibrado com o Manuel (${a.vsMCount} confronto${a.vsMCount > 1 ? "s" : ""})`);
    }
  }
  const tierPts: Record<string, number> = { elite: 12, strong: 8, solid: 4, developing: 1, beginner: 0 };
  if (a.tier) {
    score += tierPts[a.tier] ?? 0;
    if (a.tier === "elite" || a.tier === "strong") reasons.push(`Nível ${getTierLabel(a.tier)}`);
  }
  if (a.recentPos != null) {
    if (a.recentPos <= 3) { score += 5; reasons.push(`Forma recente forte (${fmtOrd(a.recentPos)})`); }
    else if (a.recentPos <= 10) score += 2;
  }
  if (a.wins > 0) {
    score += Math.min(a.wins, 5);
    reasons.push(`${a.wins} vitória${a.wins > 1 ? "s" : ""}`);
  }
  let level: ThreatLevel;
  if (a.tier == null && a.vsMCount === 0 && a.recentPos == null && a.wins === 0) {
    level = "none";
    if (!reasons.length) reasons.push("Sem histórico suficiente");
  } else if (h2hStrong || score >= 11) level = "high";
  else if (h2hBeatsManuel || score >= 5) level = "med";
  else level = "low";
  return { score, level, reasons };
}

// ── Previsão (04/11/2026, «melhora o scout»: quanto deve fazer cada um e quem
//    deve ficar à frente do Manuel) ──────────────────────────────────────────
export type FontePrevisao = "confrontos" | "comparacoes" | "nivel" | "media" | "hcp";
export const FONTE_PREVISAO_LABEL: Record<FontePrevisao, string> = {
  confrontos: "pelos confrontos com o Manuel",
  comparacoes: "pelas provas em comum (com o Manuel e entre eles), pesadas pela força da prova",
  nivel: "pelo Nível em pancadas (último ano), em relação ao do Manuel",
  media: "pela média ao par do último ano",
  hcp: "pelo handicap",
};
export interface Previsao {
  /** ±par por volta de 18 buracos, num dia normal. */
  toPar: number;
  /** Pancadas por volta a mais (+) ou a menos (−) que o Manuel (null sem a média dele). */
  vsManuel: number | null;
  fonte: FontePrevisao;
}

/**
 * Previsão de um rival, sempre em relação ao Manuel (a referência é o ±par
 * médio do Manuel no último ano, `manuelToPar`):
 *  1. confrontos — as pancadas por volta nas voltas que jogaram os dois (o
 *     sinal mais directo: mesmo campo, mesmo dia);
 *  2. média — o ±par médio dele no último ano (outros campos, mas da mesma época);
 *  3. hcp — a diferença de handicap (dele − do Manuel).
 * Null sem nenhuma destas.
 */
export function previsaoRival(
  a: { vsMMedia: number | null; nConfrontos: number; toParAno: number | null; hcp: number | null },
  manuel: { toParAno: number | null; hcp: number | null },
): Previsao | null {
  const r1 = round1;
  if (manuel.toParAno != null && a.vsMMedia != null && a.nConfrontos > 0) {
    return { toPar: r1(manuel.toParAno + a.vsMMedia), vsManuel: r1(a.vsMMedia), fonte: "confrontos" };
  }
  if (a.toParAno != null) {
    return { toPar: r1(a.toParAno), vsManuel: manuel.toParAno != null ? r1(a.toParAno - manuel.toParAno) : null, fonte: "media" };
  }
  if (a.hcp != null && manuel.hcp != null && manuel.toParAno != null) {
    const d = a.hcp - manuel.hcp;
    return { toPar: r1(manuel.toParAno + d), vsManuel: r1(d), fonte: "hcp" };
  }
  return null;
}

/** Os confrontos com o Manuel numa frase («Ganhou 7 de 7 · 10.8 por volta à
 *  frente» / «O Manuel ganhou 3 de 4 · 2.1 por volta»). */
export function fraseConfrontos(frente: number, atras: number, n: number, vsMMedia: number | null): string {
  if (!n) return "";
  const empates = n - frente - atras;
  const quem = atras > frente ? `Ganhou ${atras} de ${n}` : frente > atras ? `O Manuel ganhou ${frente} de ${n}` : `Empatados: ${frente} cada${empates ? ` (${empates} empate${empates > 1 ? "s" : ""})` : ""}`;
  if (vsMMedia == null || Math.abs(vsMMedia) < 0.05) return quem;
  const pv = Math.abs(vsMMedia).toFixed(1);
  return `${quem} · ${pv} por volta ${vsMMedia < 0 ? "à frente" : "atrás"}`;
}

/** Escalão pelo nome do escalão USKids da prova («Boys 12» → «Sub 12»,
 *  «Girls 13-14» → «Sub 14»): todos têm essa idade na data de referência. */
export function escalaoDaProva(nome: string | null | undefined): string | null {
  const m = /\b(boys|girls)\b\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/i.exec(nome || "");
  if (!m) return null;
  return `Sub ${m[3] ?? m[2]}`;
}

// ── Escala por comparações (04/11/2026, Mariana: «o Dmitrii ficou SEMPRE à
//    frente do Antonio… o Antonio só tem vitoriazinhas em local tours
//    brasileiros, com fields pequenos»; «já definimos regras para o power das
//    provas a contar para o índice de jogador») ─────────────────────────────
// A média ao par trata todos os campos por igual; o que conta é como cada um
// se saiu CONTRA os outros nas mesmas provas. Cada prova em comum dá uma
// diferença em pancadas por volta de 18 buracos:
//   - com o Manuel: os confrontos (`m`, só as voltas que jogaram os dois);
//   - entre dois do field: o mesmo torneio, no mesmo dia, com o mesmo field e
//     as mesmas voltas e buracos (dos últimos torneios de cada um, `u`).
// O peso de cada prova = as voltas × a força da prova pela regra do índice do
// jogador (`getTournWeight`, juniorCalc: voltas, field e países → estrelas):
// um World Championship com 159 pesa muito mais do que um local tour de 4.
// Junta-se tudo numa escala (o Manuel = 0) pelos mínimos quadrados — se o A
// perde por muito para o B e o B ganha ao Manuel, o A fica atrás do B mesmo
// sem nunca ter jogado com o Manuel. Só entram os ligados ao Manuel por
// provas em comum (os outros ficam sem posição — vale o Nível em pancadas).
export interface NoEscala {
  key: string; isManuel: boolean;
  u?: readonly ScoutTorneioRaw[]; m?: readonly ScoutComManuel[];
}
export interface PosEscala {
  /** Pancadas por volta a mais (+) ou a menos (−) que o Manuel. */
  vsManuel: number;
  /** Provas em comum que entraram (com o Manuel ou com outros do field). */
  provas: number;
}

/** Estrelas da prova (1 a 5½) pela regra do índice do jogador. */
function forcaDaProva(voltas: number, field: number | null): number {
  return getTournWeight({ rounds: voltas, flights: [{ fieldSize: field ?? 0, results: [] }], sourceId: "" } as never, field ?? 0).stars;
}

export function escalaPorComparacoes(nos: readonly NoEscala[], desde: string): Map<string, PosEscala> {
  const man = nos.find((n) => n.isManuel);
  const MANUEL = man?.key ?? "__manuel__";
  type Aresta = { j: string; d: number; w: number };
  const arestas = new Map<string, Aresta[]>();
  const add = (i: string, j: string, d: number, w: number) => {
    if (!Number.isFinite(d) || !(w > 0)) return;
    (arestas.get(i) ?? arestas.set(i, []).get(i)!).push({ j, d, w });
    (arestas.get(j) ?? arestas.set(j, []).get(j)!).push({ j: i, d: -d, w });
  };
  // Com o Manuel (sem o field da prova: a força pelas voltas).
  for (const n of nos) {
    if (n.isManuel) continue;
    for (const x of n.m ?? []) {
      if (!x[0] || x[0] < desde) continue;
      const voltas = x[5] || 1;
      add(n.key, MANUEL, (x[4] * 18) / (x[6] || 18) / voltas, voltas * forcaDaProva(voltas, null) / 3);
    }
  }
  // Entre dois do field (o Manuel fica de fora: os confrontos dele já entraram).
  const porProva = new Map<string, { key: string; p: number; buracos: number; voltas: number; field: number }[]>();
  for (const n of nos) {
    if (n.isManuel) continue;
    for (const x of n.u ?? []) {
      const [data, nome, , field, voltas, pancadas, , buracos] = x;
      if (!data || data < desde || pancadas == null || !(voltas > 0) || !(buracos >= 9) || field == null) continue;
      const k = `${nome}|${data}|${field}|${voltas}|${buracos}`;
      (porProva.get(k) ?? porProva.set(k, []).get(k)!).push({ key: n.key, p: pancadas, buracos, voltas, field });
    }
  }
  for (const lista of porProva.values()) {
    for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) {
      const A = lista[a], B = lista[b];
      if (A.key === B.key) continue;
      add(A.key, B.key, ((A.p - B.p) * 18) / A.buracos, (A.buracos / 18) * forcaDaProva(A.voltas, A.field) / 3);
    }
  }
  // Só os ligados ao Manuel por provas em comum (directa ou indirectamente).
  const ligados = new Set<string>([MANUEL]);
  const fila = [MANUEL];
  while (fila.length) {
    const k = fila.pop()!;
    for (const e of arestas.get(k) ?? []) if (!ligados.has(e.j)) { ligados.add(e.j); fila.push(e.j); }
  }
  // Mínimos quadrados (Gauss-Seidel), o Manuel fixo em 0.
  const r = new Map<string, number>([[MANUEL, 0]]);
  for (const k of ligados) if (k !== MANUEL) r.set(k, 0);
  for (let it = 0; it < 400; it++) {
    for (const k of ligados) {
      if (k === MANUEL) continue;
      let num = 0, den = 0;
      for (const e of arestas.get(k) ?? []) { num += e.w * ((r.get(e.j) ?? 0) + e.d); den += e.w; }
      if (den > 0) r.set(k, num / den);
    }
  }
  const out = new Map<string, PosEscala>();
  for (const n of nos) {
    if (n.isManuel) { out.set(n.key, { vsManuel: 0, provas: 0 }); continue; }
    if (!ligados.has(n.key)) continue;
    out.set(n.key, { vsManuel: Math.round((r.get(n.key) ?? 0) * 10) / 10, provas: (arestas.get(n.key) ?? []).length });
  }
  return out;
}

// ── Destaques do jogador (04/11/2026: «se conseguiram ir ao world devem
//    receber um destaque… é difícil conseguir lugar») ────────────────────────
/** O World Championship USKids (Pinehurst) nos últimos torneios: o lugar e o
 *  field. Só o principal — sem o Parent/Child nem os outros «world». */
export function worldChampionship(ult: readonly ScoutTorneio[]): { ano: string; lugar: number | null; field: number | null; estado: string | null } | null {
  const w = ult.find((x) => /^World Championship \d{4}$/.test(x.nome.trim()));
  return w ? { ano: w.data.slice(0, 4), lugar: w.lugar, field: w.field, estado: w.estado } : null;
}

/** O resultado mais notável dos últimos torneios (fora o World): o do maior
 *  field com lugar no top-3; senão o melhor lugar no maior field. */
export function resultadoNotavel(ult: readonly ScoutTorneio[]): ScoutTorneio | null {
  const com = ult.filter((x) => x.lugar != null && x.field != null && !/^World Championship \d{4}$/.test(x.nome.trim()) && !/parent\s*\/\s*child/i.test(x.nome));
  if (!com.length) return null;
  const podio = com.filter((x) => x.lugar! <= 3).sort((a, b) => b.field! - a.field! || a.lugar! - b.lugar!);
  if (podio.length && podio[0].field! >= 8) return podio[0];
  return [...com].sort((a, b) => b.field! - a.field! || a.lugar! - b.lugar!)[0];
}
