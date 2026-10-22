/**
 * GlobalJuniorPage.tsx — Global Junior Golf Live (GJGL) Tournament Results
 *
 * Lê `public/data/gjgl-catalog.json` em runtime e, para cada slug com
 * dados scrapados (`public/data/gjgl/gjgl_{slug}.json`), constrói TDef
 * por escalão (U14/U18/U23).
 *
 * Estética inspirada na FPGPage:
 *   • Sidebar master-detail agrupada por ano
 *   • Toolbar com tabs de escalão
 *   • IntlTournView (componente partilhado) por escalão
 *
 * O GJGL só expõe escalões U14, U18, U23. Manuel (12y) compete em U14.
 */
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { Catalog, GjglIndex, GjglOverrides } from "../data/gjgl/types";
import { CATALOG_URL, buildGjglEntries, loadGjglOverrides } from "../data/gjgl/entries";

const GJGL_CONFIG: CircuitConfig = {
  routeBase: "/global-junior",
  title: "🏌️ Global Junior",
  color: "var(--color-good-dark)",
  textColor: "#fff",
  grouping: "year",
  filters: { search: true, year: true, toggles: ["manuel", "pt", "top10"] },
  // "Edições anteriores": família pelo nome (sem bandeira/ano) — agrupa a mesma
  // prova GJGL ano-a-ano.
  editionKey: (e) => tournamentFamilyKey(e.name),
  loadingMessage: "A carregar GJGL…",
};

export default function GlobalJuniorPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  // undefined = a carregar · null = falhou. O shell só arranca depois: as DATAS
  // vêm do índice e, sem elas, o torneio por omissão (o mais recente) saía
  // errado e ficava no URL (abria o UAE de Fevereiro — 14/10/2026).
  const [index, setIndex] = useState<GjglIndex | null | undefined>(undefined);
  const [ovr, setOvr] = useState<GjglOverrides | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedFetchJson<Catalog>(CATALOG_URL)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch((err) => { if (!cancelled) setCatalogError(String((err as Error).message || err)); });
    // Índice slim — enriquece a sidebar/header; falha silenciosa (opcional).
    cachedFetchJson<GjglIndex>("/data/gjgl-index.json")
      .then((d) => { if (!cancelled) setIndex(d ?? null); })
      .catch(() => { if (!cancelled) setIndex(null); });
    // Overrides de campo/distâncias (eventos PT) — falha silenciosa (opcional).
    loadGjglOverrides().then((o) => { if (!cancelled) setOvr(o); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => (catalog && index !== undefined ? buildGjglEntries(catalog, index, ovr) : []), [catalog, index, ovr]);
  const selectedId = useMemo<string | undefined>(
    () => (slug && entries.some((e) => e.id === slug) ? slug : undefined),
    [slug, entries],
  );

  if (catalogError) {
    return <div className="center-msg p-24">Erro a carregar catálogo: {catalogError}</div>;
  }
  if (!catalog || index === undefined) {
    return <LoadingState message="A carregar catálogo GJGL…" />;
  }

  return (
    <CircuitShell
      entries={entries}
      config={GJGL_CONFIG}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`/global-junior/${e.id}`)}
    />
  );
}
