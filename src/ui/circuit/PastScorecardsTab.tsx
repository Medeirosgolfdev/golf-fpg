/**
 * src/ui/circuit/PastScorecardsTab.tsx — a aba «Scorecards anteriores» em todos
 * os torneios (04/11/2026, Mariana: «este tab dos scorecards anteriores… também
 * podia aparecer sempre»). Era só do Kids 2 (histórico USKids); aqui monta as
 * edições a partir das MESMAS entradas irmãs das «Edições anteriores» (o shell
 * pelo `editionKey`, a /FPG pelo seu índice) e desenha a mesma tabela
 * (`HistoricScorecardsView`): top-N de cada edição, buraco a buraco, Agrupado
 * ou Independente, e a ecléctica.
 */
import { useEffect, useState } from "react";
import type { Tournament as FPGTournament } from "../../data/fpgTypes";
import type { CircuitDivision, CircuitEntry } from "./types";
import { matchDivision } from "./pastEditions";
import {
  HistoricScorecardsView, tallyHoles, MIN_GROSS_9H, MIN_GROSS_18H,
  type Edition, type PlayerCard, type PlayerRound,
} from "../../pages/kids/HistoricScorecardsTab";
import LoadingState from "../LoadingState";
import EmptyState from "../EmptyState";
import { fmtMonthYear } from "../../utils/format";

/** Menos do que isto não é um field (como no Kids 2). */
const MIN_FIELD = 3;

/** Uma edição (Tournament no formato FPG) → `Edition` da tabela: só os que
 *  jogaram todas as voltas, com os buracos de cada uma. Null sem cartões. */
export function editionFromTournament(
  t: FPGTournament,
  meta: { id: string; year: number; name?: string | null; course?: string | null },
): Edition | null {
  const comCartao = (t.players || []).filter((p) => (p.roundScores || []).some((r) => (r.scores || []).filter((x) => x > 0).length >= 9));
  if (!comCartao.length) return null;
  const ref = comCartao[0].roundScores!.find((r) => (r.scores || []).length) ?? comCartao[0].roundScores![0];
  const hpr = (ref.pars?.length || ref.scores?.length || 18) <= 9 ? 9 : 18;
  const is9 = hpr === 9;
  const par = ref.pars?.length ? ref.pars.slice(0, hpr) : null;
  const parOk = par && par.length === hpr && par.every((v) => v > 0) ? par : null;
  const parPerRound = parOk ? parOk.reduce((a, b) => a + b, 0) : 0;
  const metersPerHole = ref.meters?.length ? ref.meters.slice(0, hpr).map((m) => m || 0) : null;
  const meters = metersPerHole ? metersPerHole.reduce((a, b) => a + b, 0) || undefined : undefined;
  const minGross = is9 ? MIN_GROSS_9H : MIN_GROSS_18H;

  const players: PlayerCard[] = [];
  let nRoundsMax = 0;
  for (const p of comCartao) {
    const rds: PlayerRound[] = [];
    let total = 0;
    (p.roundScores || []).forEach((r, i) => {
      const strokes = (r.scores || []).slice(0, hpr);
      const gross = r.gross || strokes.reduce((a, b) => a + (b || 0), 0);
      if (!(gross >= minGross) || gross >= 900) return;
      const t9 = tallyHoles(strokes, r.pars?.length ? r.pars : parOk);
      rds.push({
        rn: r.round || i + 1, gross, strokes,
        toPar: parPerRound ? gross - parPerRound : 0,
        birds: t9.birds, pars: t9.pars, bogeys: t9.bogeys, worse: t9.worse,
        out: strokes.slice(0, 9).reduce((a, b) => a + (b || 0), 0),
        inn: is9 ? 0 : strokes.slice(9, 18).reduce((a, b) => a + (b || 0), 0),
      });
      total += gross;
    });
    if (!rds.length) continue;
    rds.sort((a, b) => a.rn - b.rn);
    nRoundsMax = Math.max(nRoundsMax, rds.length);
    const pos = typeof p.pos === "number" ? p.pos : parseInt(String(p.pos ?? ""), 10);
    players.push({
      memberId: String(p.fed || p.fedCode || p.name),
      name: p.name,
      country: p.identity?.countryIso || "",
      officialPlace: Number.isFinite(pos) && pos > 0 ? pos : null,
      total,
      rounds: rds,
    });
  }
  const completos = players.filter((pl) => pl.rounds.length === nRoundsMax);
  if (completos.length < MIN_FIELD) return null;
  completos.sort((a, b) => (a.officialPlace ?? Infinity) - (b.officialPlace ?? Infinity) || a.total - b.total);
  return {
    tcode: meta.id,
    name: meta.name || t.name,
    year: String(meta.year),
    course: meta.course || t.campo || undefined,
    par: parOk,
    metersPerHole,
    parPerRound,
    parF9: parOk ? parOk.slice(0, 9).reduce((a, b) => a + b, 0) : 0,
    parB9: parOk && !is9 ? parOk.slice(9, 18).reduce((a, b) => a + b, 0) : 0,
    holesPerRound: hpr,
    is9,
    nRoundsMax,
    fieldSize: completos.length,
    meters,
    players: completos,
  };
}

async function entryDivisions(e: CircuitEntry): Promise<CircuitDivision[]> {
  if (e.divisions) return e.divisions;
  if (e.loadDivisions) return e.loadDivisions();
  return [];
}

/** A aba: as edições ANTERIORES (todas as irmãs menos a de hoje), mais
 *  recente primeiro, no escalão correspondente. */
export function CircuitPastScorecardsTab({ editions, division, currentId, match = matchDivision }: {
  editions: CircuitEntry[];
  division: string;
  currentId?: string | null;
  match?: (divisions: CircuitDivision[], label: string) => CircuitDivision | null;
}) {
  const [state, setState] = useState<{ loading: boolean; eds: Edition[] }>({ loading: true, eds: [] });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, eds: [] });
    (async () => {
      const anteriores = editions.filter((e) => e.id !== currentId);
      const loaded = await Promise.all(anteriores.map(async (e) => {
        try { return { e, divs: await entryDivisions(e) }; } catch { return { e, divs: [] as CircuitDivision[] }; }
      }));
      const eds: { ed: Edition; stamp: string }[] = [];
      for (const { e, divs } of loaded) {
        const dv = match(divs, division);
        if (!dv?.results) continue;
        const ed = editionFromTournament(dv.results, { id: e.id, year: e.year ?? 0, name: e.name, course: dv.results.campo || e.course });
        if (ed) eds.push({ ed, stamp: e.dateStart || String(e.year ?? 0) });
      }
      eds.sort((a, b) => (b.stamp < a.stamp ? -1 : b.stamp > a.stamp ? 1 : 0));
      // Várias edições no mesmo ano, ou do ano da prova de hoje (as etapas do
      // Drive no mesmo campo): o mês e o ano na coluna «Ano», senão confundem-se.
      const porAno = new Map<string, number>();
      for (const x of eds) porAno.set(x.ed.year, (porAno.get(x.ed.year) ?? 0) + 1);
      const anoHoje = String(editions.find((e) => e.id === currentId)?.year ?? "");
      for (const x of eds) if (((porAno.get(x.ed.year) ?? 0) > 1 || x.ed.year === anoHoje) && /^\d{4}-\d{2}/.test(x.stamp)) x.ed.year = fmtMonthYear(x.stamp);
      if (alive) setState({ loading: false, eds: eds.map((x) => x.ed) });
    })();
    return () => { alive = false; };
  }, [editions, division, currentId, match]);

  if (state.loading) return <LoadingState message="A carregar os scorecards das edições anteriores…" />;
  if (!state.eds.length) return <EmptyState size="md" message="Sem scorecards buraco a buraco nas edições anteriores." />;
  return <HistoricScorecardsView editions={state.eds} />;
}
