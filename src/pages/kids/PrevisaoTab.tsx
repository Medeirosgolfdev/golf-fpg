/**
 * pages/kids/PrevisaoTab.tsx
 *
 * Tab "Previsão" do FieldRivaisDashboard.
 *
 * Pega no campo/tee que o ESCALÃO do Manuel vai jogar (resolvido por
 * `resolveCourseTee`, o mesmo da tab "O Campo") + no Handicap Index real do
 * Manuel, e mostra uma régua WHS tipo /simulador fixada NESTE campo:
 *   • Course Handicap + Playing Handicap
 *   • Gross para "jogar ao índice" (e ao par)
 *   • Tabela gross → Score Differential → vs Par (ordenável)
 *
 * Reutiliza as fórmulas centrais de `whsCalc.ts`. Os ratings (CR/Slope/Par)
 * vêm do tee resolvido; quando o campo não tem rating publicado, há campos
 * manuais editáveis (prefixados com o que existir).
 */
import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { resolveCourseTee, type ResolvedCourse } from "./CourseTab";
import { calcSD, calcScore, calcCourseHcp, calcPlayingHcp } from "../../utils/whsCalc";
import { fmtCR, fmtSD, fmtToPar } from "../../utils/format";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { loadPlayerData } from "../../data/playerDataLoader";
import type { PlayerPageData } from "../../data/playerDataLoader";
import { MANUEL_FED } from "../../constants/manuel";
import { buildHoleProfile, buildGamePlan, estimateField, fieldHoleVsPar, topFieldHoleStats, playerSdAnchors, type HolePlan } from "./previsaoModel";
import HoleDiffTable from "../../ui/HoleDiffTable";
import KpiCard from "../../ui/KpiCard";
import { scClass } from "../../utils/scoreDisplay";
import { buildReach, notReachableHoles } from "../../utils/reach";

interface FieldEscalao { nome: string }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }
interface MHSlim { torneios: Record<string, unknown>; jogadores: Record<string, unknown> }

const ALLOWANCES = [100, 95, 90, 85] as const;

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(",", "."));
  return isNaN(v) ? null : v;
}

type RowKey = "gross" | "toPar" | "sd";

export default function PrevisaoTab({ torneio, escalaoNome, mh }: {
  torneio: FieldTorneio | null;
  escalaoNome: string;
  mh: MHSlim | null;
}) {
  const ctx = useAppContext();
  const resolved = useMemo<ResolvedCourse | null>(
    () => resolveCourseTee(torneio as never, escalaoNome, mh as never, ctx.simCourses),
    [torneio, escalaoNome, mh, ctx.simCourses],
  );

  // HI + dados completos do Manuel (default 9.4 até carregar). Editável.
  const [playerData, setPlayerData] = useState<PlayerPageData | null>(null);
  const [manuelHi, setManuelHi] = useState<number | null>(null);
  const [hiInput, setHiInput] = useState<string>("");
  const [hiTouched, setHiTouched] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPlayerData(MANUEL_FED)
      .then(d => { if (!alive) return; setPlayerData(d); if (d?.HCP_INFO?.current != null) setManuelHi(d.HCP_INFO.current); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Allowance da competição (USKids = 100%; deixa-se escolher).
  const [allowance, setAllowance] = useState<number>(100);
  const [driveM, setDriveM] = useState(185);
  const [secondM, setSecondM] = useState(160);

  // Ratings resolvidos do tee + overrides manuais.
  const r18 = resolved?.tee.ratings.holes18;
  const holesCount = resolved?.tee.distances.holesCount ?? 18;
  const resCR = r18?.courseRating ?? null;
  const resSlope = r18?.slopeRating ?? null;
  const resPar = r18?.par ?? null;

  const [mCR, setMCR] = useState("");
  const [mSlope, setMSlope] = useState("");
  const [mPar, setMPar] = useState("");
  // Reset overrides quando muda o tee resolvido (novo campo/escalão).
  useEffect(() => { setMCR(""); setMSlope(""); setMPar(""); }, [resolved?.tee.teeId]);

  const cr = parseNum(mCR) ?? resCR;
  const slope = parseNum(mSlope) ?? resSlope;
  const par = parseNum(mPar) ?? resPar;
  const hi = hiTouched ? parseNum(hiInput) : (manuelHi ?? 9.4);

  const canCompute = cr != null && slope != null && slope > 0 && par != null && hi != null && holesCount === 18;

  const calc = useMemo(() => {
    if (!canCompute) return null;
    const courseHcp = calcCourseHcp(hi!, slope!, cr!, par!);
    const playingHcp = calcPlayingHcp(hi!, slope!, cr!, par!, allowance / 100);
    const playsToIndex = calcScore(hi!, cr!, slope!);        // gross ≈ jogar ao índice
    const evenGross = par!;                                    // jogar ao par
    const sdAtPar = calcSD(par!, cr!, slope!);                 // SD de fazer o par

    // Régua de gross → SD → vs Par.
    const lo = Math.max(par! - 2, Math.round(cr!) - 1);
    const hiG = Math.round(playsToIndex) + 12;
    const rows: { gross: number; toPar: number; sd: number }[] = [];
    for (let g = lo; g <= hiG; g++) {
      rows.push({ gross: g, toPar: g - par!, sd: calcSD(g, cr!, slope!) });
    }
    return { courseHcp, playingHcp, playsToIndex, evenGross, sdAtPar, rows };
  }, [canCompute, hi, slope, cr, par, allowance]);

  const { sortKey, sortDir, toggleSort } = useSort<RowKey>("gross", "asc");
  const sortedRows = useMemo(() => {
    if (!calc) return [];
    const arr = [...calc.rows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
    return arr;
  }, [calc, sortKey, sortDir]);

  // ── Plano de jogo + estimativa de field (independentes do CR/Slope) ──
  const profile = useMemo(() => buildHoleProfile(playerData), [playerData]);
  const fieldVsPar = useMemo(() => fieldHoleVsPar(mh as never, torneio as never, escalaoNome), [mh, torneio, escalaoNome]);
  const topField = useMemo(() => topFieldHoleStats(mh as never, torneio as never, escalaoNome, 5), [mh, torneio, escalaoNome]);
  const sdAnchors = useMemo(() => playerSdAnchors(playerData, 6), [playerData]);
  const jaGross = useMemo(() => (calc && cr != null && slope != null && sdAnchors.bestRecentSD != null) ? Math.round(calcScore(sdAnchors.bestRecentSD, cr, slope)) : null, [calc, cr, slope, sdAnchors]);
  const podeGross = useMemo(() => (calc && cr != null && slope != null && sdAnchors.bestAllSD != null) ? Math.round(calcScore(sdAnchors.bestAllSD, cr, slope)) : null, [calc, cr, slope, sdAnchors]);
  const gamePlan = useMemo<HolePlan[]>(
    () => resolved ? buildGamePlan(resolved.tee, profile, { driveM, secondM, courseHcp: calc?.courseHcp ?? 0, fieldVsPar, jaRound: jaGross, podeRound: podeGross }) : [],
    [resolved, profile, driveM, secondM, calc, fieldVsPar, jaGross, podeGross],
  );
  const expPerRound = useMemo(() => {
    if (!gamePlan.length) return null;
    let acc = 0;
    for (const h of gamePlan) { if (h.expStrokes == null) return null; acc += h.expStrokes; }
    return acc;
  }, [gamePlan]);
  const field = useMemo(() => estimateField(mh as never, torneio as never, escalaoNome), [mh, torneio, escalaoNome]);
  const { sortKey: pK, sortDir: pD, toggleSort: pT } = useSort<"hole" | "par" | "dist" | "exp" | "tag">("hole", "asc");
  const planSorted = useMemo(() => {
    const arr = [...gamePlan];
    const dir = pD === "asc" ? 1 : -1;
    const tagRank: Record<string, number> = { attack: 0, neutral: 1, defend: 2 };
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (pK) {
        case "par": va = a.par ?? 99; vb = b.par ?? 99; break;
        case "dist": va = a.dist ?? 0; vb = b.dist ?? 0; break;
        case "exp": va = a.expStrokes ?? 999; vb = b.expStrokes ?? 999; break;
        case "tag": va = tagRank[a.tag]; vb = tagRank[b.tag]; break;
        default: va = a.hole; vb = b.hole;
      }
      return (va - vb) * dir;
    });
    return arr;
  }, [gamePlan, pK, pD]);

  const reach = useMemo(() => resolved ? buildReach(resolved.tee, driveM, secondM) : [], [resolved, driveM, secondM]);
  const notReach = useMemo(() => notReachableHoles(reach), [reach]);

  if (!torneio) return <div className="muted p-16">Sem torneio selecionado.</div>;
  if (!resolved) {
    return (
      <div className="muted p-16">
        Sem campo resolvido para este torneio/escalão — a previsão precisa do par/distâncias do campo.
      </div>
    );
  }

  const predGross = calc ? Math.round(calc.playsToIndex) : null;
  const predMedia = expPerRound != null ? Math.round(expPerRound) : null;

  // Projecção de torneio do Manuel: a sua volta a JOGAR AO ÍNDICE (forma
  // competitiva), não a volta média da época (que inclui treino/casual e ficava
  // alta). Usa o plays-to-index do campo (predGross); se o campo não tiver
  // CR/Slope, cai na volta média do perfil.
  const manuelPerRound = predGross ?? predMedia;
  const manuelBasis: "índice" | "média" = predGross != null ? "índice" : "média";
  const manuelTot = (manuelPerRound != null && field.nRoundsTypical != null) ? manuelPerRound * field.nRoundsTypical : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {resolved.note && (
        <div className="muted fs-11" style={{
          padding: "6px 10px", background: "var(--bg-warn-alpha, var(--bg-muted))",
          border: "1px solid var(--color-warn-alpha, var(--border))", borderRadius: 6,
        }}>
          ⚠ {resolved.note}
        </div>
      )}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Campo + tee resolvido */}
      <div style={{ fontSize: "var(--fs-15)", color: "var(--text-1)", fontWeight: 700 }}>
        <strong>{resolved.course.master.name}</strong>
        {" · "}
        <span>{resolved.tee.teeName}</span>
        {resolved.tee.distances.total != null && <span className="muted">{" · "}{resolved.tee.distances.total} m</span>}
      </div>

      {resolved.ratingApprox && (
        <div className="muted fs-11" style={{
          padding: "6px 10px", background: "var(--bg-warn-alpha, var(--bg-muted))",
          border: "1px solid var(--color-warn-alpha, var(--border))", borderRadius: 6,
        }}>
          ⚠ CR/Slope estimados por interpolação entre os tees com rating oficial — este tee de torneio não tem rating publicado.
        </div>
      )}

      {/* Inputs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          Handicap Index
          <input className="select fs-13" style={{ width: 84 }} type="text" inputMode="decimal"
            value={hiTouched ? hiInput : (hi != null ? hi.toFixed(1) : "")}
            onChange={e => { setHiTouched(true); setHiInput(e.target.value); }}
            placeholder="9.4" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          Course Rating
          <input className="select fs-13" style={{ width: 84 }} type="text" inputMode="decimal"
            value={mCR} onChange={e => setMCR(e.target.value)}
            placeholder={resCR != null ? fmtCR(resCR) : "—"} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          Slope
          <input className="select fs-13" style={{ width: 84 }} type="text" inputMode="numeric"
            value={mSlope} onChange={e => setMSlope(e.target.value)}
            placeholder={resSlope != null ? String(resSlope) : "—"} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          Par
          <input className="select fs-13" style={{ width: 70 }} type="text" inputMode="numeric"
            value={mPar} onChange={e => setMPar(e.target.value)}
            placeholder={resPar != null ? String(resPar) : "—"} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          Allowance
          <select className="select fs-13" style={{ width: 84 }} value={allowance}
            onChange={e => setAllowance(parseInt(e.target.value, 10))}>
            {ALLOWANCES.map(a => <option key={a} value={a}>{a}%</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          Drive (m)
          <input className="select fs-13" style={{ width: 70 }} type="text" inputMode="numeric"
            value={driveM} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setDriveM(v); }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          2ª pancada (m)
          <input className="select fs-13" style={{ width: 70 }} type="text" inputMode="numeric"
            value={secondM} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setSecondM(v); }} />
        </label>
      </div>

      {holesCount !== 18 && (
        <div className="muted fs-12">A previsão está disponível para provas de 18 buracos (este escalão joga {holesCount}).</div>
      )}
      {holesCount === 18 && !canCompute && (
        <div className="muted fs-12">
          Falta CR/Slope para este campo — preenche os campos acima para calcular a previsão.
        </div>
      )}

      {calc && (
        <>
          {/* Strip de KPIs */}
          <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 190px))", justifyContent: "start" }}>
            <KpiCard label="A sua média" value={predMedia ?? "–"} sub={predMedia != null ? `${fmtToPar(predMedia - (par as number))} · forma 6m` : undefined} />
            <KpiCard label="Ao handicap" value={predGross} color="var(--accent)" sub={`${fmtToPar(predGross! - (par as number))} · HCP ${Math.round(calc.courseHcp)}`} />
            <KpiCard label="O que já consegue" value={jaGross ?? "–"} sub={jaGross != null ? `${fmtToPar(jaGross - (par as number))} · melhor volta 6m` : "sem dados"} />
            <KpiCard label="O melhor que pode" value={podeGross ?? "–"} color="var(--color-good)" sub={podeGross != null ? `${fmtToPar(podeGross - (par as number))} · teto histórico` : "sem dados"} />
          </div>

          <p className="muted fs-12" style={{ margin: 0 }}>
            Para competir, o alvo não é a média — é jogar <strong>ao handicap</strong> (+{Math.round(calc.courseHcp)} ≈ <strong>{predGross}</strong>) ou abaixo.
            A volta <strong>média</strong> (forma 6m) ronda {predMedia}; o melhor que <strong>já fez</strong> neste período dá {jaGross ?? "–"} e o seu <strong>teto</strong> histórico {podeGross ?? "–"}.
            A régua abaixo traduz cada gross no Score Differential que geraria.
          </p>

          {/* Régua gross → SD → vs Par (ordenável) */}
          <table className="dtable" style={{ maxWidth: 420 }}>
            <thead>
              <tr>
                <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
                <SortableHdr k="toPar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">vs Par</SortableHdr>
                <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Score Diff.</SortableHdr>
                <th>Nível</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const isPred = predGross != null && row.gross === predGross;
                const atIndex = Math.abs(row.sd - (hi as number)) < 0.5;
                let nivel = "";
                if (row.sd < (hi as number) - 0.5) nivel = "abaixo do índice ↓";
                else if (atIndex) nivel = "ao índice";
                else nivel = "acima do índice";
                return (
                  <tr key={row.gross} style={isPred ? { background: "var(--accent-light, var(--bg-muted))", fontWeight: 700 } : undefined}>
                    <td className="r">{row.gross}</td>
                    <td className="r">{fmtToPar(row.toPar)}</td>
                    <td className="r">{fmtSD(row.sd)}</td>
                    <td className="muted">{nivel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="muted fs-11" style={{ margin: 0 }}>
            Cenários: "média" = volta típica (forma 6m) · "ao handicap" = jogar ao índice (+HCP) · "já consegue" = melhor volta dos últimos 6 meses · "pode" = melhor differential de sempre (teto). Score Differential = (113 / Slope) × (Gross − CR). O índice é a média das 8 melhores de 20 voltas
            (o potencial num bom dia), por isso joga-se "ao índice" ou melhor só ~1 em cada 4 a 5 voltas (cerca de 20–25% das vezes).
          </p>
        </>
      )}
      </div>

      {/* ── Plano de jogo (buraco a buraco) ── */}
      {gamePlan.length > 0 && (
        <details className="card" open>
          <summary className="fs-13 fw-600" style={{ cursor: "pointer", userSelect: "none" }}>
            🎯 Plano de jogo — buraco a buraco
            {expPerRound != null && par != null && (
              <span className="muted fw-400 fs-11">{"  ·  total esperado ≈ "}{Math.round(expPerRound)} ({fmtToPar(Math.round(expPerRound) - (par as number))})</span>
            )}
          </summary>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
            <span className="muted fs-11">Drive {driveM} m · 2ª {secondM} m (editável no topo)</span>
            <span className="muted fs-11" style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span><Dot c="var(--color-good)" /> atacar</span>
              <span><Dot c="var(--text-3)" /> neutro</span>
              <span><Dot c="var(--color-danger)" /> defender</span>
              <span><span style={{ display: "inline-block", minWidth: 18, padding: "0 6px", borderRadius: 999, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: "var(--fs-10)", textAlign: "center" }}>SI</span> = recebe pancada</span>
            </span>
          </div>

          <table className="dtable" style={{ width: "auto", minWidth: 480 }}>
            <thead>
              <tr>
                <SortableHdr k="hole" sortKey={pK} sortDir={pD} onSort={pT} className="r">#</SortableHdr>
                <SortableHdr k="par" sortKey={pK} sortDir={pD} onSort={pT} className="r">Par</SortableHdr>
                <SortableHdr k="dist" sortKey={pK} sortDir={pD} onSort={pT} className="r">m</SortableHdr>
                <th style={{ textAlign: "center" }}>SI</th>
                <SortableHdr k="exp" sortKey={pK} sortDir={pD} onSort={pT} className="r" title="Volta média (forma 6 meses)">Média</SortableHdr>
                <th className="r" title="O melhor que JÁ consegue (melhor volta dos últimos 6 meses)">Já</th>
                <th className="r" title="O melhor que PODE fazer (teto histórico)">Pode</th>
                <SortableHdr k="tag" sortKey={pK} sortDir={pD} onSort={pT}>Plano</SortableHdr>
                <th>Estratégia</th>
                {topField && topField.roundKeys.map(rk => (
                  <th key={rk} className="r" title={`Média do top-5 (${topField.year}) na ronda ${rk}`}>T5 R{rk}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planSorted.map(h => {
                const c = h.tag === "attack" ? "var(--color-good)" : h.tag === "defend" ? "var(--color-danger)" : "var(--text-3)";
                const tagL = h.tag === "attack" ? "Atacar" : h.tag === "defend" ? "Defender" : "Neutro";
                return (
                  <tr key={h.hole}>
                    <td className="r">{h.hole}</td>
                    <td className="r">{h.par ?? "–"}</td>
                    <td className="r">{h.dist ?? "–"}</td>
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <span
                        title={h.getsStroke ? "Recebe pancada de handicap neste buraco" : `Stroke index ${h.si ?? "-"}`}
                        style={{
                          display: "inline-block", minWidth: 22, padding: "1px 8px", borderRadius: 999,
                          background: h.getsStroke ? "var(--accent)" : "var(--accent-light, var(--bg-muted))",
                          color: h.getsStroke ? "#fff" : "var(--text-2)",
                          fontWeight: h.getsStroke ? 800 : 600, fontSize: "var(--fs-11)",
                        }}
                      >
                        {h.si ?? "–"}
                      </span>
                    </td>
                    <td className="r" style={{ fontWeight: 600, color: vsParColor(h.expStrokes, h.par) }}>{h.expStrokes != null ? h.expStrokes.toFixed(1) : "–"}</td>
                    <td className="r" style={{ color: vsParColor(h.expJa, h.par) }}>{h.expJa != null ? h.expJa.toFixed(1) : "–"}</td>
                    <td className="r" style={{ color: vsParColor(h.expPode, h.par) }}>{h.expPode != null ? h.expPode.toFixed(1) : "–"}</td>
                    <td style={{ color: c, fontWeight: 700, whiteSpace: "nowrap" }} title={h.fieldVsPar != null ? `Field (edição anterior): ${h.fieldVsPar > 0 ? "+" : ""}${h.fieldVsPar.toFixed(1)} vs par` : "Sem dados do field — alcance/heurística"}><Dot c={c} /> {tagL}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{h.note}</td>
                    {topField && topField.roundKeys.map((rk, ri) => {
                      const cell = topField.holes[h.hole - 1]?.[ri];
                      const hp = topField.par[h.hole - 1];
                      return (
                        <td key={rk} style={{ textAlign: "center", whiteSpace: "nowrap", padding: "2px 6px" }}>
                          {cell && cell.scores.length ? (
                            <span style={{ display: "inline-flex", gap: 1, justifyContent: "center" }}>
                              {cell.scores.map((sc, j) => (
                                <span key={j} className={"sc-score " + scClass(sc, hp)} title={topField.players[j]} style={{ minWidth: 14, fontSize: "var(--fs-10)" }}>{sc}</span>
                              ))}
                            </span>
                          ) : <span className="muted">–</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, background: "var(--bg-header)", borderTop: "2px solid var(--border)" }}>
                <td className="r">Σ</td>
                <td className="r">{gamePlan.reduce((a, h) => a + (h.par ?? 0), 0)}</td>
                <td className="r">{gamePlan.reduce((a, h) => a + (h.dist ?? 0), 0)}</td>
                <td />
                <td className="r">{expPerRound != null ? expPerRound.toFixed(1) : "–"}</td>
                <td className="r" style={{ color: "var(--accent)" }}>{jaGross ?? "–"}</td>
                <td className="r" style={{ color: "var(--color-good)" }}>{podeGross ?? "–"}</td>
                <td colSpan={2 + (topField?.roundKeys.length ?? 0)} className="muted">
                  {expPerRound != null && par != null ? `\u2248 ${Math.round(expPerRound)} pancadas (${fmtToPar(Math.round(expPerRound) - (par as number))})` : ""}
                </td>
              </tr>
            </tfoot>
          </table>
          {!playerData && <p className="muted fs-11" style={{ margin: "6px 0 0" }}>A carregar o histórico do Manuel para o "esperado"…</p>}
          <p className="muted fs-11" style={{ margin: "6px 0 0" }}>
            "Média/Já/Pode" = pancadas esperadas por buraco em 3 cenários (média da forma 6m · melhor volta recente · teto histórico); cada coluna soma ao total respectivo, e os buracos fáceis passam a birdie no cenário "Pode" (verde = abaixo do par). Base: média do Manuel em buracos do mesmo par e distância ({profile.recent ? "últimos 6 meses" : "todas as voltas"}). "Plano" = dificuldade do buraco para o field na edição anterior (atacar = mais fáceis, defender = mais difíceis). "T5 R#" = scores dos 5 melhores classificados da edição anterior nessa ronda, por ordem de classificação (cor = convenção dos scorecards: birdie/par/bogey). Mostra que os bons fazem birdies onde a média fica acima do par; nome do jogador no hover.
          </p>
        </details>
      )}

      {/* ── Alcance / GIR pós-drive (componente partilhado com a Vantagem de Tee) ── */}
      {reach.length > 0 && (
        <details className="card" open>
          <summary className="fs-13 fw-600" style={{ cursor: "pointer", userSelect: "none" }}>
            📏 Alcance — greens em regulação (pós-drive)
            <span className="muted fw-400 fs-11">
              {"  ·  "}{notReach.length === 0 ? "todos os greens em regulação" : `${notReach.length} buraco${notReach.length === 1 ? "" : "s"} fora de alcance`}
            </span>
          </summary>
          <div className="muted fs-11" style={{ margin: "6px 0" }}>
            Linhas "após drive" = metros que faltam para o green depois da pancada do tee (par 3 = a própria pancada do green).
            "após 2ª pancada" = o que sobra depois da 2ª pancada grande, só nos par 4/5. ✗ = green fora de alcance em regulação.
            Drive/2ª pancada configurados no plano de jogo acima.
          </div>
          {notReach.length > 0 && (
            <p className="fs-12" style={{ margin: "0 0 8px", color: "var(--color-warn-dark)" }}>
              ⚠ Fora de alcance em regulação:{" "}
              {notReach.map(r => `buraco ${r.hole} (par ${r.par}, ${r.dist}m)`).join("; ")}.
            </p>
          )}
          <HoleDiffTable tees={[{ tee: resolved.tee }]} driveM={driveM} secondM={secondM} />
        </details>
      )}

      {/* ── Estimativa de score do torneio (field) ── */}
      {field.editions.length > 0 && (
        <details className="card" open>
          <summary className="fs-13 fw-600" style={{ cursor: "pointer", userSelect: "none" }}>
            🏆 Estimativa de score — {field.editions.length} edi{field.editions.length === 1 ? "ção" : "ções"} anterior{field.editions.length === 1 ? "" : "es"}
            {field.formatLabel && (
              <span className="muted fw-400 fs-11">{"  ·  estimativa sobre "}{field.nCounted} fiáve{field.nCounted === 1 ? "l" : "is"} ({field.formatLabel}{field.minField ? `, field ≥ ${field.minField}` : ""})</span>
            )}
          </summary>
          <div className="kpis" style={{ margin: "8px 0 12px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 190px))", justifyContent: "start" }}>
            {field.avgWinner != null && <KpiCard label="Ganhar ≈" value={field.avgWinner} sub={field.parPerRound && field.nRoundsTypical ? fmtToPar(field.avgWinner - field.parPerRound * field.nRoundsTypical) : undefined} />}
            {field.avgTop10 != null && <KpiCard label="Top-10 ≈" value={field.avgTop10} sub={field.parPerRound && field.nRoundsTypical ? fmtToPar(field.avgTop10 - field.parPerRound * field.nRoundsTypical) : undefined} />}
            {field.avgMedian != null && <KpiCard label="Mediana ≈" value={field.avgMedian} />}
            {manuelTot != null && manuelPerRound != null && (
              <KpiCard label="Manuel ≈ (torneio)" value={manuelTot} color="var(--accent)" sub={`${manuelPerRound}/volta · ${manuelBasis === "índice" ? "ao índice" : "volta média"}`} />
            )}
          </div>
          {manuelTot != null && field.nRoundsTypical != null && field.avgWinner != null && (
            <p className="muted fs-12" style={{ margin: 0 }}>
              {(() => {
                const tot = manuelTot;
                const dWin = tot - field.avgWinner;
                const dTop = field.avgTop10 != null ? tot - field.avgTop10 : null;
                const dMed = field.avgMedian != null ? tot - field.avgMedian : null;
                const parts: string[] = [];
                parts.push(dWin <= 0 ? "em prova pela vitória" : `faltam ~${dWin} para a média de vencedor`);
                if (dTop != null) parts.push(dTop <= 0 ? "dentro do top-10 típico" : `~${dTop} para o top-10`);
                if (dMed != null && dMed !== 0) parts.push(dMed < 0 ? `${-dMed} abaixo da mediana` : `${dMed} acima da mediana`);
                return <>Estimativa do Manuel ≈ <strong>{tot}</strong> ({field.nRoundsTypical} voltas, {manuelBasis === "índice" ? "ao índice" : "volta média"}): {parts.join(" · ")}.</>;
              })()}
            </p>
          )}
          <table className="dtable" style={{ width: "auto", minWidth: 420, marginTop: 8 }}>
            <thead><tr>
              <th>Ano</th>
              <th className="r">Rondas</th>
              <th className="r">Vencedor</th>
              <th className="r">Top-10</th>
              <th className="r">Mediana</th>
              <th className="r">Field</th>
            </tr></thead>
            <tbody>
              {field.editions.map(e => {
                const rowTitle = e.exclReason === "format"
                  ? `Formato ${e.nRounds}×${e.holesPerRound} ≠ ${field.formatLabel} — fora da estimativa`
                  : e.exclReason === "field"
                  ? `Field pequeno (${e.field}${field.minField ? " < " + field.minField : ""}) — amostra pouco fiável, fora da estimativa`
                  : undefined;
                return (
                <tr key={e.tcode} style={e.counted ? undefined : { opacity: 0.5 }} title={rowTitle}>
                  <td>{e.year}</td>
                  <td className="r">
                    {e.nRounds}
                    {e.exclReason === "format" && <span style={{ color: "var(--color-danger)" }} title={`Formato diferente (${e.nRounds}×${e.holesPerRound}) — não conta`}> ⚠</span>}
                  </td>
                  <td className="r">{e.winner}</td>
                  <td className="r">{e.top10 ?? "–"}</td>
                  <td className="r">{e.median}</td>
                  <td className="r">
                    {e.field}
                    {e.exclReason === "field" && <span style={{ color: "var(--color-danger)" }} title={`Field pequeno — não conta`}> ⚠</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted fs-11" style={{ margin: "6px 0 0" }}>
            Scores totais das edições passadas deste torneio+escalão (member-history USKids).{" "}
            {field.formatLabel && (
              <>A estimativa usa só as {field.nCounted} edi{field.nCounted === 1 ? "ção" : "ções"} fiáve{field.nCounted === 1 ? "l" : "is"} — mesmo formato ({field.formatLabel}, nº de voltas × buracos)
              {field.minField ? ` e field ≥ ${field.minField}` : ""}.
              {(field.nExcludedFormat > 0 || field.nExcludedField > 0) && (
                <>{" "}Fora (a cinzento, ⚠):{" "}
                  {[
                    field.nExcludedFormat > 0 ? `${field.nExcludedFormat} de formato diferente` : null,
                    field.nExcludedField > 0 ? `${field.nExcludedField} com field pequeno` : null,
                  ].filter(Boolean).join(" e ")}.</>
              )}
              {" "}Top-10 só conta com field ≥ 10. </>
            )}
            "Manuel ≈" projeta-o {manuelBasis === "índice" ? `a jogar ao índice neste campo (${manuelPerRound}/volta × ${field.nRoundsTypical}) — a forma competitiva, não a média da época` : "pela sua volta média neste campo"}.
          </p>
        </details>
      )}
    </div>
  );
}

function vsParColor(v: number | null, par: number | null): string {
  if (v == null || par == null) return "var(--text)";
  return v < par - 0.05 ? "var(--color-good)" : v > par + 0.05 ? "var(--color-danger)" : "var(--text)";
}

function Dot({ c }: { c: string }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, verticalAlign: "middle" }} />;
}

