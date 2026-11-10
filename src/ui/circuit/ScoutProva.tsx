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
import type { Tournament } from "../../data/fpgTypes";
import { TeeDot, type PlayersDB } from "../tournamentPrimitives";
import { fmtToPar, fmtSign, fmtOrd } from "../../utils/format";
import ToPar from "../ToPar";
import { normName } from "../../utils/normName";
import { playerKey } from "../../utils/playerKey";
import { loadMasterData } from "../../data/loader";
import { loadPlayerStats, type PlayerStatsDb } from "../../data/playerStatsTypes";
import LoadingState from "../LoadingState";
import { MUTED } from "../tableCells";
import Scout, { type ScoutExtraCol } from "./Scout";
import type { ScoutComManuel } from "./scoutModel";
import type { FieldPlayer } from "./repeaters";
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

  const extras = useMemo(() => {
    const R = (name: string, fed?: string | null): Repeater | undefined => porChave.get(playerKey(fed, name));
    const tem = {
      hora: rows.some((r) => r.teeTime), tee: rows.some((r) => r.teeNow),
      hcp: rows.some((r) => r.hcpNow != null), forma: rows.some((r) => r.form?.avgSD5 != null),
      aqui: rows.some((r) => r.editions.length), prev: rows.some((r) => r.forecast),
    };
    const antes: ScoutExtraCol[] = [];
    if (tem.hora) antes.push({ key: "hora", label: "Saída", title: "Hora do draw", cell: (n, f) => R(n, f)?.teeTime || "–", sort: (n, f) => R(n, f)?.teeTime || null });
    if (tem.tee) antes.push({ key: "tee", label: "Tee", cell: (n, f) => { const t = R(n, f)?.teeNow; return t ? <TeeDot teeName={t} /> : "–"; } });
    const depois: ScoutExtraCol[] = [];
    if (tem.hcp) {
      depois.push({ grupo: "WHS", key: "fpghcp", label: "Índice", title: "Índice de hoje (FPG)", cell: (n, f) => R(n, f)?.hcpNow ?? "–", sort: (n, f) => R(n, f)?.hcpNow ?? null });
      depois.push({ grupo: "WHS", key: "d3m", label: "Δ 3m", title: "Variação do índice nos últimos 3 meses", cell: (n, f) => {
        const d = R(n, f)?.form?.hcpDelta3m;
        return d ? `${fmtSign(d)}` : "–";
      } });
    }
    if (tem.forma) {
      depois.push({ grupo: "WHS", key: "whs", label: "Forma", title: "Differential médio das últimas 5 voltas (verde: acima do seu normal)", cell: (n, f) => <FormaCell f={R(n, f)?.form ?? null} />, sort: (n, f) => R(n, f)?.form?.avgSD5 ?? null });
      depois.push({ grupo: "WHS", key: "whs20", label: "Média", title: "Differential médio das últimas 20 voltas", cell: (n, f) => n1(R(n, f)?.form?.avgSD20) });
    }
    if (tem.aqui) {
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
    return { antes, depois };
  }, [rows, porChave]);

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
              <div>
                {f.roundsLast3m} voltas em 3 meses · {f.roundsLast12m} em 12
                {f.lastRoundDate ? ` · última a ${f.lastRoundDate}` : ""}
                {f.bestGross != null ? ` · melhor volta de sempre ${f.bestGross}` : ""}
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

  const favorito = [...rows].filter((r) => r.forecast).sort((a, b) => a.forecast!.total - b.forecast!.total)[0];
  const emAlta = [...rows]
    .filter((r) => r.form?.avgSD5 != null && r.form?.avgSD20 != null && r.form.avgSD5 - r.form.avgSD20 <= -1)
    .sort((a, b) => (a.form!.avgSD5! - a.form!.avgSD20!) - (b.form!.avgSD5! - b.form!.avgSD20!))[0];

  return (
    <Scout
      field={field}
      editions={edicoes}
      provasComManuel={provasComManuel}
      tCode={tCode}
      escalaoProva={escalaoProva}
      colsAntes={extras.antes}
      colsDepois={extras.depois}
      detalheExtra={detalhe}
      semHcp
      resumoExtra={<>
        {favorito?.forecast ? <span className="muted u-ml-8px">· Melhor previsão: <b className="u-c-text">{favorito.name}</b> ({favorito.forecast.total})</span> : null}
        {emAlta ? <span className="muted"> · Em alta: <b className="u-c-text">{emAlta.name}</b> ({n1(emAlta.form!.avgSD5)} nas últimas 5, contra {n1(emAlta.form!.avgSD20)} de média)</span> : null}
      </>}
      rodape={
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
