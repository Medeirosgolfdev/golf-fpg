/**
 * src/pages/jogadores/eventInfo.tsx
 *
 * Pills e links de prova partilhados pelas vistas de rondas da JogadoresPage
 * (ByDateView, ByCourseView, FederadoRoundsTable): pill efectiva INTL/REGIONAL/
 * NACIONAL, pill de origem (EDS/Treino/…), links externos e a heurística
 * campo → ccode para abrir o torneio na federação.
 */
import { fpgScoringUrl } from "../../utils/format";
import { PillBadge } from "../../ui/PillBadge";

/** Retorna a pill efectiva: usa _pill dos dados ou auto-detecta INTL/REGIONAL/NACIONAL */
export function effectivePill(round: { _pill?: string; course?: string; scoreOrigin?: string; eventName?: string }, courseName?: string): string {
  if (round._pill) return round._pill;
  const o = (round.scoreOrigin || "").trim().toUpperCase();
  if (o === "INTERN") return "INTL";
  const c = (courseName || round.course || "").trim().toUpperCase();
  if (c === "INTERNACIONAL" || c === "INTERNATIONAL") return "INTL";
  // Detecção pelo nome da prova: "Campeonato Regional...", "Campeonato Nacional..."
  const ev = (round.eventName || "").trim();
  if (/regional/i.test(ev)) return "REGIONAL";
  if (/nacional/i.test(ev)) return "NACIONAL";
  return "";
}

/* ─── Origin Pill (EDS / Treino / Extra / Import / Indiv) ─── */
const ORIGIN_MAP: Record<string, { label: string; cls: string }> = {
  EDS:     { label: "EDS",     cls: "p p-sm p-origin p-eds" },
  IMPORT:  { label: "IMPORT",  cls: "p p-sm p-origin p-import" },
  INDIV:   { label: "INDIV",   cls: "p p-sm p-origin p-indiv" },
  TREINO:  { label: "TREINO",  cls: "p p-sm p-origin p-treino" },
  EXTRA:   { label: "EXTRA",   cls: "p p-sm p-origin p-extra" },
};
export function OriginPill({ origin }: { origin?: string }) {
  if (!origin) return null;
  const key = origin.trim().toUpperCase();
  // "Torn" = torneio normal, "Intern" = tratado pelo effectivePill/PillBadge
  if (!key || key === "TORN" || key === "INTERN") return null;
  const entry = ORIGIN_MAP[key];
  if (!entry) return null;
  return <span className={entry.cls}>{entry.label}</span>;
}

/* ─── External Links (classificação, etc.) ─── */
export function LinkBtns({ links }: { links?: Record<string, string> }) {
  if (!links || Object.keys(links).length === 0) return null;
  return (
    <>
      {Object.entries(links).map(([label, url]) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={label.replace(/_/g, " ")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: "var(--fs-10)", marginLeft: 4, color: "var(--chart-2)", textDecoration: "none",
            verticalAlign: "middle",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          🔗
        </a>
      ))}
    </>
  );
}

/* ─── Course → ccode heuristic (organizador típico = clube anfitrião) ─── */
const COURSE_TO_CCODE: { match: RegExp; ccode: string }[] = [
  { match: /santo\s*da\s*serra/i,            ccode: "007" }, // CGSS
  { match: /aroeira/i,                         ccode: "009" }, // Aroeira (cobre PGA Aroeira No.X)
  { match: /miramar/i,                         ccode: "003" },
  { match: /estoril/i,                         ccode: "004" },
  { match: /oporto/i,                          ccode: "005" },
  { match: /vidago/i,                          ccode: "006" },
  { match: /montebelo/i,                       ccode: "008" },
  { match: /troia/i,                           ccode: "010" },
  { match: /quinta\s*do\s*peru/i,             ccode: "011" },
  { match: /belas\s*club/i,                   ccode: "068" },
  { match: /belas/i,                           ccode: "012" },
  { match: /qta\s*marinha|quinta\s*da\s*marinha/i, ccode: "013" },
  { match: /\bLSC\b|lisbon\s*sports/i,       ccode: "014" },
  { match: /penha\s*longa/i,                  ccode: "015" },
  { match: /oitavos/i,                         ccode: "016" },
  { match: /ribagolfe/i,                       ccode: "017" },
  { match: /montado/i,                         ccode: "018" },
  { match: /morgado/i,                         ccode: "019" },
  { match: /palmares/i,                        ccode: "020" },
  { match: /castro\s*marim/i,                 ccode: "021" },
  { match: /vale\s*do\s*lobo/i,               ccode: "022" },
  { match: /vilamoura/i,                       ccode: "023" },
  { match: /quinta\s*do\s*lago/i,             ccode: "024" },
  { match: /boavista/i,                        ccode: "025" },
  { match: /silves/i,                          ccode: "026" },
  { match: /alamos/i,                          ccode: "040" },
  { match: /pinheiros\s*altos/i,              ccode: "041" },
  { match: /penina/i,                          ccode: "042" },
  { match: /vila\s*sol/i,                     ccode: "046" },
  { match: /salgados/i,                        ccode: "047" },
  { match: /jamor/i,                           ccode: "055" },
  { match: /beloura/i,                         ccode: "060" },
  { match: /palheiro/i,                        ccode: "086" },
  { match: /porto\s*santo/i,                  ccode: "087" },
];

export function ccodeFromCourse(course?: string): string | null {
  if (!course) return null;
  for (const { match, ccode } of COURSE_TO_CCODE) {
    if (match.test(course)) return ccode;
  }
  return null;
}

/* ─── Combined event info: name + EDS badge + pill + links ─── */
export function EventInfo({ name, origin, pill, links, fed, tcode, ccode, course }: {
  name?: string; origin?: string; pill?: string; links?: Record<string, string>;
  /** Fed code do jogador — fallback final para link à página WHS. */
  fed?: string;
  /** Tournament code FPG. */
  tcode?: string;
  /** Club code do organizador (do scorecard, post-pipeline). Quando disponível
   *  é a fonte mais precisa. Para rondas pré-pipeline, cai para ccodeFromCourse. */
  ccode?: string;
  /** Nome do campo — usado para inferir ccode do clube anfitrião quando não
   *  temos o ccode exacto do scorecard. Funciona para torneios típicos cujo
   *  organizador é o clube onde se joga (regionais, championships de clube). */
  course?: string;
}) {
  // Prioridade do link "Abrir torneio na federação":
  //   1. _links.classif* — URL curado pelo pipeline (sempre correcto).
  //   2. tcode + ccode (do scorecard, exacto) — URL canónica FPG.
  //   3. tcode + ccodeFromCourse (heurística) — URL com ccode do clube
  //      anfitrião. Funciona para a maioria dos torneios organizados pelo
  //      próprio clube (regionais, club championships). Para torneios
  //      organizados pela FPG num clube anfitrião (ex: Nacional Sub-12 em
  //      Aroeira), o ccode estaria errado mas isso normalmente já tem _links.
  //   4. PlayerWHS — fallback final (página do jogador, não do torneio).
  const classifUrl = links
    ? Object.entries(links).find(([k]) => /^classif/i.test(k))?.[1] ?? null
    : null;
  const effectiveCcode = ccode || ccodeFromCourse(course);
  const tcodeUrl = !classifUrl && tcode && effectiveCcode
    ? fpgScoringUrl(effectiveCcode, tcode)
    : null;
  const isFpgTorn = (origin || "").trim().toUpperCase() === "TORN";
  const fallbackFpgUrl = !classifUrl && !tcodeUrl && isFpgTorn && fed
    ? `https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed}`
    : null;
  const fedUrl = classifUrl || tcodeUrl || fallbackFpgUrl;
  const fedTitle = classifUrl
    ? "Abrir classificação do torneio na federação"
    : tcodeUrl
    ? "Abrir torneio na federação"
    : "Abrir histórico WHS do jogador na federação (link directo ao torneio não disponível)";
  const nameNode = fedUrl ? (
    <a
      href={fedUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={fedTitle}
      className="muted"
      style={{ textDecoration: "none" }}
      onClick={e => e.stopPropagation()}
    >{name || ""}</a>
  ) : (
    <span className="muted">{name || ""}</span>
  );
  // Ícone 🔗 quando NÃO há _links curado mas temos algum fallback (tcode ou fed).
  const showFallbackIcon = !classifUrl && fedUrl;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {nameNode}
      <OriginPill origin={origin} />
      <PillBadge pill={pill} />
      <LinkBtns links={links} />
      {showFallbackIcon && (
        <a
          href={fedUrl!}
          target="_blank"
          rel="noopener noreferrer"
          title={fedTitle}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: "var(--fs-10)", color: "var(--text-muted)", textDecoration: "none",
            verticalAlign: "middle", opacity: 0.6,
          }}
          onClick={e => e.stopPropagation()}
        >🔗</a>
      )}
    </span>
  );
}
