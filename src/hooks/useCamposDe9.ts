import { useEffect, useState } from "react";
import { loadMasterData } from "../data/loader";
import { camposDe9, type MasterCursos } from "../data/sserraLoops";

/** Nomes normalizados dos campos de 9 buracos (master-courses.json, o mesmo
 *  ficheiro da página /campos — um só fetch por sessão). Vazio até carregar. */
export function useCamposDe9(): Set<string> {
  const [s, setS] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let vivo = true;
    loadMasterData()
      .then(m => { if (vivo) setS(camposDe9(m as unknown as MasterCursos)); })
      .catch(() => { /* sem lista → só a regra estrita */ });
    return () => { vivo = false; };
  }, []);
  return s;
}
