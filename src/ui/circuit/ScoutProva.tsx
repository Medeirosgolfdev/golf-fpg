/**
 * ScoutProva.tsx — a aba «Scout» de TODOS os torneios (05/11/2026, Mariana: «EU
 * QUERO QUE EM TODAS AS PÁGINAS APAREÇA O MESMO»). Era o FpgScout (20/10/2026),
 * o mais completo; agora é o único — FPG, Drive, MAJOR, USKids, França, Espanha,
 * Kids 2… Quem o monta: a FPG (fpgPastEditions), o CircuitShell (ScoutDoCircuito,
 * pastEditions.tsx) e, para o resto, o próprio TournamentDetail.
 *
 * É o Scout partilhado (Scout.tsx — nível, previsão, forma, confrontos com o
 * Manuel, próximas inscrições) com as colunas calculadas por
 * `pages/fpg/repeatersModel.ts` (puro, testado) para o field todo: saída e tee do
 * draw, índice WHS de hoje e a variação a 3 meses, forma WHS (differentials), o
 * lugar em cada edição anterior, «vs Campo» e a previsão em gross. Cada coluna só
 * aparece se houver dados (o WHS só existe para quem tem número de federado).
 *
 * Fontes, todas já servidas ao browser: `players.json` (AppContext: índice,
 * escalão, clube, sexo), `player-stats.json` (forma WHS) e `master-courses.json`
 * (CR/Slope).
 */
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { KidsLinkCtx } from "../KidsLink";
import type { Player, Tournament } from "../../data/fpgTypes";
import { TeeDot, type PlayersDB } from "../tournamentPrimitives";
import { fmtToPar, fmtSign, fmtOrd, isoDate, fmtSignTipo, todayIso } from "../../utils/format";
import { addDaysIso } from "../../utils/dias";
import { soma, somaDe } from "../../utils/mathUtils";
import { temCartao, classificarPorTotal, parsePos } from "../../utils/classificacao";
import PosMedal from "../PosMedal";
import KpiCard from "../KpiCard";
import ToPar from "../ToPar";
import { normName } from "../../utils/normName";
import { playerKey } from "../../utils/playerKey";
import { loadMasterData } from "../../data/loader";
import { loadPlayerStats, type PlayerStatsDb } from "../../data/playerStatsTypes";
import LoadingState from "../LoadingState";
import { MUTED } from "../tableCells";
import Scout, { type ScoutExtraCol } from "./Scout";
import { coberturaMinima, type ScoutComManuel } from "./scoutModel";
import { fieldIsManuel, type FieldPlayer } from "./repeaters";
import { useAppContext } from "../../context/AppContext";
import type { CircuitEntry, CircuitDivision } from "./types";
import { buildPastEditionFromTournament, entryDivisions, matchDivision } from "./pastEditions";
import { totalsDivisionView } from "./divisionPieces";
import type { PastEdition } from "./PastEditionsTable";
import {
  buildRepeaters, currentField, masterTeeRatings,
  type Repeater, type FedInfo, type PlayerForm,
} from "../../pages/fpg/repeatersModel";

/** Uma edição anterior desta prova (o `label` distingue duas no mesmo ano:
 *  etapas do Drive, escalões do USKids). */
export interface EdicaoScout { id: string; year: number; t: Tournament; label?: string | null }

const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

/** Forma WHS: differential médio das últimas 5 voltas (menos é melhor); o
 *  detalhe das 8 melhores e da média de 20 fica no tooltip. */
function FormaCell({ f }: { f: PlayerForm | null }) {
  if (!f || f.avgSD5 == null) return MUTED;
  return (
    <span
      title={`últimas 5 voltas: ${n1(f.avgSD5)} · 8 melhores de 20: ${n1(f.avgSD8)} · média de 20: ${n1(f.avgSD20)}\n`
        + `${f.roundsLast3m} voltas nos últimos 3 meses · última a ${f.lastRoundDate ?? "?"}`}>
      {n1(f.avgSD5)}
    </span>
  );
}

const SEM_EDICOES: EdicaoScout[] = [];

/** Uma volta da prova de hoje: pancadas e ±par (null sem o par do cartão). */
interface VoltaHoje { gross: number; toPar: number | null }
/** A prova a decorrer, jogador a jogador (20/11/2026, Mariana: «o que podíamos ter
 *  realmente de relevante»): as voltas com cartão, o lugar depois das voltas fechadas e
 *  o ±par acumulado. Por nome normalizado (os nomes do draw e dos resultados são os mesmos). */
interface Agora {
  voltas: Map<string, Map<number, VoltaHoje>>;
  rondas: number[];
  /** Voltas que contam para o lugar: as que (quase) todos já entregaram — não a que vai a meio. */
  fechadas: number[];
  pos: Map<string, number>;
  total: Map<string, { gross: number; toPar: number | null }>;
}

function agoraDaProva(t: Tournament): Agora | null {
  const voltas = new Map<string, Map<number, VoltaHoje>>();
  const porRonda = new Map<number, number>();
  for (const p of t.players || []) {
    const vs = new Map<number, VoltaHoje>();
    const rs = (p as Player).roundScores ?? [];
    if (rs.length) {
      for (const r of rs) {
        if (!temCartao(r.gross)) continue;
        const par = r.pars?.length && r.pars.length === r.scores?.length ? soma(r.pars) : null;
        vs.set(r.round, { gross: r.gross, toPar: par != null ? r.gross - par : null });
      }
    } else if (typeof p.grossTotal === "number" && temCartao(p.grossTotal)) {
      vs.set(1, { gross: p.grossTotal, toPar: p.toPar ?? null });
    }
    if (!vs.size) continue;
    voltas.set(normName(p.name), vs);
    for (const r of vs.keys()) porRonda.set(r, (porRonda.get(r) ?? 0) + 1);
  }
  if (!voltas.size) return null;
  const rondas = [...porRonda.keys()].sort((a, b) => a - b);
  const maxCartoes = Math.max(...porRonda.values());
  const fechadas = rondas.filter((r) => r !== t._openRound && (porRonda.get(r) ?? 0) >= 0.8 * maxCartoes);
  const total = new Map<string, { gross: number; toPar: number | null }>();
  for (const [k, vs] of voltas) {
    const fx = fechadas.map((r) => vs.get(r)).filter((v): v is VoltaHoje => !!v);
    if (fx.length !== fechadas.length || !fx.length) continue;
    total.set(k, { gross: soma(fx.map((v) => v.gross)), toPar: fx.every((v) => v.toPar != null) ? soma(fx.map((v) => v.toPar!)) : null });
  }
  // O lugar oficial da fonte quando a maioria o traz (o Drive classifica por escalão, cada um
  // no seu tee — juntar tudo por pancadas misturava Sub 12 com Sub 18); senão, pelo total.
  const oficiais = new Map<string, number>();
  for (const p of t.players || []) { const n = parsePos(p.pos); if (n != null) oficiais.set(normName(p.name), n); }
  const pos = new Map<string, number>();
  if (oficiais.size >= voltas.size / 2) {
    for (const [k, n] of oficiais) pos.set(k, n);
  } else {
    const { pos: posItens } = classificarPorTotal([...total.entries()], () => 1, ([, v]) => v.gross);
    for (const [[k], n] of posItens) pos.set(k, n);
  }
  return { voltas, rondas, fechadas, pos, total };
}

/** A próxima saída: o draw da volta mais adiantada que ainda não acabou (há menos cartões
 *  dessa volta do que jogadores no draw). Hora, buraco e grupo por nome, e o grupo do Manuel. */
interface Saida { ronda: number; porNome: Map<string, { hora: string; grupo: number; buraco: number | null }>; grupoManuel: number | null }
function proximaSaida(t: Tournament, agora: Agora | null): Saida | null {
  const draws = t._draws ?? {};
  const rondas = Object.keys(draws).map(Number).filter((r) => draws[String(r)]?.groups?.length).sort((a, b) => b - a);
  const r = rondas[0];
  if (r == null) return null;
  const grupos = draws[String(r)].groups ?? [];
  const noDraw = somaDe(grupos, (g) => g.players?.length ?? 0);
  const cartoes = agora ? [...agora.voltas.values()].filter((vs) => vs.has(r)).length : 0;
  if (cartoes >= noDraw) return null;
  const porNome = new Map<string, { hora: string; grupo: number; buraco: number | null }>();
  let grupoManuel: number | null = null;
  grupos.forEach((g, i) => {
    for (const p of g.players ?? []) {
      if (!p?.nome) continue;
      porNome.set(normName(p.nome), { hora: g.teeTime ?? "", grupo: i + 1, buraco: g.startHole ?? null });
      if (fieldIsManuel({ name: p.nome, fed: p.fed ?? null })) grupoManuel = i + 1;
    }
  });
  return { ronda: r, porNome, grupoManuel };
}

export default function ScoutProva({ current, previous = SEM_EDICOES, h2hManuel, tCode, escalaoProva, playersDB: pdbPagina }: {
  /** O torneio de hoje: o field sai dele (draw → resultados → inscrições). */
  current: Tournament;
  /** Edições anteriores desta prova, mais recente primeiro. */
  previous?: EdicaoScout[];
  /** Provas FPG em comum com o Manuel, por federado (`buildFpgManuelH2H`). */
  h2hManuel?: Map<string, ScoutComManuel[]>;
  /** tcode USKids da prova de hoje — sai dos «Próximos». */
  tCode?: number | null;
  /** Escalão da prova («Boys 12»…): o escalão de quem não tem nascimento conhecido. */
  escalaoProva?: string | null;
  /** Base de jogadores da página (a da FPG junta país e nascimento); sem ela, a da app. */
  playersDB?: PlayersDB;
}) {
  const { players: pdbApp } = useAppContext();
  const playersDB = (pdbPagina && Object.keys(pdbPagina).length ? pdbPagina : pdbApp) as PlayersDB;
  // Provas de fora sem federado: o da ficha do Kids 2 ligada pelo nome (a seta ↗).
  const kidsMap = useContext(KidsLinkCtx);
  const fedPorNome = useCallback((name: string) => kidsMap.get(normName(name))?.fed ?? null, [kidsMap]);
  // CR/Slope oficiais de todos os tees do campo + forma de cada jogador.
  // Lazy (só ao abrir a tab) e por cache — se a app já os carregou, é grátis.
  const [masterRatings, setMasterRatings] = useState<Map<string, { cr: number; slope: number }> | null>(null);
  const [stats, setStats] = useState<PlayerStatsDb | null>(null);
  useEffect(() => {
    let vivo = true;
    loadMasterData()
      .then((m) => { if (vivo) setMasterRatings(masterTeeRatings(m as never, current.campo)); })
      .catch(() => { if (vivo) setMasterRatings(new Map()); });
    loadPlayerStats()
      .then((s) => { if (vivo) setStats(s); })
      .catch(() => { if (vivo) setStats({}); });
    return () => { vivo = false; };
  }, [current.campo]);

  const rows = useMemo(() => {
    const fedInfo = (fed: string | null): FedInfo | null => {
      const p = fed ? playersDB?.[fed] : null;
      if (!p) return null;
      const club = p.club as unknown as { short?: string; long?: string } | string | null | undefined;
      return {
        hcp: typeof p.hcp === "number" ? p.hcp : (typeof p.hcpExact === "number" ? p.hcpExact : null),
        club: typeof club === "string" ? club : (club?.short || club?.long || null),
        escalao: p.escalao || null,
        sex: p.sex || null,
      };
    };
    const form = (fed: string | null): PlayerForm | null => {
      const s = fed ? stats?.[fed] : null;
      return s ? { ...s, roundsLast3m: s.roundsLast3m ?? 0, roundsLast12m: s.roundsLast12m ?? 0 } : null;
    };
    return buildRepeaters({ current, previous, fedInfo, form, masterRatings: masterRatings ?? undefined, todos: true, fedPorNome });
  }, [current, previous, playersDB, masterRatings, stats, fedPorNome]);

  // Cada linha pela chave do jogador NA PROVA (federado, senão nome). Pelo nome
  // só, dois homónimos ficavam com o índice, a forma e a previsão um do outro
  // (Aniversário Estela 2025: os dois «Pedro Aires», 4939 e 42068 — 10/11/2026).
  const porChave = useMemo(() => new Map(rows.map((r) => [playerKey(r.fedProva, r.name), r])), [rows]);
  // As edições anteriores no bloco «Nesta prova» do Scout (igual em todas as páginas).
  const edicoes = useMemo(() => previous
    .map((p) => buildPastEditionFromTournament(p.t, { id: p.id, year: p.year, label: p.label ?? null, division: p.label || escalaoProva || "", course: p.t.campo || null }))
    .filter((e): e is PastEdition => !!e), [previous, escalaoProva]);
  // O país e o nascimento que a prova traz seguem para o Scout (bandeira e
  // escalão de quem não tem ficha no Kids 2 — 10/11/2026).
  const field = useMemo(() => currentField(current).map((f): FieldPlayer => ({
    name: f.name, fed: f.fed, club: porChave.get(playerKey(f.fed, f.name))?.club ?? null,
    country: f.country ?? null, dob: f.dob ?? null,
  })), [current, porChave]);
  const provasComManuel = useCallback((p: FieldPlayer) => (p.fed ? h2hManuel?.get(p.fed) : null), [h2hManuel]);

  // A prova a decorrer e a próxima saída (20/11/2026).
  const agora = useMemo(() => agoraDaProva(current), [current]);
  const saida = useMemo(() => proximaSaida(current, agora), [current, agora]);
  const manuelKey = useMemo(() => {
    const m = field.find(fieldIsManuel);
    return m ? normName(m.name) : null;
  }, [field]);
  // A prova de hoje, em dias: os confrontos e os últimos torneios destes dias são ela.
  const datasProva = useMemo(() => {
    const ini = isoDate(current.date || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(ini) ? { inicio: ini, fim: addDaysIso(ini, 4) } : null;
  }, [current.date]);

  // O índice WHS de hoje (FPG) vai para a coluna HCP do Perfil; quem não o tem fica com o do Kids 2.
  const hcpDe = useCallback((name: string, fed?: string | null) => porChave.get(playerKey(fed, name))?.hcpNow ?? null, [porChave]);

  // A decorrer (bloco «Agora», cartão «Manuel agora») ou já acabada («Resultado»): o estado do
  // modelo quando o há; senão, se ainda há saídas por jogar, uma volta aberta, ou estamos nos dias dela.
  const aDecorrer = current.status ? current.status !== "finished"
    : !!saida || current._openRound != null || (!!datasProva && todayIso() <= datasProva.fim);

  const extras = useMemo(() => {
    const R = (name: string, fed?: string | null): Repeater | undefined => porChave.get(playerKey(fed, name));
    const tem = {
      tee: new Set(rows.map((r) => r.teeNow).filter(Boolean)).size > 1,
      forma: rows.some((r) => r.form?.avgSD5 != null),
      aqui: rows.some((r) => r.editions.length), prev: rows.some((r) => r.forecast),
      d3m: rows.some((r) => r.form?.hcpDelta3m),
    };
    const antes: ScoutExtraCol[] = [];
    // Saída da próxima volta (a que ainda não acabou), com o grupo do Manuel marcado.
    if (saida) {
      const S = (n: string) => saida.porNome.get(normName(n));
      antes.push({
        key: "hora", label: <>Saída<br />R{saida.ronda}</>, title: `Hora de saída na volta ${saida.ronda} (o draw); «com o Manuel» = no mesmo grupo`,
        sort: (n) => S(n)?.hora || null,
        cell: (n, f) => {
          const s = S(n);
          if (!s) return "–";
          const comManuel = saida.grupoManuel != null && s.grupo === saida.grupoManuel && !fieldIsManuel({ name: n, fed: f ?? null });
          return (
            <span className="scout-saida" title={`Grupo ${s.grupo}${s.buraco && s.buraco !== 1 ? ` · sai do buraco ${s.buraco}` : ""}`}>
              {s.hora}{s.buraco && s.buraco !== 1 ? <span className="scout-sub"> ({s.buraco})</span> : null}
              {comManuel && <span className="p p-sm p-warn">com o Manuel</span>}
            </span>
          );
        },
      });
    }
    // O tee só quando não é o mesmo para todos (o USKids joga todo o escalão do mesmo).
    if (tem.tee) antes.push({ key: "tee", label: "Tee", cell: (n, f) => { const t = R(n, f)?.teeNow; return t ? <TeeDot teeName={t} /> : "–"; } });

    // «Agora»: o lugar depois das voltas fechadas, cada volta e as pancadas contra o Manuel.
    const doAgora: ScoutExtraCol[] = [];
    if (agora) {
      const A = (n: string) => agora.voltas.get(normName(n));
      const grupo = aDecorrer ? "Agora" : "Resultado";
      const depoisDe = agora.fechadas.length ? `depois de ${agora.fechadas.map((r) => `R${r}`).join("+")}` : "";
      if (agora.fechadas.length) {
        doAgora.push({
          grupo, key: "agLugar", label: "Lugar", title: `Lugar ${depoisDe}`,
          sort: (n) => agora.pos.get(normName(n)) ?? null,
          cell: (n) => { const p = agora.pos.get(normName(n)); return p != null ? <PosMedal pos={p} /> : "–"; },
        });
      }
      const voltaCell = (v: VoltaHoje | { gross: number; toPar: number | null } | undefined) => v
        ? <span className="scout-media">
            {v.toPar != null ? <b className={v.toPar <= 0 ? "c-good" : undefined}>{fmtToPar(v.toPar)}</b> : <b>{v.gross}</b>}
            {v.toPar != null && <span className="scout-sub">{v.gross}</span>}
          </span>
        : "–";
      for (const r of agora.rondas) {
        doAgora.push({
          grupo, key: `agR${r}`, label: `R${r}`, dir: "asc",
          title: `Volta ${r}: ±par e pancadas${r === current._openRound ? " (a decorrer)" : ""}`,
          sort: (n) => { const v = A(n)?.get(r); return v ? v.toPar ?? v.gross : null; },
          cell: (n) => voltaCell(A(n)?.get(r)),
        });
      }
      if (agora.fechadas.length > 1) {
        doAgora.push({
          grupo, key: "agTot", label: "Total", title: `±par e pancadas ${depoisDe}`, dir: "asc",
          sort: (n) => { const t = agora.total.get(normName(n)); return t ? t.toPar ?? t.gross : null; },
          cell: (n) => voltaCell(agora.total.get(normName(n))),
        });
      }
      const vm = manuelKey ? agora.voltas.get(manuelKey) : null;
      if (vm?.size) {
        // Pancadas dele − Manuel nas voltas desta prova que os dois já jogaram.
        const vsM = (n: string): number | null => {
          const k = normName(n);
          if (k === manuelKey) return null;
          const vs = agora.voltas.get(k);
          const comuns = [...(vs?.keys() ?? [])].filter((r) => vm.has(r));
          return comuns.length ? soma(comuns.map((r) => vs!.get(r)!.gross - vm.get(r)!.gross)) : null;
        };
        doAgora.push({
          grupo, key: "agVsM", label: <>vs<br />Manuel</>, dir: "asc",
          title: "Pancadas dele a mais (+) ou a menos (−) do que o Manuel nas voltas desta prova",
          sort: vsM,
          cell: (n) => {
            const d = vsM(n);
            return d == null ? "–" : <span className={"scout-prev" + (d > 0 ? " is-good" : d < 0 ? " is-bad" : "")}>{d === 0 ? "=" : fmtSignTipo(d, 0)}</span>;
          },
        });
      }
    }

    // Depois: WHS e previsão WHS — só aparecem com um terço do field com dados (o Scout
    // decide); o índice de hoje passou para a coluna HCP do Perfil (`hcpDe`).
    const depois: ScoutExtraCol[] = [];
    if (tem.d3m) {
      depois.push({ grupo: "WHS", key: "d3m", label: "Δ 3m", title: "Variação do índice nos últimos 3 meses", cell: (n, f) => {
        const d = R(n, f)?.form?.hcpDelta3m;
        return d ? `${fmtSign(d)}` : "–";
      } });
    }
    if (tem.forma) {
      depois.push({ grupo: "WHS", key: "whs", label: "Forma", title: "Differential médio das últimas 5 voltas (verde: acima do seu normal)", cell: (n, f) => <FormaCell f={R(n, f)?.form ?? null} />, sort: (n, f) => R(n, f)?.form?.avgSD5 ?? null });
      depois.push({ grupo: "WHS", key: "whs20", label: "Média", title: "Differential médio das últimas 20 voltas", sort: (n, f) => R(n, f)?.form?.avgSD20 ?? null, cell: (n, f) => n1(R(n, f)?.form?.avgSD20) });
    }
    if (tem.aqui && previous.length >= 2) {
      depois.push({ grupo: "Nesta prova (±par e SD)", key: "aquiTp", label: "Melhor ±", title: "Melhor ±par que fez nesta prova", sort: (n, f) => R(n, f)?.bestToPar ?? null, cell: (n, f) => {
        const b = R(n, f)?.bestToPar;
        return b != null ? fmtToPar(b) : "–";
      } });
      depois.push({ grupo: "Nesta prova (±par e SD)", key: "fit", label: "vs Campo", title: "Onde ficou face à mediana do field nesta prova: − melhor que o campo do meio", sort: (n, f) => R(n, f)?.courseFit ?? null, cell: (n, f) => {
        const c = R(n, f)?.courseFit;
        return c == null ? "–" : `${fmtSign(c)}`;
      } });
    }
    if (tem.prev) {
      depois.push({ grupo: "Previsão WHS", key: "prevWhs", label: "Gross", title: "Gross esperado no torneio", sort: (n, f) => R(n, f)?.forecast?.total ?? null, cell: (n, f) => R(n, f)?.forecast?.total ?? "–" });
      depois.push({ grupo: "Previsão WHS", key: "prevWhsTp", label: "±", cell: (n, f) => {
        const tp = R(n, f)?.forecast?.toPar;
        return tp != null ? fmtToPar(tp) : "–";
      } });
      depois.push({ grupo: "Previsão WHS", key: "prevWhsInt", label: "Intervalo", title: "Intervalo plausível (bom e mau dia)", cell: (n, f) => {
        const fc = R(n, f)?.forecast;
        return fc ? `${fc.low}–${fc.high}` : "–";
      } });
    }
    return { antes, agora: doAgora, depois };
  }, [rows, porChave, saida, agora, manuelKey, current._openRound, previous.length, aDecorrer]);

  const detalhe = (name: string, fed?: string | null) => {
    const r = porChave.get(playerKey(fed, name));
    if (!r || (!r.editions.length && !r.form && !r.forecast)) return null;
    const f = r.form;
    return (
      <div className="u-d-flex u-fwr-wrap u-gap-18px u-fs-fs-12">
        {r.editions.length > 0 && (
          <div>
            <div className="fw-700">Nesta prova</div>
            {r.editions.map((e) => (
              <div key={e.id} className="u-c-text-muted">
                <b className="u-c-text">{e.year}</b>
                {e.pos ? ` · ${fmtOrd(e.pos)}` : ""}
                {e.total != null ? ` · ${e.total}` : ""}
                {e.toPar != null ? <> <ToPar v={e.toPar} light /></> : null}
                {e.hcpThen != null ? ` · índice ${e.hcpThen}` : ""}
                <div>
                  {e.rounds.map((rd) => `R${rd.round} ${rd.gross}${rd.sd != null ? ` (SD ${rd.sd.toFixed(1)})` : ""}`).join(" · ")}
                  {e.rounds[0]?.tee ? ` · ${e.rounds[0].tee}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        {f ? (
          <div>
            <div className="fw-700">Forma WHS</div>
            <div className="u-c-text-muted">
              Differential: últimas 5 <b className="u-c-text">{n1(f.avgSD5)}</b>
              {" "}· 8 melhores de 20 <b className="u-c-text">{n1(f.avgSD8)}</b>
              {" "}· média de 20 <b className="u-c-text">{n1(f.avgSD20)}</b>
              {f.lastSD != null ? <> · última volta {n1(f.lastSD)}</> : null}
              {f.bestSD12m != null ? <> · melhor do ano <b className="u-c-text">{n1(f.bestSD12m)}</b></> : null}
              <div>
                {f.roundsLast3m} voltas em 3 meses · {f.roundsLast12m} em 12
                {f.lastRoundDate ? ` · última a ${f.lastRoundDate}` : ""}
                {/* «de sempre» estava errado (é o último ano) e um WD com gross 0 dava «0» (20/11/2026). */}
                {f.bestGross != null && f.bestGross > 0 && f.bestGross < 900 ? ` · melhor volta do ano ${f.bestGross} pancadas` : ""}
              </div>
            </div>
          </div>
        ) : null}
        {r.forecast ? (
          <div>
            <div className="fw-700">Previsão</div>
            <div className="u-c-text-muted">
              {r.forecast.perRound} por volta · {r.forecast.total} no torneio
              {r.forecast.toPar != null ? <> <ToPar v={r.forecast.toPar} light prefix="(" suffix=")" /></> : null}
              <div>entre {r.forecast.low} e {r.forecast.high} · base: {r.forecast.basis}</div>
              {r.teeNow ? <div>tee de hoje: {r.teeNow}{r.forecast.teeKnown ? "" : " (rating desconhecido)"}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  if (!masterRatings || !stats) return <LoadingState />;

  // As contas WHS (forma, previsão, «vs Campo») só têm lugar quando um terço do field as tem
  // (no USKids eram 2 de 21 — «vejo muita coisa vazia», 20/11/2026); senão ficam no detalhe.
  const minimo = coberturaMinima(rows.length);
  const whsVisivel = rows.filter((r) => r.form?.avgSD5 != null).length >= minimo || rows.filter((r) => r.forecast).length >= minimo;
  const favorito = [...rows].filter((r) => r.forecast).sort((a, b) => a.forecast!.total - b.forecast!.total)[0];
  const emAlta = [...rows]
    .filter((r) => r.form?.avgSD5 != null && r.form?.avgSD20 != null && r.form.avgSD5 - r.form.avgSD20 <= -1)
    .sort((a, b) => (a.form!.avgSD5! - a.form!.avgSD20!) - (b.form!.avgSD5! - b.form!.avgSD20!))[0];

  // O cartão do Manuel na prova a decorrer: o lugar, o ±par e a distância ao 1.º.
  const tm = agora && manuelKey ? agora.total.get(manuelKey) : null;
  const pm = tm && manuelKey ? agora!.pos.get(manuelKey) : null;
  const lider = agora && agora.total.size ? Math.min(...[...agora.total.values()].map((v) => v.gross)) : null;
  const kpiAgora = tm && agora ? (
    <KpiCard label={aDecorrer ? "Manuel agora" : "Manuel nesta prova"} value={pm != null ? fmtOrd(pm) : "–"}
      sub={[`${tm.toPar != null ? fmtToPar(tm.toPar) : `${tm.gross} pancadas`} depois de ${agora.fechadas.map((r) => `R${r}`).join("+")}`,
        lider != null ? (tm.gross === lider ? "na frente" : `a ${tm.gross - lider} do 1.º`) : null].filter(Boolean).join(" · ")} />
  ) : null;

  return (
    <Scout
      field={field}
      editions={edicoes}
      provasComManuel={provasComManuel}
      tCode={tCode}
      escalaoProva={escalaoProva}
      colsAntes={extras.antes}
      colsAgora={extras.agora}
      colsDepois={extras.depois}
      detalheExtra={detalhe}
      hcpDe={hcpDe}
      datasProva={datasProva}
      kpiAgora={kpiAgora}
      resumoExtra={whsVisivel && (favorito?.forecast || emAlta) ? <>
        {favorito?.forecast ? <span className="muted">Melhor previsão: <b className="u-c-text">{favorito.name}</b> ({favorito.forecast.total})</span> : null}
        {emAlta ? <span className="muted">{favorito?.forecast ? " · " : ""}Em alta: <b className="u-c-text">{emAlta.name}</b> ({n1(emAlta.form!.avgSD5)} nas últimas 5, contra {n1(emAlta.form!.avgSD20)} de média)</span> : null}
      </> : undefined}
      rodape={whsVisivel &&
        <details className="u-mt-8px u-fs-fs-12 u-c-text-muted">
          <summary className="u-cur-pointer">Como são feitas a «Forma WHS», o «vs Campo» e a «Previsão WHS»</summary>
          <p className="u-m-6px-0">
            Tudo em <b>score differential</b> — <code>(113/Slope) × (gross − CR − PCC)</code> — que
            é o que permite comparar voltas em campos e tees diferentes. Menos é melhor.
          </p>
          <p className="u-m-6px-0">
            <b>Forma WHS</b>: o differential médio das <b>últimas 5 voltas</b> contra o das últimas 20.
            Não se usa o índice para isto: o índice é a média das 8 melhores de 20, move-se devagar e
            não diz como alguém está a jogar esta semana.
          </p>
          <p className="u-m-6px-0">
            <b>vs Campo</b>: onde ficou face à <b>mediana do field</b> nessa edição. Negativo = jogou
            melhor que o campo do meio. A régua são os adversários daquele dia, por isso já
            absorve o vento e o estado do campo. É informação — <b>não entra na previsão</b>.
          </p>
          <p className="u-m-6px-0">
            <b>Previsão WHS</b> (gross): o meio entre o bom dia (as 8 melhores de 20) e o dia qualquer (a média
            de 20), convertido em gross com o CR e o Slope do tee que ele vai jogar hoje, lidos da
            ficha do campo. Quem nunca jogou esta prova também tem previsão, pela forma (ou pelo
            índice, contando-o mais ~3,5 golpes). O intervalo abre desse meio para os dois lados.
          </p>
        </details>
      }
    />
  );
}

/**
 * Aba «Scout» do CircuitShell: o MESMO Scout de todas as páginas (`ScoutProva`),
 * com as edições anteriores desta prova — as entradas irmãs, menos a de hoje,
 * cada uma no escalão que casa (`match`) ou, no USKids, nos escalões por onde os
 * miúdos passaram (`scoutMatch`: um por coluna).
 */
export function ScoutDoCircuito({ current, editions, division, currentId, match = matchDivision, scoutMatch, tCode }: {
  /** O torneio de hoje (`divisionTournament`). */
  current: Tournament;
  editions: CircuitEntry[]; division: string; currentId: string;
  match?: (divisions: CircuitDivision[], label: string) => CircuitDivision | null;
  /** Os escalões de cada edição que entram — ver `CircuitConfig.scoutDivisions`. */
  scoutMatch?: (edition: CircuitEntry, divisions: CircuitDivision[]) => CircuitDivision[];
  /** Código USKids do torneio de hoje (sai das próximas inscrições). */
  tCode?: number | null;
}) {
  const [prev, setPrev] = useState<EdicaoScout[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const outras = editions.filter((e) => e.id !== currentId);
      const loaded = await Promise.all(outras.map(async (e) => {
        try { return { e, divs: await entryDivisions(e) }; } catch { return { e, divs: [] as CircuitDivision[] }; }
      }));
      const out: { ed: EdicaoScout; stamp: string }[] = [];
      for (const { e, divs } of loaded) {
        const escolhidas = scoutMatch ? scoutMatch(e, divs) : [match(divs, division)].filter((d): d is CircuitDivision => !!d);
        for (const dv of escolhidas) {
          const t = dv.results ?? totalsDivisionView(dv, { name: e.name, date: e.dateStart ?? undefined, campo: e.course ?? undefined })?.tournament;
          if (!t?.players?.length) continue;
          out.push({
            ed: { id: scoutMatch ? `${e.id}:${dv.key}` : e.id, year: e.year ?? 0, t, label: scoutMatch ? (dv.tabLabel || dv.escalao || null) : (e.name || null) },
            stamp: e.dateStart || String(e.year ?? 0),
          });
        }
      }
      out.sort((a, b) => (b.stamp < a.stamp ? -1 : b.stamp > a.stamp ? 1 : 0));
      if (alive) setPrev(out.map((x) => x.ed));
    })().catch(() => { if (alive) setPrev([]); });
    return () => { alive = false; };
  }, [editions, currentId, division, match, scoutMatch]);
  if (!prev) return <LoadingState />;
  return <ScoutProva current={current} previous={prev} tCode={tCode} escalaoProva={division} />;
}
