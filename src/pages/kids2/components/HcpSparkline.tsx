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
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";

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
  const trendColor = delta < 0 ? "var(--color-good)" : delta > 0 ? "var(--danger, var(--color-danger))" : "var(--text-3, #6b7280)";

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        title={`HCP: ${first.hcpExact.toFixed(1)} (${first.date}) → ${last.hcpExact.toFixed(1)} (${last.date}) · ${sorted.length} snapshots · click para ver tudo`}
        className="u-d-inline-flex u-ai-center u-bg-transparent u-bd-none u-p-0 u-ml-4px u-cur-pointer u-va-middle"
        aria-label={`Série de HCP (${sorted.length} snapshots)`}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="u-d-block">
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
  // Por defeito desc (mais recente em cima); a tabela ordena-se pelo cabeçalho.
  const desc = [...points].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const { sortKey, sortDir, toggleSort } = useSort<"date" | "hcp" | "source" | "label">("date", "desc", { source: "asc", label: "asc", hcp: "asc" });
  const labelOf = (p: HcpPoint) => p.label || (p.tcode ? `tcode ${p.tcode}` : "");
  const rows = [...desc].sort((a, b) => {
    const c = sortKey === "hcp" ? a.hcpExact - b.hcpExact
      : sortKey === "source" ? (a.source || "").localeCompare(b.source || "", "pt")
      : sortKey === "label" ? labelOf(a).localeCompare(labelOf(b), "pt")
      : (a.date || "").localeCompare(b.date || "");
    return (sortDir === "asc" ? c : -c) || (b.date || "").localeCompare(a.date || "");
  });
  const hdr = (k: "date" | "hcp" | "source" | "label", label: string, className?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={className}>{label}</SortableHdr>;

  return (
    <div
      onClick={onClose}
      className="u-pos-fixed u-inset-0 u-bg-rgba-0-0-0-0_5 u-z-z-overlay u-d-flex u-ai-center u-jc-center u-p-20px"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="u-bg-bg-card u-br-8px u-maxw-600px u-w-100pc u-maxh-85vh u-ov-auto u-p-20px u-bs-0-20px-50px-rgba-0-0-0-0_3"
      >
        <div className="u-d-flex u-jc-space-between u-ai-center u-mb-14px">
          <h3 className="u-m-0 u-fs-fs-16 u-fw-700">
            📈 Histórico de HCP{playerName ? ` — ${playerName}` : ""}
          </h3>
          <button
            onClick={onClose}
            className="u-bg-transparent u-bd-eig1p u-br-radius-sm u-p-4px-10px u-cur-pointer u-fs-fs-13"
          >
            Fechar
          </button>
        </div>

        <div className="u-fs-fs-12 u-c-var-text-3-6b7280 u-mb-10px">
          {desc.length} snapshots · {desc[desc.length - 1]?.date} → {desc[0]?.date}
        </div>

        <table className="dtable">
          <thead>
            <tr>
              {hdr("date", "Data")}
              {hdr("hcp", "HCP", "r")}
              {hdr("source", "Fonte")}
              {hdr("label", "Torneio")}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i}>
                <td>{p.date}</td>
                <td className="r u-fw-600">
                  {p.hcpExact.toFixed(1)}
                </td>
                <td className="u-c-text-2">{p.source}</td>
                <td className="u-c-text-2">
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
