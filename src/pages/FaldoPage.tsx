/**
 * FaldoPage.tsx — Faldo Series (GolfGenius) sobre o CircuitShell partilhado.
 *
 * A época atual do Faldo corre em GolfGenius (não BlueGolf). O `scrape-faldo.js`
 * gera um JobFile por etapa (`public/data/faldo/{tour}_{id}.json`) + o índice
 * `public/data/faldo-catalog.json`. Aqui carregamos o catálogo, lemos cada
 * JobFile e convertemo-lo em CircuitEntry com `jobDivisionToTournament`
 * (o mesmo conversor GolfGenius do /major — FSGA/UA/México).
 *
 * Os 3 NÍVEIS (Futures / Junior Tour / Elite) são o agrupamento da sidebar
 * (`series-year` → `series` = nível); a região (Europa/Ásia/MEA) é filtro.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitSex } from "../ui/circuit/types";
import { jobDivisionToTournament, jobScorecardOptions, type JobFile, type JobPlayer } from "./MajorPage";
import { gf, normPaisDisplay } from "../utils/flagUtils";
import { fmtToPar } from "../utils/format";
import { tpColorDark } from "../utils/scoreDisplay";

/* ── Tipos do catálogo (escrito por scripts/scrape-faldo.js) ── */
interface FaldoCatalogEvent {
  id: string;
  tour: string;
  tier: string;
  tierLabel: string;
  region: string;
  file: string;
  name: string;
  course: string | null;
  year: number;
  divisionCount: number;
  playerCount: number;
  hasScorecards: boolean;
  hasResults: boolean;
  hasManuel: boolean;
}
interface FaldoCatalog {
  generatedAt?: string;
  events: FaldoCatalogEvent[];
}

const CATALOG_URL = "/data/faldo-catalog.json";
const REGION_LABELS: Record<string, string> = { EUR: "Europa", ASIA: "Ásia", MEA: "MEA", INT: "Internacional" };

const cleanName = (s: string) => (s || "").replace(/&amp;/g, "&").replace(/\s*\|\s*/g, " · ").trim();

/** Sexo a partir do label da divisão (Faldo raramente separa por género). */
function divSex(label: string): CircuitSex | undefined {
  if (/\bgirls?\b|female|feminin/i.test(label)) return "F";
  if (/\bboys?\b|\bmale\b|masculin/i.test(label)) return "M";
  return undefined;
}

const isPt = (c?: string) => /portugal/i.test(c || "") || /^(pt|prt)$/i.test(c || "");

/** Leaderboard só de totais — quando a etapa não expõe hole-by-hole (ex: as
 *  finais regionais Futures publicam só o total). Mostra pos/país/rondas/total. */
function FaldoTotals({ players }: { players: JobPlayer[] }) {
  const nR = Math.max(0, ...players.map((p) => (p.roundGross || []).length));
  return (
    <table className="dtable">
      <thead>
        <tr>
          <th>Pos</th>
          <th>País</th>
          <th>Nome</th>
          {Array.from({ length: nR }, (_, i) => <th key={i} className="r">R{i + 1}</th>)}
          <th className="r">Total</th>
          <th className="r">vs Par</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => {
          const manuel = isM(p.name);
          return (
            <tr key={i} style={{ background: manuel ? "var(--bg-success-subtle)" : undefined, fontWeight: manuel ? 700 : undefined }}>
              <td>{p.pos || "—"}</td>
              <td>{p.country ? `${gf(p.country)} ${normPaisDisplay(p.country)}` : "—"}</td>
              <td>{p.name}{manuel && " 🇵🇹"}</td>
              {Array.from({ length: nR }, (_, r) => <td key={r} className="r">{(p.roundGross || [])[r] ?? "—"}</td>)}
              <td className="r">{p.total ?? "—"}</td>
              <td className="r" style={{ color: p.toPar != null ? tpColorDark(p.toPar) : undefined }}>{p.toPar != null ? fmtToPar(p.toPar) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildFaldoDivisions(job: JobFile): CircuitDivision[] {
  const scOptions = jobScorecardOptions();
  return job.divisions.map((dv, i) => {
    const hasHoleByHole = dv.players.some((p) => (p.rounds || []).some((r) => (r.scores || []).length > 0));
    const div: CircuitDivision = {
      key: `d${i}`,
      escalao: dv.division || "Geral",
      tabLabel: dv.division || "Geral",
      sex: divSex(dv.division || ""),
      hasManuel: dv.players.some((p) => isM(p.name)),
    };
    if (hasHoleByHole) {
      div.results = jobDivisionToTournament(dv, dv.division || "Geral");
      div.scOptions = scOptions;
    } else {
      div.customResults = <FaldoTotals players={dv.players} />;
    }
    return div;
  });
}

function buildFaldoEntries(cat: FaldoCatalog, jobs: (JobFile | null)[]): CircuitEntry[] {
  const out: CircuitEntry[] = [];
  cat.events.forEach((ev, i) => {
    const job = jobs[i];
    if (!job || !Array.isArray(job.divisions) || !job.divisions.length) return;
    const divisions = buildFaldoDivisions(job);
    const all = job.divisions.flatMap((d) => d.players);
    out.push({
      id: `faldo:${ev.id}`,
      year: ev.year,
      name: cleanName(ev.name),
      series: ev.tierLabel,
      liga: ev.region,
      source: "faldo",
      course: ev.course || undefined,
      sourceUrl: `https://www.golfgenius.com/pages/${ev.id}`,
      playerCount: ev.playerCount,
      divisionCount: divisions.length,
      hasManuel: all.some((p) => isM(p.name)),
      hasPt: all.some((p) => isPt(p.country) || isM(p.name)),
      hasResults: ev.hasResults,
      divisions,
    });
  });
  return out;
}

const FALDO_CONFIG: CircuitConfig = {
  routeBase: "/faldo",
  title: "🏆 Faldo Series",
  color: "var(--color-navy)",
  textColor: "#fff",
  grouping: "series-year",
  seriesOrder: ["Futures", "Junior Tour", "Elite Tour"],
  sourceColors: { faldo: "var(--color-navy)" },
  sourceLabels: { faldo: "Faldo Series" },
  ligaLabels: REGION_LABELS,
  filters: {
    search: true,
    year: true,
    liga: true,
    toggles: ["manuel", "pt", "top10", "veteranos", "results"],
  },
  veteranoThreshold: 3,
  loadingMessage: "A carregar Faldo Series…",
};

function FaldoShellContent() {
  const [catalog, setCatalog] = useState<FaldoCatalog | null>(null);
  const [jobs, setJobs] = useState<(JobFile | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    cachedFetchJson<FaldoCatalog>(CATALOG_URL)
      .then(async (cat) => {
        if (!alive || !cat) { if (alive) setLoading(false); return; }
        setCatalog(cat);
        const files = await Promise.all(
          cat.events.map((e) => cachedFetchJson<JobFile>(`/data/${e.file}`).catch(() => null)),
        );
        if (!alive) return;
        setJobs(files);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const entries = useMemo(() => (catalog ? buildFaldoEntries(catalog, jobs) : []), [catalog, jobs]);

  // Torneio seleccionado via URL: /faldo/t/{entryId} — deep-linkável (mesmo
  // padrão da /ffg e /rfeg; o shell reflecte o default no URL ao aterrar).
  const navigate = useNavigate();
  const params = useParams<{ source?: string; key?: string }>();
  const selectedTourn = params.source === "t" && params.key ? params.key : undefined;

  if (loading) return <LoadingState />;
  return (
    <CircuitShell
      entries={entries}
      config={FALDO_CONFIG}
      selectedId={selectedTourn}
      onSelectEntry={(e) => navigate(`/faldo/t/${encodeURIComponent(e.id)}`)}
    />
  );
}

export default function FaldoPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <FaldoShellContent />;
}
