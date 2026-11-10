/**
 * src/data/rfeg/inscritos.ts — a lista de inscritos das fontes que só publicam
 * ADMITIDOS (NextCaddy, golfdirecto/Catalunha): reservas, bajas, convidados e
 * afins ficam vazios. Um só sítio (10/11/2026 — estava montada à mão nos dois
 * conversores, `rfeg/adapters.ts` e `fcgAdapter.ts`).
 */
export function soAdmitidos<T>(admitidos: T[]) {
  return {
    admitidos,
    reservas: [] as T[],
    bajas: [] as T[],
    invitados: [] as T[],
    noAdmitidos: [] as T[],
    provisional: [] as T[],
    counts: { admitidos: admitidos.length, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 },
  };
}
