import React from "react";

interface SortableHdrProps<K extends string = string> {
  k: K;
  sortKey: K;
  sortDir: "asc" | "desc";
  onSort: (k: K) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const ARROW_UP = "▲";
const ARROW_DOWN = "▼";

export default function SortableHdr<K extends string = string>({
  k, sortKey, sortDir, onSort, children, className, style, title,
}: SortableHdrProps<K>) {
  const active = sortKey === k;
  const arrow = sortDir === "asc" ? ARROW_UP : ARROW_DOWN;
  const defaultTitle = active
    ? (sortDir === "asc" ? "Ordenado crescente" : "Ordenado decrescente")
    : "Clique para ordenar";
  return (
    <th
      className={"lb-sortable " + (className || "")}
      style={{ ...style, color: active ? "var(--accent)" : undefined, fontWeight: active ? 700 : undefined }}
      title={title ?? defaultTitle}
      onClick={() => onSort(k)}
    >
      {children}
      {active && <span className="fs-10" style={{ marginLeft: 2 }}>{arrow}</span>}
    </th>
  );
}
