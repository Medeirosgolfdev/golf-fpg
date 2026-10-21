/**
 * roundDraw.ts — Draw de uma volta de Espanha no formato FpgDraw do DrawTab
 * partilhado (= FPG). NextCaddy → `_ncHorarios`; livegolfscoring →
 * `_lgsHorarios`; mitarjeta (CEE) → `teeTimes`/`teeTimesAll`. Todos passam por
 * NCHorario[] e são enriquecidos com o que o leaderboard sabe de cada jogador
 * (federado, nascimento, clube, HCP, país, resultado da volta).
 *
 * Tirado do DrawSaidaView da RFEGPage a 21/10/2026 — comportamento igual.
 */
import { displayName, norm } from "../../utils/format";
import { formatPlayerName } from "../../utils/playerUtils";
import type { FpgDraw, FpgDrawFlight } from "../nacional2026Loader";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import type { RFEGDetail, RFEGIndexEntry, NCHorario, LgsHorarioRound, LgsRound } from "./types";
import { esDateToIso } from "./text";
import { escaloEsForPlayer } from "./escalao";
import { lgsHorariosToHorarios, teeTimesAllToHorarios, teeTimesToHorarios } from "./horarios";

/** O detalhe já adaptado, com os extras que cada fonte acrescenta. */
export type RfegDrawDetail = RFEGDetail & {
  _ncHorarios?: NCHorario[] | null;
  _lgsHorarios?: LgsHorarioRound[] | null;
  _teeMetersByIns?: Record<string, number>;
  _drawInfoByIns?: Record<string, { dob: string | null; name: string | null; rounds: { round: number; gross: number | null; toPar: number | null }[] }>;
};

export interface RfegRoundDraw {
  /** Todas as voltas com draw (vazio → sem tee times publicados). */
  horarios: NCHorario[] | null;
  /** O draw da volta pedida (ou da 1.ª, se essa não existir); null sem jogadores. */
  draw: FpgDraw | null;
  playersDB: PlayersDB;
  /** Resultado da volta por federado/jid e por nome normalizado. */
  results: Map<string, { gross: number; toPar: number | null }>;
  tournamentDate: string | null;
}

/** Os horários de todas as voltas, seja qual for a fonte. */
export function rfegHorarios(detail: RfegDrawDetail): NCHorario[] | null {
  return detail._ncHorarios ?? lgsHorariosToHorarios(detail._lgsHorarios)
    ?? teeTimesAllToHorarios(detail.teeTimesAll) ?? teeTimesToHorarios(detail.teeTimes);
}

export function rfegRoundDraw(detail: RfegDrawDetail, entry: RFEGIndexEntry, round: number): RfegRoundDraw {
  const teeByIns = detail._teeMetersByIns || {};
  const drawInfo = detail._drawInfoByIns || {};
  const horarios = rfegHorarios(detail);
  const isNc = !!detail._ncHorarios;

  // mitarjeta (CEE) e livegolfscoring: o draw dos tee times só traz NOMES.
  // Enriquecemos por nome a partir do leaderboard (detail.results) — fed / dob /
  // clube / HCP / país — para preencher as MESMAS colunas que o DrawTab mostra
  // na FPG.
  //
  // ⚠ A chave tem de existir nas DUAS ordens do nome. A fonte escreve
  // "MORTON, Frankie" e o DrawTab pesquisa com `norm(p.nome)`, onde `p.nome` já
  // passou por `formatPlayerName` → "Frankie Morton". Só com a primeira chave o
  // cruzamento falhava em TODA a gente e as colunas ±/Tot ficavam a "–".
  type Info = { name: string; fed: string | null; dobIso: string | null; club: string | null; hcp: number | null; gross: number; toPar: number | null; country: string | null };
  const mitaByName = new Map<string, Info>();
  if (!isNc) {
    const grp = (detail.results || []).find((r) => r.players && r.players.length > 0);
    for (const p of (grp?.players || [])) {
      const r1 = Array.isArray(p.rounds) ? (p.rounds.find((g) => g != null && g > 0) ?? 0) : 0;
      const info: Info = {
        name: formatPlayerName(p.name),
        fed: p.licencia || null,
        dobIso: esDateToIso(p.dob),
        club: p.club || null,
        hcp: typeof p.hcp === "number" ? p.hcp : null,
        gross: r1,
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        country: ((p as { country?: string | null }).country) || null,
      };
      for (const k of [norm(p.name), norm(formatPlayerName(p.name))]) {
        if (k && !mitaByName.has(k)) mitaByName.set(k, info);
      }
    }
  }

  // Gross de CADA ronda por jogador (livegolfscoring). O `mitaByName` só guarda
  // "a primeira ronda com valor", o que servia o mitarjeta (1 ronda) mas fazia o
  // draw da R2 mostrar os resultados da R1 — e a R1 ficar sem nenhum quando o
  // cruzamento por nome falhava. Aqui a ronda é explícita (`r.round`).
  const lgsGrossByRound = new Map<number, Map<string, { gross: number; toPar: number | null }>>();
  const lgsRounds = (detail as { _lgsRounds?: LgsRound[] })._lgsRounds;
  if (Array.isArray(lgsRounds)) {
    const parTotal = Array.isArray(detail.coursePar) && detail.coursePar.length
      ? detail.coursePar.reduce((a: number, b) => a + (b || 0), 0)
      : null;
    for (const r of lgsRounds) {
      const m = new Map<string, { gross: number; toPar: number | null }>();
      for (const p of (r.players || [])) {
        if (p.total == null || p.total <= 0 || p.total >= 999) continue;
        // ±par DESTA ronda (gross − par do campo). O `toPar` do leaderboard é o
        // acumulado do torneio e no draw de uma ronda seria enganador.
        const rec = { gross: p.total, toPar: parTotal != null ? p.total - parTotal : null };
        for (const k of [norm(p.name), norm(formatPlayerName(p.name))]) if (k && !m.has(k)) m.set(k, rec);
      }
      if (m.size) lgsGrossByRound.set(r.round, m);
    }
  }

  // Enriquecer como a FPG: playersDB (escalão via dob) + resultados ±/Tot da ronda.
  // NextCaddy cruza o jogador do draw (jid) com o leaderboard via inscribedId (ins);
  // mitarjeta cruza por nome (mitaByName).
  const playersDB: PlayersDB = {};
  if (isNc) {
    for (const rd of (horarios || [])) {
      for (const p of rd.players) {
        if (!p.jid || !p.ins) continue;
        const info = drawInfo[String(p.ins)];
        if (!info) continue;
        const esc = escaloEsForPlayer(null, info.dob, detail.meta.dateStart) || undefined;
        playersDB[p.jid] = { dob: info.dob || undefined, escalao: esc, name: info.name || undefined, country: "ES" };
      }
    }
  } else {
    // mitarjeta/LGS: dob (ISO) por fed → o DrawTab calcula ESC + Nasc.
    // ⚠ Só entram jogadores COM licença: as chaves do playersDB são lidas
    // como federados (o DrawTab resolve o fed por nome a partir daqui), por
    // isso uma chave sintética para os estrangeiros aparecia como número de
    // federado na coluna FED. O país deles vai na própria linha do draw.
    for (const info of mitaByName.values()) {
      if (info.fed) playersDB[info.fed] = { dob: info.dobIso || undefined, country: info.country || "ES" };
    }
  }

  const results = new Map<string, { gross: number; toPar: number | null }>();
  if (isNc) {
    const rd = (horarios || []).find((x) => x.round === round) || (horarios || [])[0];
    for (const p of (rd?.players || [])) {
      if (!p.jid || !p.ins) continue;
      const rr = drawInfo[String(p.ins)]?.rounds.find((x) => x.round === round);
      if (rr && rr.gross != null) results.set(p.jid, { gross: rr.gross, toPar: rr.toPar });
    }
  } else if (lgsGrossByRound.size) {
    // livegolfscoring: o gross é o DA RONDA que este draw mostra. Uma ronda
    // ainda por jogar não tem entrada → colunas ±/Tot a "–", como deve ser.
    const byName = lgsGrossByRound.get(round);
    if (byName) {
      for (const [key, rec] of byName) results.set(key, rec);
      for (const [key, info] of mitaByName) {
        const rec = byName.get(key);
        if (rec && info.fed) results.set(info.fed, rec);
      }
    }
  } else {
    // mitarjeta só tem R1 — indexar por fed (autoritativo) E por nome normalizado.
    for (const [key, info] of mitaByName) {
      if (info.gross > 0) {
        const rec = { gross: info.gross, toPar: info.toPar };
        if (info.fed) results.set(info.fed, rec);
        results.set(key, rec);
      }
    }
  }

  // FpgDraw da ronda pedida: agrupar por (hora, buraco de saída) → flights.
  let draw: FpgDraw | null = null;
  const r = horarios && horarios.length ? (horarios.find((rd) => rd.round === round) || horarios[0]) : null;
  if (r && r.players && r.players.length > 0) {
    const flights: FpgDrawFlight[] = [];
    let curKey = "";
    for (const p of r.players) {
      const k = `${p.time}|${p.tee}`;
      if (k !== curKey) {
        flights.push({
          teeTime: p.time || "",
          startHole: p.tee != null ? p.tee : null,
          tee: null,
          players: [],
        });
        curKey = k;
      }
      const dist = p.ins ? teeByIns[String(p.ins)] : undefined;   // distância do tee (cruzada do cartão)
      const info = isNc ? undefined : mitaByName.get(norm(p.name)); // mitarjeta: cruzar por nome
      flights[flights.length - 1].players.push({
        nome: formatPlayerName(p.name),
        clube: info?.club ? displayName(info.club) : null,   // NC não expõe clube; mitarjeta sim
        fed: isNc ? (p.jid || null) : (info?.fed || null),   // jid NC / licencia mitarjeta
        hcp: isNc ? p.hcp : (info?.hcp ?? null),
        tee: dist ? `${dist} m` : null, // DrawTab mostra p.tee — aqui a distância do jogador (NC)
        // Conterrâneos destacados como nos draws internacionais do MAJOR
        // (`.row-portuguese`) — num campo de 120 é o que os torna visíveis.
        isPortuguese: info?.country === "PT",
        country: info?.country || null,
      });
    }
    draw = {
      name: detail.meta.name || `Tour ${entry.id}`,
      date: detail.meta.dateStart || undefined,
      totalJogadores: r.players.length,
      groups: flights,
    };
  }

  return {
    horarios,
    draw,
    playersDB,
    results,
    tournamentDate: esDateToIso(detail.meta.dateStart) ?? detail.meta.dateStart,
  };
}
