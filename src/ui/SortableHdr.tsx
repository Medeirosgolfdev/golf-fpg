import React from "react";

interface SortableHdrProps {
  k: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export default function SortableHdr({
  k, sortKey, sortDir, onSort, children, className, style, title,
}: SortableHdrProps) {
  const active = sortKey === k;
  const defaultTitle = active ? (sortDir === "asc" ? "Ordenado crescente" : "Ordenado decrescente") : "Clique para ordenar";
  return (
    <th
      className={"lb-sortable " + (className || "")}
      style={{ ...style, color: active ? "var(--accent)" : undefined, fontWeight: active ? 700 : undefined }}
      title={title ?? defaultTitle}
      onClick={() => onSort(k)}
    >
      {children}{active && <span className="fs-10" style={{ marginLeft: 2 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}
