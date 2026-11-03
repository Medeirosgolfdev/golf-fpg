/**
 * CloseButton — o «✕» que fecha um painel, cartão ou janela, o mesmo em todas as
 * páginas (redondo, sem contorno, cinzento). Sobre um cabeçalho de cor (popups do
 * Calendário) usa-se `onColor`: o ✕ assenta na cor (`"light"` = cabeçalho claro,
 * com a cor do texto em `color`, que vem do evento).
 */
import { Tint } from "./DataStyle";

interface CloseButtonProps {
  onClick: () => void;
  title?: string;
  /** Posição/encaixe (ex.: `drive-player-close`, canto do cartão). */
  className?: string;
  /** ✕ sobre um cabeçalho de cor (`true` = escuro, `"light"` = claro). */
  onColor?: boolean | "light";
  /** Cor do ✕ num cabeçalho claro — vem dos dados (cor do evento). */
  color?: string;
}

export default function CloseButton({ onClick, title = "Fechar", className, onColor, color }: CloseButtonProps) {
  const base = onColor ? "btn-round btn-round-close" + (onColor === "light" ? " on-light" : "") : "btn-round btn-round-sm btn-close";
  return (
    <Tint as="button" type="button" fg={color} className={base + (className ? " " + className : "")}
      onClick={onClick} title={title} aria-label="Fechar">
      ✕
    </Tint>
  );
}
