/*
 * overlayFromRound — monta o OverlayData (PNGs do simulador) a partir de uma
 * volta jogada num torneio, para o «📷 Partilhar volta» dos leaderboards.
 */
import type { Player, Tournament } from "../../data/fpgTypes";
import { fillBlankHoles } from "../../data/fpgUtils";
import { calcCourseHcp } from "../../utils/whsCalc";
import { MONTHS_PT, isoDate } from "../../utils/format";
import type { OverlayData } from "./types";

/** Data da fonte → Date (meio-dia, sem saltos de fuso). Segue o `isoDate` da
 *  app: ISO passa, "M/D/AAAA" é americano (USKids). */
function parseDay(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`;

/** Nº da volta a partir do `_roundLabel` ("R2") do torneio expandido. */
export function roundNumberOf(t: Tournament): number {
  const m = /^R(\d+)$/.exec(String((t as { _roundLabel?: string })._roundLabel || ""));
  return m ? Number(m[1]) : 1;
}

/** Data da volta: a da própria ronda quando vem numa data reconhecível; senão a do
 *  torneio + (volta − 1) dias. Fica vazia quando não se sabe — o utilizador
 *  escreve-a no painel. */
function roundDate(t: Tournament, p: Player, round: number, eventStart?: string): string {
  const own = parseDay((p.roundScores?.[0] as { date?: string } | undefined)?.date);
  if (own) return fmtDay(own);
  const start = parseDay(t.date) ?? parseDay(eventStart);
  if (!start) return "";
  start.setDate(start.getDate() + round - 1);
  return fmtDay(start);
}

export function overlayFromRound(
  t: Tournament, p: Player, sd: number | null,
  ctx: { event?: string; course?: string; date?: string } = {},
): OverlayData | null {
  const rs = p.roundScores?.[0];
  const par = (p.par?.length ? p.par : rs?.pars) || [];
  // Sem CR/Slope (USKids, alguns internacionais) há PNG na mesma — só sem SD/CH.
  const cr = p.courseRating ?? rs?.courseRating ?? 0;
  const slope = p.slope ?? rs?.slope ?? 0;
  const rated = cr > 0 && slope > 0;
  if (!par.length) return null;
  const nh = par.length;
  const { scores } = fillBlankHoles(p);
  const holeScores = par.map((_, i) => (scores[i] > 0 ? scores[i] : null));
  // SI só se for mesmo SI (1..nh, sem repetidos) — a USKids, sem SI, põe lá os metros.
  const siRaw = ((p.si?.length ? p.si : rs?.si) || []).slice(0, nh).map(Number);
  const si = siRaw.length === nh && new Set(siRaw).size === nh && siRaw.every((v) => v >= 1 && v <= nh) ? siRaw : [];
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
    par, scores: holeScores, si,
    meters: meters.length === nh ? meters : undefined,
    hi,
    courseHcp: hi != null && rated ? Math.round(calcCourseHcp(hi, slope, cr, parTotal, is9h)) : null,
    sd: rated ? sd : null,
    is9h,
    hasHoles: holeScores.some((v) => v != null),
    player: p.name,
    event: ctx.event || t.name || "",
    round,
    date: roundDate(t, p, round, ctx.date),
    position: pos && pos < 9999 ? `${pos}º` : "",
  };
}
