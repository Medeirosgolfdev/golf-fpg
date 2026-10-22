/**
 * src/data/drive/driveUrl.ts — o URL da /drive é a ÚNICA fonte de verdade
 * (decisão A, 22/10/2026).
 *
 *  - O torneio (e o escalão) aberto vive no caminho `/drive/torneio/{ccode}-{tcode}`,
 *    como na /FPG: `resolveDriveTkey` dá a entrada/divisão do CircuitShell. Não há
 *    estado do torneio na página; clicar na sidebar navega.
 *  - Os filtros vivem na query (`nav`, `series`, `manuel`, `region`, `esc`, `year`,
 *    `s12s`, `s12v`, `s12x`, `s12e`; a aba do torneio em `tab`). Nenhum se
 *    perde ao montar: só uma acção do utilizador os muda.
 *  - O `?t={id da entrada}` antigo redirecciona para o caminho (`legacyDriveT`).
 *  - Torneios com várias voltas ficam com o tcode da FPG (sem `…_R1`).
 * Sem React.
 */
import type { Tournament } from "../fpgTypes";
import type { CircuitDivision, CircuitEntry } from "../../ui/circuit/types";
import { parseTournKey } from "../../utils/format";
import { ESCALOES_DRIVE } from "../../constants/escaloes";
import { isManuelByName } from "../../constants/manuel";
import type { DriveSeries } from "./driveSource";

export type DriveNav = "torneios" | "ranking-sub12";
export type DriveSeriesFilter = DriveSeries | "all";
export type Sub12View = "grid" | "ranking" | "evolucao";

export interface DriveUrlState {
  nav: DriveNav;
  series: DriveSeriesFilter;
  manuel: boolean;
  region: string | null;
  esc: string[];
  year: string | null;
  s12s: DriveSeries;
  s12v: Sub12View;
  s12x: string;
  s12e: string;
}

export const DRIVE_URL_DEFAULTS: DriveUrlState = {
  nav: "torneios", series: "tour", manuel: false, region: null, esc: [], year: null,
  s12s: "tour", s12v: "grid", s12x: "all", s12e: "Sub 12",
};

const SERIES = ["tour", "challenge", "aquapor"] as const;
const isSeries = (v: string | null): v is DriveSeries => !!v && (SERIES as readonly string[]).includes(v);

/** Estado da página lido da query. `s12v=list` (nome antigo) abre o Ranking. */
export function parseDriveQuery(sp: URLSearchParams): DriveUrlState {
  const g = (k: string) => sp.get(k);
  const nav = g("nav") === "ranking-sub12" ? "ranking-sub12" : "torneios";
  // O Ranking é uma vista dos torneios (decisão D): a série e a zona são as da
  // barra; os links antigos `s12s`/`s12r` (sem `series`/`region`) passam a elas.
  const series = g("series") ?? (nav === "ranking-sub12" && isSeries(g("s12s")) ? g("s12s") : null);
  const s12v = g("s12v");
  const s12e = g("s12e");
  return {
    nav,
    series: series === "all" || isSeries(series) ? series : "tour",
    manuel: g("manuel") === "1",
    region: g("region") || (nav === "ranking-sub12" && g("s12r") && g("s12r") !== "all" ? g("s12r") : null),
    esc: (g("esc") || "").split(",").map(s => s.trim()).filter(Boolean),
    year: /^\d{4}$/.test(g("year") || "") ? g("year") : null,
    s12s: isSeries(g("s12s")) ? g("s12s") as DriveSeries : "tour",
    s12v: s12v === "ranking" || s12v === "list" ? "ranking" : s12v === "evolucao" ? "evolucao" : "grid",
    s12x: g("s12x") === "M" || g("s12x") === "F" ? g("s12x")! : "all",
    s12e: s12e && (s12e === "all" || ESCALOES_DRIVE.includes(s12e)) ? s12e : "Sub 12",
  };
}

/** Query com os valores que não são os por omissão (os do Ranking Sub-12 só na
 *  vista dos rankings). Mantém a aba do torneio (`tab`). */
export function driveQueryString(st: DriveUrlState, tab?: string | null): string {
  const sp = new URLSearchParams();
  const d = DRIVE_URL_DEFAULTS;
  if (st.nav !== d.nav) sp.set("nav", st.nav);
  if (st.series !== d.series) sp.set("series", st.series);
  if (st.manuel) sp.set("manuel", "1");
  if (st.region) sp.set("region", st.region);
  if (st.esc.length) sp.set("esc", st.esc.join(","));
  if (st.year) sp.set("year", st.year);
  if (st.nav === "ranking-sub12") {
    if (st.series === "all" && st.s12s !== d.s12s) sp.set("s12s", st.s12s);
    if (st.s12v !== d.s12v) sp.set("s12v", st.s12v);
    if (st.s12x !== d.s12x) sp.set("s12x", st.s12x);
    if (st.s12e !== d.s12e) sp.set("s12e", st.s12e);
  }
  if (tab && st.nav === "torneios") sp.set("tab", tab);
  const s = sp.toString();
  return s ? "?" + s : "";
}

const tcodeParts = (tc: unknown) => String(tc ?? "").replace(/_R\d+$|_Total$/, "").split("+");

/** O torneio (ccode/tcode, ou o provisório que lhe foi fundido) é o do tkey? */
export function driveTournamentMatches(t: Pick<Tournament, "ccode" | "tcode"> & { _mergedFrom?: string } | undefined | null, tkey: string | null | undefined): boolean {
  const p = parseTournKey(tkey);
  if (!p || !t) return false;
  // `…_R1`/`…_Total` (links antigos) abrem o torneio.
  const tc = tcodeParts(p.tcode)[0];
  if (String(t.ccode) === p.ccode && tcodeParts(t.tcode).includes(tc)) return true;
  return !!t._mergedFrom && t._mergedFrom === `${p.ccode}-${p.tcode}`;
}

/** Deep-link → (entrada, escalão) do CircuitShell. */
export function resolveDriveTkey(entries: CircuitEntry[], tkey: string | null | undefined): { id?: string; divKey?: string } {
  if (!parseTournKey(tkey)) return {};
  for (const e of entries) {
    const d = (e.divisions ?? []).find(dv => driveTournamentMatches(dv.results, tkey));
    if (d) return { id: e.id, divKey: d.key };
  }
  return {};
}

/** O `ccode-tcode` canónico de uma divisão (o 1.º tcode, sem sufixo de volta). */
export function driveDivTkey(d: CircuitDivision | undefined): string | null {
  const t = d?.results;
  if (!t?.ccode || !t.tcode) return null;
  return `${t.ccode}-${tcodeParts(t.tcode)[0]}`;
}

/** Divisão que representa a entrada no URL: a do Manuel, senão a primeira
 *  (a mesma que o CircuitShell abre por omissão). */
export function driveRepDivision(e: CircuitEntry): CircuitDivision | undefined {
  const ds = e.divisions ?? [];
  return ds.find(d => d.hasManuel) ?? ds[0];
}

/** `?t={id}` antigo → o tkey da entrada com esse id (procurado em TODAS as
 *  entradas, sem filtros). */
export function legacyDriveT(allEntries: CircuitEntry[], t: string | null | undefined): string | null {
  if (!t) return null;
  const e = allEntries.find(x => x.id === t);
  return e ? driveDivTkey(driveRepDivision(e)) : null;
}

/** Filtros que tornam visível o torneio de um deep-link: a série e o ano dele,
 *  sem zona/escalão/★Manuel que o escondam. `null` = já está visível ou não existe. */
export function driveFiltersForTkey(
  src: Tournament[], tkey: string | null | undefined, st: DriveUrlState, visible: boolean,
): Partial<DriveUrlState> | null {
  if (visible) return null;
  const t = src.find(x => driveTournamentMatches(x as Tournament & { _mergedFrom?: string }, tkey));
  if (!t) return null;
  const patch: Partial<DriveUrlState> = {};
  const series = (t.series || "tour") as DriveSeries;
  if (st.series !== "all" && st.series !== series) patch.series = series;
  const y = (t.date || "").slice(0, 4);
  if (y && st.year !== y) patch.year = y;
  if (st.region && t.region !== st.region) patch.region = null;
  if (st.esc.length) patch.esc = [];
  if (st.manuel && !(t.players || []).some(pl => isManuelByName(pl.name))) patch.manuel = false;
  return Object.keys(patch).length ? patch : null;
}
