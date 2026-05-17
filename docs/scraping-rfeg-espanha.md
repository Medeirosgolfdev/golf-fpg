# Pipeline de scrape Espanha (RFEG / RFEGolf / livegolfscoring / NextCaddy)

Este documento consolida tudo o que aprendemos sobre as fontes de dados de
torneios espanhois e os scripts/JSONs que produzem. Estado: 2026-05-09.

## ⚡ Update 2026-05-09 — sumário das mudanças

- **NextCaddy expõe par/SI/metros via `/tarjeta-aux/{inscribedId}/-1`** (não na
  página `/tour/{id}` directamente). O scraper antigo não corria isto; agora
  com `--scorecards` apanha tudo. **A nota anterior "NextCaddy NÃO expõe
  par/SI/metros" está obsoleta** — só era verdade no endpoint do leaderboard.
- **Scrape massivo NextCaddy** — todos os 1281 tours descobertos. ~60 ficheiros
  têm scorecards hbh (juvenis re-scrapados com `--scorecards`).
- **Novo endpoint NC: `POST /getListadoHorarios`** com `id={tourId}` devolve
  HTML com tee times por ronda. Scraper dedicado:
  `scripts/scrape-nextcaddy-horarios.js` (873 tours processados, 159 com draws
  reais publicados).
- **Lookup global `licencia-hcp-lookup.json`** (17.229 licenças) cruza HCP
  entre todos os tournament JSONs — usado pela RFEGPage para preencher HCP em
  falta.
- **`rfegolf-rivals.json` triplicou** (66 → 186 torneios) ao incluir entries
  NC com hbh. Cada entry tem agora `scoringType: "SCRATCH" | "HANDICAP"`
  detectado por heurística (NC tours têm leaderboards duplicados — Scratch
  para gross e Handicap para net).
- **RFEGPage refeito** com vista única IntlTournView (igual FFG), 3 tabs
  Resultados/Inscritos/Draw. Coluna Idade separada de Escalão (sortable),
  termos sempre em RFEG (Alevín/Benjamín/...), pill SCRATCH (gross, amarelo)
  ou HANDICAP (net, azul). Filtro de categorias agrupa Sub-N + termo RFEG.
- **KIDSpage consome NextCaddy** via tids `nc{tourId}_{ageKey}`. Filtro 🇪🇸
  Espanha aceita `lgs*` e `nc*`. Pill SCRATCH/HANDICAP renderizada por torneio.
- **TournScorecard** esconde linhas `m` e `SI` quando array vazio ou só zeros
  (LGS não tem meters; antes mostrava "0 0 0" parcial).

## Fontes — três sites distintos

| Fonte | URL | O que tem | Auth |
|---|---|---|---|
| **RFEGolf microsite** | `rfegolf.es/CompetenciaPaginas/...` | Inscrições + DOB + sexo + clube + hcp por jogador | Público |
| **livegolfscoring (LGS)** | `rfegolf.livegolfscoring.es/torneos/...` | Leaderboard + scorecards hbh + par real do campo | Público |
| **NextCaddy** | `nextcaddy.com/tour/{id}` | Circuitos regionais (RFGA Andaluzia + FGM Madrid) | Público |

A RFEG usa duas plataformas em paralelo: **RFEGolf** para campeonatos
nacionais oficiais, **NextCaddy** para circuitos regionais. O
**livegolfscoring** é o site interno da RFEG onde os scorers carregam
resultados ronda-a-ronda, espelhado depois em PDFs no microsite RFEGolf.

## Endpoints essenciais — como apanhar cada coisa

### RFEGolf microsite (CompId)

| Página | URL | O que extrai |
|---|---|---|
| Microsite | `/CompetenciaPaginas/CompetitionMicrosite.aspx?CompId={id}` | Nome, datas, campo, categoria, sexo, hcp limit, federação |
| LiveScoring | `/CompetenciaPaginas/LiveScoring.aspx?CompId={id}` | Inscritos (admitidos/reservas/bajas/invitados/no admitidos/provisional) com DOB+sexo+clube |
| ListaResultados | `/CompetenciaPaginas/ListaResultados.aspx?CompId={id}` | Tabela com PDFs de resultados anexos |
| PalmaresCompleto | `/CompetenciaPaginas/PalmaresCompleto.aspx?CompId={id}` | Vencedores históricos (palmarés) |

CompId vai de ~12500 (2021) a ~16300 (2026). Range juvenil identificado:
407 CompIds (Sub-10 a Sub-25).

### livegolfscoring (id interno)

| Página | URL | O que extrai |
|---|---|---|
| clasificacion | `/torneos/clasificacion/{id}` | Leaderboard + Hdp + Mtrs total |
| **hoyoahoyo** | `/torneos/hoyoahoyo/{id}` ou `/torneos/hoyoahoyo/{id}/{r}` | **Scorecards hbh + par REAL por buraco** ✓ |
| horarios | `/torneos/horarios/{id}/{r}` | Tee times |
| imprimir | `/torneos/imprimir/{id}` | Versão print com `Fecha: dd/mm/yyyy` (tem o ano completo!) |

**id interno** vai de ~24 (2017) a ~370 (2026). Não há mapeamento directo
RFEGolf CompId ↔ LGS id — temos de cruzar por nome+ano+clube.

### NextCaddy (tour/{id}) — RFGA + FGM

```
GET  /tour/{id}                              → metadata HTML
POST /getListadoClasificaciones (id=N)       → leaderboard (categorias múltiplas)
POST /getListadoInscritos (id=N)             → inscritos
POST /getListadoHorarios (id=N)              → HTML com tee times por ronda
GET  /tarjeta-aux/{inscribedId}/-1           → scorecard hbh + par/SI/metros REAIS ✓
GET  /stats/rounds/{n}                       → JSON rondas
GET  /competiciones-comite                   → discovery (todas as zonas)
```

✓ **NextCaddy EXPÕE par/SI/metros do campo** via `/tarjeta-aux/...` (descoberto
2026-05-09). O scraper apanha-os quando corrido com `--scorecards`. Para
torneios sem scorecards individuais publicados, fallback é o
`scripts/infer-nextcaddy-par.js` (par inferido dos scores top-50%).

⚠ **Categorias NC: Scratch vs Handicap.** Cada NC tour expõe múltiplos blocos
de leaderboard. Tipicamente um é a classificação Scratch (gross) e outro a
Handicap (net = gross − handicap). Os blocos têm o mesmo player mas com
`total` diferente — isto é intencional e está propagado em `rfegolf-rivals.json`
via campo `scoringType`. Heurística de detecção: comparar `player.total` com
`sum(roundScores[].scores)`. Iguais → SCRATCH. Diferentes → HANDICAP.

## Scripts criados (`scripts/*.js`)

### Scrape

- **`scrape-rfegolf-node.js`** — RFEGolf microsite via Node puro (HTTP simples,
  sem auth). Apanha metadata + inscritos + palmarés. PDFs de resultados
  parseados com `pdf-parse`.
  ```bash
  node scripts/scrape-rfegolf-node.js --comp 15956 --pretty
  node scripts/scrape-rfegolf-node.js --scope scripts/rfegolf-scope.json --concurrency 15
  node scripts/scrape-rfegolf-node.js --range 13500-16300 --filter juvenil
  ```
  Output: `public/data/rfegolf-resultats/{compId}.json`. Estado 2026-05-08:
  408 ficheiros.

- **`scrape-livegolfscoring.js`** — Scrape de `rfegolf.livegolfscoring.es`,
  HTML estruturado com par + scorecards hbh + halves + total + ±today.
  ```bash
  node scripts/scrape-livegolfscoring.js --id 322 --pretty
  node scripts/scrape-livegolfscoring.js --range 1-400 --concurrency 10 --skip-existing
  ```
  Output: `public/data/rfegolf-livegolfscoring/{id}.json`. Estado 2026-05-08:
  267 ficheiros (24-368).

- **`scrape-nextcaddy.js`** — Scrape de circuitos regionais Andaluzia/Madrid.
  Sem `--scorecards`: leaderboard + inscritos. Com `--scorecards`: também faz
  fetch a `/tarjeta-aux/{inscribedId}/-1` por player → par/SI/metros + scores
  hbh. Tipicamente +5s por torneio com scorecards.
  ```bash
  node scripts/scrape-nextcaddy.js --tour 61094
  node scripts/scrape-nextcaddy.js --tour 61131 --scorecards
  node scripts/scrape-nextcaddy.js --discover --comite 1
  node scripts/scrape-nextcaddy.js --scope scripts/nextcaddy-scope.json --concurrency 8 --skip-existing
  ```
  Output: `public/data/nextcaddy/{tourId}.json`. Estado 2026-05-09: **1281
  ficheiros** (todos os tours descobertos).

- **`scrape-nextcaddy-horarios.js`** ⭐ NOVO 2026-05-09 — Tab Draw saída.
  Endpoint: `POST /getListadoHorarios` parsado em HTML para extrair tee
  times agrupados por flight (time, tee, players[]). Adiciona campo
  `horarios: [{round, players[]}]` aos JSONs NC existentes.
  ```bash
  node scripts/scrape-nextcaddy-horarios.js --tour 61131
  node scripts/scrape-nextcaddy-horarios.js --all --concurrency 8 --skip-existing
  ```
  Estado 2026-05-09: 873 tours actualizados, 159 com draws reais.

- **`enrich-lgs-dates.js`** — Enriquece JSONs LGS sem `meta.year` fazendo
  fetch a `/torneos/imprimir/{id}` e extraindo `Fecha: dd/mm/yyyy`.
  ```bash
  node scripts/enrich-lgs-dates.js
  ```

### Discovery

- **`discover-rfegolf-comps.js`** — Probing range CompId para identificar
  juvenis. Output: `scripts/rfegolf-scope.json` (407 torneios).

### Build / consolidação

- **`build-rfegolf-index.js`** — Junta RFEGolf + LGS + NextCaddy num índice
  único `public/data/rfegolf-resultats-index.json` (consumido pela RFEGPage).
  ```bash
  node scripts/build-rfegolf-index.js
  ```
  Estado 2026-05-09: **1956 torneios** (408 RFEGolf + 267 LGS + 1281 NextCaddy).
  No sidebar do RFEGPage só aparecem ~166 (filtro: ter `category` juvenil
  preenchida E `leaderboardPlayers > 0`).

- **`build-livegolfscoring-index.js`** — Índice dedicado LGS com `nRounds`,
  `players` count, `dateRange`. Para a UI filtrar.

- **`build-livegolfscoring-map.js`** — Tenta mapear CompId RFEGolf ↔ LGS id
  por nome+ano (matching jaccard). 41 hard matches confirmados.

- **`infer-nextcaddy-par.js`** — Infere par[18] do campo a partir dos scores
  top-50% NextCaddy. Output: actualiza cada `public/data/nextcaddy/{id}.json`
  com `course.par`, `course.parTotal`, `course.parInferred`, `parConfidence`.
  21 dos 139 torneios NextCaddy têm scorecards e par inferido.

- **`build-licencia-dob-lookup.js`** — Cria
  `public/data/licencia-dob-lookup.json` mapeando `licencia → {dob, sex,
  club, catEdad, sources}`. Estado: **2186 jogadores espanhois** com DOB.

- **`build-spain-players-export.js`** — Subset do lookup para ser
  consumido pela KIDSpage. Output:
  `public/data/spain-players.json` (1.15 MB, 3948 entries no `byName`
  com 3 variantes ortográficas — "marcus latt", "latt marcus", etc.).

- **`build-rfegolf-rivals.js`** — Junta LGS + NextCaddy juvenis com scorecards
  válidos e produz `public/data/rfegolf-rivals.json` (~1.05 MB, **186 torneios**:
  66 LGS + 120 NC) consumido pelo KIDSdataLoader. Tem `sc[]` (scores hbh) +
  `meters[]` + `si[]` (NC) + `scoringType` ("SCRATCH" ou "HANDICAP" — só NC).
  Tids: `lgs{id}` para LGS, `nc{id}_{ageKey}` para NC (1 entrada por categoria
  juvenil; ageKey = "alevín", "infantil", etc.).
  ```bash
  node scripts/build-rfegolf-rivals.js
  ```

- **`build-licencia-hcp-lookup.js`** ⭐ NOVO 2026-05-09 — Cruza HCP de TODOS os
  JSONs scrapados (NC + RFEGolf), agrega por licença e mantém o mais recente.
  Output: `public/data/licencia-hcp-lookup.json` com 17.229 licenças. Usado
  pela RFEGPage para preencher HCP em falta (ex: LGS não expõe HCP por player).
  ```bash
  node scripts/build-licencia-hcp-lookup.js
  ```

## Dados produzidos — pasta `public/data/`

| Ficheiro | Origem | Tamanho | Conteúdo |
|---|---|---|---|
| `rfegolf-resultats/*.json` | scrape-rfegolf-node | 408 ficheiros | Metadata + inscritos + palmarés + PDFs parseados |
| `rfegolf-livegolfscoring/*.json` | scrape-livegolfscoring | 267 ficheiros | Leaderboard + scorecards hbh + par real |
| `nextcaddy/*.json` | scrape-nextcaddy + scrape-nextcaddy-horarios | **1281 ficheiros** | Leaderboard + horarios + (com `--scorecards`) hbh + par/SI/metros |
| `rfegolf-resultats-index.json` | build-rfegolf-index | ~140KB | Índice consolidado das 3 fontes — RFEGPage |
| `licencia-dob-lookup.json` | build-licencia-dob-lookup | 0.56 MB | DOB+sexo+clube por licencia |
| `licencia-hcp-lookup.json` | build-licencia-hcp-lookup ⭐ NOVO | ~0.5 MB | HCP por licença (17.229 entries) — cross-reference para preencher HCP em falta |
| `spain-players.json` | build-spain-players-export | 1.15 MB | Lookup para KIDSpage (byName + byLicencia, 3 variantes) |
| `rfegolf-rivals.json` | build-rfegolf-rivals | ~1.05 MB | **186 torneios** (66 LGS + 120 NC) com scoringType — KIDSdataLoader |

## Características importantes dos dados

### Formato de nome RFEGolf

Nomes vêm como **`"APELIDO, Nomes"`** (com vírgula, apelido em maiúsculas):
- `"LATT, Marcus"` → canónico: `"Marcus Latt"`
- `"GROSS PANEQUE, Diego"` → canónico: `"Diego Gross Paneque"`
- `"ELCHANINOV, Dmitrii"` → canónico: `"Dmitrii Elchaninov"`

A função `rfegolfNameToCanonical()` em KIDSdataLoader.ts faz a conversão
**antes** do `mergeInto()` para casar com nomes do USKids/FFG/etc.

### Apelidos compostos espanhois

Espanhois normalmente têm 2 apelidos. Daí "Adriana Garcia Terol" pode aparecer
como "Adriana Garcia" no USKids (FFG só usa um apelido). A consolidação
**token-set sorted** em KIDSdataLoader funde rivais com os mesmos tokens em
ordem diferente.

### Datas no LGS

A página `/hoyoahoyo/{id}` só tem `dateRange: "25 junio - 27 junio"` (sem
ano). O ano completo está em `/imprimir/{id}` na linha `Fecha: 27/06/2025`.
Daí o passo extra `enrich-lgs-dates.js`.

### IDs LGS por ano (estimado)

- 2017: ids 24-50
- 2018-2020: ids ~50-100
- 2021: ids 100-130
- 2022: ids 130-170
- 2023: ids 170-225
- 2024: ids 225-280
- 2025: ids 280-340
- 2026: ids 340-368+

### CompId RFEGolf vs LGS id

**Não há mapeamento directo**. Cruzamento por nome+ano+clube:
- Hard matches (string identical): 41
- Token-set matches (apelidos em ordem diferente, escalão no nome): +135
- Total dedupados quando ambos os lados têm o jogador: ~176

## Integração na app

### RFEGPage (`/rfeg`) — refeito 2026-05-09

Vista única coerente — **todas as fontes** (LGS, NextCaddy, RFEGolf)
renderizam pelo `IntlTournView` (mesmo componente da FFG/FPG). 3 tabs:

- **📋 Resultados** — `IntlTournView` com tabs R1/R2/.../Resumo + Scorecards.
  Adapters dedicados convertem cada source para `FPGTournament`:
  `lgsToFPGTournament`, `ncToFPGTournament`, `rfegolfToFPGTournament`.
- **👥 Inscritos** — `PlayerTable` clássica com DOB/sexo/clube.
- **🕐 Draw saída** — usa `DrawTab` partilhado (mesmo do FPG). Apenas para NC
  por agora (LGS/RFEGolf não publicam tee times).

**Coluna ESC desdobrada em 2 pills sortable** (idade neutral cinza + escalão
colorido). Termos sempre em RFEG (Alevín, Benjamín, etc.) — `EscPill` mapeia
"Alevín" → mesma cor que "Sub-12" via `ES_TERM_TO_SUB`. Filtro de categorias
agrupa Sub-N + RFEG (ex: "Alevín (53)" inclui torneios marcados como Alevín
ou Sub-12).

Sidebar: torneios filtrados por `category` preenchida E
`leaderboardPlayers > 0` (oculta adultos e futuros sem dados). `SexBadge` +
`RoundPill` consistentes com o resto da app (sem texto "Masculino" nem
símbolos Unicode ♂/♀).

Item info "📚 Categorías de edad RFEG" — vista com tabela das 7 categorias
oficiais (Benjamín → Sub-25), millésime por ano de referência, equivalentes
internacional/FPG/FFG.

### KIDSpage (`/kids`) — extensões 2026-05-09

- Filtro 🇪🇸 Espanha aceita ambos `lgs*` e `nc*` tids
- `processRfegolfRivals` no `KIDSdataLoader` regista `co: "Spain"` directamente
  e popula `uskTournNames` para os tids NC/LGS
- Pill colorido **Scratch** (gross, fundo amarelo) ou **Handicap** (net, fundo
  azul) por torneio NC — lido de `ncScoringType` Map
- Link `↗ RFEG` para NC abre `nextcaddy.com/tour/{id}/clasificaciones`
- `TournScorecard.tsx` esconde linhas `m` e `SI` quando array vazio ou só
  zeros (LGS não tem meters; antes mostrava "0 0 0" parcial)

_Secção movida acima — ver "KIDSpage extensões 2026-05-09"._

## Próximos passos — onde procurar mais torneios 2026

Ainda só temos ~17 torneios LGS de 2026. A utilizadora suspeita que faltam
muitos. **Hipóteses para investigar amanhã:**

1. **Range LGS estendido**: experimentei até id 450 e todos os 369-450 deram
   404. Mas o livegolfscoring pode ter saltos. Tentar 369, 370, 371... um a
   um para ver se há ids pontuais.

2. **CompId RFEGolf 2026 com PDFs publicados**: dos 408 RFEGolf scrapados,
   só ~9 tinham PDFs com leaderboard. À medida que torneios 2026 acabam, mais
   PDFs vão sendo carregados em `ListaResultados.aspx`.

3. **Torneios regionais que NÃO estão em LGS** mas têm leaderboard publicado
   noutro lado:
   - **Federación Catalana de Golf** (FCG): provavelmente tem os seus
     próprios resultados num site dedicado.
   - **Federación Madrileña de Golf** (FGM): já temos via NextCaddy.
   - **Federación Vasca de Golf**, **Aragonesa**, **Galega**, etc.: podem
     ter sites próprios.

4. **`/competiciones-comite` do NextCaddy**: explorar todos os comités
   (não só RFGA/FGM). O parâmetro `--comite` aceita ids — testar 2, 3, 4...
   para ver se outras federações regionais usam a plataforma.

5. **Discovery automática**: `discover-rfegolf-comps.js` apanhou range
   12700-16250. Tentar 16250-17000 para ver torneios 2026 mais recentes.
   Também experimentar < 12700 para 2018-2020 que estão a faltar.

6. **golf-portugal.pt** ou **golfportugal-data.pt**: o utilizador comentou
   que vivem muitos jovens em Espanha. Talvez haja um catálogo cross-fed
   noutro endpoint que ainda não explorámos.

7. **Ranking RFEG**: `rfegolf.es/RankingPagina/RankingList.aspx` tem rankings
   por escalão. Cada jogador no ranking pode ter um histórico de torneios
   com CompIds — mais um caminho para descobrir torneios.

## Run manual / debug

> **Nota:** desde 2026-05-17, o workflow `.github/workflows/update-spain.yml`
> corre toda esta pipeline automaticamente uma vez por semana (Segunda às
> 04:00 UTC) com `--skip-existing` em todos os scrapers. Os comandos abaixo
> são para corridas ad-hoc (debug, force_rebuild de um sub-conjunto, ou
> primeira execução em ambiente novo). Para força bruta sem mexer em código,
> usa o botão "Run workflow" no GitHub com `force_rebuild=true`.

```bash
# Re-scrape RFEGolf (apanha torneios 2026 novos)
node scripts/scrape-rfegolf-node.js --range 16200-17000 --filter juvenil --concurrency 15

# Re-scrape LGS (procurar ids novos)
node scripts/scrape-livegolfscoring.js --range 369-500 --concurrency 10 --skip-existing

# Re-enrich LGS dates
node scripts/enrich-lgs-dates.js

# NextCaddy — discovery + scrape novo + scorecards juvenis + horarios
node scripts/scrape-nextcaddy.js --discover --out scripts/nextcaddy-scope-all.json
node scripts/scrape-nextcaddy.js --scope scripts/nextcaddy-scope-all.json --concurrency 8 --skip-existing
node scripts/scrape-nextcaddy.js --scope scripts/nextcaddy-juvenil-need-scorecards.json --scorecards --concurrency 4
node scripts/scrape-nextcaddy-horarios.js --all --concurrency 8 --skip-existing

# FCG (Federació Catalana — golfdirecto.com)
node scripts/discover-fcg-scope.js --years 2025,2026
node scripts/scrape-fcg.js --scope scripts/fcg-scope.json --concurrency 3 --skip-existing

# Re-build tudo
node scripts/build-rfegolf-index.js
node scripts/build-licencia-dob-lookup.js
node scripts/build-licencia-hcp-lookup.js   # NOVO 2026-05-09
node scripts/build-spain-players-export.js
node scripts/build-rfegolf-rivals.js
node scripts/build-fcg-rivals.js             # NOVO 2026-05-09
node scripts/infer-nextcaddy-par.js          # fallback para NC sem --scorecards

# Validar
npm test
```

## Decisões de design importantes

1. **3 scripts de scrape independentes** — cada fonte tem o seu protocolo
   diferente, não tentamos unificar.
2. **Index pré-computado** (`rfegolf-resultats-index.json`) — UI não faz
   discovery em runtime, é tudo lookup.
3. **Lookup DOB com 3 variantes ortográficas** — o normName + variantes
   (`"latt marcus"`, `"marcus latt"`, `"latt marcus"`) garantem matching
   independentemente da ordem.
4. **Validação de idade no enrich** — `Math.abs(espYear - estimatedYear) > 1`
   rejeita matches falsos (homónimos com idades diferentes).
5. **Token-set merge** — consolidação O(n) no fim do load para fundir
   "Adriana Garcia Terol" e "Garcia Terol Adriana".
6. **Par/SI/metros NextCaddy** — `tarjeta-aux` por player expõe-os
   directamente (descoberto 2026-05-09). Fallback `infer-nextcaddy-par.js`
   continua útil para NC sem scorecards individuais publicados.
7. **Scratch vs Handicap NC** — NC tem leaderboards duplicados (Scratch=gross,
   Handicap=net). Detecção heurística por comparação `total` vs
   `sum(scoresByRound)`. KIDSpage e RFEGPage mostram pill colorido para o user
   distinguir.
8. **Lookup HCP global** (2026-05-09) — agrega HCPs de todos os JSONs por
   licença para preencher onde uma fonte não tem (ex: LGS não expõe HCP).
9. **Termos RFEG sempre** — UI usa "Alevín/Benjamín/Infantil/Cadete/Junior/
   Juvenil" em vez de "Sub-N". `EscPill` mapeia ambos para a mesma cor CSS
   via `ES_TERM_TO_SUB`.

## Insights operacionais

- **livegolfscoring é a fonte rica** — par real + scorecards hbh, é onde
  vai a maior valor para a KIDSpage.
- **Microsite RFEGolf é a fonte fria** — para 2026, ~65% dos torneios não
  tem PDF publicado (só inscritos). À medida que a temporada avança,
  vão carregando.
- **NextCaddy é o circuito regional** — apanha jogadores que não chegam
  aos campeonatos nacionais.
- **Cookies não necessários** em nenhum dos 3 sites — todos públicos sem
  auth (ao contrário da FPG que precisa de Chrome 90 para .AspNet cookies).
- **Concurrency seguro: 10-15 paralelos** para LGS, 8 para NextCaddy. RFEGolf
  microsite não viu rate limiting até agora.
