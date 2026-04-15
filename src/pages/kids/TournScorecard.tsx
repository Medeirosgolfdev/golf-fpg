import { fmtSign } from "../../utils/format";
import { scClass, toParClass } from "../../utils/scoreDisplay";
import type { ScRound } from "./types";

export default function TournScorecard({ par, si, meters, rounds }: { par: readonly number[]; si?: readonly number[]; meters?: readonly number[]; rounds: ScRound[] }) {
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const frontM = meters ? meters.slice(0, 9).reduce((a, b) => a + b, 0) : 0;
  const backM  = meters ? meters.slice(9).reduce((a, b) => a + b, 0) : 0;
  const totalM = frontM + backM;
  const Sub = ({ gross, base, cls }: { gross: number; base: number; cls: string }) => {
    const tp = gross - base;
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span></td>;
  };
  return (
    <div className="scroll-x">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header ta-left">Buraco</th>
          {par.slice(0, 9).map((_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {par.slice(9).map((_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
          <th className="hole-header col-in fs-10">In</th>
          <th className="hole-header col-total">TOT</th>
        </tr></thead>
        <tbody>
          {meters && (
            <tr className="meta-row">
              <td className="row-label fs-10 c-text-3">m</td>
              {meters.slice(0, 9).map((m, i) => <td key={i} className="fs-10 c-text-3">{m}</td>)}
              <td className="col-out c-text-3">{frontM}</td>
              {meters.slice(9).map((m, i) => <td key={i + 9} className="fs-10 c-text-3">{m}</td>)}
              <td className="col-in c-text-3">{backM}</td>
              <td className="col-total fs-10 c-text-3">{totalM}</td>
            </tr>
          )}
          {si && (
            <tr className="meta-row">
              <td className="row-label fs-10">SI</td>
              {si.slice(0, 9).map((s, i) => <td key={i}>{s}</td>)}
              <td className="col-out" />
              {si.slice(9).map((s, i) => <td key={i + 9}>{s}</td>)}
              <td className="col-in" /><td className="col-total" />
            </tr>
          )}
          <tr className="sep-row">
            <td className="row-label par-label">Par</td>
            {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
            <td className="col-out fw-600">{frontPar}</td>
            {par.slice(9).map((p, i) => <td key={i + 9}>{p}</td>)}
            <td className="col-in fw-600">{backPar}</td>
            <td className="col-total">{totalPar}</td>
          </tr>
          {rounds.map((rd, ri) => {
            const front = rd.scores.slice(0, 9).reduce((a, b) => a + b, 0);
            const back = rd.scores.slice(9).reduce((a, b) => a + b, 0);
            const total = front + back;
            return (
              <tr key={ri}>
                <td className="row-label fw-700">{rd.label}</td>
                {rd.scores.slice(0, 9).map((g, i) => <td key={i}><span className={`sc-score ${scClass(g, par[i])}`}>{g}</span></td>)}
                <Sub gross={front} base={frontPar} cls="col-out" />
                {rd.scores.slice(9).map((g, i) => <td key={i + 9}><span className={`sc-score ${scClass(g, par[i + 9])}`}>{g}</span></td>)}
                <Sub gross={back} base={backPar} cls="col-in" />
                <Sub gross={total} base={totalPar} cls="col-total" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
