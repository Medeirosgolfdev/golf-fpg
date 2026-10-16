/*
 * Designs RESUMO DO TORNEIO — todas as voltas de um jogador (d.rounds):
 * V50 Resumo do Torneio · V51 Voltas lado a lado (buraco a buraco, com a
 * diferença entre as duas últimas) · V52 Evolução (de volta para volta).
 * Só aparecem quando o painel escolhe «Torneio» (d.rounds com 2+ voltas).
 */
import { II, OS, BN, fillA, countHoles } from "../shared";
import { SC, TpBadge, StatsRow } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P, RoundSum } from "../types";

const tot = (rs: RoundSum[]) => rs.reduce((a, r) => a + r.gross, 0);
const totPar = (rs: RoundSum[]) => rs.reduce((a, r) => a + r.toPar, 0);
/** Breakdown de todas as voltas juntas. */
const allStats = (rs: RoundSum[]) => countHoles(rs.flatMap((r) => r.scores), rs.flatMap((r) => r.par));
/** Cor da diferença de pancadas: menos = verde, mais = vermelho. */
const dCol = (d: number) => (d < 0 ? "#22c55e" : d > 0 ? "#f87171" : "inherit");
const fmtD = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `${d}` : "=");

/* V50 · RESUMO DO TORNEIO — total, posição e cada volta numa linha. */
export function V50({ d, v, bg, tc = "white", tc3, fa }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const best = Math.min(...rs.map((r) => r.gross));
  const meta = [v.event && d.event, v.course && d.course].filter(Boolean).join(" · ");
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 12px", minWidth: 220 }}>
      {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 22, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.1 }}>{d.player}</div>}
      {meta && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: tc3, marginTop: 2, lineHeight: 1.4 }}>{meta}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, margin: "6px 0 4px" }}>
        <div style={{ fontFamily: BN, fontSize: 70, lineHeight: .9, letterSpacing: -2 }}>{tot(rs)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 4 }}>
          <TpBadge vp={totPar(rs)} sz={18} />
          {v.position && d.position && <div style={{ fontFamily: OS, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{d.position}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rs.map((r) => (
          <div key={r.round} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "3px 8px", borderRadius: 6,
            background: r.gross === best ? fillA("#ffffff", (fa ?? .88) * .18) : undefined }}>
            <span style={{ fontFamily: OS, fontSize: 13, fontWeight: 700, color: tc3, width: 22 }}>R{r.round}</span>
            <span style={{ fontFamily: BN, fontSize: 26, lineHeight: 1, width: 34 }}>{r.gross}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: r.toPar < 0 ? "#f87171" : r.toPar > 0 ? "#60a5fa" : "inherit", width: 34 }}>{fmtToPar(r.toPar)}</span>
            {v.date && r.date && <span style={{ fontSize: 10, color: tc3 }}>{r.date}</span>}
            {r.gross === best && <span style={{ fontSize: 11 }}>★</span>}
          </div>
        ))}
      </div>
      {v.stats && <div style={{ marginTop: 6 }}><StatsRow st={allStats(rs)} tc3={tc3} gap={6} fs={10} /></div>}
    </div>
  );
}

/* V51 · VOLTAS LADO A LADO — buraco a buraco, uma linha por volta; com 2+
   voltas, a linha Δ mostra a diferença da última para a anterior. */
export function V51({ d, v, bg, tc = "white", tc3, fa }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const nh = rs[0].scores.length;
  const nines = nh >= 18 ? [[0, 9], [9, 9]] : [[0, nh]];
  const a = rs[rs.length - 2], b = rs[rs.length - 1];
  const SZ = 26, W = 28, LW = 26;
  const sub = (r: RoundSum, off: number, len: number) => r.scores.slice(off, off + len).reduce((x, y) => x + y, 0);
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginBottom: 6 }}>
        <div>
          {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.1 }}>{d.player}</div>}
          {v.event && d.event && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: tc3, marginTop: 1 }}>{d.event}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontFamily: BN, fontSize: 40, lineHeight: .9 }}>{tot(rs)}</span>
          <TpBadge vp={totPar(rs)} sz={14} />
          {v.position && d.position && <span style={{ fontFamily: OS, fontSize: 14, fontWeight: 700 }}>{d.position}</span>}
        </div>
      </div>
      {v.holeScores && nines.map(([off, len]) => (
        <div key={off} style={{ marginBottom: 6, background: fillA("#000000", (fa ?? .88) * .25), borderRadius: 6, padding: "3px 4px" }}>
          <div style={{ display: "flex", gap: 2, fontSize: 9, fontWeight: 700, color: tc3 }}>
            <span style={{ width: LW }} />
            {Array.from({ length: len }, (_, i) => <span key={i} style={{ width: W, textAlign: "center" }}>{off + i + 1}</span>)}
            <span style={{ width: 30, textAlign: "center" }}>{off === 0 && nh >= 18 ? "Out" : nh >= 18 ? "In" : "Tot"}</span>
          </div>
          {rs.map((r) => (
            <div key={r.round} style={{ display: "flex", gap: 2, alignItems: "center", marginTop: 2 }}>
              <span style={{ width: LW, fontFamily: OS, fontSize: 11, fontWeight: 700, color: tc3 }}>R{r.round}</span>
              {r.scores.slice(off, off + len).map((sc, i) => (
                <span key={i} style={{ width: W, display: "flex", justifyContent: "center" }}><SC sc={sc} par={r.par[off + i]} h={off + i} sz={SZ} /></span>
              ))}
              <span style={{ width: 30, textAlign: "center", fontFamily: BN, fontSize: 20 }}>{sub(r, off, len)}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 2, alignItems: "center", marginTop: 2, fontSize: 11, fontWeight: 800 }}>
            <span style={{ width: LW, fontFamily: OS, color: tc3 }}>Δ</span>
            {Array.from({ length: len }, (_, i) => {
              const dd = b.scores[off + i] - a.scores[off + i];
              return <span key={i} style={{ width: W, textAlign: "center", color: dd ? dCol(dd) : tc3, opacity: dd ? 1 : .5 }}>{dd ? fmtD(dd) : "·"}</span>;
            })}
            {(() => { const dd = sub(b, off, len) - sub(a, off, len); return <span style={{ width: 30, textAlign: "center", color: dCol(dd) }}>{fmtD(dd)}</span>; })()}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, fontWeight: 700, color: tc3 }}>
        {rs.map((r) => `R${r.round} ${r.gross}`).join(" · ")}
        {" · "}<span style={{ color: dCol(b.gross - a.gross) }}>R{b.round} vs R{a.round}: {fmtD(b.gross - a.gross)}</span>
      </div>
    </div>
  );
}

/* V52 · EVOLUÇÃO — «85 → 80», a melhoria em pancadas, total e posição. */
export function V52({ d, v, bg, tc = "white", tc3 }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const a = rs[0], b = rs[rs.length - 1];
  const diff = b.gross - a.gross;
  const msg = diff < 0 ? `${-diff} pancada${diff === -1 ? "" : "s"} melhor` : diff > 0 ? `${diff} pancada${diff === 1 ? "" : "s"} acima` : "igual";
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
      {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{d.player}</div>}
      {v.event && d.event && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: tc3 }}>{d.event}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 }}>
        {rs.map((r, i) => (
          <span key={r.round} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <span style={{ fontSize: 22, color: tc3 }}>→</span>}
            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontFamily: BN, fontSize: i === rs.length - 1 ? 64 : 44, lineHeight: .9, opacity: i === rs.length - 1 ? 1 : .75 }}>{r.gross}</span>
              <span style={{ fontFamily: OS, fontSize: 11, fontWeight: 700, color: tc3 }}>R{r.round}</span>
            </span>
          </span>
        ))}
      </div>
      <div style={{ fontFamily: OS, fontSize: 16, fontWeight: 700, letterSpacing: 1, color: dCol(diff), marginTop: 4, textTransform: "uppercase" }}>{msg}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: tc3, marginTop: 4 }}>
        Total {tot(rs)} ({fmtToPar(totPar(rs))}){v.position && d.position ? ` · ${d.position}` : ""}{v.date && d.date ? ` · ${d.date}` : ""}
      </div>
    </div>
  );
}
