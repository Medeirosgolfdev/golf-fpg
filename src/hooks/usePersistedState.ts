/**
 * usePersistedState — `useState` com persistência em localStorage.
 *
 * Idêntico em assinatura ao `useState`, mas guarda o valor em `localStorage`
 * sob a chave fornecida. Reidrata na montagem do componente; valida o tipo
 * do que é lido (TS é só compile-time, runtime continua a precisar de fé —
 * passar `validate` se quiseres rejeitar valores corruptos).
 *
 * Uso:
 *   // Persistência simples
 *   const [filter, setFilter] = usePersistedState("comparar.filter", "all");
 *
 *   // Com validação (rejeita lixo no localStorage)
 *   const [tab, setTab] = usePersistedState<"campo" | "rivais">(
 *     "uskids.tab", "campo",
 *     v => v === "campo" || v === "rivais"
 *   );
 *
 *   // SSR-safe: lê só após mount (localStorage não existe no servidor)
 *
 * Notas:
 *   - JSON.stringify dos valores: funciona para primitivos, arrays, objects,
 *     mas não para funções, Map, Set, Date (pré-serializa estes manualmente).
 *   - Múltiplos componentes a usar a mesma chave NÃO sincronizam entre tabs.
 *     Para isso seria necessário escutar o evento `storage`. Não incluído por
 *     defeito porque a maioria dos casos não precisa.
 */
import { useEffect, useRef, useState } from "react";

type Updater<T> = T | ((prev: T) => T);

/** Chave usada no localStorage. Use prefixos por área (ex: "comparar.x") */
export type StorageKey = string;

export function usePersistedState<T>(
  key: StorageKey,
  defaultValue: T,
  validate?: (parsed: unknown) => boolean,
): [T, (v: Updater<T>) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const hydrated = useRef(false);

  // Hidratar uma vez na montagem (SSR-safe)
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return;
      const parsed = JSON.parse(raw);
      if (validate && !validate(parsed)) return;
      setValue(parsed as T);
    } catch {
      // localStorage inacessível ou JSON corrupto — ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escrever sempre que muda (após hidratar para não sobrescrever na 1ª render)
  useEffect(() => {
    if (!hydrated.current) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota cheia, modo privado, etc. — ignora
    }
  }, [key, value]);

  return [value, setValue];
}

/** Mesma API mas para Set<T> serializado como array. Útil para filtros multi-select. */
export function usePersistedSet<T extends string | number>(
  key: StorageKey,
  defaultValue: ReadonlySet<T> = new Set<T>(),
): [Set<T>, (v: Updater<Set<T>>) => void, (item: T) => void] {
  const [arr, setArr] = usePersistedState<T[]>(
    key,
    Array.from(defaultValue),
    v => Array.isArray(v),
  );
  const set = new Set(arr);
  const setSet = (v: Updater<Set<T>>) => {
    if (typeof v === "function") {
      setArr(prev => Array.from((v as (s: Set<T>) => Set<T>)(new Set(prev))));
    } else {
      setArr(Array.from(v));
    }
  };
  const toggle = (item: T) => {
    setArr(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  };
  return [set, setSet, toggle];
}

export default usePersistedState;
