/** Badge de posição com medalha no pódio (1º/2º/3º) e cor neutra no resto.
 *  Partilhado por AtletaSearchPanel e SantoDaSerraPanel. */
export default function PosBadge({ pos }: { pos: number }) {
  const styles: Record<number, { bg: string; fg: string; label: string }> = {
    1: { bg: "var(--medal-gold-bg, #fef3c7)", fg: "var(--medal-gold-fg, var(--color-warn-dark))", label: "🥇 1º" },
    2: { bg: "var(--medal-silver-bg, #f1f5f9)", fg: "var(--medal-silver-fg, #475569)", label: "🥈 2º" },
    3: { bg: "var(--medal-bronze-bg, #fdf2e9)", fg: "var(--medal-bronze-fg, #9a3412)", label: "🥉 3º" },
  };
  const s = styles[pos] || { bg: "var(--bg-muted)", fg: "var(--text-2)", label: pos + "º" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 6px", borderRadius: 4,
      background: s.bg, color: s.fg, fontWeight: 700, fontSize: "var(--fs-11)",
      whiteSpace: "nowrap", letterSpacing: 0.2,
    }}>
      {s.label}
    </span>
  );
}
