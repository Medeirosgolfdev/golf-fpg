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
 *   TeeDot            — quadrado colorido de tee
 *   TournPName        — nome clicável do jogador com ícone M/F e estrela Manuel
 */

import React from "react";
import SexBadge from "./SexBadge";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { C } from "../utils/colors";
import { fmtToPar } from "../utils/format";

/* ─── Constante do jogador especial (re-export de constants/manuel) ─── */
import { MANUEL_FED as _MANUEL_FED, isManuel } from "../constants/manuel";
export { _MANUEL_FED as MANUEL_FED, isManuel };

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

/* ─── Tee dot ─── */
export function TeeDot({ teeName }: { teeName?: string }) {
  if (!teeName) return <span className="muted">–</span>;
  const hex = getTeeHex(teeName);
  const border = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
  return (
    <span title={teeName} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", cursor: "default" }}>
      <span
        className="shrink-0"
        style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: hex, border, verticalAlign: "middle" }}
      />
    </span>
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
  kidsHash?: string;  // memberId ou nome encodificado para link /kids#hash
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

  // Kids link: procura por fedKey (quando presente) ou pelo nome normalizado
  const normN = name.toLowerCase().replace(/\s+/g, " ").trim();
  const kidsEntry = playersDB
    ? (fedKey && playersDB[fedKey]?.kidsHash
        ? playersDB[fedKey]
        : Object.values(playersDB).find(e => e.name?.toLowerCase().replace(/\s+/g, " ").trim() === normN))
    : undefined;
  const kidsHash = kidsEntry?.kidsHash;

  return (
    <span
      className={"tourn-pname" + (hasProfile ? " tourn-pname-link" : "")}
      onClick={hasProfile ? () => window.open("/jogadores/" + fedKey, "_blank") : undefined}
    >
      {truncName}
      {star && <span className="fs-10" style={{ marginLeft: 3 }}>⭐</span>}
      {sex && <SexBadge sex={sex} size="sm" className="ml-4" />}
      {kidsHash && (
        <a
          href="/kids"
          onClick={e => { e.stopPropagation(); e.preventDefault(); window.open(`/kids#${kidsHash}`, "_blank"); }}
          title="Ver em Kids"
          style={{ marginLeft: 4, fontWeight: 800, color: "var(--color-good-dark)",
            fontSize: 11, cursor: "pointer", textDecoration: "none" }}>
          ↗
        </a>
      )}
    </span>
  );
}
