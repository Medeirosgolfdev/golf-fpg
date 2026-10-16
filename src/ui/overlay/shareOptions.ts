/*
 * Opções do «📷 Partilhar volta»: uma por jogador que ACABOU a volta (cartão
 * completo), ordenadas pela classificação da volta; o Manuel por omissão.
 * Servem o separador da volta (uma volta) e o Resumo/Scorecards (todas).
 */
import type { Tournament } from "../../data/fpgTypes";
import { computeRoundSD, fillBlankHoles, numGross } from "../../data/fpgUtils";
import { isManuel } from "../../constants/manuel";
import { overlayFromRound, roundNumberOf } from "./fromRound";
import type { ShareOption } from "../ShareRoundPanel";

type Ctx = { event?: string; course?: string };
export type ShareOptions = { options: ShareOption[]; defaultKey?: string };

/** Uma volta (o torneio já expandido para essa ronda). */
export function shareOptionsForRound(t: Tournament, ctx: Ctx = {}, prefix = ""): ShareOptions {
  const done = t.players.filter((p) => {
    if (p._wd) return false;
    const g = numGross(p);
    if (!(g > 0 && g < 900)) return false;
    // Cartão completo — com os buracos em branco completados pelo gross oficial,
    // como no leaderboard (1 em branco = exacto; mais = a mesma estimativa).
    const par = (p.par?.length ? p.par : p.roundScores?.[0]?.pars) || [];
    const sc = fillBlankHoles(p).scores;
    return par.length > 0 && sc.slice(0, par.length).filter((v) => v > 0).length === par.length;
  }).sort((a, b) => numGross(a) - numGross(b));
  const options: ShareOption[] = [];
  let defaultKey: string | undefined;
  done.forEach((p, i) => {
    // Posição na volta, com empates (o mesmo gross = a mesma posição).
    let pos = i + 1;
    while (pos > 1 && numGross(done[pos - 2]) === numGross(p)) pos--;
    const data = overlayFromRound(t, { ...p, _pos: pos } as typeof p, computeRoundSD(p, t.date).sd, ctx);
    if (!data) return;
    const key = `${prefix}${p.scoreId || p.name}`;
    const pid = String(p.fed || p.fedCode || p.name).toLowerCase();
    options.push({ key, label: `${prefix}${pos}º · ${p.name} — ${numGross(p)}`, data, pid });
    if (!defaultKey && isManuel(p)) defaultKey = key;
  });
  return { options, defaultKey };
}

/** Todas as voltas (Resumo / Scorecards): «R2 · 10º · Nome — 85»; por omissão
 *  a ÚLTIMA volta do Manuel. */
export function shareOptionsForRounds(rounds: Tournament[], ctx: Ctx = {}): ShareOptions {
  const options: ShareOption[] = [];
  let defaultKey: string | undefined;
  for (const r of rounds) {
    const o = shareOptionsForRound(r, ctx, `R${roundNumberOf(r)} · `);
    options.push(...o.options);
    if (o.defaultKey) defaultKey = o.defaultKey;
  }
  return { options, defaultKey };
}

/** Torneio completo (Resumo): uma opção por jogador com 2+ voltas completas —
 *  as voltas lado a lado, o total e a posição final (pelo total, entre quem
 *  tem o mesmo nº de voltas). «Torneio · 10º · Nome — 85+80 = 165». */
export function shareOptionsForTournament(rounds: Tournament[], ctx: Ctx = {}): ShareOptions {
  type Acc = { name: string; manuel: boolean; per: { r: number; data: NonNullable<ReturnType<typeof overlayFromRound>> }[] };
  const byPlayer = new Map<string, Acc>();
  for (const r of rounds) {
    const rn = roundNumberOf(r);
    for (const o of shareOptionsForRound(r, ctx).options) {
      const key = o.pid ?? o.key;
      const p = r.players.find((x) => String(x.scoreId || x.name) === o.key);
      if (!byPlayer.has(key)) byPlayer.set(key, { name: o.data.player, manuel: false, per: [] });
      const acc = byPlayer.get(key)!;
      if (p && isManuel(p)) acc.manuel = true;
      acc.per.push({ r: rn, data: o.data });
    }
  }
  const full = [...byPlayer.entries()].filter(([, a]) => a.per.length >= 2);
  const maxN = Math.max(0, ...full.map(([, a]) => a.per.length));
  const total = (a: Acc) => a.per.reduce((s, x) => s + x.data.scores.reduce<number>((t, v) => t + (v ?? 0), 0), 0);
  const ranked = full.filter(([, a]) => a.per.length === maxN).sort((x, y) => total(x[1]) - total(y[1]));
  const options: ShareOption[] = [];
  let defaultKey: string | undefined;
  ranked.forEach(([key, a], i) => {
    let pos = i + 1;
    while (pos > 1 && total(ranked[pos - 2][1]) === total(a)) pos--;
    a.per.sort((x, y) => x.r - y.r);
    const last = a.per[a.per.length - 1].data;
    const sums = a.per.map((x) => ({
      round: x.r, scores: x.data.scores.map((v) => v ?? 0), par: x.data.par,
      gross: x.data.scores.reduce<number>((t, v) => t + (v ?? 0), 0),
      toPar: x.data.scores.reduce<number>((t, v, j) => t + (v ?? 0) - (x.data.par[j] ?? 0), 0),
      date: x.data.date,
    }));
    const d0 = sums[0].date, d1 = sums[sums.length - 1].date;
    const k = `T · ${key}`;
    options.push({
      key: k,
      label: `Torneio · ${pos}º · ${a.name} — ${sums.map((x) => x.gross).join("+")} = ${total(a)}`,
      data: { ...last, sd: null, position: `${pos}º`, round: sums.length, rounds: sums,
        date: d0 && d1 && d0 !== d1 ? `${d0.replace(/ \d{4}$/, "")} – ${d1}` : d1 },
    });
    if (!defaultKey && a.manuel) defaultKey = k;
  });
  return { options, defaultKey };
}
