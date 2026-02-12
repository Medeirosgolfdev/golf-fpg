type Props = {
  label: string;
  colorHex?: string;
  suffix?: string | null;
};

export default function TeeBadge({ label, colorHex = "#9CA3AF", suffix }: Props) {
  return (
    <span className="tee-badge">
      <span className="tee-dot" style={{ background: colorHex }} />
      <span className="tee-label">{label}</span>
      {suffix ? <span className="tee-suffix">{suffix}</span> : null}
    </span>
  );
}
