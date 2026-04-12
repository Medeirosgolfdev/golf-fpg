import React from "react";

interface SortableHdrProps {
  k: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function SortableHdr({
  k, sortKey, sortDir, onSort, children, className, style,
}: SortableHdrProps) {
  const active = sortKey === k;
  return (
    <th
      className={"lb-sortable " + (className || "")}
      style={{ ...style, color: active ? "var(--accent)" : undefined, fontWeight: active ? 700 : undefined }}
      title={active ? (sortDir === "asc" ? "Ordenado crescente" : "Ordenado decrescente") : "Clique para ordenar"}
      onClick={() => onSort(k)}
    >
      {children}{active && <span className="fs-10" style={{ marginLeft: 2 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}
