/**
 * FichaLink — o nome de um jogador que abre a sua ficha NA MESMA janela:
 * federado da FPG → `/jogadores/{fed}`; qualquer outro (USKids, fontes de fora,
 * licenças estrangeiras) → a ficha do Kids 2, procurada pelo nome (`kidsUrl`).
 *
 * É a regra única para «de que ficha é este nome» (11/11/2026 — a /draws tinha
 * dois componentes locais a fazer o mesmo). Para abrir a ficha FPG numa janela
 * nova há o `PlayerLink`; para a seta ↗ ao lado de um nome, o `KidsLink`.
 */
import { Link } from "react-router-dom";
import { isFedFpg } from "../utils/playerKey";
import { kidsUrl } from "./KidsLink";

export default function FichaLink({ nome, fed, className = "tourn-pname-link" }: {
  nome: string;
  fed?: string | number | null;
  className?: string;
}) {
  const f = fed == null ? null : String(fed);
  const to = isFedFpg(f) ? `/jogadores/${f}` : kidsUrl({ name: nome });
  return <Link to={to} className={className}>{nome}</Link>;
}
