/** Tipos do `build-drive-admissions.js` para os testes do `src` (que o importam). */
export function buildDriveAdmissions<F extends { tournaments?: { ccode?: unknown; tcode?: unknown; name?: string | null }[] }>(file: F, keys: Set<string>): F;
export const DRIVE_RE: RegExp;
export const AQUA_RE: RegExp;
