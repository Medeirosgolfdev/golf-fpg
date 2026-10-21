/**
 * lookups.ts — Lookups globais por licença (data de nascimento, HCP).
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { cachedFetchJson } from "../fetchCache";
import type { DobLookup, DobLookupFile, HcpLookup, HcpLookupFile } from "./types";


/* ⚠ Os lookups TÊM de ser esperados, não lidos do estado do React.
 *
 * O `rfegLoadDivisions` recebia-os por parâmetro, portanto ficava com o valor
 * que existisse no instante em que o CircuitShell o chama — e o shell CACHEIA o
 * que ele devolve. Numa ligação em que os JSON chegam depois desse instante, o
 * torneio ficava permanentemente sem licenças, clubes, HCP nem datas de
 * nascimento (Inscrições e Draw completamente a "–"), enquanto noutra máquina,
 * com os ficheiros já em cache, aparecia tudo. Estas funções devolvem a MESMA
 * promessa partilhada do `cachedFetchJson`, por isso não há download a mais. */
export function loadDobLookup(): Promise<DobLookup | undefined> {
  return cachedFetchJson<DobLookupFile>("/data/licencia-dob-lookup.json")
    .then((d) => d?.lookup).catch(() => undefined);
}
export function loadHcpLookup(): Promise<HcpLookup | undefined> {
  return cachedFetchJson<HcpLookupFile>("/data/licencia-hcp-lookup.json")
    .then((d) => d?.lookup).catch(() => undefined);
}
