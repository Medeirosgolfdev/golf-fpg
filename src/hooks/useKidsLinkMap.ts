/**
 * useKidsLinkMap — Hook partilhado para carregar autoRivals e construir o mapa KidsLink
 *
 * Usado em BJGTPage, DORALPage (e potencialmente noutras páginas com ↗ links)
 * Carrega buildAutoRivals em background, constrói Map<normName, KidsLinkEntry>
 */
import { useState, useEffect, useMemo } from "react";
import { buildAutoRivals, normName, type AutoRivalPlayer } from "../data/KIDSdataLoader";
import type { KidsLinkEntry } from "../ui/KidsLink";

export function useKidsLinkMap() {
  const [autoRivals, setAutoRivals] = useState<AutoRivalPlayer[]>([]);

  useEffect(() => {
    buildAutoRivals(undefined, {
      onUpdate: (rivals) => setAutoRivals(rivals),
    }).catch(() => {});
  }, []);

  const kidsMap = useMemo(() => {
    const m = new Map<string, KidsLinkEntry>();
    for (const r of autoRivals)
      m.set(normName(r.n), { n: r.n, memberId: (r as any).memberId });
    return m;
  }, [autoRivals]);

  return { kidsMap, autoRivals };
}
