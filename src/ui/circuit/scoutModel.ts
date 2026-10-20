/**
 * src/ui/circuit/scoutModel.ts — contas da aba «Scout» (20/10/2026).
 *
 * O Scout dos circuitos é o field de hoje cruzado com a carreira de cada
 * jogador: as edições anteriores desta prova (o antigo «Quem repete») MAIS os
 * extras que viviam no Scout do kids2 — nível, vitórias, HCP, idade, confrontos
 * com o Manuel e próximas inscrições. Os dados vêm de dois resumos pequenos do
 * agregador (juniors-scout.json e juniors-form.json), nunca dos ~180 MB do kids2.
 * O modelo de ameaça veio do kids2/ScoutView.tsx sem mudar a lógica.
 */
import { getTierLabel, type TierKey } from "../../pages/kids2/juniorCalc";

/** juniors-form.json — últimos torneios [data, ±par, buracos, lugar, field] e
 *  confrontos com o Manuel no mesmo escalão [à frente, atrás]. */
export interface JuniorForm { r: [string, number, number, number | null, number][]; m?: [number, number] }
export interface FormFile { players: Record<string, JuniorForm> }

/** Uma prova em comum com o Manuel: [data, torneio, lugar dele, lugar do Manuel, pancadas dele − Manuel]. */
export type ScoutComManuel = [string, string, number | null, number | null, number];

/** juniors-scout.json (scripts/aggregator/util/scout.js). */
export interface JuniorScout {
  /** Torneios na carreira. */
  n?: number;
  t?: TierKey; w?: number; t3?: number; h?: number; d?: string; c?: string; p?: string;
  /** Provas em comum com o Manuel: [data, torneio, lugar dele, lugar do Manuel, pancadas dele − Manuel]. */
  m?: ScoutComManuel[];
  /** Confrontos no mesmo flight. */
  mf?: number;
}
export interface ScoutFile { players: Record<string, JuniorScout> }

export const N_FORMA = 5;
/** ±par médio por 18 buracos nos últimos torneios (9 buracos contam metade).
 *  Torneios com menos de 9 buracos ficam de fora: levados a 18 explodiam
 *  (+248 numa volta de 1 buraco, 20/10/2026). */
export function formaMedia(f: JuniorForm | undefined): number | null {
  const r = (f?.r ?? []).filter((x) => x[2] >= 9).slice(0, N_FORMA);
  if (!r.length) return null;
  return Math.round((r.reduce((s, x) => s + (x[1] * 18) / x[2], 0) / r.length) * 10) / 10;
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
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", ",");
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
    if (a.recentPos <= 3) { score += 5; reasons.push(`Forma recente forte (${a.recentPos}º)`); }
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
