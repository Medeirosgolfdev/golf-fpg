import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import SexBadge from "../ui/SexBadge";

interface InscricaoJogador {
  fed:   string | null;
  nome:  string;
  clube: string;
  hcp:   number | null;
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

function TorneioCard({ t, nossosCount, active, onClick }: {
  t: TorneioData; nossosCount: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`nac-card${active ? " nac-card-active" : ""}`}
      onClick={onClick}
      title={`Campeonato Nacional de Jovens ${t.nome}`}
    >
      <div className="nac-card-top">
        <span className={`p p-sm p-${escCls(t.escalao)}`}>{escShort(t.escalao)}</span>
        <span className="nac-card-sex">{t.sex === "M" ? "♂" : "♀"}</span>
      </div>
      <div className="nac-card-mid">
        {t._status === "loading" && <span className="nac-spin">⟳</span>}
        {t._status === "error"   && <span className="nac-card-err" title="Erro">!</span>}
        {t._status === "ok" && (
          <>
            <span className="nac-card-nossos">{nossosCount}</span>
            <span className="nac-card-sep">/</span>
            <span className="nac-card-total">{t.totalInscritos}</span>
          </>
        )}
        {t._status === "idle" && <span className="nac-card-idle">–</span>}
      </div>
    </button>
  );
}

type TabDetalhe = "nossos" | "todos";

function TorneioDetalhe({ t, nossosFedSet, nossosByFed }: {
  t: TorneioData;
  nossosFedSet: Set<string>;
  nossosByFed: Map<string, { name: string; escalao: string; sex: string }>;
}) {
  const [tab, setTab] = useState<TabDetalhe>("nossos");
  const [search, setSearch] = useState("");
  const term = norm(search);

  const nossosInscritos = useMemo(
    () => t.jogadores.filter(j => j.fed && nossosFedSet.has(j.fed)),
    [t.jogadores, nossosFedSet],
  );
  const lista = useMemo(() => {
    let base = tab === "nossos" ? nossosInscritos : t.jogadores;
    if (term) base = base.filter(j =>
      norm(j.nome).includes(term) || norm(j.clube).includes(term) || (j.fed || "").includes(term)
    );
    return base;
  }, [tab, nossosInscritos, t.jogadores, term]);

  if (t._status === "loading") return <div className="muted p-24">A carregar inscricoes...</div>;
  if (t._status === "error") return (
    <div className="p-16" style={{ color: "var(--color-bad)" }}>
      Erro ao carregar.{" "}
      <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${t.tcode}`}
         target="_blank" rel="noopener noreferrer" style={{ color: "var(--chart-2)" }}>
        Abrir em datagolf ↗
      </a>
    </div>
  );
  if (t._status === "idle") return <div className="muted p-16">Clica no card acima para carregar.</div>;
  if (t.totalInscritos === 0) return (
    <div className="muted p-16">
      Sem inscricoes ainda.{" "}
      <a href={`https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=${t.tcode}`}
         target="_blank" rel="noopener noreferrer" style={{ color: "var(--chart-2)" }}>
        Ver em datagolf ↗
      </a>
    </div>
  );

  return (
    <div className="nac-detalhe">
      <div className="nac-det-toolbar">
        <div className="nac-det-tabs">
          <button className={`p p-tab${tab === "nossos" ? " active" : ""}`} onClick={() => setTab("nossos")}>
            Os nossos <span className="p-filter-count">{nossosInscritos.length}</span>
          </button>
          <button className={`p p-tab${tab === "todos" ? " active" : ""}`} onClick={() => setTab("todos")}>
            Todos <span className="p-filter-count">{t.totalInscritos}</span>
          </button>
        </div>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Nome, clube, num fed..." style={{ maxWidth: 200 }} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {t.lastFetched && <span className="muted" style={{ fontSize: 11 }}>as {fmtTime(t.lastFetched)}</span>}
          {t.fpgUrl && (
            <a href={t.fpgUrl} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, color: "var(--chart-2)" }}>datagolf ↗</a>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table className="dtable-lg">
          <colgroup>
            <col style={{ width: "5%" }} /><col style={{ width: "30%" }} />
            <col style={{ width: "9%" }} /><col style={{ width: "7%" }} /><col style={{ width: "25%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th><th>Nome (FPG)</th><th className="r">N. Fed</th>
              <th className="r">HCP</th><th>Na BD</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((j, i) => {
              const p = j.fed ? nossosByFed.get(j.fed) : undefined;
              return (
                <tr key={`${j.fed ?? j.nome}-${i}`} className={p ? "nac-row-match" : ""}>
                  <td className="muted r" style={{ fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontWeight: p ? 700 : 400 }}>{j.nome || "–"}</td>
                  <td className="r">
                    {j.fed
                      ? <a href={`/jogadores/${j.fed}`} target="_blank" rel="noopener noreferrer"
                           style={{ color: "var(--chart-2)", textDecoration: "none", fontSize: 12 }}>
                          {j.fed}
                        </a>
                      : <span className="muted">–</span>}
                  </td>
                  <td className="r muted" style={{ fontSize: 12 }}>
                    {j.hcp != null ? j.hcp.toFixed(1) : "–"}
                  </td>
                  <td>
                    {p ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                        <SexBadge sex={p.sex} size="sm" />
                        <span className={`p p-sm p-${escCls(p.escalao)}`} style={{ fontSize: 10 }}>
                          {escShort(p.escalao)}
                        </span>
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {j.fed ? "Nao na BD" : "–"}
                      </span>
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

function MatrizView({ torneios, nossosByFed, inscricaoMap }: {
  torneios:     TorneioData[];
  nossosByFed:  Map<string, { name: string; escalao: string; sex: string; fed: string }>;
  inscricaoMap: Map<string, Set<string>>;
}) {
  const [search, setSearch] = useState("");
  const term = norm(search);
  const cols = torneios.filter(t => t._status === "ok" && t.totalInscritos > 0);
  const jogadoresInscritos = useMemo(() =>
    [...nossosByFed.values()]
      .filter(j => (inscricaoMap.get(j.fed)?.size ?? 0) > 0)
      .filter(j => !term || norm(j.name).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    [nossosByFed, inscricaoMap, term]
  );
  if (cols.length === 0) return <div className="muted p-16">Carrega os torneios primeiro (botao Actualizar).</div>;
  if (jogadoresInscritos.length === 0) return <div className="muted p-16">Nenhum dos nossos jogadores inscrito ainda.</div>;
  return (
    <div className="nac-matriz">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar jogador..." style={{ maxWidth: 220 }} />
        <span className="muted" style={{ fontSize: 12 }}>
          {jogadoresInscritos.length} jogadores inscritos em pelo menos 1 campeonato
        </span>
      </div>
      <div className="table-wrap">
        <table className="dtable-lg">
          <thead>
            <tr>
              <th>Jogador</th><th>Esc.</th>
              {cols.map(t => (
                <th key={t.tcode} className="c" title={`Campeonato Nacional de Jovens ${t.nome}`}>
                  <span className={`p p-sm p-${escCls(t.escalao)}`}>{escShort(t.escalao)}</span>
                  {" "}<span style={{ fontSize: 10 }}>{t.sex === "M" ? "♂" : "♀"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jogadoresInscritos.map(j => {
              const tcodes = inscricaoMap.get(j.fed) ?? new Set<string>();
              return (
                <tr key={j.fed}>
                  <td><span style={{ fontWeight: 600 }}>{j.name}</span><SexBadge sex={j.sex} size="sm" /></td>
                  <td><span className={`p p-sm p-${escCls(j.escalao)}`}>{escShort(j.escalao)}</span></td>
                  {cols.map(t => (
                    <td key={t.tcode} className="c">
                      {tcodes.has(t.tcode)
                        ? <span style={{ color: "var(--color-good)", fontWeight: 800, fontSize: 16 }}>✓</span>
                        : <span className="muted" style={{ fontSize: 12 }}>–</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type PageView = "detalhe" | "matriz";

export default function NacionaisPage() {
  const { players } = useAppContext();

  const [torneios, setTorneios] = useState<TorneioData[]>(() =>
    TORNEIOS_CONFIG.map(t => ({ ...t, totalInscritos: 0, jogadores: [], lastFetched: null, _status: "idle" as const }))
  );
  const [activeTcode, setActiveTcode] = useState<string>("10941");
  const [view, setView] = useState<PageView>("detalhe");
  const inFlight = useRef(new Set<string>());

  const nossosByFed = useMemo(() => {
    const m = new Map<string, { name: string; escalao: string; sex: string; fed: string }>();
    const lista = Array.isArray(players) ? players : Object.values(players ?? {});
    for (const p of lista) {
      if (p.fed) m.set(String(p.fed), { name: p.name, escalao: p.escalao, sex: p.sex, fed: String(p.fed) });
    }
    return m;
  }, [players]);

  const nossosFedSet = useMemo(() => new Set(nossosByFed.keys()), [nossosByFed]);

  const inscricaoMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const t of torneios) {
      for (const j of t.jogadores) {
        if (!j.fed || !nossosFedSet.has(j.fed)) continue;
        if (!m.has(j.fed)) m.set(j.fed, new Set());
        m.get(j.fed)!.add(t.tcode);
      }
    }
    return m;
  }, [torneios, nossosFedSet]);

  const fetchTorneio = useCallback(async (tcode: string) => {
    if (inFlight.current.has(tcode)) return;
    inFlight.current.add(tcode);
    setTorneios(prev => prev.map(t => t.tcode === tcode ? { ...t, _status: "loading" } : t));
    try {
      const res = await fetch(`/api/inscricoes?tcode=${tcode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTorneios(prev => prev.map(t =>
        t.tcode === tcode ? { ...t, ...data, _status: "ok" } : t
      ));
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
  const totalNossosInscritos = useMemo(() =>
    [...inscricaoMap.keys()].filter(f => (inscricaoMap.get(f)?.size ?? 0) > 0).length,
    [inscricaoMap]
  );

  return (
    <div className="jogadores-page nac-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <span style={{ fontWeight: 700, fontSize: 13, marginRight: 4 }}>🏆 Nacionais Jovens</span>
          <button className="p p-tab" onClick={refreshAll} title="Actualizar todos os escaloes">
            ↺ Actualizar
          </button>
          <div style={{ display: "flex", gap: 4 }}>
            <button className={`p p-tab${view === "detalhe" ? " active" : ""}`} onClick={() => setView("detalhe")}>Por torneio</button>
            <button className={`p p-tab${view === "matriz" ? " active" : ""}`} onClick={() => setView("matriz")}>Matriz</button>
          </div>
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
              onClick={() => { setActiveTcode(t.tcode); setView("detalhe"); }} />
          );
        })}
      </div>

      <div className="nac-content">
        {view === "matriz" ? (
          <MatrizView torneios={torneios} nossosByFed={nossosByFed} inscricaoMap={inscricaoMap} />
        ) : (
          <>
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
            <TorneioDetalhe t={torneioActivo} nossosFedSet={nossosFedSet} nossosByFed={nossosByFed} />
          </>
        )}
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
.nac-det-tabs { display: flex; gap: 4px; }
.nac-row-match { background: color-mix(in srgb, var(--color-good) 8%, transparent); }
.nac-row-match:hover { background: color-mix(in srgb, var(--color-good) 14%, transparent); }
.nac-matriz { padding: 4px 0; }
*/