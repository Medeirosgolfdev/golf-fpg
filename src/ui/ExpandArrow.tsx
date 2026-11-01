/** Seta de abrir/fechar (▸ fechado · ▾ aberto) — a mesma em todas as listas e
 *  secções que expandem. Herda a cor e o tamanho de quem a envolve. */
export default function ExpandArrow({ open }: { open: boolean }) {
  return <span className="expand-arrow" aria-hidden>{open ? "▾" : "▸"}</span>;
}
