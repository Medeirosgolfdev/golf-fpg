/**
 * LinksBar.tsx — Barra de links externos agrupados por escalão (Draw/Classificação)
 * Extraída de FPGPage.tsx
 */
import React from "react";
import ExtLink from "./ExternalLink";

/** `cls`: a cor do grupo (.lk-wagr · .lk-sub16 · .lk-sub14 · .lk-sub12 no App.css). */
type LinkGroup = { label: string; cls: string; items: { name: string; url: string }[] };

function buildLinkGroups(links: Record<string, string>, escalao?: string | null): LinkGroup[] {
  const LABELS: Record<string, string> = {
    draw_wagr_r1: "Draw R1", draw_wagr_r2: "Draw R2", draw_wagr_r3: "Draw R3",
    results_wagr: "Classificação",
    draw_sub16_r1: "Draw R1", draw_sub16_r2: "Draw R2", draw_sub16: "Draw R1", results_sub16: "Classificação",
    draw_sub14: "Draw R1", draw_sub14_r2: "Draw R2", results_sub14: "Classificação",
    draw_sub12: "Draw R1", draw_sub12_r2: "Draw R2", results_sub12: "Classificação",
  };
  const GROUP_ORDER = ["wagr", "sub16", "sub14", "sub12"];
  const grouped: Record<string, { name: string; url: string }[]> = {};

  for (const [key, url] of Object.entries(links)) {
    const grp = GROUP_ORDER.find(g => key.includes(g)) || "outro";
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push({ name: LABELS[key] || key, url });
  }

  const GROUPLABELS: Record<string, string> = {
    wagr: "Tour / WAGR", sub16: "Sub 16", sub14: "Sub 14", sub12: "Sub 12", outro: "Outros"
  };

  // If escalao specified, only show relevant group + maybe wagr
  const esc = escalao?.toLowerCase().replace(/\s/g, "");
  const filteredOrder = esc
    ? GROUP_ORDER.filter(g => g === "wagr" || esc.includes(g))
    : GROUP_ORDER;

  return filteredOrder
    .filter(g => grouped[g]?.length)
    .map(g => ({
      label: GROUPLABELS[g] || g,
      cls: "lk-" + g,
      items: grouped[g],
    }));
}

export function LinksBar({ links, escalao }: { links?: Record<string, string>; escalao?: string | null }) {
  if (!links || Object.keys(links).length === 0) return null;
  const groups = buildLinkGroups(links, escalao);
  if (!groups.length) return null;
  return (
    <div className="flex-wrap mt-8 u-d-flex u-gap-6px u-ai-center">
      {groups.map((g, gi) => (
        <React.Fragment key={g.label}>
          {gi > 0 && <span className="fs-12 u-c-border">·</span>}
          <span className="label-caps c-muted u-mr-2px">{g.label}</span>
          {g.items.map(item => (
            <ExtLink key={item.name} href={item.url}
              className={"tourn-ext-link " + g.cls}>
              {item.name} ↗
            </ExtLink>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
