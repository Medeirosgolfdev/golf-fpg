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
import { useSort, compareTextNullsLast } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import { tpColor } from "../../../ui/tournamentPrimitives";
import { fmtHcp } from "../../../utils/format";
import Modal from "../../../ui/Modal";
import Sparkline from "../../../ui/Sparkline";

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

  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const delta = last.hcpExact - first.hcpExact;
  const trendColor = tpColor(delta) ?? "var(--text-3)";

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        title={`HCP: ${fmtHcp(first.hcpExact)} (${first.date}) → ${fmtHcp(last.hcpExact)} (${last.date}) · ${sorted.length} snapshots · click para ver tudo`}
        className="u-d-inline-flex u-ai-center u-bg-transparent u-bd-none u-p-0 u-ml-4px u-cur-pointer u-va-middle"
        aria-label={`Série de HCP (${sorted.length} snapshots)`}
      >
        {/* HCP alto em cima: uma linha a descer = melhoria. */}
        <Sparkline values={sorted.map((p) => p.hcpExact)} width={width} height={height} stroke={trendColor} />
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
  const dir = sortDir === "asc" ? 1 : -1;
  const rows = [...desc].sort((a, b) => {
    // Vazios (sem fonte, sem data) sempre no fim, nas duas direcções.
    const c = sortKey === "hcp" ? (a.hcpExact - b.hcpExact) * dir
      : sortKey === "source" ? compareTextNullsLast(a.source, b.source, dir)
      : sortKey === "label" ? labelOf(a).localeCompare(labelOf(b), "pt") * dir
      : compareTextNullsLast(a.date, b.date, dir);
    return c || (b.date || "").localeCompare(a.date || "");
  });
  const hdr = (k: "date" | "hcp" | "source" | "label", label: string, className?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={className}>{label}</SortableHdr>;

  return (
    <Modal onClose={onClose} size="md" title={`📈 Histórico de HCP${playerName ? ` — ${playerName}` : ""}`}>

        <div className="u-fs-fs-12 u-c-text-3 u-mb-10px">
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
                  {fmtHcp(p.hcpExact)}
                </td>
                <td className="u-c-text-2">{p.source}</td>
                <td className="u-c-text-2">
                  {p.label || (p.tcode ? `tcode ${p.tcode}` : "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </Modal>
  );
}
