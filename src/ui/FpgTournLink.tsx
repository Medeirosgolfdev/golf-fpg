/**
 * src/ui/FpgTournLink.tsx — o nome de um torneio a abrir a classificação na FPG
 * («Taça do Clube ↗»). A mesma peça na pesquisa de atletas, no painel do Santo
 * da Serra e no top de clubes — estava escrita à mão nos três (10/11/2026).
 */
import ExtLink from "./ExternalLink";
import { fpgScoringUrl } from "../utils/format";

export default function FpgTournLink({ ccode, tcode, name }: { ccode: string; tcode: string; name: string }) {
  return (
    <ExtLink href={fpgScoringUrl(ccode, tcode)} className="u-c-accent u-td-none" title="Ver torneio na FPG (nova janela)">
      {name} ↗
    </ExtLink>
  );
}
