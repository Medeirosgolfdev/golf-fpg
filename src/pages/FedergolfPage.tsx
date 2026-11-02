/**
 * FedergolfPage.tsx — provas juvenis da Federazione Italiana Golf (/fig).
 *
 * Lê `public/data/federgolf-index.json` e, ao abrir uma prova,
 * `public/data/federgolf/{id}.json` (feitos por scripts/scrape-federgolf.js).
 * Tudo no CircuitShell partilhado: masculino e feminino da mesma prova são
 * separadores da mesma entrada.
 *
 *   /fig/:id             → uma prova
 *   /fig/info/:key       → categorias e legenda · ranking juvenil (menu ⓘ)
 *   /fig/jogador/:id     → as voltas de um jogador no ranking (?ano=)
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { FgIndice } from "../data/federgolf/types";
import { FG_INDEX_URL, buildFgEntries } from "../data/federgolf/entries";
import { FgCategoriasView, FgJogadorView, FgRankingView } from "./fig/FgInfoViews";

const FG_CONFIG: CircuitConfig = {
  routeBase: "/fig",
  title: "🇮🇹 Italia",
  color: "var(--color-good-dark)",
  textColor: "var(--text-on-color)",
  grouping: "year",
  filters: { search: true, year: true, escalao: true, sex: true, toggles: ["top10"] },
  escalaoSource: "it",
  editionKey: (e) => tournamentFamilyKey(e.name),
  loadingMessage: "A carregar Federgolf…",
};

export default function FedergolfPage() {
  const params = useParams<{ id?: string; source?: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [idx, setIdx] = useState<FgIndice | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedFetchJson<FgIndice>(FG_INDEX_URL)
      .then((d) => { if (!cancelled) setIdx(d); })
      .catch((err) => { if (!cancelled) setErro(String((err as Error).message || err)); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => (idx ? buildFgEntries(idx) : []), [idx]);
  const onInfo = params.source === "info";
  const id = params.source ? undefined : params.id;
  // Um link para a prova feminina abre a entrada conjunta.
  const selectedId = useMemo<string | undefined>(
    () => (id ? entries.find((e) => e.id === id || e.memberIds?.includes(id))?.id : undefined),
    [id, entries],
  );
  const config = useMemo<CircuitConfig>(() => ({
    ...FG_CONFIG,
    specialItems: idx ? [
      { key: "categorias", label: "📚 Categorias e legenda", render: () => <FgCategoriasView idx={idx} /> },
      { key: "ranking", label: "🏆 Ranking juvenil", render: () => <FgRankingView /> },
    ] : [],
  }), [idx]);

  // Ficha de um jogador do ranking: página inteira (como /egr/jogador/:id).
  if (params.source === "jogador" && params.id) return <FgJogadorView id={params.id} ano={search.get("ano")} />;
  if (erro) return <ErrorState message="Erro ao carregar as provas da Federgolf" detail={erro} />;
  if (!idx) return <LoadingState message="A carregar Federgolf…" />;

  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`/fig/${e.id}`)}
      selectedInfo={onInfo ? (params.id ?? null) : null}
      onSelectInfo={(key) => navigate(key ? `/fig/info/${key}` : "/fig")}
    />
  );
}
