/**
 * SexSelect — o selector de sexo, o mesmo em todas as páginas: «Ambos os sexos»
 * · Masculino · Feminino. Antes havia 9 cópias com 6 rótulos para «todos»
 * («Sexo», «Todos», «Sexo (todos)», «Todos os sexos», «M+F», «Ambos os sexos»).
 *
 * `allValue` é o valor que cada página usa para «todos» ("ALL", "all", "");
 * sem ele não há essa opção (escolha obrigatória entre M e F).
 */
import Select, { type SelectVariant } from "./Select";

interface SexSelectProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  allValue?: V;
  /** Aspecto da caixa (ui/Select): "select" por defeito; dentro de um FilterField, "filter". */
  variant?: SelectVariant;
}

export default function SexSelect<V extends string>({ value, onChange, allValue, variant }: SexSelectProps<V>) {
  return (
    <Select variant={variant} value={value} onChange={v => onChange(v as V)} aria-label="Sexo">
      {allValue !== undefined && <option value={allValue}>Ambos os sexos</option>}
      <option value="M">Masculino</option>
      <option value="F">Feminino</option>
    </Select>
  );
}
