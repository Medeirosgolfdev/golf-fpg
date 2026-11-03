/**
 * src/pages/jogadores/PlayerSidebarItem.tsx
 *
 * Item de sidebar unificado da JogadoresPage. Inspirado no TournSidebarItem
 * (FPGPage): accent lateral + pills globais. Inclui o HcpPill relativo ao
 * escalão (percentis) e o TagPill (PJA, inscrito-nacional, no-scrape, hidden).
 */
import React from "react";
import type { FederadoRaw, MergedPlayer } from "../../data/federadosLoader";
import { hcpDisplay } from "../../utils/playerUtils";
import { gf, isForeignPrefix } from "../../utils/flagUtils";
import SexBadge from "../../ui/SexBadge";
import { PillBadge, EscPill, SIDEBAR_ACCENT } from "../../ui/PillBadge";
import type { EscHcpStats } from "./filterPlayers";
import HcpPill from "../../ui/HcpPill";

export type PlayerSidebarPlayer = {
  name: string;
  fed: string;
  escalao: string;
  sex?: "M" | "F" | string;
  hcp: number | null;
  club?: unknown;
  tags?: string[];
  _source?: MergedPlayer["_source"];
  _federadoRaw?: FederadoRaw;
  _fpgDiffs?: MergedPlayer["_fpgDiffs"];
};

/** Sep — pequena linha separadora entre blocos do cartão */
const PlayerSidebarSep = () => (
  <div className="u-h-0_5px u-bg-border-light u-m-4px-0" />
);

/** Pill de tag (PJA, inscrito-nacional, no-scrape, hidden) */
export function TagPill({ tag }: { tag: string }) {
  const t = tag.toLowerCase();
  // Mapeamento tag → estilo + label
  if (t === "pja") return <PillBadge pill="PJA" />;
  if (t === "inscrito-nacional") {
    return (
      <span
        className="p p-sm u-bg-color-good-dark u-c-fff u-border-color-transparent"

        title="Inscrito no Campeonato Nacional 2026"
      >
        🏆 CN26
      </span>
    );
  }
  if (t === "no-scrape") {
    return (
      <span
        className="p p-sm u-bg-bg-muted u-c-text-3 u-border-color-border"

        title="Scraper salta este jogador (dados congelados)"
      >
        ⏸ sem scrape
      </span>
    );
  }
  if (t === "hidden") {
    return (
      <span
        className="p p-sm u-bg-bg-muted u-c-text-3 u-border-color-border"

        title="Escondido da sidebar"
      >
        👁 oculto
      </span>
    );
  }
  // Fallback — tag genérica
  return <span className="p p-sm p-muted">{tag}</span>;
}

type PlayerSidebarItemProps = {
  p: PlayerSidebarPlayer;
  isActive: boolean;
  displayClub: string | null;
  displayEscalao: string;
  displayHcp: number | null;
  rank?: number | null;
  rankingMode: boolean;
  isNewRound: boolean;
  escHcps?: EscHcpStats;
  roundsTotal?: number | null;
  /** Rondas no ano civil corrente — mesma fonte que o detalhe ("N em {ano}"). */
  roundsCurrentYear?: number | null;
  /** Handicap Pitch & Putt (mundo paralelo) — null se não tiver. */
  ppHcp?: number | null;
  /** Seleccionar o jogador (callback ESTÁVEL do parent — o item trata os
   *  modifier-keys internamente para o React.memo ser efectivo). */
  onSelect: (fed: string) => void;
};

function PlayerSidebarItemInner({
  p, isActive, displayClub, displayEscalao, displayHcp, rank, rankingMode, isNewRound,
  escHcps, roundsTotal, roundsCurrentYear, ppHcp, onSelect,
}: PlayerSidebarItemProps) {
  const pm = p;
  const isFedsOnly = pm._source === "feds";
  const isOrphan = pm._source === "players";
  const hcpChanged = !!pm._fpgDiffs?.hcpChanged;
  const rawTags = (pm.tags || []).filter(t => t !== "no-priority");
  const isPja = rawTags.some(t => t.toUpperCase() === "PJA");
  const hasNacionalTag = rawTags.includes("inscrito-nacional");
  // PJAs estão implicitamente inscritos no Campeonato Nacional — se o
  // tag explícito não existir, adicionamo-lo aqui para o pill aparecer.
  const tags = isPja && !hasNacionalTag ? [...rawTags, "inscrito-nacional"] : rawTags;
  const isNacional = isPja || hasNacionalTag;

  const countryPrefix = pm._federadoRaw?.country_prefix;
  const showFlag = isForeignPrefix(countryPrefix);

  // ── Accent lateral: prioridade nacional > PJA > orphan > escalão > feds-only ──
  const escKey = (displayEscalao || "").toLowerCase().replace(/[\s-]/g, "");
  const escBg =
    escKey === "sub10" ? "var(--esc-sub10-bg)" :
    escKey === "sub12" ? "var(--esc-sub12-bg)" :
    escKey === "sub14" ? "var(--esc-sub14-bg)" :
    escKey === "sub16" ? "var(--esc-sub16-bg)" :
    escKey === "sub18" ? "var(--esc-sub18-bg)" :
    escKey === "sub21" ? "var(--esc-sub21-bg)" :
    escKey === "sub24" ? "var(--esc-sub24-bg)" :
    null;
  const accent =
    isNacional ? "var(--color-good-dark)" :
    isPja      ? SIDEBAR_ACCENT.pja :
    isOrphan   ? "var(--color-warn)" :
    escBg      ??
    (isFedsOnly ? "var(--border)" : SIDEBAR_ACCENT.default);

  // Club — fallback para fed code se não houver clube
  const clubText = typeof displayClub === "string" && displayClub.trim() ? displayClub : null;

  return (
    <a
      href={`/jogadores/${p.fed}`}
      className={`course-item sidebar-player${isActive ? " active" : ""}${isFedsOnly ? " fed-only" : ""}`}
      onClick={e => {
        // Click simples selecciona; Ctrl/Cmd/Shift/middle deixa o <a> abrir
        // em nova aba (padrão TournSidebarItem).
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          onSelect(p.fed);
        }
      }}
      style={{ borderLeftColor: accent }}
    >
      {/* Linha 1: rank (se rankingMode) + flag + nome + sexo + indicadores */}
      <div className="course-item-name flex-center u-mb-3px">
        {rankingMode && rank != null && (
          <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}>
            {rank}
          </span>
        )}
        <span className="flex-1 u-minw-0">
          {showFlag && <span className="mr-4" title={pm._federadoRaw?.country}>{gf(countryPrefix!)}</span>}
          <span className={isActive ? "u-fw-700" : "u-fw-600"}>{p.name}</span>
          <SexBadge sex={p.sex} size="sm" className="ml-4" />
          {isNewRound && <span className="new-round-dot ml-4" title="Ronda recente (< 7 dias)" />}
          {isFedsOnly && <span className="ml-4 c-muted fs-10" title="Só cadastro FPG — sem análise de scorecards">ø</span>}
          {isOrphan && <span className="ml-4 fs-10 u-c-color-warn-vivid" title="Não encontrado na FPG activa (quotas por regularizar?)">⚠</span>}
          {hcpChanged && <span className="ml-4 fs-10 u-c-color-warn-vivid" title={`FPG actual: HCP ${pm._fpgDiffs?.hcpChanged?.fpg}`}>⚡</span>}
        </span>
      </div>

      <PlayerSidebarSep />

      {/* Linha 2: pills — escalão · clube · HCP · tags */}
      <div className="gap-4 flex-wrap u-d-flex u-ai-center u-m-3px-0">
        {displayEscalao && <EscPill esc={displayEscalao} />}
        {clubText && (
          // Nota: NÃO usamos ClubePill aqui porque o seu helper `shortClubFromField`
          // rejeita ccode="000" (reservado à FPG) e devolve null nesse caso.
          // O `displayClub` vem de `clubShort(p)` já normalizado — renderizamos
          // directamente com a mesma classe .p-club para visual consistente.
          <span className="p p-sm p-club" title={clubText}>{clubText}</span>
        )}
        <HcpPill hcp={displayHcp} band={escHcps} />
        {ppHcp != null && (
          <span className="p p-sm u-bg-badge-pp u-c-fff u-bd-1px-solid-badge-pp" title={`Handicap Pitch & Putt: ${ppHcp}`}
>
            🏑 {ppHcp}
          </span>
        )}
        {tags.map(t => <TagPill key={t} tag={t} />)}
      </div>

      <PlayerSidebarSep />

      {/* Linha 3: fed# + rondas (total · este ano) + rank HCP (se rankingMode) */}
      <div className="u-d-flex u-jc-space-between u-ai-center u-gap-6px u-fwr-wrap">
        <span className="u-fs-fs-11 u-c-text-muted u-d-inline-flex u-ai-center u-gap-8px">
          <span>#{p.fed}</span>
          {/* Rondas neste ano civil — mesma fonte (data.json) que o detalhe header.
              Usado para ordenação por defeito. */}
          {(roundsCurrentYear != null && roundsCurrentYear > 0) && (
            <span title={`${roundsCurrentYear} rondas em ${new Date().getFullYear()}`} className="u-c-color-good-dark u-fw-600">🗓 {roundsCurrentYear}</span>
          )}
          {/* Total — também do data.json. */}
          {(roundsTotal != null && roundsTotal > 0) && (
            <span title={`${roundsTotal} voltas no total`} className="u-op-0_7">📊 {roundsTotal}</span>
          )}
        </span>
        {rankingMode && displayHcp != null && (
          <span className={`sidebar-sd ${displayHcp <= 5 ? "trend-up" : displayHcp <= 15 ? "sidebar-c-text-3" : "sidebar-sd-high"}`}>
            {hcpDisplay(displayHcp)}
          </span>
        )}
      </div>
    </a>
  );
}

/** React.memo: com até 2000 itens na sidebar, cada keystroke re-renderizava
 *  todos. Com o onSelect estável (useCallback no parent) e as restantes props
 *  primitivas/estáveis, só os itens cujo estado muda re-renderizam. */
const PlayerSidebarItem = React.memo(PlayerSidebarItemInner);
export default PlayerSidebarItem;
