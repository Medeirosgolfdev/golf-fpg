/**
 * RotatedNotice.tsx
 *
 * Pequena nota informativa para mostrar no header de scorecards cuja
 * sequência de buracos foi rotacionada (ex: rondas no PGA Aroeira No.2
 * jogadas na configuração antiga e re-alinhadas com a numeração actual).
 *
 * Usar quando uma ronda tem o flag `_rotated` definido (vê
 * `rotateAroeira2RoundIfNeeded` em utils/courseAliases.ts).
 *
 * Renderiza nada se a flag estiver ausente / a 0.
 */
import React from "react";

interface Props {
  /** Número de posições rotacionadas (12 = +6 buracos = "buraco 1 antigo é o 7 actual"). */
  rotated?: number;
  /** Variante "inline" para tabelas — mais pequena, sem borda. */
  inline?: boolean;
}

export default function RotatedNotice({ rotated, inline }: Props) {
  if (!rotated) return null;
  // 12 array-positions = 6 buracos rodados (= +6 wrap)
  const offsetHoles = Math.round(rotated / 2);

  if (inline) {
    return (
      <span
        title={`Buracos renumerados: a sequência jogada foi rodada +${offsetHoles} para alinhar com o layout actual do campo`}
        style={{
          fontSize: "var(--fs-10)",
          color: "var(--text-2)",
          marginLeft: 6,
          padding: "1px 5px",
          border: "1px dashed var(--border-light)",
          borderRadius: 4,
          fontStyle: "italic",
          whiteSpace: "nowrap",
        }}
      >
        ↻ rotação +{offsetHoles}
      </span>
    );
  }

  return (
    <div
      style={{
        fontSize: "var(--fs-11)",
        color: "var(--text-2)",
        marginTop: 6,
        padding: "6px 10px",
        background: "var(--bg-muted)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 4,
        fontStyle: "italic",
        lineHeight: 1.5,
      }}
    >
      ⓘ <b>Buracos renumerados.</b> Esta ronda foi jogada na configuração
      anterior do campo. Para alinhar com a numeração actual, a sequência foi
      rodada +{offsetHoles} buracos — o que se jogou primeiro (antigo buraco 1)
      aparece agora no buraco {offsetHoles + 1}, e os buracos finais do dia
      ({18 - offsetHoles + 1}–18 jogados) passaram para o início do scorecard
      (buracos 1–{offsetHoles}). O total e a soma F9/B9 ficam diferentes do
      cartão original mas são o cálculo correcto na numeração de hoje.
    </div>
  );
}
