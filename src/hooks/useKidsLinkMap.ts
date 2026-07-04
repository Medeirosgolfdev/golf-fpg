/**
 * useKidsLinkMap — mapa normName → KidsLinkEntry para a seta ↗ que liga um
 * jogador à sua ficha /kids2.
 *
 * Fonte: o ROSTER canónico de juniores (`/data/juniors.json` — o mesmo que
 * alimenta o /kids2, partilhado via `cachedFetchJson`). Carrega SÓ o roster (um
 * ficheiro), NÃO os shards de torneios (~76 MB) nem o `buildAutoRivals` do
 * KIDSdataLoader (~85 MB em 44 ficheiros). Assim a seta aparece para QUALQUER
 * junior com ficha kids2 — incluindo as fontes MAJOR que não passam pelo
 * buildAutoRivals (FSGA, UA, México, Interzonas, avtrophy, FM, JOB…) — e o load
 * de fundo destas páginas fica muito mais leve. A seta surge quando o roster
 * chega (fetch em background, não bloqueia o render).
 */
import { useState, useEffect, useMemo } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import { normName } from "../utils/normName";
import type { KidsLinkEntry } from "../ui/KidsLink";

/** Subconjunto do `Junior` canónico que precisamos para o link (evita acoplar ao
 *  módulo kids2/data, que arrasta o loader completo). */
interface RosterJunior {
  id: string;
  canonicalName: string;
  aliases?: string[];
  sources?: { uskids?: { memberId?: string } };
}

export function useKidsLinkMap() {
  const [roster, setRoster] = useState<RosterJunior[]>([]);

  useEffect(() => {
    let alive = true;
    cachedFetchJson<{ juniors?: RosterJunior[] }>("/data/juniors.json")
      .then((d) => { if (alive) setRoster(d?.juniors ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const kidsMap = useMemo(() => {
    const m = new Map<string, KidsLinkEntry>();
    for (const j of roster) {
      const entry: KidsLinkEntry = { n: j.canonicalName, memberId: j.sources?.uskids?.memberId, id: j.id };
      // Nome canónico + aliases → mesma chave normName que o KidsLink usa no
      // lookup. Primeiro-a-entrar ganha em caso de homónimos (igual ao
      // juniorByNormName do kids2).
      const nk = normName(j.canonicalName);
      if (!m.has(nk)) m.set(nk, entry);
      for (const alias of j.aliases || []) {
        const ak = normName(alias);
        if (!m.has(ak)) m.set(ak, entry);
      }
    }
    return m;
  }, [roster]);

  return { kidsMap };
}
