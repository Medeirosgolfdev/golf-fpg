/**
 * src/ui/PlayerLink.tsx
 *
 * Nome de jogador clicável que navega para o perfil.
 * Extraído de TorneioPage — usado também por BJGTAnalysisPage.
 */

type Props = {
  fed: string | null;
  name: string;
  onSelect?: (fed: string) => void;
  className?: string;
};

export default function PlayerLink({ fed, name, onSelect, className = "tourn-pname" }: Props) {
  if (fed && onSelect) {
    return (
      <span
        className={`${className} tourn-pname-link`}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(fed)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(fed); } }}
      >
        {name}
      </span>
    );
  }
  return <span className={className}>{name}</span>;
}
