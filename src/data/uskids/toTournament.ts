/**
 * toTournament.ts — Conversores USKids → formatos da FPG: escalão com resultados
 * → Tournament, draws → FpgDraw (como dados), inscritos → FpgAdmissions, e quem
 * é o Manuel em cada escalão.
 *
 * Tirado de src/pages/uskids/uskidsCircuit.tsx a 23/10/2026 (fase 5 do plano) —
 * igual ao que estava lá.
 */
import type { Tournament as TATournament } from "../fpgTypes";
import type { FpgAdmissionPlayer, FpgAdmissions, FpgDraw } from "../nacional2026Loader";
import { normName as normNameAuto, type AutoRivalPlayer } from "../KIDSdataLoader";
import { playerIdentity } from "../model/identity";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../../constants/manuel";
import { displayName, norm } from "../../utils/format";
import { flag } from "../../utils/flagUtils";
import { TEES_LOOKUP, isWD } from "../../ui/USKIDSPageHelpers";
import type { Torneio, TorneioResult, EscalaoResult, UskidsDrawsData, UskidsDrawRonda } from "../../ui/uskidsTypes";
import type { CircuitRoundDraw } from "../../ui/circuit/types";

export type FieldEscalao = Torneio["escaloes"][number];

// ─────────────────────────────────────────────
// Escalão com resultados → Tournament (formato FPG)
// ─────────────────────────────────────────────

/** Campo do escalão: o das voltas (no World cada escalão joga noutro campo e o
 *  `campo` do torneio é a lista de todos). */
export function campoEscalao(esc: EscalaoResult): string {
  const voltas = [...new Set(esc.rondas.map(r => (r as { campo?: string }).campo).filter(Boolean))];
  return esc.campo || voltas.join(" / ");
}

export const temDados = (esc: EscalaoResult) => esc.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

export function escalaoToTournament(
  e: EscalaoResult,
  t: TorneioResult,
  arMap?: Map<string, AutoRivalPlayer>,
): TATournament {
  const teeInfo = TEES_LOOKUP[t.t]?.[e.age_group];
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

  // Colectar todos os jogadores de todas as rondas
  const playerMap = new Map<string, any>();

  for (const r of rondasComDados) {
    const lb = r.leaderboard ?? r.jogadores ?? [];
    const buracos = r.buracos || 18;
    // par por buraco: só usar se tiver dados reais — nunca inventar
    const par: number[] =
      teeInfo?.par.length === buracos ? teeInfo.par :
      r.par?.length === buracos ? r.par :
      [];  // desconhecido → ScoreCircles sem cor vs par
    const parKnown = par.length === buracos;
    const si: number[] = r.si?.length === buracos ? r.si : [];
    const meters: number[] =
      teeInfo?.metros?.length === buracos ? teeInfo.metros :
      (r.metros?.length === buracos ? r.metros : Array(buracos).fill(0));
    const hasSI = si.some(v => v > 0);
    // Para USKids: se não há SI real, usar metros na linha que normalmente seria SI
    const siForDisplay: number[] = hasSI ? si : meters;
    const parPerRound = parKnown ? par.reduce((s, p) => s + p, 0) : null;

    for (const j of lb) {
      const key = j.nome.toLowerCase().trim();
      const strokes: number[] = j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []);
      if (!playerMap.has(key)) {
        // Lookup HCP FPG (só jogadores PT federados — via arMap → fpgHcpExact).
        // Quando disponível, computeSD() vai pelo ramo AGS (Net Double Bogey)
        // e devolve source="ags" — SD exacto em vez de "raw".
        let hcpExact: number | undefined;
        let fpgFed: string | undefined;
        if (arMap && j.pais === "PT") {
          const ar = arMap.get(normNameAuto(j.nome));
          if (ar?.fpgHcpExact != null) hcpExact = ar.fpgHcpExact;
          if (ar?.ptFed) fpgFed = ar.ptFed;
        }
        playerMap.set(key, {
          scoreId: j.nome,
          pos: null,
          name: displayName(j.nome),
          club: flag(j.pais) + " " + j.pais,
          grossTotal: 0,
          toPar: null,
          par, si: siForDisplay, meters,
          parTotal: 0,
          nholes: buracos,
          // Course Rating / Slope (quando disponíveis no TEES_LOOKUP) —
          // necessários para o cálculo de SD em computeSD().
          courseRating: teeInfo?.cr,
          slope: teeInfo?.slope,
          teeName: teeInfo?.tee,
          course: teeInfo?.campo,
          // HCP FPG do jogador (só PT com licença federativa) — permite SD AGS exacto.
          hcpExact,
          fedCode: fpgFed,
          roundScores: [],
          _wd: false,
          // Modelo comum (src/data/model): país, sexo e escalão do jogador.
          identity: playerIdentity({ pais: j.pais }, { sex: sexoEscalao(e.nome), escalao: e.nome, escalaoSource: "uskids" }),
        });
      }
      const p = playerMap.get(key)!;
      p.grossTotal += j.score || 0;
      if (parPerRound !== null) p.parTotal = parPerRound;  // par de UMA ronda — expandMultiRound multiplica por nPlayed
      p.roundScores.push({
        round: r.ronda,
        gross: j.score || 0,
        scores: strokes,
        pars: par,
        si: siForDisplay,
        meters,
        // CR/Slope/teeName por ronda — expandMultiRound usa estes valores
        // ao criar as views per-round (sem isto, o computeSD da R1/R2/R3
        // não tem dados e devolve null → coluna SD fica "—").
        courseRating: teeInfo?.cr,
        slope: teeInfo?.slope,
        teeName: teeInfo?.tee,
      });
      // scores / par / si do primeiro round (para ScorecardLB de ronda única)
      if (r.ronda === rondasComDados[0].ronda) {
        p.scores = strokes;
      }
    }
  }

  // WD players ficam no fundo da tabela — marcados com _wd para o sort em expandMultiRound
  const allPlayersRaw = [...playerMap.values()];
  for (const p of allPlayersRaw) {
    const allScores: number[] = p.roundScores.flatMap((rs: any) => rs.scores ?? []);
    const totalGross: number = typeof p.grossTotal === 'number' ? p.grossTotal : 0;
    p._wd = isWD(totalGross, allScores);
  }
  const players = [
    ...allPlayersRaw.filter(p => !p._wd),
    ...allPlayersRaw.filter(p =>  p._wd),
  ];
  return {
    name: `${t.name} — ${e.nome}`,
    tcode: `${t.t}-${e.age_group}`,
    date: t.date_inicio,
    campo: teeInfo?.campo || campoEscalao(e) || t.campo || "",
    rounds: rondasComDados.length,
    playerCount: players.filter(p => !p._wd).length,
    players,
  } as any;
}

/** Draw de uma volta USKids → formato FPG (DrawTab partilhado). A cidade vai
 *  na coluna do clube; o país dá a bandeira. */
function uskidsDrawToFpg(dr: UskidsDrawRonda): FpgDraw {
  return {
    groups: dr.grupos.map((g) => ({
      teeTime: g.tee_time, startHole: g.start_hole ?? null, tee: null,
      players: g.jogadores.map((j) => ({ nome: displayName(j.nome), clube: j.cidade || null, country: j.pais || null })),
    })),
  };
}

/** Resultado de cada jogador numa volta (para as colunas ±/Tot do draw), por
 *  nome normalizado. Sem ±par na fonte, calcula-o com o par da volta. */
function uskidsRoundResults(e: EscalaoResult | null, ronda: number): Map<string, { gross: number; toPar: number | null }> {
  const m = new Map<string, { gross: number; toPar: number | null }>();
  const r = e?.rondas.find((x) => x.ronda === ronda);
  if (!r) return m;
  const parTotal = r.total_par ?? (r.par?.length ? r.par.reduce((s, v) => s + (v || 0), 0) : null);
  for (const j of r.leaderboard ?? r.jogadores ?? []) {
    if (!j.nome || !(j.score > 0)) continue;
    const toPar = j.to_par ?? (parTotal ? j.score - parTotal : null);
    m.set(norm(displayName(j.nome)), { gross: j.score, toPar });
  }
  return m;
}

const DRAW_HIDE = { esc: true, fed: true, hcp: true, tee: true, nasc: true };

/** Draws de um escalão como DADOS (o shell/TournamentDetail desenham o DrawTab). */
export function roundDrawsOf(drawsData: UskidsDrawsData | null | undefined, t: number, ageGroup: number, e: EscalaoResult | null, date: string): CircuitRoundDraw[] | undefined {
  const td = drawsData?.torneios.find(x => x.t === t);
  const de = td?.escaloes.find(x => x.age_group === ageGroup);
  const rondas = (de?.rondas ?? []).filter(r => (r.grupos || []).length > 0);
  if (!rondas.length) return undefined;
  return rondas.map(dr => ({
    round: dr.ronda,
    draw: uskidsDrawToFpg(dr), tournamentDate: date,
    results: uskidsRoundResults(e, dr.ronda), hideCols: DRAW_HIDE, clubLabel: "Cidade",
  }));
}

/** O Manuel jogou este escalão? Primeiro pelo NOME nas classificações (o mais
 *  fiável — o Paris 2026 abria no Boys 7 porque o escalão «esperado» pela idade
 *  não batia, 14/10/2026); sem ele, a marcação da fonte como antes. */
export function escalaoTemManuel(e: EscalaoResult, t: TorneioResult): boolean {
  if (e.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).some(j => isManuel(j.nome)))) return true;
  return t.escalao_manuel ? e.age_group === t.escalao_manuel
    : (e.is_manuel === true && e.age_group === escalaoManuelParaData(t.date_inicio));
}

/** Inscritos de um escalão (uskids-field.json) → formato FPG (AdmissionsTab).
 *  Os desinscritos ficam na lista, marcados. */
export function fieldAdmissions(e: FieldEscalao): FpgAdmissions | undefined {
  const base = { fed: null, hcp: null, vac: null, dataInscricao: null, escalao: e.nome } as const;
  const players: FpgAdmissionPlayer[] = [
    ...(e.jogadores ?? []).map((j, i): FpgAdmissionPlayer => ({
      ...base, pos: i + 1, nome: displayName(j.nome), clube: j.cidade || null, country: j.pais || null, status: "confirmed",
    })),
    ...(e.removed ?? []).map((r): FpgAdmissionPlayer => ({
      ...base, pos: null, nome: displayName(r.nome), clube: null, country: r.pais || null,
      status: "desistente", desinscritoEm: r.removedAt ? r.removedAt.slice(0, 10) : null,
    })),
  ];
  if (!players.length) return undefined;
  return { name: e.nome, totalInscritos: e.inscritos, reservas: 0, players };
}

/** Sexo pelo nome do escalão USKids. */
export const sexoEscalao = (nome: string) => (/girls/i.test(nome) ? "F" as const : /boys/i.test(nome) ? "M" as const : undefined);
