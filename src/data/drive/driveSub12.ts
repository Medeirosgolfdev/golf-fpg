/**
 * src/data/drive/driveSub12.ts — contas do Ranking Sub-12 do Drive e do filtro
 * «Classificação» por escalão (saíram da DrivePage; sem React).
 *
 * Escalão de cada jogador num torneio: `resolveEscForTournament` (data de
 * nascimento → histórico → lookup temporal → actual; em último recurso o escalão
 * do próprio torneio Challenge). Pontos: `constants/drivePoints.ts`.
 */
import { ESCALOES_DRIVE as ESCALOES } from "../../constants/escaloes";
import { tournamentPoints, rankingTotal } from "../../constants/drivePoints";
import { resolveEsc, computeSD, type TemporalEscLookup } from "../fpgUtils";
import { isDNS } from "../../ui/driveUtils";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import type { Tournament, Player, TStats, Sub12Row, EscLookup } from "../../ui/driveTypes";

export type Sub12SeriesTab = "tour" | "challenge" | "aquapor";

export function computeStats(p: Player, date?: string | null): TStats | null {
  if (isDNS(p)) return null;
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (gross == null || isNaN(gross as number)) return null;
  const g = gross as number;

  // Flat fields may be absent when player uses roundScores format;
  // fall back to roundScores[0] for single-round tournaments
  const rs0 = p.roundScores?.[0];
  const parArr = p.par?.length ? p.par : rs0?.pars || [];
  const scores = p.scores?.length ? p.scores : rs0?.scores || [];

  const parT = p.parTotal || parArr.reduce((a, b) => a + b, 0);
  const tp = g - parT;
  const nh = p.nholes || scores.length || parArr.length || 18;
  // SD: o oficial da FPG, ou o calculado com o HCP da inscrição (ver computeSD).
  // Entradas multi-ronda combinadas (nholes > 18) não têm SD.
  const sd18 = nh <= 18
    ? computeSD({
        ...p, scores, par: parArr, si: p.si?.length ? p.si : rs0?.si || [],
        courseRating: p.courseRating ?? rs0?.courseRating, slope: p.slope ?? rs0?.slope,
        pcc: p.pcc ?? rs0?.pcc, nholes: nh,
      }, date).sd
    : null;

  let birdies = 0, pars = 0, bogeys = 0;
  // If player has multiple roundScores, count across all rounds
  if (p.roundScores && p.roundScores.length > 1) {
    for (const rs of p.roundScores) {
      const rScores = rs.scores || [];
      const rPars = rs.pars || [];
      for (let i = 0; i < rScores.length && i < rPars.length; i++) {
        const d = rScores[i] - rPars[i];
        if (d <= -1) birdies++;
        else if (d === 0) pars++;
        else bogeys++;
      }
    }
  } else {
    for (let i = 0; i < scores.length && i < parArr.length; i++) {
      const d = scores[i] - parArr[i];
      if (d <= -1) birdies++;
      else if (d === 0) pars++;
      else bogeys++;
    }
  }
  return { pos: p.pos, gross: g, toPar: tp, sd18, nholes: nh, birdies, pars, bogeys };
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

/** Filter tournaments keeping only players of a given escalão; recalculate positions */
export function filterTournByEsc(
  tournaments: Tournament[],
  escs: string[],
  escLookup: EscLookup,
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>
): Tournament[] {
  return tournaments.map(t => {
    const filtered = t.players.filter(p => {
      if (isDNS(p)) return false;
      const esc = resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
      return escs.includes(esc);
    });
    if (!filtered.length) return null;
    // Recalculate positions
    const sorted = [...filtered].sort((a, b) => {
      if (a._incomplete && !b._incomplete) return 1;
      if (!a._incomplete && b._incomplete) return -1;
      const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
      const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
      return ag - bg;
    });
    let pos = 1;
    sorted.forEach((p, i) => {
      if (p._incomplete) { p.pos = "INC"; return; }
      if (i > 0) {
        const prev = sorted[i - 1];
        if (!prev._incomplete) {
          const ag = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number ?? 999);
          const bg = typeof prev.grossTotal === "string" ? parseInt(prev.grossTotal) : (prev.grossTotal as number ?? 999);
          if (ag !== bg) pos = i + 1;
        }
      }
      p.pos = pos;
    });
    return { ...t, players: sorted, playerCount: sorted.length };
  }).filter(Boolean) as Tournament[];
}

export const numAvg = (nums: number[]): number | null => nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

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
export function buildSub12Data(
  tournaments: Tournament[],
  playersDB: PlayersDB,
  escLookup: EscLookup,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>,
  targetEsc: string = "Sub 12"
): Sub12Row[] {
  // Incluir apenas ronda única OU a entrada "Total" de torneios multi-ronda
  // (nunca R1/R2 individuais — pontos são pela classificação do Total)
  const validTournaments = tournaments.filter(t =>
    !t._roundLabel || t._roundLabel === "Resumo"
  );
  const playerMap = new Map<string, Sub12Row>();
  for (const t of validTournaments) {
    // Pontos oficiais da prova, para o campo TODO (não só o escalão filtrado):
    // a posição que pontua é a do leaderboard completo. No Aquapor é dentro do
    // sexo, daí passar o sexo do players.json.
    const ptsByFed = tournamentPoints(
      t.players.map(p => ({
        fed: p.fed || p.fedCode || "",
        pos: p.pos,
        gross: typeof p.grossTotal === "number" ? p.grossTotal : null,
        sex: playersDB[p.fed || p.fedCode || ""]?.sex || "",
      })),
      t.series,
      t.name,
    );
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
      const { gross: g, toPar: tp, sd18, nholes, birdies, pars: parsCount, bogeys } = stats;
      const tournKey = t.tcode + "_" + t.date;
      if (!playerMap.has(fed)) {
        const dbInfo = playersDB[fed];
        playerMap.set(fed, {
          fed, name: p.name || dbInfo?.name || `Fed. ${fed}`,
          club: p.club || dbInfo?.club?.short || "",
          region: dbInfo?.region || t.region || "",
          sex: dbInfo?.sex || "", hcp: dbInfo?.hcp ?? p.hcpExact ?? null,
          results: [], avgGross: null, avgSD: null, bestGross: null, bestSD: null, tourneiosPlayed: 0,
          totalBird: 0, totalPars: 0, totalBog: 0, totalPts: 0,
        });
      }
      const row = playerMap.get(fed)!;
      if (row.results.some(r => r.tournKey === tournKey)) continue;
      row.results.push({
        tournKey, tournName: t.name, tournShort: tournShort(t),
        date: t.date, dateSort: dateToSort(t.date),
        campo: t.campo || "", region: t.region || "", series: (t.series || "tour") as "tour" | "challenge" | "aquapor",
        gross: g, toPar: tp,
        sd: sd18 != null ? Math.round(sd18 * 10) / 10 : null,
        pos: p.pos, totalPlayers: t.playerCount, pts: ptsByFed.get(fed) ?? 0,
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
    const sds = row.results.filter(r => r.sd != null).map(r => r.sd!);
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
    const fS = fR.filter(r => r.sd != null).map(r => r.sd!);
    return {
      ...p, results: fR, tourneiosPlayed: fR.length,
      avgGross: numAvg(fG), avgSD: numAvg(fS),
      bestGross: fG.length ? Math.min(...fG) : null,
      bestSD: fS.length ? Math.min(...fS) : null,
      totalBird: fR.reduce((s, r) => s + r.birdies, 0),
      totalPars: fR.reduce((s, r) => s + r.pars, 0),
      totalBog:  fR.reduce((s, r) => s + r.bogeys, 0),
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
    rounds: rows.reduce((s, p) => s + p.tourneiosPlayed, 0),
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
