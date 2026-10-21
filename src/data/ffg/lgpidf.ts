/**
 * lgpidf.ts — LGPIDF (PDFs Paris-Île-de-France) para os componentes
 * partilhados: inscritos → AdmissionsTab, tee times → DrawTab, leaderboard (só
 * totais) → TotalsResumo.
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import type { FpgDraw, FpgDrawFlight, FpgAdmissions, FpgAdmissionPlayer } from "../nacional2026Loader";
import { normalizeName, ffgCountry } from "./names";
import type { LGPIDFTournament } from "./types";

export function lgpidfAdmissions(data: LGPIDFTournament): FpgAdmissions | undefined {
  const players: FpgAdmissionPlayer[] = data.inscritosPdfs.flatMap((pdf) => pdf.players.map((p): FpgAdmissionPlayer => ({
    pos: p.rank, fed: null, nome: normalizeName(p.name), clube: p.club || null, hcp: p.hcp,
    vac: null, dataInscricao: null, status: "confirmed",
    country: ffgCountry(p as { nationality?: string | null }), escalao: p.category ?? pdf.category ?? null,
    tags: [p.wildCard && "WC", p.scratch && "SCR"].filter(Boolean) as string[],
  })));
  return players.length ? { players, totalInscritos: players.length } : undefined;
}

/** Um PDF de horários por volta (pela ordem publicada). */
export function lgpidfDraws(data: LGPIDFTournament): FpgDraw[] {
  return data.teeTimePdfs.map((pdf) => ({
    groups: pdf.groups.map((g): FpgDrawFlight => ({
      teeTime: g.players.find((p) => p.teeTime)?.teeTime ?? "",
      startHole: g.players.find((p) => p.startHole != null)?.startHole ?? null,
      tee: null,
      players: g.players.map((p) => ({ nome: normalizeName(p.name), clube: p.club || null, hcp: p.hcp ?? null })),
    })),
  }));
}

/** Par 72 assumido (18 buracos — standard nos Grand Prix Jeunes franceses):
 *  o PDF de resultados não traz o par. */
export function lgpidfTotais(data: LGPIDFTournament) {
  return data.players.map((p) => ({ name: normalizeName(p.name), country: p.country ?? null, club: p.club ?? null,
    hcp: p.hcp ?? null, pos: p.pos ?? null, rounds: [p.r1 ?? null, p.r2 ?? null].slice(0, data.rounds || 2), total: p.total ?? null }));
}
