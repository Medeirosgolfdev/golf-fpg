import React, { useMemo } from "react";
import type { RoundData, EclecticEntry, HoleStatsData, HoleScores } from "../data/playerDataLoader";
import { getTeeHex, textOnColor, normKey } from "../utils/teeColors";
import { fmtSign, fmtToPar } from "../utils/format";
import { sumArr } from "../utils/mathUtils";
import { useSort } from "../hooks/useSort";
import ScoreCircle from "./ScoreCircle";
import TeePill from "./TeePill";
import SortableHdr from "./SortableHdr";
import { SC, fmtStb, fmtSdVal } from "../utils/scoreDisplay";

export function EclecticSection({ ecList, ecDet, courseRounds, holesData, activeTee, onSelectTee }: {
  ecList: EclecticEntry[]; ecDet: Record<string, EclecticEntry>;
  holeStats: Record<string, HoleStatsData>;
  courseRounds: RoundData[]; holesData: Record<string, HoleScores>;
  activeTee: string | null; onSelectTee: (tk: string) => void;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<"rondas" | "par" | "eclético" | "vs_par" | "melhor_gr" | "media_gr">("rondas", "desc", {
    eclético: "asc", vs_par: "asc", melhor_gr: "asc", media_gr: "asc",
  });

  // Agrupar as entradas do ecList por tee — um tee pode ter variante de 18 e de
  // 9 buracos. Dentro de cada grupo, 18H (maior holeCount) primeiro. Ordem dos
  // grupos = ordem de aparição (estável) para os blocos do scorecard.
  const teeGroups = useMemo(() => {
    const map = new Map<string, EclecticEntry[]>();
    const order: string[] = [];
    for (const ec of ecList) {
      if (!map.has(ec.teeKey)) { map.set(ec.teeKey, []); order.push(ec.teeKey); }
      map.get(ec.teeKey)!.push(ec);
    }
    for (const k of order) map.get(k)!.sort((a, b) => b.holeCount - a.holeCount);
    return order.map(k => map.get(k)!);
  }, [ecList]);

  // Estatísticas POR VARIANTE (tee + nº de buracos): nº de voltas, melhor gross e
  // soma para média. Calculadas das voltas reais — assim 18H e 9H têm os seus.
  const variantStats = useMemo(() => {
    const m = new Map<string, { n: number; best: number | null; sum: number }>();
    for (const r of courseRounds) {
      const tk = normKey(r.tee || "");
      const h = holesData[r.scoreId];
      if (!tk || !h?.g) continue;
      const g = typeof r.gross === "number" ? r.gross : null;
      if (g == null || g <= 0) continue;
      const rhc = r.holeCount || (h.g.filter(x => x != null && Number(x) > 0).length <= 9 ? 9 : 18);
      const key = `${tk}|${rhc}`;
      const cur = m.get(key) || { n: 0, best: null, sum: 0 };
      cur.n++; cur.sum += g; cur.best = cur.best == null ? g : Math.min(cur.best, g);
      m.set(key, cur);
    }
    return m;
  }, [courseRounds, holesData]);
  const vstat = (ec: EclecticEntry) => variantStats.get(`${ec.teeKey}|${ec.holeCount}`);

  // Tabela-resumo: uma linha por tee, ordenável (métrica da variante principal = 18H).
  const sortedGroups = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const metric = (g: EclecticEntry[]) => {
      const p = g[0]; const vs = variantStats.get(`${p.teeKey}|${p.holeCount}`);
      switch (sortKey) {
        case "rondas": return vs?.n ?? 0;
        case "par": return p.totalPar ?? 0;
        case "eclético": return p.totalGross ?? 0;
        case "vs_par": return p.toPar ?? 0;
        case "melhor_gr": return vs?.best ?? 999;
        case "media_gr": return vs && vs.n ? vs.sum / vs.n : 0;
        default: return vs?.n ?? 0;
      }
    };
    return [...teeGroups].sort((a, b) => dir * (metric(a) - metric(b)));
  }, [teeGroups, variantStats, sortKey, sortDir]);

  return (
    <div className="mb-16">
      {/* Summary table */}
      <div className="mb-10">
        <div className="sc-bar-head"><span>Resumo por Tee</span></div>
        <table className="dtable ec-summary" style={{ marginBottom: 0 }}>
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
            {sortedGroups.map(group => {
              const primary = group[0];
              const isActive = primary.teeKey === activeTee;
              return (
                <tr key={primary.teeKey} className={`pointer${isActive ? " tee-row-active" : ""}`} onClick={() => onSelectTee(primary.teeKey)}>
                  <td><TeePill name={primary.teeName} /></td>
                  <td className="r">{group.map(ec => (
                    <div key={ec.holeCount} className="ec-sum-var fw-600">{vstat(ec)?.n ?? ""}</div>
                  ))}</td>
                  <td className="r">{group.map(ec => (
                    <div key={ec.holeCount} className="ec-sum-var"><span className="ec-sum-hc">{ec.holeCount}H</span> {ec.totalPar}</div>
                  ))}</td>
                  <td className="r">{group.map(ec => (
                    <div key={ec.holeCount} className="ec-sum-var fw-600">{ec.totalGross}</div>
                  ))}</td>
                  <td className="r">{group.map(ec => {
                    const tp = ec.toPar;
                    const col = tp == null ? "" : tp > 0 ? SC.danger : tp < 0 ? SC.good : SC.muted;
                    return <div key={ec.holeCount} className="ec-sum-var fw-700" style={{ color: col }}>{tp == null ? "" : fmtSign(tp)}</div>;
                  })}</td>
                  <td className="r">{group.map(ec => (
                    <div key={ec.holeCount} className="ec-sum-var fw-600">{vstat(ec)?.best ?? "–"}</div>
                  ))}</td>
                  <td className="r">{group.map(ec => {
                    const vs = vstat(ec);
                    return <div key={ec.holeCount} className="ec-sum-var">{vs && vs.n ? (vs.sum / vs.n).toFixed(1) : "–"}</div>;
                  })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hole-by-hole scorecard per tee — UMA tabela por tee. As voltas de 9 buracos
          do mesmo tee entram como linhas extra (só o front 9 preenchido). Só os tees
          que SÓ têm 9 buracos mostram uma tabela de 9 colunas.
          Usa a MESMA ordem da tabela-resumo (sortedGroups) para os blocos aparecerem
          na sequência mostrada em cima (ex.: Rondas desc → BRANCAS primeiro). */}
      {/* Mostra apenas o scorecard do tee seleccionado (activeTee): clicar numa
          linha do resumo troca o tee; clicar no tee activo limpa-o (esconde). */}
      {sortedGroups.filter(g => g[0].teeKey === activeTee).map(group => {
        const primary = group[0]; // maior holeCount (18H se existir, senão 9H)
        const isActive = primary.teeKey === activeTee;
        const det = ecDet[primary.teeKey] || primary;
        const parArr = det.holes?.map(h => h.par) || [];
        const hc = primary.holeCount;
        const is9 = hc === 9;
        const hx = getTeeHex(primary.teeName), fg = textOnColor(hx);

        // Todas as voltas deste tee (qualquer nº de buracos). As de 9 buracos
        // aparecem com o front 9 preenchido e o restante vazio — percebe-se que
        // são de 9 buracos sem ser preciso dizê-lo.
        const teeRounds = courseRounds
          .filter(r => normKey(r.tee || "") === primary.teeKey && holesData[r.scoreId]?.g)
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

        // Eclético recalculado a partir de TODAS as voltas mostradas (inclui o
        // front 9 das voltas de 9 buracos).
        const ecBest: (number | null)[] = new Array(18).fill(null);
        for (const r of teeRounds) {
          const g = holesData[r.scoreId]?.g;
          if (!g) continue;
          for (let i = 0; i < 18; i++) {
            const v = g[i];
            if (v != null && Number(v) > 0 && parArr[i] != null && (ecBest[i] == null || Number(v) < (ecBest[i] as number))) ecBest[i] = Number(v);
          }
        }
        const ecTotal = ecBest.reduce<number>((s, v) => s + (v ?? 0), 0);
        const ecTotalPar = parArr.reduce<number>((s, p, i) => s + (p != null && ecBest[i] != null ? Number(p) : 0), 0);

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
          <div key={primary.teeKey} className={`ecPillBlock ${isActive ? "ecActive" : ""} overflow-hidden br-lg mt-8`}>
            <div className="pointer fw-600 fs-12 ecPillHeader"
              onClick={() => onSelectTee(primary.teeKey)}>
              <TeePill name={primary.teeName} />{" "}
              <span className="muted ml-6">Eclético</span>{" "}
              <span className="fw-700">{ecTotal}</span>
              <span className="muted ml-6">par {ecTotalPar}</span>
              {commonMeters && <span className="muted ml-6">· {commonMeters}m</span>}
              <span className="muted ml-6">· {teeRounds.length} rondas</span>
            </div>
            {/* Scorecard sem w-full: largura por conteúdo, células iguais entre tees —
                a tabela de um tee só com 9 buracos fica visivelmente mais curta. */}
            <div className="scroll-x">
              <table className="sc-table-ec" >
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
                  <tr className="ec-eclectic-row">
                    <td className="row-label fw-700">Eclético</td>
                    {Array.from({ length: Math.min(hc, 9) }, (_, i) => (
                      <td key={i}>{ecBest[i] != null ? <ScoreCircle gross={ecBest[i]!} par={parArr[i]} /> : "–"}</td>
                    ))}
                    {sumCell("col-out fw-700", sumArr(ecBest, 0, Math.min(hc, 9)), sumArr(parArr, 0, Math.min(hc, 9)))}
                    {!is9 && Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 9}>{ecBest[i + 9] != null ? <ScoreCircle gross={ecBest[i + 9]!} par={parArr[i + 9]} /> : "–"}</td>
                    ))}
                    {!is9 && sumCell("col-in fw-700", sumArr(ecBest, 9, 18), sumArr(parArr, 9, 18))}
                    {sumCell("col-total fw-700", ecTotal, ecTotalPar)}
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    <td className="ec-extra muted">—</td>
                    {(() => {
                      const ecD = distOf(ecBest);
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
                    // Total e vs-par só sobre os buracos efectivamente jogados — assim
                    // uma volta de 9 buracos numa tabela de 18 mostra o total certo.
                    let trTotG = 0, trTotP = 0;
                    for (let i = 0; i < hc; i++) {
                      const g = trG[i];
                      if (g != null && Number(g) > 0 && parArr[i] != null) { trTotG += Number(g); trTotP += Number(parArr[i]); }
                    }
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
                        {sumCell("col-total fw-700", trTotG, trTotP)}
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
