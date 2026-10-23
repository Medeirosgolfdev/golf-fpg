/**
 * useKidsLinkMap — mapa normName → KidsLinkEntry para a seta ↗ que liga um
 * jogador à sua ficha /kids2.
 *
 * Fonte: `/data/juniors-links.json` (~1,4 MB), o índice compacto que o agregador
 * escreve a partir do roster canónico (`scripts/aggregator/util/links.js`) — só
 * id, nome canónico, aliases, memberId USKids e fed FPG. Antes lia o
 * `juniors.json` inteiro (~52 MB) em todas as páginas de circuito (21/10/2026).
 * A seta aparece para QUALQUER junior com ficha kids2 — incluindo as fontes MAJOR
 * que não passam pelo buildAutoRivals (FSGA, UA, México, Interzonas, avtrophy,
 * FM, JOB…). Surge quando o índice chega (fetch em background, não bloqueia o render).
 */
import { useState, useEffect, useMemo } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import { normName } from "../utils/normName";
import type { KidsLinkEntry } from "../ui/KidsLink";

/** Linha do índice: [id, nome canónico, aliases?, memberId?, fed?, licença FFG?, país?, sexo?] (0 = falta). */
export type LinkRow = [string, string, (string[] | 0)?, (string | 0)?, (string | 0)?, (string | 0)?, (string | 0)?, ("M" | "F" | 0)?];

export interface LinkJunior {
  id: string;
  canonicalName: string;
  aliases: string[];
  memberId?: string;
  fed?: string;
  /** Licença FFG (chave forte do agregador) — usada pela lista de jogadores da /ffg. */
  ffgLic?: string;
}

export function fromLinkRow([id, canonicalName, aliases, memberId, fed, ffgLic]: LinkRow): LinkJunior {
  return {
    id, canonicalName, aliases: aliases || [],
    memberId: memberId || undefined, fed: fed || undefined, ffgLic: ffgLic || undefined,
  };
}

/** Roster compacto dos juniores do kids2 (juniors-links.json); [] até chegar. */
export function useJuniorsLinks(): LinkJunior[] {
  const [roster, setRoster] = useState<LinkJunior[]>([]);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<{ j?: LinkRow[] }>("/data/juniors-links.json")
      .then((d) => { if (alive) setRoster((d?.j ?? []).map(fromLinkRow)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return roster;
}

export function useKidsLinkMap() {
  const roster = useJuniorsLinks();

  const kidsMap = useMemo(() => {
    const m = new Map<string, KidsLinkEntry>();
    for (const j of roster) {
      const entry: KidsLinkEntry = { n: j.canonicalName, memberId: j.memberId, id: j.id, fed: j.fed };
      // Nome canónico + aliases → mesma chave normName que o KidsLink usa no
      // lookup. Primeiro-a-entrar ganha em caso de homónimos (igual ao
      // juniorByNormName do kids2).
      const nk = normName(j.canonicalName);
      if (!m.has(nk)) m.set(nk, entry);
      for (const alias of j.aliases) {
        const ak = normName(alias);
        if (!m.has(ak)) m.set(ak, entry);
      }
    }
    // Variantes sem UM nome do meio: a inscrição USKids diz "Niko Alvarez van
    // der Walt" e a ficha "Niko Eduardo Alvarez Van Der Walt". Só entram se não
    // colidirem com um nome real nem com a variante de outro jogador.
    const variantes = new Map<string, KidsLinkEntry | null>();
    for (const j of roster) {
      const entry: KidsLinkEntry = { n: j.canonicalName, memberId: j.memberId, id: j.id, fed: j.fed };
      const toks = normName(j.canonicalName).split(" ").filter(Boolean);
      for (let i = 1; i < toks.length - 1; i++) {
        const vk = [...toks.slice(0, i), ...toks.slice(i + 1)].join(" ");
        if (m.has(vk)) continue;
        const antes = variantes.get(vk);
        variantes.set(vk, antes === undefined || antes?.id === entry.id ? entry : null);
      }
    }
    for (const [vk, entry] of variantes) if (entry) m.set(vk, entry);
    return m;
  }, [roster]);

  return { kidsMap };
}
