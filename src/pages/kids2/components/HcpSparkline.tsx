/**
 * HcpSparkline — mini-chart inline para mostrar a evolução de HCP exacto.
 *
 * Renderiza:
 *   - Um SVG de 80×20px por defeito
 *   - Linha conectando os pontos cronologicamente (mais antigo → mais recente)
 *   - Click abre modal com tabela completa de snapshots
 *
 * Espera um array `points: HcpPoint[]` ordenado DESC por date (formato do
 * juniors.json). Internamente inverte para cronológica.
 */

import { useState, useMemo } from "react";
import type { HcpPoint } from "../data";

interface Props {
  points: HcpPoint[];
  width?: number;
  height?: number;
  playerName?: string;
}

export default function HcpSparkline({ points, width = 80, height = 20, playerName }: Props) {
  const [showModal, setShowModal] = useState(false);

  // Ordenar cronologicamente (mais antigo → mais recente)
  const sorted = useMemo(() => {
    return [...points].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [points]);

  if (sorted.length < 2) return null;

  const values = sorted.map((p) => p.hcpExact);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const xStep = (width - 4) / (sorted.length - 1);
  const padding = 2;

  // HCP alto em cima, HCP baixo em baixo (orientação natural do valor numérico).
  // Como no golfe HCP menor = melhor, uma linha a descer visualmente = melhoria.
  const points2d = sorted.map((p, i) => {
    const x = padding + i * xStep;
    const y = padding + ((maxV - p.hcpExact) / range) * (height - 2 * padding);
    return { x, y, p };
  });

  const path = points2d
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ");

  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const delta = last.hcpExact - first.hcpExact;
  const trendColor = delta < 0 ? "var(--success, var(--color-good))" : delta > 0 ? "var(--danger, var(--color-danger))" : "var(--text-3, #6b7280)";

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        title={`HCP: ${first.hcpExact.toFixed(1)} (${first.date}) → ${last.hcpExact.toFixed(1)} (${last.date}) · ${sorted.length} snapshots · click para ver tudo`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          marginLeft: 4,
          cursor: "pointer",
          verticalAlign: "middle",
        }}
        aria-label={`Série de HCP (${sorted.length} snapshots)`}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
          <path d={path} fill="none" stroke={trendColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          {/* Último ponto destacado */}
          <circle cx={points2d[points2d.length - 1].x} cy={points2d[points2d.length - 1].y} r={2} fill={trendColor} />
        </svg>
      </button>

      {showModal && (
        <HcpHistoryModal
          points={sorted}
          playerName={playerName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function HcpHistoryModal({
  points,
  playerName,
  onClose,
}: {
  points: HcpPoint[];
  playerName?: string;
  onClose: () => void;
}) {
  // Renderizar desc (mais recente em cima)
  const desc = [...points].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: "var(--z-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-default, #fff)",
          borderRadius: 8,
          maxWidth: 600,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 20,
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: "var(--fs-16)", fontWeight: 700 }}>
            📈 Histórico de HCP{playerName ? ` — ${playerName}` : ""}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--border-light, #e5e7eb)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: "var(--fs-13)",
            }}
          >
            Fechar
          </button>
        </div>

        <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3, #6b7280)", marginBottom: 10 }}>
          {desc.length} snapshots · {desc[desc.length - 1]?.date} → {desc[0]?.date}
        </div>

        <table className="dtable">
          <thead>
            <tr>
              <th>Data</th>
              <th className="r">HCP</th>
              <th>Fonte</th>
              <th>Torneio</th>
            </tr>
          </thead>
          <tbody>
            {desc.map((p, i) => (
              <tr key={i}>
                <td>{p.date}</td>
                <td className="r" style={{ fontWeight: 600 }}>
                  {p.hcpExact.toFixed(1)}
                </td>
                <td style={{ color: "var(--text-2)" }}>{p.source}</td>
                <td style={{ color: "var(--text-2)" }}>
                  {p.label || (p.tcode ? `tcode ${p.tcode}` : "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
