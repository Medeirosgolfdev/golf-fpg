/**
 * src/pages/jogadores/filtersUrl.ts
 *
 * Codec filtros ↔ query-string da JogadoresPage (Fase 2 — persistência).
 * Mesmo padrão da SimuladorPage: o URL tem PRIORIDADE no arranque e o estado
 * é espelhado para os query params com navegação `replace` (sem encher o
 * histórico). Só valores NÃO-default entram no URL — um URL limpo continua
 * limpo. Preferências de sessão (viewMode, seniores, pin) vivem também em
 * localStorage (JOG_LS_KEY) para sobreviver a navegações sem query.
 *
 * ⚠ `view` NÃO passa por aqui — é o deep-link de vista do PlayerDetail
 * (?view=by_date/…/federado/pp), gerido pelo próprio PlayerDetail.
 */
import type { JogadoresFilterState, SortKey, ViewMode } from "./filterPlayers";

export const JOG_LS_KEY = "jogadores_prefs_v1";

/** Preferências persistidas em localStorage (não são "filtros" partilháveis). */
export interface JogadoresPrefs {
  viewMode?: ViewMode;
  includeSeniors?: boolean;
  prioritizeJuniors?: boolean;
}

const SORT_KEYS: SortKey[] = ["name", "hcp", "club", "escalao", "ranking", "rounds", "aces"];

/* Param → default. Chaves curtas e legíveis para URLs partilháveis. */
const P = {
  q: "q",
  sex: "sexo",
  esc: "esc",
  region: "regiao",
  nat: "nac",
  club: "clube",
  hcpMin: "hmin",
  hcpMax: "hmax",
  active: "activos",
  source: "fonte",
  news: "novos",
  pp: "pp",
  sort: "ord",
  dir: "dir",
  mode: "modo",
} as const;

/** Escreve os filtros não-default em `params` (limpa os que voltaram ao default).
 *  Não toca em params alheios (ex: ?view= do PlayerDetail). Devolve true se mudou. */
export function writeFiltersToParams(f: JogadoresFilterState, viewMode: ViewMode, params: URLSearchParams): boolean {
  const before = params.toString();
  const setOrDel = (key: string, value: string | null) => {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  };
  setOrDel(P.q, f.q || null);
  setOrDel(P.sex, f.sexFilter !== "ALL" ? f.sexFilter : null);
  setOrDel(P.esc, f.escalaoFilter.size > 0 ? [...f.escalaoFilter].sort().join(",") : null);
  setOrDel(P.region, f.regionFilter !== "ALL" ? f.regionFilter : null);
  setOrDel(P.nat, f.natFilter !== "ALL" ? f.natFilter : null);
  setOrDel(P.club, f.clubFilter !== "ALL" ? f.clubFilter : null);
  setOrDel(P.hcpMin, f.hcpMin || null);
  setOrDel(P.hcpMax, f.hcpMax || null);
  setOrDel(P.active, f.activeOnlyFilter ? "1" : null);
  setOrDel(P.source, f.sourceFilter !== "ALL" ? f.sourceFilter : null);
  setOrDel(P.news, f.newFilter ? "1" : null);
  setOrDel(P.pp, f.onlyPP ? "1" : null);
  // Ordenação: só quando difere do default (rounds desc).
  const sortIsDefault = f.sortKey === "rounds" && f.sortDir === "desc";
  setOrDel(P.sort, sortIsDefault ? null : f.sortKey);
  setOrDel(P.dir, sortIsDefault ? null : f.sortDir);
  // Modo: default é "todos".
  setOrDel(P.mode, viewMode !== "todos" ? viewMode : null);
  return params.toString() !== before;
}

/** Lê os filtros presentes no URL. Devolve apenas as chaves presentes (patch);
 *  valores inválidos são ignorados em silêncio (URL editado à mão). */
export function readFiltersFromParams(params: URLSearchParams): { patch: Partial<JogadoresFilterState>; viewMode?: ViewMode } {
  const patch: Partial<JogadoresFilterState> = {};
  let viewMode: ViewMode | undefined;

  const q = params.get(P.q);
  if (q != null && q !== "") patch.q = q;

  const sex = params.get(P.sex);
  if (sex === "M" || sex === "F") patch.sexFilter = sex;

  const esc = params.get(P.esc);
  if (esc) patch.escalaoFilter = new Set(esc.split(",").filter(Boolean));

  const region = params.get(P.region);
  if (region) patch.regionFilter = region;

  const nat = params.get(P.nat);
  if (nat === "PT" || nat === "FOREIGN") patch.natFilter = nat;

  const club = params.get(P.club);
  if (club) patch.clubFilter = club;

  const hmin = params.get(P.hcpMin);
  if (hmin != null && hmin !== "" && isFinite(parseFloat(hmin.replace(",", ".")))) patch.hcpMin = hmin;
  const hmax = params.get(P.hcpMax);
  if (hmax != null && hmax !== "" && isFinite(parseFloat(hmax.replace(",", ".")))) patch.hcpMax = hmax;

  if (params.get(P.active) === "1") patch.activeOnlyFilter = true;

  const source = params.get(P.source);
  if (source === "WITH_ANALYSIS" || source === "CADASTRO") patch.sourceFilter = source;

  if (params.get(P.news) === "1") patch.newFilter = true;
  if (params.get(P.pp) === "1") patch.onlyPP = true;

  const sort = params.get(P.sort);
  if (sort && (SORT_KEYS as string[]).includes(sort)) {
    patch.sortKey = sort as SortKey;
    const dir = params.get(P.dir);
    patch.sortDir = dir === "asc" || dir === "desc"
      ? dir
      // Sem dir explícito: mesmo default do selector da toolbar.
      : (sort === "rounds" || sort === "aces" ? "desc" : "asc");
  }

  const mode = params.get(P.mode);
  if (mode === "ours" || mode === "todos") viewMode = mode;

  return { patch, viewMode };
}

/** Há algum filtro nosso no URL? (decide se o arranque lê URL ou localStorage) */
export function hasFilterParams(params: URLSearchParams): boolean {
  return Object.values(P).some(k => params.has(k));
}

/* ── Preferências (localStorage) ─────────────────────────────── */

export function loadPrefs(): JogadoresPrefs {
  try {
    const raw = localStorage.getItem(JOG_LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as JogadoresPrefs;
    return {
      viewMode: p.viewMode === "ours" || p.viewMode === "todos" ? p.viewMode : undefined,
      includeSeniors: typeof p.includeSeniors === "boolean" ? p.includeSeniors : undefined,
      prioritizeJuniors: typeof p.prioritizeJuniors === "boolean" ? p.prioritizeJuniors : undefined,
    };
  } catch { return {}; }
}

export function savePrefs(p: JogadoresPrefs): void {
  try { localStorage.setItem(JOG_LS_KEY, JSON.stringify(p)); } catch { /* quota/priv mode */ }
}
