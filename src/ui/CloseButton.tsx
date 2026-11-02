/**
 * CloseButton — o «✕» que fecha um painel, cartão ou janela, o mesmo em todas as
 * páginas (redondo, sem contorno, cinzento). Os popups com cabeçalho de cor do
 * Calendário usam `.btn-round-close` (o ✕ assenta na cor do evento).
 */
interface CloseButtonProps {
  onClick: () => void;
  title?: string;
  /** Posição/encaixe (ex.: `drive-player-close`, canto do cartão). */
  className?: string;
}

export default function CloseButton({ onClick, title = "Fechar", className }: CloseButtonProps) {
  return (
    <button type="button" className={"btn-round btn-round-sm btn-close" + (className ? " " + className : "")}
      onClick={onClick} title={title} aria-label="Fechar">
      ✕
    </button>
  );
}
