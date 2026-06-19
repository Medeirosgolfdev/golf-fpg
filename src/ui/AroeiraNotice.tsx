/**
 * AroeiraNotice.tsx
 *
 * Nota informativa que aparece em scorecards de campos com agrupamento /
 * unificação aplicados:
 *
 *   - PGA Aroeira No.1 / No.2 — agrupa nomes alternativos (Challenge, Pines
 *     Classic, Aroeira I, Aroeira II) e, para o No.2, indica rondas que
 *     foram rotacionadas +6 buracos (config antiga).
 *   - Santo da Serra — explica que rondas com diferentes ordens F9/B9 dos 3
 *     nines (Machico/Desertas/Serras) foram colapsadas e que rondas 9H mal-
 *     etiquetadas são re-distribuídas pelo nine real (par[]).
 *
 * Renderiza nada se courseName não for um dos campos suportados.
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

/* Santo da Serra — todas as variantes que a FPG usa */
const ALIASES_SDS_18H = ["F9 + B9 em qualquer ordem (Serras-Machico ≡ Machico-Serras → Machico+Serras)"];
const ALIASES_SDS_9H = ["Rondas mal-etiquetadas (par real ≠ nine no nome) re-distribuídas pelo nine correcto"];

export default function AroeiraNotice({ courseName, rotatedCount, totalRounds, compact }: Props) {
  const trimmed = (courseName || "").trim();
  const isNo1 = /^pga\s+aroeira\s+no\.?\s*1$/i.test(trimmed);
  const isNo2 = /^pga\s+aroeira\s+no\.?\s*2$/i.test(trimmed);
  // Santo da Serra reconhece-se por prefixo (qualquer variante de nines/combo)
  const isSDS = /^santo\s+da\s+serra\s*-/i.test(trimmed) || /^sto\.?\s+da\s+serra\s*-/i.test(trimmed);
  if (!isNo1 && !isNo2 && !isSDS) return null;

  let title: string;
  let aliases: string[];
  if (isNo1) { title = "PGA Aroeira No.1"; aliases = ALIASES_NO1; }
  else if (isNo2) { title = "PGA Aroeira No.2"; aliases = ALIASES_NO2; }
  else {
    title = trimmed;
    // Detectar 18H combination ("X+Y" / "X×2") vs 9H (single nine)
    aliases = /\+|×2/.test(trimmed) ? ALIASES_SDS_18H : ALIASES_SDS_9H;
  }
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
          fontSize: "var(--fs-13)",
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
    <div className="notice notice-info">
      <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--text-1)" }}>
        ⓘ {title} — bucket unificado
      </div>
      <div style={{ color: "var(--text-2)" }}>
        Este campo agrupa rondas que a FPG publicou ao longo dos anos com vários nomes alternativos:{" "}
        {aliases.map((a, i) => (
          <React.Fragment key={a}>
            {i > 0 && ", "}
            <code style={{ background: "var(--bg-code, rgba(0,0,0,0.06))", padding: "1px 5px", borderRadius: 3, fontSize: "var(--fs-11)" }}>{a}</code>
          </React.Fragment>
        ))}
        {". "}A unificação é feita por par[] verificado em todas as rondas — zero rondas perdidas.
      </div>
      {showRotation && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-light)", color: "var(--text-2)" }}>
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
