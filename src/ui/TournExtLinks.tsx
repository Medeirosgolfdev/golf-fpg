/**
 * TournExtLinks — três links externos FPG (Inscrições, Draw, Scoring) num
 * só componente. Substitui o boilerplate repetido em DrivePage, FPGPage,
 * BJGTPage, JogadoresPage:
 *
 *   <a href={fpgAdmissionsUrl(t.ccode||"", t.tcode||"")} ...>Inscrições ↗</a>
 *   <a href={fpgDrawUrl(t.ccode||"", t.tcode||"")} ...>Draw ↗</a>
 *   <a href={fpgScoringUrl(t.ccode||"", t.tcode||"")} ...>Scoring ↗</a>
 *
 * Uso:
 *   <TournExtLinks ccode={t.ccode} tcode={t.tcode} />
 *
 *   // Selecciona apenas um subconjunto:
 *   <TournExtLinks ccode={t.ccode} tcode={t.tcode} show={["scoring"]} />
 */
import { fpgAdmissionsUrl, fpgDrawUrl, fpgScoringUrl } from "../utils/format";
import ExtLink from "./ExternalLink";

type LinkKey = "admissions" | "draw" | "scoring";

interface TournExtLinksProps {
  ccode: string | number | null | undefined;
  tcode: string | number | null | undefined;
  /** Quais links mostrar (default: todos os 3). */
  show?: LinkKey[];
  className?: string;
  /** Round number (1, 2, 3) para o link de draw. */
  round?: number;
}

const LABELS: Record<LinkKey, { label: string; title: string }> = {
  admissions: { label: "Inscrições ↗", title: "Inscrições (tournAdmissions) na Federação" },
  draw:       { label: "Draw ↗",       title: "Emparelhamentos (Draw) na Federação" },
  scoring:    { label: "Scoring ↗",    title: "Classificação (Scoring) na Federação" },
};

export default function TournExtLinks({
  ccode, tcode, show = ["admissions", "draw", "scoring"], className, round,
}: TournExtLinksProps) {
  const c = ccode == null ? "" : String(ccode);
  const t = tcode == null ? "" : String(tcode);
  if (!c && !t) return null;
  const url = (key: LinkKey): string => {
    if (key === "admissions") return fpgAdmissionsUrl(c, t);
    if (key === "draw") return fpgDrawUrl(c, t, round);
    return fpgScoringUrl(c, t);
  };
  return (
    <>
      {show.map(key => (
        <ExtLink
          key={key}
          href={url(key)}
          className={className ?? "tourn-ext-link"}
          title={LABELS[key].title}
        >
          {LABELS[key].label}
        </ExtLink>
      ))}
    </>
  );
}
