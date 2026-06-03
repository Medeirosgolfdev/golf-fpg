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

  // No golfe, HCP menor é melhor — invertemos Y para que "para baixo" = melhor (subir = pior)
  // Visualmente: linha que desce = melhoria
  const points2d = sorted.map((p, i) => {
    const x = padding + i * xStep;
    const y = padding + ((p.hcpExact - minV) / range) * (height - 2 * padding);
    return { x, y, p };
  });

  const path = points2d
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ");

  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const delta = last.hcpExact - first.hcpExact;
  const trendColor = delta < 0 ? "var(--success, #16a34a)" : delta > 0 ? "var(--danger, #dc2626)" : "var(--text-3, #6b7280)";

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
        zIndex: 1000,
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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
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
              fontSize: 13,
            }}
          >
            Fechar
          </button>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-3, #6b7280)", marginBottom: 10 }}>
          {desc.length} snapshots · {desc[desc.length - 1]?.date} → {desc[0]?.date}
        </div>

        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-light, #e5e7eb)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Data</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>HCP</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Fonte</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Torneio</th>
            </tr>
          </thead>
          <tbody>
            {desc.map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-light, #f3f4f6)" }}>
                <td style={{ padding: "5px 8px", fontVariantNumeric: "tabular-nums" }}>{p.date}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {p.hcpExact.toFixed(1)}
                </td>
                <td style={{ padding: "5px 8px", color: "var(--text-2, #4b5563)" }}>{p.source}</td>
                <td style={{ padding: "5px 8px", color: "var(--text-2, #4b5563)" }}>
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
