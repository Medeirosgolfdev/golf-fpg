/**
 * MajorPage.tsx — 🏆 MAJOR (Doral + BJGT/EOWAGR) no CircuitShell.
 *
 * Funde as antigas páginas Doral e BJGT numa única página-mãe assente no
 * CircuitShell, agrupada por série (Doral / BJGT / EOWAGR) e ano. Cada série/ano
 * é um "torneio" com divisões por categoria (escalão). O detalhe reutiliza os
 * módulos ricos de cada origem (HoleDiff/ManuelDay/Field Stats + evolução
 * ano-a-ano) via os helpers exportados `bjgtMajorDivision` / `doralMajorDivision`.
 *
 * As rotas antigas /doral e /bjgt redireccionam para /major (ver App.tsx).
 */
import { useEffect, useMemo, useState } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision } from "../ui/circuit/types";
import { URLS as BJGT_URLS, loadT as bjgtLoadT, bjgtEvoFor, bjgtMajorDivision, type TDef } from "./BJGTPage";
import { DATA_FILES as DORAL_FILES, normalizeFile, doralEvoFor, doralMajorDivision, type Entry } from "./DORALPage";

/** Constrói os entries do CircuitShell a partir dos dados BJGT + Doral. */
function buildMajorEntries(bjgtDefs: TDef[], doralEntries: Entry[]): CircuitEntry[] {
  const out: CircuitEntry[] = [];

  // BJGT + EOWAGR: agrupar por (série, ano) → entry com divisões por categoria.
  const groups = new Map<string, TDef[]>();
  for (const d of bjgtDefs) {
    const k = `${d.series}|${d.year}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  for (const [k, defs] of groups) {
    const [series, yearStr] = k.split("|");
    const year = Number(yearStr);
    const seriesLabel = series === "eowagr" ? "EU" : "BJGT";
    const divisions: CircuitDivision[] = defs.map((d) => {
      const { evo, evoYear } = bjgtEvoFor(d, bjgtDefs);
      return bjgtMajorDivision(d, evo, evoYear);
    });
    out.push({
      id: `${series}:${year}`,
      year,
      name: `${seriesLabel} ${year}`,
      series: seriesLabel,
      source: series,
      playerCount: defs.reduce((s, d) => s + d.data.players.filter((p) => p.total != null).length, 0),
      divisionCount: divisions.length,
      hasManuel: defs.some((d) => d.data.players.some((p) => isM(p.name))),
      divisions,
    });
  }

  // Doral: agrupar por ano → entry com divisões por categoria.
  const doralByYear = new Map<number, Entry[]>();
  for (const e of doralEntries) {
    if (!doralByYear.has(e.year)) doralByYear.set(e.year, []);
    doralByYear.get(e.year)!.push(e);
  }
  for (const [year, ents] of doralByYear) {
    const divisions: CircuitDivision[] = ents.map((e) => doralMajorDivision(e, doralEvoFor(e, doralEntries)));
    out.push({
      id: `doral:${year}`,
      year,
      name: `Doral ${year}`,
      series: "Doral",
      source: "doral",
      course: ents[0]?.course,
      playerCount: ents.reduce((s, e) => s + e.players.filter((p) => p.total != null).length, 0),
      divisionCount: divisions.length,
      hasManuel: ents.some((e) => e.players.some((p) => isM(p.name))),
      divisions,
    });
  }

  return out;
}

const MAJOR_CONFIG: CircuitConfig = {
  routeBase: "/major",
  title: "🎖️ MAJOR",
  color: "#1a7f5a",
  textColor: "#fff",
  grouping: "year",
  sourceColors: { doral: "#c8102e", bjgt: "#1a7f5a", eowagr: "#0a4d8c" },
  sourceLabels: { doral: "DORAL", bjgt: "BJGT", eowagr: "EU" },
  filters: { search: true, year: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos", "regressados", "subiram"] },
  veteranoThreshold: 3,
  loadingMessage: "A carregar MAJOR…",
};

function MajorContent() {
  const [bjgtDefs, setBjgtDefs] = useState<TDef[]>([]);
  const [doralEntries, setDoralEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [defs, dorals] = await Promise.all([
        Promise.all(BJGT_URLS.map(async (m): Promise<TDef | null> => {
          try {
            const raw = await cachedFetchJson<unknown>(m.url);
            if (raw == null) return null;
            return {
              id: m.id, label: m.label, shortLabel: m.shortLabel,
              data: bjgtLoadT(raw), manuelName: m.manuelName, year: m.year,
              category: m.category, roundDates: m.roundDates, series: m.series,
            } as TDef;
          } catch { return null; }
        })),
        Promise.all(DORAL_FILES.map(async ({ url, sourceUrl }): Promise<Entry[]> => {
          try {
            const raw = await cachedFetchJson<Parameters<typeof normalizeFile>[0]>(url);
            return raw ? normalizeFile(raw, sourceUrl) : [];
          } catch { return []; }
        })),
      ]);
      if (!alive) return;
      setBjgtDefs(defs.filter((d): d is TDef => d != null));
      setDoralEntries(dorals.flat());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const entries = useMemo(() => buildMajorEntries(bjgtDefs, doralEntries), [bjgtDefs, doralEntries]);

  if (loading) return <LoadingState message="A carregar MAJOR…" />;
  return <CircuitShell entries={entries} config={MAJOR_CONFIG} />;
}

export default function MajorPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <MajorContent />;
}
