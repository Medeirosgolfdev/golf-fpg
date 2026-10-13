/**
 * src/pages/fpg/fpgMatchplay.tsx
 *
 * Tab "Match Play" para o TournamentDetail da FPGPage — aparece nas
 * qualificações stroke play que têm um quadro de eliminatórias a seguir (Taça
 * da Federação). Os quadros vêm de `public/data/fpg-matchplay.json`, gerado
 * por `scripts/scrape-fpg-matchplay.js` a partir do `matchplay.asp` público da
 * FPG, já no schema `MatchplayFile` — desenhados pela <MatchplayView> partilhada.
 *
 * A FPG não publica cartões dos jogos de match play: só o quadro (nomes,
 * cabeças de série, resultados, tee e hora).
 */
import { useEffect, useState } from "react";
import type { Tournament } from "../../data/fpgTypes";
import { cachedFetchJson } from "../../data/fetchCache";
import MatchplayView from "../../ui/circuit/MatchplayView";
import type { MatchplayFile } from "../../ui/circuit/matchplayTypes";

export interface FpgMatchplayData {
  lastUpdated: string;
  source: string;
  tournaments: Record<string, MatchplayFile & { champion?: string | null }>;
}

/** Carrega o fpg-matchplay.json (lazy, cacheado). */
export function useFpgMatchplay(): FpgMatchplayData | null {
  const [data, setData] = useState<FpgMatchplayData | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<FpgMatchplayData>("/data/fpg-matchplay.json").then(d => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return data;
}

/** Devolve o extraTab "Match Play" do torneio aberto, ou `undefined` se não tem quadro. */
export function fpgMatchplayTabs(
  data: FpgMatchplayData | null,
  t: Tournament | null | undefined,
): { key: string; label: string; content: React.ReactNode }[] | undefined {
  if (!data || !t) return undefined;
  const mp = data.tournaments[`${t.ccode}-${t.tcode}`];
  if (!mp?.flights?.length) return undefined;
  const fl = mp.flights[0];
  return [{
    key: "matchplay",
    label: "Match Play",
    content: (
      <div>
        <div style={{ fontSize: "var(--fs-12)", color: "var(--text-2)", marginBottom: 8 }}>
          {mp.tournament && <span className="fw-700">{mp.tournament}</span>}
          {mp.champion
            ? <> · 🏆 <span className="fw-700">{mp.champion}</span></>
            : <span className="p p-sm" style={{ marginLeft: 6 }}>em curso</span>}
          <span style={{ color: "var(--text-muted)" }}>
            {" "}· {fl.rounds.length} eliminatórias · os cartões são só os da qualificação ·{" "}
            <a href={fl.source} target="_blank" rel="noreferrer">quadro na FPG ↗</a>
          </span>
        </div>
        <MatchplayView data={mp} />
      </div>
    ),
  }];
}
