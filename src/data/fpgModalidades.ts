/**
 * src/data/fpgModalidades.ts — modalidade de cada torneio FPG (Stroke Play,
 * Medal Net, Stableford Net…), como o clube a configurou na FPG segundo os
 * Termos da Competição. Dados: /data/fpg-modalidades.json (gerado por
 * scripts/build-fpg-modalidades.js a partir da lista de torneios de cada clube).
 */
import { useEffect, useState } from "react";
import { cachedFetchJson } from "./fetchCache";

/** Modalidades em que o tab «Scorecard» sabe classificar. */
export type ModoClassif = "stroke" | "medalNet" | "stbNet";

interface ModalidadesFile { modalidades: Record<string, string>; }

/** Nome oficial para mostrar: a FPG escreve «Gross» para o Stroke Play. */
export function nomeModalidade(fpg: string): string {
  if (/^gross$/i.test(fpg.trim())) return "Stroke Play";
  if (/^bogey\s*par$/i.test(fpg.trim())) return "Bogey/Par";
  return fpg.trim();
}

/** Modalidade → classificação do «Scorecard» (null = outra que não sabemos contar). */
export function modoDaModalidade(nome?: string | null): ModoClassif | null {
  const n = (nome || "").trim().toLowerCase();
  if (n === "gross" || n === "stroke play") return "stroke";
  if (n === "medal net") return "medalNet";
  if (n === "stableford net") return "stbNet";
  return null;
}

/** Modalidade oficial da prova (já com o nome a mostrar), ou null enquanto
 *  carrega / se a FPG não a tiver. */
export function useModalidadeProva(ccode?: string | null, tcode?: string | number | null): string | null {
  const [mods, setMods] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<ModalidadesFile>("/data/fpg-modalidades.json")
      .then((d) => { if (alive) setMods(d?.modalidades || {}); })
      .catch(() => { if (alive) setMods({}); });
    return () => { alive = false; };
  }, []);
  if (!mods || !ccode || tcode == null) return null;
  const v = mods[`${String(ccode).padStart(3, "0")}-${tcode}`];
  return v ? nomeModalidade(v) : null;
}
