/**
 * ContestLeaderboard — classificação de um contest WJGC (análise BJGT).
 * O leaderboard é o detalhe de torneio único (TournamentDetail, pelo adaptador
 * IntlTournView): Resumo, voltas, Scorecards e análise como nas outras páginas.
 * Aqui só fica o que é deste ecrã — a evolução 2025 → 2026 (cartão do Manuel e
 * tabela), no fim do Resumo.
 */
import { useMemo, type CSSProperties } from "react";
import { flag } from "../utils/flagUtils";
import { isManuelByName } from "../constants/manuel";
import EvoBadge from "./EvoBadge";
import SortableHdr from "./SortableHdr";
import { useSort } from "../hooks/useSort";
import { SC } from "../utils/scoreDisplay";
import { IntlTournView } from "./IntlTournView";
import type { Tournament as FPGTournament } from "../pages/FPGPage";
import { intlScorecardOptions } from "../data/intlScorecard";
import { buildFPGTournament, type IntlPlayerIn } from "../data/intlTournament";

interface ContestData {
  label: string;
  parArr: number[];
  par: number;
  nRounds: number;
  players: ContestPlayer[];
}

export interface ContestPlayer {
  n: string; // name
  co: string; // country (ISO-2 / EN / PT name)
  fl?: string; // flag emoji (legacy; render derives from `co` via flag())
  isM?: boolean; // is Manuel
  p: number | string; // position
  t: number; // total gross
  tp: number; // to par
  rd: RoundData[]; // rounds
}

interface RoundData {
  g: number; // gross
  s?: number[]; // scores (18 holes)
}

interface EvoEntry {
  n: string; // name
  y25: number; // 2025 score
  y26: number; // 2026 score
  delta: number; // difference
  from: string; // from course name
  to: string; // to course name
  pill?: string; // badge pill
}

interface ContestLeaderboardProps {
  contest: ContestData;
  evo?: EvoEntry[];
}

/** ContestData → Tournament (o formato que o TournamentDetail lê). */
function contestToTournament(c: ContestData): FPGTournament {
  return buildFPGTournament({ name: c.label, tcode: c.label, rounds: c.nRounds }, { par: c.parArr },
    c.players.map((p): IntlPlayerIn => ({
      id: p.n, name: p.n, pos: p.p, club: p.co ? `${flag(p.co)} ${p.co}` : "", country: p.co,
      total: p.t, toPar: p.tp, rounds: p.rd.map((r) => ({ gross: r.g, scores: r.s })), wd: false,
    })));
}

const SC_OPTIONS = intlScorecardOptions({ hideSD: true });

export default function ContestLeaderboard({ contest, evo }: ContestLeaderboardProps) {
  const tournament = useMemo(() => contestToTournament(contest), [contest]);
  const hasManuel = contest.players.some((p) => p.isM && p.rd.length > 0);
  const extra = evo && evo.length > 0
    ? <>{hasManuel && <ManuelEvo evo={evo} />}<EvoTable evo={evo} /></>
    : undefined;
  return <IntlTournView tournament={tournament} scOptions={SC_OPTIONS} accExtra={extra} />;
}

/* ── Evolução 2025 → 2026 ── */

const deltaColor = (d: number, worse: string) => (d < 0 ? "var(--good-dark)" : d > 0 ? worse : "var(--text-3)");

function ManuelEvo({ evo }: { evo: EvoEntry[] }) {
  const m = evo.find((e) => e.n.includes("Manuel"));
  if (!m) return null;
  return (
    <div className="card u-bg-bg-success-subtle u-bd-1px-solid-good">
      <div className="h-md fs-14">🇵🇹 Manuel — Evolução WJGC</div>
      <div className="d-flex u-gap-16px u-fwr-wrap u-ai-center">
        <div className="ta-c u-fl-1-1-100px">
          <div className="muted fs-10">2025</div>
          <div className="fw-900 fs-24">{m.y25}</div>
          <div className="muted fs-10">{m.from}</div>
        </div>
        <div className="fs-24 u-c-good-dark">→</div>
        <div className="ta-c u-fl-1-1-100px">
          <div className="muted fs-10">2026</div>
          <div className="fw-900 fs-24" style={{ color: m.delta < 0 ? "var(--good-dark)" : "var(--text-3)" }}>{m.y26}</div>
          <div className="muted fs-10">{m.to}</div>
        </div>
        <div className="ta-c u-fl-1-1-80px">
          <div className="muted fs-10">Δ</div>
          <div className="fw-900 fs-24" style={{ color: m.delta < 0 ? "var(--good-dark)" : SC.danger }}>
            {m.delta > 0 ? "+" : ""}{m.delta}
          </div>
          <div className="muted fs-10">pancadas</div>
        </div>
      </div>
    </div>
  );
}

type EvoSortKey = "n" | "y25" | "y26" | "delta" | "pill";

function EvoTable({ evo }: { evo: EvoEntry[] }) {
  const { sortKey, sortDir, toggleSort } = useSort<EvoSortKey>("delta");
  const rows = [...evo].sort((a, b) => {
    const c = sortKey === "n" || sortKey === "pill"
      ? (a[sortKey] || "").localeCompare(b[sortKey] || "", "pt")
      : a[sortKey] - b[sortKey];
    return sortDir === "asc" ? c : -c;
  });
  const hdr = (k: EvoSortKey, label: string, className: string, style?: CSSProperties) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={className} style={style}>{label}</SortableHdr>;
  return (
    <div className="card">
      <div className="h-md fs-14">📈 Evolução 2025 → 2026</div>
      <div className="muted fs-10 mb-8">{evo.length} jogadores em ambas as edições</div>
      <div className="tourn-scroll">
        <table className="dtable-lg">
          <thead>
            <tr>
              {hdr("n", "Jogador", "ta-left", { minWidth: 120 })}
              {hdr("y25", "2025", "r col-w55")}
              {hdr("y26", "2026", "r col-w55")}
              {hdr("delta", "Δ", "r col-w45")}
              {hdr("pill", "Percurso", "col-w70")}
            </tr>
          </thead>
          <tbody>
            {rows.map((e, idx) => {
              const isM = isManuelByName(e.n);
              return (
                <tr key={idx} style={{ background: isM ? "var(--bg-success-subtle)" : undefined }}>
                  <td className={isM ? "fw-800" : "fw-600"} style={{ whiteSpace: "nowrap" }}>{e.n}</td>
                  <td className="r mono">{e.y25}</td>
                  <td className="r mono">{e.y26}</td>
                  <td className="r fw-700" style={{ color: deltaColor(e.delta, SC.danger) }}>{e.delta > 0 ? "+" : ""}{e.delta}</td>
                  <td><EvoBadge pill={e.pill as "UP" | "EQ" | "NEW"} from={e.from} to={e.to} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
