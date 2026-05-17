import type { ScoutingReport } from "./types";
import { shortName } from "../../utils/format";

/* ── Painel "O que decide em Aroeira" ── */
export default function FieldIntelligence({ reports, escalao }: { reports: ScoutingReport[]; escalao: string }) {
  if (reports.length < 2) return null;

  function rankList(key: keyof ScoutingReport, inverted = false) {
    return [...reports].filter(r => r[key] != null)
      .sort((a, b) => inverted ? (b[key] as number) - (a[key] as number) : (a[key] as number) - (b[key] as number))
      .slice(0, Math.min(reports.length, 5));
  }

  const sections = [
    {
      title: "Par-5 scoring — onde se ganham as posições",
      why: `Em ${escalao === "Sub-10" ? "27H" : "54H"} stroke play, os par-5 são as únicas oportunidades garantidas de birdie. Quem capitaliza ganha 1–2 pancadas por volta sobre o resto do campo.`,
      data: rankList("par5avg").map((r, i) => ({ name: shortName(r.nome), v: `${r.par5avg! > 0 ? "+" : ""}${r.par5avg!.toFixed(2)}/h`, fed: r.fed,
        color: r.par5avg! < 0.7 ? "var(--color-good)" : r.par5avg! < 1.2 ? "var(--color-warn)" : "var(--color-bad)", rank: i+1 })),
    },
    {
      title: "Gestão de risco — duplo+ avoidance",
      why: "Em 54 buracos sem cut, uma volta de +12 que incluí dois triplos pode ser irreparável. O jogador que nunca explode ganha consistência ao longo dos 3 dias.",
      data: rankList("blowupPct").map((r, i) => ({ name: shortName(r.nome), v: `${r.blowupPct.toFixed(0)}%`, fed: r.fed,
        color: r.blowupPct < 10 ? "var(--color-good)" : r.blowupPct < 16 ? "var(--color-warn)" : "var(--color-bad)", rank: i+1 })),
    },
    {
      title: "Forma recente — os últimos 5 torneios vs histórico",
      why: "Quem chega ao torneio com o SD das últimas 5 rondas melhor que a sua média pessoal está num ciclo de evolução. Nos majors amadores, a forma imediata é mais preditiva que o histórico de longo prazo.",
      data: rankList("formDelta").map((r, i) => ({ name: shortName(r.nome), v: r.formDelta! < 0 ? `${r.formDelta!.toFixed(1)} ↑` : `+${r.formDelta!.toFixed(1)}`, fed: r.fed,
        color: r.formDelta! < -1 ? "var(--color-good)" : r.formDelta! > 1 ? "var(--color-bad)" : "var(--text-2)", rank: i+1 })),
    },
    ...(reports.filter(r => r.aroeiraRounds > 0).length >= 2 ? [{
      title: "Experiência em Aroeira — conhecimento do campo",
      why: "Aroeira 2 tem greens rápidos e buracos com OB laterais. Ter rondas no campo traduz-se em menos erros estratégicos e gestão de tempo de putting.",
      data: rankList("aroeiraAvg").filter(r => r.aroeiraRounds > 0).map((r, i) => ({ name: shortName(r.nome), v: `${r.aroeiraAvg?.toFixed(1)} (${r.aroeiraRounds}×)`, fed: r.fed,
        color: "var(--chart-2)", rank: i+1 })),
    }] : []),
  ];

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-page)" }}>
        <div className="fw-800 fs-14">O que decide este torneio</div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
          Factores preditivos para 54H stroke play em Aroeira{escalao === "Sub-12" || escalao === "Sub-10" ? " · máx 10/buraco" : ""}
        </div>
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        {sections.map((s, si) => (
          <div key={si} style={{ paddingTop: 14, borderTop: si > 0 ? "1px solid var(--border)" : "none", marginTop: si > 0 ? 0 : 14 }}>
            <div className="fw-700 fs-12 mb-4">{s.title}</div>
            <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.55, marginBottom: 10, maxWidth: 620 }}>{s.why}</div>
            <div className="flex-wrap d-flex gap-6">
              {s.data.map(d => (
                <a key={d.fed} href={`/jogadores/${d.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-page)",
                    border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 700 }}>#{d.rank}</span>
                  <span className="fs-12 fw-600">{d.name}</span>
                  <span className="fs-13 fw-800" style={{ color: d.color }}>{d.v}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
