/**
 * scripts/aggregator/util/id.js
 *
 * Geração de IDs estáveis para juniores e torneios.
 */

const crypto = require("crypto");
const { normName } = require("./names");

/**
 * juniorId — ID estável a partir de evidência forte.
 * Prioridade: USKids memberId > FPG fed > RFEG lic > FFG lic > nome+dob.
 *
 * O ID é prefixado pela fonte primária para legibilidade. Stable across runs.
 *
 * @param {{
 *   uskidsMemberId?: string,
 *   fpgFed?: string,
 *   rfegLic?: string,
 *   ffgolfLic?: string,
 *   canonicalName?: string,
 *   dob?: string
 * }} ev
 */
function juniorId(ev) {
  if (ev.uskidsMemberId) return `u${ev.uskidsMemberId}`;
  if (ev.fpgFed) return `f${ev.fpgFed}`;
  if (ev.rfegLic) return `r${ev.rfegLic}`;
  if (ev.ffgolfLic) return `g${ev.ffgolfLic}`;
  // Sem ID forte: hash determinístico de nome+dob.
  const seed = `${normName(ev.canonicalName || "")}|${ev.dob || ""}`;
  const h = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 10);
  return `x${h}`;
}

/**
 * tournamentId — ID estável de torneio: "sourceId-sourceKey".
 */
function tournamentId(sourceId, sourceKey) {
  return `${sourceId}-${sourceKey}`;
}

/**
 * seriesId — slug a partir de label.
 */
function seriesId(label) {
  return String(label || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = { juniorId, tournamentId, seriesId };
