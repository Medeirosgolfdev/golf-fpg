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
 *   • TournamentDetail (componente partilhado) por escalão
 *
 * O GJGL só expõe escalões U14, U18, U23. Manuel (12y) compete em U14.
 */
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useJson } from "../hooks/useJson";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { Catalog, GjglIndex, GjglOverrides } from "../data/gjgl/types";
import { CATALOG_URL, buildGjglEntries, loadGjglOverrides } from "../data/gjgl/entries";
import ErrorState from "../ui/ErrorState";

const GJGL_CONFIG: CircuitConfig = {
  routeBase: "/global-junior",
  title: "🏌️ Global Junior",
  color: "var(--color-good-dark)",
  textColor: "var(--text-on-color)",
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
  const { data: catalog, error: catalogError } = useJson<Catalog>(CATALOG_URL);
  // Índice slim — enriquece a sidebar/header; falha silenciosa (opcional → null).
  // O shell só arranca depois de ele chegar (ou falhar): as DATAS vêm do índice e,
  // sem elas, o torneio por omissão (o mais recente) saía errado e ficava no URL
  // (abria o UAE de Fevereiro — 14/10/2026).
  const { data: index, loading: indexLoading } = useJson<GjglIndex>("/data/gjgl-index.json");
  const [ovr, setOvr] = useState<GjglOverrides | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Overrides de campo/distâncias (eventos PT) — falha silenciosa (opcional).
    loadGjglOverrides().then((o) => { if (!cancelled) setOvr(o); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => (catalog && !indexLoading ? buildGjglEntries(catalog, index, ovr) : []), [catalog, index, indexLoading, ovr]);
  const selectedId = useMemo<string | undefined>(
    () => (slug && entries.some((e) => e.id === slug) ? slug : undefined),
    [slug, entries],
  );

  if (catalogError) {
    return <ErrorState message="Erro ao carregar o catálogo" detail={catalogError} />;
  }
  if (!catalog || indexLoading) {
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
