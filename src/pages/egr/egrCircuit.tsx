/**
 * egrCircuit.tsx — adapta os eventos EGR ao CircuitShell partilhado.
 *
 * Os eventos EGR (europeangolfrankings.com) trazem leaderboard de TOTAIS por
 * ronda (R1-R4) + país/clube, mas NÃO scorecards buraco-a-buraco. Por isso cada
 * evento vira uma `CircuitEntry` (lazy) com UMA `CircuitDivision` cujo
 * `customResults` é o `ScorecardLeaderboard` partilhado sem scorecard — o mesmo
 * padrão do RFEG (NCResultsLeaderboard) e do GJGL. Zero tabelas próprias.
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

/* ── Tipos dos dados EGR ────────────────────────────────────────── */
export interface EgrEventListItem {
  id: string;
  name: string;
  venue: string | null;
  sourceUrl: string | null;
  ageGroup: string;
  ageNum: number | null;
  sex: "M" | "F" | null;
  country: string;
  startDate: string | null;
  endDate: string | null;
  year: number | null;
  egrPoints: number | null;
  cr: number | null;
  par: number | null;
  rounds: number;
  playerCount: number;
  countryCount: number;
  hasPt: boolean;
  hasManuel: boolean;
}
export interface EgrEventsList { generatedAt: string; total: number; events: EgrEventListItem[] }

interface EgrEventPlayer {
  id: string; pos: string | number | null; posNum: number | null;
  name: string; country: string | null; club: string | null;
  ageGroup: string | null; egrRank: number | null;
  r1: number | null; r2: number | null; r3: number | null; r4: number | null;
  total: number | null; egrPoints: number | null;
  /** HCP juntado do egr-dob-roster (índice ATUAL, não à data do torneio; ~22-40% cobertura). */
  _hcp?: number | null;
}

/* ── HCP do roster GolfBox (egr-dob-roster.json), por nome. O leaderboard EGR
 *  não traz HCP; junta-se aqui o índice actual onde existir. Carrega 1× (cache). */
interface EgrRoster { players: Record<string, { name: string; hcp?: number | null }> }
const normNm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
let _hcpMapPromise: Promise<Map<string, number>> | null = null;
function loadHcpMap(): Promise<Map<string, number>> {
  if (!_hcpMapPromise) {
    _hcpMapPromise = cachedFetchJson<EgrRoster>("/data/egr/egr-dob-roster.json")
      .then((r) => {
        const m = new Map<string, number>();
        for (const v of Object.values(r?.players || {})) if (typeof v.hcp === "number") m.set(normNm(v.name), v.hcp);
        return m;
      })
      .catch(() => new Map<string, number>());
  }
  return _hcpMapPromise;
}
interface EgrEventFull {
  id: string; name: string; venue?: string; country?: string;
  ageGroup?: string; sex?: "M" | "F" | null; cr?: number | null; par?: number | null;
  startDateRaw?: string; endDateRaw?: string; sourceUrl?: string; players: EgrEventPlayer[];
}

/* ── Leaderboard de TOTAIS (ScorecardLeaderboard partilhado, sem scorecard) ── */
type LbKey = "pos" | "name" | "country" | "club" | "hcp" | "r1" | "r2" | "r3" | "r4" | "total" | "toPar";

function EgrResultsLeaderboard({ players, par }: { players: EgrEventPlayer[]; par: number | null }) {
  const { sortKey, sortDir, toggleSort } = useSort<LbKey>("pos");
  const nR = useMemo(() => Math.max(0, ...players.map((p) => [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null).length)), [players]);
  const showClub = players.some((p) => !!p.club);
  const showHcp = players.some((p) => p._hcp != null);
  const toParOf = (t: number | null) => (t != null && par != null && nR > 0 ? t - par * nR : null);

  const sorted = useMemo(() => {
    const INF = 1e9, dir = sortDir === "asc" ? 1 : -1;
    const val = (p: EgrEventPlayer): number | string => {
      switch (sortKey) {
        case "pos": return p.posNum ?? INF;
        case "name": return norm(p.name);
        case "country": return norm(p.country || "");
        case "club": return norm(p.club || "");
        case "hcp": return p._hcp ?? INF;
        case "r1": return p.r1 ?? INF;
        case "r2": return p.r2 ?? INF;
        case "r3": return p.r3 ?? INF;
        case "r4": return p.r4 ?? INF;
        case "total": return p.total ?? INF;
        case "toPar": return toParOf(p.total) ?? INF;
      }
    };
    return [...players].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [players, sortKey, sortDir, nR, par]);

  const rows: ScorecardRow[] = sorted.map((p, i) => {
    const manuel = isManuelByName(p.name);
    const isPt = /portugal/i.test(p.country || "") || /^(pt|prt|por)$/i.test(p.country || "");
    return {
      key: `${p.id || "-"}-${i}`,
      pos: p.pos ?? i + 1,
      gross: p.total ?? 0,
      toPar: toParOf(p.total),
      isManuel: manuel,
      isPortuguese: isPt,
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
          {showClub && <td className="lb-club" title={p.club || ""}>{p.club || "—"}</td>}
          {showHcp && <td className="lb-hcp num" title={p._hcp != null ? "Índice actual (roster GolfBox)" : ""}>{p._hcp != null ? p._hcp.toFixed(1) : ""}</td>}
          {nR >= 1 && <td className="lb-hcp num">{p.r1 ?? ""}</td>}
          {nR >= 2 && <td className="lb-hcp num">{p.r2 ?? ""}</td>}
          {nR >= 3 && <td className="lb-hcp num">{p.r3 ?? ""}</td>}
          {nR >= 4 && <td className="lb-hcp num">{p.r4 ?? ""}</td>}
        </>
      ),
    };
  });

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      showScorecard={false}
      prefixHeaderCells={
        <>
          <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-club">PAÍS</SortableHdr>
          {showClub && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-club">CLUBE</SortableHdr>}
          {showHcp && <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-hcp" title="Índice actual (roster GolfBox) — não é o HCP à data do torneio">HCP</SortableHdr>}
          {nR >= 1 && <SortableHdr k="r1" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-hcp">R1</SortableHdr>}
          {nR >= 2 && <SortableHdr k="r2" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-hcp">R2</SortableHdr>}
          {nR >= 3 && <SortableHdr k="r3" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-hcp">R3</SortableHdr>}
          {nR >= 4 && <SortableHdr k="r4" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as LbKey)} className="lb-hcp">R4</SortableHdr>}
        </>
      }
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("name")}
      onSortToPar={() => toggleSort("toPar")}
      onSortGross={() => toggleSort("total")}
      activeSortKey={sortKey === "name" ? "name" : sortKey === "total" ? "gross" : sortKey}
      activeSortDir={sortDir}
    />
  );
}

/* ── Adapter: evento → divisão (lazy) ───────────────────────────── */
async function egrLoadDivisions(e: EgrEventListItem): Promise<CircuitDivision[]> {
  const [ev, hcpMap] = await Promise.all([
    cachedFetchJson<EgrEventFull>(`/data/egr/events/egr_${e.id}.json`),
    loadHcpMap(),
  ]);
  const players = (ev?.players || []).map((p) => ({ ...p, _hcp: hcpMap.get(normNm(p.name)) ?? null }));
  return [{
    key: "main",
    escalao: e.ageGroup || "—",
    tabLabel: e.ageGroup ? `${e.ageGroup}${e.sex ? (e.sex === "F" ? " ♀" : " ♂") : ""}` : undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    hasManuel: e.hasManuel,
    customResults: <EgrResultsLeaderboard players={players} par={ev?.par ?? e.par ?? null} />,
  }];
}

/* ── Constrói as CircuitEntry a partir do índice de eventos ─────── */
export function buildEgrEntries(list: EgrEventListItem[]): CircuitEntry[] {
  return list.map((e) => ({
    id: `evt:${e.id}`,
    year: e.year,
    name: e.name,
    source: "egr",
    course: e.venue || undefined,
    federation: e.country || undefined,
    dateStart: e.startDate || undefined,
    dateEnd: e.endDate || undefined,
    sourceUrl: e.sourceUrl || undefined,
    escalao: e.ageGroup || undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    intl: e.countryCount >= 4,
    playerCount: e.playerCount,
    roundsCount: e.rounds || undefined,
    divisionCount: 1,
    hasPt: e.hasPt,
    hasManuel: e.hasManuel,
    hasResults: true,
    loadDivisions: () => egrLoadDivisions(e),
  }));
}
