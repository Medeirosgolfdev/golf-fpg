/**
 * Drive utilities - expandMultiRound and related helpers
 */
import { normalizePlayer } from "../utils/playerUtils";
import type { Tournament, Player } from "./driveTypes";

/**
 * Check if a player is DNS (Did Not Start)
 */
export function isDNS(p: Player): boolean {
  const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (g != null && g >= 900) return true;
  if (String(p.pos) === "NS" && p.scores?.every((s) => s === 0)) return true;
  return false;
}

/** Expand multi-round tournaments: 1 original → R1 + R2 + Total */
export function expandMultiRound(tournaments: Tournament[]): Tournament[] {
  const out: Tournament[] = [];
  for (const t of tournaments) {
    const nRounds = t.rounds || 1;
    if (nRounds <= 1 || !t.players.some(p => p.roundScores && p.roundScores.length > 1)) {
      out.push(t);
      continue;
    }
    const groupId = t.tcode + "_" + t.date; // inclui data para ser único entre anos

    // Generate a per-round entry for each round
    for (let rd = 1; rd <= nRounds; rd++) {
      const rdPlayers: Player[] = [];
      for (const p of t.players) {
        const rs = p.roundScores?.find(r => r.round === rd);
        if (!rs) continue;
        const parT = p.parTotal || rs.pars.reduce((a, b) => a + b, 0);
        rdPlayers.push(normalizePlayer({
          ...p,
          scoreId: p.scoreId + "_R" + rd,
          grossTotal: rs.gross,
          toPar: rs.gross - parT,
          scores: rs.scores,
          par: rs.pars,
          si: rs.si,
          meters: rs.meters,
          courseRating: rs.courseRating,
          slope: rs.slope,
          teeName: rs.teeName,
          roundScores: [rs],
        }));
      }
      // Sort by gross for position
      rdPlayers.sort((a, b) => ((a.grossTotal as number) || 999) - ((b.grossTotal as number) || 999));
      let pos = 1;
      rdPlayers.forEach((p, i) => {
        if (i > 0 && (p.grossTotal as number) !== (rdPlayers[i - 1].grossTotal as number)) pos = i + 1;
        p.pos = pos;
      });
      out.push({
        ...t,
        name: t.name + " (R" + rd + ")",
        tcode: t.tcode + "_R" + rd,
        playerCount: rdPlayers.length,
        players: rdPlayers,
        rounds: 1,
        _multiGroup: groupId,
        _roundLabel: "R" + rd,
        _totalRounds: nRounds,
      });
    }

    // Also keep the original combined entry — but fix player ranking
    // playedRoundsMax = máximo de rondas VÁLIDAS jogadas por qualquer jogador
    // (evita marcar todos como incompletos quando ainda faltam rondas futuras)
    const playedRoundsMax = Math.max(0, ...t.players.map(p =>
      (p.roundScores?.filter(rs =>
        rs.gross < 999 && !(rs.scores?.length && rs.scores.every((s: number) => s === 0))
      ).length ?? 0)
    ));

    const totalPlayers = t.players.map(p => {
      // Rondas válidas: excluir WD (gross>=999 ou scorecard todo zeros)
      const validRounds = (p.roundScores || []).filter(rs =>
        rs.gross < 999 && !(rs.scores?.length && rs.scores.every((s: number) => s === 0))
      );
      const playedRounds2 = validRounds.length;
      const isWD = playedRounds2 < (p.roundScores?.length || 0);
      // "incompleto" = menos rondas válidas que o máximo disponível, sem ser WD
      const incomplete = !isWD && playedRounds2 < playedRoundsMax;

      let combinedPar = 0;
      for (const rs of validRounds) {
        if (rs.pars && rs.pars.length > 0) combinedPar += rs.pars.reduce((a: number, b: number) => a + b, 0);
      }
      if (combinedPar === 0) combinedPar = (p.parTotal || 72) * playedRounds2;

      const gross = validRounds.reduce((s: number, rs) => s + rs.gross, 0);

      return {
        ...p,
        grossTotal: gross,
        _incomplete: incomplete,
        _wd: isWD,
        _roundsPlayed: playedRounds2,
        parTotal: combinedPar,
        nholes: (p.nholes || 18) * playedRounds2,
        toPar: gross - combinedPar,
      };
    });

    // Sort: completos por gross → incompletos → WD no fim
    totalPlayers.sort((a, b) => {
      if (a._wd && !b._wd) return 1;
      if (!a._wd && b._wd) return -1;
      if (a._incomplete && !b._incomplete) return 1;
      if (!a._incomplete && b._incomplete) return -1;
      const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
      const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
      return ag - bg;
    });
    // Posições só para jogadores completos e não-WD
    let pos = 1;
    totalPlayers.forEach((p, i) => {
      if (p._wd) {
        p.pos = "WD";
      } else if (p._incomplete || isDNS(p)) {
        p.pos = p._incomplete ? "INC" : (p.pos || "NS");
      } else {
        if (i > 0) {
          const prev = totalPlayers[i - 1];
          if (!prev._incomplete && !isDNS(prev) && !prev._wd) {
            const ag = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number ?? 999);
            const bg = typeof prev.grossTotal === "string" ? parseInt(prev.grossTotal) : (prev.grossTotal as number ?? 999);
            if (ag !== bg) pos = i + 1;
          }
        }
        p.pos = pos;
      }
    });

    out.push({
      ...t,
      name: t.name + " (Total)",
      tcode: t.tcode + "_Total",
      players: totalPlayers,
      _multiGroup: groupId,
      _roundLabel: "Resumo",
      _totalRounds: nRounds,
    });
  }
  return out;
}
