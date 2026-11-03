/**
 * TrendArrow — a seta da tendência de um jogador (▲▲ ▲ ● ▼ ▼▼), a mesma em todas
 * as tabelas (03/11/2026: a tabela dos rivais e a tabela global tinham cada uma
 * a sua, com a cor em `style`). As cores vêm das classes `.trend-*` (App.css).
 * Sem tendência → MUTED.
 */
import { MUTED } from "./tableCells";

export type Trend = "up2" | "up" | "stable" | "down" | "down2";

const ICON: Record<Trend, string> = { up2: "▲▲", up: "▲", stable: "●", down: "▼", down2: "▼▼" };
const TITLE: Record<Trend, string> = {
  up2: "A subir bastante", up: "A subir", stable: "Estável", down: "A descer", down2: "A descer bastante",
};

export default function TrendArrow({ tr }: { tr: string | null | undefined }) {
  if (!tr || !(tr in ICON)) return MUTED;
  const t = tr as Trend;
  return <span className={`trend trend-${t}`} title={TITLE[t]}>{ICON[t]}</span>;
}
