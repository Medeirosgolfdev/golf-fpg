/**
 * SexBadge.tsx
 *
 * Badge de sexo unificado — substitui todos os usos de ♀/♂ e jog-sex-inline espalhados.
 *
 * Dois tamanhos:
 *   size="sm"  (default) → círculo 16×16px com letra "M" ou "F"  — para tabelas/listas
 *   size="md"            → pill rectangular com label completo    — para perfil/detalhe
 *
 * Uso:
 *   <SexBadge sex="M" />
 *   <SexBadge sex="F" size="md" />
 *   <SexBadge sex="F" className="ml-4" />
 */

type Props = {
  sex: "M" | "F" | string | null | undefined;
  size?: "sm" | "md";
  className?: string;
};

export default function SexBadge({ sex, size = "sm", className = "" }: Props) {
  if (!sex || (sex !== "M" && sex !== "F")) return null;

  const colorCls = sex === "M" ? "sex-M" : "sex-F";
  const label    = size === "md"
    ? (sex === "M" ? "Masculino" : "Feminino")
    : sex;

  if (size === "md") {
    return (
      <span className={`sex-badge-pill ${colorCls}${className ? " " + className : ""}`}>
        {label}
      </span>
    );
  }

  return (
    <span className={`sex-badge ${colorCls}${className ? " " + className : ""}`}>
      {label}
    </span>
  );
}
