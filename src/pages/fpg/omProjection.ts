/**
 * src/pages/fpg/omProjection.ts
 *
 * Contas do que ainda falta na Ordem de Mérito júnior do CGSS: quantos pontos
 * há por distribuir nas provas que faltam e até onde cada jogador pode chegar.
 *
 * Só aritmética sobre o regulamento — nada de adivinhar quem joga o quê. O que
 * não se sabe fica de fora e a UI di-lo.
 */

export type OmLevel = "A" | "B" | "C";

/** Pontos do 1.º lugar de cada nível (o topo da escada). */
export type TopByLevel = Partial<Record<OmLevel, number>>;

export interface PontosEmJogo {
  /** Pontos que o vencedor levaria se ganhasse TODAS as provas que faltam. */
  total: number;
  /** Detalhe por nível: quantas provas faltam e quanto paga cada uma ao 1.º. */
  porNivel: { level: OmLevel; provas: number; porProva: number; soma: number }[];
}

/** Soma dos 1.ºs lugares das provas que faltam. */
export function pontosEmJogo(missing: { level: OmLevel }[], topo: TopByLevel): PontosEmJogo {
  const porNivel: PontosEmJogo["porNivel"] = [];
  for (const lv of ["A", "B", "C"] as OmLevel[]) {
    const provas = missing.filter((m) => m.level === lv).length;
    const porProva = topo[lv];
    if (!provas || porProva == null) continue;
    porNivel.push({ level: lv, provas, porProva, soma: provas * porProva });
  }
  return { total: porNivel.reduce((s, x) => s + x.soma, 0), porNivel };
}

export interface JogadorOm {
  fed: string;
  name: string;
  total: number;
  played: number;
  canWin: boolean;
  /** Pontuações de cada prova que já jogou (para simular o desconto). */
  pontuacoes: number[];
}

export interface Projeccao {
  fed: string;
  name: string;
  total: number;
  /** Total se ganhasse todas as provas que faltam. */
  maximo: number;
  /** Pontos que lhe faltam para passar o líder de HOJE (0 = já é líder). */
  paraOLider: number;
  /** Quantas das provas que faltam teria de GANHAR para passar o líder de hoje
   *  (contando as mais valiosas primeiro). null = nem ganhando todas chega. */
  vitoriasNecessarias: number | null;
  /** Ainda chega ao 1.º lugar de hoje? */
  aindaChega: boolean;
  /**
   * Total no fecho da época, com a regra 7.1 (as 3 piores pontuações caem).
   * ⚠ Com poucas provas jogadas isto é brutal — quem só tem 4 provas fica com
   * a melhor. É a regra tal como está escrita; a UI avisa.
   */
  comDesconto: number;
}

/**
 * Projecção de cada jogador: até onde pode chegar e o que lhe falta.
 * `valores` = pontos do 1.º lugar de cada prova que falta, do maior para o
 * menor (ex.: [25, 25, 25, 20, 15, 15, 15, 15]).
 */
export function projectar(jogadores: JogadorOm[], valores: number[]): Projeccao[] {
  const ordenados = [...valores].sort((a, b) => b - a);
  const emJogo = ordenados.reduce((s, v) => s + v, 0);
  const lider = jogadores.filter((j) => j.canWin).reduce((m, j) => Math.max(m, j.total), 0);

  return jogadores.map((j) => {
    const falta = Math.max(0, lider - j.total + (j.total >= lider ? 0 : 1));
    // Quantas vitórias (das mais valiosas às menos) até cobrir a diferença.
    let acc = 0, n: number | null = null;
    for (let i = 0; i < ordenados.length; i++) {
      acc += ordenados[i];
      if (acc >= falta) { n = i + 1; break; }
    }
    const scores = [...j.pontuacoes].sort((a, b) => a - b);
    return {
      fed: j.fed,
      name: j.name,
      total: j.total,
      maximo: j.total + emJogo,
      paraOLider: falta,
      vitoriasNecessarias: falta === 0 ? 0 : n,
      aindaChega: falta === 0 || j.total + emJogo > lider,
      comDesconto: scores.slice(3).reduce((s, v) => s + v, 0),
    };
  });
}
