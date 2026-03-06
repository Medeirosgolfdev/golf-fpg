type Props = {
  label: string;
  colorHex?: string;
  suffix?: string | null;
};

export default function TeeBadge({ label, colorHex = "#9CA3AF", suffix }: Props) {
  const isSex = suffix === "M" || suffix === "F";
  return (
    <span className="tee-badge">
      <span className="tee-dot" style={{ background: colorHex }} />
      <span className="tee-label">{label}</span>
      {suffix ? (
        isSex
          ? <span className={`jog-sex-inline jog-sex-${suffix}`}>{suffix}</span>
          : <span className="tee-suffix">{suffix}</span>
      ) : null}
    </span>
  );
}
