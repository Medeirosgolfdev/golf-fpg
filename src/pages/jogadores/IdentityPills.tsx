/**
 * src/pages/jogadores/IdentityPills.tsx
 *
 * Linha de pills de identidade do jogador — PARTILHADA entre os 2 mundos do
 * detalhe (PlayerDetail rico e FederadoOnlyDetail cadastro/live), para os
 * headers falarem a mesma língua: #fed · sexo · bandeira (não-PT) · ano de
 * nascimento · escalão · clube, seguidos dos pills específicos de cada mundo
 * via children (P&P, tags, aces, …).
 */
import type { ReactNode } from "react";
import { escCls } from "../../utils/playerUtils";
import { gf } from "../../utils/flagUtils";
import SexBadge from "../../ui/SexBadge";

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
  return (
    <div className="jog-pills">
      <span className="p p-fed">#{fed}</span>
      {(sex === "M" || sex === "F") && <SexBadge sex={sex} size="md" />}
      {showFlag && (
        <span className="p p-sm p-muted" title={country || countryPrefix!}>
          {gf(countryPrefix!)} {countryPrefix}
        </span>
      )}
      {dob && (
        <span className="p p-birth" title={`Data de nascimento: ${dob.split("-").reverse().join("/")}`}>
          {dob.slice(0, 4)}
        </span>
      )}
      {escalao && <span className={`p p-${escCls(escalao)}`}>{escalao}</span>}
      {club && <span className="p p-club">{club}</span>}
      {children}
    </div>
  );
}
