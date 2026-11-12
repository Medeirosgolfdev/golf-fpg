/**
 * Drive utilities - expandMultiRound and related helpers
 */
import { expandMultiRound as expandMultiRoundOne, numGross } from "../data/fpgUtils";
import { isNoCardGross } from "../data/intlCommon";
import type { Tournament, Player } from "./driveTypes";
import { soma, somaDe } from "../utils/mathUtils";

/**
 * Check if a player is DNS (Did Not Start)
 */
export function isDNS(p: Player): boolean {
  const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (isNoCardGross(g)) return true;
  if (String(p.pos) === "NS" && p.scores?.every((s) => s === 0)) return true;
  return false;
}

/** Expand multi-round tournaments: 1 original → R1 + R2 + Total.
 *  As contas (rondas válidas, WD, voltas a decorrer, cut, par jogado) vivem só
 *  no `expandMultiRound` de data/fpgUtils; aqui só se dá a forma que a /drive
 *  usa (nome «(R1)»/«(Total)», `_multiGroup`, `pos` em texto: WD/CUT/INC/NS). */
export function expandMultiRound(tournaments: Tournament[]): Tournament[] {
  const out: Tournament[] = [];
  for (const t of tournaments) {
    const parts = expandMultiRoundOne(t);
    if (parts.length <= 1) { out.push(t); continue; }
    const nRounds = t.rounds || 1;
    const groupId = t.tcode + "_" + t.date; // inclui data para ser único entre anos
    for (const e of parts as (Tournament & { _isTotal?: boolean })[]) {
      if (!e._isTotal) {
        const rd = String(e._roundLabel || "").replace(/^R/, "");
        const rdPlayers = e.players.map(p => ({ ...p }));
        let pos = 1;
        rdPlayers.forEach((p, i) => {
          if (i > 0 && numGross(p) !== numGross(rdPlayers[i - 1])) pos = i + 1;
          p.pos = pos;
        });
        out.push({
          ...e,
          name: t.name + " (R" + rd + ")",
          tcode: t.tcode + "_R" + rd,
          playerCount: rdPlayers.length,
          players: rdPlayers,
          rounds: 1,
          _multiGroup: groupId,
          _roundLabel: "R" + rd,
          _totalRounds: nRounds,
        });
        continue;
      }
      const players: Player[] = e.players.map(p => {
        const pa = p as Player & { _pos?: number | null; _cut?: boolean; _roundsPlayed?: number };
        const valid = (p.roundScores || []).filter(rs =>
          !isNoCardGross(rs.gross) && !(rs.scores?.length && rs.scores.every((s: number) => s === 0)));
        const n = pa._roundsPlayed ?? valid.length;
        // Par combinado só do que existe (sem par não se inventa — nada de 72).
        const combinedPar = somaDe(valid, rs => (rs.pars?.length ? soma(rs.pars) : 0));
        return {
          ...p,
          pos: p._wd ? "WD" : pa._cut ? "CUT" : p._incomplete ? "INC" : isDNS(p) ? (p.pos || "NS") : (pa._pos ?? p.pos),
          parTotal: combinedPar || (p.parTotal ? p.parTotal * n : p.parTotal),
          nholes: (p.nholes || 18) * n,
        };
      });
      // Inscritos sem nenhuma volta: a função comum deixa-os de fora; a /drive
      // mostra-os no Total como «INC» (antes dos WD).
      const inTotal = new Set(players.map(p => p.scoreId));
      const notPlayed = t.players.filter(p => !inTotal.has(p.scoreId))
        .map((p): Player => ({ ...p, pos: p._wd ? "WD" : "INC", _incomplete: !p._wd }));
      const firstWd = players.findIndex(p => p._wd);
      if (firstWd < 0) players.push(...notPlayed); else players.splice(firstWd, 0, ...notPlayed);
      out.push({
        ...e,
        name: t.name + " (Total)",
        tcode: t.tcode + "_Total",
        players,
        _multiGroup: groupId,
        _roundLabel: "Resumo",
        _totalRounds: nRounds,
      });
    }
  }
  return out;
}
