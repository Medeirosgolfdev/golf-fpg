/**
 * teamStroke.ts — Classificação de EQUIPAS em stroke play (fase 6 do plano,
 * 23/10/2026): um modelo só, desenhado pela peça partilhada
 * `ui/circuit/TeamStrokeStandings.tsx`.
 *
 * Três fontes, as mesmas contas que viviam nas vistas antigas:
 *   - Clubes FPG, uma categoria (best-N por volta, máx. pancadas por buraco) —
 *     era o ClubesGruposView;
 *   - Clubes FPG com categorias (Homens/Senhoras/Juniores, cada uma um
 *     campeonato à parte) — era o ClubesCategoriasView;
 *   - Final Drive (regiões; soma dos 10 melhores ±par, lida do PDF) — era o
 *     DriveEquipasTab.
 */
import type { Player, Tournament, GrupoEntry, GrupoJogador } from "./fpgTypes";
import type { DriveEquipasData } from "./drive/driveLoader";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import { bestN } from "../utils/mathUtils";
import { abreviarNome, escalaoAtDate, fmtHcp } from "../utils/format";
import { firstPlayerParTotal } from "./fpgUtils";
import { C } from "../utils/colors";

export interface Bpb { bir: number; par: number; bog: number }
export interface TsRound { gross: number | null; toPar: number | null; counts: boolean; bpb: Bpb | null }
export interface TsPlayer {
  key: string;
  name: string;
  /** Liga à ficha /jogadores/{fed} (só quem está no torneio com federado). */
  fed: string | null;
  link: boolean;
  hcp: string;
  hcpSort: number | null;
  esc: string | null;
  holes: number | null;
  rds: TsRound[];
  total: number | null;
  /** Conta para a equipa em alguma volta. */
  conta: boolean;
  hasScore: boolean;
}
export interface TsCat {
  key: string;
  label: string;
  /** «3 melhores», «máx. 6 + 1 supl.»… */
  nLabel: string;
  players: TsPlayer[];
  /** Total da equipa por volta (best-N) e ±par. */
  rdTotals: (number | null)[];
  rdToPar: (number | null)[];
  total: number | null;
  toPar: number | null;
  pos: number | null;
  fieldSize: number;
  /** Rodapé: soma de TODOS os jogadores por volta (vista de uma categoria). */
  rdSumsAll: (number | null)[];
  footerLabel: string;
}
export interface TsTeam {
  key: string;
  letter: string | null;
  name: string;
  /** «equipa 2» quando o clube tem mais do que uma. */
  sub: string | null;
  color: string;
  isMulti: boolean;
  capitao: string | null;
  suplente: string | null;
  cats: TsCat[];
}
export interface TsModel {
  rounds: number[];
  nRounds: number;
  /** Texto da regra (por cima da tabela). */
  rule: string;
  /** Quem manda na classificação: pancadas (clubes) ou ±par (Final Drive). */
  rankBy: "gross" | "toPar";
  /** Uma classificação por categoria (Regional Absoluto) — o cabeçalho da equipa não tem total. */
  multiCat: boolean;
  showHcp: boolean;
  showHoles: boolean;
  showConta: boolean;
  showBpb: boolean;
  showLetter: boolean;
  /** Clubes com 2+ equipas: cor e letras (legenda). */
  legend: { clube: string; color: string; teams: string }[];
  teams: TsTeam[];
  /** «Total N Jogadores» no rodapé (uma categoria) em vez do rótulo da categoria. */
  footerAll: boolean;
  /** Ordenação inicial dos jogadores dentro da equipa (default: nome; com
   *  categorias: total; composição antes do jogo: HCP). */
  playerSort?: "nome" | "hcp" | "tot";
}

const MULTI_ACCENTS = [C.chartRust, C.chartPurple, C.chartCyan, C.chartRose, C.chartLime, C.chartBlue];
const SINGLE_COLOR = "var(--color-good-dark)";

/** Gross de uma volta: o cartão (com máx. por buraco) ou o gross; 999 = sem cartão. */
function grossForRound(p: Player | undefined, rd: number, maxHole: number): number | null {
  if (!p) return null;
  const rs = p.roundScores?.find(r => r.round === rd);
  if (rs) {
    if (rs.gross >= 999) return null;
    if (rs.scores?.length) {
      if (rs.scores.every(s => s === 0)) return null;
      return rs.scores.reduce((sum, s) => sum + Math.min(s, maxHole), 0);
    }
    return rs.gross;
  }
  if (rd === 1 && p.grossTotal != null && (!p.roundScores || p.roundScores.length === 0)) {
    const g = typeof p.grossTotal === "number" ? p.grossTotal : parseInt(String(p.grossTotal), 10);
    return isNaN(g) ? null : g;
  }
  return null;
}

function calcBpb(p: Player | undefined, rd: number, maxHole: number): Bpb | null {
  const rs = p?.roundScores?.find(r => r.round === rd);
  if (!rs?.scores?.length || !rs?.pars?.length) return null;
  let bir = 0, par = 0, bog = 0;
  rs.scores.forEach((s, h) => {
    const diff = Math.min(s, maxHole) - (rs.pars[h] || 0);
    if (diff <= -1) bir++; else if (diff === 0) par++; else bog++;
  });
  return { bir, par, bog };
}

/** Lugares com empates (1, 2, 2, 4…) por um valor (menor é melhor). */
function rankBy<T>(items: T[], val: (x: T) => number | null, set: (x: T, pos: number, n: number) => void) {
  const withV = items.filter(x => val(x) != null).sort((a, b) => (val(a) as number) - (val(b) as number));
  let pos = 1;
  withV.forEach((x, i) => {
    if (i > 0 && val(x) !== val(withV[i - 1])) pos = i + 1;
    set(x, pos, withV.length);
  });
}

function hcpParse(h: number | string): number | null {
  if (typeof h === "number") return h;
  const n = parseFloat(String(h).replace("+", ""));
  return isNaN(n) ? null : (String(h).startsWith("+") ? -n : n);
}

/** HCP como estava nas vistas de clubes (inteiro sem casa decimal). */
function fmtHcpClubes(h: number | string): string {
  return typeof h === "string" ? h : h % 1 === 0 ? String(h) : h.toFixed(1);
}

function playedRoundsOf(t: Tournament | null): number[] {
  const n = t ? Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0)) : 0;
  return Array.from({ length: n }, (_, i) => i + 1);
}

function byFedOf(t: Tournament | null): Map<string, Player> {
  const m = new Map<string, Player>();
  if (t) for (const p of t.players) if (p.fedCode) m.set(p.fedCode, p);
  return m;
}

/** Cor por clube com 2+ equipas (ordem alfabética), como no ClubesGruposView. */
function clubColors(grupos: GrupoEntry[]) {
  const counts = new Map<string, number>();
  const order = new Map<string, string[]>();
  for (const g of grupos) {
    counts.set(g.clube, (counts.get(g.clube) || 0) + 1);
    if (!order.has(g.clube)) order.set(g.clube, []);
    order.get(g.clube)!.push(g.grupo);
  }
  const multi = [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n).sort((a, b) => a.localeCompare(b, "pt"));
  const color = new Map<string, string>();
  multi.forEach((name, i) => color.set(name, MULTI_ACCENTS[i % MULTI_ACCENTS.length]));
  const legend = multi.map(clube => ({ clube, color: color.get(clube)!, teams: [...(order.get(clube) ?? [])].sort().join(" + ") }));
  return { counts, order, color, legend };
}

/** Linhas dos jogadores de uma equipa/categoria, com o «conta» por volta. */
function playerRows(js: GrupoJogador[], byFed: Map<string, Player>, rounds: number[], nFor: (rd: number) => number,
  maxHole: number, parTotal: number, hcpOf: (j: GrupoJogador, p: Player | undefined) => { hcp: string; sort: number | null }, escOf: (j: GrupoJogador) => string | null): TsPlayer[] {
  const raw = js.map(j => {
    const p = j.fed ? byFed.get(j.fed) : undefined;
    const g = rounds.map(rd => grossForRound(p, rd, maxHole));
    return { j, p, g };
  });
  const thresholds = rounds.map((rd, ri) => {
    const all = raw.map(r => r.g[ri]).filter((v): v is number => v != null).sort((a, b) => a - b);
    return all[nFor(rd) - 1];
  });
  return raw.map(({ j, p, g }) => {
    const rds: TsRound[] = rounds.map((rd, ri) => {
      const gross = g[ri];
      const thr = thresholds[ri];
      return {
        gross, toPar: gross != null && parTotal > 0 ? gross - parTotal : null,
        counts: gross != null && thr != null && gross <= thr,
        bpb: calcBpb(p, rd, maxHole),
      };
    });
    const played = g.filter((v): v is number => v != null);
    const h = hcpOf(j, p);
    return {
      key: j.fed ?? j.nome, name: abreviarNome(j.nome), fed: j.fed, link: !!(p && j.fed),
      hcp: h.hcp, hcpSort: h.sort, esc: escOf(j), holes: null, rds,
      total: played.length ? played.reduce((s, v) => s + v, 0) : null,
      conta: rds.some(r => r.counts), hasScore: played.length > 0,
    };
  });
}

function catTotals(players: TsPlayer[], rounds: number[], nFor: (rd: number) => number, parTotal: number) {
  const rdTotals = rounds.map((rd, ri) => {
    const sc = players.map(p => p.rds[ri].gross).filter((v): v is number => v != null);
    return sc.length ? bestN(sc, nFor(rd)) : null;
  });
  const rdToPar = rdTotals.map((v, ri) => (v != null && parTotal > 0 ? v - parTotal * nFor(rounds[ri]) : null));
  const present = rdTotals.filter((v): v is number => v != null);
  const total = present.length ? present.reduce((s, v) => s + v, 0) : null;
  const teamPar = parTotal > 0 && rounds.length ? parTotal * rounds.reduce((s, rd) => s + nFor(rd), 0) : 0;
  const rdSumsAll = rounds.map((_, ri) => {
    const sc = players.map(p => p.rds[ri].gross).filter((v): v is number => v != null);
    return sc.length ? sc.reduce((s, v) => s + v, 0) : null;
  });
  return { rdTotals, rdToPar, total, toPar: total != null && teamPar > 0 ? total - teamPar : null, rdSumsAll };
}

/** Clubes, uma categoria: best-N por volta (juvenis 3 de 4, máx. 10 por buraco). */
export function buildClubesGrupos(grupos: GrupoEntry[], t: Tournament | null, opts: {
  bestNByRound?: number[]; defaultBestN?: number; maxHoleScore?: number; formatNote?: string | null;
} = {}): TsModel {
  const defaultBestN = opts.defaultBestN ?? 3;
  const maxHole = opts.maxHoleScore ?? 10;
  const nFor = (rd: number) => opts.bestNByRound?.[rd - 1] ?? defaultBestN;
  const rounds = playedRoundsOf(t);
  const byFed = byFedOf(t);
  const parTotal = firstPlayerParTotal(t);
  const { counts, order, color, legend } = clubColors(grupos);
  const teams: TsTeam[] = grupos.map(g => {
    const isMulti = (counts.get(g.clube) ?? 1) > 1;
    const players = playerRows(g.jogadores, byFed, rounds, nFor, maxHole, parTotal,
      (j, p) => ({ hcp: p?.hcpExact != null ? fmtHcpClubes(p.hcpExact) : Number(j.hcp) > 0 ? fmtHcpClubes(j.hcp) : "–",
        sort: p?.hcpExact ?? hcpParse(j.hcp) }),
      () => null);
    const tot = catTotals(players, rounds, nFor, parTotal);
    return {
      key: g.grupo, letter: g.grupo, name: g.clube,
      sub: isMulti ? `equipa ${(order.get(g.clube) ?? []).indexOf(g.grupo) + 1}` : null,
      color: color.get(g.clube) ?? SINGLE_COLOR, isMulti,
      capitao: g.capitao ?? null, suplente: g.suplente ?? null,
      cats: [{ key: "_", label: "", nLabel: "", players, ...tot, pos: null, fieldSize: 0, footerLabel: `Total ${g.jogadores.length} Jogadores` }],
    };
  });
  rankBy(teams.map(x => x.cats[0]), c => c.total, (c, pos, n) => { c.pos = pos; c.fieldSize = n; });
  const nRounds = t?.rounds ?? 1;
  const rule = opts.formatNote === undefined
    ? `Melhores ${defaultBestN} de 4 · Máximo ${maxHole} pancadas por buraco`
    : (opts.formatNote ?? "");
  return { rounds, nRounds, rule, rankBy: "gross", multiCat: false, showHcp: true, showHoles: false, showConta: false,
    showBpb: true, showLetter: true, legend, teams, footerAll: true };
}

export interface CategoriaCfg { key: string; label: string; bestN: number }

/** Clubes com categorias (Homens/Senhoras/Juniores): cada uma é um campeonato
 *  à parte, com o seu best-N. A categoria sai do playersDB (sexo + nascimento). */
export function buildClubesCategorias(grupos: GrupoEntry[], t: Tournament | null, playersDB: PlayersDB, categories: CategoriaCfg[], opts: {
  rosterMode?: boolean; bestNLabel?: (n: number) => string; playerSort?: "nome" | "hcp" | "tot";
} = {}): TsModel {
  const tournDate = t?.date ?? null;
  const labelN = opts.bestNLabel ?? ((n: number) => `${n} melhores`);
  const rounds = playedRoundsOf(t);
  const byFed = byFedOf(t);
  const parTotal = firstPlayerParTotal(t);
  const dobOf = (fed: string | null) => (fed ? (playersDB[fed] as { dob?: string } | undefined)?.dob : undefined);
  const catOf = (fed: string | null): string => {
    const esc = escalaoAtDate(dobOf(fed), tournDate);
    if (esc && /^Sub (10|12|14|16|18)$/.test(esc)) return "J";
    if (((fed ? playersDB[fed]?.sex : "") || "").toUpperCase() === "F") return "S";
    return "H";
  };
  const teams: TsTeam[] = grupos.map(g => ({
    key: g.grupo, letter: g.grupo, name: g.clube, sub: null, color: SINGLE_COLOR, isMulti: false,
    capitao: g.capitao ?? null, suplente: g.suplente ?? null,
    cats: categories.map((cfg): TsCat | null => {
      const js = g.jogadores.filter(j => catOf(j.fed) === cfg.key);
      if (!js.length) return null;
      const nFor = () => cfg.bestN;
      const players = playerRows(js, byFed, rounds, nFor, Infinity, parTotal,
        (j, p) => ({ hcp: fmtHcp(p?.hcpExact ?? (typeof j.hcp === "number" && j.hcp > 0 ? j.hcp : undefined), "–"),
          sort: p?.hcpExact ?? (typeof j.hcp === "number" ? j.hcp : null) }),
        j => escalaoAtDate(dobOf(j.fed), tournDate));
      const tot = catTotals(players, rounds, nFor, parTotal);
      return { key: cfg.key, label: cfg.label, nLabel: labelN(cfg.bestN), players, ...tot, pos: null, fieldSize: 0,
        footerLabel: `${cfg.label} (${opts.rosterMode ? players.length : cfg.bestN})` };
    }).filter((c): c is TsCat => !!c),
  }));
  // Lugar POR CATEGORIA (cada escalão é um campeonato independente).
  for (const cfg of categories) {
    rankBy(teams.map(x => x.cats.find(c => c.key === cfg.key)).filter((c): c is TsCat => !!c),
      c => c.total, (c, pos, n) => { c.pos = pos; c.fieldSize = n; });
  }
  const rule = `Por categoria dentro de cada clube — ${categories.map(c => `${c.label} ${labelN(c.bestN)}`).join(" · ")}.`;
  return { rounds, nRounds: t?.rounds ?? rounds.length, rule, rankBy: "gross", multiCat: true, showHcp: true, showHoles: false,
    showConta: false, showBpb: false, showLetter: true, legend: [], teams, footerAll: false, playerSort: opts.playerSort ?? "tot" };
}

/** Final Drive: regiões; soma dos 10 melhores ±par (do PDF oficial). */
export function buildDriveEquipas(d: DriveEquipasData): TsModel {
  const teams: TsTeam[] = d.equipas.map(e => {
    const players: TsPlayer[] = e.jogadores.map(j => ({
      key: j.nome, name: j.nome, fed: null, link: false, hcp: "", hcpSort: null, esc: null, holes: j.buracos ?? null,
      rds: [{ gross: j.gross ?? null, toPar: j.toPar ?? null, counts: !!j.conta, bpb: null }],
      total: j.gross ?? null, conta: !!j.conta, hasScore: j.gross != null || j.toPar != null,
    }));
    return {
      key: e.regiao, letter: null, name: e.regiao, sub: null, color: SINGLE_COLOR, isMulti: false, capitao: null, suplente: null,
      cats: [{ key: "_", label: "", nLabel: "", players, rdTotals: [null], rdToPar: [e.toPar], total: null, toPar: e.toPar,
        pos: e.pos, fieldSize: d.equipas.length, rdSumsAll: [null], footerLabel: `${e.jogadores.length} jogadores` }],
    };
  });
  return { rounds: [1], nRounds: 1, rule: d.regra, rankBy: "toPar", multiCat: false, showHcp: false, showHoles: true,
    showConta: true, showBpb: false, showLetter: false, legend: [], teams, footerAll: false };
}
