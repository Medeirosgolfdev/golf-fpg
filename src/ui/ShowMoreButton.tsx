/**
 * ShowMoreButton — «Mostrar mais (N restantes)» / «Recolher» no fim de uma lista
 * cortada. O mesmo botão em todas as páginas (.btn à largura da lista); antes
 * havia 4 aspectos à mão. Para listas paginadas usar o `Pager`.
 */
import type { ReactNode } from "react";

export default function ShowMoreButton({ onClick, children, title }: { onClick: () => void; children: ReactNode; title?: string }) {
  return <button type="button" className="btn btn-more" onClick={onClick} title={title}>{children}</button>;
}
