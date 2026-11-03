/**
 * useKidsDob — a data de nascimento do Kids 2 (src/data/kidsDob.ts) para as
 * tabelas de torneio. Lê o mapa das setas ↗ (KidsLinkCtx, que as páginas de
 * circuito e a /uskids fornecem) e só vai buscar o juniors-scout.json quando
 * `need` (há alguém sem nascimento) e o mapa já chegou. null até lá.
 */
import { useContext, useMemo } from "react";
import { KidsLinkCtx } from "../ui/KidsLink";
import { useJson } from "./useJson";
import { makeKidsDobLookup, type KidsDobLookup, type ScoutDobFile } from "../data/kidsDob";

export function useKidsDob(need: boolean): KidsDobLookup | null {
  const kidsMap = useContext(KidsLinkCtx);
  const pede = need && kidsMap.size > 0;
  const scout = useJson<ScoutDobFile>(pede ? "/data/juniors-scout.json" : null).data;
  return useMemo(() => (pede && scout ? makeKidsDobLookup(kidsMap, scout) : null), [pede, scout, kidsMap]);
}
