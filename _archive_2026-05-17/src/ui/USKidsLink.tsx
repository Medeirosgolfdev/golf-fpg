import React from "react";
import { normName as normNameAuto, type AutoRivalPlayer } from "../data/KIDSdataLoader";

interface KidsLinkProps {
  nome: string;
}

// Context for sharing arMap across the component tree
export const ArMapCtx = React.createContext<Map<string, AutoRivalPlayer>>(new Map());

export default function KidsLink({ nome }: KidsLinkProps) {
  const arMap = React.useContext(ArMapCtx);
  const arEntry = arMap.get(normNameAuto(nome));
  if (!arEntry) return null;
  const memberId = (arEntry as any).memberId as string | undefined;
  const hash = memberId ?? encodeURIComponent(arEntry.n);
  return (
    <a
      href="/kids2"
      onClick={(e) => {
        e.preventDefault();
        window.open(`/kids2#${hash}`, "_blank");
      }}
      title="Ver em Kids"
      style={{
        fontWeight: 800,
        color: "var(--color-good-dark)",
        fontSize: 13,
        cursor: "pointer",
        textDecoration: "none",
        flexShrink: 0,
        marginLeft: 4,
      }}
    >
      ↗
    </a>
  );
}
