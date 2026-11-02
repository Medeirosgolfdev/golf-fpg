/**
 * FedergolfPage.tsx — provas juvenis da Federazione Italiana Golf (/fig).
 *
 * Lê `public/data/federgolf-index.json` e, ao abrir uma prova,
 * `public/data/federgolf/{id}.json` (feitos por scripts/scrape-federgolf.js).
 * Tudo no CircuitShell partilhado: masculino e feminino da mesma prova são
 * separadores da mesma entrada.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { FgIndice } from "../data/federgolf/types";
import { FG_INDEX_URL, buildFgEntries } from "../data/federgolf/entries";

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
  const { id } = useParams<{ id?: string }>();
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
  // Um link para a prova feminina abre a entrada conjunta.
  const selectedId = useMemo<string | undefined>(
    () => (id ? entries.find((e) => e.id === id || e.memberIds?.includes(id))?.id : undefined),
    [id, entries],
  );

  if (erro) return <ErrorState message="Erro ao carregar as provas da Federgolf" detail={erro} />;
  if (!idx) return <LoadingState message="A carregar Federgolf…" />;

  return (
    <CircuitShell
      entries={entries}
      config={FG_CONFIG}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`/fig/${e.id}`)}
    />
  );
}
