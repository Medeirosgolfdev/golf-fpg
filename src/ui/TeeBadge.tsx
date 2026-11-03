import { C } from "../utils/colors";
import SexBadge from "./SexBadge";
import { Tint } from "./DataStyle";

type Props = {
  label: string;
  colorHex?: string;
  suffix?: string | null;
};

export default function TeeBadge({ label, colorHex = C.medalSilver, suffix }: Props) {
  const isSex = suffix === "M" || suffix === "F";
  return (
    <span className="tee-badge">
      <Tint className="tee-dot" bg={colorHex} />
      <span className="tee-label">{label}</span>
      {suffix ? (
        isSex
          ? <SexBadge sex={suffix as "M" | "F"} size="sm" />
          : <span className="tee-suffix">{suffix}</span>
      ) : null}
    </span>
  );
}
