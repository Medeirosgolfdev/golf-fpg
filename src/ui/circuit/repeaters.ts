/**
 * src/ui/circuit/repeaters.ts
 *
 * «Quem repete» genérico (13/10/2026): dos jogadores do field de HOJE (resultados,
 * inscritos ou draw da divisão aberta), quem já jogou edições anteriores da mesma
 * prova e onde ficou em cada uma. Cálculo puro — a tabela é o
 * `PastEditionsRepeatersTable`. A FPG tem a sua versão própria, com HCP, forma
 * WHS e previsão (`pages/fpg/PastEditionsRepeaters.tsx`); aqui só se usa o que
 * todas as fontes têm: posição, total e ±par de cada edição.
 */
import { vetKey } from "../../utils/normName";
import { isManuelByName } from "../../constants/manuel";
import type { PastEdition } from "./PastEditionsTable";

export interface FieldPlayer { name: string; club?: string | null }

export interface RepeaterCell {
  pos: number | null;
  total: number | null;
  toPar: number | null;
  /** Fez todas as voltas da edição (senão o lugar é de quem não acabou). */
  complete: boolean;
}

export interface RepeaterRow {
  key: string;
  name: string;
  club: string | null;
  isManuel: boolean;
  /** Resultado por edição (id da edição → célula). */
  byEd: Record<string, RepeaterCell>;
  /** Edições anteriores jogadas. */
  n: number;
  bestPos: number | null;
  /** Média do ±par nas edições completas. */
  avgToPar: number | null;
  /** Confrontos com o Manuel nas edições em que os dois acabaram: [Manuel à frente, atrás]. */
  vsManuel: [number, number] | null;
}

export interface RepeatersResult {
  rows: RepeaterRow[];
  /** Edições usadas (as anteriores — sem a de hoje), pela ordem recebida. */
  editions: PastEdition[];
  fieldSize: number;
}

export function buildRepeaters(field: FieldPlayer[], editions: PastEdition[], currentId?: string | null): RepeatersResult {
  const prev = editions.filter((e) => e.id !== currentId);
  // Índice por edição: chave do nome → célula (vetKey tolera «Apelido, Nome»).
  const idx = prev.map((e) => {
    const maxFull = Math.max(0, ...e.players.map((p) => p.fullRounds));
    const m = new Map<string, RepeaterCell>();
    e.players.forEach((p, i) => {
      const k = vetKey(p.name);
      if (!k || m.has(k)) return;
      m.set(k, { pos: p.pos ?? i + 1, total: p.total, toPar: p.toPar, complete: p.fullRounds >= maxFull });
    });
    const manuel = e.players.find((p) => isManuelByName(p.name));
    return { e, m, manuelKey: manuel ? vetKey(manuel.name) : null };
  });

  const seen = new Set<string>();
  const rows: RepeaterRow[] = [];
  for (const fp of field) {
    const key = vetKey(fp.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const byEd: Record<string, RepeaterCell> = {};
    let ahead = 0, behind = 0;
    for (const { e, m, manuelKey } of idx) {
      const c = m.get(key);
      if (!c) continue;
      byEd[e.id] = c;
      const mc = manuelKey && manuelKey !== key ? m.get(manuelKey) : null;
      if (mc && mc.complete && c.complete && mc.pos != null && c.pos != null && mc.pos !== c.pos) {
        if (mc.pos < c.pos) ahead++; else behind++;
      }
    }
    const cells = Object.values(byEd);
    if (!cells.length) continue;
    const done = cells.filter((c) => c.complete);
    const pos = done.map((c) => c.pos).filter((v): v is number => v != null);
    const tp = done.map((c) => c.toPar).filter((v): v is number => v != null);
    const isManuel = isManuelByName(fp.name);
    rows.push({
      key, name: fp.name, club: fp.club ?? null, isManuel, byEd,
      n: cells.length,
      bestPos: pos.length ? Math.min(...pos) : null,
      avgToPar: tp.length ? Math.round((tp.reduce((s, v) => s + v, 0) / tp.length) * 10) / 10 : null,
      vsManuel: !isManuel && ahead + behind > 0 ? [ahead, behind] : null,
    });
  }
  rows.sort((a, b) => (b.n - a.n) || ((a.bestPos ?? 999) - (b.bestPos ?? 999)) || a.name.localeCompare(b.name));
  return { rows, editions: prev, fieldSize: seen.size };
}
