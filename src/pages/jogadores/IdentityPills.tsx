/**
 * src/pages/jogadores/IdentityPills.tsx
 *
 * Linha de pills de identidade do jogador — PARTILHADA entre os 2 mundos do
 * detalhe (PlayerDetail rico e FederadoOnlyDetail cadastro/live), para os
 * headers falarem a mesma língua: #fed · sexo · bandeira (não-PT) · ano de
 * nascimento · escalão · clube, seguidos dos pills específicos de cada mundo
 * via children (P&P, tags, aces, …).
 */
import type { CSSProperties, ReactNode } from "react";
import { escCls } from "../../utils/playerUtils";
import { gf } from "../../utils/flagUtils";
import { ppPlayerUrl } from "../../data/federadosPPLoader";
import SexBadge from "../../ui/SexBadge";

/* Pill-link externo — mesmo estilo do "🏆 Rankings FPG" da DrivePage. */
const EXT_LINK_STYLE: CSSProperties = {
  textDecoration: "none", background: "var(--bg-muted)", color: "var(--accent)",
  border: "1px solid var(--border)", whiteSpace: "nowrap",
};

/** Links externos da ficha do jogador (FPG Scoring · My FPG · P&P) como
 *  pill-links — substituem a antiga coluna de ícones 🔗 solta à esquerda do
 *  nome (dh-iconcol). Partilhados pelos 2 mundos do detalhe. */
export function PlayerExtLinks({ fed, includePP = true }: { fed: string; includePP?: boolean }) {
  // Mesmo tamanho das restantes pills do cabeçalho (sem p-sm) — todas as
  // pills partilham padding/fonte/raio (2026-08-15). `includePP: false`
  // quando o mundo já tem botão P&P próprio (evita o duplicado na linha).
  return (
    <>
      <a className="p" style={EXT_LINK_STYLE}
        href={`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed}`}
        target="_blank" rel="noopener noreferrer"
        title="Ver ficha WHS no FPG Scoring" onClick={e => e.stopPropagation()}>FPG ↗</a>
      <a className="p" style={EXT_LINK_STYLE}
        href={`https://my.fpg.pt/Home/PlayerWHS.aspx?no=${fed}`}
        target="_blank" rel="noopener noreferrer"
        title="Ver ficha WHS no My FPG" onClick={e => e.stopPropagation()}>My FPG ↗</a>
      {includePP && (
        <a className="p" style={EXT_LINK_STYLE}
          href={ppPlayerUrl(fed)}
          target="_blank" rel="noopener noreferrer"
          title="Ver ficha Pitch & Putt no FPG Scoring (mundo paralelo)" onClick={e => e.stopPropagation()}>🏑 P&amp;P ↗</a>
      )}
    </>
  );
}

export default function IdentityPills({ fed, sex, dob, escalao, club, countryPrefix, country, children }: {
  fed: string;
  sex?: string | null;
  /** ISO YYYY-MM-DD (mostra só o ano; a data completa vai para o tooltip). */
  dob?: string | null;
  escalao?: string | null;
  club?: string | null;
  countryPrefix?: string | null;
  country?: string | null;
  children?: ReactNode;
}) {
  const showFlag = countryPrefix && countryPrefix !== "PT" && !countryPrefix.startsWith("@");
  // Linha de identidade UNIFORME (2026-08-15, 2ª iteração com a utilizadora):
  // cada dado é uma unidade individual (pill própria) mas TODAS com a mesma
  // forma discreta (fundo muted, mesmo raio) — sem arco-íris a disputar
  // atenção com os KPIs. Só o escalão leva a cor da casa, como TEXTO dentro
  // da pill neutra.
  return (
    <div className="jog-pills">
      <span className="p p-ident ip-fed">#{fed}</span>
      {(sex === "M" || sex === "F") && <SexBadge sex={sex} size="md" />}
      {showFlag && (
        <span className="p p-ident" title={country || countryPrefix!}>
          {gf(countryPrefix!)} {countryPrefix}
        </span>
      )}
      {dob && (
        <span className="p p-ident" title={`Data de nascimento: ${dob.split("-").reverse().join("/")}`}>
          {dob.slice(0, 4)}
        </span>
      )}
      {/* Escalão com a pill COLORIDA da casa — a mesma da sidebar (não
          inventar variantes: o utilizador cruza as duas constantemente). */}
      {escalao && <span className={`p p-${escCls(escalao)}`}>{escalao}</span>}
      {club && <span className="p p-ident">{club}</span>}
      {children}
    </div>
  );
}
