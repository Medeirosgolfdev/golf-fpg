/* ─── Tee Colors ─── */

export function normKey(s: unknown): string {
  return String(s ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, "");
}

const COLORS: Record<string, string> = {
  pretas: "#111111", preto: "#111111", black: "#111111",
  brancas: "#e8e8e8", branco: "#e8e8e8", white: "#e8e8e8",
  amarelas: "#ffd000", amarelo: "#ffd000", yellow: "#ffd000",
  douradas: "#daa520", dourado: "#daa520", gold: "#daa520",
  vermelhas: "#e74c3c", vermelho: "#e74c3c", red: "#e74c3c",
  azuis: "#1e88e5", azul: "#1e88e5", blue: "#1e88e5",
  verdes: "#2e7d32", verde: "#2e7d32", green: "#2e7d32",
  roxas: "#7b1fa2", roxo: "#7b1fa2", purple: "#7b1fa2",
  laranjas: "#f57c00", laranja: "#f57c00", orange: "#f57c00",
  castanhas: "#6d4c41", castanho: "#6d4c41", brown: "#6d4c41",
  prateadas: "#9e9e9e", prateado: "#9e9e9e", silver: "#9e9e9e",
  cinzentas: "#9e9e9e", cinzento: "#9e9e9e", grey: "#9e9e9e",
};

const SUBSTRINGS: [string, string][] = [
  ["amarel", "#ffd000"],
  ["vermelh", "#e74c3c"], ["encarn", "#e74c3c"],
  ["azul", "#1e88e5"],
  ["verde", "#2e7d32"],
  ["rox", "#7b1fa2"],
  ["laranj", "#f57c00"],
  ["branc", "#e8e8e8"],
  ["pret", "#111111"],
  ["castanh", "#6d4c41"],
  ["doura", "#daa520"],
];

/** Resolve cor hex de um tee. Usa scorecardMeta.teeColor se disponível, senão heurísticas por nome. */
export function getTeeHex(teeName: string, scorecardColor?: string | null): string {
  // 1) Cor vinda do scorecard (DataGolf)
  if (scorecardColor && /^#?[0-9a-f]{6}$/i.test(scorecardColor.trim())) {
    const h = scorecardColor.trim();
    return h.startsWith("#") ? h : `#${h}`;
  }

  const k = normKey(teeName);

  // 2) Match exato
  if (COLORS[k]) return COLORS[k];

  // 3) Substrings
  for (const [sub, hex] of SUBSTRINGS) {
    if (k.includes(sub)) return hex;
  }

  return "#9CA3AF"; // cinzento neutro
}

/** Luminância → texto escuro ou claro sobre a cor */
export function textOnColor(hex: string): "#111" | "#fff" {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#111" : "#fff";
}
