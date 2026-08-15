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
import { gf } from "../../utils/flagUtils";
import SexBadge from "../../ui/SexBadge";
import { PillBadge, EscPill, SIDEBAR_ACCENT } from "../../ui/PillBadge";
import { HCP_UNESTABLISHED_THRESHOLD, type EscHcpStats } from "./filterPlayers";

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
  <div style={{ height: "0.5px", background: "var(--border-light, rgba(0,0,0,.08))", margin: "4px 0" }} />
);

/** Pill HCP com 3 níveis de destaque relativamente ao escalão:
 *   - TOP 25%  → verde (standout — "dos melhores do escalão")
 *   - MEIO 50% → pill neutro (estado maioritário e "normal")
 *   - BOTTOM 25% → outline esmaecido ("abaixo do escalão")
 *
 *  Usa percentis dentro do mesmo escalão para remover a falsa hierarquia
 *  do "HCP baixo = melhor em absoluto" (um Sub-10 com HCP 25 pode ser dos
 *  melhores do escalão; um Sub-18 com 15 pode ser dos piores do seu).
 *
 *  Nota de design: experimentámos 4 níveis (quartis) mas era confuso —
 *  dois jogadores com HCP 11.8 e 11.9 podiam cair em quartis adjacentes
 *  e mudar de cor por ruído estatístico. Com 3 níveis, só o topo e o
 *  fundo têm sinal visual, os 50% do meio ficam todos iguais. */
export function HcpPill({ hcp, escHcps }: { hcp: number | null; escHcps?: EscHcpStats }) {
  if (hcp == null || !isFinite(hcp)) return null;

  // Caso especial: HI ainda não estabelecido (jogador em formação)
  if (hcp >= HCP_UNESTABLISHED_THRESHOLD) {
    return (
      <span
        className="p p-sm"
        style={{ background: "transparent", color: "var(--text-3)", borderColor: "transparent" }}
        title={`HCP ${hcpDisplay(hcp)} — HI ainda não estabelecido (jogador em formação, excluído das stats do escalão)`}
      >
        HCP {hcpDisplay(hcp)}
      </span>
    );
  }

  let style: React.CSSProperties;
  let tooltip = `HCP ${hcpDisplay(hcp)}`;
  if (escHcps && escHcps.count >= 5) {
    const { p25, p75, count } = escHcps;
    if (hcp <= p25) {
      // Topo do escalão — único destaque forte
      style = { background: "var(--color-good)", color: "#fff", borderColor: "transparent" };
      tooltip += ` · TOP 25% do escalão (entre ${count} jogadores)`;
    } else if (hcp > p75) {
      // Fundo do escalão — sem fundo, sem borda, só texto esmaecido
      style = { background: "transparent", color: "var(--text-3)", borderColor: "transparent" };
      tooltip += ` · Bottom 25% do escalão (entre ${count} jogadores)`;
    } else {
      // Meio 50% — o estado "normal", sem sinal forte
      style = { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" };
      tooltip += ` · típico do escalão (entre ${count} jogadores)`;
    }
  } else {
    // Sem estatísticas de escalão — pill neutro
    style = { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" };
    if (escHcps) tooltip += ` · escalão com poucos jogadores (${escHcps.count})`;
  }
  return (
    <span className="p p-sm" style={style} title={tooltip}>
      HCP {hcpDisplay(hcp)}
    </span>
  );
}

/** Pill de tag (PJA, inscrito-nacional, no-scrape, hidden) */
export function TagPill({ tag }: { tag: string }) {
  const t = tag.toLowerCase();
  // Mapeamento tag → estilo + label
  if (t === "pja") return <PillBadge pill="PJA" />;
  if (t === "inscrito-nacional") {
    return (
      <span
        className="p p-sm"
        style={{ background: "var(--color-good-dark)", color: "#fff", borderColor: "transparent" }}
        title="Inscrito no Campeonato Nacional 2026"
      >
        🏆 CN26
      </span>
    );
  }
  if (t === "no-scrape") {
    return (
      <span
        className="p p-sm"
        style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderColor: "var(--border)" }}
        title="Scraper salta este jogador (dados congelados)"
      >
        ⏸ sem scrape
      </span>
    );
  }
  if (t === "hidden") {
    return (
      <span
        className="p p-sm"
        style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderColor: "var(--border)" }}
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
  onClick: (e: React.MouseEvent) => void;
};

export default function PlayerSidebarItem({
  p, isActive, displayClub, displayEscalao, displayHcp, rank, rankingMode, isNewRound,
  escHcps, roundsTotal, roundsCurrentYear, ppHcp, onClick,
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
  const showFlag = countryPrefix && countryPrefix !== "PT" && !countryPrefix.startsWith("@");

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
    isNacional ? "var(--color-good-dark, var(--color-good-dark))" :
    isPja      ? SIDEBAR_ACCENT.pja :
    isOrphan   ? "var(--color-warn)" :
    escBg      ??
    (isFedsOnly ? "var(--border)" : SIDEBAR_ACCENT.default);

  // Club — fallback para fed code se não houver clube
  const clubText = typeof displayClub === "string" && displayClub.trim() ? displayClub : null;

  return (
    <a
      href={`/jogadores/${p.fed}`}
      className={`course-item ${isActive ? "active" : ""}`}
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${accent}`,
        paddingLeft: 10,
        borderRadius: "0 6px 6px 0",
        opacity: isFedsOnly ? 0.82 : 1,
      }}
    >
      {/* Linha 1: rank (se rankingMode) + flag + nome + sexo + indicadores */}
      <div className="course-item-name flex-center" style={{ marginBottom: 3 }}>
        {rankingMode && rank != null && (
          <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}>
            {rank}
          </span>
        )}
        <span className="flex-1" style={{ minWidth: 0 }}>
          {showFlag && <span className="mr-4" title={pm._federadoRaw?.country}>{gf(countryPrefix!)}</span>}
          <span style={{ fontWeight: isActive ? 700 : 600 }}>{p.name}</span>
          <SexBadge sex={p.sex} size="sm" className="ml-4" />
          {isNewRound && <span className="new-round-dot ml-4" title="Ronda recente (< 7 dias)" />}
          {isFedsOnly && <span className="ml-4 c-muted fs-10" title="Só cadastro FPG — sem análise de scorecards">ø</span>}
          {isOrphan && <span className="ml-4 fs-10" title="Não encontrado na FPG activa (quotas por regularizar?)" style={{ color: "var(--color-warn-vivid)" }}>⚠</span>}
          {hcpChanged && <span className="ml-4 fs-10" title={`FPG actual: HCP ${pm._fpgDiffs?.hcpChanged?.fpg}`} style={{ color: "var(--color-warn-vivid)" }}>⚡</span>}
        </span>
      </div>

      <PlayerSidebarSep />

      {/* Linha 2: pills — escalão · clube · HCP · tags */}
      <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center", margin: "3px 0" }}>
        {displayEscalao && <EscPill esc={displayEscalao} />}
        {clubText && (
          // Nota: NÃO usamos ClubePill aqui porque o seu helper `shortClubFromField`
          // rejeita ccode="000" (reservado à FPG) e devolve null nesse caso.
          // O `displayClub` vem de `clubShort(p)` já normalizado — renderizamos
          // directamente com a mesma classe .p-club para visual consistente.
          <span className="p p-sm p-club" title={clubText}>{clubText}</span>
        )}
        <HcpPill hcp={displayHcp} escHcps={escHcps} />
        {ppHcp != null && (
          <span className="p p-sm" title={`Handicap Pitch & Putt: ${ppHcp}`}
            style={{ background: "var(--badge-pp, var(--badge-pp))", color: "#fff", border: "1px solid var(--badge-pp, var(--badge-pp))" }}>
            🏑 {ppHcp}
          </span>
        )}
        {tags.map(t => <TagPill key={t} tag={t} />)}
      </div>

      <PlayerSidebarSep />

      {/* Linha 3: fed# + rondas (total · este ano) + rank HCP (se rankingMode) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>#{p.fed}</span>
          {/* Rondas neste ano civil — mesma fonte (data.json) que o detalhe header.
              Usado para ordenação por defeito. */}
          {(roundsCurrentYear != null && roundsCurrentYear > 0) && (
            <span title={`${roundsCurrentYear} rondas em ${new Date().getFullYear()}`} style={{ color: "var(--color-good-dark, var(--color-good-dark))", fontWeight: 600 }}>🗓 {roundsCurrentYear}</span>
          )}
          {/* Total — também do data.json. */}
          {(roundsTotal != null && roundsTotal > 0) && (
            <span title={`${roundsTotal} voltas no total`} style={{ opacity: 0.7 }}>📊 {roundsTotal}</span>
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
