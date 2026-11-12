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
  ManuelPill, ClubePill, NacionalPill, PillBadge, PccPill,
} from "./PillBadge";
import { tournamentPccs } from "../data/fpgUtils";
import { shortDateSlash } from "../utils/format";
import { FileBadge } from "./DataSources";
import { tournamentAces } from "../utils/aces";
import SidebarCard from "./SidebarCard";

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
      className={"sidebar-fpg-link" + (active ? " active" : "")}>🔗</button>
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
  /** tcode REAL no scoring da FPG de uma entrada ainda com tcode provisório
   *  (`tcodeReal` em featuredTournaments.ts) — é o que a carta mostra e liga. */
  _tcodeFpg?: string;
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

export function TournSidebarItem({ t, isActive, onClick, accentColor, extraPills, footer, href }: TournSidebarItemProps) {
  const nR       = t.rounds || 1;
  const nh       = t.nholes ?? (t.players[0] as any)?.nholes ?? (t.players[0] as any)?.par?.length ?? 18;
  const is9h     = nh <= 9;
  const isSserra = t.ccode === SSERRA_CCODE;
  const isPja    = t.pill === "PJA";
  // ManuelPill: torneios jogados têm Manuel em `players`; pre-jogo tem-no apenas
  // em _admissions/_draws — a flag `_manuelInscrito` é setada pelo caller nesses casos.
  const manuelPlayed = t.players.some(p => isManuel(p as any)) || !!t._manuelInscrito;
  const tcodes   = (t._tcodeFpg || t.tcode || "").split("+").map(s => s.trim()).filter(Boolean);
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

  return (
    <SidebarCard
      active={isActive} accent={accent} onSelect={onClick} href={href}
      name={t.name}
      nameExtra={nAces > 0 && (
        <span title={`${nAces} hole-in-one neste torneio`} className="u-fsh-0 u-fs-fs-12">🕳️</span>
      )}
      course={t.campo}
      pills={<>
        {/* tcode(s) + link individual */}
        {tcodes.map(tc => (
          <span key={tc} className="gap-2 u-d-inline-flex u-ai-center">
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
        {tournamentPccs(t).map(x => <PccPill key={x.round} pcc={x.pcc} round={nR > 1 ? x.round : undefined} />)}
        {manuelPlayed && <ManuelPill />}
        {!isSserra && <ClubePill clube={t.clube} ccode={t.ccode} />}
      </>}
      footer={footer}
      date={shortDate(t.date)}
      right={<>
        {t._sourceFile && <FileBadge path={t._sourceFile} />}
        {(t.playerCount ?? 0) > 0 && (
          <span className="u-fs-fs-11 u-c-text-muted">{t.playerCount} jog</span>
        )}
      </>}
    />
  );
}

