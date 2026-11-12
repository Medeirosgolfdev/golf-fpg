/**
 * src/data/drive/driveSub12.ts — contas do Ranking Sub-12 do Drive e do filtro
 * «Classificação» por escalão (saíram da DrivePage; sem React).
 *
 * Escalão de cada jogador num torneio: `resolveEscForTournament` (data de
 * nascimento → histórico → lookup temporal → actual; em último recurso o escalão
 * do próprio torneio Challenge). Pontos: `constants/drivePoints.ts`.
 */
import { ESCALOES_DRIVE as ESCALOES } from "../../constants/escaloes";
import { tournamentPoints, rankingTotal, aquaporPlaces } from "../../constants/drivePoints";
import { resolveEsc, computeSD, computeRoundSDs, type TemporalEscLookup } from "../fpgUtils";
import { isDNS } from "../../ui/driveUtils";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import type { Tournament, Player, TStats, Sub12Row, EscLookup } from "../../ui/driveTypes";
import type { CircuitDivision, CircuitEntry } from "../../ui/circuit/types";
import { escalaoCanon, escaloesCanon } from "../model/escalao";
import { isManuelByName } from "../../constants/manuel";
import { isNoCardGross } from "../intlCommon";
import { distFromCards } from "../../utils/analysisStats";
import { soma, round1, somaDe } from "../../utils/mathUtils";
import { classificarPorTotal, parsePos, temCartao, voltasComCartao } from "../../utils/classificacao";

export type Sub12SeriesTab = "tour" | "challenge" | "aquapor";

export function computeStats(p: Player, date?: string | null): TStats | null {
  if (isDNS(p)) return null;
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  // 0 = sem volta nenhuma (o Resumo de quem desistiu na 1.ª): não há cartão.
  if (gross == null || isNaN(gross as number) || (gross as number) <= 0) return null;
  const g = gross as number;

  // Flat fields may be absent when player uses roundScores format;
  // fall back to roundScores[0] for single-round tournaments
  const rs0 = p.roundScores?.[0];
  const parArr = p.par?.length ? p.par : rs0?.pars || [];
  const scores = p.scores?.length ? p.scores : rs0?.scores || [];

  const parT = p.parTotal || soma(parArr);
  const tp = g - parT;
  const nh = p.nholes || scores.length || parArr.length || 18;
  // SD: o oficial da FPG, ou o calculado com o HCP da inscrição (ver computeSD).
  // Numa prova de várias voltas o acumulado não tem SD — conta o de CADA volta
  // (o Best SD é a melhor volta; o SD da prova, a média delas).
  const rawSds = (p.roundScores?.length ?? 0) > 1
    ? computeRoundSDs(p, date)
    : [nh <= 18
      ? computeSD({
          ...p, scores, par: parArr, si: p.si?.length ? p.si : rs0?.si || [],
          courseRating: p.courseRating ?? rs0?.courseRating, slope: p.slope ?? rs0?.slope,
          pcc: p.pcc ?? rs0?.pcc, nholes: nh,
        }, date).sd
      : null];
  const sds = rawSds.filter((x): x is number => x != null).map(round1);
  const sd = sds.length ? Math.round((soma(sds) / sds.length) * 10) / 10 : null;

  // Birdies (ou melhor), pares e bogeys (ou pior) de todas as voltas — contas em
  // utils/analysisStats. Antes contava-se aqui à mão SEM saltar os buracos por
  // jogar: numa volta de 9 guardada com 18 posições cada zero saía como birdie.
  const dist = distFromCards(p.roundScores && p.roundScores.length > 1
    ? p.roundScores.map((rs) => ({ scores: rs.scores || [], par: rs.pars || [] }))
    : [{ scores, par: parArr }]);
  const birdies = dist.eagles + dist.birdies, pars = dist.pars, bogeys = dist.bogeys + dist.dbPlus;
  return { pos: p.pos, gross: g, toPar: tp, sd, sds, roundSds: rawSds.map(x => x == null ? null : round1(x)),
    nholes: nh, birdies, pars, bogeys };
}

export function uniquePC(ts: Tournament[]): number {
  const s = new Set<string>();
  for (const t of ts) for (const p of t.players) if (!isDNS(p)) s.add(p.fed || p.name);
  return s.size;
}
export function countEvents(ts: Tournament[]): number {
  const s = new Set<string>();
  for (const t of ts) {
    // Para torneios multi-ronda expandidos, contar só o grupo uma vez
    const key = t._multiGroup || (t.region + "-" + t.num + "-" + t.date);
    s.add(key);
  }
  return s.size;
}

/* ── Escalão helpers ──────────────────────────────────────────────
 * Para resolução de escalão por jogador, usamos `resolveEsc` de fpgUtils
 * (fonte única de verdade — prioridade: DOB+data → historic → temporalLookup → escLookup).
 *
 * `buildTemporalEscLookup` vive em fpgUtils e cobre Challenge tournaments.
 *
 * As funções abaixo são adaptadores específicos do Drive:
 *  - `resolveEscForRow(p, t, ...)` — escalão para mostrar na linha do torneio `t`
 *     (escalaoAtDate é prioritário; se Drive Challenge (t.escalao) e sem DOB, usa t.escalao)
 *  - `availEscaloes` e `filterTournByEsc` — helpers de UI (lista/filtro)
 */

/** Wrapper canónico: escalão do jogador no contexto do torneio (com todos os fallbacks). */
export function resolveEscForTournament(
  p: Player,
  t: Tournament,
  escLookup: EscLookup,
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>
): string {
  // Tentar via DOB (regra FPG year-based) + historic + temporal + actual.
  // `fedBirthdates` (federados.json) cobre Sub-10 e novos registos que não
  // estão em `players.json` curado — sem ele, torneios combinados herdam o
  // escalão base errado.
  const viaResolve = resolveEsc(p, escLookup, {
    tournamentDate: t.date,
    playersDB,
    temporalEscLookup,
    fedBirthdates,
  });
  if (viaResolve) return viaResolve;
  // Último recurso: se o torneio tem escalão explícito (Drive Challenge), usa-o
  if (t.escalao) return t.escalao;
  return "";
}

export function availEscaloes(
  tournaments: Tournament[],
  escLookup: EscLookup,
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>
): string[] {
  const s = new Set<string>();
  for (const t of tournaments) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      const e = resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
      if (e) s.add(e);
    }
  }
  const ordered = ESCALOES.filter(e => s.has(e));
  for (const e of s) {
    if (!ordered.includes(e)) ordered.push(e);
  }
  return ordered;
}

/** «Classificação» por escalão (decisão H, 22/10/2026): cada torneio fica só com
 *  os jogadores do(s) escalão(ões) — escalão do jogador no torneio, comparado pela
 *  tabela única (`model/escalao.ts`: «Sub-12» = «Sub 12») — e as posições
 *  refazem-se em CÓPIAS. Os torneios e os jogadores partilhados ficam como estão:
 *  o leaderboard sem filtro e os pontos do Ranking Sub-12 não mudam. */
export function filterTournByEsc(
  tournaments: Tournament[],
  escs: string[],
  escLookup: EscLookup,
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>,
  escOf?: (p: Player) => string,
): Tournament[] {
  const want = new Set(escs.flatMap(e => escaloesCanon(e, "fpg")));
  return tournaments.map(t => {
    const filtered = t.players.filter(p => {
      // Sem total E sem volta nenhuma com cartão (não saiu). Quem desistiu a
      // meio (83 + 997) FICA: tem a R1 para mostrar — 10/11/2026 (J6), antes
      // desaparecia também da R1.
      if (isDNS(p) && voltasComCartao(p.roundScores) === 0) return false;
      const esc = escOf ? escOf(p) : resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
      return escaloesCanon(esc, "fpg").some(e => want.has(e));
    }).map(p => ({ ...p }));
    if (!filtered.length) return null;
    // Lugares refeitos pela regra única (`classificarPorTotal`): só entre quem
    // tem total com cartão e TODAS as voltas da prova, com empates. Os outros
    // (incompleto, cut, desistiu) vão para o fim, sem lugar.
    const fora = (p: Player) => !!p._incomplete || !!p._wd || !!(p as { _cut?: boolean })._cut;
    const { ordenados, pos } = classificarPorTotal(
      filtered,
      p => (p.roundScores?.length ? voltasComCartao(p.roundScores) : 1),
      p => (fora(p) ? null : numGrossOrNull(p)),
    );
    for (const p of ordenados) p.pos = pos.get(p)!;
    const resto = filtered.filter(p => !pos.has(p));
    const grupo = (p: Player) => (desistiu(p) ? 2 : (p as { _cut?: boolean })._cut ? 0 : 1);
    for (const p of resto) {
      const texto = typeof p.pos === "string" && p.pos && parsePos(p.pos) == null ? p.pos : null;
      p.pos = p._incomplete ? "INC" : texto ?? (desistiu(p) ? "WD" : (p as { _cut?: boolean })._cut ? "CUT" : "INC");
    }
    const sorted = [...ordenados, ...[0, 1, 2].flatMap(g => resto.filter(p => grupo(p) === g))];
    return { ...t, players: sorted, playerCount: sorted.length };
  }).filter(Boolean) as Tournament[];
}

/** O mesmo filtro nas entradas da /drive. Divisões que SÃO um escalão (eventos
 *  do Challenge): a entrada fica, com todos os escalões do evento, se algum for
 *  o pedido (como antes). Divisões sem escalão (Tour, AQUAPOR — «—», Masculino/
 *  Senhoras): ficam só os jogadores do escalão, em cópias com as posições
 *  refeitas; sem nenhum, a divisão sai (e a entrada, sem divisões). */
export function driveEntriesByEsc(
  entries: CircuitEntry[],
  escs: string[],
  escOf: (p: Player, t: Tournament) => string,
): CircuitEntry[] {
  const want = new Set(escs.flatMap(e => escaloesCanon(e, "fpg")));
  const isEscDiv = (d: CircuitDivision) => /^Sub \d+$/.test(escalaoCanon(d.escalao, "fpg") ?? "");
  const out: CircuitEntry[] = [];
  for (const e of entries) {
    const divs = e.divisions ?? [];
    if (divs.some(isEscDiv)) {
      if (divs.some(d => escaloesCanon(d.escalao, "fpg").some(x => want.has(x)))) out.push(e);
      continue;
    }
    const kept: CircuitDivision[] = [];
    for (const d of divs) {
      const t = d.results;
      if (!t) continue;
      const [f] = filterTournByEsc([t], escs, new Map(), {}, undefined, undefined, (p) => escOf(p, t));
      if (f) kept.push({ ...d, results: f, hasManuel: f.players.some(p => isManuelByName(p.name)) });
    }
    if (kept.length) out.push({ ...e, divisions: kept, playerCount: somaDe(kept, d => (d.results?.players.length ?? 0)) });
  }
  return out;
}

export const numAvg = (nums: number[]): number | null => nums.length === 0 ? null : soma(nums) / nums.length;

/** Compara escalões ignorando espaços/hífens/caixa ("Sub-12" ≡ "Sub 12" ≡ "sub12").
 *  Generalização 2026-07-10: o ranking deixou de ser fixo Sub-10+Sub-12 — o
 *  escalão-alvo é escolhido no selector da sidebar (estado `sub12Esc`). */
export function escMatches(esc: string, target: string): boolean {
  if (!esc || !target) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");
  return norm(esc) === norm(target);
}
export function tournShort(t: Tournament): string {
  const num = t.num || "?";
  const isAq = t.series === "aquapor";
  const isCh = t.series === "challenge";
  const prefix = isAq ? "AQ" : isCh ? "DC" : "DT";
  if (t.name.toLowerCase().includes("final")) return `${prefix}F`;
  let zona = "";
  if (t.region === "madeira") zona = "Mad";
  else if (t.region === "sul") zona = "Sul";
  else if (t.region === "norte") zona = "Nrt";
  else if (t.region === "tejo") zona = "Tjo";
  return `${prefix}${num} ${zona}`.trim();
}
export function dateToSort(d: string): number {
  if (!d) return 0;
  const parts = d.split("-");
  if (parts.length === 3 && parts[0].length === 4) return new Date(d).getTime() || 0;
  if (parts.length === 3 && parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0;
  return new Date(d).getTime() || 0;
}
/** Desistiu (ou ficou sem cartão) numa das voltas. */
function desistiu(p: Player): boolean {
  return !!p._wd || !!p.roundScores?.some(r => isNoCardGross(r.gross));
}
/** Total do jogador em número (o `grossTotal` pode vir em texto: «WD»); null se não for. */
function numGrossOrNull(p: Player): number | null {
  const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  return typeof g === "number" && !isNaN(g) ? g : null;
}
/** Distância (m) da volta jogada: a soma dos metros da 1.ª volta; `null`
 *  quando a fonte não os traz. */
function roundMeters(p: Player): number | null {
  const m = p.roundScores?.[0]?.meters?.length ? p.roundScores[0].meters : p.meters;
  const total = soma(m);
  return total > 0 ? total : null;
}
export function buildSub12Data(
  tournaments: Tournament[],
  playersDB: PlayersDB,
  escLookup: EscLookup,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>,
  targetEsc: string = "Sub 12",
  /** Sexo por federado (base de federados) — o players.json não tem os adultos. */
  fedGenders?: Map<string, string>,
): Sub12Row[] {
  const sexOf = (fed: string) => playersDB[fed]?.sex || fedGenders?.get(fed) || "";
  // Incluir apenas ronda única OU a entrada "Total" de torneios multi-ronda
  // (nunca R1/R2 individuais — pontos são pela classificação do Total)
  const validTournaments = tournaments.filter(t =>
    !t._roundLabel || t._roundLabel === "Resumo"
  );
  const playerMap = new Map<string, Sub12Row>();
  for (const t of validTournaments) {
    // Pontos oficiais da prova, para o campo TODO (não só o escalão filtrado):
    // a posição que pontua é a do leaderboard completo. No Aquapor é dentro do
    // sexo (de todos: sem ele, os pontos saem errados — 2026-11-02).
    // Quem não acabou todas as voltas não tem cartão: o Resumo soma só as voltas
    // válidas (87 de uma volta ficava à frente de 138 em duas — 2026-11-02).
    // …e também quem tem MENOS voltas do que a prova (cut/incompleto, sem volta
    // ≥ 900): no 4.º Aquapor de 16/05/2025 dois jogadores com uma volta (86 e 87)
    // ficavam 1.º e 2.º com 250 e 165 pontos (10/11/2026).
    // Regra única (`classificarPorTotal`, utils/classificacao): só tem gross para
    // a classificação quem tem total com cartão e todas as voltas da prova.
    const { pos: classificados } = classificarPorTotal(
      t.players,
      p => voltasComCartao(p.roundScores),
      p => (typeof p.grossTotal === "number" && !desistiu(p) ? p.grossTotal : null),
    );
    const field = t.players.map(p => ({
      fed: p.fed || p.fedCode || "",
      pos: p.pos,
      gross: classificados.has(p) ? (p.grossTotal as number) : null,
      sex: sexOf(p.fed || p.fedCode || ""),
    }));
    const ptsByFed = tournamentPoints(field, t.series, t.name);
    const places = t.series === "aquapor" ? aquaporPlaces(field) : null;
    for (const p of t.players) {
      if (isDNS(p)) continue;
      // Escalão no ANO do torneio (year-based) — crucial para filtrar o escalão
      // correctamente em torneios antigos (um jogador que é Sub-14 hoje pode ter
      // sido Sub-12 em 2024, e vice-versa).
      const esc = resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
      // "all" = TODOS os jogadores do circuito, incluindo os de escalão não
      // resolvido (sem DOB em players.json/federados — ex: João Santos/PXO,
      // Maria Cunha, que faltavam vs o ranking oficial RDTM26). O circuito
      // Drive é exclusivamente jovem, por isso é seguro não filtrar aqui.
      // Escalão específico exige match exacto (sem DOB fica de fora — não
      // há como saber o escalão).
      if (targetEsc !== "all" && !escMatches(esc, targetEsc)) continue;
      const fed = p.fed || p.fedCode || "";
      if (!fed) continue;
      const stats = computeStats(p, t.date);
      if (!stats) continue;
      const { gross: g, toPar: tp, sd, sds, roundSds, nholes, birdies, pars: parsCount, bogeys } = stats;
      // Cada volta jogada com o seu SD (alinhados; sem as voltas sem cartão).
      const voltas = (p.roundScores?.length ? p.roundScores.map((r, i) => ({ g: r.gross, sd: roundSds[i] ?? null })) : [{ g, sd }])
        .filter(v => temCartao(v.g));
      const tournKey = t.tcode + "_" + t.date;
      if (!playerMap.has(fed)) {
        const dbInfo = playersDB[fed];
        playerMap.set(fed, {
          fed, name: p.name || dbInfo?.name || `Fed. ${fed}`,
          club: p.club || dbInfo?.club?.short || "",
          region: dbInfo?.region || t.region || "",
          sex: sexOf(fed), hcp: dbInfo?.hcp ?? p.hcpExact ?? null,
          results: [], avgGross: null, avgSD: null, bestGross: null, bestSD: null, tourneiosPlayed: 0,
          totalBird: 0, totalPars: 0, totalBog: 0, totalPts: 0,
        });
      }
      const row = playerMap.get(fed)!;
      if (row.results.some(r => r.tournKey === tournKey)) continue;
      if (esc && row.results.every(r => r.date <= t.date)) row.esc = esc;
      row.results.push({
        tournKey, tournName: t.name, tournShort: tournShort(t),
        date: t.date, dateSort: dateToSort(t.date),
        campo: t.campo || "", region: t.region || "", series: (t.series || "tour") as "tour" | "challenge" | "aquapor",
        gross: g, toPar: tp,
        sd, sds,
        pos: p.pos, totalPlayers: t.playerCount, pts: ptsByFed.get(fed) ?? 0,
        sexPos: places?.get(fed)?.pos ?? null,
        wd: desistiu(p) || undefined,
        rounds: voltas.map(v => v.g),
        roundSds: voltas.map(v => v.sd),
        hcpExact: p.hcpExact ?? null,
        tee: p.teeName || p.roundScores?.[0]?.teeName || null,
        meters: roundMeters(p),
        nholes, birdies, pars: parsCount, bogeys,
      });
      row.totalBird += birdies;
      row.totalPars += parsCount;
      row.totalBog  += bogeys;
    }
  }
  for (const row of playerMap.values()) {
    row.results.sort((a, b) => a.dateSort - b.dateSort);
    // Zona DRIVE do jogador = zona MODAL dos torneios que jogou (vocabulário
    // canónico norte/tejo/sul/madeira/acores). NÃO usar a região de residência
    // do players.json ("Algarve"/"Lisboa"/…, outro vocabulário e com encoding
    // partido) — misturava dois mundos no filtro de zonas (bug 2026-07-10).
    const zoneCounts = new Map<string, number>();
    for (const r of row.results) {
      if (r.region) zoneCounts.set(r.region, (zoneCounts.get(r.region) || 0) + 1);
    }
    const modalZone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (modalZone) row.region = modalZone;
    const grosses = row.results.map(r => r.gross);
    const sds = row.results.flatMap(r => r.sds);
    row.tourneiosPlayed = row.results.length;
    row.avgGross = numAvg(grosses);
    row.avgSD = numAvg(sds);
    row.bestGross = grosses.length > 0 ? Math.min(...grosses) : null;
    row.bestSD = sds.length > 0 ? Math.min(...sds) : null;
    // Ranking COMO A FPG: melhores-4 da fase regular + Final regional ×1.5.
    row.totalPts = rankingTotal(row.results);
  }
  return [...playerMap.values()].sort((a, b) => b.totalPts - a.totalPts);
}
export function filterBySub12Series(rows: Sub12Row[], series: Sub12SeriesTab): Sub12Row[] {
  return rows.map(p => {
    const fR = p.results.filter(r => r.series === series);
    if (fR.length === 0) return null;
    const fG = fR.map(r => r.gross);
    const fS = fR.flatMap(r => r.sds);
    return {
      ...p, results: fR, tourneiosPlayed: fR.length,
      avgGross: numAvg(fG), avgSD: numAvg(fS),
      bestGross: fG.length ? Math.min(...fG) : null,
      bestSD: fS.length ? Math.min(...fS) : null,
      totalBird: somaDe(fR, r => r.birdies),
      totalPars: somaDe(fR, r => r.pars),
      totalBog:  somaDe(fR, r => r.bogeys),
      totalPts:  rankingTotal(fR),
    };
  }).filter(Boolean) as Sub12Row[];
}

/** Jogadores e torneios de cada série (a sidebar do Ranking Sub-12). */
export function sub12SeriesCounts(rows: Sub12Row[], series: readonly Sub12SeriesTab[]): Record<string, { players: number; tourns: number }> {
  const counts: Record<string, { players: number; tourns: number }> = {};
  for (const s of series) {
    const sr = filterBySub12Series(rows, s);
    const tourns = new Set(sr.flatMap(p => p.results.map(r => r.tournKey)));
    counts[s] = { players: sr.length, tourns: tourns.size };
  }
  return counts;
}

/** Os números do cabeçalho do Ranking Sub-12 (jogadores, rondas, média do melhor SD, melhor gross). */
export function sub12Kpis(rows: Sub12Row[]): { players: number; rounds: number; bestSD: number | null; best: number | null } {
  return {
    players: rows.length,
    rounds: somaDe(rows, p => p.tourneiosPlayed),
    bestSD: numAvg(rows.filter(p => p.bestSD != null).map(p => p.bestSD!)),
    best: rows.reduce<number | null>((best, p) => p.bestGross != null && (best == null || p.bestGross < best) ? p.bestGross : best, null),
  };
}

/** Colunas da grelha: os torneios em que os jogadores visíveis jogaram, por data. */
export function sub12Tournaments(rows: Sub12Row[]): { key: string; short: string; date: string; series: string; dateSort: number }[] {
  const m = new Map<string, { key: string; short: string; date: string; series: string; dateSort: number }>();
  for (const row of rows) {
    for (const r of row.results) {
      if (!m.has(r.tournKey)) m.set(r.tournKey, { key: r.tournKey, short: r.tournShort, date: r.date, series: r.series, dateSort: r.dateSort });
    }
  }
  return [...m.values()].sort((a, b) => a.dateSort - b.dateSort);
}
