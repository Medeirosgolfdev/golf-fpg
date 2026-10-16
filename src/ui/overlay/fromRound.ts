/*
 * overlayFromRound — monta o OverlayData (PNGs do simulador) a partir de uma
 * volta jogada num torneio, para o «📷 Partilhar volta» dos leaderboards.
 */
import type { Player, Tournament } from "../../data/fpgTypes";
import { fillBlankHoles } from "../../data/fpgUtils";
import { calcCourseHcp } from "../../utils/whsCalc";
import { MONTHS_PT } from "../../utils/format";
import type { OverlayData } from "./types";

/** "2026-10-16" ou "16/10/2026" → Date (meio-dia, sem saltos de fuso). */
function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12);
  return null;
}

const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`;

/** Nº da volta a partir do `_roundLabel` ("R2") do torneio expandido. */
export function roundNumberOf(t: Tournament): number {
  const m = /^R(\d+)$/.exec(String((t as { _roundLabel?: string })._roundLabel || ""));
  return m ? Number(m[1]) : 1;
}

/** Data da volta: a da própria ronda quando vem em ISO/dd-mm-aaaa; senão a do
 *  torneio + (volta − 1) dias. Fica vazia quando não se sabe — o utilizador
 *  escreve-a no painel. */
function roundDate(t: Tournament, p: Player, round: number): string {
  const own = parseDay((p.roundScores?.[0] as { date?: string } | undefined)?.date);
  if (own) return fmtDay(own);
  const start = parseDay(t.date);
  if (!start) return "";
  start.setDate(start.getDate() + round - 1);
  return fmtDay(start);
}

export function overlayFromRound(
  t: Tournament, p: Player, sd: number | null,
  ctx: { event?: string; course?: string } = {},
): OverlayData | null {
  const rs = p.roundScores?.[0];
  const par = (p.par?.length ? p.par : rs?.pars) || [];
  const cr = p.courseRating ?? rs?.courseRating;
  const slope = p.slope ?? rs?.slope;
  if (!par.length || !cr || !slope) return null;
  const nh = par.length;
  const { scores } = fillBlankHoles(p);
  const holeScores = par.map((_, i) => (scores[i] > 0 ? scores[i] : null));
  const si = ((p.si?.length ? p.si : rs?.si) || []).slice(0, nh).map(Number);
  const meters = ((rs?.meters?.length ? rs.meters : p.meters) || []).slice(0, nh);
  const teeDist = meters.length === nh && meters.every((v) => (v ?? 0) > 0)
    ? meters.reduce((a, b) => a + (b ?? 0), 0) : null;
  const is9h = nh <= 9;
  const hi = p.hcpExact ?? null;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const round = roundNumberOf(t);
  const pos = (p as { _pos?: number })._pos;
  return {
    courseName: p.course || (rs as { course?: string } | undefined)?.course || t.campo || ctx.course || "",
    teeName: p.teeName || rs?.teeName || "",
    teeDist,
    cr, slope,
    par, scores: holeScores, si: si.length === nh ? si : [],
    meters: meters.length === nh ? meters : undefined,
    hi,
    courseHcp: hi != null ? Math.round(calcCourseHcp(hi, slope, cr, parTotal, is9h)) : null,
    sd,
    is9h,
    hasHoles: holeScores.some((v) => v != null),
    player: p.name,
    event: ctx.event || t.name || "",
    round,
    date: roundDate(t, p, round),
    position: pos && pos < 9999 ? `${pos}º` : "",
  };
}
