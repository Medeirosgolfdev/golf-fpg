/**
 * src/ui/circuit/CircuitShell.tsx
 *
 * Página-mãe dos circuitos internacionais. Recebe `entries[] + config`
 * (ver ./types.ts) e desenha TODA a navegação/filtros/aspecto comum:
 *
 *   • master-detail (sidebar agrupada por ano / série / fonte)
 *   • toolbar de filtros (pesquisa, ano, escalão, sexo, fonte) + toggles
 *     rápidos (★ Manuel, 🇵🇹 PT, 🏆 Top 10, ✦ Veteranos, ↻ Regressados, ⬆ Subiram)
 *   • detalhe: DetailHeader + tabs de escalão + a barra ÚNICA do <IntlTournView>
 *     (o TournamentDetail da FPG): Inscrições → Draw → R1 → … → Resumo →
 *     📋 Scorecards → Época → Edições anteriores → Scout
 *
 * Cada página de circuito (RFEG, France, England, GJGL, MAJOR) passa a ser
 * apenas: loader + adaptador → CircuitShell. Sem layout próprio.
 *
 * UM SÓ CAMINHO (02/11/2026): com ou sem cartões, tudo passa pelo
 * IntlTournView. Só com totais, a prova vai como prova sem buraco a buraco
 * (`totalsDivisionView`): o mesmo Resumo, sem Scorecards — já não há barra de
 * secções à parte nem tabela de totais própria.
 */

import { escalaoFilterOptions, escaloesCanon } from "../../data/model/escalao";
import { totalsDivisionView } from "./divisionPieces";
import ManuelResultPills from "../ManuelResultPills";
import AdmissionsTab, { type AdmissionsExtraCol } from "../AdmissionsTab";
import type { FpgAdmissions } from "../../data/nacional2026Loader";
import React, { useMemo, useState, useEffect, useCallback, useContext } from "react";
import { CircuitPastEditionsTab, divisionTournament } from "./pastEditions";
import { ScoutDoCircuito } from "./ScoutProva";
import { CircuitPastScorecardsTab } from "./PastScorecardsTab";
import { CircuitRankingView } from "./CircuitRanking";
import { useMasterDetail } from "../../hooks/useMasterDetail";
import SidebarToggle from "../SidebarToggle";
import SidebarSectionTitle from "../SidebarSectionTitle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../Toolbar";
import { CircuitToolbarSlotCtx } from "./toolbarSlot";
import DetailHeader from "../DetailHeader";
import TournamentWeather from "../TournamentWeather";
import LoadingState from "../LoadingState";
import Counter from "../Counter";
import SexBadge from "../SexBadge";
import ExtLink from "../ExternalLink";
import { EscPill, RoundPill, ManuelPill } from "../PillBadge";
import { IntlTournView } from "../IntlTournView";
import { CampoDoCircuito } from "../../pages/fpg/fpgCourseTab";
import { KidsLinkCtx } from "../KidsLink";
import { useKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { findManuelNaProva } from "../../constants/manuel";
import { tournamentAces } from "../../utils/aces";
import MatchplayView from "./MatchplayView";
import { entryManuelState, entryPtState, entryHasAce } from "./entryState";
import EmptyState from "../EmptyState";
import { normName, vetKey } from "../../utils/normName";
import { classificarPorTotal, voltasComCartao } from "../../utils/classificacao";
import { monthLabel, fmtDateRangePt } from "../../utils/format";
import { textOnColor } from "../../utils/teeColors";
import SidebarCard from "../SidebarCard";
import type { Tournament as FPGTournament } from "../../data/fpgTypes";
import MasterDetail from "../MasterDetail";
import type {
  CircuitEntry, CircuitConfig, CircuitDivision, CircuitToggle,
  CircuitSectionKind,
} from "./types";
import ClearButton from "../ClearButton";
import TabRow from "../TabRow";
import SearchInput from "../SearchInput";
import SexSelect from "../SexSelect";
import Select from "../Select";
import { ToggleChip } from "../FilterField";
import { toggleSet } from "../../utils/mathUtils";
import { Tint } from "../DataStyle";

// ── Helpers ─────────────────────────────────────────────────────────── //

/** Ligas de um entry (lista multi-liga quando existe, senão a principal). */
function entryLigas(e: CircuitEntry): string[] {
  return e.ligas?.length ? e.ligas : e.liga ? [e.liga] : [];
}

/** Chave de ordenação por data (YYYYMMDD; ISO ou DD/MM/YYYY; sem data → 0). */
function entryDateKey(e: CircuitEntry): string {
  const s = e.dateEnd ?? e.dateStart ?? "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const dmy = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
  return "00000000";
}
/** Mais recente primeiro (desempate por nome) — a ordem da sidebar. */
function entriesByDateDesc(a: CircuitEntry, b: CircuitEntry): number {
  const d = entryDateKey(b).localeCompare(entryDateKey(a));
  return d !== 0 ? d : (a.name || "").localeCompare(b.name || "");
}

/** Pills 🗺️ de liga com cap — as qualificações nacionais FFG aparecem nas 22
 *  ligas todas; mostramos `max` + "+N" com as restantes no tooltip. */
function LigaPills({ entry, config, max, className }: {
  entry: CircuitEntry; config: CircuitConfig; max: number; className?: string;
}) {
  const cls = "p p-sm p-muted" + (className ? " " + className : "");
  const names = entryLigas(entry).map(l => config.ligaLabels?.[l] ?? l);
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const rest = names.slice(max);
  return (
    <>
      {shown.map(n => (
        <span key={n} className={cls} title={`Liga: ${n}`}>🗺️ {n}</span>
      ))}
      {rest.length > 0 && (
        <span className={cls} title={`Também em: ${rest.join(", ")}`}>
          +{rest.length}
        </span>
      )}
    </>
  );
}
/** Sem edições irmãs (referência estável para o Scout). */
const SEM_IRMAS: CircuitEntry[] = [];

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
  // «Resumo», como nas provas com cartões (desenho próprio de página sem resultados).
  results:   { label: "Resumo",      icon: "" },
  inscritos: { label: "Inscrições",  icon: "" },
  draw:      { label: "Draw",        icon: "" },
  matchplay: { label: "Match Play",  icon: "" },
};
/** Label de secção com ícone opcional (sem espaço à frente quando não há ícone). */
const sectionLabel = (s: CircuitSectionKind): string => {
  const d = SECTION_DEF[s];
  return d.icon ? `${d.icon} ${d.label}` : d.label;
};

/** Jogadores totais de um entry (metadado leve, ou soma das divisões carregadas). */
function entryPlayerCount(e: CircuitEntry): number {
  if (e.playerCount != null) return e.playerCount;
  return (e.divisions ?? []).reduce((acc, d) => acc + (d.results?.players.length ?? 0), 0);
}


// ── Filtros de toggles aplicados ao leaderboard ───────────────────────

/** Os toggles que filtram JOGADORES (os outros filtram a lista de torneios). */
const PLAYER_TOGGLES: CircuitToggle[] = ["top10", "veteranos", "regressados", "subiram"];

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
    players = players.filter(p => (vetIndex.get(vetKey(p.name)) ?? 0) >= vetThreshold);
  }
  if (active.has("regressados")) {
    players = players.filter(p => (p as unknown as { _regressado?: boolean })._regressado === true);
  }
  if (active.has("subiram")) {
    players = players.filter(p => (p as unknown as { _subiu?: boolean })._subiu === true);
  }
  if (active.has("top10")) {
    // Top 10 por gross acumulado (robusto mesmo sem campo pos fiável).
    // Só entre quem tem TODAS as voltas e cartão: quem falhou o cut soma menos
    // e ficava à frente do vencedor (10/11/2026) — a regra única de
    // `utils/classificacao.ts`.
    const { ordenados } = classificarPorTotal(
      players,
      p => voltasComCartao(p.roundScores),
      p => (typeof p.grossTotal === "number" ? p.grossTotal : null),
    );
    const top = new Set(ordenados.slice(0, 10));
    players = players.filter(p => top.has(p));
  }

  return { ...t, players };
}

// ── Inscrições: o AdmissionsTab partilhado (o mesmo da FPG/Drive) ──
function DivisionAdmissions({ admissions, date, extraCols }: { admissions: FpgAdmissions; date?: string; extraCols?: AdmissionsExtraCol[] }) {
  const ps = admissions.players ?? [];
  // VAC/Registo/Status só quando a fonte os tem (a FPG tem; Espanha não).
  const hidePostCols = !ps.some(p => p.vac != null || p.dataInscricao);
  // Circuitos de fora: a inscrição só traz nome e cidade — o Kids 2 completa.
  // Sem VAC na fonte (Itália: só a data de inscrição) → sem a coluna vazia.
  const hideCols = ps.some(p => p.vac != null) ? undefined : { vac: true };
  return <AdmissionsTab admissions={admissions} date={date} hidePostCols={hidePostCols} hideCols={hideCols} extraCols={extraCols} kidsCols />;
}

// ── Componente principal ──────────────────────────────────────────────

export interface CircuitShellProps {
  entries: CircuitEntry[];
  config: CircuitConfig;
  loading?: boolean;
  /**
   * Pool COMPLETO (não filtrado) para calcular as edições irmãs da tab "Edições
   * anteriores". Quando a página filtra `entries` (ex: a DrivePage mostra só um
   * ano/série/região de cada vez), as irmãs de outros anos/etapas ficariam de
   * fora. Passando aqui o conjunto integral, a tab compara todas as edições —
   * incl. as etapas que se repetem no MESMO ano (Drive) e os anos anteriores.
   * Omitido → usa as próprias `entries` (comportamento das páginas lazy).
   */
  pastEditionsPool?: CircuitEntry[];
  /** ID seleccionado (resolvido pela página a partir da URL). Opcional. */
  selectedId?: string;
  /** Chamado ao seleccionar um torneio (a página navega/actualiza URL). */
  onSelectEntry?: (entry: CircuitEntry) => void;
  /** Vista informativa activa (specialItem), resolvida pela página a partir da
   *  URL — torna estas vistas deep-linkáveis. Se `onSelectInfo` for fornecido, o
   *  infoView passa a ser controlado pela página (URL) em vez de estado interno. */
  selectedInfo?: string | null;
  onSelectInfo?: (key: string | null) => void;
  /** Divisão (escalão) seleccionada, resolvida pela página a partir da URL. Só
   *  tem efeito com `onSelectDivision` — aí a divisão activa passa a ser
   *  controlada pela página (para deep-links por escalão, ex.: FPG, onde cada
   *  escalão é um tcode próprio no URL). Sem `onSelectDivision` a divisão activa
   *  é estado interno (comportamento das restantes páginas). */
  selectedDivKey?: string;
  onSelectDivision?: (entry: CircuitEntry, div: CircuitDivision) => void;
  /** Render custom do item da sidebar. Quando fornecido, a `CircuitSidebar` usa-o
   *  em vez do card interno — a página assume TODO o item (pills, click, href),
   *  recebendo `active` e o `onSelect` do shell (para preservar fecho-mobile +
   *  selecção interna). Usado pela FPG para reutilizar o `TournSidebarItem` e ter
   *  paridade total com o render clássico. Sem esta prop, o card default é usado
   *  (comportamento das restantes páginas). O agrupamento/divisórias da sidebar
   *  continuam a ser do shell. */
  renderSidebarItem?: (entry: CircuitEntry, ctx: { active: boolean; onSelect: () => void }) => React.ReactNode;
}

export default function CircuitShell({ entries, config, loading, pastEditionsPool, selectedId, onSelectEntry, selectedInfo, onSelectInfo, selectedDivKey, onSelectDivision, renderSidebarItem }: CircuitShellProps) {
  const slot = useContext(CircuitToolbarSlotCtx);
  const md = useMasterDetail();
  const { kidsMap } = useKidsLinkMap();

  // ── Estado de filtros ──────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [fYear, setFYear] = useState(() => {
    const d = config.filters?.defaultYear;
    return d === "current" ? String(new Date().getFullYear()) : (d ?? "all");
  });
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
          const k = vetKey(p.name);
          if (!seen.has(k)) { seen.add(k); m.set(k, (m.get(k) ?? 0) + 1); }
        }
      }
    }
    return m;
  }, [entries, config.veteranIndex]);

  // ── Filtros de JOGADOR da barra (Top 10 · Veteranos · Regressados · Subiram)
  // como função estável: o mesmo torneio dá sempre o mesmo objecto filtrado
  // (não se refaz o leaderboard a cada render) e vai também às divisões com
  // `renderFull` (/FPG, /major), onde os chips não faziam nada (10/11/2026).
  const playerFilter = useMemo(() => {
    if (!PLAYER_TOGGLES.some(t => toggles.has(t))) return undefined;
    const feitos = new WeakMap<FPGTournament, FPGTournament>();
    return (t: FPGTournament): FPGTournament => {
      let r = feitos.get(t);
      if (!r) { r = applyToggles(t, toggles, vetIndex, vetThreshold); feitos.set(t, r); }
      return r;
    };
  }, [toggles, vetIndex, vetThreshold]);

  // ── Opções dos dropdowns ────────────────────────────────────────────
  const years = useMemo(
    () => [...new Set(entries.map(e => e.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
    [entries],
  );
  // Anos recentes como pills + um agrupador "<ANO" para os mais antigos (como a FPG).
  const YEAR_PILL_LIMIT = 5;
  const recentYears = useMemo(() => years.slice(0, YEAR_PILL_LIMIT), [years]);
  const oldCutoff = useMemo(() => (years.length > YEAR_PILL_LIMIT ? years[YEAR_PILL_LIMIT - 1] : null), [years]);
  // Filtro «Escalão» pela tabela única (22/10/2026): «Sub 10», «Sub-10», «U10»
  // e «S10» são UMA opção; nomes sem escalão não criam uma opção vazia.
  const entryEscNames = (e: CircuitEntry): string[] =>
    e.escaloes?.length ? e.escaloes
    : e.divisions ? e.divisions.map(d => d.escalao)
    : (e.escalao ? [e.escalao] : []);
  const escaloes = useMemo(
    () => escalaoFilterOptions(entries.flatMap(e => [...entryEscNames(e), ...(e.divisions ?? []).map(d => d.escalao)]), config.escalaoSource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, config.escalaoSource],
  );
  const sources = useMemo(
    () => [...new Set(entries.map(e => e.source).filter((s): s is string => !!s))].sort(),
    [entries],
  );
  const ligas = useMemo(
    () => [...new Set(entries.flatMap(entryLigas))].sort(),
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
      if (flt.liga && fLiga !== "all" && !entryLigas(e).includes(fLiga)) return false;
      if (flt.intl && fIntl && !e.intl) return false;
      if (toggles.has("manuel") && entryManuelState(e) === false) return false;
      if (toggles.has("pt") && entryPtState(e) === false) return false;
      if (toggles.has("results") && e.hasResults === false) return false;
      if (flt.escalao && fEsc !== "all"
        && ![...entryEscNames(e), ...(e.divisions ?? []).map(d => d.escalao)]
          .some(n => escaloesCanon(n, config.escalaoSource).includes(fEsc))) return false;
      if (flt.sex && fSex !== "all" && !(e.sex === fSex || e.sex === "Mixed" || (e.divisions ?? []).some(d => d.sex === fSex || d.sex === "Mixed"))) return false;
      if (q) {
        const hay = normName(`${e.name} ${e.course ?? ""}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, fYear, fEsc, fSex, fSource, fLiga, fIntl, oldCutoff, toggles, flt, config.escalaoSource]);

  // ── Selecção do torneio activo ──────────────────────────────────────
  const [localId, setLocalId] = useState<string | null>(null);
  const wantId = selectedId ?? localId;
  const cur = useMemo(() => {
    const byId = wantId ? visible.find(e => e.id === wantId) ?? entries.find(e => e.id === wantId) : null;
    if (byId) return byId;
    // Default: o torneio do topo da sidebar — o mais RECENTE por data (ou o mais
    // próximo, com `sidebarOrder: "asc"`). Antes era "primeiro com Manuel, senão
    // primeiro na ordem crua de entries", que podia aterrar num torneio antigo
    // qualquer conforme a ordem de build das fontes.
    const sorted = [...visible].sort(entriesByDateDesc);
    return (config.sidebarOrder === "asc" ? sorted[sorted.length - 1] : sorted[0]) ?? null;
  }, [wantId, visible, entries, config.sidebarOrder]);

  // Deep-link automático do torneio seleccionado por default. Ao aterrar na página
  // base (ex: /rfeg sem id), o `cur` cai no default mas o URL ficava em /rfeg — sem
  // forma de partilhar/bookmark o torneio nem de saber qual está aberto. Reflectimos
  // o default no URL (/rfeg/{source}/{id}). O guard `selectedId == null` garante que
  // só dispara uma vez (depois do navigate, selectedId passa a estar definido).
  // ⚠ Nunca durante `loading`: os hooks correm antes do early-return de loading,
  // e com as entries ainda a meio o default seria um torneio qualquer — o
  // navigate reescrevia o deep-link que a página ainda estava a resolver.
  useEffect(() => {
    if (loading) return;
    if (selectedId == null && !infoView && cur && onSelectEntry) onSelectEntry(cur);
  }, [loading, selectedId, infoView, cur, onSelectEntry]);

  const selectEntry = (e: CircuitEntry) => {
    setLocalId(e.id);
    setInfo(null); // sair de qualquer vista informativa ao escolher torneio
    md.onSelect();
    onSelectEntry?.(e);
  };

  const curInfoItem = infoView ? config.specialItems?.find(si => si.key === infoView) : undefined;
  // Capacidade «ranking» (22/10/2026): vista do shell com as linhas calculadas dos
  // torneios visíveis (a página dá linhas e colunas; a tabela é a RankingTable).
  const ranking = config.ranking;
  const rankingOpen = !!ranking && infoView === ranking.key;
  const rankingViewCtx = useMemo(() => ({ entries: visible, scope: "view" as const }), [visible]);

  // ── Carregamento (lazy) das divisões do torneio seleccionado ────────
  // A cache guarda o carregador que a encheu: quando a página entrega outro
  // (os dados mudaram — ex.: na /uskids os resultados e os draws chegam depois
  // dos inscritos), recarrega-se.
  const [divCache, setDivCache] = useState<Record<string, { src: unknown; divs: CircuitDivision[] }>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const curId = cur?.id ?? null;
  const curLoader = cur?.loadDivisions;

  useEffect(() => {
    if (!cur || cur.divisions || !cur.loadDivisions || divCache[cur.id]?.src === cur.loadDivisions) return;
    let alive = true;
    const src = cur.loadDivisions;
    setLoadingId(cur.id);
    src()
      .then(divs => { if (alive) setDivCache(prev => ({ ...prev, [cur.id]: { src, divs } })); })
      .catch(() => { if (alive) setDivCache(prev => ({ ...prev, [cur.id]: { src, divs: [] } })); })
      .finally(() => { if (alive) setLoadingId(id => (id === cur.id ? null : id)); });
    return () => { alive = false; };
  }, [curId, curLoader]); // eslint-disable-line react-hooks/exhaustive-deps

  const curDivisions: CircuitDivision[] = cur ? (cur.divisions ?? divCache[cur.id]?.divs ?? []) : [];
  const divsLoading = !!cur && curDivisions.length === 0 && loadingId === cur.id;

  // ── Divisão (escalão) activa ────────────────────────────────────────
  // Controlada pela página quando há `onSelectDivision` (deep-link por escalão —
  // FPG); caso contrário estado interno (mesmo padrão de `infoView`).
  const divControlled = !!onSelectDivision;
  const [divKey, setDivKey] = useState<string | null>(null);
  const effDivKey = divControlled ? (selectedDivKey ?? null) : divKey;
  const selectDiv = useCallback((entry: CircuitEntry, d: CircuitDivision) => {
    if (divControlled) onSelectDivision!(entry, d);
    else setDivKey(d.key);
  }, [divControlled, onSelectDivision]);
  const curDiv = useMemo(() => {
    if (!cur || curDivisions.length === 0) return null;
    const byKey = effDivKey ? curDivisions.find(d => d.key === effDivKey) : null;
    if (byKey) return byKey;
    const byDefault = cur.defaultDivKey ? curDivisions.find(d => d.key === cur.defaultDivKey) : null;
    return byDefault ?? curDivisions.find(d => d.hasManuel) ?? curDivisions[0] ?? null;
  }, [cur, curDivisions, effDivKey]);
  // Reset divisão ao mudar de torneio (só no modo interno).
  useEffect(() => { if (!divControlled) setDivKey(null); }, [curId, divControlled]);
  // Deep-link da divisão default: quando a página controla mas o URL ainda não
  // aponta ao escalão mostrado (aterragem no grupo sem escalão, ou escalão
  // stale), reflectir o escalão activo no URL. Só dispara quando divergem — a
  // página deve guardar o navigate com um teste de location (evita loop).
  useEffect(() => {
    if (loading) return; // idem ao default do torneio: não reescrever o URL a meio do carregamento
    if (divControlled && cur && curDiv && curDiv.key !== selectedDivKey) {
      onSelectDivision!(cur, curDiv);
    }
  }, [divControlled, cur, curDiv, selectedDivKey, onSelectDivision]);

  const toggle = (t: CircuitToggle) => setToggles((prev) => toggleSet(prev, t));

  const hasActiveFilters =
    !!search || fYear !== "all" || fEsc !== "all" || fSex !== "all" || fSource !== "all"
    || fLiga !== "all" || fIntl || toggles.size > 0;
  const clearFilters = () => {
    setSearch(""); setFYear("all"); setFEsc("all"); setFSex("all"); setFSource("all");
    setFLiga("all"); setFIntl(false); setToggles(new Set());
  };

  // ── UM SÓ CAMINHO (02/11/2026): todas as divisões passam pelo IntlTournView
  // (o TournamentDetail da FPG), com ou sem cartões — pedido da Mariana: «os 2
  // caminhos não podem passar a um caminho só?». A barra é sempre a mesma:
  //   Inscrições → Draw → R1 → … → Resumo → 📋 Scorecards → Época → Edições → Scout
  // Só com totais (EGR, WAGR, GJGL, Liguillas NextCaddy, LGPIDF): a prova é
  // convertida numa prova sem buraco a buraco (`_noHbh`) e desenhada pelo MESMO
  // Resumo — sem o separador Scorecards.
  const totalsView = useMemo(() => (curDiv && !curDiv.renderFull && !curDiv.results && cur
    ? totalsDivisionView(curDiv, { name: cur.name, date: cur.dateStart, campo: cur.course })
    : null), [curDiv, cur]);

  // ── Leaderboard com toggles aplicados ───────────────────────────────
  const baseTourn = curDiv?.results ?? totalsView?.tournament ?? null;
  const resultsTourn = baseTourn && playerFilter ? playerFilter(baseTourn) : baseTourn;

  const leadingTabs: { key: string; label: string; content: React.ReactNode }[] = [];
  if (curDiv && !curDiv.renderFull) {
    if (curDiv.admissions?.players?.length) {
      leadingTabs.push({
        key: "inscritos",
        label: sectionLabel("inscritos"),
        content: <DivisionAdmissions admissions={curDiv.admissions} date={cur?.dateStart ?? cur?.dateEnd} extraCols={curDiv.admissionsExtraCols} />,
      });
    }
    // Desenho próprio da página sem resultados (destaques de live scoring do
    // NextCaddy: só HiO/eagles/birdies, sem pancadas) → no lugar do «Resumo».
    if (!resultsTourn && curDiv.customResults !== undefined) {
      leadingTabs.push({ key: "resumo", label: sectionLabel("results"), content: curDiv.customResults });
    }
  }
  // Match Play (brackets) — aba no FIM da barra (é a fase final do torneio,
  // depois da qualificação stroke play): R1 → … → Resumo → 📋 → Match Play.
  const trailingTabs: { key: string; label: string; content: React.ReactNode }[] = [];
  if (curDiv && !curDiv.renderFull && curDiv.matchplay && curDiv.matchplay.flights.length > 0) {
    trailingTabs.push({
      key: "matchplay",
      label: sectionLabel("matchplay"),
      content: <MatchplayView data={curDiv.matchplay} />,
    });
  }
  if (curDiv && !curDiv.renderFull && curDiv.extraSections) trailingTabs.push(...curDiv.extraSections);
  // ── Deep-link da aba (?tab=…) ──────────────────────────────────────
  // Mesmo vocabulário do TournamentDetail ("round:0", "draw:2", "resumo",
  // "scorecards", "matchplay", "past-editions"), para o link funcionar tanto
  // nas divisões com `renderFull` (TournamentDetail) como nas que ficam no
  // IntlTournView do shell. `replace` para não encher o histórico.
  // Quem lê e escreve o URL é o próprio TournamentDetail: o shell só lhe diz o
  // NOME do parâmetro (a /uskids usa «rt»). Antes passava `tabKey`/`onTabKey`,
  // que o detalhe já não lê — o `&rt=scout` nunca lá chegava (10/11/2026).
  const tabParamName = config.tabParam ?? "tab";
  // ── Tab "Edições anteriores" (embutida, keyed por config.editionKey) ──────
  // O shell tem TODAS as entradas (todos os anos) em memória, cada uma com o
  // seu `loadDivisions` lazy → basta agrupar as irmãs (mesma `editionKey`) e
  // entregá-las ao componente partilhado. Só se mostra com ≥2 edições (uma só
  // não tem com que comparar). Construída aqui uma vez e entregue às duas vias:
  // trailing-tab (IntlTournView) e argumento de `renderFull` (TournamentDetail).
  const { editionKey, seasonKey, pastEditionsTab: pastEditionsTabConfig, matchDivision: matchDiv, scoutDivisions, scoutTCode } = config;
  const curDivLabel = curDiv ? (curDiv.tabLabel || curDiv.escalao || "") : "";
  // ⚠ `siblings` MEMOIZADO: sem isto o array era recriado a cada render e o
  // useEffect do CircuitPastEditionsTab (dep em `editions`) recarregava em loop.
  // Pool das irmãs: o `pastEditionsPool` integral quando a página o fornece
  // (Drive filtra `entries` por ano/série/região → sem isto a tab só via as
  // edições do filtro actual), senão as próprias `entries`. Fallback também
  // quando o pool ainda está vazio (a carregar) — `[] ?? entries` daria `[]`.
  const editionsSource = pastEditionsPool && pastEditionsPool.length ? pastEditionsPool : entries;
  const pastEditionsSiblings = useMemo(() => {
    if (!cur || !editionKey) return null;
    const k = editionKey(cur);
    if (!k) return null;
    const sib = editionsSource.filter((e) => editionKey(e) === k);
    // A prova por disputar pode não estar no pool (a /drive só lá põe as
    // jogadas): entra na mesma, para as edições anteriores aparecerem antes de
    // se jogar (decisão de 20/10/2026).
    if (!sib.some((e) => e.id === cur.id)) sib.unshift(cur);
    return sib.length >= 2 ? sib : null;
  }, [cur, editionsSource, editionKey]);
  // O torneio de hoje como o Scout o lê (resultados/totais + inscrições + draws).
  const scoutTourn = useMemo(() => (cur ? divisionTournament(curDiv, { name: cur.name, date: cur.dateStart, campo: cur.course }) : null), [curDiv, cur]);
  const pastEditionsTabNode = (() => {
    if (!curDiv || !cur) return null;
    if (pastEditionsSiblings) {
      return { key: "past-editions", label: "Edições anteriores",
        content: <CircuitPastEditionsTab editions={pastEditionsSiblings} division={curDivLabel} match={matchDiv} /> };
    }
    // Fallback: hook de baixo nível `pastEditionsTab` (legado; só usado quando
    // uma página não fornece `editionKey`).
    if (pastEditionsTabConfig) {
      const pe = pastEditionsTabConfig(cur, curDiv);
      if (pe) return { key: "past-editions", label: pe.label, content: pe.content };
    }
    return null;
  })();
  // ── Tab «Scorecards anteriores» (04/11/2026, «também podia aparecer sempre»):
  // os cartões buraco a buraco das mesmas edições irmãs, menos a de hoje.
  const pastScorecardsTabNode = curDiv && cur && pastEditionsSiblings
    ? { key: "sc-edicoes", label: "Scorecards anteriores",
        content: <CircuitPastScorecardsTab editions={pastEditionsSiblings} division={curDivLabel} currentId={cur.id} match={matchDiv} /> }
    : null;
  // ── Tab "Época" (embutida, keyed por config.seasonKey) ────────────────────
  // Toda a série/região do MESMO ANO do torneio aberto (as etapas da época em
  // curso), em contraste com "Edições anteriores" (a mesma prova/campo ao longo
  // dos anos). Só se mostra com ≥2 etapas nesse ano.
  const seasonSiblings = useMemo(() => {
    if (!cur || !seasonKey) return null;
    const k = seasonKey(cur);
    if (!k) return null;
    const sib = editionsSource.filter((e) => seasonKey(e) === k && e.year === cur.year);
    return sib.length >= 2 ? sib : null;
  }, [cur, editionsSource, seasonKey]);
  const seasonTabNode = (() => {
    if (!curDiv || !cur || !seasonSiblings) return null;
    // Com a capacidade «ranking», a «Época» abre com a classificação acumulada
    // das etapas da época (a mesma vista Ranking, só com estes torneios).
    const seasonCtx = { entries: seasonSiblings, scope: "season" as const, division: curDivLabel };
    const own = ranking?.seasonRender?.(seasonCtx);
    if (own) return { key: "season", label: config.seasonTabLabel ?? "Época", content: own };
    const rankingNode = ranking?.rows && ranking.seasonTitle
      ? <CircuitRankingView ranking={ranking} ctx={seasonCtx} />
      : null;
    return { key: "season", label: config.seasonTabLabel ?? "Época",
      content: <>{rankingNode}<CircuitPastEditionsTab editions={seasonSiblings} division={curDivLabel} match={matchDiv} /></> };
  })();
  // Ordem na barra: … Resumo · 📋 Scorecards · Época · Edições anteriores.
  if (seasonTabNode && curDiv && !curDiv.renderFull) trailingTabs.push(seasonTabNode);
  if (pastEditionsTabNode && curDiv && !curDiv.renderFull) trailingTabs.push(pastEditionsTabNode);
  if (pastScorecardsTabNode && curDiv && !curDiv.renderFull) trailingTabs.push(pastScorecardsTabNode);
  // ── Tab «Scout» (20/10/2026; era «Quem repete», 13/10): o field de hoje com
  // as edições anteriores desta prova E a carreira de cada um (nível, forma,
  // confrontos com o Manuel, próximas inscrições). Basta haver field — sem
  // edições anteriores mostra só a carreira.
  const scoutMatch = useMemo(() => (cur && scoutDivisions
    ? (ed: CircuitEntry, divs: CircuitDivision[]) => scoutDivisions(cur, curDivLabel, ed, divs)
    : undefined), [cur, curDivLabel, scoutDivisions]);
  const tCodeScout = cur && scoutTCode ? scoutTCode(cur) : null;
  const repeatersTabNode = scoutTourn && cur && curDiv ? {
    key: "scout", label: "Scout",
    content: <ScoutDoCircuito current={scoutTourn} editions={pastEditionsSiblings ?? SEM_IRMAS} division={curDivLabel} currentId={cur.id}
      match={matchDiv} scoutMatch={scoutMatch} tCode={tCodeScout} />,
  } : null;
  if (repeatersTabNode && !curDiv?.renderFull) trailingTabs.push(repeatersTabNode);
  // Sem resultados (só inscritos, ou o desenho próprio da página), o
  // TournamentDetail recebe um torneio sem voltas (só para a barra): os
  // separadores vêm todos de fora e abre no «Resumo» quando o há.
  const semVoltasTourn = useMemo<FPGTournament | null>(() => (curDiv && !curDiv.renderFull && !baseTourn && cur
    ? { name: cur.name, tcode: cur.id, date: cur.dateStart ?? "", campo: cur.course ?? "", escalao: curDiv.escalao ?? null, rounds: 0, playerCount: 0, players: [] } as unknown as FPGTournament
    : null), [curDiv, cur, baseTourn]);
  const detailTourn = resultsTourn ?? semVoltasTourn;
  const temResumoSemVoltas = !resultsTourn && leadingTabs.some((t) => t.key === "resumo");

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
  const curDateStr = fmtDateRangePt(cur?.dateStart, cur?.dateEnd);
  /** Links de ação do header (cur.links + sourceUrl como "Leaderboard oficial"). */
  const headerHasActions = !!(cur && (cur.sourceUrl || (cur.links && cur.links.length > 0) || (curDiv?.links && curDiv.links.length > 0)));

  // Early-return de loading DEPOIS de todos os hooks (rules of hooks): o shell
  // pode ser montado com loading=true e transitar para false enquanto montado
  // (ex.: FPGPage passa loading={loading}). Se ficasse antes de useSearchParams
  // & co., a contagem de hooks mudaria na transição → crash "order of Hooks".
  if (loading) {
    return <div className="tourn-layout"><LoadingState message={config.loadingMessage ?? "A carregar…"} /></div>;
  }

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <div className="tourn-layout">

        {/* Toolbar */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
          {slot.lead}
          {!slot.hideTitle && <ToolbarTitle>{config.title}</ToolbarTitle>}
          {/* Toggles rápidos (★ Manuel…) logo à frente, a seguir aos controlos
              da página — no fim da barra ficavam fora do ecrã (20/10/2026). O
              campo do torneio já está no cabeçalho do detalhe, não se repete aqui. */}
          {enabledToggles.map(t => (
            <ToggleChip key={t} checked={toggles.has(t)} onChange={() => toggle(t)} label={TOGGLE_DEF[t].label} title={TOGGLE_DEF[t].title} manuel={t === "manuel"} />
          ))}

          {flt.search && (
            <SearchInput value={search} onChange={setSearch} size="sm" className="u-ml-8px" />
          )}
          {flt.year && years.length > 1 && (
            <>
              <ToolbarSep />
              {/* Anos: o mesmo interruptor segmentado das vistas (clicar no activo = todos). */}
              <TabRow ariaLabel="Ano" active={fYear} onChange={(k) => setFYear(fYear === k ? "all" : k)}
                tabs={[
                  ...recentYears.map((y) => ({ key: String(y), label: y })),
                  ...(oldCutoff != null ? [{ key: "__old__", label: `<${oldCutoff}`, title: `Anteriores a ${oldCutoff}` }] : []),
                ]} />
              <ToolbarSep />
            </>
          )}
          {flt.escalao && (
            <Select variant="compact" value={fEsc} onChange={setFEsc}>
              <option value="all">🏆 Escalão</option>
              {escaloes.map(es => <option key={es} value={es}>{es}</option>)}
            </Select>
          )}
          {flt.sex && (
            <SexSelect variant="compact" value={fSex} onChange={setFSex} allValue="all" />
          )}
          {flt.source && sources.length > 1 && (
            <Select variant="compact" value={fSource} onChange={setFSource}>
              <option value="all">Fonte</option>
              {sources.map(s => <option key={s} value={s}>{config.sourceLabels?.[s] ?? s}</option>)}
            </Select>
          )}
          {flt.liga && ligas.length > 1 && (
            <Select variant="compact" value={fLiga} onChange={setFLiga}>
              <option value="all">🇫🇷 Liga</option>
              {ligas.map(l => <option key={l} value={l}>{config.ligaLabels?.[l] ?? l}</option>)}
            </Select>
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
          {ranking && !ranking.inInfoMenu && (
            <button type="button" className={`tourn-tab tourn-tab-sm${rankingOpen ? " active" : ""}`}
              onClick={() => setInfo(rankingOpen ? null : ranking.key)} title="Ranking dos jogadores nos torneios visíveis">
              {ranking.label}
            </button>
          )}
          {(!!config.specialItems?.length || !!ranking?.inInfoMenu) && (
            <Select
              variant="compact"
              value={infoView ?? ""}
              onChange={v => setInfo(v || null)}
              title="Páginas informativas"
            >
              <option value="">ⓘ Info</option>
              {(config.specialItems ?? []).map(si => <option key={si.key} value={si.key}>{si.label}</option>)}
              {ranking?.inInfoMenu && <option value={ranking.key}>{ranking.label}</option>}
            </Select>
          )}

          {hasActiveFilters && (
            <ClearButton onClick={clearFilters} />
          )}

          <Counter ml="auto">
            {hasActiveFilters ? `${visible.length} de ${entries.length}` : `${entries.length} torneios`}
          </Counter>
          {slot.trail}
        </Toolbar>
        {slot.below}

        <MasterDetail md={md} sidebar={<>
            <CircuitSidebar
              entries={visible}
              config={config}
              curId={cur?.id ?? null}
              onSelect={selectEntry}
              renderItem={renderSidebarItem}
            />
        </>}>
            {rankingOpen ? (
              ranking!.render ? ranking!.render() : <CircuitRankingView ranking={ranking!} ctx={rankingViewCtx} />
            ) : curInfoItem ? (
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
                  <div className="u-d-flex u-gap-6px u-fwr-wrap u-mb-6px">
                    {curDivisions.map(d => {
                      const active = d.key === curDiv.key;
                      // Sem resultados, os inscritos (torneios por disputar — /uskids;
                      // na FPG/Jovens o torneio vem só com `playerCount` das inscrições).
                      const nP = d.results?.players.length
                        || d.results?.playerCount
                        || d.admissions?.players?.filter(p => p.status !== "desistente").length || 0;
                      const nAces = d.results ? tournamentAces(d.results.players).length : 0;
                      return (
                        <button
                          key={d.key}
                          className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                          onClick={() => selectDiv(cur, d)}
                        >
                          {d.tabLabel || d.escalao}
                          {nP > 0 && (
                            <span className="fs-10 u-ml-3px u-op-0_8">({nP} jog)</span>
                          )}
                          {d.hasManuel && <span className="u-c-color-good"> ★</span>}
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
                      <LigaPills entry={cur} config={config} max={3}
                        className="u-ml-8px" />
                      <span className="gap-4 ml-8 u-d-inline-flex u-ai-center u-fwr-wrap">
                        {headerStats.nPlayers > 0 && (
                          <span className="p p-sm p-muted">
                            {headerStats.nPlayers} jog
                          </span>
                        )}
                        {headerStats.nRounds > 1 && <RoundPill nR={headerStats.nRounds} />}
                        {headerStats.parTotal > 0 && (
                          <span className="p p-sm p-muted">
                            Par {headerStats.parTotal}
                          </span>
                        )}
                        {headerStats.aces.length > 0 && (
                          <span
                            className="p p-sm u-bg-score-eagle u-c-fff u-bd-1px-solid-score-eagle"

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
                          <span className="muted u-ml-4px">
                            {cur.hcpLimit?.men != null && `Hcp M ≤ ${cur.hcpLimit.men} `}
                            {cur.hcpLimit?.women != null && `Hcp F ≤ ${cur.hcpLimit.women}`}
                          </span>
                        )}
                      </span>
                    </>
                  }
                >
                  {/* Resultado do Manuel (pílulas pequenas, cor dele) — no escalão
                      em que jogou, mesmo quando se está a ver outro. */}
                  {(() => {
                    const md = curDivisions.find(d => findManuelNaProva(d.results?.players));
                    return md ? <ManuelResultPills tournament={md.results}
                      label={curDivisions.length > 1 ? (md.tabLabel || md.escalao) : null} /> : null;
                  })()}
                  <TournamentWeather
                    course={cur.course}
                    startDate={cur.dateStart}
                    endDate={cur.dateEnd}
                    rounds={headerStats.nRounds}
                  />
                </DetailHeader>
                )}

                {/* Conteúdo do torneio: barra ÚNICA estilo FPG (IntlTournView →
                    TournamentDetail), com ou sem cartões — Inscrições → Draw →
                    R1 → … → Resumo → 📋 Scorecards → Época → Edições → Scout. */}
                {/* O campo do cabeçalho vai como reserva para a aba «⛳ O campo»
                    (o torneio do escalão nem sempre traz `campo`). */}
                <CampoDoCircuito.Provider value={cur.course || undefined}>
                {curDiv.renderFull && curDiv.renderFull({ pastEditionsTab: pastEditionsTabNode ?? undefined, pastScorecardsTab: pastScorecardsTabNode ?? undefined, seasonTab: seasonTabNode ?? undefined, repeatersTab: repeatersTabNode ?? undefined, playerFilter })}
                {!curDiv.renderFull && detailTourn && (
                  <IntlTournView
                    tournament={detailTourn}
                    // Campo próprio do escalão (≠ do torneio) → na linha de
                    // informação, junto do CR/Slope (14/10/2026).
                    scOptions={{ ...(curDiv.scOptions ?? {}), showCourse: !!detailTourn.campo && detailTourn.campo.trim() !== String(cur.course || "").trim(), shareEvent: cur.name, shareCourse: detailTourn.campo || cur.course, shareDate: cur.dateStart }}
                    roundLabels={curDiv.roundLabels}
                    siLabel={curDiv.siLabel}
                    evoCols={curDiv.evoCols ?? totalsView?.accExtraColumns}
                    accHeader={curDiv.accHeader ?? totalsView?.accHeader}
                    roundExtra={curDiv.roundExtra}
                    accExtra={curDiv.accExtra}
                    renderAccSection={curDiv.renderAccSection}
                    renderRoundSection={curDiv.renderRoundSection}
                    leadingTabs={leadingTabs.length ? leadingTabs : undefined}
                    trailingTabs={trailingTabs.length ? trailingTabs : undefined}
                    roundDraws={curDiv.roundDraws}
                    tabParam={tabParamName}
                    defaultTab={temResumoSemVoltas ? "resumo" : undefined}
                  />
                )}
                </CampoDoCircuito.Provider>
              </>
            ) : (
              <EmptyState message="Sem dados para este torneio." />
            )}
        </MasterDetail>
      </div>
    </KidsLinkCtx.Provider>
  );
}

// ── Sidebar (agrupamento por ano / série / fonte) ─────────────────────

function CircuitSidebar({
  entries, config, curId, onSelect, renderItem,
}: {
  entries: CircuitEntry[];
  config: CircuitConfig;
  curId: string | null;
  onSelect: (e: CircuitEntry) => void;
  renderItem?: (entry: CircuitEntry, ctx: { active: boolean; onSelect: () => void }) => React.ReactNode;
}) {
  // Agrupamento de 1º nível (none | série | fonte).
  const l1Mode = config.grouping === "series-year" ? "series"
    : config.grouping === "source-year" ? "source"
    : "none";

  // "month-year": bucket 2º nível por mês (chave YYYY-MM da data do torneio) em
  // vez de por ano. `bk` ordena os blocos (desc); `label` é o cabeçalho ("Mai
  // 2026"). Nos restantes modos o bucket é o ano (comportamento original).
  const monthMode = config.grouping === "month-year";
  const olderByYear = !!config.olderYearsByYear;
  const asc = config.sidebarOrder === "asc";
  const bucketOf = useCallback((e: CircuitEntry): { bk: string; label: string } => {
    if (monthMode) {
      const dk = entryDateKey(e); // YYYYMMDD ("00000000" = sem data)
      if (dk === "00000000") return { bk: "0000-00", label: "Sem data" };
      // Anos anteriores ao corrente num bloco por ano (`olderYearsByYear`).
      if (olderByYear && dk.slice(0, 4) < String(new Date().getFullYear())) return { bk: dk.slice(0, 4), label: dk.slice(0, 4) };
      const ym = `${dk.slice(0, 4)}-${dk.slice(4, 6)}`;
      return { bk: ym, label: monthLabel(ym) };
    }
    const y = e.year;
    return { bk: y == null ? "0000" : String(y), label: y == null ? "Sem data" : String(y) };
  }, [monthMode, olderByYear]);

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
    // Ordenação por data (mais recente primeiro) dentro de cada bucket — ver
    // entryDateKey/entriesByDateDesc (partilhados com o default de selecção).
    return keys.map(k => {
      const items = byL1.get(k)!;
      const byBucket = new Map<string, { label: string; items: CircuitEntry[] }>();
      for (const e of items) {
        const { bk, label } = bucketOf(e);
        if (!byBucket.has(bk)) byBucket.set(bk, { label, items: [] });
        byBucket.get(bk)!.items.push(e);
      }
      const up = asc !== !!config.ascSeries?.includes(k);
      const buckets = [...byBucket.entries()]
        .sort((a, b) => (up ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])))
        .map(([bk, v]) => {
          const items = v.items.sort(entriesByDateDesc);
          return { bk, label: v.label, items: up ? items.reverse() : items };
        });
      return { key: k, buckets };
    });
  }, [entries, l1Mode, config.seriesOrder, bucketOf, asc, config.ascSeries]);

  return (
    <>
      {l1Mode === "none" && (
        <SidebarSectionTitle dark color={config.color} textColor={config.textColor} className="u-ls-0_08em">
          {config.title}
        </SidebarSectionTitle>
      )}
      {groups.map(g => (
        <React.Fragment key={g.key || "_"}>
          {l1Mode !== "none" && (
            <SidebarSectionTitle dark color={config.color} textColor={config.textColor} className="u-ls-0_08em">
              {g.key}
            </SidebarSectionTitle>
          )}
          {g.buckets.map(({ bk, label, items }) => (
            <React.Fragment key={bk}>
              <Tint as="div" className="sidebar-year-label cs-year-lbl" bg={config.color ?? "var(--color-good-dark)"} fg={config.textColor ?? "var(--text-on-color)"}>
                {label}
              </Tint>
              {items.map(e => {
                const active = e.id === curId;
                // Render custom (FPG reutiliza o TournSidebarItem) — assume o item
                // inteiro; o shell só fornece `active` + o seu `onSelect`.
                if (renderItem) return <React.Fragment key={e.id}>{renderItem(e, { active, onSelect: () => onSelect(e) })}</React.Fragment>;
                return <CircuitSidebarItem key={e.id} e={e} config={config} active={active} onSelect={() => onSelect(e)} />;
              })}
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

/** Item da sidebar do shell (as páginas podem trocá-lo por `renderSidebarItem`,
 *  como a FPG com o TournSidebarItem): nome · campo · pills · data/fonte/jog. */
function CircuitSidebarItem({ e, config, active, onSelect }: { e: CircuitEntry; config: CircuitConfig; active: boolean; onSelect: () => void }) {
  const nP = entryPlayerCount(e);
  const nR = e.roundsCount ?? Math.max(0, ...(e.divisions ?? []).map(d => d.results?.rounds ?? 0));
  const nDiv = e.divisionCount ?? e.divisions?.length ?? 1;
  const esc = e.escalao ?? e.divisions?.[0]?.escalao;
  const sex = e.sex ?? e.divisions?.[0]?.sex;
  const srcColor = e.source ? config.sourceColors?.[e.source] : undefined;
  const srcLabel = e.source ? (config.sourceLabels?.[e.source] ?? e.source) : undefined;
  const dateStr = fmtDateRangePt(e.dateStart, e.dateEnd);
  const accent = srcColor ?? config.color ?? "var(--accent)";
  return (
    <SidebarCard
      active={active} accent={accent} onSelect={onSelect}
      name={e.name}
      nameExtra={<>
        {e.hasManuel && <ManuelPill />}
        {entryHasAce(e) && <span title="Hole-in-one neste torneio" className="u-fsh-0">🕳️</span>}
      </>}
      course={e.course && (e.course.length > 50 ? e.course.slice(0, 50) + "…" : e.course)}
      pills={<>
        {e.tcode && <span className="p p-sm p-muted">{e.tcode}</span>}
        {/* Escalão/sexo só fazem sentido quando há UM escalão; com vários
            mostrar apenas "N esc." (senão parece que só tem o 1º). */}
        {nDiv <= 1 && esc && <EscPill esc={esc} />}
        {nDiv <= 1 && sex && <SexBadge sex={sex === "Mixed" ? "M" : sex} />}
        {nDiv <= 1 && sex === "Mixed" && <SexBadge sex="F" />}
        {nDiv > 1 && <span className="p p-sm p-muted">{nDiv} esc.</span>}
        {nR > 1 && <RoundPill nR={nR} />}
        <LigaPills entry={e} config={config} max={2} />
      </>}
      date={dateStr ? `📅 ${dateStr}` : "—"}
      right={<>
        {srcLabel && (
          <Tint className="chip u-fs-fs-9 u-p-1px-6px u-br-radius-lg" title={`Fonte: ${srcLabel}`} bg={srcColor} fg={srcColor ? textOnColor(srcColor) : null}>{srcLabel}</Tint>
        )}
        {nP > 0 && <span className="u-fs-fs-11 u-c-text-muted">{nP} jog</span>}
      </>}
    />
  );
}
