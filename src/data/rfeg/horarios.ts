/**
 * horarios.ts — Draws das fontes de Espanha (mitarjeta `teeTimes`/`teeTimesAll`,
 * livegolfscoring `_lgsHorarios`) no formato NCHorario[] do NextCaddy.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import type { RFEGDetail, NCHorario, LgsHorarioRound } from "./types";

/** Converte o draw do mitarjeta (`detail.teeTimes`: Tee/Hora/Jogadores da R1) para
 *  o MESMO shape `NCHorario[]` que o DrawSaidaView já consome → DrawTab partilhado.
 *  (O mitarjeta só publica o sorteio da R1; os draws de J2/J3 saem em PDF depois.) */
export function teeTimesToHorarios(tt?: RFEGDetail["teeTimes"]): NCHorario[] | null {
  if (!tt || !tt.groups || !tt.groups.length) return null;
  const players: NCHorario["players"] = [];
  for (const g of tt.groups) {
    const tee = typeof g.tee === "number" ? g.tee : (parseInt(String(g.tee), 10) || null);
    for (const name of g.players) {
      players.push({ time: g.time || null, tee, name, hcp: null });
    }
  }
  return players.length ? [{ round: tt.round || 1, players }] : null;
}

/** Versão multi-ronda: converte `teeTimesAll` (todas as rondas) em NCHorario[],
 *  uma entrada por ronda — alimenta o MESMO DrawTab com tabs R1/R2/R3. */
export function teeTimesAllToHorarios(all?: RFEGDetail["teeTimesAll"]): NCHorario[] | null {
  if (!Array.isArray(all) || !all.length) return null;
  const out: NCHorario[] = [];
  for (const tt of all) {
    const one = teeTimesToHorarios(tt);
    if (one && one[0] && one[0].players.length) out.push(one[0]);
  }
  return out.length ? out : null;
}

/** Converte os horarios do livegolfscoring (`_lgsHorarios`: grupos de saída por
 *  ronda — hora · buraco · jogadores) para o MESMO shape `NCHorario[]` que o
 *  DrawSaidaView → DrawTab partilhado consome. Antes o LGS usava um DrawView
 *  genérico (texto "hora · buraco · nomes"); agora usa a tabela rica da FPG. */
export function lgsHorariosToHorarios(hor?: LgsHorarioRound[] | null): NCHorario[] | null {
  if (!Array.isArray(hor) || !hor.length) return null;
  const out: NCHorario[] = [];
  for (const rd of hor) {
    const players: NCHorario["players"] = [];
    for (const g of (rd.groups || [])) {
      for (const name of (g.players || [])) {
        players.push({ time: g.teeTime || null, tee: g.startHole ?? null, name, hcp: null });
      }
    }
    if (players.length) out.push({ round: rd.round || (out.length + 1), players });
  }
  return out.length ? out : null;
}
