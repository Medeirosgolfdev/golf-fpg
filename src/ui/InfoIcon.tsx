/**
 * InfoIcon — o «ⓘ» com explicação ao passar o rato (title), o mesmo em todo o
 * lado: KPIs, ficha do campo, campos da ficha só-cadastro. Antes havia 3 versões
 * (ⓘ redondo, ℹ solto, ⓘ esbatido).
 */
export default function InfoIcon({ title }: { title?: string }) {
  return <span className="info-icon" title={title} aria-label={title} role={title ? "img" : undefined}>ⓘ</span>;
}
