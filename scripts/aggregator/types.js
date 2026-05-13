/**
 * scripts/aggregator/types.js
 *
 * Definições de tipos partilhadas (JSDoc typedefs).
 * Não exporta valores em runtime — só serve para autocompletion em editores TS-aware.
 *
 * Schema version actual: 1
 */

const SCHEMA_VERSION = 1;

/**
 * ═══════════════════════════════════════════════════════════════
 * INPUT — o que cada adapter devolve depois de normalizar a fonte
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} RawSourceData
 * @property {string} sourceId  Identificador da fonte (e.g. "uskids", "fpg", "rfeg", "ffgolf").
 * @property {string} sourceLabel  Nome legível (e.g. "USKids Golf", "Federação Portuguesa de Golfe").
 * @property {RawPlayer[]} players  Jogadores observados nesta fonte.
 * @property {RawTournament[]} tournaments  Torneios observados nesta fonte.
 */

/**
 * @typedef {Object} RawPlayer
 * @property {string} sourceKey  Chave única DENTRO da fonte (memberId, fed_code, licença, etc.).
 * @property {string} name  Nome como aparece na fonte.
 * @property {string[]} [aliases]  Outras grafias observadas nesta fonte.
 * @property {string} [dob]  "YYYY-MM-DD" se disponível.
 * @property {"M"|"F"} [sex]
 * @property {string} [country]  ISO3 ou nome (será normalizado).
 * @property {string} [region]
 * @property {string} [club]
 * @property {number} [hcp]
 * @property {string} [hcpDate]  "YYYY-MM-DD"
 * @property {string} [ageGroupCurrent]  Escalão actual reportado pela fonte.
 * @property {Record<string,unknown>} [extra]  Quaisquer campos extra que a fonte queira preservar (foto, coach, tags...).
 */

/**
 * @typedef {Object} RawTournament
 * @property {string} sourceKey  Chave única DENTRO da fonte (tcode, tid, t=, etc.).
 * @property {string} name
 * @property {string} [shortName]
 * @property {string} [seriesId]  Identificador da série/circuito (e.g. "uskids-european-championship", "rfeg-circuito-juvenil-zona-c", "wjgc"). Permite agrupar edições para a vista "Histórico por torneio".
 * @property {string} [seriesLabel]  Nome legível da série.
 * @property {string} [date]  "YYYY-MM-DD" — data principal (ou primeira ronda).
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [course]
 * @property {number} [parTotal]
 * @property {number} [holesPerRound]
 * @property {number} [rounds]
 * @property {RawFlight[]} flights
 * @property {{label: string, url: string}[]} [links]
 * @property {Record<string,unknown>} [extra]
 */

/**
 * @typedef {Object} RawFlight
 * @property {string} flightKey  Identificador único dentro do torneio (e.g. "boys_11", "alevin_m").
 * @property {string} label  "Boys 11", "Alevín", "Sub-12", etc.
 * @property {number} [ageMin]
 * @property {number} [ageMax]
 * @property {"M"|"F"|"mixed"} [sex]
 * @property {number[]} [par]
 * @property {number[]} [yards]
 * @property {RawResult[]} results
 * @property {number} [fieldSize]  Nº de jogadores neste flight.
 */

/**
 * @typedef {Object} RawResult
 * @property {string} playerSourceKey  Refere RawPlayer.sourceKey desta MESMA fonte.
 * @property {string} [playerName]  Redundante mas útil para debug se sourceKey não bater.
 * @property {number|null} [pos]  Posição final. null se WD/DNS/IE.
 * @property {"OK"|"WD"|"DNS"|"DQ"|"IE"|"CUT"} [status]
 * @property {number|null} [totalGross]
 * @property {number|null} [toPar]
 * @property {RawRound[]} [rounds]
 */

/**
 * @typedef {Object} RawRound
 * @property {number} round  1-indexed.
 * @property {number|null} [gross]
 * @property {number[]} [strokes]  18 ou 9 entradas. 0 = não jogado.
 */


/**
 * ═══════════════════════════════════════════════════════════════
 * OUTPUT — o que o aggregator escreve para public/data/
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} JuniorsOutput
 * @property {number} schemaVersion
 * @property {string} generatedAt  ISO timestamp.
 * @property {Junior[]} juniors
 * @property {Record<string,number>} stats  e.g. { total: 8196, withDob: 5234, ... }
 */

/**
 * @typedef {Object} Junior
 * @property {string} id  ID estável (hash determinístico de sourceKeys + aliases).
 * @property {string} canonicalName  Nome para mostrar.
 * @property {string[]} [aliases]  Outras grafias observadas.
 * @property {string} [dob]  "YYYY-MM-DD" quando determinada (fonte forte ou consenso).
 * @property {{lo:string, hi:string}} [dobRange]  Range inferido quando não há DOB exacta.
 * @property {"M"|"F"} [sex]
 * @property {string} [nationality]  Nome completo ("Portugal", "Russia", etc.).
 * @property {string} [country]  ISO2 ("PT", "RU", etc.).
 * @property {string} [region]
 * @property {string} [club]  Clube principal (último observado).
 *
 * @property {JuniorSources} sources  Bolsos por federação. Adicionar uma fonte nova = adicionar key aqui.
 * @property {Record<string,unknown>} [meta]  Extensível: foto, coach, college, social, etc.
 * @property {Record<string,unknown>} [computed]  Métricas computadas: tier, formIndex, etc.
 *
 * @property {string[]} tournamentIds  IDs em JuniorsTournamentsOutput.
 *
 * @property {{
 *   confidence: "strong"|"probable"|"manual",
 *   evidence: string[],
 *   mergedFromSources: string[]
 * }} _match  Auditoria de como esta entidade foi resolvida.
 */

/**
 * @typedef {Object} JuniorSources
 * @property {{memberId:string, lastSeen?:string}} [uskids]
 * @property {{fed:string, club?:string, hcpExact?:number, hcpDate?:string, sex?:"M"|"F", tags?:string[]}} [fpg]
 * @property {{lic:string, club?:string, hcp?:number, catEdad?:string, sex?:"M"|"F", historicalLicenses?:string[]}} [rfeg]
 * @property {{lic:string, club?:string, hcp?:number, region?:string, sex?:"M"|"F"}} [ffgolf]
 * // futuro: dgv?, england?, wagr?, italian?, ...
 */


/**
 * @typedef {Object} JuniorsTournamentsOutput
 * @property {number} schemaVersion
 * @property {string} generatedAt
 * @property {Tournament[]} tournaments
 */

/**
 * @typedef {Object} Tournament
 * @property {string} id  ID canónico (e.g. "uskids-21080", "rfeg-nc61067").
 * @property {string} name
 * @property {string} [shortName]
 * @property {string} sourceId
 * @property {string} sourceKey  Chave original na fonte.
 * @property {string} [seriesId]
 * @property {string} [seriesLabel]
 * @property {string} [date]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [course]
 * @property {number} [parTotal]
 * @property {number} [holesPerRound]
 * @property {number} [rounds]
 * @property {Flight[]} flights
 * @property {{label:string, url:string}[]} [links]
 * @property {Record<string,unknown>} [extra]
 */

/**
 * @typedef {Object} Flight
 * @property {string} flightKey
 * @property {string} label
 * @property {number} [ageMin]
 * @property {number} [ageMax]
 * @property {"M"|"F"|"mixed"} [sex]
 * @property {number[]} [par]
 * @property {number[]} [yards]
 * @property {number} [fieldSize]
 * @property {Result[]} results
 */

/**
 * @typedef {Object} Result
 * @property {string} juniorId  Refere Junior.id.
 * @property {string} [playerNameInSource]
 * @property {number|null} [pos]
 * @property {"OK"|"WD"|"DNS"|"DQ"|"IE"|"CUT"} [status]
 * @property {number|null} [totalGross]
 * @property {number|null} [toPar]
 * @property {RoundResult[]} [rounds]
 */

/**
 * @typedef {Object} RoundResult
 * @property {number} round
 * @property {number|null} [gross]
 * @property {number[]} [strokes]
 */


/**
 * @typedef {Object} TournamentCatalog
 * @property {number} schemaVersion
 * @property {string} generatedAt
 * @property {TournamentSeries[]} series
 */

/**
 * @typedef {Object} TournamentSeries
 * @property {string} id  e.g. "uskids-european-championship".
 * @property {string} label
 * @property {string} sourceId
 * @property {string} [circuit]  e.g. "USKids EU tour".
 * @property {number} editionsCount
 * @property {string[]} tournamentIds  Todos os IDs em JuniorsTournamentsOutput desta série.
 * @property {string} [firstDate]
 * @property {string} [lastDate]
 */


/**
 * ═══════════════════════════════════════════════════════════════
 * OVERRIDES — edição manual para casos que o matcher não resolve
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} OverridesFile
 * @property {number} schemaVersion
 * @property {ForceMergeRule[]} [forceMerge]  Forçar fusão de várias entradas no mesmo júnior.
 * @property {ForceSplitRule[]} [forceSplit]  Forçar divisão de uma entrada em vários juniores.
 * @property {ManualPlayer[]} [manualPlayers]  Adicionar jogadores não detectados.
 */

/**
 * @typedef {Object} ForceMergeRule
 * @property {string[]} names  Variantes do nome a fundir.
 * @property {string} into  ID canónico resultante.
 * @property {string} [reason]
 */

/**
 * @typedef {Object} ForceSplitRule
 * @property {string} name  Nome ambíguo.
 * @property {{id:string, hint:string}[]} into  Pessoas distintas com este nome.
 */

/**
 * @typedef {Object} ManualPlayer
 * @property {string} canonicalName
 * @property {string} [dob]
 * @property {"M"|"F"} [sex]
 * @property {string} [country]
 * @property {Partial<JuniorSources>} sources
 */


module.exports = { SCHEMA_VERSION };
