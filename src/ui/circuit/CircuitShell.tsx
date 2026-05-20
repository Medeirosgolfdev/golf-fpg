/**
 * src/ui/circuit/CircuitShell.tsx
 *
 * Página-mãe dos circuitos internacionais. Recebe `entries[] + config`
 * (ver ./types.ts) e desenha TODA a navegação/filtros/aspecto comum:
 *
 *   • master-detail (sidebar agrupada por ano / série / fonte)
 *   • toolbar de filtros (pesquisa, ano, escalão, sexo, fonte) + toggles
 *     rápidos (★ Manuel, 🇵🇹 PT, 🏆 Top 10, ✦ Veteranos, ↻ Regressados, ⬆ Subiram)
 *   • detalhe: DetailHeader + tabs de secção (.tab-under) + tabs de escalão
 *     (.tab-under) + leaderboard via <IntlTournView> (ou inscritos / draw)
 *
 * Cada página de circuito (RFEG, France, England, GJGL, MAJOR) passa a ser
 * apenas: loader + adaptador → CircuitShell. Sem layout próprio.
 *
 * O leaderboard em si é desenhado pelo <IntlTournView> (round tabs + scorecards).
 */

import React, { useMemo, useState, useEffect } from "react";
import { useMasterDetail } from "../../hooks/useMasterDetail";
import SidebarToggle from "../SidebarToggle";
import SidebarSectionTitle from "../SidebarSectionTitle";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../Toolbar";
import DetailHeader from "../DetailHeader";
import LoadingState from "../LoadingState";
import Counter from "../Counter";
import SexBadge from "../SexBadge";
import ExtLink from "../ExternalLink";
import { EscPill, RoundPill, ManuelPill } from "../PillBadge";
import { IntlTournView } from "../IntlTournView";
import { KidsLinkCtx } from "../KidsLink";
import { useKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { isManuelByName } from "../../constants/manuel";
import SortableHdr from "../SortableHdr";
import { useSort } from "../../hooks/useSort";
import type { Tournament as FPGTournament, Player as FPGPlayer } from "../../data/fpgTypes";
import type {
  CircuitEntry, CircuitConfig, CircuitDivision, CircuitToggle,
  CircuitSectionKind, CircuitInscritoRow, CircuitDrawGroup,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

/** Normaliza nome para indexação (lowercase, sem diacríticos, espaços únicos). */
function normName(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Português? via flag do adaptador (_isPortuguese) ou nome do Manuel. */
function isPt(p: FPGPlayer): boolean {
  return !!p._isPortuguese || isManuelByName(p.name);
}

const TOGGLE_DEF: Record<CircuitToggle, { label: string; title: string }> = {
  manuel:      { label: "★ Manuel",      title: "Só o Manuel" },
  pt:          { label: "🇵🇹 PT",        title: "Só jogadores portugueses" },
  top10:       { label: "🏆 Top 10",      title: "Só os 10 melhores classificados" },
  veteranos:   { label: "✦ Veteranos",   title: "Jogadores presentes em muitos torneios" },
  regressados: { label: "↻ Regressados", title: "Jogou edição anterior do mesmo torneio" },
  subiram:     { label: "⬆ Subiram",     title: "Subiu de escalão face à última edição" },
};

const SECTION_DEF: Record<CircuitSectionKind, { label: string; icon: string }> = {
  results:   { label: "Resultados",  icon: "📋" },
  inscritos: { label: "Inscritos",   icon: "👥" },
  draw:      { label: "Draw saída",  icon: "🕐" },
};

/** Secções disponíveis numa divisão (apenas as que têm dados). */
function divisionSections(d: CircuitDivision): CircuitSectionKind[] {
  const out: CircuitSectionKind[] = [];
  if (d.results) out.push("results");
  if (d.inscritos && d.inscritos.lists.some(l => l.players.length > 0)) out.push("inscritos");
  if (d.draw && Object.keys(d.draw.rounds).length > 0) out.push("draw");
  return out;
}

/** Jogadores totais de um entry (metadado leve, ou soma das divisões carregadas). */
function entryPlayerCount(e: CircuitEntry): number {
  if (e.playerCount != null) return e.playerCount;
  return (e.divisions ?? []).reduce((acc, d) => acc + (d.results?.players.length ?? 0), 0);
}

/** "2026-05-15" → "15/05/2026"; outros formatos passam tal-qual. */
function fmtDate(d?: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
/** Intervalo de datas para a sidebar (start → end se diferentes). */
function fmtDateRange(d1?: string, d2?: string): string {
  const a = fmtDate(d1), b = fmtDate(d2);
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || "";
}
/** Texto branco/preto consoante a luminosidade da cor de fundo (hex #rrggbb). */
function fgFor(bg?: string): string {
  if (!bg || !/^#[0-9a-f]{6}$/i.test(bg)) return "#fff";
  const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#000" : "#fff";
}

// ── Filtros de toggles aplicados ao leaderboard ───────────────────────

function applyToggles(
  t: FPGTournament,
  active: Set<CircuitToggle>,
  vetIndex: Map<string, number>,
  vetThreshold: number,
): FPGTournament {
  if (active.size === 0) return t;
  let players = t.players;

  if (active.has("manuel")) players = players.filter(p => isManuelByName(p.name));
  if (active.has("pt")) players = players.filter(p => isPt(p));
  if (active.has("veteranos")) {
    players = players.filter(p => (vetIndex.get(normName(p.name)) ?? 0) >= vetThreshold);
  }
  if (active.has("regressados")) {
    players = players.filter(p => (p as unknown as { _regressado?: boolean })._regressado === true);
  }
  if (active.has("subiram")) {
    players = players.filter(p => (p as unknown as { _subiu?: boolean })._subiu === true);
  }
  if (active.has("top10")) {
    // Top 10 por gross acumulado (robusto mesmo sem campo pos fiável).
    const ranked = [...players]
      .filter(p => typeof p.grossTotal === "number")
      .sort((a, b) => (a.grossTotal as number) - (b.grossTotal as number));
    const top = new Set(ranked.slice(0, 10));
    players = players.filter(p => top.has(p));
  }

  return { ...t, players };
}

// ── Sub-vistas: Inscritos e Draw ──────────────────────────────────────

function InscritosView({ lists }: { lists: NonNullable<CircuitDivision["inscritos"]>["lists"] }) {
  const available = lists.filter(l => l.players.length > 0);
  const [active, setActive] = useState(available[0]?.key ?? "");
  useEffect(() => { if (!available.some(l => l.key === active)) setActive(available[0]?.key ?? ""); }, [available, active]);
  const cur = available.find(l => l.key === active) ?? available[0];
  if (!cur) return null;
  return (
    <div>
      {available.length > 1 && (
        <div className="tab-bar" style={{ marginBottom: 8 }}>
          {available.map(l => (
            <button key={l.key} className={`tab-under${active === l.key ? " active" : ""}`} onClick={() => setActive(l.key)}>
              {l.label} <span className="muted">({l.players.length})</span>
            </button>
          ))}
        </div>
      )}
      <InscritosTable rows={cur.players} />
    </div>
  );
}

type InscritosSortKey = "pos" | "name" | "escalao" | "sex" | "club" | "hcp" | "dob" | "status";

function InscritosTable({ rows }: { rows: CircuitInscritoRow[] }) {
  const { sortKey, sortDir, toggleSort } = useSort<InscritosSortKey>("pos");

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p: CircuitInscritoRow): string | number => {
      switch (sortKey) {
        case "pos": return typeof p.pos === "number" ? p.pos : 99999;
        case "name": return (p.name || "").toLowerCase();
        case "escalao": return (p.escalao || "").toLowerCase();
        case "sex": return p.sex || "";
        case "club": return (p.club || "").toLowerCase();
        case "hcp": return p.hcp ?? 999;
        case "dob": return p.dob || "";
        case "status": return (p.status || "").toLowerCase();
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [rows, sortKey, sortDir]);

  const hdr = (k: InscritosSortKey, label: React.ReactNode, cls?: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls}>{label}</SortableHdr>
  );

  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-lb">
        <thead>
          <tr>
            {hdr("pos", "#")}
            {hdr("name", "Nome", "lb-name")}
            {hdr("escalao", "Escalão")}
            {hdr("sex", "Sx")}
            {hdr("club", "Clube", "lb-club")}
            {hdr("hcp", "HCP")}
            {hdr("dob", "Nasc.")}
            {hdr("status", "Estado")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={i} className={isManuelByName(p.name) ? "row-manuel" : undefined}>
              <td>{p.pos ?? i + 1}</td>
              <td className="lb-name fw-700" style={{ textAlign: "left" }}>
                {p.name}{isManuelByName(p.name) && <> <ManuelPill /></>}
              </td>
              <td>{p.escalao || "—"}</td>
              <td>{p.sex ? <SexBadge sex={p.sex} /> : "—"}</td>
              <td className="lb-club" style={{ textAlign: "left" }}>{p.club || "—"}</td>
              <td>{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>
              <td>{p.dob || "—"}</td>
              <td>{p.status || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrawView({ rounds }: { rounds: Record<string, CircuitDrawGroup[]> }) {
  const roundKeys = Object.keys(rounds).sort();
  const [active, setActive] = useState(roundKeys[0] ?? "");
  useEffect(() => { if (!roundKeys.includes(active)) setActive(roundKeys[0] ?? ""); }, [roundKeys, active]);
  const groups = rounds[active] ?? [];
  return (
    <div>
      {roundKeys.length > 1 && (
        <div className="tab-bar" style={{ marginBottom: 8 }}>
          {roundKeys.map(r => (
            <button key={r} className={`tab-under${active === r ? " active" : ""}`} onClick={() => setActive(r)}>
              R{r}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map((g, i) => (
          <div key={i} className="card" style={{ padding: 8 }}>
            <div className="fw-700" style={{ marginBottom: 4 }}>
              {g.teeTime || "—"}{g.startHole ? ` · Buraco ${g.startHole}` : ""}{g.tee ? ` · ${g.tee}` : ""}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {g.players.map((pl, j) => (
                <span key={j}>{j > 0 ? " · " : ""}{pl.name}{pl.club ? ` (${pl.club})` : ""}</span>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <div className="muted">Sem draw publicado para esta ronda.</div>}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────

export interface CircuitShellProps {
  entries: CircuitEntry[];
  config: CircuitConfig;
  loading?: boolean;
  /** ID seleccionado (resolvido pela página a partir da URL). Opcional. */
  selectedId?: string;
  /** Chamado ao seleccionar um torneio (a página navega/actualiza URL). */
  onSelectEntry?: (entry: CircuitEntry) => void;
}

export default function CircuitShell({ entries, config, loading, selectedId, onSelectEntry }: CircuitShellProps) {
  const md = useMasterDetail();
  const { kidsMap } = useKidsLinkMap();

  // ── Estado de filtros ──────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [fYear, setFYear] = useState("all");
  const [fEsc, setFEsc] = useState("all");
  const [fSex, setFSex] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [toggles, setToggles] = useState<Set<CircuitToggle>>(new Set());
  /** Vista informativa activa (ex: Categorías/Federaciones) — null = detalhe normal. */
  const [infoView, setInfoView] = useState<string | null>(null);

  const flt = config.filters ?? {};
  const enabledToggles = flt.toggles ?? [];
  const vetThreshold = config.veteranoThreshold ?? 3;

  // ── Índice de veteranos (presenças por jogador em todos os torneios) ─
  const vetIndex = useMemo(() => {
    if (config.veteranIndex) return config.veteranIndex;
    const m = new Map<string, number>();
    for (const e of entries) {
      const seen = new Set<string>();
      for (const d of e.divisions ?? []) {
        for (const p of d.results?.players ?? []) {
          const k = normName(p.name);
          if (!seen.has(k)) { seen.add(k); m.set(k, (m.get(k) ?? 0) + 1); }
        }
      }
    }
    return m;
  }, [entries, config.veteranIndex]);

  // ── Opções dos dropdowns ────────────────────────────────────────────
  const years = useMemo(
    () => [...new Set(entries.map(e => e.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
    [entries],
  );
  const escaloes = useMemo(
    () => [...new Set(entries.flatMap(e => e.divisions ? e.divisions.map(d => d.escalao) : (e.escalao ? [e.escalao] : [])))].sort(),
    [entries],
  );
  const sources = useMemo(
    () => [...new Set(entries.map(e => e.source).filter((s): s is string => !!s))].sort(),
    [entries],
  );

  // ── Entries visíveis (após filtros de torneio) ──────────────────────
  const visible = useMemo(() => {
    const q = normName(search);
    return entries.filter(e => {
      if (flt.year && fYear !== "all" && String(e.year) !== fYear) return false;
      if (flt.source && fSource !== "all" && e.source !== fSource) return false;
      if (flt.escalao && fEsc !== "all" && !(e.escalao === fEsc || (e.divisions ?? []).some(d => d.escalao === fEsc))) return false;
      if (flt.sex && fSex !== "all" && !(e.sex === fSex || e.sex === "Mixed" || (e.divisions ?? []).some(d => d.sex === fSex || d.sex === "Mixed"))) return false;
      if (q) {
        const hay = normName(`${e.name} ${e.course ?? ""}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, fYear, fEsc, fSex, fSource, flt]);

  // ── Selecção do torneio activo ──────────────────────────────────────
  const [localId, setLocalId] = useState<string | null>(null);
  const wantId = selectedId ?? localId;
  const cur = useMemo(() => {
    const byId = wantId ? visible.find(e => e.id === wantId) ?? entries.find(e => e.id === wantId) : null;
    if (byId) return byId;
    // Default: primeiro com Manuel, senão primeiro visível.
    return visible.find(e => e.hasManuel) ?? visible[0] ?? null;
  }, [wantId, visible, entries]);

  const selectEntry = (e: CircuitEntry) => {
    setLocalId(e.id);
    setInfoView(null); // sair de qualquer vista informativa ao escolher torneio
    md.onSelect();
    onSelectEntry?.(e);
  };

  const curInfoItem = infoView ? config.specialItems?.find(si => si.key === infoView) : undefined;

  // ── Carregamento (lazy) das divisões do torneio seleccionado ────────
  const [divCache, setDivCache] = useState<Record<string, CircuitDivision[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const curId = cur?.id ?? null;

  useEffect(() => {
    if (!cur || cur.divisions || divCache[cur.id] || !cur.loadDivisions) return;
    let alive = true;
    setLoadingId(cur.id);
    cur.loadDivisions()
      .then(divs => { if (alive) setDivCache(prev => ({ ...prev, [cur.id]: divs })); })
      .catch(() => { if (alive) setDivCache(prev => ({ ...prev, [cur.id]: [] })); })
      .finally(() => { if (alive) setLoadingId(id => (id === cur.id ? null : id)); });
    return () => { alive = false; };
  }, [curId]); // eslint-disable-line react-hooks/exhaustive-deps

  const curDivisions: CircuitDivision[] = cur ? (cur.divisions ?? divCache[cur.id] ?? []) : [];
  const divsLoading = !!cur && curDivisions.length === 0 && loadingId === cur.id;

  // ── Divisão (escalão) activa ────────────────────────────────────────
  const [divKey, setDivKey] = useState<string | null>(null);
  const curDiv = useMemo(() => {
    if (!cur || curDivisions.length === 0) return null;
    const byKey = divKey ? curDivisions.find(d => d.key === divKey) : null;
    if (byKey) return byKey;
    return curDivisions.find(d => d.hasManuel) ?? curDivisions[0] ?? null;
  }, [cur, curDivisions, divKey]);
  // Reset divisão ao mudar de torneio.
  useEffect(() => { setDivKey(null); }, [curId]);

  // ── Secção activa ───────────────────────────────────────────────────
  const sections = useMemo(() => (curDiv ? divisionSections(curDiv) : []), [curDiv]);
  const [section, setSection] = useState<CircuitSectionKind | null>(null);
  const curSection: CircuitSectionKind | null = section && sections.includes(section) ? section : sections[0] ?? null;
  useEffect(() => { setSection(null); }, [curDiv?.key]);

  const toggle = (t: CircuitToggle) => setToggles(prev => {
    const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n;
  });

  const hasActiveFilters =
    !!search || fYear !== "all" || fEsc !== "all" || fSex !== "all" || fSource !== "all" || toggles.size > 0;
  const clearFilters = () => {
    setSearch(""); setFYear("all"); setFEsc("all"); setFSex("all"); setFSource("all"); setToggles(new Set());
  };

  if (loading) {
    return <div className="tourn-layout"><LoadingState message={config.loadingMessage ?? "A carregar…"} /></div>;
  }

  // ── Leaderboard com toggles aplicados ───────────────────────────────
  const resultsTourn = curDiv?.results
    ? applyToggles(curDiv.results, toggles, vetIndex, vetThreshold)
    : null;

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <div className="tourn-layout">

        {/* Toolbar */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
          <ToolbarTitle>{config.title}</ToolbarTitle>
          {cur?.course && <ToolbarMeta>📍 {cur.course}</ToolbarMeta>}

          {flt.search && (
            <input
              className="input"
              style={{ width: 160, fontSize: 12, padding: "3px 8px", marginLeft: 8 }}
              placeholder="🔍 Pesquisar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          {flt.year && (
            <select className="input" value={fYear} onChange={e => setFYear(e.target.value)} style={{ fontSize: 12, padding: "3px 6px" }}>
              <option value="all">📅 Ano</option>
              {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}
          {flt.escalao && (
            <select className="input" value={fEsc} onChange={e => setFEsc(e.target.value)} style={{ fontSize: 12, padding: "3px 6px" }}>
              <option value="all">🏆 Escalão</option>
              {escaloes.map(es => <option key={es} value={es}>{es}</option>)}
            </select>
          )}
          {flt.sex && (
            <select className="input" value={fSex} onChange={e => setFSex(e.target.value)} style={{ fontSize: 12, padding: "3px 6px" }}>
              <option value="all">M+F</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          )}
          {flt.source && sources.length > 1 && (
            <select className="input" value={fSource} onChange={e => setFSource(e.target.value)} style={{ fontSize: 12, padding: "3px 6px" }}>
              <option value="all">Fonte</option>
              {sources.map(s => <option key={s} value={s}>{config.sourceLabels?.[s] ?? s}</option>)}
            </select>
          )}

          {/* Menu INFO — vistas informativas (categorias, federações, ...) */}
          {!!config.specialItems?.length && (
            <select
              className="input"
              value={infoView ?? ""}
              onChange={e => setInfoView(e.target.value || null)}
              style={{ fontSize: 12, padding: "3px 6px" }}
              title="Páginas informativas"
            >
              <option value="">ⓘ Info</option>
              {config.specialItems.map(si => <option key={si.key} value={si.key}>{si.label}</option>)}
            </select>
          )}

          {/* Toggles rápidos */}
          {enabledToggles.map(t => (
            <button
              key={t}
              type="button"
              title={TOGGLE_DEF[t].title}
              className={`tourn-tab tourn-tab-sm${toggles.has(t) ? " active" : ""}`}
              onClick={() => toggle(t)}
            >
              {TOGGLE_DEF[t].label}
            </button>
          ))}

          {hasActiveFilters && (
            <button type="button" className="tourn-tab tourn-tab-sm" onClick={clearFilters} title="Limpar filtros">✕</button>
          )}

          <Counter ml="auto">
            {hasActiveFilters ? `${visible.length} de ${entries.length}` : `${entries.length} torneios`}
          </Counter>
        </Toolbar>

        <div className="master-detail">

          {/* Sidebar */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            <CircuitSidebar
              entries={visible}
              config={config}
              curId={cur?.id ?? null}
              onSelect={selectEntry}
            />
          </div>

          {/* Detalhe */}
          <div className="course-detail" ref={md.detailRef}>
            {curInfoItem ? (
              curInfoItem.render()
            ) : !cur ? (
              <div className="center-msg muted">Sem torneios para mostrar.</div>
            ) : divsLoading ? (
              <LoadingState message={config.loadingMessage ?? "A carregar dados…"} />
            ) : curDiv ? (
              <>
                <DetailHeader
                  title={cur.name}
                  sub={
                    <>
                      <span className="muted">
                        {(curDiv.tabLabel || curDiv.escalao) && <>{curDiv.tabLabel || curDiv.escalao}</>}
                        {cur.course && <> · 📍 {cur.course}</>}
                        {cur.federation && <> · 🏛️ {cur.federation}</>}
                      </span>
                      {curDiv.sex && <> <SexBadge sex={curDiv.sex === "Mixed" ? "M" : curDiv.sex} /></>}
                      {curDiv.sex === "Mixed" && <SexBadge sex="F" />}
                      {(cur.hcpLimit?.men != null || cur.hcpLimit?.women != null) && (
                        <span className="muted" style={{ marginLeft: 8 }}>
                          {cur.hcpLimit?.men != null && `Hcp M ≤ ${cur.hcpLimit.men} `}
                          {cur.hcpLimit?.women != null && `Hcp F ≤ ${cur.hcpLimit.women}`}
                        </span>
                      )}
                      {cur.sourceUrl && (
                        <ExtLink href={cur.sourceUrl} className="tourn-ext-link" style={{ marginLeft: 8 }}>
                          🔗 Leaderboard oficial
                        </ExtLink>
                      )}
                    </>
                  }
                />

                {/* Tabs de secção (Resultados / Inscritos / Draw) */}
                {sections.length > 1 && (
                  <div className="tab-bar" style={{ marginBottom: 8 }}>
                    {sections.map(s => (
                      <button
                        key={s}
                        className={`tab-under${curSection === s ? " active" : ""}`}
                        onClick={() => setSection(s)}
                      >
                        {SECTION_DEF[s].icon} {SECTION_DEF[s].label}
                        {s === "results" && curDiv.results && (
                          <span className="muted"> ({curDiv.results.players.length})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Tabs de escalão (.tab-under) */}
                {curDivisions.length > 1 && (
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 10, overflowX: "auto" }}>
                    {curDivisions.map(d => {
                      const active = d.key === curDiv.key;
                      const nP = d.results?.players.length ?? 0;
                      return (
                        <button
                          key={d.key}
                          className={`tab-under${active ? " active" : ""}`}
                          onClick={() => setDivKey(d.key)}
                        >
                          {d.tabLabel || d.escalao}
                          {nP > 0 && <span className="fs-10 muted"> {nP}</span>}
                          {d.hasManuel && <span style={{ color: "var(--color-good)" }}> ★</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Conteúdo da secção activa */}
                {curSection === "results" && resultsTourn && (
                  <IntlTournView
                    tournament={resultsTourn}
                    scOptions={curDiv.scOptions ?? {}}
                    roundLabels={curDiv.roundLabels}
                    siLabel={curDiv.siLabel}
                    evoCols={curDiv.evoCols}
                    accHeader={curDiv.accHeader}
                    roundExtra={curDiv.roundExtra}
                    accExtra={curDiv.accExtra}
                  />
                )}
                {curSection === "inscritos" && curDiv.inscritos && (
                  <InscritosView lists={curDiv.inscritos.lists} />
                )}
                {curSection === "draw" && curDiv.draw && (
                  <DrawView rounds={curDiv.draw.rounds} />
                )}
              </>
            ) : (
              <div className="center-msg muted">Sem dados para este torneio.</div>
            )}
          </div>
        </div>
      </div>
    </KidsLinkCtx.Provider>
  );
}

// ── Sidebar (agrupamento por ano / série / fonte) ─────────────────────

function CircuitSidebar({
  entries, config, curId, onSelect,
}: {
  entries: CircuitEntry[];
  config: CircuitConfig;
  curId: string | null;
  onSelect: (e: CircuitEntry) => void;
}) {
  // Agrupamento de 1º nível (none | série | fonte).
  const l1Mode = config.grouping === "series-year" ? "series"
    : config.grouping === "source-year" ? "source"
    : "none";

  const groups = useMemo(() => {
    const byL1 = new Map<string, CircuitEntry[]>();
    for (const e of entries) {
      const key = l1Mode === "series" ? (e.series ?? "—")
        : l1Mode === "source" ? (e.source ?? "—")
        : "";
      if (!byL1.has(key)) byL1.set(key, []);
      byL1.get(key)!.push(e);
    }
    let keys = [...byL1.keys()];
    if (l1Mode === "series" && config.seriesOrder) {
      keys = keys.sort((a, b) => {
        const ia = config.seriesOrder!.indexOf(a), ib = config.seriesOrder!.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
    } else {
      keys = keys.sort();
    }
    return keys.map(k => {
      const items = byL1.get(k)!;
      const years = [...new Set(items.map(e => e.year))].sort((a, b) => (b ?? -1) - (a ?? -1));
      return { key: k, years: years.map(y => ({ year: y, items: items.filter(e => e.year === y) })) };
    });
  }, [entries, l1Mode, config.seriesOrder]);

  return (
    <>
      {l1Mode === "none" && (
        <SidebarSectionTitle dark color={config.color} textColor={config.textColor} letterSpacing="0.08em">
          {config.title}
        </SidebarSectionTitle>
      )}
      {groups.map(g => (
        <React.Fragment key={g.key || "_"}>
          {l1Mode !== "none" && (
            <SidebarSectionTitle dark color={config.color} textColor={config.textColor} letterSpacing="0.08em">
              {g.key}
            </SidebarSectionTitle>
          )}
          {g.years.map(({ year, items }) => (
            <React.Fragment key={String(year)}>
              <div className="sidebar-year-label" style={{ padding: "2px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 4, background: config.color, color: config.textColor ?? "#fff" }}>
                {year ?? "Sem data"}
              </div>
              {items.map(e => {
                const active = e.id === curId;
                const nP = entryPlayerCount(e);
                const nR = e.roundsCount ?? Math.max(0, ...(e.divisions ?? []).map(d => d.results?.rounds ?? 0));
                const nDiv = e.divisionCount ?? e.divisions?.length ?? 1;
                const esc = e.escalao ?? e.divisions?.[0]?.escalao;
                const sex = e.sex ?? e.divisions?.[0]?.sex;
                const srcColor = e.source ? config.sourceColors?.[e.source] : undefined;
                const srcLabel = e.source ? (config.sourceLabels?.[e.source] ?? e.source) : undefined;
                const dateStr = fmtDateRange(e.dateStart, e.dateEnd);
                return (
                  <div
                    key={e.id}
                    role="button" tabIndex={0}
                    className={`course-item ${active ? "active" : ""}`}
                    onClick={() => onSelect(e)}
                    onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") onSelect(e); }}
                  >
                    <div className="course-item-name">
                      {e.name}
                      {e.hasManuel && <ManuelPill />}
                    </div>
                    <div className="course-item-meta" style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                      {srcLabel && (
                        <span className="chip" style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: srcColor, color: fgFor(srcColor) }}>{srcLabel}</span>
                      )}
                      {esc && <EscPill esc={esc} />}
                      {sex && <SexBadge sex={sex === "Mixed" ? "M" : sex} />}
                      {sex === "Mixed" && <SexBadge sex="F" />}
                      {nDiv > 1 && <span>{nDiv} escalões</span>}
                      {nR > 1 && <RoundPill nR={nR} />}
                    </div>
                    {dateStr && <div className="course-item-meta" style={{ fontSize: 11, marginTop: 4 }}>📅 {dateStr}</div>}
                    {e.course && <div className="course-item-meta" style={{ fontWeight: 600, color: "var(--text-2)" }}>📍 {e.course.length > 50 ? e.course.slice(0, 50) + "…" : e.course}</div>}
                    {nP > 0 && <div className="course-item-meta" style={{ fontSize: 11, marginTop: 2 }}>🏌️ {nP} jog</div>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
