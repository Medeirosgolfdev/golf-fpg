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
import {
  type FieldEscalao, temDados, escalaoToTournament, roundDrawsOf, escalaoTemManuel, fieldAdmissions, sexoEscalao,
} from "../../data/uskids/toTournament";
import { useContext, useMemo } from "react";
import { TournamentDetail, type TournamentDetailProps } from "../fpg/TournamentDetail";
import EmptyState from "../../ui/EmptyState";
import TabCampoDetalhe, { uskidsLinks } from "../../ui/TabCampoDetalhe";
import { normName as normNameAuto } from "../../data/KIDSdataLoader";
import { cachedFetchJson } from "../../data/fetchCache";
import { isManuelByName as isManuel } from "../../constants/manuel";
import { displayName, isoDate } from "../../utils/format";
import { divKey, tournamentFamilyKey } from "../../ui/circuit/pastEditions";
import { fmtTs, ArMapCtx, isTerminado } from "../../ui/USKIDSPageHelpers";
import { sortEscaloes, type Torneio, type TorneioResult, type EscalaoResult, type UskidsDrawsData } from "../../ui/uskidsTypes";
import type { CircuitConfig, CircuitDivision, CircuitEntry, CircuitRenderFullExtras } from "../../ui/circuit/types";


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
  escalaoSource: "uskids",
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
