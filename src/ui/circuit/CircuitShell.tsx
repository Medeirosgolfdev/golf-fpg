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
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../Toolbar";
import DetailHeader from "../DetailHeader";
import TournamentWeather from "../TournamentWeather";
import LoadingState from "../LoadingState";
import Counter from "../Counter";
import SexBadge from "../SexBadge";
import ExtLink from "../ExternalLink";
import { EscPill, RoundPill, ManuelPill, YearPill } from "../PillBadge";
import { IntlTournView } from "../IntlTournView";
import { ScorecardLeaderboard, type ScorecardRow } from "../ScorecardLeaderboard";
import { KidsLinkCtx } from "../KidsLink";
import { useKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { isManuelByName } from "../../constants/manuel";
import { tournamentAces } from "../../utils/aces";
import { flag } from "../../utils/flagUtils";
import SortableHdr from "../SortableHdr";
import { useSort } from "../../hooks/useSort";
import EmptyState from "../EmptyState";
import { normName } from "../../utils/normName";
import type { Tournament as FPGTournament, Player as FPGPlayer } from "../../data/fpgTypes";
import type {
  CircuitEntry, CircuitConfig, CircuitDivision, CircuitToggle,
  CircuitSectionKind, CircuitInscritoRow, CircuitDrawGroup,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────── //

/** Português? via flag do adaptador (_isPortuguese) ou nome do Manuel. */
function isPt(p: FPGPlayer): boolean {
  return !!p._isPortuguese || isManuelByName(p.name);
}

/** O Manuel jogou neste torneio? metadata (`hasManuel`) ou divisões eager.
 *  `undefined` = desconhecido (lazy sem metadata) → não filtra (mantém visível). */
function entryManuelState(e: CircuitEntry): boolean | undefined {
  if (e.hasManuel != null) return e.hasManuel;
  if (e.divisions) return e.divisions.some(d => !!d.results?.players.some(p => isManuelByName(p.name)));
  return undefined;
}
/** Há portugueses neste torneio? metadata (`hasPt`) ou divisões eager. */
function entryPtState(e: CircuitEntry): boolean | undefined {
  if (e.hasPt != null) return e.hasPt;
  if (e.divisions) return e.divisions.some(d => !!d.results?.players.some(p => isPt(p)));
  return undefined;
}
/** Houve hole-in-one neste torneio? Só calculável com divisões eager carregadas
 *  (páginas lazy só mostram o marcador depois de abrir o torneio, nos tabs). */
function entryHasAce(e: CircuitEntry): boolean {
  if (!e.divisions) return false;
  return e.divisions.some(d => !!d.results && tournamentAces(d.results.players).length > 0);
}

const TOGGLE_DEF: Record<CircuitToggle, { label: string; title: string }> = {
  manuel:      { label: "★ Manuel",      title: "Só o Manuel" },
  pt:          { label: "🇵🇹 PT",        title: "Só jogadores portugueses" },
  top10:       { label: "🏆 Top 10",      title: "Só os 10 melhores classificados" },
  veteranos:   { label: "✦ Veteranos",   title: "Jogadores presentes em muitos torneios" },
  results:     { label: "🏁 Com resultados", title: "Só torneios com leaderboard publicado" },
  regressados: { label: "↻ Regressados", title: "Jogou edição anterior do mesmo torneio" },
  subiram:     { label: "⬆ Subiram",     title: "Subiu de escalão face à última edição" },
};

// Labels/ordem alinhados com a barra de tabs da FPGPage (TournamentDetail):
// Inscrições → Draw → R1 → … → Resumo → 📋 Scorecards. Texto simples, sem ícones
// de secção (a FPG só usa ícone no "📋 Scorecards", que vem do IntlTournView).
const SECTION_DEF: Record<CircuitSectionKind, { label: string; icon: string }> = {
  results:   { label: "Resultados",  icon: "" },
  inscritos: { label: "Inscrições",  icon: "" },
  draw:      { label: "Draw",        icon: "" },
};
/** Label de secção com ícone opcional (sem espaço à frente quando não há ícone). */
const sectionLabel = (s: CircuitSectionKind): string => {
  const d = SECTION_DEF[s];
  return d.icon ? `${d.icon} ${d.label}` : d.label;
};

/** Secções disponíveis numa divisão (apenas as que têm dados). */
function divisionSections(d: CircuitDivision): CircuitSectionKind[] {
  const out: CircuitSectionKind[] = [];
  if (d.results || d.customResults) out.push("results");
  if (d.inscritos && d.inscritos.lists.some(l => l.players.length > 0)) out.push("inscritos");
  // "draw" aparece se a divisão traz um render próprio (DrawSaidaView/DrawTab — RFEG)
  // OU dados de draw genéricos não-vazios (DrawView do shell).
  if (d.renderDrawSection || (d.draw && Object.keys(d.draw.rounds).length > 0)) out.push("draw");
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
/** Parte numérica de uma data "DD/MM/YYYY" ou "YYYY-MM-DD". */
function parseDateParts(s?: string): { y: number; m: number; d: number } | null {
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}
/** Idade (anos) à data de referência (default: hoje). */
function ageAtRef(dob?: string, ref?: string): number | null {
  const b = parseDateParts(dob);
  if (!b) return null;
  const t = new Date();
  const r = parseDateParts(ref) ?? { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  let age = r.y - b.y;
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) age--;
  return age;
}
/** Ano de nascimento (primeiro grupo de 4 dígitos da dob). */
function birthYearOf(dob?: string): number | null {
  const m = dob ? /\d{4}/.exec(dob) : null;
  return m ? +m[0] : null;
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

  // Nota: os toggles "manuel" e "pt" filtram a LISTA de torneios (sidebar), não
  // os jogadores do leaderboard — ver entryManuelState/entryPtState. Aqui só os
  // filtros de jogador (top10/veteranos/regressados/subiram).
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

function InscritosView({ lists, dateRef }: { lists: NonNullable<CircuitDivision["inscritos"]>["lists"]; dateRef?: string }) {
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
      <InscritosTable rows={cur.players} dateRef={dateRef} />
    </div>
  );
}

type InscritosSortKey = "pos" | "name" | "escalao" | "sex" | "club" | "hcp" | "dob" | "status" | "country" | "fed";

// Há ≥1 jogador com país preenchido / licença? Só mostramos a coluna nesse caso
// (outras páginas-circuito podem não trazer estes campos).
function anyCountry(rows: CircuitInscritoRow[]): boolean { return rows.some(p => !!p.country); }
function anyFed(rows: CircuitInscritoRow[]): boolean { return rows.some(p => !!p.fed); }

function InscritosTable({ rows, dateRef }: { rows: CircuitInscritoRow[]; dateRef?: string }) {
  const { sortKey, sortDir, toggleSort } = useSort<InscritosSortKey>("pos");
  const [q, setQ] = useState("");
  // Layout alinhado com a aba Inscrições da FPG (AdmissionsTab): bandeira + sexo
  // ficam INLINE no nome (não em colunas próprias); colunas = ESC · Lic · Clube ·
  // HCP · Nasc. (ano + idade). Cada coluna opcional só aparece se ALGUM jogador
  // tiver esse dado (uma coluna 100% vazia fica oculta).
  const hasCountry = anyCountry(rows);
  const hasSex = rows.some(p => p.sex === "M" || p.sex === "F");
  const showFed = anyFed(rows);
  const showEsc = rows.some(p => !!p.escalao);
  const showClub = rows.some(p => !!p.club);
  const showHcp = rows.some(p => p.hcp != null);
  const showDob = rows.some(p => !!p.dob);
  const showStatus = rows.some(p => !!p.status);

  // Pesquisa por nome / clube / licença (igual à aba Inscrições da FPG).
  const term = normName(q);
  const filtered = useMemo(() => {
    if (!term) return rows;
    return rows.filter(p =>
      normName(p.name || "").includes(term) ||
      normName(p.club || "").includes(term) ||
      (p.fed || "").toLowerCase().includes(term)
    );
  }, [rows, term]);

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
        case "country": return (p.country || "").toUpperCase();
        case "fed": return (p.fed || "").toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filtered, sortKey, sortDir]);

  // Construído sobre o ScorecardLeaderboard (mesmo componente/estilo .sc-lb que
  // os resultados e o resto da app) — sem scorecard nem colunas de total. Layout
  // FPG: bandeira+sexo INLINE no nome; colunas ESC./Lic./Clube/HCP/Nasc. entram
  // como prefix cells e Estado como postScorecard; a ordenação é externa (useSort
  // acima), por isso passamos activeSortKey/Dir + SortableHdr nos headers custom.
  const scRows: ScorecardRow[] = sorted.map((p, i) => {
    const manuel = isManuelByName(p.name);
    const pt = !manuel && (p.country ? flag(p.country) === "🇵🇹" : false);
    return {
      key: i,
      pos: p.pos ?? i + 1,
      gross: 0,
      toPar: null,
      isManuel: manuel,
      isPortuguese: pt,
      sortPos: typeof p.pos === "number" ? p.pos : null,
      sortName: p.name,
      nameContent: (
        <span className="tourn-pname" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {hasCountry && p.country && (
            <span title={p.country} style={{ fontSize: "var(--fs-16)" }}>{flag(p.country)}</span>
          )}
          {p.name}
          {hasSex && p.sex && <SexBadge sex={p.sex} />}
          {manuel && <ManuelPill />}
        </span>
      ),
      prefixCells: (
        <>
          {showEsc && <td className="lb-esc">{p.escalao ? <EscPill esc={p.escalao} /> : <span className="muted">–</span>}</td>}
          {showFed && <td className="lb-fed">{p.fed || "–"}</td>}
          {showClub && <td className="lb-club" title={p.club || ""} style={{ textAlign: "left" }}>{p.club || "–"}</td>}
          {showHcp && <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "–"}</td>}
          {showDob && (() => {
            const yr = birthYearOf(p.dob);
            const age = ageAtRef(p.dob, dateRef);
            return (
              <td title={p.dob ? `${p.dob}${age != null ? ` (${age} anos à data)` : ""}` : ""}
                  style={{ textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>
                {yr != null ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <YearPill year={yr} />
                    {age != null && <span className="muted fs-10">({age})</span>}
                  </span>
                ) : <span className="muted">–</span>}
              </td>
            );
          })()}
        </>
      ),
      postScorecardCells: showStatus ? (
        <td style={{ textAlign: "center" }}>
          {p.status
            ? <span className="p p-sm p-muted">{p.status}</span>
            : <span className="muted">—</span>}
        </td>
      ) : undefined,
    };
  });

  const prefixHeaderCells = (
    <>
      {showEsc && <SortableHdr k="escalao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-esc">ESC.</SortableHdr>}
      {showFed && <SortableHdr k="fed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-fed">Lic.</SortableHdr>}
      {showClub && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-club">CLUBE</SortableHdr>}
      {showHcp && <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="lb-hcp">HCP</SortableHdr>}
      {showDob && <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ padding: "7px 8px", textAlign: "center" }}>Nasc.</SortableHdr>}
    </>
  );

  const filterBar = (
    <div className="detail-toolbar">
      <input className="input" value={q} onChange={e => setQ(e.target.value)}
        placeholder="Nome, clube, licença..." style={{ maxWidth: 240 }} />
      <span className="muted fs-12">
        {term ? `${filtered.length} de ${rows.length} inscritos` : `${rows.length} inscritos`}
      </span>
    </div>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={scRows}
      showScorecard={false}
      hideTotals
      filterBar={filterBar}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={
        showStatus ? <SortableHdr k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Estado</SortableHdr> : undefined
      }
      postScorecardColCount={showStatus ? 1 : 0}
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("name")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
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
            <div className="muted" style={{ fontSize: "var(--fs-13)" }}>
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
  /** Vista informativa activa (specialItem), resolvida pela página a partir da
   *  URL — torna estas vistas deep-linkáveis. Se `onSelectInfo` for fornecido, o
   *  infoView passa a ser controlado pela página (URL) em vez de estado interno. */
  selectedInfo?: string | null;
  onSelectInfo?: (key: string | null) => void;
}

export default function CircuitShell({ entries, config, loading, selectedId, onSelectEntry, selectedInfo, onSelectInfo }: CircuitShellProps) {
  const md = useMasterDetail();
  const { kidsMap } = useKidsLinkMap();

  // ── Estado de filtros ──────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [fYear, setFYear] = useState("all");
  const [fEsc, setFEsc] = useState("all");
  const [fSex, setFSex] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [fLiga, setFLiga] = useState("all");
  const [fIntl, setFIntl] = useState(false);
  const [toggles, setToggles] = useState<Set<CircuitToggle>>(
    () => new Set(config.filters?.defaultToggles ?? []),
  );
  /** Vista informativa activa (ex: Categorías/Federaciones) — null = detalhe normal.
   *  Controlada por URL quando a página passa `onSelectInfo`; senão estado interno. */
  const [infoViewLocal, setInfoViewLocal] = useState<string | null>(null);
  const infoView = onSelectInfo ? (selectedInfo ?? null) : infoViewLocal;
  const setInfo = (k: string | null) => { if (onSelectInfo) onSelectInfo(k); else setInfoViewLocal(k); };

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
  // Anos recentes como pills + um agrupador "<ANO" para os mais antigos (como a FPG).
  const YEAR_PILL_LIMIT = 5;
  const recentYears = useMemo(() => years.slice(0, YEAR_PILL_LIMIT), [years]);
  const oldCutoff = useMemo(() => (years.length > YEAR_PILL_LIMIT ? years[YEAR_PILL_LIMIT - 1] : null), [years]);
  const escaloes = useMemo(
    () => [...new Set(entries.flatMap(e =>
      e.escaloes?.length ? e.escaloes
      : e.divisions ? e.divisions.map(d => d.escalao)
      : (e.escalao ? [e.escalao] : [])))].sort(),
    [entries],
  );
  const sources = useMemo(
    () => [...new Set(entries.map(e => e.source).filter((s): s is string => !!s))].sort(),
    [entries],
  );
  const ligas = useMemo(
    () => [...new Set(entries.map(e => e.liga).filter((l): l is string => !!l))].sort(),
    [entries],
  );

  // ── Entries visíveis (após filtros de torneio) ──────────────────────
  const visible = useMemo(() => {
    const q = normName(search);
    return entries.filter(e => {
      if (flt.year && fYear !== "all") {
        if (fYear === "__old__") {
          if (e.year == null || oldCutoff == null || e.year >= oldCutoff) return false;
        } else if (String(e.year) !== fYear) {
          return false;
        }
      }
      if (flt.source && fSource !== "all" && e.source !== fSource) return false;
      if (flt.liga && fLiga !== "all" && e.liga !== fLiga) return false;
      if (flt.intl && fIntl && !e.intl) return false;
      if (toggles.has("manuel") && entryManuelState(e) === false) return false;
      if (toggles.has("pt") && entryPtState(e) === false) return false;
      if (toggles.has("results") && e.hasResults === false) return false;
      if (flt.escalao && fEsc !== "all" && !(e.escalao === fEsc || (e.escaloes ?? []).includes(fEsc) || (e.divisions ?? []).some(d => d.escalao === fEsc))) return false;
      if (flt.sex && fSex !== "all" && !(e.sex === fSex || e.sex === "Mixed" || (e.divisions ?? []).some(d => d.sex === fSex || d.sex === "Mixed"))) return false;
      if (q) {
        const hay = normName(`${e.name} ${e.course ?? ""}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, fYear, fEsc, fSex, fSource, fLiga, fIntl, oldCutoff, toggles, flt]);

  // ── Selecção do torneio activo ──────────────────────────────────────
  const [localId, setLocalId] = useState<string | null>(null);
  const wantId = selectedId ?? localId;
  const cur = useMemo(() => {
    const byId = wantId ? visible.find(e => e.id === wantId) ?? entries.find(e => e.id === wantId) : null;
    if (byId) return byId;
    // Default: primeiro com Manuel, senão primeiro visível.
    return visible.find(e => e.hasManuel) ?? visible[0] ?? null;
  }, [wantId, visible, entries]);

  // Deep-link automático do torneio seleccionado por default. Ao aterrar na página
  // base (ex: /rfeg sem id), o `cur` cai no default mas o URL ficava em /rfeg — sem
  // forma de partilhar/bookmark o torneio nem de saber qual está aberto. Reflectimos
  // o default no URL (/rfeg/{source}/{id}). O guard `selectedId == null` garante que
  // só dispara uma vez (depois do navigate, selectedId passa a estar definido).
  useEffect(() => {
    if (selectedId == null && !infoView && cur && onSelectEntry) onSelectEntry(cur);
  }, [selectedId, infoView, cur, onSelectEntry]);

  const selectEntry = (e: CircuitEntry) => {
    setLocalId(e.id);
    setInfo(null); // sair de qualquer vista informativa ao escolher torneio
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
    !!search || fYear !== "all" || fEsc !== "all" || fSex !== "all" || fSource !== "all"
    || fLiga !== "all" || fIntl || toggles.size > 0;
  const clearFilters = () => {
    setSearch(""); setFYear("all"); setFEsc("all"); setFSex("all"); setFSource("all");
    setFLiga("all"); setFIntl(false); setToggles(new Set());
  };

  if (loading) {
    return <div className="tourn-layout"><LoadingState message={config.loadingMessage ?? "A carregar…"} /></div>;
  }

  // ── Leaderboard com toggles aplicados ───────────────────────────────
  const resultsTourn = curDiv?.results
    ? applyToggles(curDiv.results, toggles, vetIndex, vetThreshold)
    : null;

  // ── Inscritos / Draw como tabs iniciais da barra única (estilo FPG) ──
  // Quando há resultados de ronda, fundem-se na barra do IntlTournView:
  //   Inscritos → Draw → R1 → R2 → … → Resumo → 📋 Scorecards
  // (em vez de viverem numa barra de secção separada por cima). Sem rondas
  // (customResults / só inscritos), ficam como barra de secção — ver render.
  const leadingTabs: { key: string; label: string; content: React.ReactNode }[] = [];
  if (curDiv && !curDiv.renderFull) {
    if (sections.includes("inscritos")) {
      leadingTabs.push({
        key: "inscritos",
        label: sectionLabel("inscritos"),
        content: curDiv.renderInscritos
          ? curDiv.renderInscritos()
          : (curDiv.inscritos ? <InscritosView lists={curDiv.inscritos.lists} dateRef={cur?.dateStart ?? cur?.dateEnd} /> : null),
      });
    }
    // Aba "Draw" agregada (sub-menu de rondas) — SÓ quando a divisão não fornece
    // `roundDraws` (draw por ronda intercalado com os resultados na barra principal).
    if (sections.includes("draw") && !(curDiv.roundDraws && curDiv.roundDraws.length)) {
      leadingTabs.push({
        key: "draw",
        label: sectionLabel("draw"),
        content: curDiv.renderDrawSection
          ? curDiv.renderDrawSection()
          : (curDiv.draw ? <DrawView rounds={curDiv.draw.rounds} /> : null),
      });
    }
  }

  // ── Stats para o header rico (estilo FPGPage) ───────────────────────
  const headerStats = (() => {
    const res = curDiv?.results;
    const players = res?.players ?? [];
    const nPlayers = res?.playerCount ?? players.length;
    const nRounds = res?.rounds ?? curDiv?.roundLabels?.length ?? 0;
    const parArr = players[0]?.par;
    const parTotal = players[0]?.parTotal ?? (parArr ? parArr.reduce((a, b) => a + b, 0) : 0);
    // Holes-in-one da divisão (sobre a lista consolidada, NÃO a filtrada por toggles).
    const aces = tournamentAces(players);
    return { nPlayers, nRounds, parTotal, aces };
  })();
  const curDateStr = fmtDateRange(cur?.dateStart, cur?.dateEnd);
  /** Links de ação do header (cur.links + sourceUrl como "Leaderboard oficial"). */
  const headerHasActions = !!(cur && (cur.sourceUrl || (cur.links && cur.links.length > 0) || (curDiv?.links && curDiv.links.length > 0)));

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
              style={{ width: 160, fontSize: "var(--fs-12)", padding: "3px 8px", marginLeft: 8 }}
              placeholder="🔍 Pesquisar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          {flt.year && years.length > 1 && (
            <>
              <ToolbarSep />
              {recentYears.map(y => (
                <button
                  key={y}
                  type="button"
                  className={"tourn-tab tourn-tab-sm" + (fYear === String(y) ? " active" : " tourn-tab-muted")}
                  onClick={() => setFYear(fYear === String(y) ? "all" : String(y))}
                  style={{ flexShrink: 0 }}
                >
                  {y}
                </button>
              ))}
              {oldCutoff != null && (
                <button
                  key="__old__"
                  type="button"
                  title={`Anteriores a ${oldCutoff}`}
                  className={"tourn-tab tourn-tab-sm" + (fYear === "__old__" ? " active" : " tourn-tab-muted")}
                  onClick={() => setFYear(fYear === "__old__" ? "all" : "__old__")}
                  style={{ flexShrink: 0 }}
                >
                  {`<${oldCutoff}`}
                </button>
              )}
              <ToolbarSep />
            </>
          )}
          {flt.escalao && (
            <select className="input" value={fEsc} onChange={e => setFEsc(e.target.value)} style={{ fontSize: "var(--fs-12)", padding: "3px 6px" }}>
              <option value="all">🏆 Escalão</option>
              {escaloes.map(es => <option key={es} value={es}>{es}</option>)}
            </select>
          )}
          {flt.sex && (
            <select className="input" value={fSex} onChange={e => setFSex(e.target.value)} style={{ fontSize: "var(--fs-12)", padding: "3px 6px" }}>
              <option value="all">M+F</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          )}
          {flt.source && sources.length > 1 && (
            <select className="input" value={fSource} onChange={e => setFSource(e.target.value)} style={{ fontSize: "var(--fs-12)", padding: "3px 6px" }}>
              <option value="all">Fonte</option>
              {sources.map(s => <option key={s} value={s}>{config.sourceLabels?.[s] ?? s}</option>)}
            </select>
          )}
          {flt.liga && ligas.length > 1 && (
            <select className="input" value={fLiga} onChange={e => setFLiga(e.target.value)} style={{ fontSize: "var(--fs-12)", padding: "3px 6px" }}>
              <option value="all">🇫🇷 Liga</option>
              {ligas.map(l => <option key={l} value={l}>{config.ligaLabels?.[l] ?? l}</option>)}
            </select>
          )}
          {flt.intl && (
            <button
              type="button"
              title={fIntl ? "A mostrar só Internationaux. Clica para ver todos." : "Filtrar só torneios Internationaux/International"}
              className={`tourn-tab tourn-tab-sm${fIntl ? " active" : ""}`}
              onClick={() => setFIntl(v => !v)}
            >
              INTL
            </button>
          )}

          {/* Menu INFO — vistas informativas (categorias, federações, ...) */}
          {!!config.specialItems?.length && (
            <select
              className="input"
              value={infoView ?? ""}
              onChange={e => setInfo(e.target.value || null)}
              style={{ fontSize: "var(--fs-12)", padding: "3px 6px" }}
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
              <EmptyState message="Sem torneios para mostrar." />
            ) : divsLoading ? (
              <LoadingState message={config.loadingMessage ?? "A carregar dados…"} />
            ) : curDiv ? (
              <>
                {/* Tabs de escalão — ACIMA do título (estilo Nacional FPG): mesmos
                    botões pill `.tourn-tab tourn-tab-sm`, "(N jog)", alinhados à
                    esquerda com o título e sem linha divisória. */}
                {curDivisions.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {curDivisions.map(d => {
                      const active = d.key === curDiv.key;
                      const nP = d.results?.players.length ?? 0;
                      const nAces = d.results ? tournamentAces(d.results.players).length : 0;
                      return (
                        <button
                          key={d.key}
                          className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                          onClick={() => setDivKey(d.key)}
                        >
                          {d.tabLabel || d.escalao}
                          {nP > 0 && (
                            <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>({nP} jog)</span>
                          )}
                          {d.hasManuel && <span style={{ color: "var(--color-good)" }}> ★</span>}
                          {nAces > 0 && (
                            <span title={`${nAces} hole-in-one neste escalão`}> 🕳️</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {(!curDiv.renderFull || curDiv.renderFullKeepHeader) && (
                <DetailHeader
                  title={cur.name}
                  actions={headerHasActions ? (
                    <>
                      {(cur.links ?? []).map(lnk => (
                        <ExtLink key={lnk.url} href={lnk.url} className="tourn-ext-link" title={lnk.title ?? lnk.label}>
                          {lnk.icon ? `${lnk.icon} ` : ""}{lnk.label} ↗
                        </ExtLink>
                      ))}
                      {(curDiv.links ?? []).map(lnk => (
                        <ExtLink key={lnk.url} href={lnk.url} className="tourn-ext-link" title={lnk.title ?? lnk.label}>
                          {lnk.icon ? `${lnk.icon} ` : ""}{lnk.label} ↗
                        </ExtLink>
                      ))}
                      {cur.sourceUrl && (
                        <ExtLink href={cur.sourceUrl} className="tourn-ext-link" title="Leaderboard oficial">
                          🔗 Leaderboard oficial ↗
                        </ExtLink>
                      )}
                    </>
                  ) : undefined}
                  sub={
                    <>
                      {cur.course && <span className="muted">📍 {cur.course}</span>}
                      {curDateStr && <span className="muted ml-8">{curDateStr}</span>}
                      {cur.federation && <span className="muted ml-8">🏛️ {cur.federation}</span>}
                      <span className="gap-4 ml-8" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
                        {headerStats.nPlayers > 0 && (
                          <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                            {headerStats.nPlayers} jog
                          </span>
                        )}
                        {headerStats.nRounds > 1 && <RoundPill nR={headerStats.nRounds} />}
                        {headerStats.parTotal > 0 && (
                          <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                            Par {headerStats.parTotal}
                          </span>
                        )}
                        {headerStats.aces.length > 0 && (
                          <span
                            className="p p-sm"
                            style={{ background: "var(--score-eagle, #f59e0b)", color: "#fff", border: "1px solid var(--score-eagle, #f59e0b)" }}
                            title={headerStats.aces
                              .map(a => `${a.name || "?"} — buraco ${a.hole} (par ${a.par})${a.round ? ` · R${a.round}` : ""}`)
                              .join("\n")}
                          >
                            🕳️ {headerStats.aces.length} hole-in-one
                          </span>
                        )}
                        {(curDiv.tabLabel || curDiv.escalao) && <EscPill esc={curDiv.tabLabel || curDiv.escalao} />}
                        {curDiv.sex && <SexBadge sex={curDiv.sex === "Mixed" ? "M" : curDiv.sex} />}
                        {curDiv.sex === "Mixed" && <SexBadge sex="F" />}
                        {(cur.hcpLimit?.men != null || cur.hcpLimit?.women != null) && (
                          <span className="muted" style={{ marginLeft: 4 }}>
                            {cur.hcpLimit?.men != null && `Hcp M ≤ ${cur.hcpLimit.men} `}
                            {cur.hcpLimit?.women != null && `Hcp F ≤ ${cur.hcpLimit.women}`}
                          </span>
                        )}
                      </span>
                    </>
                  }
                >
                  <TournamentWeather
                    course={cur.course}
                    startDate={cur.dateStart}
                    endDate={cur.dateEnd}
                    rounds={headerStats.nRounds}
                  />
                </DetailHeader>
                )}

                {/* Conteúdo do torneio.
                    • Com resultados de ronda → barra ÚNICA estilo FPG: as tabs
                      Inscritos/Draw entram como `leadingTabs` ANTES de R1, na mesma
                      barra do IntlTournView (Inscritos → Draw → R1 → … → Resumo).
                    • Sem rondas (customResults / só inscritos) → barra de secção
                      simples (já era plana, sem aninhamento). */}
                {curDiv.renderFull && curDiv.renderFull()}
                {!curDiv.renderFull && (resultsTourn ? (
                  <IntlTournView
                    tournament={resultsTourn}
                    scOptions={curDiv.scOptions ?? {}}
                    roundLabels={curDiv.roundLabels}
                    siLabel={curDiv.siLabel}
                    evoCols={curDiv.evoCols}
                    accHeader={curDiv.accHeader}
                    roundExtra={curDiv.roundExtra}
                    accExtra={curDiv.accExtra}
                    renderAccSection={curDiv.renderAccSection}
                    renderRoundSection={curDiv.renderRoundSection}
                    leadingTabs={leadingTabs.length ? leadingTabs : undefined}
                    roundDraws={curDiv.roundDraws}
                  />
                ) : (
                  <>
                    {/* Sem rondas: barra de secção (Resultados custom / Inscritos / Draw) */}
                    {sections.length > 1 && (
                      <div className="tab-bar" style={{ marginBottom: 8 }}>
                        {sections.map(s => (
                          <button
                            key={s}
                            className={`tab-under${curSection === s ? " active" : ""}`}
                            onClick={() => setSection(s)}
                          >
                            {sectionLabel(s)}
                          </button>
                        ))}
                      </div>
                    )}
                    {curSection === "results" && curDiv.customResults}
                    {curSection === "inscritos" && (
                      curDiv.renderInscritos
                        ? curDiv.renderInscritos()
                        : curDiv.inscritos && <InscritosView lists={curDiv.inscritos.lists} dateRef={cur?.dateStart ?? cur?.dateEnd} />
                    )}
                    {curSection === "draw" && (
                      curDiv.renderDrawSection
                        ? curDiv.renderDrawSection()
                        : curDiv.draw && <DrawView rounds={curDiv.draw.rounds} />
                    )}
                  </>
                ))}
              </>
            ) : (
              <EmptyState message="Sem dados para este torneio." />
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
    // Chave de ordenação por data (mais recente primeiro) dentro de cada ano.
    // Sem isto a sidebar saía na ordem crua de `entries` (ex: as entradas
    // agrupadas no topo, datas baralhadas). Usa dateEnd → dateStart (ISO ou
    // DD/MM/YYYY) e desempata pelo nome.
    const dateKey = (e: CircuitEntry): string => {
      const s = e.dateEnd ?? e.dateStart ?? "";
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
      const dmy = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
      if (dmy) return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
      return "00000000";
    };
    const byDateDesc = (a: CircuitEntry, b: CircuitEntry): number => {
      const d = dateKey(b).localeCompare(dateKey(a));
      return d !== 0 ? d : (a.name || "").localeCompare(b.name || "");
    };
    return keys.map(k => {
      const items = byL1.get(k)!;
      const years = [...new Set(items.map(e => e.year))].sort((a, b) => (b ?? -1) - (a ?? -1));
      return { key: k, years: years.map(y => ({ year: y, items: items.filter(e => e.year === y).sort(byDateDesc) })) };
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
              <div className="sidebar-year-label" style={{ padding: "2px 10px", fontSize: "var(--fs-10)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 4, background: config.color, color: config.textColor ?? "#fff" }}>
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
                const accent = srcColor ?? config.color ?? "var(--accent)";
                return (
                  <div
                    key={e.id}
                    role="button" tabIndex={0}
                    className={`course-item ${active ? "active" : ""}`}
                    onClick={() => onSelect(e)}
                    onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") onSelect(e); }}
                    style={{ borderLeft: `4px solid ${accent}`, borderRadius: "0 6px 6px 0" }}
                  >
                    {/* Linha 1: nome */}
                    <div className="course-item-name" style={{ fontSize: "var(--fs-12)", fontWeight: active ? 700 : 500, lineHeight: 1.3 }}>
                      {e.name}
                      {e.hasManuel && <ManuelPill />}
                      {entryHasAce(e) && <span title="Hole-in-one neste torneio"> 🕳️</span>}
                    </div>

                    {/* Linha 2: campo */}
                    {e.course && (
                      <div style={{ fontSize: "var(--fs-12)", color: "var(--text-2)", fontWeight: 500, marginTop: 3 }}>
                        📍 {e.course.length > 50 ? e.course.slice(0, 50) + "…" : e.course}
                      </div>
                    )}

                    <div style={{ height: ".5px", background: "var(--border-light,rgba(0,0,0,.08))", margin: "4px 0" }} />

                    {/* Linha 3: pills */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", margin: "3px 0" }}>
                      {e.tcode && <span className="p p-sm p-muted">{e.tcode}</span>}
                      {/* Escalão/sexo só fazem sentido quando há UM escalão; com vários
                          mostrar apenas "N esc." (senão parece que só tem o 1º). */}
                      {nDiv <= 1 && esc && <EscPill esc={esc} />}
                      {nDiv <= 1 && sex && <SexBadge sex={sex === "Mixed" ? "M" : sex} />}
                      {nDiv <= 1 && sex === "Mixed" && <SexBadge sex="F" />}
                      {nDiv > 1 && <span className="p p-sm p-muted">{nDiv} esc.</span>}
                      {nR > 1 && <RoundPill nR={nR} />}
                    </div>

                    <div style={{ height: ".5px", background: "var(--border-light,rgba(0,0,0,.08))", margin: "4px 0" }} />

                    {/* Linha 4: data · fonte (ficheiro) · nº jog */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)", flexShrink: 0 }}>
                        {dateStr ? `📅 ${dateStr}` : "—"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        {srcLabel && (
                          <span className="chip" title={`Fonte: ${srcLabel}`} style={{ fontSize: "var(--fs-9)", padding: "1px 6px", borderRadius: 8, background: srcColor, color: fgFor(srcColor) }}>{srcLabel}</span>
                        )}
                        {nP > 0 && <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>{nP} jog</span>}
                      </div>
                    </div>
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
