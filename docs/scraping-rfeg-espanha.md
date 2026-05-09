# Pipeline de scrape Espanha (RFEG / RFEGolf / livegolfscoring / NextCaddy)

Este documento consolida tudo o que aprendemos sobre as fontes de dados de
torneios espanhois e os scripts/JSONs que produzem. Estado: 2026-05-08.

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
POST /getListadoClasificaciones (id=N)       → leaderboard
POST /getListadoInscritos (id=N)             → inscritos
GET  /stats/rounds/{n}                       → JSON rondas
GET  /competiciones-comite                   → discovery (todas as zonas)
```

⚠ **NextCaddy NÃO expõe par/SI/metros do campo** — só scores hole-by-hole.
O par tem de ser inferido a partir dos scores top-50% dos finishers
(script `scripts/infer-nextcaddy-par.js`).

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
  ```bash
  node scripts/scrape-nextcaddy.js --tour 61094
  node scripts/scrape-nextcaddy.js --discover --comite 1
  node scripts/scrape-nextcaddy.js --scope scripts/nextcaddy-scope.json
  ```
  Output: `public/data/nextcaddy/{tourId}.json`. Estado: 139 ficheiros.

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
  Estado: 814 torneios (408 RFEGolf + 267 LGS + 139 NextCaddy).

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

- **`build-rfegolf-rivals.js`** — Filtra LGS apenas juvenil + scorecards
  válidos e produz `public/data/rfegolf-rivals.json` (0.88 MB, 66 torneios)
  consumido em runtime pelo KIDSdataLoader. Tem `sc[]` (scores hbh por ronda).

## Dados produzidos — pasta `public/data/`

| Ficheiro | Origem | Tamanho | Conteúdo |
|---|---|---|---|
| `rfegolf-resultats/*.json` | scrape-rfegolf-node | 408 ficheiros | Metadata + inscritos + palmarés + PDFs parseados |
| `rfegolf-livegolfscoring/*.json` | scrape-livegolfscoring | 267 ficheiros | Leaderboard + scorecards hbh + par real |
| `nextcaddy/*.json` | scrape-nextcaddy | 139 ficheiros | Leaderboard regional Andaluzia/Madrid |
| `rfegolf-resultats-index.json` | build-rfegolf-index | ~140KB | Índice consolidado das 3 fontes — RFEGPage |
| `licencia-dob-lookup.json` | build-licencia-dob-lookup | 0.56 MB | DOB+sexo+clube por licencia |
| `spain-players.json` | build-spain-players-export | 1.15 MB | Lookup para KIDSpage (byName + byLicencia, 3 variantes) |
| `rfegolf-rivals.json` | build-rfegolf-rivals | 0.88 MB | 66 torneios LGS juvenis para KIDSdataLoader processar |

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

### RFEGPage (`/rfeg`)

Lê `rfegolf-resultats-index.json` e mostra todos os torneios com:
- Filtro por ano, categoria, sexo, fonte (LGS / RFEGolf / NextCaddy)
- Ao clicar num LGS → `IntlTournView` com par real + scorecards hbh
- Ao clicar num RFEGolf → tabela de inscritos com DOB/sexo/clube
- Ao clicar num NextCaddy → leaderboard com scorecards hbh + par inferido

### KIDSpage (`/kids`)

- Filtro 🇪🇸 Espanha — só rivais com `tids.startsWith("lgs")`
- Cada rival com participação espanhola tem entries `r["lgs{id}"]` no perfil
- DOB e clube enriquecidos via `spain-players.json` quando o nome bate
- Validação de idade: rejeita match se `birthYear` espanhol difere >1 ano
  do `birthYear` estimado pelos `ageGroup` dos torneios
- Token-set merge consolida "Adriana Garcia Terol" e "Garcia Terol Adriana"
  num único rival (preserva o nome mais detalhado, funde os `r[tid]`)

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

## Para amanhã: comandos rápidos

```bash
# Re-scrape RFEGolf (apanha torneios 2026 novos)
node scripts/scrape-rfegolf-node.js --range 16200-17000 --filter juvenil --concurrency 15

# Re-scrape LGS (procurar ids novos)
node scripts/scrape-livegolfscoring.js --range 369-500 --concurrency 10 --skip-existing

# Re-enrich LGS dates
node scripts/enrich-lgs-dates.js

# Re-build tudo
node scripts/build-rfegolf-index.js
node scripts/build-licencia-dob-lookup.js
node scripts/build-spain-players-export.js
node scripts/build-rfegolf-rivals.js
node scripts/infer-nextcaddy-par.js

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
6. **Par inferido NextCaddy**: NextCaddy não expõe par real; usamos a
   mediana dos scores dos top-50% finishers reconciliada com `total - toPar`.

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
