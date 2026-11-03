# England Golf (GolfGenius)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Scripts — England Golf (GolfGenius)

Cada torneio England Golf vive num microsite GolfGenius (alguns em `www.golfgenius.com`, outros em subdomínios `eg-{slug}{YY}.golfgenius.com`). A página `/england` é uma duplicação minimalista da `/bjgt` (mesmos `TournView`, sub-tabs por ronda, ManuelPill, etc.).

**Catálogo:** `public/data/england-golf-catalog.json` — 39 edições de torneios juvenis 2023-2026 (Carris/McGregor/Reid Trophies, English U18 Amateur, English Girls' Open/U16/U14, Justin Rose Telegraph, Bronte Law Junior Series, England U16 v Spain, Boys' County Finals, Junior Champion Club, English Schools). Cada entry tem `year`, `section`, `slug`, `title`, `gender`, `ageGroup`, `gg_base`, `gg_page`.

**Cobertura efectiva:** 19/27 das edições 2023-2025 com dados completos. 8 falham por motivos estruturais do GolfGenius (ver "Limitações conhecidas" abaixo).

### ⚠ A época de 2026 esteve um Verão inteiro por scrapar (2026-08-30)

O England era o **único circuito sem automação**: não havia workflow nenhum a
correr o `scrape-england-golf.js`, e todos os `england_*.json` tinham
`scrapedAt: 2026-05-18` — o dia em que o scraper foi escrito. Some-se a isso o
catálogo ser **curado à mão** e os ids do GolfGenius **mudarem todos os anos**
(o subdomínio inclusive: `eg-carristrophy25` → `eg-carristrophy26`), e o
resultado foi 2026 ficar com **uma única entrada** — o `bronte-law-farnham-2026`,
inserido em Maio quando a página ainda nem estava publicada. Corrigido com as
três peças abaixo: descoberta, 11 entradas novas no catálogo e o
`update-england.yml` semanal.

### Descoberta de provas novas — `discover-england-golf-events.js`

A fonte é o **directório público do England Golf** no GolfGenius:
`/leagues/36129/customer_directories/10291/directory_iframe` (o link vive no
próprio `englandgolf.org`). Lista os ~41 eventos da época com, para cada um, um
link `/ggid/{ggid}` que redirecciona para a **página de resultados** — que é
exactamente o `gg_page` que o scraper quer. Os ggid terminam no ano a 2 dígitos
(`carris26`, `reid26`, `bljse26`), o que dá o filtro por época de borla.

```bash
node scripts/discover-england-golf-events.js            # juvenis do ano corrente
node scripts/discover-england-golf-events.js --all      # todos os eventos (incl. adultos)
node scripts/discover-england-golf-events.js --year 2027 --json /tmp/eg.json
```

Exit **0** = há provas por acrescentar · **2** = nada novo · **1** = erro.
Imprime as entradas já em JSON, prontas a colar — com `section`/`gender`/
`ageGroup` a `"REVER"`, **de propósito**: são esses três campos que fazem a
`/england` agrupar as provas por secção e não há como inferi-los do nome com
confiança. O workflow corre a descoberta mas **nunca edita o catálogo** — só
escreve o aviso no resumo do run.

⚠ **O directório é uma app React** — o HTML cru vem vazio, é preciso browser.
⚠ **O GolfGenius devolve 403 a um `page.goto` directo em `/pages/{id}`** vindo de
browser automatizado, mas serve o directório e os widgets à mesma. Por isso a
resolução `ggid → /pages/{id}` é feita por `fetch` DENTRO do contexto do browser,
nunca por navegação.
⚠ **Cada evento tem DUAS páginas e nem sempre servem as duas.** O cartão do
directório tem um link "Results" e o `/ggid/{ggid}` redirecciona para uma página
de aterragem — que podem ser diferentes. No **Carris Trophy 2026** a aterragem é
`/pages/6135942` ("Leaderboard"), onde o dropdown de eventos vem **vazio** e o
scraper salta o torneio com `⚠ dropdown sem eventos`; o "Results" do cartão
(`/pages/5644445`) abre a vista certa, com as 4 rondas e 195 jogadores. O
discover propõe o "Results" primeiro e imprime a aterragem como `alt=` — se um
torneio do catálogo der "dropdown sem eventos", **trocar pelo outro id antes de
o dar como falhado**.

### CLI

```bash
node scripts/scrape-england-golf.js                              # tudo
node scripts/scrape-england-golf.js --since-year 2023            # ≥ 2023
node scripts/scrape-england-golf.js --slug carris-trophy-2025    # só esse
node scripts/scrape-england-golf.js --year 2025
node scripts/scrape-england-golf.js --skip-existing              # idempotente
node scripts/scrape-england-golf.js --gg-base https://eg-X.golfgenius.com --gg-page 1234567 --slug X --year 2026  # ad-hoc
node scripts/scrape-england-golf.js --no-headless                # debug com browser visível
```

**Exit codes (2026-08-30):** **0** = gravou ficheiros novos/alterados · **2** =
nada novo (NÃO é erro — o workflow salta o commit) · **1** = erro real. O
ficheiro só é reescrito quando o conteúdo muda **ignorando o `scrapedAt`**
(`sameContent`) — sem isso cada run do cron produzia um diff em todos os
ficheiros só por causa do timestamp e o commit semanal era ruído puro.

**Variáveis de ambiente (2026-08-30):** `launchOptions()` deixa o Playwright
adaptar-se ao ambiente sem mexer no CI. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` aponta
para um Chromium pré-instalado; se houver `HTTPS_PROXY`, passa-o ao browser
**mais** `--disable-quic --disable-http2 --ssl-version-max=tls1.2` (sem estes o
Chromium não fala com um proxy que re-termina TLS — dá `ERR_CONNECTION_RESET`
enquanto o `curl` funciona perfeitamente). Em CI nenhuma das duas está definida
e o comportamento é o de sempre.

### Datas das provas — `backfill-england-dates.js` (01/11/2026)

As provas sem cartões (todas as de 2026) não traziam data: o adapter punha
`{ano}-07-01` e o Kids 2 via o Carris, o McGregor, o Reid e a Bronte Law no
mesmo dia. A GolfGenius publica as datas por ronda em
`/v2tournaments/{eventId}` (`event.rounds[].date`; o `eventId` vem de cada
jogador). `scripts/backfill-england-dates.js` grava `startDate`, `endDate` e
`roundDates` no `england_{slug}.json` (só fetch, um pedido de cada vez; corre no
`update-england.yml` depois do scrape, que reescreve os ficheiros). O adapter usa
`startDate`, senão o cabeçalho dos cartões, senão **fica sem data** — nada de
data inventada. Sem data na GolfGenius (01/11): Bronte Law Edgbaston, Moor
Allerton e Royal Mid Surrey 2026, Bronte Law Farnham 2025, Justin Rose 2023 div1
(eventos de uma ronda, sem `rounds` no JSON).

**Ano do catálogo errado** (02/11/2026): três `gg_page` eram de outra edição —
«English Girls' U16 & U14 2023» era a de 2021 (Morecambe), «… 2024» a de 2023 e
«English U18 Amateur 2023» a de 2021. No Kids 2 a de «2023» caía em cima do
English Girls' Open 2023 (EGR) com as mesmas meninas e pancadas diferentes.
Corrigidos o catálogo e os ficheiros; o backfill passa a dar **erro** quando as
rondas da GolfGenius são todas de outro ano (antes dizia «não tem datas»).
Faltam as páginas das edições 2024 (U16 & U14) e 2023 (U18 Amateur). Conferir
uma entrada nova: o dia da semana do cabeçalho dos cartões («Tue, July 27») tem
de bater com o ano.

### Output enriquecido (refactor 2026-05-18)

`public/data/england_{slug}.json` (single division) ou `england_{slug}_div1.json`, `_div2.json`... (multi-divisão).

**Top-level:**
```json
{
  "tournament": "...", "slug": "...", "year": 2025, "section": "...",
  "gender": "M|F|null", "ageGroup": "U18|U16|U14|...", "category": "...",
  "course": "Luffenham Heath", "tee": "...",
  "source": "...", "gg_page": "...", "gg_league": "...",
  "rounds": 4,
  "par": [4,4,3,...],          // 18 valores do tee principal
  "si": [8,4,9,...],            // 18 stroke index
  "meters": [363,437,389,...],  // YARDAGES POR BURACO (yardages convertidas para metros)
  "parTotal": 70, "parF9": 35, "parB9": 35, "metersTotal": 6592,
  "courses": [                  // TODAS as configurações de tee (multi-tee)
    { "teeName": "", "courseName": "", "par": [...], "si": [...], "meters": [...], "parTotal": 70, "metersTotal": 6592 }
  ],
  "players": [...],
  "scrapedAt": "..."
}
```

**Cada player:**
```json
{
  "id": "2058156618",                  // player ID GolfGenius (único por linha)
  "memberIds": ["37343006"],           // member ID GG — único POR TORNEIO (não global!) — só serve para dedup dentro do mesmo torneio
  "eventId": "3854563",                // ID do evento (R1 stroke)
  "rank": 1,                            // data-rank cru (limpo, sem "T5")
  "pos": 1,                             // alias do rank
  "name": "Callixte Alzas",            // nome LIMPO (sem club concatenado)
  "country": "FR",                      // código flag-icon (FR, GB-ENG, GB-SCT, IT, DE...)
  "club": "Saint Cloud",
  "hcp": null,                          // SEMPRE null — confirmado que GG público não publica
  "toPar": -9,                          // novo campo
  "result": -9,                         // retro-compat
  "total": 271,
  "roundScores": [70,67,69,65],
  "division": "Carris Trophy",         // divisão principal
  "divisions": [                        // TODAS as divisões em que apareceu (cross-trofeu)
    "Carris Trophy",
    "Jean Case Memorial (Under 15's)",  // se U15 elegível
    "The Nations Cup"                    // se elegível
  ],
  "rounds": [
    {
      "day": 1, "scores": [4,5,4,...], "f9": 35, "b9": 35, "gross": 70,
      "teeColour": "Blue",              // extraído do header_row do detail page
      "gender": "Men",                  // "Men", "Boys", "Girls" etc.
      "courseName": "Luffenham Heath",
      "headerText": "Tue, July 22 Luffenham Heath - 3 - Archived on 08-07-2025 (Blue - Men)",
      "parPlayed": [4,4,3,...],         // par[18] do tee jogado
      "metersPlayed": [363,437,389,...],// METROS POR BURACO do tee jogado
      "parTotalPlayed": 70, "metersTotalPlayed": 6592
    }
  ]
}
```

### `data-*` attributes do `<tr>` da leaderboard (descobertos 2026-05-18 via Chrome live)

Cada linha de leaderboard real é `<tr class="aggregate-row">` com:
- `data-aggregate-id` → player ID GolfGenius (único por linha/divisão)
- `data-aggregate-name` → nome LIMPO (separado do clube — antes era misturado em string)
- `data-member-ids` → member ID GG **POR TORNEIO** (não cross-event). Confirmado empiricamente 2026-05-18: Callixte Alzas (FR) tem mid distinto em torneios diferentes (`28134152` vs `37343006`). Serve para dedup DENTRO de UM torneio (separar Carris Trophy / Hazards Salver / Nations Cup do mesmo evento, onde o player aparece em múltiplas divisões) mas NÃO para cross-ref entre torneios. Para cross-event matching usar `name + club` (heurístico).
- `data-rank` → posição limpa (independente de "T5"/"1" formatting)
- O `<a.favorite-star>` filho tem `data-event-id`

**⚠ Crítico:** filtrar SÓ `tr.aggregate-row` (ou `tr[data-aggregate-id]`). Iterar todos os `tr` que têm `a[href*=tournaments2/details]` pega ~30% de SUB-ROWS (net-score, etc.) sem data-* que ficariam com null e corromperiam o sort.

### Dedup por `memberId` — cross-trofeu

Uma pessoa pode aparecer múltiplas vezes na MESMA leaderboard porque é elegível para várias sub-tróficas:
- McGregor Trophy 2024: 144 jogadores principais. Dos U15, ~56 também são elegíveis para Jean Case Memorial (Under 15's). 9 internacionais elegíveis para Nations Cup. Total linhas: 144+56+9 = **209**.
- Sem dedup: leaderboard tem 209 linhas → 209 jogadores "consolidados" (com Leo Cahi 2×, Samuel Love 2× etc.)
- Com dedup por `memberId`: **144 jogadores únicos**, cada U15 com `divisions: ["McGregor Trophy", "Jean Case Memorial (Under 15's)", ...]` permitindo filtros tipo "🏆 elegíveis para Jean Case".

Estratégia: `playerLatestRecord` chaveado por `memberId || id`, preferindo o registo da divisão PRINCIPAL (heurística `isSubTrophy = /\b(memorial|salver|cup|series)\b/i`). `playerAllDivisions` acumula todas as divisões num Set.

### Tee colour por jogador (detail page)

O detail page `tournaments2/details/{id}` tem um `<tr class="header_row">` antes da `net-line` (scores hole-by-hole) com texto tipo:
```
Tue, July 22 Luffenham Heath - 3 - Archived on 08-07-2025 (Blue - Men)
```
O `(Blue - Men)` no fim identifica a tee jogada. Combinado com `courses[]` (que tem par/meters por tee), permite saber a yardage exacta jogada por cada divisão. Regex permissivo `\(([^()]{1,40})\)\s*$` split por ` - ` → `teeColour="Blue"`, `gender="Men"`.

**⚠ CORS subdomain:** quando o torneio vive num subdomínio `eg-*.golfgenius.com`, fazer `fetch` directo para `https://www.golfgenius.com/tournaments2/details/{id}` falha com `TypeError: Failed to fetch` (CORS). Solução: usar URL RELATIVA `/tournaments2/details/{id}` — fica same-origin com o iframe da league.

### O que GolfGenius PÚBLICO NÃO expõe

Confirmadíssimo via Chrome live em Carris 2025 (validado contra detail page do Callixte Alzas):
- ❌ HCP por jogador (não é coluna nem data-attribute em lado nenhum) — para o HI dos ingleses ver «HCP dos juniores ingleses» abaixo
- ❌ DOB / idade / ano de nascimento (a única classe "handicap-dots" no detail page é CSS, sem valor)
- ❌ Yards por shot/drive (só yards por buraco do tee — que já temos via course_analytics)
- ❌ Widgets adicionais úteis — `scoreboard`, `pairings`, `tee_times`, `handicaps`, `divisions`, `members` todos retornam HTTP 404. Só `tournament_results` e `course_analytics` respondem.

Idade está IMPLÍCITA pelo tier do torneio (Carris=U18, McGregor=U16, Reid=U14) ou pela divisão (Jean Case Memorial U15 dentro do McGregor).

### HCP dos juniores ingleses — `scrape-intelligentgolf-hcp.js` (02/11/2026)

A England Golf não publica handicaps (só a app **My England Golf / MyEG**, com conta; os «Friends» só se o outro aceitar). O que serve são os **opens de juniores dos clubes ingleses em intelligentgolf**: na lista de inscritos (`https://<clube>/competition.php?go=entrants&compid=N`) os sócios do clube que organiza aparecem com o **Handicap Index entre parênteses** («Joseph Thorne (1.1)»), os outros com o clube. Sem login, `fetch` simples.

- **O HI é o ACTUAL**, não o do dia da inscrição (os mesmos miúdos têm o mesmo valor em provas de Maio e de Setembro) → a lista é datada com o dia da leitura. Plus = «−» (convenção das hcp-listas).
- **Clubes:** `scripts/intelligentgolf-scope.json` (host + nome; acrescentar clubes aqui). Por clube: `competition2.php?time=future` + passadas por POST `ajaxaction=compsfilter` (20 a 20; a 1.ª página vem em `{actions:[{html}]}`, as seguintes em `{html}`). ⚠ O filtro `entrants=juniors` do site perde os opens marcados «Men & Ladies» (Goodwood) → pede-se `all` e filtra-se pelo nome (`eProvaJunior`, `scripts/lib/intelligentgolf.js`). ⚠ Provas deixadas «Competition in Progress» não aparecem em lista nenhuma → `provas` à mão no scope (Goodwood 2026, `compid=54977`).
- **Saída:** `public/data/hcp-listas/AAAA-MM_intelligentgolf.json` (um por mês, aditivo dentro do mês) → agregador (`util/hcp-listas.js`): ponto `entry-list` com `fonte: "intelligentgolf"` no `hcpHistory`; pill «🎯 HCP · Nov/26 · intelligentgolf» na ficha do kids2 e lista em `/kids2/listas`. Guardas da lista: `nascidosDesde` = ano − 18 e `soNomeExacto` (sem o passo do nome contido — «Ben Smith» ligava ao «Ben Cordwell-Smith» e «Daniel Roberts» a um adulto de 1993).
- **Só provas do ano corrente** (e as futuras já abertas) — as de anos anteriores não interessam (Mariana, 02/11/2026); `--desde` muda isso.
- **1.ª leitura (02/11/2026):** 15 clubes, 22 provas de 2026–27, 164 juniores com HI, 24 com ficha no kids2. Confere com outra fonte: Hector Dawson 3,1 na Entry List de Castro Marim (Out) → 2,0. Não são só os sócios do clube que organiza: o Joseph Thorne aparece com HI em Goodwood e em Hayling (mas o Mihir Pasura, de Moor Park, que também é intelligentgolf, aparece em Goodwood com o clube — a regra do site não é clara).
- **Alargado no mesmo dia (pedido dela, Reid Trophy):** clubes dos 71 britânicos do Reid Trophy 2026 e depois de todos os juniores britânicos dos `england_*.json`, testados em `<slug>.intelligentgolf.co.uk` → **274 clubes, 232 provas, 1140 juniores com HI, 159 com ficha**. Do Reid só 9 dos 71 (Bland −0,8, Young 1,4, Odell 2,2, Kapoor 2,5, McCallum 2,6, Luc Taylor 2,8, Hollingsworth 2,8, Lambly 3,3, Arthur Scott 5,2): os melhores raramente jogam opens de clube, e muitos clubes não têm opens de juniores públicos. Leitura ~30 min.
- **Página do jogador (`roundmgmt.php?playerid=N`):** o id sai dos links da página de resultados (`competition.php?compid=N`). Em ~1/3 dos clubes pede login; nos outros a maioria dos juniores é pública, mas o gráfico «Handicap Index History» (POST `roundmgmt.php` `action=graph&graph_type=handicap_index_history&playerid=N&period=ALL`) **só tem pontos para os sócios desse clube** (Benjamin Ward em Slinfold: 3 pontos, último 15/09/2026 → 3,5); visitantes vêm vazios. Dá histórico com datas, não miúdos novos — não ligado ao scraper.
- **Workflow:** `update-intelligentgolf.yml` (quarta 06:00 UTC).

### Circuitos dos condados — GolfGenius (`scrape-gg-condados.js`, 03/11/2026)

Os circuitos de juniores dos condados (e o PING Junior Golf Tour, nacional) estão no GolfGenius, num **«customer directory»**: `https://www.golfgenius.com/leagues/{L}/v2_customer_directories/{D}/fetch_initial_data_for_directories` (Accept JSON + `X-Requested-With`) dá a lista de provas, cada uma com `startDate` e `resultsPath` (`/pages/{id}`). ⚠ Vem **20 a 20** (`&page=2`…); ⚠ a **época** escolhe-se com `page_id` quando o directório mostra outra por omissão (PING: 2027 por omissão, 2026 com `page_id=13087065347968736764`). O link de partida está no site do condado (`golfgenius.com/ggid/xxxx` → 302 para o directório).

- **Handicap de jogo:** cada escalão tem duas classificações, «… Gross - U14» e «… Net(t) - U14». **Gross − Net = handicap de jogo do dia** (negativo = plus). Não é o HI (depende do CR/slope e da percentagem), mas é o número real mais recente de quem não tem HI público. Vai para `hcpJogo` no resultado → pill «🎯 HCP de jogo 3 · Out/26 · …» na ficha do kids2. ⚠ Isto corrige o «HCP por jogador não exposto» acima: não está numa coluna, mas sai da diferença.
- **Cartões, tee, distâncias, CR e slope:** pelo motor do `scrape-golfgenius-node.js` (`scrapeEdition` + `applyTeeCards`). ⚠ Provas de uma volta: o cartão de tee vem **sem data** → o `applyTeeCards` aceita-o quando a divisão só tem uma volta (antes ficava «sem cartão de tee utilizável»). SI não publicado.
- ⚠ **Jardas vs metros:** o rótulo da linha («Yardage»/«Meters», e o `metricUnits` do directório) **não diz a unidade verdadeira** — a Faldo Madeira diz «Yardage» e os valores são os metros oficiais da FPG (Serras-Machico brancas 5594 m, CR 71/137). Cada circuito confirma-se contra o cartão público de um campo e leva `jardas: true` no scope (BB&O: Thorney Park 5829 = 5790–5816 jd; PING: Melton Mowbray 5586 = 5586 jd; Cheshire: Delamere Forest 6542 ≈ 6440–6588 jd). ⚠ **Por rever:** o `reidtrophy_2026.json` tem 6198 «m» no Porters Park, que são jardas (6365 jd nas brancas; 6198 m seriam 6778 jd) — o mesmo deve valer para outras provas GolfGenius inglesas/americanas já gravadas.
- **Fora:** classificações de 9 buracos (PING 6–12 anos) e por pontos (Stableford — Welsh Junior Tour até U14), jogos de equipa, eventos de pais/scramble. Sexo: o da classificação → o do nome da prova → `sexoPorProva` no scope (só o que o organizador diz; BB&O Futures = rapazes). Sem nada, fica sem sexo.
- **1.ª leitura (03/11/2026):** BB&O 11 provas (Futures Tour + campeonatos; o Development Tour fica fora — 9 buracos/pitch & putt), PING Junior Golf Tour 29 provas, Cheshire 4 → **903 fichas do kids2 com provas destes circuitos, 492 novas; 30 já cruzaram com o Manuel e têm todos HCP de jogo** (Emile Cuanalo 3, Joshua Hockenhull −2, Tommy Gorman 9 — os dois últimos estavam «sem HCP publicado» na Faldo Madeira). ⚠ Nomes comuns («Jake Smith») podem juntar homónimos — o matcher é por nome + país.
- **Ids:** o id de membro GolfGenius muda de prova para prova (não serve de chave) → cada miúdo junta-se pelo nome + país, como as outras fontes GolfGenius.
- **Scope:** `scripts/gg-condados-scope.json` (circuito → directórios, filtro/excluir, `prefixo`, `jardas`). **Saída:** `public/data/gg-condados/{circuito}_{data}_{evento}.json` (JobFile; uma prova já lida não se relê, `--reler` força) → fonte `ggcondados` do agregador. **Workflow:** `update-gg-condados.yml` (segunda 05:30 UTC).
- **Outros directórios encontrados (03/11/2026), ainda não ligados:** Wales Golf / PING Welsh Junior Tour (`leagues/4838193446009203077/v2_customer_directories/9073329627044276676`, Stableford até U14); Oxfordshire Ladies CGA (sem resultados); provas soltas sem directório — Hampshire Junior County Championships (league `12375962031075929995`), Sussex (`scgu-*.golfgenius.com`, SDT Plus em Stableford), Herts Boys U16, Midland Golf Union (Notts, Warwickshire, Worcestershire), Norfolk Boys 2027 (`udyy3e`), Leics & Rutland Ladies Junior Girls. Sem GolfGenius: Surrey, Kent, Essex, Glos, Somerset, Devon, Cornwall, Dorset, Wilts, Staffs, Shropshire, Leics, Lincs, Northants, Cambs, Lancs, Derbyshire (intelligentgolf); Herts Futures/iTour (PDF); Scottish Golf e Irish Kids Golf Tour (nada); Golf Ireland usa o «Golf Hub» (só JavaScript).

### Limitações conhecidas — torneios que não passam

| Slug | Razão |
|---|---|
| `carris-trophy-2024`, `mcgregor-trophy-2023`, `english-girls-championship-2025` | "dropdown sem eventos" — England Golf arquivou e removeu os dados do GG |
| `english-girls-open-stroke-play-2023`, `junior-champion-club-2024`, `junior-champion-club-2025`, `england-u16-v-spain-u16-2025` | Iframe redirecciona para `campaigns/2261/run` (template homepage do England Golf), sem leaderboard real montada |
| `bronte-law-farnham-2026` | Idem — `campaigns/2263/run`. Tentados os DOIS ids (aterragem e "Results"). |
| `boys-county-finals-2025`, `boys-county-finals-2026` | **Match play entre condados** — o dropdown traz "Somerset vs Yorkshire", "Nottinghamshire vs Hampshire"… O `isStrokePlay` exclui match play **de propósito** (não há leaderboard individual para extrair). Não é falha do scraper nem da página. |
| `english-schools-team-2026`, `english-schools-scratch-team-2026` | Campeonatos por EQUIPAS (escolas) — "dropdown sem eventos" nos dois ids. |

Estes não são bugs do scraper. Confirmado via Chrome live: as páginas existem mas o iframe `tournament_results` nunca é carregado.

⚠ **Estas provas contam em `semDados`, NUNCA em `fail`** (2026-08-30) — e por isso
não fazem o cron ficar vermelho. Se contassem, o alarme tocava **todas as
semanas**, porque o catálogo tem provas permanentemente sem stroke play e porque
no início de cada época NENHUMA prova do ano tem ainda resultados. Um alarme que
toca sempre deixa de ser lido — que é, no fundo, como o England chegou a estar
três meses por scrapar. `fail` fica reservado a excepções (exit 1).

### Época de 2026 — o que ficou coberto

9 ficheiros / 8 provas (7 scrapadas a 2026-08-30, o Moor Allerton a 2026-09-07):

| Prova | Jogadores | Par |
|---|---|---|
| Carris Trophy (4 rondas) | 144 | 70 |
| Reid Trophy (3 rondas) | 144 | 70 |
| McGregor Trophy | 144 | 71 |
| English Girls' Open Stroke Play | 142 | 73 |
| English Girls' U16 & U14 (`_div1` + `_div2`) | 51 + 93 | 73 |
| Bronte Law — Royal Mid Surrey | 30 | 73 |
| Bronte Law — Edgbaston | 27 | 72 |
| Bronte Law — Moor Allerton | 34 | 73 |

Todas entram no canónico do kids2 (agregador: 30296 juniores · 20898 torneios,
9/9 sanity checks, Manuel×Dmitrii = 7 mantido).

### Bugs históricos resolvidos (2026-05-18)

Cadeia de 5 bugs que tornaram o output incrivelmente pobre durante várias iterações:
1. Iterator pegava 214 trs (sub-rows com link mas sem data-*) → fix com filtro `tr.aggregate-row, tr[data-aggregate-id]`
2. `eventPlayers.map()` em `scrapeOne` jogava fora memberIds/eventId/rank antes de chegar ao consolidate → fix mapeando explicitamente
3. `playerLatestRecord` no consolidate também não propagava → fix mapeando explicitamente
4. Refactor do dedup REVERTEU o fix #3 → re-aplicado (lição: editar funções monolíticas é frágil, validar sempre via output)
5. `transformToBjgtPerDivision` (que é onde o output JSON é montado) também ignorava os campos novos → fix mapeando + adicionando `divisions[]`, `meters[18]` top-level, `courses[]` multi-tee, e por ronda `teeColour`/`gender`/`parPlayed`/`metersPlayed`

Diagnóstico que desempatou: adicionar `[debug-lb-out]` no `scrapeOne` para imprimir `lb.players[0]` recém-saído de `fetchLeaderboard`, comparar com `[debug-consolidate]` impresso a partir do `playerLatestRecord`. Mostrou que os campos sumiam ENTRE os dois pontos (no `eventPlayers.map`).

**Página `/england`** — `src/pages/EnglandGolfPage.tsx`. Duplicação da BJGTPage com array `URLS` construído **dinamicamente** a partir do catálogo (não hardcoded). Carrega `england-golf-catalog.json` em runtime, tenta `england_{slug}.json` para cada entry, e auto-selecciona o torneio onde o Manuel jogou (ou o primeiro com dados). Sidebar agrupa por ano, tabs de escalão dentro do ano.

**Séries cobertas (Sub-10 a Sub-18, Boys + Girls, desde 2023):** Carris Trophy (U18 boys), McGregor Trophy (U16 boys), Reid Trophy (U14 boys), English U18 Amateur (mixed), English Girls' Open Stroke Play / Championship, English Girls' U16 & U14, Justin Rose Telegraph Junior, Bronte Law Junior Series (várias paragens), England U16 v Spain U16, Boys' County Finals, English Junior Champion Club.
