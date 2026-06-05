import React, { useMemo } from "react";
import type { RoundData, EclecticEntry, HoleStatsData, HoleScores } from "../data/playerDataLoader";
import { getTeeHex, textOnColor, normKey } from "../utils/teeColors";
import { norm, fmtSign, fmtToPar } from "../utils/format";
import { sumArr } from "../utils/mathUtils";
import { useSort } from "../hooks/useSort";
import ScoreCircle from "./ScoreCircle";
import TeePill from "./TeePill";
import SortableHdr from "./SortableHdr";
import { SC, fmtStb, fmtSdVal } from "../utils/scoreDisplay";

export function EclecticSection({ ecList, ecDet, holeStats, courseRounds, holesData, activeTee, onSelectTee }: {
  ecList: EclecticEntry[]; ecDet: Record<string, EclecticEntry>;
  holeStats: Record<string, HoleStatsData>;
  courseRounds: RoundData[]; holesData: Record<string, HoleScores>;
  activeTee: string | null; onSelectTee: (tk: string) => void;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<"rondas" | "par" | "eclético" | "vs_par" | "melhor_gr" | "media_gr">("rondas", "desc", {
    eclético: "asc", vs_par: "asc", melhor_gr: "asc", media_gr: "asc",
  });

  const sortedEcList = useMemo(() => {
    let sorted = [...ecList];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av: number, bv: number;
      const hsA = holeStats[a.teeKey];
      const hsB = holeStats[b.teeKey];
      switch (sortKey) {
        case "rondas": av = hsA?.nRounds ?? 0; bv = hsB?.nRounds ?? 0; break;
        case "par": av = a.totalPar ?? 0; bv = b.totalPar ?? 0; break;
        case "eclético": av = a.totalGross ?? 0; bv = b.totalGross ?? 0; break;
        case "vs_par": av = (a.toPar ?? 0); bv = (b.toPar ?? 0); break;
        case "melhor_gr": av = hsA?.bestRound?.gross ?? 999; bv = hsB?.bestRound?.gross ?? 999; break;
        case "media_gr": av = hsA?.avgGross ?? 0; bv = hsB?.avgGross ?? 0; break;
        default: av = hsA?.nRounds ?? 0; bv = hsB?.nRounds ?? 0;
      }
      return dir * (av - bv);
    });
    return sorted;
  }, [ecList, holeStats, sortKey, sortDir]);

  return (
    <div className="mb-16">
      {/* Summary table */}
      <div className="mb-10">
        <table className="dtable ec-summary">
          <thead>
            <tr><th>Tee</th>
              <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Rondas</SortableHdr>
              <SortableHdr k="par" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Par</SortableHdr>
              <SortableHdr k="eclético" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Eclético</SortableHdr>
              <SortableHdr k="vs_par" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">vs Par</SortableHdr>
              <SortableHdr k="melhor_gr" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Melhor Gr.</SortableHdr>
              <SortableHdr k="media_gr" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média Gr.</SortableHdr></tr>
          </thead>
          <tbody>
            {sortedEcList.map(ex => {
              const hs = holeStats[ex.teeKey];
              const tp = ex.toPar;
              const tpStr = tp == null ? "" : (fmtSign(tp));
              const tpCol = tp == null ? "" : (tp > 0 ? SC.danger : tp < 0 ? SC.good : SC.muted);
              const isActive = ex.teeKey === activeTee;
              return (
                <tr key={ex.teeKey} className={`pointer${isActive ? " tee-row-active" : ""}`} onClick={() => onSelectTee(ex.teeKey)}>
                  <td><TeePill name={ex.teeName} /></td>
                  <td className="r fw-600">{hs?.nRounds ?? ""}</td>
                  <td className="r">{ex.totalPar}</td>
                  <td className="r c-blue-13">{ex.totalGross}</td>
                  <td className="r fw-700" style={{ color: tpCol }}>{tpStr}</td>
                  <td className="r fw-600">{hs?.bestRound?.gross ?? "–"}</td>
                  <td className="r">{hs?.avgGross?.toFixed(1) ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hole-by-hole scorecard per tee */}
      {ecList.map(ec => {
        const isActive = ec.teeKey === activeTee;
        const det = ecDet[ec.teeKey] || ec;
        const parArr = det.holes?.map(h => h.par) || [];
        const hc = ec.holeCount;
        const is9 = hc === 9;
        const hx = getTeeHex(ec.teeName), fg = textOnColor(hx);

        // Get individual round scores for this tee — APENAS as rondas com o
        // mesmo número de buracos que este bloco (9H num bloco 9H, 18H num
        // bloco 18H). Sem este filtro, as rondas de 9 e 18 buracos misturavam-se
        // em ambos os blocos (9H apareciam no bloco 18H e vice-versa).
        const teeRounds = courseRounds
          .filter(r => {
            if (normKey(r.tee || "") !== ec.teeKey) return false;
            const h = holesData[r.scoreId];
            if (!h?.g) return false;
            const rhc = r.holeCount || (h.g.filter(x => x != null && Number(x) > 0).length <= 9 ? 9 : 18);
            return rhc === hc;
          })
          .sort((a, b) => b.dateSort - a.dateSort);

        // Info comum a todas as rondas deste tee: distância (se todas iguais), buracos
        const metersSet = Array.from(new Set(teeRounds.map(r => r.meters).filter((m): m is number => m != null && m > 0)));
        const commonMeters = metersSet.length === 1 ? metersSet[0] : null;

        // Distância por buraco: primeiro valor não-nulo entre as rondas deste tee
        // (todas as rondas do mesmo tee/holeCount partilham a mesma marcação).
        const metersArr: (number | null)[] = new Array(18).fill(null);
        for (const r of teeRounds) {
          const m = holesData[r.scoreId]?.m;
          if (!m) continue;
          for (let i = 0; i < 18; i++) {
            if (metersArr[i] == null && m[i] != null && Number(m[i]) > 0) metersArr[i] = Number(m[i]);
          }
        }
        const hasMeters = metersArr.some(v => v != null);

        // Contagem de scores (birdie+ / par / bogey+) de uma ronda, comparando o
        // gross de cada buraco com o par do tee. Mesma lógica das leaderboards
        // (ScorecardLB): birds = d<=-1, pars = d===0, bogs = d>=1. Itera as 18
        // posições e conta só as jogadas (par presente + gross > 0) — 9H e 18H.
        const distOf = (g: (number | null)[] | undefined) => {
          const acc = { birds: 0, pars: 0, bogs: 0, total: 0 };
          for (let i = 0; i < 18; i++) {
            const pv = parArr[i];
            const gv = g?.[i];
            if (pv == null || gv == null || Number(gv) <= 0) continue;
            const diff = Number(gv) - pv;
            if (diff <= -1) acc.birds++;
            else if (diff === 0) acc.pars++;
            else acc.bogs++;
            acc.total++;
          }
          return acc;
        };

        // Célula de subtotal (Out / In / Total) — mostra o gross e, por baixo em
        // pequenino, a diferença para o par desse segmento (cor: verde abaixo,
        // vermelho acima, cinzento em par).
        const tpColorOf = (d: number) => d > 0 ? SC.danger : d < 0 ? SC.good : SC.muted;
        const sumCell = (cls: string, gross: number, par: number) => (
          <td className={cls}>
            <div className="ec-sum-g">{gross || ""}</div>
            {gross > 0 && par > 0 && (
              <div className="ec-sum-tp" style={{ color: tpColorOf(gross - par) }}>{fmtToPar(gross - par)}</div>
            )}
          </td>
        );

        return (
          <div key={ec.teeKey} className={`ecPillBlock ${isActive ? "ecActive" : ""} overflow-hidden br-lg mt-8`}
            style={{ border: isActive ? "1px solid var(--border)" : "1px solid var(--border-light)" }}>
            <div className="pointer fw-600 fs-12 ecPillHeader" style={{ background: "var(--bg-detail)" }}
              onClick={() => onSelectTee(ec.teeKey)}>
              <TeePill name={ec.teeName} />{" "}
              <span className="muted ml-6">Eclético</span>{" "}
              <span className="fw-700">{ec.totalGross}</span>
              <span className="muted ml-6">par {ec.totalPar}</span>
              {commonMeters && <span className="muted ml-6">· {commonMeters}m</span>}
              <span className="muted ml-6">· {hc} buracos</span>
              <span className="muted ml-6">· {teeRounds.length} rondas</span>
            </div>
            {/* Eclectic hole-by-hole table — tamanho/peso uniformes. Só os totais (OUT/IN/TOT) e
                 labels de linha ficam em fw-700, tudo o resto herda do .sc-table-ec (12px, peso 400). */}
            <div className="scroll-x">
              <table className="sc-table-ec w-full" >
                <thead>
                  <tr>
                    <th className="row-label col-w60">Buraco</th>
                    {Array.from({ length: Math.min(hc, 9) }, (_, i) => <th key={i + 1}>{i + 1}</th>)}
                    <th className="col-out">Out</th>
                    {!is9 && Array.from({ length: 9 }, (_, i) => <th key={i + 10}>{i + 10}</th>)}
                    {!is9 && <th className="col-in">In</th>}
                    <th className="col-total">Total</th>
                    <th className="ec-extra" title="Handicap de jogo da ronda">Hcp</th>
                    <th className="ec-extra" title="Pontos Stableford">Stb</th>
                    <th className="ec-extra" title="Score Differential">SD</th>
                    <th className="ec-extra ec-bird" title="Birdies ou melhor">🐦</th>
                    <th className="ec-extra ec-par-ct" title="Pares">Par</th>
                    <th className="ec-extra ec-bog" title="Bogeys ou pior">■</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Par row */}
                  <tr className="ec-ref-row">
                    <td className="row-label fw-700">Par</td>
                    {Array.from({ length: Math.min(hc, 9) }, (_, i) => <td key={i}>{parArr[i] ?? ""}</td>)}
                    <td className="col-out fw-700">{sumArr(parArr, 0, Math.min(hc, 9))}</td>
                    {!is9 && Array.from({ length: 9 }, (_, i) => <td key={i + 9}>{parArr[i + 9] ?? ""}</td>)}
                    {!is9 && <td className="col-in fw-700">{sumArr(parArr, 9, 18)}</td>}
                    <td className="col-total fw-700">{sumArr(parArr, 0, hc)}</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                  </tr>
                  {/* Distances row (metros por buraco) */}
                  {hasMeters && (
                    <tr className="ec-ref-row">
                      <td className="row-label">Distância</td>
                      {Array.from({ length: Math.min(hc, 9) }, (_, i) => <td key={i}>{metersArr[i] ?? ""}</td>)}
                      <td className="col-out">{sumArr(metersArr, 0, Math.min(hc, 9)) || ""}</td>
                      {!is9 && Array.from({ length: 9 }, (_, i) => <td key={i + 9}>{metersArr[i + 9] ?? ""}</td>)}
                      {!is9 && <td className="col-in">{sumArr(metersArr, 9, 18) || ""}</td>}
                      <td className="col-total">{sumArr(metersArr, 0, hc) || ""}</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                    </tr>
                  )}
                  {/* Eclectic row */}
                  <tr className="bt-heavy ec-eclectic-row">
                    <td className="row-label fw-700">Eclético</td>
                    {ec.holes.slice(0, Math.min(hc, 9)).map((h, i) => (
                      <td key={i}>{h.best != null ? <ScoreCircle gross={h.best} par={parArr[i]} /> : "–"}</td>
                    ))}
                    {sumCell("col-out fw-700", sumArr(ec.holes.map(h => h.best), 0, Math.min(hc, 9)), sumArr(parArr, 0, Math.min(hc, 9)))}
                    {!is9 && ec.holes.slice(9, 18).map((h, i) => (
                      <td key={i + 9}>{h.best != null ? <ScoreCircle gross={h.best} par={parArr[i + 9]} /> : "–"}</td>
                    ))}
                    {!is9 && sumCell("col-in fw-700", sumArr(ec.holes.map(h => h.best), 9, 18), sumArr(parArr, 9, 18))}
                    {sumCell("col-total fw-700", ec.totalGross, sumArr(parArr, 0, hc))}
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    {(() => {
                      const ecD = distOf(ec.holes.map(h => h.best));
                      return (
                        <>
                          <td className="ec-extra ec-bird">{ecD.birds || ""}</td>
                          <td className="ec-extra ec-par-ct">{ecD.pars || ""}</td>
                          <td className="ec-extra ec-bog">{ecD.bogs || ""}</td>
                        </>
                      );
                    })()}
                  </tr>
                  {/* Individual round rows */}
                  {teeRounds.map(tr => {
                    const trH = holesData[tr.scoreId];
                    if (!trH?.g) return null;
                    const trG = trH.g;
                    const trDate = tr.date ? tr.date.substring(0, 5).replace("-", "/") : "";
                    const sdInfo = fmtSdVal(tr);
                    const trDist = distOf(trG);
                    return (
                      <tr key={tr.scoreId} className="ec-round-row">
                        <td className="row-label fw-700">
                          <span className="p p-sm" style={{ background: hx, color: fg }}>{trDate}</span>
                        </td>
                        {Array.from({ length: Math.min(hc, 9) }, (_, i) => (
                          <td key={i}><ScoreCircle gross={trG[i]} par={parArr[i]} /></td>
                        ))}
                        {sumCell("col-out fw-700", sumArr(trG, 0, Math.min(hc, 9)), sumArr(parArr, 0, Math.min(hc, 9)))}
                        {!is9 && Array.from({ length: 9 }, (_, i) => (
                          <td key={i + 9}><ScoreCircle gross={trG[i + 9]} par={parArr[i + 9]} /></td>
                        ))}
                        {!is9 && sumCell("col-in fw-700", sumArr(trG, 9, hc), sumArr(parArr, 9, 18))}
                        {sumCell("col-total fw-700", sumArr(trG, 0, hc), sumArr(parArr, 0, hc))}
                        <td className="ec-extra">{tr.hi ?? "—"}</td>
                        <td className="ec-extra">{fmtStb(tr.stb, tr.holeCount) || "—"}</td>
                        <td className="ec-extra">
                          {sdInfo.text
                            ? <span className={`p p-sm p-${sdInfo.cls || "sd-good"}`}>{sdInfo.text}</span>
                            : "—"}
                        </td>
                        <td className="ec-extra ec-bird">{trDist.birds || ""}</td>
                        <td className="ec-extra ec-par-ct">{trDist.pars || ""}</td>
                        <td className="ec-extra ec-bog">{trDist.bogs || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
