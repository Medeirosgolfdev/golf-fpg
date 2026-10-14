/**
 * src/ui/ManuelResultPills.tsx — o resultado do Manuel em pílulas pequenas no
 * cabeçalho do torneio: «★ Boys 12 · R1 · 81 (+9) · +3 do líder».
 *
 * Nasceu no USKids e passou a ser de TODAS as secções (FPG, Drive, MAJOR, FFG,
 * RFEG, GJGL…) — 14/10/2026, «estas melhorias devem ser aplicadas a todos os
 * tabs». Cor do Manuel: a da pílula «★ Manuel» e da linha dele nas tabelas.
 */
import type { Tournament } from "../data/fpgTypes";
import { isManuelByName } from "../constants/manuel";
import { fmtToPar } from "../utils/format";

const sum = (a?: (number | null)[]) => (a || []).reduce<number>((s, v) => s + (v || 0), 0);
const completa = (rs: { scores?: number[]; pars?: (number | null)[]; gross?: number | null }) =>
  (rs.gross ?? 0) > 0 && (!rs.pars?.length || (rs.scores || []).filter((x) => x > 0).length >= rs.pars.length);

export default function ManuelResultPills({ tournament, label }: { tournament: Tournament | null | undefined; label?: string | null }) {
  const m = tournament?.players.find((p) => isManuelByName(p.name));
  if (!tournament || !m) return null;
  const pills = (m.roundScores || []).filter(completa).map((rs) => {
    const gross = rs.gross as number;
    const par = sum(rs.pars);
    const toPar = par > 0 ? gross - par : null;
    // Líder da volta: o menor gross de quem fez essa volta completa.
    const leader = Math.min(...tournament.players
      .map((p) => (p.roundScores || []).find((x) => x.round === rs.round))
      .filter((x): x is NonNullable<typeof x> => !!x && completa(x))
      .map((x) => x.gross as number));
    const diff = Number.isFinite(leader) ? gross - leader : null;
    return { round: rs.round, gross, toPar, diff };
  });
  if (!pills.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      {pills.map((x) => (
        <span key={x.round} className="p p-sm fw-700" style={{
          background: "var(--bg-success-strong)", color: "var(--color-good-dark)",
          borderColor: "var(--color-good)", display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          <span>★</span>
          <span>{label ? `${label} · ` : ""}R{x.round} · {x.gross}{x.toPar != null ? ` (${fmtToPar(x.toPar)})` : ""}</span>
          {x.diff != null && <span className="fw-400" style={{ opacity: 0.8 }}>· {x.diff === 0 ? "líder" : `+${x.diff} do líder`}</span>}
        </span>
      ))}
    </div>
  );
}
