// @refresh reset
/**
 * TournSidebarItem — item de sidebar unificado (design E3)
 * Todos os pills vêm de PillBadge.tsx — fonte única.
 */

import React from "react";
import { isManuel } from "./tournamentPrimitives";
import {
  SIDEBAR_ACCENT,
  EscPill, RoundPill, TcodePill, NineHPill, SserraPill, JuniorPill,
  ManuelPill, ClubePill, NacionalPill, PillBadge,
} from "./PillBadge";
import { shortDateSlash } from "../utils/format";
import { FileBadge } from "./DataSources";
import { tournamentAces } from "../utils/aces";

export const SSERRA_CCODE = "007";

const shortDate = (d?: string) => shortDateSlash(d, true);

function openFpg(ccode?: string, tcode?: string) {
  if (!ccode || !tcode) return;
  window.open(
    `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${String(ccode).padStart(3, "0")}&tcode=${tcode.replace(/_R\d+$|_Total$/, "")}`,
    "_blank", "noopener,noreferrer"
  );
}

function LinkBtn({ ccode, tcode, active }: { ccode?: string; tcode?: string; active: boolean }) {
  if (!ccode || !tcode) return null;
  return (
    <button type="button"
      onClick={e => { e.stopPropagation(); openFpg(ccode, tcode); }}
      style={{
        background: "none", border: "none", padding: "0 1px",
        cursor: "pointer", color: "var(--accent)",
        opacity: active ? 1 : 0.5,
        fontSize: "var(--fs-11)", lineHeight: 1,
        display: "inline-flex", alignItems: "center", verticalAlign: "middle",
      }}>🔗</button>
  );
}

export interface SidebarItemTournament {
  tcode?: string; ccode?: string; name: string; campo?: string;
  clube?: string | null; date?: string; playerCount?: number;
  rounds?: number; nholes?: number; series?: string; escalao?: string | null;
  players: { fedCode?: string; fed?: string; name?: string; nholes?: number; par?: number[]; roundScores?: unknown[] }[];
  pill?: string;
  _isSynthetic?: boolean; _subRounds?: unknown[]; _clubesEsc?: string;
  /** Caminho do ficheiro JSON de onde este torneio veio — mostrado como pill discreto.
   *  Hover: caminho completo. Clique direito: lista de torneios desse ficheiro. */
  _sourceFile?: string;
  /** Override para torneios pre-jogo onde o Manuel está em _admissions/_draws mas
   *  não em `players`. Quando true, o ManuelPill é mostrado mesmo que `players` esteja
   *  vazio. Preenchido pelo caller (FPGPage) via `tournamentHasManuel(t)`. */
  _manuelInscrito?: boolean;
}

export interface TournSidebarItemProps {
  t: SidebarItemTournament;
  isActive: boolean;
  onClick: () => void;
  accentColor?: string;
  extraPills?: React.ReactNode;
  /** Conteúdo extra a mostrar dentro do card, entre os pills e a linha de data/jog */
  footer?: React.ReactNode;
  /** URL canónica para deep-link. Se fornecida, o item é renderizado como `<a href>`
   *  permitindo Ctrl/Cmd+click para abrir em nova aba e "Copiar endereço do link" no
   *  menu de contexto. O onClick continua a ser chamado para click normal (previne
   *  default). Se omitida, é um `<div>` puro com onClick. */
  href?: string;
}

const Sep = () => <div style={{ height: "0.5px", background: "var(--border-light,rgba(0,0,0,.08))", margin: "4px 0" }} />;

export function TournSidebarItem({ t, isActive, onClick, accentColor, extraPills, footer, href }: TournSidebarItemProps) {
  const nR       = t.rounds || 1;
  const nh       = t.nholes ?? (t.players[0] as any)?.nholes ?? (t.players[0] as any)?.par?.length ?? 18;
  const is9h     = nh <= 9;
  const isSserra = t.ccode === SSERRA_CCODE;
  const isPja    = t.pill === "PJA";
  // ManuelPill: torneios jogados têm Manuel em `players`; pre-jogo tem-no apenas
  // em _admissions/_draws — a flag `_manuelInscrito` é setada pelo caller nesses casos.
  const manuelPlayed = t.players.some(p => isManuel(p as any)) || !!t._manuelInscrito;
  const tcodes   = (t.tcode || "").split("+").map(s => s.trim()).filter(Boolean);
  // Holes-in-one no torneio (dedup por jogador+buraco — os players podem vir
  // repetidos por ronda em grupos multi-ronda).
  const nAces = (() => {
    const seen = new Set<string>();
    for (const a of tournamentAces(t.players as unknown as Parameters<typeof tournamentAces>[0])) {
      seen.add((a.name || "").toLowerCase().trim() + "|" + a.hole);
    }
    return seen.size;
  })();
  const hasNacional = (t.name || "").toUpperCase().includes("NACIONAL");
  const hasJunior   = /JUNIOR|J[ÚU]NIOR/i.test(t.name || "");

  const accent = accentColor ?? (
    isSserra    ? SIDEBAR_ACCENT.sserra  :
    isPja       ? SIDEBAR_ACCENT.pja     :
    t.series === "clubes"    ? SIDEBAR_ACCENT.clubes    :
    t.series === "challenge" ? SIDEBAR_ACCENT.challenge :
    t.series === "aquapor"   ? SIDEBAR_ACCENT.aquapor   :
    t.series === "tour"      ? SIDEBAR_ACCENT.tour      :
    SIDEBAR_ACCENT.default
  );

  // Wrap the item in <a href> if href is provided — allows native
  // Ctrl/Cmd+click "open in new tab" and right-click "copy link address".
  const commonProps = {
    className: `course-item ${isActive ? "active" : ""}`,
    style: { borderLeft: `4px solid ${accent}`, borderRadius: "0 6px 6px 0", cursor: "pointer",
             color: "inherit", textDecoration: "none", display: "block" } as React.CSSProperties,
  };
  const Wrapper: any = href ? "a" : "div";
  const wrapperProps = href ? {
    href,
    onClick: (e: React.MouseEvent) => {
      // Click normal → chamar onClick local (seleciona na sidebar sem navegar).
      // Ctrl/Cmd/Shift/middle-click → deixar comportamento default (nova aba).
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      onClick();
    },
  } : {
    onClick,
    role: "button",
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") onClick(); },
  };
  return (
    <Wrapper {...commonProps} {...wrapperProps}>
      {/* Linha 1: nome */}
      <div className="gap-4" style={{ display: "flex", alignItems: "flex-start", marginBottom: 3 }}>
        <span className="course-item-name" style={{ flex: 1, fontSize: "var(--fs-12)", fontWeight: isActive ? 700 : 500, lineHeight: 1.3 }}>
          {t.name}
        </span>
        {nAces > 0 && (
          <span title={`${nAces} hole-in-one neste torneio`} style={{ flexShrink: 0, fontSize: "var(--fs-12)" }}>🕳️</span>
        )}
      </div>

      {/* Linha 2: campo */}
      {t.campo && (
        <div style={{ fontSize: "var(--fs-12)", color: "var(--text-2)", fontWeight: 500, marginBottom: 3 }}>
          📍 {t.campo}
        </div>
      )}

      <Sep />

      {/* Linha 3: pills */}
      <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center", margin: "3px 0" }}>

        {/* tcode(s) + link individual */}
        {tcodes.map(tc => (
          <span key={tc} className="gap-2" style={{ display: "inline-flex", alignItems: "center" }}>
            <TcodePill tc={tc} />
            <LinkBtn ccode={t.ccode} tcode={tc} active={isActive} />
          </span>
        ))}

        <RoundPill nR={nR} />
        {is9h && <NineHPill />}
        {isSserra && <SserraPill />}
        {isPja && <PillBadge pill="PJA" />}
        {t.escalao && <EscPill esc={t.escalao} />}
        {hasNacional && t.pill !== "NACIONAL" && <NacionalPill />}
        {hasJunior && <JuniorPill />}
        {extraPills}
        {manuelPlayed && <ManuelPill />}
        {!isSserra && <ClubePill clube={t.clube} ccode={t.ccode} />}
      </div>

      <Sep />

      {/* Footer extra (conteúdo específico de cada página, ex: barra de inscritos USKids) */}
      {footer}

      {/* Linha 4: data + nº jog + origem do ficheiro */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)", flexShrink: 0 }}>{shortDate(t.date)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {t._sourceFile && <FileBadge path={t._sourceFile} />}
          {(t.playerCount ?? 0) > 0 && (
            <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>{t.playerCount} jog</span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

