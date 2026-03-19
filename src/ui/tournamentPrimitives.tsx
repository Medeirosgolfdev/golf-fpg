/**
 *
 * ═══════════════════════════════════════════════════════════════
 * FAMÍLIA DE TABELAS — MANTER SEMPRE EM SINCRONIA
 * ═══════════════════════════════════════════════════════════════
 * Este ficheiro faz parte de uma família de componentes de tabela
 * que partilham as mesmas regras visuais (App.css: .sc-lb):
 *
 *   • ScorecardLeaderboard.tsx   — leaderboard buraco-a-buraco
 *   • MultiRoundLeaderboard.tsx  — leaderboard multi-ronda
 *   • CrossSeasonTable.tsx       — tabela temporada cruzada
 *   • tournamentPrimitives.tsx   — primitivas partilhadas
 *
 * Ao alterar qualquer um, verifica se os outros precisam de ser
 * actualizados: fontes, padding, bordas, cores, larguras de colunas.
 * ═══════════════════════════════════════════════════════════════
 * tournamentPrimitives.tsx
 *
 * Primitivos de UI partilhados entre DrivePage, TorneiosAnalisePage, BJGTPage e similares.
 * Importar daqui em vez de redefinir em cada página.
 *
 * Exporta:
 *   MANUEL_FED        — código de federado do Manuel
 *   isManuel()        — detecta o jogador especial
 *   fmtTP()           — formata to-par: +3 / -2 / E / –
 *   tpColor()         — cor CSS para to-par (vermelho/verde/undefined)
 *   ESC_STYLE         — mapa de cores por escalão
 *   EscPill           — badge colorido de escalão
 *   TeeDot            — quadrado colorido de tee
 *   TournPName        — nome clicável do jogador com ícone M/F e estrela Manuel
 */

import React from "react";
import SexBadge from "./SexBadge";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { C } from "../utils/colors";
import { fmtToPar } from "../utils/format";

/* ─── Constante do jogador especial ─── */
export const MANUEL_FED = "52884";

export function isManuel(p: { name?: string; fed?: string; fedCode?: string }): boolean {
  const fed = p.fed || p.fedCode;
  if (fed === MANUEL_FED) return true;
  const n = p.name || "";
  return n.includes("Manuel") && (n.includes("Medeiros") || n.includes("Goulartt"));
}

/* ─── Formatação to-par ─── */
/** @deprecated Usa fmtToPar de utils/format. Mantido por compatibilidade. */
export const fmtTP = (v: number | null | undefined): string => fmtToPar(v, "–");

export function tpColor(v: number | null | undefined): string | undefined {
  if (v == null) return undefined;
  if (v < 0) return "var(--color-good)";   // abaixo do par → bom
  if (v > 0) return "var(--color-danger)"; // acima do par → mau
  return undefined;                         // par (E) → neutro
}

/* ─── Escalão pill ─── */
export const ESC_STYLE: Record<string, { bg: string; color: string }> = {
  "sub10": { bg: C.esc.sub10.bg, color: C.esc.sub10.fg },
  "sub12": { bg: C.esc.sub12.bg, color: C.esc.sub12.fg },
  "sub14": { bg: C.esc.sub14.bg, color: C.esc.sub14.fg },
  "sub16": { bg: C.esc.sub16.bg, color: C.esc.sub16.fg },
  "sub18": { bg: C.esc.sub18.bg, color: C.esc.sub18.fg },
};

export function EscPill({ esc }: { esc: string }) {
  if (!esc) return null;
  const key = esc.toLowerCase().replace(/[\s-]/g, "");
  const s = ESC_STYLE[key] ?? { bg: "var(--bg-hover)", color: "var(--text-muted)" };
  return (
    <span className="p p-sm" style={{ background: s.bg, color: s.color, borderColor: "transparent" }}>
      {esc}
    </span>
  );
}

/* ─── Tee dot ─── */
export function TeeDot({ teeName }: { teeName?: string }) {
  if (!teeName) return <span className="muted">–</span>;
  const hex = getTeeHex(teeName);
  const border = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
  return (
    <span
      title={teeName}
      style={{
        display: "inline-block", width: 12, height: 12,
        borderRadius: 3, background: hex, border,
        verticalAlign: "middle", cursor: "default", flexShrink: 0,
      }}
    />
  );
}

/* ─── SD pill inline (sem <td>) ─── */
export function SDPill({
  sd, source, hcp,
}: {
  sd: number | null;
  source?: string | null;
  hcp?: number | null;
}) {
  if (sd == null) return <span className="muted">–</span>;
  const cls = sdClassByHcp(sd, hcp ?? null);
  const tip = source === "fpg" ? "" : source === "ags" ? "~" : "≈";
  return (
    <span className={"p p-sm p-" + cls}>
      {sd.toFixed(1)}
      {tip && <span className="fs-10 op-6"> {tip}</span>}
    </span>
  );
}

/* ─── Nome do jogador ─────────────────────────────────────────
   Props unificadas: aceita `fed` (Drive) ou `fedCode` (Diversos).
   highlight=true → mostra a estrela ⭐ (sobrepõe-se à detecção automática).
   ─────────────────────────────────────────────────────────── */
export interface PlayersDBEntry {
  escalao?: string;
  name?: string;
  club?: { short?: string };
  sex?: string;
  hcp?: number;
  hcpExact?: number;
  region?: string;
}
export type PlayersDB = Record<string, PlayersDBEntry>;

export function TournPName({
  name,
  fed,
  fedCode,
  playersDB,
  highlight,
  maxLen = 26,
}: {
  name: string;
  fed?: string;
  fedCode?: string;
  playersDB?: PlayersDB;
  /** Força estrela. Se omitido, detecta automaticamente via isManuel() */
  highlight?: boolean;
  maxLen?: number;
}) {
  const fedKey = fed || fedCode;
  const hasProfile = !!(fedKey && playersDB && playersDB[fedKey]);
  const sex = fedKey && playersDB ? playersDB[fedKey]?.sex : undefined;
  const star = highlight ?? isManuel({ name, fed, fedCode });
  const truncName = name.length > maxLen ? name.substring(0, maxLen - 2) + "…" : name;

  return (
    <span
      className={"tourn-pname" + (hasProfile ? " tourn-pname-link" : "")}
      onClick={hasProfile ? () => window.open("/jogadores/" + fedKey, "_blank") : undefined}
    >
      {truncName}
      {star && <span style={{ marginLeft: 3, fontSize: 10 }}>⭐</span>}
      {sex && <SexBadge sex={sex} size="sm" className="ml-4" />}
    </span>
  );
}
