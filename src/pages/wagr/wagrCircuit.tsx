/**
 * wagrCircuit.tsx — adapta os eventos WAGR ao CircuitShell partilhado.
 *
 * Os eventos WAGR (wagr.com) trazem leaderboard de TOTAIS por ronda (R1-R4) +
 * país e pontos WAGR, mas NÃO scorecards buraco-a-buraco e NÃO o par do campo.
 * Por isso cada evento vira uma `CircuitEntry` (lazy) com UMA `CircuitDivision`
 * cujo `customResults` é o `ScorecardLeaderboard` partilhado sem scorecard —
 * o mesmo padrão do EGR/RFEG/GJGL. Zero tabelas próprias.
 *
 * ⚠ Sem par → `hideTotals` (esconde as colunas ± e Tot do shell) e o Total
 *   entra como coluna própria, ao lado dos pontos WAGR.
 * ⚠ O leaderboard é PARCIAL: só os jogadores que pontuaram no WAGR. Um
 *   Nacional de Jovens com 60 inscritos pode dar 4 linhas — daí o aviso no
 *   `metaLine`, para não se ler a tabela como o campo todo.
 */
import { useMemo } from "react";
import { ScorecardLeaderboard, type ScorecardRow } from "../../ui/ScorecardLeaderboard";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { gf } from "../../utils/flagUtils";
import { norm } from "../../utils/format";
import { isManuelByName } from "../../constants/manuel";
import { cachedFetchJson } from "../../data/fetchCache";
import { KidsLink } from "../../ui/KidsLink";
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";

/* ── Tipos dos dados WAGR ───────────────────────────────────────── */
export interface WagrEventListItem {
  id: string;
  name: string;
  course: string | null;
  country: string;
  /** Junior / All Ages / Collegiate / MidAm / Senior / Pro / Other. */
  eventType: string;
  format: string | null;
  sex: "M" | "F" | "Mixed" | null;
  startDate: string | null;
  endDate: string | null;
  year: number | null;
  /** "Power" do evento — a força do campo segundo o WAGR. */
  power: number | null;
  rounds: number;
  playerCount: number;
  countryCount: number;
  hasPt: boolean;
}
export interface WagrEventsList { generatedAt: string; total: number; events: WagrEventListItem[] }

export interface WagrEventPlayer {
  id: string | null;
  pos: string | number | null;
  posNum: number | null;
  name: string;
  country: string | null;
  r1: number | null; r2: number | null; r3: number | null; r4: number | null;
  total: number | null;
  points: number | null;
}
interface WagrEventFull {
  id: string; name: string | null; country: string | null; region: string | null;
  eventType: string | null; format: string | null; sex: "M" | "F" | "Mixed" | null;
  organiser: string | null; startDate: string | null; endDate: string | null;
  week: string | null; power: number | null; spRounds: number | null; mpRounds: number | null;
  courses?: string[]; winner?: string | null; url?: string;
  players: WagrEventPlayer[];
}

export const WAGR_SITE = "https://www.wagr.com";
/** ⚠ O slug da URL do evento é decorativo — só o id final conta. */
export const wagrEventUrl = (id: string | number) => `${WAGR_SITE}/events/x-${id}`;
export const wagrPlayerUrl = (link: string) => `${WAGR_SITE}/playerprofile/${link}`;

export const isPtCountry = (c: string | null | undefined) =>
  /portugal/i.test(String(c || "")) || /^(pt|prt|por)$/i.test(String(c || "").trim());

/* ── Leaderboard de TOTAIS (ScorecardLeaderboard partilhado, sem scorecard) ── */
type LbKey = "pos" | "name" | "country" | "r1" | "r2" | "r3" | "r4" | "total" | "points";

function WagrResultsLeaderboard({ players, partial }: { players: WagrEventPlayer[]; partial: boolean }) {
  const { sortKey, sortDir, toggleSort } = useSort<LbKey>("pos");
  const nR = useMemo(
    () => Math.max(0, ...players.map((p) => [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null).length)),
    [players]
  );

  const sorted = useMemo(() => {
    const INF = 1e9, dir = sortDir === "asc" ? 1 : -1;
    const val = (p: WagrEventPlayer): number | string => {
      switch (sortKey) {
        case "pos": return p.posNum ?? INF;
        case "name": return norm(p.name);
        case "country": return norm(p.country || "");
        case "r1": return p.r1 ?? INF;
        case "r2": return p.r2 ?? INF;
        case "r3": return p.r3 ?? INF;
        case "r4": return p.r4 ?? INF;
        case "total": return p.total ?? INF;
        case "points": return p.points ?? -1;
      }
    };
    return [...players].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [players, sortKey, sortDir]);

  const rows: ScorecardRow[] = sorted.map((p, i) => ({
    key: `${p.id || "-"}-${i}`,
    pos: p.pos ?? i + 1,
    gross: p.total ?? 0,
    toPar: null,
    isManuel: isManuelByName(p.name),
    isPortuguese: isPtCountry(p.country),
    sortPos: p.posNum ?? null,
    sortName: p.name,
    nameContent: (
      <span className="tourn-pname" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {p.name || "—"}
        {p.name && <KidsLink nome={p.name} />}
      </span>
    ),
    prefixCells: (
      <>
        <td className="lb-club" title={p.country || ""} style={{ whiteSpace: "nowrap" }}>{gf(p.country || "")} {p.country || "—"}</td>
        {nR >= 1 && <td className="lb-hcp num">{p.r1 ?? ""}</td>}
        {nR >= 2 && <td className="lb-hcp num">{p.r2 ?? ""}</td>}
        {nR >= 3 && <td className="lb-hcp num">{p.r3 ?? ""}</td>}
        {nR >= 4 && <td className="lb-hcp num">{p.r4 ?? ""}</td>}
        <td className="lb-hcp num" style={{ fontWeight: 600 }}>{p.total ?? ""}</td>
        <td className="lb-hcp num" style={{ color: "var(--text-muted)" }}>{p.points != null ? p.points.toFixed(2) : ""}</td>
      </>
    ),
  }));

  const hdr = (k: LbKey, label: string, title?: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={(x) => toggleSort(x as LbKey)} className="lb-hcp" title={title}>{label}</SortableHdr>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      showScorecard={false}
      hideTotals
      metaLine={
        partial ? (
          <span title="O WAGR só publica os jogadores que pontuaram no ranking — não é o campo todo.">
            ⚠ Só os classificados que pontuaram no WAGR ({players.length}) — não é o campo completo.
          </span>
        ) : undefined
      }
      prefixHeaderCells={
        <>
          <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={(x) => toggleSort(x as LbKey)} className="lb-club">PAÍS</SortableHdr>
          {nR >= 1 && hdr("r1", "R1")}
          {nR >= 2 && hdr("r2", "R2")}
          {nR >= 3 && hdr("r3", "R3")}
          {nR >= 4 && hdr("r4", "R4")}
          {hdr("total", "TOT", "Total (o WAGR não publica o par do campo — daí não haver ±Par)")}
          {hdr("points", "PTS", "Pontos WAGR ganhos no evento")}
        </>
      }
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("name")}
      activeSortKey={sortKey === "name" ? "name" : sortKey}
      activeSortDir={sortDir}
    />
  );
}

/* ── Adapter: evento → divisão (lazy) ───────────────────────────── */
async function wagrLoadDivisions(e: WagrEventListItem): Promise<CircuitDivision[]> {
  const ev = await cachedFetchJson<WagrEventFull>(`/data/wagr/events/wagr_${e.id}.json`);
  const players = ev?.players || [];
  return [{
    key: "main",
    escalao: e.eventType || "—",
    tabLabel: e.eventType ? `${e.eventType}${e.sex === "F" ? " ♀" : e.sex === "M" ? " ♂" : ""}` : undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    customResults: <WagrResultsLeaderboard players={players} partial />,
  }];
}

/* ── Constrói as CircuitEntry a partir do índice de eventos ─────── */
export function buildWagrEntries(list: WagrEventListItem[]): CircuitEntry[] {
  return list.map((e) => ({
    id: `evt:${e.id}`,
    year: e.year,
    name: e.name,
    source: "wagr",
    course: e.course || undefined,
    federation: e.country || undefined,
    dateStart: e.startDate || undefined,
    dateEnd: e.endDate || undefined,
    sourceUrl: wagrEventUrl(e.id),
    escalao: e.eventType || undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    intl: e.countryCount >= 4,
    playerCount: e.playerCount,
    roundsCount: e.rounds || undefined,
    divisionCount: 1,
    hasPt: e.hasPt,
    hasResults: true,
    loadDivisions: () => wagrLoadDivisions(e),
  }));
}
