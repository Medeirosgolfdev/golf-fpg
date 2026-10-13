/**
 * Espaço na toolbar do CircuitShell para a página pôr os seus controlos —
 * uma só barra por página (Drive, FPG, Rankings), em vez de a barra da página
 * por cima da do shell com o título repetido (13/10/2026).
 *
 *   lead  — logo a seguir ao botão da lista (título da página, vistas, séries…)
 *   trail — depois do contador, à direita (links externos, data de actualização)
 *   below — 2.ª fila, só para subfiltros (regiões/escalões do Drive)
 *   hideTitle — esconde o título do shell (a página já pôs o seu no `lead`)
 */
import { createContext, type ReactNode } from "react";

export interface CircuitToolbarSlot {
  lead?: ReactNode;
  trail?: ReactNode;
  below?: ReactNode;
  hideTitle?: boolean;
}

export const CircuitToolbarSlotCtx = createContext<CircuitToolbarSlot>({});
