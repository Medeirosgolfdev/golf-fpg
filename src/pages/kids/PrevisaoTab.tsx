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
import { MANUEL_FED } from "../../constants/manuel";

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

  // HI real do Manuel (default 9.4 até carregar). Editável.
  const [manuelHi, setManuelHi] = useState<number | null>(null);
  const [hiInput, setHiInput] = useState<string>("");
  const [hiTouched, setHiTouched] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPlayerData(MANUEL_FED)
      .then(d => { if (alive && d?.HCP_INFO?.current != null) setManuelHi(d.HCP_INFO.current); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Allowance da competição (USKids = 100%; deixa-se escolher).
  const [allowance, setAllowance] = useState<number>(100);

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

  if (!torneio) return <div className="muted p-16">Sem torneio selecionado.</div>;
  if (!resolved) {
    return (
      <div className="muted p-16">
        Sem campo resolvido para este torneio/escalão — a previsão precisa do par/distâncias do campo.
      </div>
    );
  }

  const predGross = calc ? Math.round(calc.playsToIndex) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      {resolved.note && (
        <div className="muted fs-11" style={{
          padding: "6px 10px", background: "var(--bg-warn-alpha, var(--bg-muted))",
          border: "1px solid var(--color-warn-alpha, var(--border))", borderRadius: 6,
        }}>
          ⚠ {resolved.note}
        </div>
      )}

      {/* Campo + tee resolvido */}
      <div style={{ fontSize: "var(--fs-13)", color: "var(--text-2)" }}>
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Kpi label="Course HCP" big={String(Math.round(calc.courseHcp))} sub={`(${calc.courseHcp.toFixed(1)})`} accent />
            <Kpi label={`Playing HCP${allowance !== 100 ? ` (${allowance}%)` : ""}`} big={String(Math.round(calc.playingHcp))} sub={`(${calc.playingHcp.toFixed(1)})`} accent />
            <Kpi label="Joga ao índice ≈" big={String(predGross)} sub={fmtToPar(predGross! - (par as number))} />
            <Kpi label="Ao par" big={String(calc.evenGross)} sub={`SD ${fmtSD(calc.sdAtPar)}`} />
          </div>

          <p className="muted fs-12" style={{ margin: 0 }}>
            Com HI <strong>{(hi as number).toFixed(1)}</strong> neste tee
            (CR {fmtCR(cr)} · Slope {slope}), um dia ao nível do índice ronda os{" "}
            <strong>{predGross} pancadas</strong> ({fmtToPar(predGross! - (par as number))}).
            A régua abaixo traduz cada resultado bruto no Score Differential que geraria.
          </p>

          {/* Régua gross → SD → vs Par (ordenável) */}
          <table className="lb" style={{ borderCollapse: "collapse", fontSize: "var(--fs-13)", maxWidth: 420 }}>
            <thead>
              <tr>
                <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Gross</SortableHdr>
                <SortableHdr k="toPar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>vs Par</SortableHdr>
                <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Score Diff.</SortableHdr>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Nível</th>
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
                    <td style={{ padding: "3px 8px", textAlign: "right" }}>{row.gross}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right" }}>{fmtToPar(row.toPar)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right" }}>{fmtSD(row.sd)}</td>
                    <td style={{ padding: "3px 8px", color: "var(--text-3)" }}>{nivel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="muted fs-11" style={{ margin: 0 }}>
            Score Differential = (113 / Slope) × (Gross − CR). O índice é a média das 8 melhores de 20 voltas
            (o potencial num bom dia), por isso joga-se "ao índice" ou melhor só ~1 em cada 4 a 5 voltas (cerca de 20–25% das vezes).
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, big, sub, accent }: { label: string; big: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px",
      border: "1px solid var(--border)", borderRadius: 8, minWidth: 96,
      background: accent ? "var(--accent-light, var(--bg-muted))" : "var(--bg-1, transparent)",
    }}>
      <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontSize: "var(--fs-20, 20px)", fontWeight: 800, lineHeight: 1 }}>{big}</span>
      {sub && <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>{sub}</span>}
    </div>
  );
}
