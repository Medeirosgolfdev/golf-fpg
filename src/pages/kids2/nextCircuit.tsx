/**
 * kids2/nextCircuit.tsx — os Próximos torneios do Kids 2 no CircuitShell (20/10/2026).
 *
 * Adaptador: cada torneio que a vista sabe analisar (useFieldRivaisData —
 * próximos, passados USKids, WJGC/Doral/EOWAGR, FFG U14, JobFile) passa a uma
 * `CircuitEntry`, e cada escalão a uma `CircuitDivision`:
 *   • USKids → os escalões da /uskids (uskidsDivisions: Inscrições, Draw, voltas,
 *     Resumo, Scorecards), com «Edições anteriores» e «Scout» do shell;
 *   • os outros → o field como Inscrições (AdmissionsTab) + Scout;
 *   • em todos, as abas de análise da vista: Por torneio, Scores, Scorecards,
 *     O Campo, Previsão (FieldRivaisSection).
 * Chave da divisão = nome do escalão, que é o `esc=` do URL.
 */
import { createContext, useContext } from "react";
import LoadingState from "../../ui/LoadingState";
import type { AutoRivalPlayer } from "../../data/KIDSdataLoader";
import type { FpgAdmissionPlayer, FpgAdmissions } from "../../data/nacional2026Loader";
import { isManuelByName as isManuel } from "../../constants/manuel";
import { displayName, isoDate, todayIso } from "../../utils/format";
import { tournamentFamilyKey } from "../../ui/circuit/pastEditions";
import type { CircuitConfig, CircuitDivision, CircuitEntry } from "../../ui/circuit/types";
import type { Torneio as UskTorneio, TorneioResult, UskidsDrawsData } from "../../ui/uskidsTypes";
import {
  FIELD_SECTIONS, FieldRivaisSection, escalaoMatches,
  type FieldRivaisData, type FieldTorneio, type FieldEscalao,
} from "../kids/FieldRivaisDashboard";
import {
  uskidsDivisions, uskidsCircuitLinks, matchEscalaoDiv, scoutEscaloes, type UskidsExtraTab,
} from "../uskids/uskidsCircuit";

// ─────────────────────────────────────────────
// Contexto das abas de análise (os dados chegam aos poucos — as abas lêem-nos
// daqui, não do momento em que as divisões foram montadas)
// ─────────────────────────────────────────────
interface NextCtx { data: FieldRivaisData | null; autoRivals?: AutoRivalPlayer[]; onSelectPlayer?: (name: string) => void; ready?: boolean }
export const Kids2NextCtx = createContext<NextCtx>({ data: null });

function NextSection({ t, escalao, section }: { t: number; escalao: string; section: (typeof FIELD_SECTIONS)[number]["key"] }) {
  const { data, autoRivals, onSelectPlayer, ready } = useContext(Kids2NextCtx);
  if (!data) return null;
  // A página abre antes dos rivais e do histórico (23/10/2026); estas abas esperam por eles.
  if (!ready) return <LoadingState message="A carregar os rivais e o histórico…" />;
  // O nome do escalão na lista da vista pode não ser o dos resultados
  // (ex.: «Boys 11-12» num JobFile) → o igual, senão o compatível.
  const torneio = data.futureTorneios.find(x => x.t === t);
  const com = (torneio?.escaloes ?? []).filter(e => (e.jogadores?.length ?? 0) > 0);
  const esc = com.find(e => e.nome === escalao) ?? com.find(e => escalaoMatches(escalao, e.nome));
  return <FieldRivaisSection data={data} torneioT={t} escalaoNome={esc?.nome ?? escalao} section={section}
    autoRivals={autoRivals} onSelectPlayer={onSelectPlayer} />;
}

const analise = (t: number) => (escalao: string): UskidsExtraTab[] =>
  FIELD_SECTIONS.map(s => ({ key: s.key, label: s.label, content: <NextSection t={t} escalao={escalao} section={s.key} /> }));

// ─────────────────────────────────────────────
// Divisões
// ─────────────────────────────────────────────
const sexoDe = (nome: string) => (/girl/i.test(nome) ? "F" as const : /boy/i.test(nome) ? "M" as const : undefined);

/** Field da vista (nome + país) no formato das inscrições da FPG. */
function admissionsDe(e: FieldEscalao): FpgAdmissions | undefined {
  const players = (e.jogadores ?? []).map((j, i): FpgAdmissionPlayer => ({
    fed: null, hcp: null, vac: null, dataInscricao: null, escalao: e.nome,
    pos: i + 1, nome: displayName(j.nome), clube: j.cidade || null, country: j.pais || null, status: "confirmed",
  }));
  return players.length ? { name: e.nome, totalInscritos: players.length, reservas: 0, players } : undefined;
}

function fieldDivision(ft: FieldTorneio, e: FieldEscalao): CircuitDivision {
  return {
    key: e.nome, escalao: e.nome, sex: sexoDe(e.nome),
    hasManuel: (e.jogadores ?? []).some(j => isManuel(j.nome)),
    admissions: admissionsDe(e),
    extraSections: analise(ft.t)(e.nome),
  };
}

const comJogadores = (ft: FieldTorneio) => ft.escaloes.filter(e => (e.jogadores?.length ?? 0) > 0);

/** Escalões de um torneio USKids: os da /uskids (com resultados e draws quando
 *  os há), senão o field da vista. */
function uskidsDivs(ft: FieldTorneio, campo: UskTorneio | null, res: TorneioResult | null, draws: UskidsDrawsData | null): CircuitDivision[] {
  const divs = uskidsDivisions(campo, res, draws, { extraTabs: analise(ft.t), tabParam: "tab", semTodos: true })
    .map(d => ({ ...d, key: d.escalao }));
  return divs.length ? divs : comJogadores(ft).map(e => fieldDivision(ft, e));
}

// ─────────────────────────────────────────────
// Entradas
// ─────────────────────────────────────────────
export const SERIES = {
  proximos: "Próximos torneios",
  passados: "Passados USKids",
  ffg: "FFG · Internationaux U14",
  intl: "Torneios internacionais",
} as const;
const FAMILIAS = ["WJGC", "Doral", "EOWAGR"] as const;

function baseEntry(ft: FieldTorneio): Omit<CircuitEntry, "id" | "loadDivisions"> {
  const iso = isoDate(ft.date_inicio || "");
  const escs = comJogadores(ft);
  return {
    name: ft.name,
    year: parseInt(iso.slice(0, 4), 10) || null,
    dateStart: iso || undefined,
    hasManuel: escs.some(e => (e.jogadores ?? []).some(j => isManuel(j.nome))),
    playerCount: escs.reduce((s, e) => s + (e.jogadores?.length ?? 0), 0),
    divisionCount: escs.length,
  };
}

/** Escalão que abre: o do Manuel (o shell já o prefere), senão o compatível com o dele. */
const divDefault = (ft: FieldTorneio, escRef: string) =>
  comJogadores(ft).find(e => e.nome === escRef)?.nome ?? comJogadores(ft).find(e => escalaoMatches(escRef, e.nome))?.nome;

export interface NextSources {
  data: FieldRivaisData;
  results: TorneioResult[] | null;
  draws: UskidsDrawsData | null;
  escRef: string;
}

export function buildNextEntries({ data, results, draws, escRef }: NextSources): CircuitEntry[] {
  const resPorT = new Map((results ?? []).map(r => [r.t, r]));
  const campoPorT = new Map(data.field.torneios.map(t => [t.t, t as unknown as UskTorneio]));
  const out: CircuitEntry[] = [];
  const familias = new Map<string, FieldTorneio[]>();
  const d0 = todayIso();

  for (const ft of data.futureTorneios) {
    const fam = FAMILIAS.find(f => ft.name.startsWith(f + " "));
    if (ft.t < 0 && fam) {
      const ano = ft.name.match(/\b(\d{4})\b/)?.[1] ?? "";
      const k = `${fam}|${ano}`;
      if (!familias.has(k)) familias.set(k, []);
      familias.get(k)!.push(ft);
      continue;
    }
    const base = baseEntry(ft);
    if (ft.t > 0) {
      const campo = campoPorT.get(ft.t) ?? null;
      const res = resPorT.get(ft.t) ?? null;
      let feito: CircuitDivision[] | null = null;
      out.push({
        ...base, id: String(ft.t), tcode: String(ft.t),
        series: (base.dateStart ?? "") >= d0 ? SERIES.proximos : SERIES.passados,
        course: campo?.campo ?? res?.campo ?? undefined,
        dateEnd: campo?.date_fim ? isoDate(campo.date_fim) : undefined,
        links: uskidsCircuitLinks(ft.t, campo?.url_uskids),
        hasResults: !!res,
        defaultDivKey: divDefault(ft, escRef),
        loadDivisions: () => Promise.resolve(feito ??= uskidsDivs(ft, campo, res, draws)),
      });
    } else {
      out.push({
        ...base, id: String(ft.t),
        series: ft.t <= -1000 ? SERIES.intl : ft.t <= -100 ? SERIES.ffg : SERIES.intl,
        defaultDivKey: divDefault(ft, escRef),
        divisions: comJogadores(ft).map(e => fieldDivision(ft, e)),
      });
    }
  }

  // WJGC / Doral / EOWAGR: um torneio por ano, cada escalão uma divisão (na
  // vista antiga cada ano×escalão era uma opção do menu).
  for (const [k, fts] of familias) {
    const [fam, ano] = k.split("|");
    // Um escalão por divisão: quando dois tids dão o mesmo escalão (o WJGC tem
    // dezenas sem ano nem escalão no nome → «Geral»), fica o de field maior —
    // a vista antiga também só oferecia um por escalão.
    const porEsc = new Map<string, { ft: FieldTorneio; e: FieldEscalao }>();
    for (const ft of fts) for (const e of comJogadores(ft)) {
      const ja = porEsc.get(e.nome);
      if (!ja || (e.jogadores?.length ?? 0) > (ja.e.jogadores?.length ?? 0)) porEsc.set(e.nome, { ft, e });
    }
    const divisions = [...porEsc.values()].map(({ ft, e }) => fieldDivision(ft, e));
    const escs = [...porEsc.values()].map(x => x.e);
    out.push({
      id: `${fam.toLowerCase()}-${ano}`, name: `${fam} ${ano}`, series: fam,
      year: parseInt(ano, 10) || null,
      hasManuel: divisions.some(d => d.hasManuel),
      playerCount: escs.reduce((s, e) => s + (e.jogadores?.length ?? 0), 0),
      divisionCount: divisions.length,
      defaultDivKey: escs.find(e => escalaoMatches(escRef, e.nome))?.nome,
      divisions,
    });
  }
  return out;
}

/** Torneio que abre sem ?t=: o próximo em que o Manuel está inscrito. */
export function defaultEntryId(entries: CircuitEntry[]): string | null {
  const d0 = todayIso();
  const prox = entries.filter(e => e.series === SERIES.proximos && (e.dateStart ?? "") >= d0)
    .sort((a, b) => (a.dateStart ?? "").localeCompare(b.dateStart ?? ""));
  return (prox.find(e => e.hasManuel) ?? prox[0] ?? entries[0])?.id ?? null;
}

/** Pool das «Edições anteriores»/«Scout» dos torneios USKids: os resultados
 *  todos, mais as entradas da própria lista. */
export function buildEditionsPool(entries: CircuitEntry[], results: TorneioResult[] | null, draws: UskidsDrawsData | null, extra: CircuitEntry[]): CircuitEntry[] {
  const pool = entries.filter(e => Number(e.id) > 0);
  const temos = new Set(pool.map(e => e.id));
  for (const r of results ?? []) {
    if (temos.has(String(r.t))) continue;
    temos.add(String(r.t));
    const iso = isoDate(r.date_inicio);
    let feito: CircuitDivision[] | null = null;
    pool.push({
      id: String(r.t), tcode: String(r.t), name: r.name, year: parseInt(iso.slice(0, 4), 10) || null,
      dateStart: iso || undefined,
      loadDivisions: () => Promise.resolve(feito ??= uskidsDivisions(null, r, draws, { semTodos: true })),
    });
  }
  for (const e of extra) if (!temos.has(e.id)) pool.push(e);
  return pool;
}

export const NEXT_CONFIG: CircuitConfig = {
  routeBase: "/kids2/next-t",
  title: "📅 Próximos torneios",
  grouping: "series-year",
  seriesOrder: [SERIES.proximos, SERIES.passados, ...FAMILIAS, SERIES.ffg, SERIES.intl],
  // Próximos do mais próximo para o mais longe; o resto do mais recente para trás.
  ascSeries: [SERIES.proximos],
  filters: { search: true },
  // Só os USKids têm edições (as famílias de fora já são uma entrada por ano).
  editionKey: (e) => (Number(e.id) > 0 ? tournamentFamilyKey(e.name) : null),
  matchDivision: matchEscalaoDiv,
  scoutDivisions: scoutEscaloes,
  scoutTCode: (e) => (Number(e.tcode) > 0 ? Number(e.tcode) : null),
  loadingMessage: "A carregar torneios…",
};
