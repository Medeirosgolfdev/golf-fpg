/**
 * useCompareSelection — selecção de jogadores para comparação lado-a-lado.
 *
 * Partilhado pela FAMÍLIA de tabelas (.sc-lb): ScorecardLeaderboard,
 * MultiRoundLeaderboard (tabs Resumo do CircuitShell/TournamentDetail) e
 * callers da CrossSeasonTable. Cada tabela marca jogadores com uma checkbox na
 * coluna # e ganha a barra "⚖️ Comparar seleccionados (N)" que filtra a vista
 * aos escolhidos — para pôr 2-3 scorecards lado a lado num field de 140.
 *
 * Estado local à instância da tabela (cada ronda/tab compara a sua) — a
 * ordenação por colunas continua a aplicar-se por cima do filtro.
 */
import React, { useState } from "react";

export interface CompareSelection<K extends string | number> {
  /** Chaves seleccionadas. */
  selected: Set<K>;
  /** Filtro activo (toggle ligado E ≥1 seleccionado). */
  active: boolean;
  toggle: (key: K) => void;
  clear: () => void;
  /** Aplica o filtro (identidade quando inactivo). Chamar DEPOIS do sort. */
  filter: <T>(rows: T[], keyOf: (r: T) => K) => T[];
  /** Checkbox para a célula # de cada linha. */
  checkbox: (key: K) => React.ReactNode;
  /** Barra de controlo (null sem selecção) — renderizar acima da tabela. */
  bar: React.ReactNode;
}

export function useCompareSelection<K extends string | number>(): CompareSelection<K> {
  const [selected, setSelected] = useState<Set<K>>(new Set());
  const [compareOn, setCompareOn] = useState(false);

  const toggle = (key: K) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    if (next.size === 0) setCompareOn(false);
    return next;
  });
  const clear = () => { setSelected(new Set()); setCompareOn(false); };
  const active = compareOn && selected.size > 0;

  const filter = <T,>(rows: T[], keyOf: (r: T) => K): T[] =>
    active ? rows.filter(r => selected.has(keyOf(r))) : rows;

  const checkbox = (key: K): React.ReactNode => (
    <input
      type="checkbox"
      checked={selected.has(key)}
      onChange={() => toggle(key)}
      // Linhas clicáveis (ex: TournamentGrid abre a ficha do jogador) — marcar
      // a checkbox não pode disparar o click da linha.
      onClick={(e) => e.stopPropagation()}
      title="Seleccionar para comparar"
      style={{ marginRight: 6, verticalAlign: "middle", cursor: "pointer" }}
    />
  );

  const bar: React.ReactNode = selected.size > 0 ? (
    <div className="lb-info-line" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span
        className={"tab-under" + (compareOn ? " active" : "")}
        onClick={() => setCompareOn(v => !v)}
        style={{ cursor: "pointer", fontWeight: 700 }}
        title="Mostrar só os jogadores seleccionados (lado a lado)"
      >
        ⚖️ Comparar seleccionados ({selected.size})
      </span>
      <span onClick={clear} className="muted" style={{ cursor: "pointer" }} title="Limpar selecção">
        ✕ limpar
      </span>
      {!compareOn && (
        <span className="muted fs-10">marca ☑ nas linhas e activa para ver só esses</span>
      )}
    </div>
  ) : null;

  return { selected, active, toggle, clear, filter, checkbox, bar };
}
