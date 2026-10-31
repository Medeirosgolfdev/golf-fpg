/**
 * Eclético de um campo, por tee (vista «Por campo» da ficha do jogador): o
 * mesmo cartão da vista «Ecléticos» (LoopEclecticSection) — cabeçalho com o
 * eclético e o ±par, «▸ N voltas» para abrir as voltas e as bolinhas de cor
 * para trocar de tee. Fechado mostra Par, Distância e Eclético; aberto junta
 * as voltas desse tee com Hcp, Stb, SD e as contagens birdie/par/bogey.
 */
import { useMemo, useState } from "react";
import type { RoundData, EclecticEntry, HoleScores } from "../data/playerDataLoader";
import { getTeeHex, textOnColor, normKey } from "../utils/teeColors";
import { fmtToPar } from "../utils/format";
import { sumArr } from "../utils/mathUtils";
import ScoreCircle from "./ScoreCircle";
import TeeDots from "./TeeDots";
import { SC, fmtStb, fmtSdVal } from "../utils/scoreDisplay";

const tpColorOf = (d: number) => d > 0 ? SC.danger : d < 0 ? SC.good : SC.muted;

export function EclecticSection({ ecList, ecDet, courseRounds, holesData, activeTee, onSelectTee }: {
  ecList: EclecticEntry[]; ecDet: Record<string, EclecticEntry>;
  courseRounds: RoundData[]; holesData: Record<string, HoleScores>;
  activeTee: string | null; onSelectTee: (tk: string) => void;
}) {
  const [aberto, setAberto] = useState(false);

  // Agrupar as entradas do ecList por tee — um tee pode ter variante de 18 e de
  // 9 buracos. Dentro de cada grupo, 18H (maior holeCount) primeiro.
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

  // Bolinhas pela ordem do nº de voltas (o tee mais jogado primeiro). No tooltip
  // vai o que era a tabela «Resumo por tee»: voltas, eclético, melhor e média
  // de cada variante (18H e 9H).
  const sortedGroups = useMemo(() => {
    const n = (g: EclecticEntry[]) => variantStats.get(`${g[0].teeKey}|${g[0].holeCount}`)?.n ?? 0;
    return [...teeGroups].sort((a, b) => n(b) - n(a));
  }, [teeGroups, variantStats]);
  const dots = sortedGroups.map(group => ({
    key: group[0].teeKey,
    name: group[0].teeName,
    title: [group[0].teeName, ...group.map(ec => {
      const vs = variantStats.get(`${ec.teeKey}|${ec.holeCount}`);
      const n = vs?.n ?? 0;
      return `${ec.holeCount}H: ${n} volta${n === 1 ? "" : "s"} · eclético ${ec.totalGross}`
        + (vs?.best != null ? ` · melhor ${vs.best} · média ${(vs.sum / vs.n).toFixed(1)}` : "");
    })].join("\n"),
  }));

  // Tee mostrado: o activo; sem nenhum (ou um sem eclético), o mais jogado.
  const primary = (sortedGroups.find(g => g[0].teeKey === activeTee) ?? sortedGroups[0])?.[0];
  if (!primary) return null;

  const det = ecDet[primary.teeKey] || primary;
  const parArr = det.holes?.map(h => h.par) || [];
  const hc = primary.holeCount;
  const is9 = hc === 9;
  const hx = getTeeHex(primary.teeName), fg = textOnColor(hx);

  // Todas as voltas deste tee (qualquer nº de buracos). As de 9 buracos
  // aparecem com o front 9 preenchido e o restante vazio.
  const teeRounds = courseRounds
    .filter(r => normKey(r.tee || "") === primary.teeKey && holesData[r.scoreId]?.g)
    .sort((a, b) => b.dateSort - a.dateSort);

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
  // (ScorecardLB): birds = d<=-1, pars = d===0, bogs = d>=1.
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

  // Célula de subtotal (Out / In / Total) — gross e, por baixo em pequenino, a
  // diferença para o par desse segmento.
  const sumCell = (cls: string, gross: number, par: number) => (
    <td className={cls}>
      <div className="ec-sum-g">{gross || ""}</div>
      {gross > 0 && par > 0 && (
        <div className="ec-sum-tp" style={{ color: tpColorOf(gross - par) }}>{fmtToPar(gross - par)}</div>
      )}
    </td>
  );
  // As colunas Hcp…■ só existem com as voltas abertas; nas linhas de referência ficam «—».
  const extrasVazios = aberto && Array.from({ length: 6 }, (_, i) => <td key={`x${i}`} className="ec-extra muted">—</td>);

  return (
    <div className="mb-16">
      <div className="ecPillBlock ecActive overflow-hidden br-lg u-d-inline-flex u-fd-column u-maxw-100pc">
        {/* width 0 + min-width 100%: o cabeçalho não alarga o cartão — dobra
            dentro da largura da tabela. */}
        <div className="fw-600 fs-12 ecPillHeader u-d-flex u-fwr-wrap u-gap-6px u-ai-center u-w-0 u-minw-100pc u-box-sizing-border-box">
          <span className="muted">Eclético</span>
          <span className="fw-700">{ecTotal || "–"}</span>
          {ecTotal > 0 && <span className="fw-700" style={{ color: tpColorOf(ecTotal - ecTotalPar) }}>{fmtToPar(ecTotal - ecTotalPar)}</span>}
          <button type="button" className="fs-12 u-bg-none u-bd-none u-p-0 u-cur-pointer u-c-accent" onClick={() => setAberto(v => !v)}
>
            {aberto ? "▾" : "▸"} {teeRounds.length} volta{teeRounds.length === 1 ? "" : "s"}
          </button>
          <TeeDots tees={dots} active={primary.teeKey}
            onSelect={k => { if (k !== activeTee) onSelectTee(k); }} />
        </div>
        <div className="scroll-x">
          <table className="sc-table-ec sc-grid">
            <thead>
              <tr>
                <th className="row-label col-w60">Buraco</th>
                {Array.from({ length: Math.min(hc, 9) }, (_, i) => <th key={i + 1}>{i + 1}</th>)}
                <th className="col-out">Out</th>
                {!is9 && Array.from({ length: 9 }, (_, i) => <th key={i + 10}>{i + 10}</th>)}
                {!is9 && <th className="col-in">In</th>}
                <th className="col-total">Total</th>
                {aberto && <>
                  <th className="ec-extra" title="Handicap de jogo da ronda">Hcp</th>
                  <th className="ec-extra" title="Pontos Stableford">Stb</th>
                  <th className="ec-extra" title="Score Differential">SD</th>
                  <th className="ec-extra ec-bird" title="Birdies ou melhor">🐦</th>
                  <th className="ec-extra ec-par-ct" title="Pares">Par</th>
                  <th className="ec-extra ec-bog" title="Bogeys ou pior">■</th>
                </>}
              </tr>
            </thead>
            <tbody>
              <tr className="ec-ref-row">
                <td className="row-label fw-700">Par</td>
                {Array.from({ length: Math.min(hc, 9) }, (_, i) => <td key={i}>{parArr[i] ?? ""}</td>)}
                <td className="col-out fw-700">{sumArr(parArr, 0, Math.min(hc, 9))}</td>
                {!is9 && Array.from({ length: 9 }, (_, i) => <td key={i + 9}>{parArr[i + 9] ?? ""}</td>)}
                {!is9 && <td className="col-in fw-700">{sumArr(parArr, 9, 18)}</td>}
                <td className="col-total fw-700">{sumArr(parArr, 0, hc)}</td>
                {extrasVazios}
              </tr>
              {hasMeters && (
                <tr className="ec-ref-row">
                  <td className="row-label">Metros</td>
                  {Array.from({ length: Math.min(hc, 9) }, (_, i) => <td key={i}>{metersArr[i] ?? ""}</td>)}
                  <td className="col-out">{sumArr(metersArr, 0, Math.min(hc, 9)) || ""}</td>
                  {!is9 && Array.from({ length: 9 }, (_, i) => <td key={i + 9}>{metersArr[i + 9] ?? ""}</td>)}
                  {!is9 && <td className="col-in">{sumArr(metersArr, 9, 18) || ""}</td>}
                  <td className="col-total">{sumArr(metersArr, 0, hc) || ""}</td>
                  {extrasVazios}
                </tr>
              )}
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
                {aberto && (() => {
                  const ecD = distOf(ecBest);
                  return (
                    <>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra muted">—</td>
                      <td className="ec-extra ec-bird">{ecD.birds || ""}</td>
                      <td className="ec-extra ec-par-ct">{ecD.pars || ""}</td>
                      <td className="ec-extra ec-bog">{ecD.bogs || ""}</td>
                    </>
                  );
                })()}
              </tr>
              {aberto && teeRounds.map(tr => {
                const trG = holesData[tr.scoreId]!.g;
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
    </div>
  );
}
