import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { sdClassByHcp } from "../utils/scoreDisplay";
import SexBadge from "../ui/SexBadge";

interface InscricaoJogador {
  fed:           string | null;
  nome:          string;
  clube:         string;
  hcp:           number | null;
  vac:           number | null;
  dataInscricao: string | null;
}

interface TorneioData {
  tcode:          string;
  nome:           string;
  escalao:        string;
  sex:            string;
  totalInscritos: number;
  jogadores:      InscricaoJogador[];
  lastFetched:    string | null;
  fpgUrl?:        string;
  _status:        "idle" | "loading" | "ok" | "error";
}

type BdPlayer = { name: string; escalao: string; sex: string; fed: string; clube: string; dob: string };

interface PlayerStats {
  avgSD5:       number | null;
  lastSD:       number | null;
  currentHcp:   number | null;
  hcpTrend:     string | null;
  hcpDelta3m:   number | null;
  roundsLast3m: number | null;
  formAlert:    string | null;
}
type StatsDb = Record<string, PlayerStats>;

function usePlayerStats() {
  const [stats, setStats] = useState<StatsDb>({});
  useEffect(() => {
    fetch("/player-stats.json")
      .then(r => r.ok ? r.json() : {})
      .then(setStats)
      .catch(() => {});
  }, []);
  return stats;
}

const TORNEIOS_CONFIG = [
  { tcode: "10935", nome: "Sub-18 H", escalao: "Sub-18", sex: "M" },
  { tcode: "10936", nome: "Sub-18 S", escalao: "Sub-18", sex: "F" },
  { tcode: "10937", nome: "Sub-16 H", escalao: "Sub-16", sex: "M" },
  { tcode: "10938", nome: "Sub-16 S", escalao: "Sub-16", sex: "F" },
  { tcode: "10939", nome: "Sub-14 H", escalao: "Sub-14", sex: "M" },
  { tcode: "10940", nome: "Sub-14 S", escalao: "Sub-14", sex: "F" },
  { tcode: "10941", nome: "Sub-12 H", escalao: "Sub-12", sex: "M" },
  { tcode: "10942", nome: "Sub-12 S", escalao: "Sub-12", sex: "F" },
  { tcode: "10943", nome: "Sub-10 H", escalao: "Sub-10", sex: "M" },
  { tcode: "10944", nome: "Sub-10 S", escalao: "Sub-10", sex: "F" },
];

function escShort(esc: string) { return esc.replace("Sub-", "S"); }
function escCls(esc: string) {
  return esc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}
function fmtDataInscricao(s: string | null) {
  if (!s) return "–";
  return s.replace(/^\d{4}\//, "").replace("/", "/");
}
function anoEscalao(dob: string, escalao: string): "1A" | "2A" | null {
  if (!dob) return null;
  const anoNasc = parseInt(dob.slice(0, 4));
  if (isNaN(anoNasc)) return null;
  const idadeMax = parseInt(escalao.replace("Sub-", ""));
  if (isNaN(idadeMax)) return null;
  return anoNasc === (new Date().getFullYear() - idadeMax) ? "2A" : "1A";
}
function AnoEscalaoPill({ dob, escalao }: { dob: string; escalao: string }) {
  if (!dob) return null;
  const anoNasc = dob.slice(0, 4);
  const ano = anoEscalao(dob, escalao);
  const isUltimo = ano === "2A";
  return (
    <span title={isUltimo ? `${anoNasc} — 2o ano (ultimo)` : `${anoNasc} — 1o ano`}
      style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, lineHeight: 1.4,
        background: isUltimo ? "var(--color-bad)" : "var(--color-good)", color: "#fff", flexShrink: 0 }}>
      {anoNasc}
    </span>
  );
}

/* ── Trend arrow ── */
function TrendBadge({ trend, delta }: { trend: string | null; delta: number | null }) {
  if (!trend) return null;
  if (trend === "improving") return (
    <span style={{ color: "var(--color-good)", fontWeight: 700, fontSize: 13 }}
      title={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} nos ultimos 3m` : "A melhorar"}>↓</span>
  );
  if (trend === "worsening") return (
    <span style={{ color: "var(--color-bad)", fontWeight: 700, fontSize: 13 }}
      title={delta != null ? `+${delta.toFixed(1)} nos ultimos 3m` : "A piorar"}>↑</span>
  );
  return <span className="muted" style={{ fontSize: 11 }}>–</span>;
}

/* ── Card de escalao no topo ── */
function TorneioCard({ t, nossosCount, active, onClick }: {
  t: TorneioData; nossosCount: number; active: boolean; onClick: () => void;
}) {
  const showRatio = t._status === "ok" && t.totalInscritos > 0;
  const allNossos  = nossosCount === t.totalInscritos;
  return (
    <button className={`nac-card${active ? " nac-card-active" : ""}`}
      onClick={onClick} title={`Campeonato Nacional de Jovens ${t.nome}`}>
      <div className="nac-card-top">
        <span className={`p p-sm p-${escCls(t.escalao)}`}>{escShort(t.escalao)}</span>
        <span className="nac-card-sex">{t.sex === "M" ? "♂" : "♀"}</span>
      </div>
      <div className="nac-card-mid">
        {t._status === "loading" && <span className="nac-spin">⟳</span>}
        {t._status === "error"   && <span className="nac-card-err" title="Erro">!</span>}
        {t._status === "idle"    && <span className="nac-card-idle">–</span>}
        {showRatio && allNossos  && <span className="nac-card-nossos">{t.totalInscritos}</span>}
        {showRatio && !allNossos && <>
          <span className="nac-card-nossos">{nossosCount}</span>
          <span className="nac-card-sep">/</span>
          <span className="nac-card-total">{t.totalInscritos}</span>
        </>}
      </div>
    </button>
  );
}

/* ── Detalhe de um torneio ── */
type SortKey = "pos" | "nome" | "hcp" | "vac" | "sd5" | "data" | "trend" | "rondas";

function TorneioDetalhe({ t, nossosFedSet, nossosByFed, statsDb }: {
  t: TorneioData; nossosFedSet: Set<string>; nossosByFed: Map<string, BdPlayer>; statsDb: StatsDb;
}) {
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortAsc, setSortAsc] = useState(true);
  const term = norm(search);

  const nossosCount = useMemo(
    () => t.jogadores.filter(j => j.fed && nossosFedSet.has(j.fed)).length,
    [t.jogadores, nossosFedSet],
  );

  const lista = useMemo(() => {
    let base = t.jogadores;
    if (term) base = base.filter(j => norm(j.nome).includes(term) || (j.fed || "").includes(term));
    if (sortKey === "pos") return sortAsc ? base : [...base].reverse();
    const sorted = [...base].sort((a, b) => {
      const sa = a.fed ? statsDb[a.fed] : null;
      const sb = b.fed ? statsDb[b.fed] : null;
      let v = 0;
      if      (sortKey === "nome")   { const pa = a.fed ? nossosByFed.get(a.fed) : null; const pb = b.fed ? nossosByFed.get(b.fed) : null; v = (pa?.name ?? a.nome).localeCompare(pb?.name ?? b.nome, "pt"); }
      else if (sortKey === "hcp")    { v = (a.hcp ?? 999) - (b.hcp ?? 999); }
      else if (sortKey === "vac")    { v = (a.vac ?? 999) - (b.vac ?? 999); }
      else if (sortKey === "sd5")    { v = (sa?.avgSD5 ?? 999) - (sb?.avgSD5 ?? 999); }
      else if (sortKey === "data")   { v = (a.dataInscricao ?? "").localeCompare(b.dataInscricao ?? ""); }
      else if (sortKey === "rondas") { v = (sb?.roundsLast3m ?? -1) - (sa?.roundsLast3m ?? -1); }
      else if (sortKey === "trend")  { const order = { improving: 0, stable: 1, worsening: 2 }; v = (order[sa?.hcpTrend as keyof typeof order] ?? 3) - (order[sb?.hcpTrend as keyof typeof order] ?? 3); }
      return sortAsc ? v : -v;
    });
    return sorted;
  }, [t.jogadores, term, sortKey, sortAsc, nossosByFed, statsDb]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v); else { setSortKey(key); setSortAsc(true); }
  }
  function SortTh({ label, col, className }: { label: string; col: SortKey; className?: string }) {
    const active = sortKey === col;
    return (
      <th className={className} onClick={() => toggleSort(col)}
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
        {label}{active ? (sortAsc ? " ↑" : " ↓") : " ↕"}
      </th>
    );
  }

  if (t._status === "loading") return <div className="muted p-24">A carregar...</div>;
  if (t._status === "error") return <div className="p-16" style={{ color: "var(--color-bad)" }}>Erro ao carregar. <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--chart-2)" }}>datagolf ↗</a></div>;
  if (t._status === "idle") return <div className="muted p-16">Clica no card acima para carregar.</div>;
  if (t.totalInscritos === 0) return <div className="muted p-16">Sem inscricoes ainda. <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--chart-2)" }}>datagolf ↗</a></div>;

  // Calcular medias para o resumo
  const nossosList = lista.filter(j => j.fed && nossosFedSet.has(j.fed));
  const externosList = lista.filter(j => !j.fed || !nossosFedSet.has(j.fed));
  const avgVacNossos = nossosList.length ? nossosList.reduce((s, j) => s + (j.vac ?? 0), 0) / nossosList.length : null;
  const avgVacField  = lista.length ? lista.reduce((s, j) => s + (j.vac ?? 0), 0) / lista.length : null;
  const avgHcpNossos = nossosList.length ? nossosList.reduce((s, j) => s + (j.hcp ?? 0), 0) / nossosList.length : null;

  return (
    <div className="nac-detalhe">
      {/* ── Resumo comparativo ── */}
      {nossosList.length > 0 && avgVacNossos != null && avgVacField != null && (
        <div className="nac-resumo">
          <div className="nac-resumo-item">
            <span className="nac-resumo-label">VAC medio (nossos)</span>
            <span className="nac-resumo-val" style={{ color: avgVacNossos <= avgVacField ? "var(--color-good)" : "var(--color-bad)" }}>
              {avgVacNossos.toFixed(1)}
            </span>
          </div>
          <div className="nac-resumo-item">
            <span className="nac-resumo-label">VAC medio (campo)</span>
            <span className="nac-resumo-val">{avgVacField.toFixed(1)}</span>
          </div>
          {avgHcpNossos != null && (
            <div className="nac-resumo-item">
              <span className="nac-resumo-label">HCP medio (nossos)</span>
              <span className="nac-resumo-val">{avgHcpNossos.toFixed(1)}</span>
            </div>
          )}
          <div className="nac-resumo-item">
            <span className="nac-resumo-label">Nossos / Campo</span>
            <span className="nac-resumo-val">{nossosList.length} / {lista.length}</span>
          </div>
          <div className="nac-resumo-item">
            <span className="nac-resumo-label">Externos</span>
            <span className="nac-resumo-val muted">{externosList.length}</span>
          </div>
        </div>
      )}

      <div className="nac-det-toolbar">
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nome, num fed..." style={{ maxWidth: 200 }} />
        <span className="muted" style={{ fontSize: 12 }}>{nossosCount} da BD · {t.totalInscritos} total</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {t.lastFetched && <span className="muted" style={{ fontSize: 11 }}>as {fmtTime(t.lastFetched)}</span>}
          {t.fpgUrl && <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--chart-2)" }}>datagolf</a>}
        </div>
      </div>

      <div className="table-wrap">
        <table className="dtable-lg">
          <colgroup>
            <col style={{ width: "4%" }} /><col style={{ width: "18%" }} />
            <col style={{ width: "7%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "9%" }} /><col style={{ width: "37%" }} />
          </colgroup>
          <thead>
            <tr>
              <SortTh label="#"      col="pos"    />
              <SortTh label="Nome"   col="nome"   />
              <th className="r">N. Fed</th>
              <SortTh label="HCP"    col="hcp"    className="r" />
              <SortTh label="VAC"    col="vac"    className="r" />
              <SortTh label="SD5"    col="sd5"    className="r" />
              <SortTh label="Trend"  col="trend"  className="r" />
              <SortTh label="R3m"    col="rondas" className="r" title="Rondas nos ultimos 3 meses" />
              <SortTh label="Insc"   col="data"   className="r" />
              <th>Na BD</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((j, i) => {
              const p  = j.fed ? nossosByFed.get(j.fed) : undefined;
              const st = j.fed ? statsDb[j.fed] : null;
              const sd5 = st?.avgSD5 ?? null;
              const hcpForSd = st?.currentHcp ?? j.hcp ?? null;
              return (
                <tr key={`${j.fed ?? j.nome}-${i}`} className={p ? "nac-row-match" : ""}>
                  <td className="muted r" style={{ fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}>
                    {p
                      ? <a href={`/jogadores/${j.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                           style={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}>{p.name}</a>
                      : <span className="muted">{j.nome || "–"}</span>}
                  </td>
                  <td className="r">
                    {j.fed
                      ? <a href={`/jogadores/${j.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                           style={{ color: "var(--chart-2)", textDecoration: "none", fontSize: 12 }}>{j.fed}</a>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 12 }}>{j.hcp != null ? j.hcp.toFixed(1) : "–"}</td>
                  <td className="r" style={{ fontSize: 12, fontWeight: 600 }}>{j.vac != null ? j.vac.toFixed(1) : "–"}</td>
                  <td className="r" style={{ fontSize: 11 }}>
                    {sd5 != null
                      ? <span className={`p p-${sdClassByHcp(sd5, hcpForSd)}`} style={{ fontSize: 11 }}>{sd5.toFixed(1)}</span>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r">
                    <TrendBadge trend={st?.hcpTrend ?? null} delta={st?.hcpDelta3m ?? null} />
                  </td>
                  <td className="r" style={{ fontSize: 12 }}>
                    {st?.roundsLast3m != null
                      ? <span style={{ fontWeight: st.roundsLast3m >= 4 ? 600 : 400, color: st.roundsLast3m === 0 ? "var(--color-bad)" : "inherit" }}>
                          {st.roundsLast3m}
                        </span>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 11 }}>{fmtDataInscricao(j.dataInscricao)}</td>
                  <td>
                    {p ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <SexBadge sex={p.sex} size="sm" />
                        <span className={`p p-sm p-${escCls(p.escalao)}`} style={{ fontSize: 10 }}>{escShort(p.escalao)}</span>
                        {p.dob && <AnoEscalaoPill dob={p.dob} escalao={t.escalao} />}
                        {p.clube && <span className="muted" style={{ fontSize: 11 }}>{p.clube}</span>}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>{j.fed ? "Nao na BD" : "–"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <div className="muted p-16">Sem resultados</div>}
      </div>
    </div>
  );
}

/* ── Pagina principal ── */
export default function NacionaisPage() {
  const { players } = useAppContext();
  const statsDb = usePlayerStats();

  const [torneios, setTorneios] = useState<TorneioData[]>(() =>
    TORNEIOS_CONFIG.map(t => ({ ...t, totalInscritos: 0, jogadores: [], lastFetched: null, _status: "idle" as const }))
  );
  const [activeTcode, setActiveTcode] = useState<string>("10941");
  const inFlight = useRef(new Set<string>());

  const nossosByFed = useMemo(() => {
    const m = new Map<string, BdPlayer>();
    const lista = Array.isArray(players) ? players : Object.values(players ?? {});
    for (const p of lista) {
      const fed = String((p as any).nfed ?? (p as any).fed ?? "").trim();
      if (!fed) continue;
      m.set(fed, { name: p.name, escalao: p.escalao, sex: p.sex, fed, clube: (p as any).club?.short ?? "", dob: (p as any).dob ?? "" });
    }
    return m;
  }, [players]);

  const nossosFedSet = useMemo(() => new Set(nossosByFed.keys()), [nossosByFed]);

  const fetchTorneio = useCallback(async (tcode: string) => {
    if (inFlight.current.has(tcode)) return;
    inFlight.current.add(tcode);
    setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "loading" } : t));
    try {
      const res = await fetch(`/api/inscricoes?tcode=${tcode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, ...data, _status: "ok" } : t));
    } catch (err) {
      console.error(`inscricoes tcode=${tcode}:`, err);
      setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "error" } : t));
    } finally {
      inFlight.current.delete(tcode);
    }
  }, []);

  useEffect(() => {
    const t = torneios.find(x => x.tcode === activeTcode);
    if (t && t._status === "idle") fetchTorneio(activeTcode);
  }, [activeTcode, torneios, fetchTorneio]);

  const refreshAll = useCallback(() => {
    inFlight.current.clear();
    setTorneios(prev => prev.map(t => ({ ...t, _status: "idle", jogadores: [], totalInscritos: 0, lastFetched: null })));
    TORNEIOS_CONFIG.reduce((chain, cfg) =>
      chain.then(() => fetchTorneio(cfg.tcode).then(() => new Promise<void>(r => setTimeout(r, 350)))),
      Promise.resolve()
    );
  }, [fetchTorneio]);

  const torneioActivo = torneios.find(t => t.tcode === activeTcode) ?? torneios[0];
  const totalNossosInscritos = useMemo(() => {
    const feds = new Set<string>();
    for (const t of torneios) for (const j of t.jogadores) if (j.fed && nossosFedSet.has(j.fed)) feds.add(j.fed);
    return feds.size;
  }, [torneios, nossosFedSet]);

  return (
    <div className="jogadores-page nac-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <span style={{ fontWeight: 700, fontSize: 13, marginRight: 4 }}>🏆 Nacionais Jovens</span>
          <button className="p p-tab" onClick={refreshAll} title="Actualizar todos os escaloes">↺ Actualizar</button>
        </div>
        <div className="toolbar-right">
          {totalNossosInscritos > 0 && (
            <div className="chip">{totalNossosInscritos} inscrito{totalNossosInscritos !== 1 ? "s" : ""}</div>
          )}
        </div>
      </div>

      <div className="nac-cards-row">
        {torneios.map(t => {
          const n = t.jogadores.filter(j => j.fed && nossosFedSet.has(j.fed)).length;
          return (
            <TorneioCard key={t.tcode} t={t} nossosCount={n}
              active={activeTcode === t.tcode}
              onClick={() => setActiveTcode(t.tcode)} />
          );
        })}
      </div>

      <div className="nac-content">
        <div className="nac-det-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Campeonato Nacional de Jovens — {torneioActivo.nome}
          </h3>
          <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${torneioActivo.tcode}`}
             target="_blank" rel="noopener noreferrer"
             style={{ fontSize: 11, color: "var(--chart-2)", flexShrink: 0 }}>
            ver em datagolf ↗
          </a>
        </div>
        <TorneioDetalhe t={torneioActivo} nossosFedSet={nossosFedSet} nossosByFed={nossosByFed} statsDb={statsDb} />
      </div>
    </div>
  );
}

/*
CSS a adicionar em App.css:

.nac-cards-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 6px; border-bottom: 1px solid var(--border); }
.nac-card { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 12px; min-width: 72px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-card); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.nac-card:hover { border-color: var(--chart-2); }
.nac-card-active { border-color: var(--chart-2); background: var(--bg-hover); }
.nac-card-top { display: flex; align-items: center; gap: 3px; }
.nac-card-sex { font-size: 11px; color: var(--text-2); }
.nac-card-mid { display: flex; align-items: baseline; gap: 1px; min-height: 22px; }
.nac-card-nossos { font-size: 19px; font-weight: 800; color: var(--color-good); line-height: 1; }
.nac-card-sep { font-size: 13px; color: var(--text-3); margin: 0 1px; }
.nac-card-total { font-size: 13px; color: var(--text-2); }
.nac-card-idle, .nac-card-err { font-size: 14px; color: var(--text-3); }
.nac-card-err { color: var(--color-bad); }
.nac-spin { font-size: 15px; color: var(--text-3); animation: nac-rotate 1s linear infinite; }
@keyframes nac-rotate { to { transform: rotate(360deg); } }
.nac-content { padding: 0 12px 20px; }
.nac-det-header { display: flex; align-items: baseline; gap: 12px; padding: 12px 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 8px; flex-wrap: wrap; }
.nac-det-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.nac-row-match { background: color-mix(in srgb, var(--color-good) 8%, transparent); }
.nac-row-match:hover { background: color-mix(in srgb, var(--color-good) 14%, transparent); }
.nac-resumo { display: flex; gap: 20px; flex-wrap: wrap; padding: 10px 0 12px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
.nac-resumo-item { display: flex; flex-direction: column; gap: 2px; }
.nac-resumo-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.nac-resumo-val { font-size: 18px; font-weight: 800; color: var(--text-1); }
*/
