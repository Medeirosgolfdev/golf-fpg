#!/usr/bin/env node
/**
 * scripts/find-junior-duplicates.js
 *
 * Detector de juniores DUPLICADOS no output canónico do agregador
 * (public/data/juniors.json). O identity-matcher é conservador de propósito
 * (não funde sem DOB/país compatível), por isso sobram duplicados típicos:
 *   • o mesmo miúdo federado em 2 países (país difere → matcher recusa)
 *   • nome abreviado em torneios internacionais ("J. Smith" vs "John Smith")
 *   • só 1 dos sobrenomes ("Tomás Silva" vs "Tomás Costa Silva")
 *   • nome invertido ("Ziyang Guo" vs "Guo Ziyang")
 *
 * Este script NÃO funde nada — gera candidatos ordenados por score, cada um
 * com um snippet `forceMerge` pronto a colar em juniors-overrides.json.
 * Falsos positivos confirmados vão para `notDuplicates` no mesmo ficheiro
 * (formato: { "sourceKeys": ["srcA:keyA", "srcB:keyB"], "reason": "..." })
 * e deixam de ser sugeridos.
 *
 * Evidência NEGATIVA usada para descartar pares:
 *   • sexo diferente, DOB exacta diferente
 *   • jogaram no MESMO flight do mesmo torneio (estavam lado a lado na
 *     leaderboard → são duas pessoas)
 *
 * Verificações de segurança adicionais (2026-07-08):
 *   • ESCALÃO/IDADE: dos flights jogados (ageMax + ano do torneio) infere-se o
 *     ano de nascimento MÍNIMO possível de cada junior — jogar "para cima"
 *     (sub-12 nos sub-14) é permitido, para baixo não. Par onde a DOB de um
 *     lado é impossível face aos escalões do outro → descartado.
 *   • AMBIGUIDADE: se um junior aparece em vários pares candidatos (ex: "Pablo
 *     Garcia" bate com 3 nomes completos diferentes), TODOS os seus pares são
 *     marcados ambíguos e excluídos do auto-merge.
 *   • SUFIXO RFEG: mudar de clube muda o prefixo da licença mas os últimos 6
 *     dígitos mantêm-se (ex: LV60968059 ↔ LV70968059) — sufixo igual é PROVA
 *     de identidade (+30, gera preferStrongKey automático no snippet).
 *   • NOME RARO (2026-07-08): nome exacto/invertido cujo multiset de tokens só
 *     existe nestas 2 entidades em TODO o corpus E com pelo menos um token
 *     raro (≤3 juniores, ex: "Bernardini") → +15, anula a penalização de
 *     países diferentes (miúdos com pais de 2 nacionalidades escolhem a
 *     bandeira consoante o torneio — caso Victor Bernardini FR↔BE) e é
 *     elegível para auto-merge mesmo sem DOB.
 *
 * Auto-merge (--apply): candidatos com CERTEZA (nome exacto/invertido/contido
 * + mesma DOB, ou sufixo RFEG igual, ou nome raro único no corpus) ou com
 * corroboração (mesmo clube/país, score ≥ --merge-min) e SEM ambiguidade/flags
 * são acrescentados ao forceMerge do juniors-overrides.json (marcados
 * "auto": true).
 *
 * CLI:
 *   node scripts/find-junior-duplicates.js                # relatório completo
 *   node scripts/find-junior-duplicates.js --min-score 65 # só média/alta
 *   node scripts/find-junior-duplicates.js --top 100      # limitar output
 *   node scripts/find-junior-duplicates.js --player medeiros  # filtrar por nome
 *   node scripts/find-junior-duplicates.js --include-coplay   # não descartar co-jogadores
 *   node scripts/find-junior-duplicates.js --apply         # aplicar merges seguros ao overrides
 *   node scripts/find-junior-duplicates.js --merge-min 60  # subir a fasquia do auto-merge
 *
 * Outputs: reports/duplicate-candidates.json + reports/duplicate-candidates.html
 *
 * Workflow:
 *   1. node scripts/aggregator/index.js        (rebuild canónico)
 *   2. node scripts/find-junior-duplicates.js  (gera candidatos)
 *   3. abrir reports/duplicate-candidates.html, rever um a um
 *   4. colar os confirmados em forceMerge / os falsos em notDuplicates
 *      (public/data/juniors-overrides.json)
 *   5. voltar ao passo 1 — os resolvidos desaparecem da lista
 */

const fs = require("fs");
const path = require("path");
const { DATA, REPO_ROOT, readJsonSafe } = require("./aggregator/util/io");
const { normName } = require("./aggregator/util/names");

// Partículas de nome que não servem de chave de bloco (demasiado comuns)
const PARTICLES = new Set([
  "de", "da", "do", "dos", "das", "e",
  "van", "von", "der", "den", "del", "della", "di", "du", "des",
  "la", "le", "el", "al", "bin", "ibn", "st",
]);

const STRONG_SOURCE_IDS = ["uskids", "fpg", "rfeg", "ffgolf"];

// ────────────────────────────────────────────────────────────────────────
// Relações de nome — devolve { rel, pts } ou null
// ────────────────────────────────────────────────────────────────────────
function nameRelation(normA, normB) {
  if (!normA || !normB) return null;
  if (normA === normB) return { rel: "nome exacto", pts: 55 };

  const ta = normA.split(" ");
  const tb = normB.split(" ");
  if (ta.length < 2 || tb.length < 2) return null;

  // Invertido: mesmo multiset de tokens por outra ordem ("guo ziyang" ↔ "ziyang guo")
  const sa = [...ta].sort().join(" ");
  const sb = [...tb].sort().join(" ");
  if (sa === sb) return { rel: "nome invertido", pts: 50 };

  const setA = new Set(ta);
  const setB = new Set(tb);
  const firstA = ta[0], firstB = tb[0];
  const lastA = ta[ta.length - 1], lastB = tb[tb.length - 1];

  const firstEqual = firstA === firstB;
  const firstInitial =
    (firstA.length === 1 && firstA === firstB[0]) ||
    (firstB.length === 1 && firstB === firstA[0]);
  const firstPrefix =
    !firstEqual && !firstInitial &&
    ((firstA.length >= 3 && firstB.startsWith(firstA)) ||
     (firstB.length >= 3 && firstA.startsWith(firstB)));

  // Subset: todos os tokens de um estão no outro ("manuel medeiros" ⊂
  // "manuel goulartt medeiros"). Exigir primeiro nome compatível.
  const isSubset = ta.every((t) => setB.has(t)) || tb.every((t) => setA.has(t));
  if (isSubset && (firstEqual || firstInitial)) {
    return { rel: "nome contido no outro", pts: firstEqual ? 45 : 40 };
  }

  // Sobrenomes partilhados (tokens não-primeiro, não-partícula, ≥3 chars)
  const surnamesA = ta.slice(1).filter((t) => t.length >= 3 && !PARTICLES.has(t));
  const surnamesB = tb.slice(1).filter((t) => t.length >= 3 && !PARTICLES.has(t));
  const sharedSurname = surnamesA.some((t) => surnamesB.includes(t));
  const lastEqual = lastA === lastB;

  if (firstEqual && lastEqual) return { rel: "primeiro+último nome", pts: 40 };
  if (firstInitial && lastEqual) return { rel: "inicial + último nome", pts: 38 };
  if (firstPrefix && lastEqual) return { rel: "primeiro abreviado + último nome", pts: 32 };
  if (firstEqual && sharedSurname) return { rel: "primeiro nome + sobrenome parcial", pts: 30 };
  if (firstInitial && sharedSurname) return { rel: "inicial + sobrenome parcial", pts: 26 };

  return null;
}

/** Chave de multiset de tokens de um nome normalizado ("guo ziyang" = "ziyang guo") */
function sortedNameKey(norm) {
  return norm.split(" ").sort().join(" ");
}

/** Melhor relação entre todas as variantes de nome (canónico + aliases) */
function bestNameRelation(variantsA, variantsB) {
  let best = null;
  for (const a of variantsA) {
    for (const b of variantsB) {
      const r = nameRelation(a, b);
      if (r && (!best || r.pts > best.pts)) best = r;
    }
  }
  return best;
}

function normClub(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ────────────────────────────────────────────────────────────────────────
// Chaves de fonte de um junior
// ────────────────────────────────────────────────────────────────────────
/** Todas as chaves sourceId:sourceKey (da evidência do matcher, sem dob:) */
function evidenceKeys(j) {
  return (j._match?.evidence || []).filter((e) => !e.startsWith("dob:"));
}

/** Chave representativa para o snippet forceMerge — preferir fontes fortes */
function representativeKey(j) {
  const s = j.sources || {};
  if (s.uskids?.memberId) return `uskids:${s.uskids.memberId}`;
  if (s.fpg?.fed) return `fpg:${s.fpg.fed}`;
  if (s.rfeg?.lic) return `rfeg:${s.rfeg.lic}`;
  if (s.ffgolf?.lic) return `ffgolf:${s.ffgolf.lic}`;
  const ev = evidenceKeys(j);
  return ev[0] || null;
}

/** Fontes fortes presentes: Map<sourceId, key> */
function strongKeys(j) {
  const s = j.sources || {};
  const out = new Map();
  if (s.uskids?.memberId) out.set("uskids", String(s.uskids.memberId));
  if (s.fpg?.fed) out.set("fpg", String(s.fpg.fed));
  if (s.rfeg?.lic) out.set("rfeg", String(s.rfeg.lic));
  if (s.ffgolf?.lic) out.set("ffgolf", String(s.ffgolf.lic));
  return out;
}

/**
 * Sufixo pessoal de uma licença RFEG — mudar de clube muda o prefixo mas os
 * ÚLTIMOS 6 dígitos mantêm-se (LV60968059 ↔ LV70968059, AM84955303 ↔
 * AM11955303). Sufixo igual = mesmo jogador.
 */
function licSuffix(lic) {
  if (!lic) return null;
  const clean = String(lic).replace(/[^a-z0-9]/gi, "");
  if (clean.length < 8) return null;
  return clean.slice(-6).toUpperCase();
}

/** Todas as licenças RFEG conhecidas de um junior (actual + históricas + evidência) */
function rfegLicsOf(j) {
  const out = new Set();
  const r = j.sources?.rfeg;
  if (r?.lic) out.add(String(r.lic));
  for (const h of r?.historicalLicenses || []) {
    const lic = typeof h === "string" ? h : h?.lic;
    if (lic) out.add(String(lic));
  }
  for (const e of j._match?.evidence || []) {
    if (e.startsWith("rfeg:")) out.add(e.slice(5));
  }
  return [...out];
}

/** true se A e B têm licenças RFEG com o mesmo sufixo pessoal (6 dígitos) */
function rfegSuffixMatch(licsA, licsB) {
  if (!licsA?.length || !licsB?.length) return false;
  const sa = new Set(licsA.map(licSuffix).filter(Boolean));
  if (!sa.size) return false;
  for (const l of licsB) {
    const s = licSuffix(l);
    if (s && sa.has(s)) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────
// Avaliação de um par — devolve candidato ou null
// ────────────────────────────────────────────────────────────────────────
function evaluatePair(A, B, ctx = {}) {
  // Sexo contraditório → pessoas diferentes
  if (A.sex && B.sex && A.sex !== B.sex) return null;
  // DOB exacta contraditória → pessoas diferentes
  if (A.dob && B.dob && A.dob !== B.dob) return null;

  // Verificação de escalão/idade: dos flights jogados infere-se o ano de
  // nascimento MÍNIMO possível (ageMax do escalão + ano do torneio; jogar
  // para cima é permitido, para baixo não). DOB de um lado impossível face
  // aos escalões do outro → pessoas diferentes.
  const yA = A.dob ? Number(A.dob.slice(0, 4)) : null;
  const yB = B.dob ? Number(B.dob.slice(0, 4)) : null;
  const bbA = ctx.birthBound?.get(A.id) || null;
  const bbB = ctx.birthBound?.get(B.id) || null;
  let ageChecked = false;
  if (yA && bbB) {
    if (yA < bbB.minBY) return null;
    ageChecked = true;
  }
  if (yB && bbA) {
    if (yB < bbA.minBY) return null;
    ageChecked = true;
  }

  const rel = bestNameRelation(A.nameVariants, B.nameVariants);
  if (!rel) return null;

  let score = rel.pts;
  const evidence = [rel.rel];
  const flags = [];

  // DOB exacta igual — evidência fortíssima
  const dobEqual = !!(A.dob && B.dob && A.dob === B.dob);
  if (dobEqual) {
    score += 35;
    evidence.push(`mesma DOB ${A.dob}`);
  }

  // Nome raro: relação exacta/invertida cujo multiset de tokens só existe
  // nestas 2 entidades em todo o corpus E com pelo menos um token raro
  // (≤3 juniores). Um "Victor Bernardini" único vale quase tanto como uma
  // DOB; um "João Silva" que por acaso só aparece 2× não (tokens comuns).
  let rareName = false;
  if ((rel.rel === "nome exacto" || rel.rel === "nome invertido") &&
      ctx.nameKeyCount && ctx.tokenCount) {
    const keysA = new Set(A.nameVariants.map(sortedNameKey));
    let shared = null;
    for (const v of B.nameVariants) {
      const k = sortedNameKey(v);
      if (keysA.has(k)) { shared = k; break; }
    }
    if (shared && ctx.nameKeyCount.get(shared) === 2) {
      const tokens = shared.split(" ").filter((t) => t.length >= 3 && !PARTICLES.has(t));
      if (tokens.length >= 2) {
        const rarest = Math.min(...tokens.map((t) => ctx.tokenCount.get(t) || 0));
        if (rarest <= 3) {
          rareName = true;
          score += 15;
          evidence.push(`nome raro — único no corpus (token mais raro em ${rarest} juniores)`);
        }
      }
    }
  }

  // País — com DOB igual ou nome raro, país diferente deixa de penalizar (é o
  // caso multi-país que procuramos: mesmo miúdo federado em 2 federações, ou
  // com pais de nacionalidades diferentes a escolher a bandeira por torneio)
  const cA = A.country || null, cB = B.country || null;
  const countryEqual = !!(cA && cB && cA === cB);
  if (countryEqual) { score += 10; evidence.push(`mesmo país ${cA}`); }
  else if (cA && cB && cA !== cB) {
    if (!dobEqual && !rareName) score -= 5;
    evidence.push(`países diferentes ${cA}≠${cB} (multi-país?)`);
  }

  // Clube
  const clubA = normClub(A.club), clubB = normClub(B.club);
  const clubEqual = !!(clubA && clubB && clubA.length >= 3 && clubA === clubB);
  if (clubEqual) {
    score += 12;
    evidence.push("mesmo clube");
  }

  // Conflito de chave forte na mesma fonte (ex: dois feds FPG) — o matcher
  // recusa por invariante; só é a mesma pessoa se houver contas duplicadas
  // (caso Manuel/Chepishev). Penalizar mas reportar.
  // EXCEPÇÃO RFEG: mudar de clube muda o prefixo da licença mas os últimos
  // 6 dígitos mantêm-se — sufixo igual é PROVA de identidade, não conflito.
  let rfegSuffix = false;
  for (const [src, keyA] of A.strong) {
    const keyB = B.strong.get(src);
    if (keyB != null && keyB !== keyA) {
      if (src === "rfeg" && rfegSuffixMatch(A.rfegLics, B.rfegLics)) {
        rfegSuffix = true;
        score += 30;
        evidence.push(`licenças RFEG com o mesmo sufixo (${keyA} ↔ ${keyB}) — mudança de clube`);
        continue;
      }
      score -= 25;
      flags.push(`⚠ ambos têm chave ${src} (${keyA} vs ${keyB}) — só fundir se forem contas duplicadas (usar preferStrongKey)`);
    }
  }
  if (ageChecked) evidence.push("idade/escalão compatível");

  // Co-ocorrência
  if (ctx.flightsByJunior) {
    const fa = ctx.flightsByJunior.get(A.id);
    const fb = ctx.flightsByJunior.get(B.id);
    if (fa && fb) {
      const [small, big] = fa.size <= fb.size ? [fa, fb] : [fb, fa];
      let sameFlight = false;
      let sameTournament = false;
      for (const k of small) {
        if (big.has(k)) { sameFlight = true; break; }
      }
      if (sameFlight && !ctx.includeCoplay) return null; // lado a lado na leaderboard
      if (sameFlight) flags.push("⚠ jogaram no MESMO flight — quase de certeza 2 pessoas");
      if (!sameFlight) {
        const ta = ctx.tournsByJunior.get(A.id);
        const tb = ctx.tournsByJunior.get(B.id);
        if (ta && tb) {
          const [s2, b2] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
          for (const k of s2) if (b2.has(k)) { sameTournament = true; break; }
        }
        if (sameTournament) {
          score -= 15;
          flags.push("⚠ jogaram no mesmo torneio (flights diferentes) — verificar se são irmãos/escalões");
        }
      }
    }
  }

  return {
    rel: rel.rel,
    relPts: rel.pts,
    score,
    evidence,
    flags,
    dobEqual,
    countryEqual,
    clubEqual,
    rfegSuffix,
    rareName,
  };
}

/**
 * Marca ambiguidade: se um junior aparece em vários pares candidatos (ex:
 * "Pablo Garcia" bate com 3 nomes completos), NENHUM desses pares pode ser
 * fundido automaticamente — decisão manual. Modifica candidates in-place.
 */
function markAmbiguous(candidates) {
  const count = new Map();
  for (const c of candidates) {
    count.set(c.A.id, (count.get(c.A.id) || 0) + 1);
    count.set(c.B.id, (count.get(c.B.id) || 0) + 1);
  }
  for (const c of candidates) {
    const nA = count.get(c.A.id), nB = count.get(c.B.id);
    if (nA > 1 || nB > 1) {
      c.ambiguous = true;
      const who = [];
      if (nA > 1) who.push(`${c.A.canonicalName} em ${nA} pares`);
      if (nB > 1) who.push(`${c.B.canonicalName} em ${nB} pares`);
      c.flags.push(`⚠ ambíguo — ${who.join("; ")} — rever manualmente`);
    }
  }
}

/**
 * Elegibilidade para merge AUTOMÁTICO (--apply). Regras:
 *   • nunca com flags de aviso (mesmo torneio, chaves fortes conflituantes)
 *   • relação de nome forte (exacto / invertido / contido, pts ≥ 45)
 *   • CERTEZA: mesma DOB ou sufixo RFEG igual → elegível SEMPRE, mesmo em
 *     pares ambíguos — um cluster de 3 licenças do mesmo miúdo (caso
 *     Graciliano) gera 2+ pares certos e o union-find do matcher funde tudo
 *     transitivamente; a ambiguidade só trava pares SEM prova
 *   • NOME RARO: nome exacto/invertido único no corpus com token raro →
 *     elegível sem DOB e mesmo com países diferentes (2 bandeiras), mas
 *     NUNCA em pares ambíguos (raridade não é prova absoluta como a DOB)
 *   • senão: sem ambiguidade + corroboração (clube/país) + score ≥ mergeMin
 */
function autoMergeEligible(c, mergeMin = 55) {
  const warnings = c.flags.filter((f) => !f.startsWith("⚠ ambíguo"));
  if (warnings.length > 0) return false;
  if (c.relPts < 45) return false;
  if (c.dobEqual || c.rfegSuffix) return true;
  if (c.ambiguous) return false;
  if (c.rareName) return true;
  if (c.score < mergeMin) return false;
  return c.clubEqual || c.countryEqual;
}

// ────────────────────────────────────────────────────────────────────────
// Supressão — pares já tratados em forceMerge / notDuplicates
// ────────────────────────────────────────────────────────────────────────
function buildSuppressionSets(overrides) {
  const sets = [];
  for (const rule of overrides?.forceMerge || []) {
    if (Array.isArray(rule.sourceKeys) && rule.sourceKeys.length >= 2) {
      sets.push(new Set(rule.sourceKeys));
    }
  }
  for (const rule of overrides?.notDuplicates || []) {
    const keys = Array.isArray(rule) ? rule : rule?.sourceKeys;
    if (Array.isArray(keys) && keys.length >= 2) sets.push(new Set(keys));
  }
  return sets;
}

function isSuppressed(keysA, keysB, suppressionSets) {
  for (const set of suppressionSets) {
    let hitA = false, hitB = false;
    for (const k of keysA) if (set.has(k)) { hitA = true; break; }
    if (!hitA) continue;
    for (const k of keysB) if (set.has(k)) { hitB = true; break; }
    if (hitB) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    minScore: 45, top: Infinity, player: null, includeCoplay: false, html: true,
    apply: false, mergeMin: 55,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-score") args.minScore = Number(argv[++i]);
    else if (a === "--top") args.top = Number(argv[++i]);
    else if (a === "--player") args.player = normName(argv[++i]);
    else if (a === "--include-coplay") args.includeCoplay = true;
    else if (a === "--no-html") args.html = false;
    else if (a === "--apply") args.apply = true;
    else if (a === "--merge-min") args.mergeMin = Number(argv[++i]);
  }
  return args;
}

function tierOf(score) {
  if (score >= 85) return "alta";
  if (score >= 65) return "média";
  return "baixa";
}

function loadTournamentIndex() {
  const manifest = readJsonSafe(DATA.outTournaments, null);
  if (!manifest) return null;
  let tournaments = [];
  if (manifest.sharded && Array.isArray(manifest.shards)) {
    const dir = path.dirname(DATA.outTournaments);
    for (const shard of manifest.shards) {
      const s = readJsonSafe(path.join(dir, shard), null);
      if (s?.tournaments) tournaments = tournaments.concat(s.tournaments);
    }
  } else if (Array.isArray(manifest.tournaments)) {
    tournaments = manifest.tournaments;
  }
  const flightsByJunior = new Map();
  const tournsByJunior = new Map();
  // birthBound: juniorId → { minBY, why } — ano de nascimento MÍNIMO possível,
  // inferido do escalão mais restritivo jogado (ageMax + ano do torneio, com
  // 1 ano de tolerância para convenções idade-no-evento vs idade-no-ano).
  const birthBound = new Map();
  for (const t of tournaments) {
    const year = Number(String(t.startDate || t.date || "").slice(0, 4)) || null;
    for (const f of t.flights || []) {
      const fk = `${t.id}|${f.flightKey}`;
      const bound = (year && typeof f.ageMax === "number" && f.ageMax >= 5 && f.ageMax <= 30)
        ? year - f.ageMax - 1
        : null;
      for (const r of f.results || []) {
        if (!r.juniorId) continue;
        let fset = flightsByJunior.get(r.juniorId);
        if (!fset) { fset = new Set(); flightsByJunior.set(r.juniorId, fset); }
        fset.add(fk);
        let tset = tournsByJunior.get(r.juniorId);
        if (!tset) { tset = new Set(); tournsByJunior.set(r.juniorId, tset); }
        tset.add(t.id);
        if (bound != null) {
          const cur = birthBound.get(r.juniorId);
          if (!cur || bound > cur.minBY) {
            birthBound.set(r.juniorId, { minBY: bound, why: `${f.label || "?"} ${year}` });
          }
        }
      }
    }
  }
  return { flightsByJunior, tournsByJunior, birthBound, tournamentsCount: tournaments.length };
}

function sourcesSummary(j) {
  const parts = [];
  const s = j.sources || {};
  if (s.uskids) parts.push(`uskids:${s.uskids.memberId}`);
  if (s.fpg) parts.push(`fpg:${s.fpg.fed}`);
  if (s.rfeg) parts.push(`rfeg:${s.rfeg.lic}`);
  if (s.ffgolf) parts.push(`ffgolf:${s.ffgolf.lic}`);
  for (const sec of s._secondary || []) parts.push(sec.sourceId);
  return parts.join(" · ");
}

function juniorView(j) {
  return {
    id: j.id,
    name: j.canonicalName,
    aliases: j.aliases || [],
    dob: j.dob || null,
    sex: j.sex || null,
    country: j.country || null,
    club: j.club || null,
    tournaments: (j.tournamentIds || []).length,
    sources: sourcesSummary(j),
    repKey: representativeKey(j),
  };
}

function main() {
  const args = parseArgs(process.argv);

  const juniorsFile = readJsonSafe(DATA.outJuniors, null);
  if (!juniorsFile?.juniors?.length) {
    console.error("✗ public/data/juniors.json não existe ou está vazio — correr primeiro scripts/aggregator/index.js");
    process.exit(1);
  }
  const juniors = juniorsFile.juniors;
  console.log(`· ${juniors.length} juniores em juniors.json`);

  const overrides = readJsonSafe(DATA.overrides, {});
  const suppressionSets = buildSuppressionSets(overrides);
  console.log(`· supressão: ${(overrides.forceMerge || []).length} forceMerge + ${(overrides.notDuplicates || []).length} notDuplicates`);

  console.log("· a carregar torneios (co-ocorrência)…");
  const tIndex = loadTournamentIndex();
  if (tIndex) console.log(`· ${tIndex.tournamentsCount} torneios indexados`);
  else console.log("· ⚠ juniors-tournaments.json em falta — sem filtro de co-ocorrência");

  // Preparar entidades — limpar parênteses antes do normName ("Raul Pazos
  // (jr)" → o sufixo jr só é removido pelo normName se não estiver entre
  // parênteses)
  const cleanVariant = (n) => normName(String(n || "").replace(/[()\[\]]/g, " "));
  const ents = juniors.map((j) => {
    const variants = new Set([j.canonicalName, ...(j.aliases || [])].map(cleanVariant).filter(Boolean));
    return {
      id: j.id,
      raw: j,
      nameVariants: [...variants],
      dob: j.dob || null,
      sex: j.sex || null,
      country: j.country || null,
      club: j.club || null,
      strong: strongKeys(j),
      rfegLics: rfegLicsOf(j),
      keys: evidenceKeys(j),
    };
  });

  // Blocking: por token de apelido (len≥3, não-partícula), por multiset
  // ordenado (nomes invertidos) e por DOB
  const blocks = new Map();
  const addToBlock = (key, ent) => {
    let arr = blocks.get(key);
    if (!arr) { arr = []; blocks.set(key, arr); }
    if (arr[arr.length - 1] !== ent) arr.push(ent);
  };
  for (const ent of ents) {
    for (const v of ent.nameVariants) {
      const tokens = v.split(" ");
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.length >= 3 && !PARTICLES.has(t)) addToBlock(`T:${t}`, ent);
      }
      if (tokens.length >= 2) addToBlock(`S:${[...tokens].sort().join(" ")}`, ent);
    }
    if (ent.dob) addToBlock(`D:${ent.dob}`, ent);
  }

  // Índice de raridade de nomes — nº de ENTIDADES distintas por multiset de
  // tokens (nome completo, ordem-agnóstico) e por token individual. Alimenta
  // o sinal "nome raro" do evaluatePair.
  const nameKeyCount = new Map();
  const tokenCount = new Map();
  for (const ent of ents) {
    const keys = new Set(ent.nameVariants.map(sortedNameKey));
    const tokens = new Set();
    for (const v of ent.nameVariants) {
      for (const t of v.split(" ")) {
        if (t.length >= 3 && !PARTICLES.has(t)) tokens.add(t);
      }
    }
    for (const k of keys) nameKeyCount.set(k, (nameKeyCount.get(k) || 0) + 1);
    for (const t of tokens) tokenCount.set(t, (tokenCount.get(t) || 0) + 1);
  }

  const ctx = {
    flightsByJunior: tIndex?.flightsByJunior,
    tournsByJunior: tIndex?.tournsByJunior,
    birthBound: tIndex?.birthBound,
    includeCoplay: args.includeCoplay,
    nameKeyCount,
    tokenCount,
  };

  const seen = new Set();
  const candidates = [];
  let pairsEvaluated = 0;
  for (const [, arr] of blocks) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const A = arr[i], B = arr[j];
        const pairKey = A.id < B.id ? `${A.id}|${B.id}` : `${B.id}|${A.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        pairsEvaluated++;
        const res = evaluatePair(A, B, ctx);
        if (!res || res.score < args.minScore) continue;
        if (isSuppressed(A.keys, B.keys, suppressionSets)) continue;
        if (args.player) {
          const hit = [...A.nameVariants, ...B.nameVariants].some((n) => n.includes(args.player));
          if (!hit) continue;
        }
        candidates.push({ A: A.raw, B: B.raw, ...res });
      }
    }
  }

  // Ambiguidade calculada sobre TODOS os candidatos (não só os top N)
  markAmbiguous(candidates);

  candidates.sort((a, b) => b.score - a.score);
  const limited = candidates.slice(0, args.top === Infinity ? undefined : args.top);

  // Montar report
  const report = limited.map((c) => {
    const a = juniorView(c.A);
    const b = juniorView(c.B);
    const auto = autoMergeEligible(c, args.mergeMin);
    const snippet = {
      sourceKeys: [a.repKey, b.repKey].filter(Boolean),
      reason: `${a.name}${a.country ? ` (${a.country})` : ""} ↔ ${b.name}${b.country ? ` (${b.country})` : ""} — ${c.evidence.join("; ")}.${auto ? "" : " [REVISTO MANUALMENTE — confirmar antes de colar]"}`,
    };
    // Sufixo RFEG igual = contas da mesma pessoa → preferir a licença com
    // hcpDate mais recente e arquivar a outra em manualHistoricalIds
    if (c.rfegSuffix) {
      const rA = c.A.sources?.rfeg, rB = c.B.sources?.rfeg;
      if (rA?.lic && rB?.lic) {
        const bNewer = String(rB.hcpDate || "") > String(rA.hcpDate || "");
        const [win, lose] = bNewer ? [rB, rA] : [rA, rB];
        snippet.preferStrongKey = { rfeg: win.lic };
        snippet.manualHistoricalIds = {
          rfeg: [{
            lic: lose.lic,
            club: lose.club || undefined,
            catEdad: lose.catEdad || undefined,
            note: "Licença anterior (mesmo sufixo pessoal — mudança de clube)",
          }],
        };
      }
    }
    const notDupSnippet = {
      sourceKeys: [a.repKey, b.repKey].filter(Boolean),
      reason: `${a.name} ≠ ${b.name} — [motivo]`,
    };
    return {
      score: c.score,
      tier: tierOf(c.score),
      relation: c.rel,
      evidence: c.evidence,
      flags: c.flags,
      ambiguous: !!c.ambiguous,
      autoMerge: auto,
      a, b,
      forceMergeSnippet: snippet,
      notDuplicateSnippet: notDupSnippet,
    };
  });

  const byTier = { alta: 0, "média": 0, baixa: 0 };
  for (const r of report) byTier[r.tier]++;
  const autoSet = report.filter((r) => r.autoMerge);
  const ambiguousCount = report.filter((r) => r.ambiguous).length;

  console.log("");
  console.log(`✓ ${pairsEvaluated} pares avaliados → ${report.length} candidatos (≥${args.minScore})`);
  console.log(`  confiança alta (≥85): ${byTier.alta} · média (65–84): ${byTier["média"]} · baixa (<65): ${byTier.baixa}`);
  console.log(`  ambíguos (excluídos do auto-merge): ${ambiguousCount} · elegíveis auto-merge: ${autoSet.length}`);
  console.log("");
  for (const r of report.slice(0, 30)) {
    const dobs = [r.a.dob, r.b.dob].filter(Boolean).join("/") || "—";
    const mark = r.autoMerge ? "✅" : r.ambiguous ? "❔" : "  ";
    console.log(`  [${String(r.score).padStart(3)}]${mark} ${r.a.name} (${r.a.country || "?"}) ↔ ${r.b.name} (${r.b.country || "?"})  · ${r.relation} · dob ${dobs}`);
    for (const f of r.flags) console.log(`        ${f}`);
  }
  if (report.length > 30) console.log(`  … +${report.length - 30} (ver relatório)`);

  // Escrever outputs
  const outDir = path.join(REPO_ROOT, "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "duplicate-candidates.json");
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    juniorsTotal: juniors.length,
    minScore: args.minScore,
    candidates: report,
  }, null, 2) + "\n", "utf8");
  console.log("");
  console.log(`→ ${path.relative(REPO_ROOT, jsonPath)}`);

  if (args.html) {
    const htmlPath = path.join(outDir, "duplicate-candidates.html");
    fs.writeFileSync(htmlPath, renderHtml(report, juniors.length, args), "utf8");
    console.log(`→ ${path.relative(REPO_ROOT, htmlPath)}  (abrir no browser para rever)`);
  }

  // Propostas de auto-merge — sempre escritas para inspecção
  const proposalsPath = path.join(outDir, "proposed-merges.json");
  fs.writeFileSync(proposalsPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mergeMin: args.mergeMin,
    count: autoSet.length,
    merges: autoSet.map((r) => ({ score: r.score, ...r.forceMergeSnippet })),
  }, null, 2) + "\n", "utf8");
  console.log(`→ ${path.relative(REPO_ROOT, proposalsPath)}  (${autoSet.length} merges seguros)`);

  // --apply: acrescentar os merges seguros ao juniors-overrides.json
  if (args.apply && autoSet.length) {
    const today = new Date().toISOString().slice(0, 10);
    const ov = readJsonSafe(DATA.overrides, null);
    if (!ov) {
      console.error("✗ não consegui ler juniors-overrides.json — --apply abortado");
      process.exit(1);
    }
    ov.forceMerge = ov.forceMerge || [];
    let applied = 0;
    for (const r of autoSet) {
      const entry = {
        sourceKeys: r.forceMergeSnippet.sourceKeys,
        auto: true,
        reason: `[auto find-junior-duplicates ${today}, score ${r.score}] ${r.forceMergeSnippet.reason}`,
      };
      if (r.forceMergeSnippet.preferStrongKey) entry.preferStrongKey = r.forceMergeSnippet.preferStrongKey;
      if (r.forceMergeSnippet.manualHistoricalIds) entry.manualHistoricalIds = r.forceMergeSnippet.manualHistoricalIds;
      ov.forceMerge.push(entry);
      applied++;
    }
    fs.writeFileSync(DATA.overrides, JSON.stringify(ov, null, 2) + "\n", "utf8");
    console.log("");
    console.log(`✓ ${applied} merges acrescentados a ${path.relative(REPO_ROOT, DATA.overrides)} (marcados "auto": true)`);
    console.log("  → correr agora: node scripts/aggregator/index.js");
  } else if (args.apply) {
    console.log("· --apply: nada elegível para auto-merge");
  }
}

// ────────────────────────────────────────────────────────────────────────
// HTML report
// ────────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHtml(report, juniorsTotal, args) {
  const TIER_COLORS = { alta: "#16a34a", "média": "#d97706", baixa: "#64748b" };
  const cards = report.map((r, idx) => {
    const tierColor = TIER_COLORS[r.tier];
    const person = (p) => `
      <div class="person">
        <div class="pname">${esc(p.name)} ${p.country ? `<span class="cc">${esc(p.country)}</span>` : ""}</div>
        ${p.aliases.length ? `<div class="meta">aliases: ${esc(p.aliases.join(", "))}</div>` : ""}
        <div class="meta">DOB: <b>${esc(p.dob || "—")}</b> · sexo: ${esc(p.sex || "—")} · clube: ${esc(p.club || "—")}</div>
        <div class="meta">${esc(p.tournaments)} torneios · fontes: ${esc(p.sources || "—")}</div>
        <div class="meta mono">id: ${esc(p.id)} · chave: ${esc(p.repKey || "—")}</div>
      </div>`;
    const mergeJson = JSON.stringify(r.forceMergeSnippet, null, 2);
    const notDupJson = JSON.stringify(r.notDuplicateSnippet, null, 2);
    return `
    <details class="card" data-tier="${esc(r.tier)}" data-names="${esc([r.a.name, r.b.name, ...r.a.aliases, ...r.b.aliases].join(" ").toLowerCase())}">
      <summary>
        <span class="score" style="background:${tierColor}">${r.score}</span>
        <span class="names">${esc(r.a.name)} ${r.a.country ? `<span class="cc">${esc(r.a.country)}</span>` : ""} ↔ ${esc(r.b.name)} ${r.b.country ? `<span class="cc">${esc(r.b.country)}</span>` : ""}</span>
        ${r.autoMerge ? '<span class="badge auto">auto ✓</span>' : ""}${r.ambiguous ? '<span class="badge amb">ambíguo</span>' : ""}
        <span class="rel">${esc(r.relation)}</span>
      </summary>
      <div class="body">
        <div class="pair">${person(r.a)}${person(r.b)}</div>
        <div class="evidence">
          <b>Evidência:</b> ${r.evidence.map((e) => `<span class="ev">${esc(e)}</span>`).join(" ")}
          ${r.flags.map((f) => `<div class="flag">${esc(f)}</div>`).join("")}
        </div>
        <div class="snips">
          <div class="snip">
            <div class="sniphead">✅ É a mesma pessoa → colar em <code>forceMerge</code>: <button onclick="copySnip(this)">copiar</button></div>
            <pre>${esc(mergeJson)}</pre>
          </div>
          <div class="snip">
            <div class="sniphead">❌ São pessoas diferentes → colar em <code>notDuplicates</code>: <button onclick="copySnip(this)">copiar</button></div>
            <pre>${esc(notDupJson)}</pre>
          </div>
        </div>
      </div>
    </details>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Candidatos a duplicados — juniores kids2</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; z-index: 10; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .sub { font-size: 13px; color: #64748b; margin-bottom: 8px; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .controls input { padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; width: 260px; }
  .tbtn { padding: 5px 12px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 13px; }
  .tbtn.on { background: #0f172a; color: #fff; border-color: #0f172a; }
  main { max-width: 1000px; margin: 0 auto; padding: 16px 20px 60px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
  summary { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .score { color: #fff; font-weight: 700; border-radius: 6px; padding: 2px 8px; font-size: 13px; min-width: 28px; text-align: center; }
  .names { font-weight: 600; flex: 1; }
  .cc { font-size: 11px; background: #e2e8f0; border-radius: 4px; padding: 1px 5px; vertical-align: 1px; }
  .rel { font-size: 12px; color: #64748b; white-space: nowrap; }
  .badge { font-size: 11px; border-radius: 999px; padding: 2px 8px; font-weight: 600; white-space: nowrap; }
  .badge.auto { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .badge.amb { background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
  .body { padding: 0 14px 14px; border-top: 1px solid #f1f5f9; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 0; }
  .person { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .pname { font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 12.5px; color: #475569; margin-top: 2px; }
  .mono { font-family: ui-monospace, monospace; font-size: 11.5px; }
  .evidence { font-size: 13px; margin-bottom: 10px; }
  .ev { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 1px 6px; font-size: 12px; margin-right: 2px; }
  .flag { color: #b45309; font-size: 12.5px; margin-top: 4px; }
  .snips { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .snip pre { background: #0f172a; color: #e2e8f0; font-size: 11.5px; padding: 10px; border-radius: 8px; overflow-x: auto; margin: 6px 0 0; }
  .sniphead { font-size: 13px; }
  .sniphead button { font-size: 12px; padding: 2px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  @media (max-width: 760px) { .pair, .snips { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>Candidatos a duplicados — juniores kids2</h1>
  <div class="sub">${report.length} candidatos (score ≥ ${args.minScore}) em ${juniorsTotal} juniores · gerado ${new Date().toISOString().slice(0, 16).replace("T", " ")} · <b>✅ copiar → forceMerge</b> ou <b>❌ copiar → notDuplicates</b> em <code>public/data/juniors-overrides.json</code>, depois re-correr <code>node scripts/aggregator/index.js</code></div>
  <div class="controls">
    <input id="q" type="search" placeholder="filtrar por nome…" oninput="applyFilters()">
    <button class="tbtn on" data-tier="alta" onclick="toggleTier(this)">alta (${report.filter((r) => r.tier === "alta").length})</button>
    <button class="tbtn on" data-tier="média" onclick="toggleTier(this)">média (${report.filter((r) => r.tier === "média").length})</button>
    <button class="tbtn on" data-tier="baixa" onclick="toggleTier(this)">baixa (${report.filter((r) => r.tier === "baixa").length})</button>
  </div>
</header>
<main>
${cards}
</main>
<script>
function copySnip(btn) {
  const pre = btn.closest(".snip").querySelector("pre");
  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.textContent = "copiado ✓";
    setTimeout(() => { btn.textContent = "copiar"; }, 1500);
  });
}
function toggleTier(btn) { btn.classList.toggle("on"); applyFilters(); }
function applyFilters() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const tiersOn = new Set([...document.querySelectorAll(".tbtn.on")].map((b) => b.dataset.tier));
  document.querySelectorAll(".card").forEach((c) => {
    const okTier = tiersOn.has(c.dataset.tier);
    const okName = !q || c.dataset.names.includes(q);
    c.style.display = okTier && okName ? "" : "none";
  });
}
</script>
</body>
</html>
`;
}

if (require.main === module) main();

module.exports = {
  nameRelation,
  bestNameRelation,
  evaluatePair,
  buildSuppressionSets,
  isSuppressed,
  normClub,
  licSuffix,
  rfegSuffixMatch,
  markAmbiguous,
  autoMergeEligible,
};
