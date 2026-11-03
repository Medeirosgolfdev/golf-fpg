/**
 * DataSources.tsx — componentes partilhados para diagnóstico de ficheiros de dados.
 *
 * - `formatSourceLabel(path)`  → abreviatura legível ("pull001", "clubes2024")
 * - `<FileBadge>`              → pill compacto na sidebar (hover: caminho completo;
 *                                 botão direito: lista dos torneios desse ficheiro)
 * - `<DataSourcesChip>`        → chip na toolbar que expande num painel com todos
 *                                 os ficheiros lidos pela página (caminho, contagem,
 *                                 fonte/scraper, estado).
 *
 * Formato de entrada partilhado: `DataSource[]` (ver tipo abaixo).
 * Cada página junta os seus ficheiros (FPGPage: fileMeta + clubes + jovens + admissions;
 * DrivePage: driveLoader meta; KIDSPage: KIDSdataLoader meta) e passa o mesmo shape.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import ExpandArrow from "./ExpandArrow";
import CloseButton from "./CloseButton";
import SectionTitle from "./SectionTitle";
import { Place } from "./DataStyle";

type DataSourceStatus = "loaded" | "loading" | "error";

export interface DataSource {
  /** Caminho completo relativo (ex: "/data/pull-torneios001.json") */
  path: string;
  status: DataSourceStatus;
  /** Número de torneios/registos carregados */
  count?: number;
  /** Campo `source` do JSON (ex: "pull-torneios", "drive-aquapor-v7") quando disponível */
  source?: string;
  /** Mensagem de erro (quando status === "error") */
  error?: string;
  /** ISO timestamp da última actualização, quando disponível no JSON */
  lastUpdated?: string;
  /** Rótulo livre de grupo (ex: "main", "clubes", "jovens") para agrupar ficheiros
   *  relacionados no painel. Opcional. */
  group?: string;
}

/* ──────────────────────────────────────────────────────────────────
   formatSourceLabel — abrevia o caminho para exibição compacta
   ────────────────────────────────────────────────────────────────── */

const PATTERNS: Array<[RegExp, string]> = [
  [/^pull-torneios(\d+)$/, "pull$1"],
  [/^clubes_sub_14&18_(\d+)$/, "clubes$1"],
  [/^clubes_sub_14_D1$/, "clubes-D1-14"],
  [/^clubes_sub_18_D1$/, "clubes-D1-18"],
  [/^jovens_(\d+)$/, "jovens$1"],
  [/^drive-data-(\d+)-(\d+)$/, "drive$1-$2"],
  [/^aquapor-data-(\d+)-(\d+)$/, "aquapor$1-$2"],
  [/^drive-data$/, "drive"],
  [/^aquapor-data$/, "aquapor"],
  [/^uskids_torneios_completos\((\d+)\)$/, "uskids($1)"],
  [/^fpg-admissions-draws$/, "admissions"],
  [/^inscricoes_nacionais$/, "nacional-insc"],
  [/^uskids-results$/, "uskids-results"],
  [/^uskids-field$/, "uskids-field"],
  [/^uskids-field-sizes$/, "uskids-fieldsizes"],
  [/^uskids-member-history-slim$/, "uskids-history"],
  [/^uskids-member-history$/, "uskids-history"],
  [/^t_de_tournaments_do_uskids$/, "uskids-meta"],
  [/^wjgc_(\d+)_(.+)$/, "wjgc$1-$2"],
  [/^eowagr(\d+)_(.+)$/, "eowagr$1-$2"],
  [/^ftm_doral_(\d+)$/, "doral$1"],
  [/^bjgt_(.+)$/, "bjgt-$1"],
  [/^torneio-greatgolf$/, "greatgolf"],
  [/^tournament-links$/, "tourn-links"],
  [/^players$/, "players"],
  [/^federados$/, "federados"],
  [/^federados-inativos$/, "federados-inat"],
  [/^master-courses$/, "courses"],
  [/^away-courses$/, "away-courses"],
  [/^melhorias$/, "melhorias"],
];

/** Abrevia o caminho do ficheiro para uma etiqueta compacta.
 *  Exemplos: "/data/pull-torneios001.json" → "pull001"
 *            "/data/clubes_sub_14&18_2024.json" → "clubes2024"
 *            "/data/fpg-admissions-draws.json" → "admissions" */
export function formatSourceLabel(path: string | undefined | null): string {
  if (!path) return "?";
  let s = String(path).replace(/^\/data\//, "").replace(/\.json$/i, "");
  for (const [re, replacement] of PATTERNS) {
    if (re.test(s)) return s.replace(re, replacement);
  }
  // Fallback: usar o nome base, truncar se muito longo
  return s.length > 18 ? s.slice(0, 16) + "…" : s;
}

/* ──────────────────────────────────────────────────────────────────
   FileBadge — pill pequeno de origem do torneio
   Hover: caminho completo. Clique direito: popover com torneios desse ficheiro.
   ────────────────────────────────────────────────────────────────── */

export interface BadgeTournament {
  name: string;
  date?: string;
  tcode?: string | number;
  ccode?: string | number;
}

/* ──────────────────────────────────────────────────────────────────
   Context — partilha a lookup "path → torneios nesse ficheiro" entre FileBadges
   da página, sem ter de passar a lista por prop em cada item da sidebar.
   ────────────────────────────────────────────────────────────────── */
interface DataSourcesCtx {
  getTournamentsForFile: (path: string) => BadgeTournament[] | undefined;
}
const DataSourcesContext = createContext<DataSourcesCtx | null>(null);

/**
 * Monta o contexto que permite aos `FileBadge` mostrarem os torneios de um
 * ficheiro quando o utilizador clica com o botão direito.
 *
 * Aceita um array de torneios com `_sourceFile` (ou equivalente) e constrói
 * internamente a lookup por caminho.
 */
export function DataSourcesProvider({
  tournaments,
  children,
}: {
  tournaments: Array<{ _sourceFile?: string; name: string; date?: string; tcode?: string | number; ccode?: string | number }>;
  children: React.ReactNode;
}) {
  // Construir índice path → BadgeTournament[] (memoizado)
  const index = React.useMemo(() => {
    const m = new Map<string, BadgeTournament[]>();
    for (const t of tournaments) {
      const p = t._sourceFile;
      if (!p) continue;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push({ name: t.name, date: t.date, tcode: t.tcode, ccode: t.ccode });
    }
    return m;
  }, [tournaments]);

  const value = React.useMemo<DataSourcesCtx>(
    () => ({ getTournamentsForFile: (path: string) => index.get(path) }),
    [index]
  );
  return <DataSourcesContext.Provider value={value}>{children}</DataSourcesContext.Provider>;
}

export function FileBadge({
  path,
  tournaments: explicitTournaments,
  className,
}: {
  path: string | undefined | null;
  /** Lista explícita de torneios neste ficheiro — override do Context. Opcional. */
  tournaments?: BadgeTournament[];
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const ctx = useContext(DataSourcesContext);
  // Preferir tournaments do Context se disponíveis; fallback à prop explícita
  const tournaments = (path && ctx?.getTournamentsForFile(path)) || explicitTournaments;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  if (!path) return null;
  const label = formatSourceLabel(path);

  const onContext = (e: React.MouseEvent) => {
    // Botão direito → mostrar lista de torneios deste ficheiro (quando fornecida)
    if (!tournaments || tournaments.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <span ref={ref} className={`${className ?? ""} u-d-inline-flex u-pos-relative`}>
      {/* Mesmo tamanho/cor do "data" e "N jog" ao lado — aparência mínima, sem pill */}
      <span
        className={tournaments ? "mono ds-file ctx" : "mono ds-file"}
        title={`${path}${tournaments ? "  ·  Clique direito: ver torneios" : ""}`}
        onContextMenu={onContext}
      >
        {label}
      </span>
      {menuOpen && tournaments && (
        <FilePopover
          path={path}
          tournaments={tournaments}
          anchorPos={pos}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </span>
  );
}

function FilePopover({
  path,
  tournaments,
  anchorPos,
  onClose,
}: {
  path: string;
  tournaments: BadgeTournament[];
  anchorPos: { x: number; y: number };
  onClose: () => void;
}) {
  const sorted = [...tournaments].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );
  // Altura limitada, com scroll (.ds-pop); só a posição (do rato) vem daqui
  const left = Math.min(anchorPos.x, window.innerWidth - 340);
  const top = Math.min(anchorPos.y, window.innerHeight - 320);
  return (
    <Place className="ds-panel ds-pop" left={left} top={top} onClick={(e) => e.stopPropagation()}>
      <div className="u-p-4px-10px-6px u-bb-1px-solid-border-light u-d-flex u-ai-center u-jc-space-between u-gap-6px">
        <div>
          <div className="fw-700 fs-11 u-ff-font-mono">
            {formatSourceLabel(path)}
          </div>
          <div className="c-muted fs-10 u-word-break-break-all">{path}</div>
          <div className="c-muted fs-10">{tournaments.length} torneio{tournaments.length !== 1 ? "s" : ""}</div>
        </div>
        <CloseButton onClick={onClose} title="Fechar (Esc)" />
      </div>
      <div>
        {sorted.map((t, i) => (
          <div key={i} className="ds-pop-row">
            <span className="c-muted fs-10 u-w-78px u-fsh-0 u-ff-font-mono">
              {t.date || ""}
            </span>
            <span className="fs-11 u-fl-1 u-word-break-break-word">{t.name}</span>
            {t.tcode && (
              <span className="c-muted fs-10 u-fsh-0 u-ff-font-mono">
                {t.tcode}
              </span>
            )}
          </div>
        ))}
      </div>
    </Place>
  );
}

/* ──────────────────────────────────────────────────────────────────
   DataSourcesChip — chip na toolbar que expande num painel de ficheiros
   ────────────────────────────────────────────────────────────────── */

export function DataSourcesChip({
  sources,
  label = "ficheiros",
}: {
  sources: DataSource[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // Permitir clique dentro do botão (toggle) e dentro do painel (via stopPropagation no panel)
      if (btnRef.current && !btnRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Refresh do rect quando o painel abre ou a janela é redimensionada
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  if (!sources || sources.length === 0) return null;

  const loaded = sources.filter(s => s.status === "loaded").length;
  const loading = sources.filter(s => s.status === "loading").length;
  const errors = sources.filter(s => s.status === "error").length;
  const totalCount = sources.reduce((s, x) => s + (x.count || 0), 0);

  return (
    <div className="u-pos-relative u-fsh-0">
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className={errors > 0 ? "chip fs-11 ds-chip warn" : "chip fs-11 ds-chip"}
        title={`${loaded} carregado(s)${loading ? `, ${loading} em curso` : ""}${errors ? `, ${errors} erro(s)` : ""} · ${totalCount} torneios`}
      >
        📂 {sources.length} {label}
        {errors > 0 && <span className="u-c-color-warn-dark u-fw-700">⚠ {errors}</span>}
        {loading > 0 && <span className="c-muted">…</span>}
        <span className="c-muted u-fs-fs-9"><ExpandArrow open={open} /></span>
      </button>
      {open && anchorRect && (
        <DataSourcesPanel
          sources={sources}
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function DataSourcesPanel({
  sources,
  anchorRect,
  onClose: _onClose,
}: {
  sources: DataSource[];
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  // Agrupar por `group` quando fornecido
  const grouped: Record<string, DataSource[]> = {};
  for (const s of sources) {
    const g = s.group || "";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(s);
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });

  // Posicionamento fixo calculado pelo rect do botão — evita clipping pela toolbar
  const PANEL_WIDTH = 440;
  const GAP = 6;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  // Alinhar a borda direita do painel com a borda direita do botão (ou clamp à viewport)
  const preferredLeft = anchorRect.right - PANEL_WIDTH;
  const left = Math.max(8, Math.min(preferredLeft, vw - PANEL_WIDTH - 8));
  const top = Math.min(anchorRect.bottom + GAP, vh - 80);
  const maxHeight = Math.max(200, vh - top - 16);

  // O aspecto vive em .ds-panel/.ds-src-panel (largura = PANEL_WIDTH); daqui só a posição calculada (Place).

  const totalCount = sources.reduce((s, x) => s + (x.count || 0), 0);

  return (
    <Place className="ds-panel ds-src-panel" left={left} top={top} maxH={maxHeight} onClick={(e) => e.stopPropagation()}>
      <div className="u-p-6px-10px-8px u-bb-1px-solid-border-light">
        <SectionTitle as="div" size="sm" icon="📂">Ficheiros de dados lidos pela página</SectionTitle>
        <div className="c-muted fs-10 mt-2">
          {sources.length} ficheiro{sources.length !== 1 ? "s" : ""} · {totalCount} registo{totalCount !== 1 ? "s" : ""} total
        </div>
      </div>
      {groupKeys.map((gk) => (
        <React.Fragment key={gk}>
          {gk && (
            <div className="c-muted fs-10 fw-700 u-p-6px-10px-2px u-tt-uppercase u-ls-0_4px">
              {gk}
            </div>
          )}
          {grouped[gk].map((s) => (
            <SourceRow key={s.path} source={s} />
          ))}
        </React.Fragment>
      ))}
    </Place>
  );
}

function SourceRow({ source }: { source: DataSource }) {
  const isError = source.status === "error";
  const statusIcon = source.status === "loaded" ? "✓"
    : source.status === "loading" ? "…"
    : "⚠";
  const statusColor = source.status === "loaded" ? "u-c-color-good"
    : source.status === "loading" ? "u-c-text-muted"
    : "u-c-color-warn-dark";
  return (
    <div className={isError ? "ds-src-row err" : "ds-src-row"}>
      <span className={"ds-src-icon " + statusColor} title={source.status}>
        {statusIcon}
      </span>
      <span className="u-fl-1 u-minw-0">
        <div className="mono ds-src-path">
          {source.path}
        </div>
        <div className="c-muted u-fs-fs-10 u-mt-1px u-d-flex u-gap-8px u-fwr-wrap">
          {source.count != null && (
            <span>{source.count} {source.count === 1 ? "registo" : "registos"}</span>
          )}
          {source.source && <span>scr: {source.source}</span>}
          {source.lastUpdated && <span>upd: {source.lastUpdated.slice(0, 10)}</span>}
        </div>
        {/* Erro em bloco próprio, bem visível, a ocupar linha inteira */}
        {source.error && (
          <div className="u-mt-3px u-p-3px-6px u-fs-fs-10 u-ff-font-mono u-c-color-warn-dark u-bg-bg-card u-bd-1px-solid-color-warn u-br-radius-sm u-word-break-break-word u-ws-pre-wrap">
            {source.error}
          </div>
        )}
      </span>
    </div>
  );
}
