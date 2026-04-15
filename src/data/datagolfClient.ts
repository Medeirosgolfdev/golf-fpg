/**
 * datagolfClient.ts
 * ────────────────────────────────────────────────────────────
 * Cliente para o proxy `/api/datagolf` (ver `api/datagolf.js`).
 * O proxy encaminha para `golf-portugal.pt/api/*` (API pública
 * que internamente obtém os dados da FPG/datagolf).
 *
 * Endpoints:
 *   - getPlayerHistory(fed)        → lista de rondas WHS
 *   - getScorecard(scoreId)        → hole-by-hole completo
 *   - getProfile(fed)              → perfil FPG (32 campos)
 *   - getHandicaps(fed)            → histórico de HCP
 */

/* ── Tipos ──────────────────────────────────────────────────── */

/** Uma ronda na lista WHS do jogador (sem hole-by-hole).
 *  Formato devolvido por `/api/clubs/{c}/players/{fed}/results`. */
export interface WhsRound {
  id: number;                        // score_id — usar em getScorecard()
  federation_code: string;
  tournament_id: number;
  tournament_description: string;
  course_description: string;
  score_date: string;                // "/Date(ms)/"
  score_dateStr: string;             // "YYYY-MM-DD HH:mm:ss"
  hole_count: number;
  par_total: number;
  exact_hcp: number;
  calculated_exact_hcp: number;
  play_hcp: number;
  calculated_play_hcp: number;
  calculated_stablnet_total: number;
  gross_total: number | null;
  cba_value: number;
  competition_type_id: number;
  scoring_type_id: number;
  score_origin_id: number;
  score_origin: string;
  score_status_id: number;
  status_name: string;
  score_differential: number;
  hcp_qualifying_round: number;
  hcp_qualifying_name: string;
  calc_hcp_index: number;
  [k: string]: unknown;
}

/** Scorecard detalhado de UMA ronda, com hole-by-hole. */
export interface Scorecard {
  id: number;
  score_id: string;
  federated_code: string;
  player_name: string;
  player_club_code: string;
  player_acronym: string;
  tournament_code: string;
  tournament_description: string;
  round_number: number;
  course_description: string;
  par_total: number;
  course_rating: number;
  slope: number;
  tee_color_id: number;
  tee_name: string;
  exact_hcp: number;
  play_hcp: number;
  cba: number;
  score_status_id: number;
  score_status: string;
  starting_hole_index: number;
  nholes: number;
  hole_count: number;
  played_at: string;                 // "/Date(ms)/"
  scoring_type: string;
  scoring_type_id: number;
  competition_type: string;
  competition_type_id: number;
  score_origin: string;
  score_origin_id: number;
  gross_total: number;
  penalty: number;
  // par_1..par_18, stroke_index_1..18, meters_1..18, gross_1..18, net_1..18 etc.
  [k: string]: unknown;
}

/* ── Helper: extrair arrays hole-by-hole dos campos par_1..18 ── */
export function extractHoleArray(sc: Record<string, unknown>, prefix: "par" | "gross" | "stroke_index" | "meters" | "net"): number[] {
  const holes = Number(sc.nholes || sc.hole_count || 18);
  const start = Number(sc.starting_hole_index || 1);
  const arr: number[] = [];
  // Se starting_hole_index = 10 (back-9), pega par_10..par_18; senão par_1..par_N
  const from = start === 10 ? 10 : 1;
  const to = from + holes - 1;
  for (let i = from; i <= to; i++) {
    const v = sc[`${prefix}_${i}`];
    arr.push(typeof v === "number" ? v : Number(v) || 0);
  }
  return arr;
}

/** Converte .NET "/Date(ms)/" para ISO YYYY-MM-DD. */
export function parseNetDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/\/Date\((-?\d+)\)\//);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ── Cache em memória (session-scoped) ──────────────────────── */
const _cache = new Map<string, unknown>();

/* ── Cache em ficheiro: public/data/fpg-whs.json ───────────────
   Gerado pelo console script `console-fpg-whs-scrape.js` que o user
   corre no browser quando quer refresh. Se existir, é preferido à API
   live para os jogadores que contém (instantâneo, sem round-trip).
   Formato: { generated, players: { [fed]: { rounds, scorecards } } } */
let _fpgWhsFile: null | "loaded" | "failed" | Promise<unknown> = null;
let _fpgWhsData: Record<string, { rounds: unknown[]; scorecards?: Record<string, unknown> }> = {};

async function tryLoadWhsFile(): Promise<void> {
  if (_fpgWhsFile === "loaded" || _fpgWhsFile === "failed") return;
  if (_fpgWhsFile) { await _fpgWhsFile; return; }
  _fpgWhsFile = (async () => {
    try {
      const r = await fetch("/data/fpg-whs.json");
      if (!r.ok) throw new Error("sem cache batch");
      const json = await r.json();
      _fpgWhsData = json.players || {};
      _fpgWhsFile = "loaded";
    } catch {
      _fpgWhsFile = "failed";
    }
  })();
  await _fpgWhsFile;
}

async function call<T>(endpoint: string, cacheKey: string): Promise<T> {
  if (_cache.has(cacheKey)) return _cache.get(cacheKey) as T;
  const res = await fetch(endpoint);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Erro desconhecido");
  const data = json.data?.Records ?? json.data;
  _cache.set(cacheKey, data);
  return data as T;
}

/** Limpa a cache (útil após criar nova ronda, p.ex.). */
export function clearDatagolfCache(): void {
  _cache.clear();
}

/* ── API ────────────────────────────────────────────────────── */

/** Lista todas as rondas WHS registadas de um jogador.
 *  Se houver cache batch em `/data/fpg-whs.json` (gerado pelo script
 *  de consola `console-fpg-whs-scrape.js`), usa-a — é instantânea.
 *  Caso contrário faz chamada live ao proxy `/api/datagolf`. */
export async function getPlayerHistory(fed: string | number): Promise<WhsRound[]> {
  await tryLoadWhsFile();
  const fedKey = String(fed);
  if (_fpgWhsData[fedKey]?.rounds) {
    return _fpgWhsData[fedKey].rounds as WhsRound[];
  }
  return call<WhsRound[]>(
    `/api/datagolf?action=whs&fed=${encodeURIComponent(fedKey)}`,
    `whs:${fed}`,
  );
}

/** Scorecard detalhado (hole-by-hole) de uma ronda.
 *  Os parâmetros `scoringType`/`competitionType` são mantidos por
 *  compatibilidade mas ignorados — a API golf-portugal.pt só precisa
 *  do score_id. */
export async function getScorecard(
  scoreId: string | number,
  _scoringType: string | number = 1,
  _competitionType: string | number = 10,
): Promise<Scorecard[]> {
  return call<Scorecard[]>(
    `/api/datagolf?action=scorecard&score_id=${encodeURIComponent(String(scoreId))}`,
    `sc:${scoreId}`,
  );
}

/** Perfil FPG do jogador (32 campos de cadastro). */
export async function getProfile(fed: string | number): Promise<Record<string, unknown>[]> {
  return call<Record<string, unknown>[]>(
    `/api/datagolf?action=profile&fed=${encodeURIComponent(String(fed))}`,
    `profile:${fed}`,
  );
}

/** Histórico completo de movimentos de handicap. */
export async function getHandicaps(fed: string | number): Promise<Record<string, unknown>[]> {
  return call<Record<string, unknown>[]>(
    `/api/datagolf?action=handicaps&fed=${encodeURIComponent(String(fed))}`,
    `hcps:${fed}`,
  );
}
