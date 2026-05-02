/**
 * AroeiraNotice.tsx
 *
 * Nota informativa que aparece quando se está a ver scorecards de campos
 * PGA Aroeira (No.1 ou No.2). Explica:
 *
 *   1. Que rondas com nomes históricos diferentes foram unificadas neste
 *      bucket de campo (Challenge, Pines Classic, Aroeira I, Aroeira II).
 *   2. Que rondas em config antiga foram rotacionadas +6 buracos para alinhar
 *      com a numeração actual (só relevante para o No.2).
 *
 * Renderiza nada se courseName não for um dos dois Aroeira canónicos.
 */
import React from "react";

interface Props {
  /** Nome canónico do campo (ex: "PGA  Aroeira No.2"). */
  courseName: string;
  /** Quantas rondas no bucket têm flag _rotated (= jogadas em config antiga). */
  rotatedCount?: number;
  /** Total de rondas no bucket — usado para mostrar "%". */
  totalRounds?: number;
  /** Variante "compacta" para listas — só mostra ícone + tooltip. */
  compact?: boolean;
}

const ALIASES_NO1 = ["Aroeira I", "Aroeira Pines Classic", "Aroeira II (par No.1)"];
const ALIASES_NO2 = ["Aroeira II (par No.2)", "Aroeira Challenge", "PGA Aroeira No.2 (configuração antiga)", "PGA Aroeira No.2 — CNJ FPG"];

export default function AroeiraNotice({ courseName, rotatedCount, totalRounds, compact }: Props) {
  const isNo1 = /^pga\s+aroeira\s+no\.?\s*1$/i.test((courseName || "").trim());
  const isNo2 = /^pga\s+aroeira\s+no\.?\s*2$/i.test((courseName || "").trim());
  if (!isNo1 && !isNo2) return null;

  const title = isNo1 ? "PGA Aroeira No.1" : "PGA Aroeira No.2";
  const aliases = isNo1 ? ALIASES_NO1 : ALIASES_NO2;
  const showRotation = isNo2 && (rotatedCount ?? 0) > 0;

  if (compact) {
    const lines: string[] = [];
    lines.push(`${title} — bucket unificado de:`);
    aliases.forEach(a => lines.push(`  • ${a}`));
    if (showRotation) {
      lines.push("");
      lines.push(`${rotatedCount} ronda${rotatedCount! > 1 ? "s" : ""} ${totalRounds ? `de ${totalRounds} ` : ""}jogada${rotatedCount! > 1 ? "s" : ""} na configuração anterior do campo (renumeração 2025) — sequência rodada +6 buracos para alinhar com a numeração actual.`);
    }
    return (
      <span
        title={lines.join("\n")}
        style={{
          display: "inline-block",
          fontSize: 13,
          color: "var(--text-2)",
          marginLeft: 6,
          cursor: "help",
          lineHeight: 1,
        }}
        aria-label={`${title} — campo unificado${showRotation ? `; ${rotatedCount} ronda${rotatedCount! > 1 ? "s" : ""} rotacionada${rotatedCount! > 1 ? "s" : ""}` : ""}`}
      >
        ⓘ
      </span>
    );
  }

  return (
    <div
      style={{
        margin: "8px 0 12px",
        padding: "10px 14px",
        background: "var(--bg-soft, rgba(99, 156, 245, 0.06))",
        borderLeft: "4px solid var(--color-accent, #5b8ff9)",
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.55,
        color: "var(--text-1)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        ⓘ {title} — bucket unificado
      </div>
      <div style={{ color: "var(--text-2)" }}>
        Este campo agrupa rondas que a FPG publicou ao longo dos anos com vários nomes alternativos:{" "}
        {aliases.map((a, i) => (
          <React.Fragment key={a}>
            {i > 0 && ", "}
            <code style={{ background: "var(--bg-code, rgba(0,0,0,0.06))", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>{a}</code>
          </React.Fragment>
        ))}
        {". "}A unificação é feita por par[] verificado em todas as rondas — zero rondas perdidas.
      </div>
      {showRotation && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-soft, rgba(0,0,0,0.08))", color: "var(--text-2)" }}>
          <b>Renumeração de buracos.</b>{" "}
          {rotatedCount}
          {totalRounds ? ` de ${totalRounds}` : ""} ronda{rotatedCount! > 1 ? "s" : ""}{" "}
          {rotatedCount! > 1 ? "foram" : "foi"} jogada{rotatedCount! > 1 ? "s" : ""} na <b>configuração anterior</b> do campo
          (até inicio de 2025; o Nacional Jovens 2026 também voltou a usá-la).
          A FPG reconfigurou a sequência: o que era o <b>buraco 1</b> antigo é hoje o <b>buraco 7</b>.
          Para alinhar todos os scorecards com a numeração actual, essas rondas têm a sequência rodada
          +6 buracos — o que se jogou primeiro aparece nos buracos 7-18 do scorecard, e os 6 últimos buracos jogados
          aparecem como buracos 1-6. O total e a soma F9/B9 ficam diferentes do cartão original mas são o cálculo
          correcto na numeração de hoje.
        </div>
      )}
    </div>
  );
}

/**
 * Helper: conta quantas rondas num CourseData têm flag `_rotated` setada.
 * Usar antes de passar o `rotatedCount` ao componente.
 */
export function countRotatedRounds(
  rounds: { scoreId: string }[],
  holes: Record<string, { _rotated?: number }>,
): number {
  let n = 0;
  for (const r of rounds) {
    if (holes[r.scoreId]?._rotated) n++;
  }
  return n;
}
