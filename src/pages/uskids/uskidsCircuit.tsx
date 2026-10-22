/**
 * src/pages/uskids/uskidsCircuit.tsx — a /uskids no CircuitShell (20/10/2026).
 *
 * Adaptador: cada torneio USKids (inscritos do uskids-field.json + resultados
 * dos uskids_torneios_completos(N) / uskids-results.json + draws) passa a uma
 * `CircuitEntry` e cada escalão a uma `CircuitDivision`:
 *   • com resultados → o TournamentDetail de sempre (Draw R{n}, voltas, Resumo,
 *     Scorecards) com as abas «Edições anteriores» e «Scout» do shell;
 *   • só inscritos → Inscrições (AdmissionsTab) + Draw + Edições + Scout, na
 *     barra de secções do shell;
 *   • torneio por disputar → a grelha de todos os escalões (TabCampoDetalhe)
 *     como primeira divisão, «Todos».
 * As edições anteriores de public/data/uskids-edicoes/ entram como entradas
 * só do `pastEditionsPool` (não aparecem na barra lateral).
 */
import { withDivisionModel } from "../../data/model/division";
import { playerIdentity } from "../../data/model/identity";
import { useContext, useMemo } from "react";
import { TournamentDetail, type TournamentDetailProps } from "../fpg/TournamentDetail";
import type { Tournament as TATournament } from "../FPGPage";
import EmptyState from "../../ui/EmptyState";
import TabCampoDetalhe, { uskidsLinks } from "../../ui/TabCampoDetalhe";
import type { FpgAdmissionPlayer, FpgAdmissions, FpgDraw } from "../../data/nacional2026Loader";
import { normName as normNameAuto, type AutoRivalPlayer } from "../../data/KIDSdataLoader";
import { cachedFetchJson } from "../../data/fetchCache";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../../constants/manuel";
import { displayName, isoDate, norm } from "../../utils/format";
import { flag } from "../../utils/flagUtils";
import { divKey, tournamentFamilyKey } from "../../ui/circuit/pastEditions";
import { TEES_LOOKUP, isWD, fmtTs, ArMapCtx, isTerminado } from "../../ui/USKIDSPageHelpers";
import { sortEscaloes, type Torneio, type TorneioResult, type EscalaoResult, type UskidsDrawsData, type UskidsDrawRonda } from "../../ui/uskidsTypes";
import type { CircuitConfig, CircuitDivision, CircuitEntry, CircuitRenderFullExtras, CircuitRoundDraw } from "../../ui/circuit/types";

type FieldEscalao = Torneio["escaloes"][number];

// ─────────────────────────────────────────────
// Escalão com resultados → Tournament (formato FPG)
// ─────────────────────────────────────────────

/** Campo do escalão: o das voltas (no World cada escalão joga noutro campo e o
 *  `campo` do torneio é a lista de todos). */
function campoEscalao(esc: EscalaoResult): string {
  const voltas = [...new Set(esc.rondas.map(r => (r as { campo?: string }).campo).filter(Boolean))];
  return esc.campo || voltas.join(" / ");
}

const temDados = (esc: EscalaoResult) => esc.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

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
function roundDrawsOf(drawsData: UskidsDrawsData | null | undefined, t: number, ageGroup: number, e: EscalaoResult | null, date: string): CircuitRoundDraw[] | undefined {
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
function escalaoTemManuel(e: EscalaoResult, t: TorneioResult): boolean {
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
const sexoEscalao = (nome: string) => (/girls/i.test(nome) ? "F" as const : /boys/i.test(nome) ? "M" as const : undefined);

// ─────────────────────────────────────────────
// Detalhe de um escalão com resultados (TournamentDetail)
// ─────────────────────────────────────────────
function UskidsEscalaoDetail({ escalao: e, torneio: t, drawsData, extras, moreTabs, tabParam = "rt" }: {
  escalao: EscalaoResult;
  torneio: TorneioResult;
  drawsData: UskidsDrawsData | null;
  extras?: CircuitRenderFullExtras;
  /** Abas da página a seguir às do shell (o Kids 2 junta as de análise). */
  moreTabs?: UskidsExtraTab[];
  tabParam?: string;
}) {
  // O arMap chega aos poucos (os rivais carregam em fundo): o torneio monta-se
  // aqui, no render, para o HCP FPG dos portugueses (SD exacto) entrar quando chega.
  const arMap = useContext(ArMapCtx);
  const tournament = useMemo(() => escalaoToTournament(e, t, arMap), [e, t, arMap]);
  const roundDraws = useMemo(() => roundDrawsOf(drawsData, t.t, e.age_group, e, t.date_inicio), [drawsData, t, e]);
  // Escalão num campo diferente do do torneio (ex.: European Championship, um
  // campo por escalão): o campo vai para a linha de informação, junto do CR e
  // do Slope (14/10/2026).
  const campo = tournament.campo || "";
  const campoProprio = !!campo && campo.trim() !== (t.campo || "").trim();
  const options = useMemo(() => ({ noInferBlanks: true, showCourse: campoProprio }), [campoProprio]);
  // «Edições anteriores» e «Scout» vêm do shell.
  const extraTabs = useMemo(() => {
    const tabs = [extras?.pastEditionsTab, extras?.repeatersTab, ...(moreTabs ?? [])].filter((x): x is NonNullable<typeof x> => !!x);
    return tabs.length ? tabs : undefined;
  }, [extras?.pastEditionsTab, extras?.repeatersTab, moreTabs]);

  // playersDB com kidsHash para todos os jogadores deste escalão
  const kidsDB = useMemo(() => {
    const db: Record<string, { name: string; kidsHash: string }> = {};
    if (!arMap) return db;
    for (const rd of e.rondas) {
      for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
        const ar = arMap.get(normNameAuto(j.nome));
        if (!ar) continue;
        const memberId = (ar as any).memberId as string | undefined;
        const key = normNameAuto(j.nome);
        if (!db[key]) db[key] = { name: ar.n, kidsHash: memberId ?? encodeURIComponent(ar.n) };
      }
    }
    return db;
  }, [arMap, e]);

  if (!temDados(e) && !roundDraws) return <EmptyState size="sm" message="Sem dados para este escalão." />;

  // Notas sobre resultados (ex.: penalização do Manuel no Marco Simone 2026),
  // visíveis por cima das tabelas do escalão — 14/10/2026.
  const notas = [...new Map(e.rondas.flatMap(r => (r.leaderboard ?? r.jogadores ?? []))
    .filter(j => j._nota).map(j => [`${j.nome}|${j._nota}`, j] as const)).values()];
  const actualizado = fmtTs(t.ultima_atualizacao);

  return (
    <div>
      {actualizado && <div className="muted fs-11" style={{ margin: "-2px 0 6px" }}>Resultados actualizados {actualizado}</div>}
      {notas.map(j => (
        <div key={j.nome + j._nota} className="notice" style={{ margin: "2px 0 6px", padding: "5px 10px" }}>
          ⚠️ <strong>{displayName(j.nome)}</strong> — {j._nota}
        </div>
      ))}
      {/* «rt» na /uskids: lá o «tab» é das vistas da página. */}
      <TournamentDetail tournament={tournament} escLookup={new Map()} playersDB={kidsDB as unknown as TournamentDetailProps["playersDB"]}
        options={options} siLabel="m" hideHeader synthDraws={false} roundDraws={roundDraws} extraTabs={extraTabs} tabParam={tabParam} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Divisões de um torneio
// ─────────────────────────────────────────────

export interface UskidsExtraTab { key: string; label: string; content: React.ReactNode }
export interface UskidsDivisionsOpts {
  /** Abas próprias de cada escalão, depois das do shell (Kids 2: as de análise). */
  extraTabs?: (escalao: string) => UskidsExtraTab[];
  /** Parâmetro do URL das abas do TournamentDetail (default «rt», o da /uskids). */
  tabParam?: string;
  /** Sem a grelha «Todos» dos torneios por disputar. */
  semTodos?: boolean;
}

/** Escalões de um torneio: os dos resultados (com dados) e os dos inscritos,
 *  juntos pelo age_group; por disputar, a grelha «Todos» à frente. */
export function uskidsDivisions(campo: Torneio | null, res: TorneioResult | null, drawsData: UskidsDrawsData | null, opts: UskidsDivisionsOpts = {}): CircuitDivision[] {
  type Par = { nome: string; age_group: number; r?: EscalaoResult; f?: FieldEscalao };
  const byAge = new Map<number, Par>();
  for (const r of res?.escaloes ?? []) if (temDados(r)) byAge.set(r.age_group, { nome: r.nome, age_group: r.age_group, r });
  for (const f of campo?.escaloes ?? []) {
    const p = byAge.get(f.age_group) ?? [...byAge.values()].find(x => x.nome === f.nome);
    if (p) p.f = f;
    else if ((f.jogadores?.length ?? 0) > 0 || (f.removed?.length ?? 0) > 0) byAge.set(f.age_group, { nome: f.nome, age_group: f.age_group, f });
  }
  const date = res?.date_inicio ?? campo?.date_inicio ?? "";
  const tCode = res?.t ?? campo?.t ?? 0;
  const divs: CircuitDivision[] = sortEscaloes([...byAge.values()]).map((p): CircuitDivision => {
    const results = p.r && res ? escalaoToTournament(p.r, res) : undefined;
    const roundDraws = roundDrawsOf(drawsData, tCode, p.age_group, p.r ?? null, date);
    const hasManuel = (p.r && res ? escalaoTemManuel(p.r, res) : false)
      || (p.f?.jogadores ?? []).some(j => isManuel(j.nome));
    const base: CircuitDivision = { key: `g${p.age_group}`, escalao: p.nome, sex: sexoEscalao(p.nome), hasManuel };
    if (results && p.r && res) {
      const r = p.r;
      return {
        ...base, results, roundDraws,
        renderFullKeepHeader: true,
        renderFull: (extras) => <UskidsEscalaoDetail escalao={r} torneio={res} drawsData={drawsData} extras={extras}
          moreTabs={opts.extraTabs?.(p.nome)} tabParam={opts.tabParam} />,
      };
    }
    return { ...base, admissions: p.f ? fieldAdmissions(p.f) : undefined, roundDraws, siLabel: "m", extraSections: opts.extraTabs?.(p.nome) };
  });
  if (campo && !opts.semTodos && !isTerminado(campo.date_fim, campo.date_inicio)) {
    divs.unshift({
      key: "todos", escalao: "Todos", tabLabel: "Todos",
      renderFull: () => <TabCampoDetalhe torneio={campo} />,
    });
  }
  // Modelo comum (src/data/model): formato, estado, buracos, cut, par.
  return divs.map(withDivisionModel);
}

/** Escalão que abre nos Resultados: o do Manuel, senão o primeiro com resultados. */
export function resultadosDivKey(res: TorneioResult | null): string | undefined {
  if (!res) return undefined;
  const com = sortEscaloes(res.escaloes.filter(temDados));
  const m = com.find(e => escalaoTemManuel(e, res)) ?? com[0];
  return m ? `g${m.age_group}` : undefined;
}

/** Links oficiais no cabeçalho do shell (o ↗ é do shell). */
export function uskidsCircuitLinks(t: number, urlUskids?: string | null) {
  return uskidsLinks(t, urlUskids).map(l => ({ label: l.label.replace(/\s*↗\s*$/, ""), url: l.url }));
}

// ─────────────────────────────────────────────
// Edições anteriores de public/data/uskids-edicoes/ (só no pool)
// ─────────────────────────────────────────────
export interface EdicoesIndex { torneios: { t: number; name: string; date_inicio?: string }[] }

/** Uma edição do índice como entrada do pool (carrega o ficheiro só quando a
 *  prova dela está aberta e pede as edições). */
export function edicaoEntry(x: EdicoesIndex["torneios"][number]): CircuitEntry {
  const iso = isoDate(x.date_inicio || "");
  return {
    id: String(x.t), tcode: String(x.t), name: x.name,
    year: parseInt(iso.slice(0, 4), 10) || null, dateStart: iso || undefined,
    loadDivisions: () => cachedFetchJson<TorneioResult>(`/data/uskids-edicoes/${x.t}.json`).then(ed => {
      if (!ed) return [];
      // As voltas vêm em jardas (como o uskids-results.json) → metros.
      for (const esc of ed.escaloes ?? []) for (const rd of esc.rondas ?? []) {
        const yards = (rd as { yards?: number[] }).yards;
        if (!rd.metros?.length && yards?.length) rd.metros = yards.map(y => Math.round(y * 0.9144));
      }
      return uskidsDivisions(null, ed, null);
    }),
  };
}

// ─────────────────────────────────────────────
// Configuração do shell
// ─────────────────────────────────────────────

/** Idades de um escalão USKids: «Boys 12» → [12,12], «Boys 13-14» → [13,14],
 *  «Boys 7 & Under» → [0,7]. */
export function idadesEscalao(nome: string): [number, number] | null {
  const n = (nome.match(/\d+/g) || []).map(Number);
  if (!n.length) return null;
  if (/under/i.test(nome)) return [0, n[0]];
  return [n[0], n[1] ?? n[0]];
}

const labelDe = (d: CircuitDivision) => d.tabLabel || d.escalao || "";

/** Escalão correspondente noutra edição: nome igual, senão sexo + idade (sem o
 *  ±1 ano do `matchDivision` partilhado — um Boys 12 nunca é um Boys 11). */
export function matchEscalaoDiv(divs: CircuitDivision[], label: string): CircuitDivision | null {
  const cands = divs.filter(d => d.key !== "todos");
  const exact = cands.find(d => labelDe(d) === label);
  if (exact) return exact;
  const k = divKey(label);
  return cands.find(d => { const kx = divKey(labelDe(d)); return kx.sex === k.sex && kx.age === k.age; }) ?? null;
}

/** «Scout» do USKids (decisão dela, 19/10/2026): os miúdos sobem de escalão
 *  todos os anos, por isso cada edição anterior entra com o(s) escalão(ões)
 *  onde estavam ENTÃO — idade de hoje menos os anos de diferença (Boys 12 2026
 *  ↔ Boys 11 2025; Boys 13-14 2026 ↔ Boys 12 e 13-14 2025). */
export function scoutEscaloes(cur: CircuitEntry, division: string, ed: CircuitEntry, divs: CircuitDivision[]): CircuitDivision[] {
  if (ed.id === cur.id) return [];
  const faixa = idadesEscalao(division);
  if (!faixa) return [];
  const dif = (cur.year ?? 0) - (ed.year ?? cur.year ?? 0);
  if (dif <= 0) return [];
  const sexo = divKey(division).sex;
  const [lo, hi] = [faixa[0] - dif, faixa[1] - dif];
  return divs.filter(d => {
    if (d.key === "todos" || !d.results || divKey(labelDe(d)).sex !== sexo) return false;
    const f = idadesEscalao(labelDe(d));
    return !!f && f[1] >= lo && f[0] <= hi;
  });
}

const BASE_CONFIG: CircuitConfig = {
  routeBase: "/uskids",
  title: "🏌️ USKids",
  grouping: "month-year",
  olderYearsByYear: true,
  filters: { search: true },
  editionKey: (e) => tournamentFamilyKey(e.name),
  matchDivision: matchEscalaoDiv,
  scoutDivisions: scoutEscaloes,
  scoutTCode: (e) => Number(e.tcode) || null,
  tabParam: "rt",
  loadingMessage: "A carregar resultados…",
};
/** Torneios (por disputar): o mais próximo primeiro. */
export const USKIDS_CONFIG_CAMPO: CircuitConfig = { ...BASE_CONFIG, sidebarOrder: "asc" };
/** Resultados (já jogados): o mais recente primeiro. */
export const USKIDS_CONFIG_RESULTADOS: CircuitConfig = BASE_CONFIG;
