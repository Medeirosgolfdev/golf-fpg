/**
 * scripts/aggregator/resolution/identity-matcher.js
 *
 * Funde RawSourceData[] de várias fontes num conjunto canónico de Junior[].
 *
 * Estratégia:
 *   1. Cada RawPlayer começa como uma entidade isolada
 *   2. Union-find merges:
 *      a) Strong: mesma DOB exacta + nome normalizado compatível (+ nacionalidade)
 *      b) Probable: nome normalizado igual + nacionalidade igual (sem conflito DOB)
 *   3. Overrides manuais (forceMerge, forceSplit) aplicados no fim
 *   4. Constrói Junior canónicos
 *   5. Resolve playerSourceKey → juniorId em todos os tournaments
 */

const { normName, stripDupAbbrev, displayName } = require("../util/names");
const { juniorId } = require("../util/id");
const { sub, warn } = require("../util/log");

function resolve(rawSources, overrides) {
  // ────────────────────────────────────────────────────────────────────
  // 1. Build entity list
  // Each raw player gets a unique entity id (entityKey = "sourceId:sourceKey")
  // ────────────────────────────────────────────────────────────────────
  const entities = [];
  const entityByKey = new Map();
  for (const src of rawSources) {
    for (const p of src.players) {
      const entityKey = `${src.sourceId}:${p.sourceKey}`;
      if (entityByKey.has(entityKey)) continue;
      const ent = {
        entityKey,
        sourceId: src.sourceId,
        sourceKey: p.sourceKey,
        raw: p,
      };
      // Consertar nomes corrompidos "Jessica WangJ. Wang" (EGR/BlueGolf
      // colam nome completo + abreviatura) ANTES de tudo — corrige o
      // display (canonicalName vem de raw.name) e o matching.
      if (p.name) p.name = stripDupAbbrev(p.name);
      // Normalizar PRIMEIRO, depois tokenizar — assim "Castro-Ferreira"
      // (1 token raw) vira "castro ferreira" (2 tokens normalizados) e o
      // lastNameNorm fica "ferreira" igual ao "Ricardo Castro Ferreira"
      // (3 tokens raw).
      ent.normName = normName(p.name);
      const nameTokens = ent.normName ? ent.normName.split(" ") : [];
      ent.firstNameNorm = nameTokens[0] || "";
      ent.lastNameNorm = nameTokens.length > 0 ? nameTokens[nameTokens.length - 1] : "";
      entities.push(ent);
      entityByKey.set(entityKey, ent);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 2. Union-find com prevenção de conflito SÓ para fontes fortes
  // Fontes fortes (uskids, fpg, rfeg, ffgolf): cada chave = pessoa única
  //   → no máximo 1 entity por (sourceId, chave forte) num grupo
  // Fontes fracas (wjgc, eowagr, doral, fpg-anon): podem ter várias entries
  //   por pessoa (nomes variantes, sem ID oficial) — sem invariante
  // ────────────────────────────────────────────────────────────────────
  const STRONG_SOURCES = new Set(["uskids", "fpg", "rfeg", "ffgolf"]);
  function isStrongEntity(e) {
    if (!STRONG_SOURCES.has(e.sourceId)) return false;
    if (typeof e.raw.sourceKey === "string" && e.raw.sourceKey.startsWith("anon|")) return false;
    return true;
  }
  // notDuplicates (overrides) — pares de entityKeys que NUNCA podem ser
  // fundidos pelo matching automático (homónimos confirmados manualmente,
  // ex: o Luis Maier do Doral ≠ Luis Maier do USKids — há 3 miúdos DE com o
  // mesmo nome no mesmo escalão). Um forceMerge explícito (opts.force)
  // continua a ganhar. Até 2026-08-14 esta lista só suprimia sugestões do
  // find-junior-duplicates; agora também trava o matcher.
  const notDupByKey = new Map(); // entityKey → Set<entityKey proibidos>
  for (const rule of overrides?.notDuplicates || []) {
    const keys = Array.isArray(rule.sourceKeys) ? rule.sourceKeys : [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        let sa = notDupByKey.get(keys[i]);
        if (!sa) { sa = new Set(); notDupByKey.set(keys[i], sa); }
        sa.add(keys[j]);
        let sb = notDupByKey.get(keys[j]);
        if (!sb) { sb = new Set(); notDupByKey.set(keys[j], sb); }
        sb.add(keys[i]);
      }
    }
  }

  const parent = new Map();
  // groupEntities: root → Entity[] (todas as entidades do grupo)
  const groupEntities = new Map();
  for (const e of entities) {
    parent.set(e.entityKey, e.entityKey);
    groupEntities.set(e.entityKey, [e]);
  }
  function find(k) {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const next = parent.get(k); parent.set(k, r); k = next; }
    return r;
  }
  /**
   * Tenta unir. Rejeita só se causaria duas entradas STRONG da mesma fonte
   * com chaves diferentes (e.g. fpg:52884 + fpg:54907 = duas pessoas).
   *
   * Excepto quando `opts.force=true` — usado por forceMerge para casos
   * legítimos de múltiplas contas (e.g. Manuel teve 2 USKids memberIds).
   */
  function tryUnion(a, b, opts = {}) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return true;
    const ea = groupEntities.get(ra) || [];
    const eb = groupEntities.get(rb) || [];
    const combined = ea.concat(eb);
    if (!opts.force && notDupByKey.size) {
      // Veto notDuplicates: se juntar os grupos poria no mesmo junior um par
      // proibido, recusar o merge.
      const [small, big] = ea.length <= eb.length ? [ea, eb] : [eb, ea];
      const bigKeys = new Set(big.map((e) => e.entityKey));
      for (const e of small) {
        const forb = notDupByKey.get(e.entityKey);
        if (!forb) continue;
        for (const f of forb) if (bigKeys.has(f)) return false;
      }
    }
    if (!opts.force) {
      const strongBySource = new Map();
      for (const e of combined) {
        if (!isStrongEntity(e)) continue;
        const existing = strongBySource.get(e.sourceId);
        if (existing != null && existing !== e.raw.sourceKey) return false;
        strongBySource.set(e.sourceId, e.raw.sourceKey);
      }
    }
    groupEntities.set(ra, combined);
    groupEntities.delete(rb);
    parent.set(rb, ra);
    return true;
  }

  // ────────────────────────────────────────────────────────────────────
  // 3. Build index: por (firstName, lastName) — captura variantes com middle names
  // ────────────────────────────────────────────────────────────────────
  const byFirstLast = new Map();
  for (const e of entities) {
    if (!e.firstNameNorm || !e.lastNameNorm) continue;
    const key = `${e.firstNameNorm}|${e.lastNameNorm}`;
    let arr = byFirstLast.get(key);
    if (!arr) { arr = []; byFirstLast.set(key, arr); }
    arr.push(e);
  }

  // 4. Strong matches: same DOB + nome compatível
  const byDob = new Map();
  for (const e of entities) {
    if (!e.raw.dob) continue;
    let arr = byDob.get(e.raw.dob);
    if (!arr) { arr = []; byDob.set(e.raw.dob, arr); }
    arr.push(e);
  }
  let strongMerges = 0;
  for (const [dob, arr] of byDob) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.sourceId === b.sourceId && STRONG_SOURCES.has(a.sourceId)) continue;
        if (find(a.entityKey) === find(b.entityKey)) continue;
        if (!nameSimilar(a, b)) continue;
        if (tryUnion(a.entityKey, b.entityKey)) strongMerges++;
      }
    }
  }

  // 5. Probable matches: (firstName, lastName) coincide + país compatível (sem conflito DOB)
  // Captura "Manuel Goulartt Medeiros" ↔ "Manuel Medeiros".
  // Permite mesma fonte para fontes "fracas" (wjgc/eowagr/doral) onde variantes
  // de nome ou de filename criam entidades separadas para a MESMA pessoa.
  let probableMerges = 0;
  // PASS 1: probable matches APERTADOS — normName completo igual (tokens iguais
  // após normalização). Captura "Ricardo Castro-Ferreira" ↔ "Ricardo Castro
  // Ferreira" mas REJEITA "Ricardo Ferreira" (Oporto) ↔ "Ricardo Castro
  // Ferreira" (Estoril) que partilhariam só firstName+lastName.
  for (const [key, arr] of byFirstLast) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.sourceId === b.sourceId && STRONG_SOURCES.has(a.sourceId)) continue;
        if (find(a.entityKey) === find(b.entityKey)) continue;
        if (dobConflict(a.raw.dob, b.raw.dob)) continue;
        if (a.normName !== b.normName) continue; // EXIGIR full match — não basta first+last
        const dobCompat = dobsCompatible(a.raw, b.raw);
        const countryMatch = a.raw.country && b.raw.country && a.raw.country === b.raw.country;
        const oneMissingCountry = !a.raw.country || !b.raw.country;
        // Aceitar se dob compatível OU country compatível OU country missing
        if (!dobCompat && !countryMatch && !oneMissingCountry) continue;
        if (tryUnion(a.entityKey, b.entityKey)) probableMerges++;
      }
    }
  }

  // PASS 2: probable matches LENIENT — só firstName+lastName + tokens
  // adicionais COMPATÍVEIS (subset). Ex: "Manuel Goulartt Medeiros" ↔ "Manuel
  // Medeiros" — o segundo é subset do primeiro. Captura variantes com middle
  // names omitidos, sem aceitar nomes diferentes ("Castro Ferreira" vs só
  // "Ferreira"). REQUER DOB match (não basta country) para evitar falsos
  // positivos entre pessoas diferentes no mesmo país.
  for (const [key, arr] of byFirstLast) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.sourceId === b.sourceId && STRONG_SOURCES.has(a.sourceId)) continue;
        if (find(a.entityKey) === find(b.entityKey)) continue;
        if (dobConflict(a.raw.dob, b.raw.dob)) continue;
        if (a.normName === b.normName) continue; // já tratado em pass 1
        // Tokens médios: o conjunto menor tem de ser subset do maior
        const aTokens = a.normName.split(" ");
        const bTokens = b.normName.split(" ");
        const aSet = new Set(aTokens);
        const bSet = new Set(bTokens);
        const isSubset = aTokens.every((t) => bSet.has(t)) || bTokens.every((t) => aSet.has(t));
        if (!isSubset) continue;
        // EXIGIR DOB compatível — exacta OU dobRange (do USKids age groups)
        if (!dobsCompatible(a.raw, b.raw)) continue;
        if (tryUnion(a.entityKey, b.entityKey)) probableMerges++;
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 6. Apply overrides — forceMerge por sourceKeys explícitos
  // Formato esperado por entrada:
  //   { sourceKeys: ["uskids:549578", "rfeg:AM84955303"], reason: "..." }
  // ────────────────────────────────────────────────────────────────────
  let manualMerges = 0;
  for (const rule of overrides?.forceMerge || []) {
    if (Array.isArray(rule.sourceKeys) && rule.sourceKeys.length >= 2) {
      const targets = rule.sourceKeys.map((k) => entityByKey.get(k)).filter(Boolean);
      if (targets.length < 2) {
        warn(`forceMerge: alguns sourceKeys não encontrados — ${JSON.stringify(rule.sourceKeys)}`);
        continue;
      }
      const root = targets[0].entityKey;
      for (let i = 1; i < targets.length; i++) {
        if (find(targets[i].entityKey) !== find(root)) {
          // force: true para ultrapassar invariante strong+strong (e.g. 2 USKids accounts do mesmo Manuel)
          if (tryUnion(targets[i].entityKey, root, { force: true })) manualMerges++;
          else warn(`forceMerge: conflito de fonte ao unir ${targets[i].entityKey} ↔ ${root}`);
        }
      }
    } else if (Array.isArray(rule.names) && rule.names.length >= 2) {
      // Compat: rule.names — funde TODAS as entidades com qualquer um destes nomes
      const targets = [];
      for (const n of rule.names) {
        for (const e of entities) {
          if (e.normName === normName(n)) targets.push(e);
        }
      }
      if (targets.length < 2) continue;
      const root = targets[0].entityKey;
      for (let i = 1; i < targets.length; i++) {
        if (find(targets[i].entityKey) !== find(root)) {
          if (tryUnion(targets[i].entityKey, root)) manualMerges++;
        }
      }
    }
  }
  // forceSplit: ainda não implementado (para separar pares que o matching
  // automático une, usar notDuplicates — aplicado como veto no tryUnion).

  // ────────────────────────────────────────────────────────────────────
  // 5.9 Colisões de id (23/10/2026)
  // Sem chave forte nem data, o id é o hash do NOME. Dois grupos com o mesmo
  // nome que o passo 5 não juntou (países diferentes) davam o MESMO id — os
  // resultados ficavam juntos pelo id e a ficha aparecia duas vezes (191 casos).
  // Junta-se quando há prova de que é a mesma pessoa: nunca no mesmo flight e
  // idades compatíveis (um só ano de nascimento para todos os escalões). Os
  // que falham são homónimos: ficam separados, com id próprio (passo 6).
  // ────────────────────────────────────────────────────────────────────
  const flightsByEntity = new Map(); // entityKey → [{ fk, y, ageMin, ageMax }]
  for (const src of rawSources) {
    for (const t of src.tournaments || []) {
      const y = Number(String(t.date || "").slice(0, 4)) || null;
      for (const f of t.flights || []) {
        const fk = `${src.sourceId}|${t.sourceKey}|${f.flightKey}`;
        for (const r of f.results || []) {
          if (!r.playerSourceKey) continue;
          const k = `${src.sourceId}:${r.playerSourceKey}`;
          let arr = flightsByEntity.get(k);
          if (!arr) flightsByEntity.set(k, (arr = []));
          arr.push({ fk, y, ageMin: f.ageMin, ageMax: f.ageMax });
        }
      }
    }
  }
  /** Flights e intervalo do ano de nascimento de um grupo. Idades acima de 30
   *  são lixo da fonte (ano no lugar da idade) e não contam. */
  function groupEvidence(group) {
    const fks = new Set();
    let lo = -Infinity, hi = Infinity;
    for (const e of group) {
      for (const f of flightsByEntity.get(e.entityKey) || []) {
        fks.add(f.fk);
        if (!f.y) continue;
        if (typeof f.ageMax === "number" && f.ageMax <= 30) lo = Math.max(lo, f.y - f.ageMax - 1);
        if (typeof f.ageMin === "number" && f.ageMin <= 30) hi = Math.min(hi, f.y - f.ageMin);
      }
    }
    return { fks, lo, hi };
  }
  function samePerson(ga, gb) {
    const a = groupEvidence(ga), b = groupEvidence(gb);
    for (const fk of a.fks) if (b.fks.has(fk)) return false;           // jogaram um contra o outro
    return Math.max(a.lo, b.lo) <= Math.min(a.hi, b.hi);                // um só ano de nascimento
  }
  let collisionMerges = 0;
  {
    const byProvId = new Map(); // id → [root]
    for (const [root, group] of groupEntities) {
      if (find(root) !== root) continue;
      const id = buildJunior(group).id;
      if (!id.startsWith("x")) continue; // só os ids por hash de nome colidem
      let arr = byProvId.get(id);
      if (!arr) byProvId.set(id, (arr = []));
      arr.push(root);
    }
    for (const roots of byProvId.values()) {
      if (roots.length < 2) continue;
      // O grupo com mais entradas primeiro; os outros juntam-se a ele se forem a mesma pessoa.
      roots.sort((a, b) => (groupEntities.get(b)?.length || 0) - (groupEntities.get(a)?.length || 0));
      for (let i = 1; i < roots.length; i++) {
        for (let k = 0; k < i; k++) {
          const ra = find(roots[k]), rb = find(roots[i]);
          if (ra === rb) break;
          if (!samePerson(groupEntities.get(ra) || [], groupEntities.get(rb) || [])) continue;
          if (tryUnion(ra, rb)) { collisionMerges++; break; }
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 6. Materialize juniors: group entities by root
  // ────────────────────────────────────────────────────────────────────
  // Construir preferredEntityKeys: para grupos com override preferStrongKey,
  // ordenar entidades para que a preferida fique por último (last-write-wins).
  const preferredByRoot = new Map(); // root → Map<sourceId, sourceKey>
  for (const rule of overrides?.forceMerge || []) {
    if (!rule.preferStrongKey) continue;
    const refKey = (rule.sourceKeys || [])[0];
    if (!refKey) continue;
    const refEntity = entityByKey.get(refKey);
    if (!refEntity) continue;
    const root = find(refEntity.entityKey);
    let m = preferredByRoot.get(root);
    if (!m) { m = new Map(); preferredByRoot.set(root, m); }
    for (const [src, key] of Object.entries(rule.preferStrongKey)) {
      m.set(src, key);
    }
  }

  const groups = new Map();
  for (const e of entities) {
    const root = find(e.entityKey);
    let g = groups.get(root);
    if (!g) { g = []; groups.set(root, g); }
    g.push(e);
  }

  // sourceKeyToJuniorId: para resolver results
  const entityToJuniorId = new Map();
  let juniors = [];

  const built = []; // [entidades, junior] — para ligar os resultados depois dos ids finais
  for (const [root, group] of groups) {
    const prefs = preferredByRoot.get(root);
    // Sort entities: preferred entity comes LAST (last-write-wins in buildJunior)
    const sorted = prefs ? [...group].sort((a, b) => {
      const aPref = prefs.get(a.sourceId) === a.raw.sourceKey ? 1 : 0;
      const bPref = prefs.get(b.sourceId) === b.raw.sourceKey ? 1 : 0;
      return aPref - bPref;
    }) : group;
    const junior = buildJunior(sorted);
    juniors.push(junior);
    built.push([group, junior]);
  }
  // Homónimos que ficaram separados (5.9) ainda têm o mesmo id: o grupo maior
  // fica com o id de sempre, os outros levam o país (ou a 1.ª chave) no hash.
  let collisionSplits = 0;
  {
    const byId = new Map();
    for (const j of juniors) {
      let arr = byId.get(j.id);
      if (!arr) byId.set(j.id, (arr = []));
      arr.push(j);
    }
    for (const same of byId.values()) {
      if (same.length < 2) continue;
      same.sort((a, b) => b._match.evidence.length - a._match.evidence.length);
      const usados = new Set([same[0].id]);
      for (let i = 1; i < same.length; i++) {
        const j = same[i];
        let salt = j.country || j._match.evidence[0];
        let id = juniorId({ canonicalName: j.canonicalName, dob: j.dob, salt });
        if (usados.has(id)) id = juniorId({ canonicalName: j.canonicalName, dob: j.dob, salt: (salt = j._match.evidence.join(",")) });
        usados.add(id);
        j.id = id;
        collisionSplits++;
      }
    }
  }
  for (const [group, j] of built) for (const e of group) entityToJuniorId.set(e.entityKey, j.id);

  // ────────────────────────────────────────────────────────────────────
  // 7. Map tournaments — converter playerSourceKey → juniorId
  // ────────────────────────────────────────────────────────────────────
  const tournaments = [];
  for (const src of rawSources) {
    for (const t of src.tournaments) {
      const flights = [];
      for (const f of t.flights) {
        const resolvedResults = [];
        for (const r of f.results) {
          if (!r.playerSourceKey) continue; // sem chave: não conseguimos resolver
          const entityKey = `${src.sourceId}:${r.playerSourceKey}`;
          const jId = entityToJuniorId.get(entityKey);
          if (!jId) continue;
          resolvedResults.push({
            juniorId: jId,
            playerNameInSource: r.playerName,
            pos: r.pos,
            status: r.status,
            totalGross: r.totalGross,
            toPar: r.toPar,
            rounds: r.rounds,
          });
        }
        flights.push({
          flightKey: f.flightKey,
          label: f.label,
          ageMin: f.ageMin,
          ageMax: f.ageMax,
          sex: f.sex,
          par: f.par,
          yards: f.yards,
          fieldSize: f.fieldSize,
          results: resolvedResults,
        });
      }
      const tId = `${src.sourceId}-${t.sourceKey}`;
      tournaments.push({
        id: tId,
        sourceId: src.sourceId,
        sourceKey: t.sourceKey,
        name: t.name,
        shortName: t.shortName,
        seriesId: t.seriesId,
        seriesLabel: t.seriesLabel,
        date: t.date,
        startDate: t.startDate,
        endDate: t.endDate,
        course: t.course,
        parTotal: t.parTotal,
        holesPerRound: t.holesPerRound,
        rounds: t.rounds,
        flights,
        links: t.links,
        extra: t.extra,
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 7.5 Apply manualHistoricalIds from overrides
  // Para casos como "Dmitrii teve licença anterior AM11955303" que o portal
  // já não expõe, mas que sabemos ter existido.
  // ────────────────────────────────────────────────────────────────────
  for (const rule of overrides?.forceMerge || []) {
    if (!rule.manualHistoricalIds) continue;
    const refKey = (rule.sourceKeys || [])[0];
    if (!refKey) continue;
    const refEntity = entityByKey.get(refKey);
    if (!refEntity) continue;
    const jId = entityToJuniorId.get(refEntity.entityKey);
    const junior = juniors.find((j) => j.id === jId);
    if (!junior) continue;
    for (const [src, ids] of Object.entries(rule.manualHistoricalIds)) {
      if (src === "rfeg" && junior.sources.rfeg) {
        junior.sources.rfeg.historicalLicenses = junior.sources.rfeg.historicalLicenses || [];
        for (const item of ids) {
          const lic = typeof item === "string" ? item : item.lic;
          if (lic && !junior.sources.rfeg.historicalLicenses.some((h) => (typeof h === "string" ? h === lic : h.lic === lic))) {
            junior.sources.rfeg.historicalLicenses.push(item);
          }
        }
      } else if (src === "fpg" && junior.sources.fpg) {
        junior.sources.fpg.historicalFeds = junior.sources.fpg.historicalFeds || [];
        for (const item of ids) junior.sources.fpg.historicalFeds.push(item);
      } else if (src === "ffgolf" && junior.sources.ffgolf) {
        junior.sources.ffgolf.historicalLicenses = junior.sources.ffgolf.historicalLicenses || [];
        for (const item of ids) junior.sources.ffgolf.historicalLicenses.push(item);
      } else if (src === "uskids" && junior.sources.uskids) {
        junior.sources.uskids.historicalMemberIds = junior.sources.uskids.historicalMemberIds || [];
        for (const item of ids) junior.sources.uskids.historicalMemberIds.push(item);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 8. Populate tournamentIds per junior
  // ────────────────────────────────────────────────────────────────────
  const juniorIdToTids = new Map();
  for (const t of tournaments) {
    for (const f of t.flights) {
      for (const r of f.results) {
        let arr = juniorIdToTids.get(r.juniorId);
        if (!arr) { arr = new Set(); juniorIdToTids.set(r.juniorId, arr); }
        arr.add(t.id);
      }
    }
  }
  for (const j of juniors) {
    j.tournamentIds = Array.from(juniorIdToTids.get(j.id) || []);
  }

  // Filtrar juniores sem torneios relevantes (espectadores no roster sem
  // participações tracked). Reduz canónico de ~30k para ~8k de juniores
  // efectivamente jogadores.
  const beforeFilter = juniors.length;
  juniors = juniors.filter((j) => j.tournamentIds.length > 0);
  const droppedNoTourn = beforeFilter - juniors.length;

  const stats = {
    total: juniors.length,
    droppedNoTourn,
    strong: 0, probable: 0, manual: 0,
    strongMerges, probableMerges, manualMerges, collisionMerges, collisionSplits,
  };
  for (const j of juniors) {
    stats[j._match.confidence] = (stats[j._match.confidence] || 0) + 1;
  }

  return { juniors, tournaments, stats };
}

/**
 * Constrói um Junior canónico a partir de N entidades raw que foram unidas.
 */
function buildJunior(entities) {
  // Escolher canonical name: o que tem mais entropia (não-ALL-CAPS, completo)
  const names = entities.map((e) => e.raw.name).filter(Boolean);
  const canonicalName = pickCanonicalName(names) || names[0] || "?";
  const aliases = Array.from(new Set(names.filter((n) => n !== canonicalName)));

  // DOB: priorizar o que tem maior consenso. Se discordam, é problema.
  const dobs = entities.map((e) => e.raw.dob).filter(Boolean);
  const dob = mostFrequent(dobs);

  // Sex: idem
  const sex = mostFrequent(entities.map((e) => e.raw.sex).filter(Boolean));

  // Country (ISO2): idem. «IG» (England Golf) = Irlanda (23/10/2026).
  const countryOf = (e) => (e.raw.country === "IG" ? "IE" : e.raw.country);
  const country = mostFrequent(entities.map(countryOf).filter(Boolean));
  // Todos os países que as fontes dão (23/10/2026): um junior junto de dois
  // registos (passo 5.9) pode ter o da nacionalidade e o da federação onde joga
  // — as listas de inscritos (util/hcp-listas.js) aceitam qualquer um.
  const countries = [...new Set(entities.map(countryOf).filter(Boolean))];

  // Club: pegar do mais "primary" (com tag primary=true em FPG) ou primeiro disponível
  const clubByPrimary = entities.find((e) => e.raw.extra?.primary);
  const club = clubByPrimary?.raw.club || mostFrequent(entities.map((e) => e.raw.club).filter(Boolean));

  // Region
  const region = mostFrequent(entities.map((e) => e.raw.region).filter(Boolean));

  // Build sources bucket — só entries STRONG vão para os boxes oficiais
  const sources = {};
  for (const e of entities) {
    const sid = e.sourceId;
    const isAnon = typeof e.raw.sourceKey === "string" && e.raw.sourceKey.startsWith("anon|");
    if (isAnon || !["uskids", "fpg", "rfeg", "ffgolf"].includes(sid)) {
      // Fontes secundárias OU anon → bucket _secondary
      if (!sources._secondary) sources._secondary = [];
      sources._secondary.push({ sourceId: isAnon ? `${sid}-anon` : sid, key: e.raw.sourceKey });
      continue;
    }
    if (sid === "uskids") {
      sources.uskids = {
        memberId: e.raw.sourceKey,
        ageGroupCurrent: e.raw.ageGroupCurrent,
        // place = cidade ("Lisboa, PT") propagada do uskids.js adapter
        place: e.raw.place || undefined,
      };
    } else if (sid === "fpg") {
      sources.fpg = {
        fed: e.raw.sourceKey,
        club: e.raw.club,
        clubCode: e.raw.extra?.clubCode,
        clubLong: e.raw.extra?.clubLong,
        hcpExact: e.raw.hcp,
        hcpDate: e.raw.hcpDate,
        sex: e.raw.sex,
        tags: e.raw.extra?.tags,
        primary: e.raw.extra?.primary,
      };
    } else if (sid === "rfeg") {
      sources.rfeg = {
        lic: e.raw.sourceKey,
        club: e.raw.club,
        hcp: e.raw.hcp,
        hcpDate: e.raw.hcpDate,
        catEdad: e.raw.ageGroupCurrent,
        sex: e.raw.sex,
        historicalLicenses: e.raw.extra?.historicalLicenses || [],
      };
    } else if (sid === "ffgolf") {
      sources.ffgolf = {
        lic: e.raw.sourceKey,
        club: e.raw.club,
        hcp: e.raw.hcp,
        region: e.raw.region,
        sex: e.raw.sex,
        glfLic: e.raw.extra?.glfLic,
      };
    }
  }

  // ID estável
  const id = juniorId({
    uskidsMemberId: sources.uskids?.memberId,
    fpgFed: sources.fpg?.fed,
    rfegLic: sources.rfeg?.lic,
    ffgolfLic: sources.ffgolf?.lic,
    canonicalName,
    dob,
  });

  // Confidence
  const sourceIds = entities.map((e) => e.sourceId);
  const uniqueSourceIds = Array.from(new Set(sourceIds));
  const hasStrongId = sources.uskids?.memberId || sources.fpg?.fed || sources.rfeg?.lic || sources.ffgolf?.lic;
  const confidence = uniqueSourceIds.length === 1 ? "strong"
    : (dob || hasStrongId) ? "strong"
      : "probable";
  const evidence = [];
  for (const e of entities) evidence.push(`${e.sourceId}:${e.raw.sourceKey}`);
  if (dob) evidence.push(`dob:${dob}`);

  // hcpHistory — merge cross-source, dedup, sort desc por date
  const hcpHistory = mergeHcpHistory(entities);

  return {
    id,
    canonicalName,
    aliases,
    dob,
    sex,
    nationality: country,
    country,
    ...(countries.length > 1 ? { countries } : {}),
    region,
    club,
    sources,
    tournamentIds: [],
    hcpHistory: hcpHistory.length ? hcpHistory : undefined,
    _match: { confidence, evidence, mergedFromSources: uniqueSourceIds },
  };
}

/**
 * Funde arrays hcpHistory de todas as entities do mesmo júnior.
 * Dedup por (date, hcpExact, source). Ordena por date desc.
 */
function mergeHcpHistory(entities) {
  const all = [];
  for (const e of entities) {
    const hist = e.raw && Array.isArray(e.raw.hcpHistory) ? e.raw.hcpHistory : null;
    if (!hist) continue;
    for (const h of hist) {
      if (!h || !h.date || typeof h.hcpExact !== "number") continue;
      all.push(h);
    }
  }
  if (!all.length) return [];
  const seen = new Set();
  const out = [];
  for (const h of all) {
    const k = h.date + "|" + h.hcpExact + "|" + (h.source || "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return out;
}

/**
 * Heurísticas auxiliares
 */
function nameSimilar(a, b) {
  if (a.normName === b.normName) return true;
  // Tolerância: pelo menos primeiro+último nome iguais (e.g. "Manuel Goulartt Medeiros" vs "Manuel Medeiros")
  if (a.firstNameNorm && b.firstNameNorm && a.firstNameNorm === b.firstNameNorm
      && a.lastNameNorm && b.lastNameNorm && a.lastNameNorm === b.lastNameNorm) return true;
  return false;
}

function countryCompatible(a, b) {
  if (!a || !b) return true; // sem info, assume compatível
  if (a === b) return true;
  // RU pode jogar em ES (caso Dmitrii). Tolerância em casos comuns.
  // Não bloqueamos por país; nationality é um signal mas não veto.
  return true;
}

function dobConflict(a, b) {
  if (!a || !b) return false;
  return a !== b;
}

function pickCanonicalName(names) {
  if (!names.length) return null;
  // Preferir o nome mais COMUM e legível: 2-3 tokens (first+last ou first+middle+last)
  // em vez do mais longo. Nomes muito longos com 4+ tokens são variantes formais
  // raras (e.g. "Manuel Francisco Goulartt De Medeiros") que não casam com aliases
  // existentes em KIDSPage.PLAYER_ALIASES.
  let best = names[0];
  let bestScore = -Infinity;
  for (const n of names) {
    const tokens = n.trim().split(/\s+/).length;
    const upperCount = (n.match(/[A-Z]/g) || []).length;
    const letterCount = (n.match(/[A-Za-z]/g) || []).length;
    const upperRatio = letterCount ? upperCount / letterCount : 1;
    // Bónus por número de tokens: 2 ideal, 3 OK, 4+ penalizado
    const tokenBonus = tokens === 2 ? 3 : tokens === 3 ? 2 : tokens === 4 ? 1 : 0;
    // Penaliza ALL CAPS forte
    const score = -upperRatio * 10 + tokenBonus;
    if (score > bestScore) { best = n; bestScore = score; }
  }
  return best;
}

function mostFrequent(arr) {
  if (!arr.length) return null;
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null, bestCount = -1;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}



function dobInRange(dob, range) {
  if (!dob || !range || !range.lo || !range.hi) return false;
  return dob >= range.lo && dob <= range.hi;
}

function dobRangesOverlap(a, b) {
  if (!a || !b) return false;
  if (!a.lo || !a.hi || !b.lo || !b.hi) return false;
  return a.lo <= b.hi && b.lo <= a.hi;
}

/**
 * dobsCompatible — devolve true se há evidência (DOB exacta ou range) que
 * concorde entre as duas entidades. Usado em Pass 2 do probable matching.
 */
function dobsCompatible(a, b) {
  // Ambas DOB exactas
  if (a.dob && b.dob) return a.dob === b.dob;
  // Uma DOB, outra range
  if (a.dob && b.dobRange) return dobInRange(a.dob, b.dobRange);
  if (b.dob && a.dobRange) return dobInRange(b.dob, a.dobRange);
  // Ambas range
  if (a.dobRange && b.dobRange) return dobRangesOverlap(a.dobRange, b.dobRange);
  return false;
}

module.exports = { resolve };
