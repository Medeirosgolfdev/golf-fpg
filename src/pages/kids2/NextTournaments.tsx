/**
 * kids2/NextTournaments.tsx
 *
 * /kids2/next-t — Próximos torneios, no CircuitShell (20/10/2026): torneio na
 * barra lateral, escalão nas abas, e em cada escalão as abas da /uskids
 * (Inscrições, Draw, voltas, Edições anteriores, Scout) mais as de análise
 * (Por torneio, Scores, Scorecards, O Campo, Previsão). Adaptador em
 * ./nextCircuit.tsx.
 *
 * URL: ?t=<torneio>&esc=<escalão>&tab=<aba>. Os links antigos continuam:
 * ?t=usk123, ?tab=players&vista=lista|grelha (→ scout | grelha), ?tab=scorecards
 * (→ sc-edicoes, os das edições anteriores), ?tab=scout,
 * ?v=scout; sem ?t= abre o próximo torneio em que o Manuel está inscrito.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import EmptyState from "../../ui/EmptyState";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";
import CircuitShell from "../../ui/circuit/CircuitShell";
import { CircuitToolbarSlotCtx } from "../../ui/circuit/toolbarSlot";
import type { CircuitDivision, CircuitEntry } from "../../ui/circuit/types";
import { buildExtraRivals, type AutoRivalPlayer } from "../../data/KIDSdataLoader";
import { cachedFetchJson } from "../../data/fetchCache";
import { loadUskidsResults } from "../../data/uskidsResultsLoader";
import { escalaoManuelParaData } from "../../constants/manuel";
import type { TorneioResult, UskidsDrawsData } from "../../ui/uskidsTypes";
import { useFieldRivaisData } from "../kids/FieldRivaisDashboard";
import { edicaoEntry, type EdicoesIndex } from "../uskids/uskidsCircuit";
import { Kids2Nav } from "./Kids2SubNav";
import { Kids2NextCtx, NEXT_CONFIG, buildEditionsPool, buildNextEntries, defaultEntryId } from "./nextCircuit";
import { kidsUrl } from "../../ui/KidsLink";

export default function NextTournaments() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <NextTournamentsContent />;
}

/** Abas antigas → as do shell (lido uma vez, antes de o shell montar). */
function normalizarLinkAntigo(sp: URLSearchParams): URLSearchParams | null {
  const n = new URLSearchParams(sp);
  const t = n.get("t");
  if (t && /^usk/i.test(t)) n.set("t", t.replace(/^usk/i, ""));
  const tab = n.get("tab");
  if (tab === "players") n.set("tab", n.get("vista") === "grelha" ? "grelha" : "scout");
  if (tab === "scorecards") n.set("tab", "sc-edicoes"); // os scorecards das edições anteriores
  if (!tab && n.get("v") === "scout") n.set("tab", "scout");
  n.delete("vista"); n.delete("v");
  return n.toString() === sp.toString() ? null : n;
}

function NextTournamentsContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const n = normalizarLinkAntigo(searchParams);
    if (n) setSearchParams(n, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tParam = searchParams.get("t")?.replace(/^usk/i, "") ?? null;
  const escParam = searchParams.get("esc");
  // Torneio pedido no link: entra sempre na lista, mesmo já jogado.
  const [pedido] = useState(() => { const n = Number(tParam); return Number.isFinite(n) && n !== 0 ? n : null; });

  const [autoRivals, setAutoRivals] = useState<AutoRivalPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Os torneios WJGC/Doral/EOWAGR e as datas de nascimento saem dos resumos do
  // agregador (juniors-links + juniors-scout, ~6 MB), não da base inteira
  // (~188 MB do buildAutoRivals) — 23/10/2026.
  const [rivaisCompletos, setRivaisCompletos] = useState(false);
  useEffect(() => {
    let alive = true;
    buildExtraRivals()
      .then((players) => { if (alive) { setAutoRivals(players); setRivaisCompletos(true); } })
      .catch((e) => { if (alive) setError(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);

  // Escalão de referência dos torneios passados: o do Manuel hoje.
  const escRef = useMemo(() => `Boys ${escalaoManuelParaData(new Date())}`, []);
  const data = useFieldRivaisData(autoRivals ?? undefined, pedido, escRef);

  const [results, setResults] = useState<TorneioResult[] | null>(null);
  const [draws, setDraws] = useState<UskidsDrawsData | null>(null);
  const [edicoes, setEdicoes] = useState<EdicoesIndex["torneios"] | null>(null);
  useEffect(() => {
    let alive = true;
    loadUskidsResults().then(d => { if (alive) setResults(d.resultados); }).catch(() => { if (alive) setResults([]); });
    cachedFetchJson<UskidsDrawsData>("/data/uskids-draws.json").then(d => { if (alive) setDraws(d); }).catch(() => {});
    cachedFetchJson<EdicoesIndex>("/data/uskids-edicoes/index.json")
      .then(d => { if (alive) setEdicoes(d?.torneios ?? []); }).catch(() => { if (alive) setEdicoes([]); });
    return () => { alive = false; };
  }, []);

  const entries = useMemo(() => (data ? buildNextEntries({ data, results, draws, escRef }) : []), [data, results, draws, escRef]);
  const pool = useMemo(() => buildEditionsPool(entries, results, draws, (edicoes ?? []).map(edicaoEntry)),
    [entries, results, draws, edicoes]);
  const ids = useMemo(() => new Set(entries.map(e => e.id)), [entries]);
  // Enquanto a lista não está completa, o ?t= pedido fica (pode ainda chegar).
  const completa = rivaisCompletos && results !== null && !!data?.mhReady;
  const selectedId = tParam && (ids.has(tParam) || !completa) ? tParam : defaultEntryId(entries) ?? undefined;

  // ?t= de um torneio que não está na lista (ou nenhum): o do Manuel no URL.
  useEffect(() => {
    if (!entries.length || !selectedId || selectedId === tParam) return;
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("t", selectedId); return n; }, { replace: true });
  }, [entries.length, selectedId, tParam, setSearchParams]);

  const onSelectEntry = (e: CircuitEntry) => {
    if (e.id === searchParams.get("t")) return;
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("t", e.id); return n; }, { replace: true });
  };
  const onSelectDivision = (_e: CircuitEntry, d: CircuitDivision) => {
    if (d.key === searchParams.get("esc")) return;
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("esc", d.key); return n; }, { replace: true });
  };

  const ctx = useMemo(() => ({
    data, autoRivals: autoRivals ?? undefined,
    // As abas de análise precisam dos rivais e do histórico (chegam por trás).
    ready: !!autoRivals && rivaisCompletos && !!data?.mhReady,
    onSelectPlayer: (name: string) => { navigate(kidsUrl({ name })); },
  }), [data, autoRivals, rivaisCompletos, navigate]);

  const lead = <Kids2Nav />;
  const trail = autoRivals
    ? <span className="toolbar-meta shrink-0">{autoRivals.length.toLocaleString("pt-PT")} rivais</span>
    : !error ? <span className="toolbar-meta shrink-0">A carregar…</span> : null;

  if (error) return <EmptyState size="md" message={"Falhou: " + error} />;

  return (
    <Kids2NextCtx.Provider value={ctx}>
      <div className="tourn-layout u-h-calc-100vh-52px">
        <CircuitToolbarSlotCtx.Provider value={{ lead, trail, hideTitle: true }}>
          <CircuitShell
            entries={entries}
            config={NEXT_CONFIG}
            loading={!data}
            pastEditionsPool={pool}
            selectedId={selectedId}
            onSelectEntry={onSelectEntry}
            selectedDivKey={escParam ?? undefined}
            onSelectDivision={onSelectDivision}
          />
        </CircuitToolbarSlotCtx.Provider>
      </div>
    </Kids2NextCtx.Provider>
  );
}
