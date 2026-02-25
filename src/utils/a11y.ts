/**
 * src/utils/a11y.ts
 *
 * Helpers de acessibilidade partilhados.
 */

import type React from "react";

/** Props a11y para elementos não-button clicáveis (role, tabIndex, onKeyDown) */
export function clickableA11y(handler: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    },
  };
}
