/**
 * SexSelect — o selector de sexo, o mesmo em todas as páginas: «Ambos os sexos»
 * · Masculino · Feminino. Antes havia 9 cópias com 6 rótulos para «todos»
 * («Sexo», «Todos», «Sexo (todos)», «Todos os sexos», «M+F», «Ambos os sexos»).
 *
 * `allValue` é o valor que cada página usa para «todos» ("ALL", "all", "");
 * sem ele não há essa opção (escolha obrigatória entre M e F).
 */
interface SexSelectProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  allValue?: V;
  /** Classe do <select> (default `select`; dentro de um FilterField, `filter-input`). */
  className?: string;
}

export default function SexSelect<V extends string>({ value, onChange, allValue, className = "select" }: SexSelectProps<V>) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as V)} aria-label="Sexo">
      {allValue !== undefined && <option value={allValue}>Ambos os sexos</option>}
      <option value="M">Masculino</option>
      <option value="F">Feminino</option>
    </select>
  );
}
