# MAJOR — BJGT/Doral e campeonatos juvenis internacionais (GolfGenius, GolfBox)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Scripts — BJGT / WJGC / EOWAGR / Doral

> ⛔ Os ficheiros BJGT / WJGC / EOWAGR / FCG / JWGC (`brjgt*_*`, `wjgc_*`,
> `eowagr*`, `fcg*`, `jwgc*`) são **históricos** e já não são actualizados —
> os scrapers antigos ainda estão em `scripts/` mas **não se correm** desde
> 2026-07-09. Continuam a ser lidos pela
> `/major` e pelo agregador.

Se um ficheiro destes for acrescentado à mão: copiar o JSON para `public/data/`, registar em `dataRegistry.ts` e garantir que o adapter do agregador (`scripts/aggregator/sources/wjgc.js`) o lê → `node scripts/aggregator/index.js` (o `KIDSdataLoader` já não tem lista de ficheiros; lê o canónico).

**scrape-golfgenius.js** — Doral (First Tee Miami). v2: fix coluna "total", B8-9 suporta 9H back-9.
```bash
node scripts/scrape-golfgenius.js                    # 2025 (URL default)
node scripts/scrape-golfgenius.js ftm_doral_2024.json https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994
```

---

## Scripts — MAJOR: campeonatos juvenis internacionais (2026-07-03)

> **⚡ Catálogo + lazy load (2026-07-06)** — a `/major` deixou de pedir ~127
> ficheiros (~14.6 MB, incl. ~48 pedidos 404 por adivinhar anos) no arranque.
> Agora pede SÓ `public/data/major-catalog.json` (~160 KB em Set 2026 — ~50 KB quando foi criado; gerado por
> `scripts/build-major-catalog.js`): a lista lateral sai desse índice (name,
> campo, datas, nº jog/esc/rondas, hasManuel/hasPt) e o detalhe de cada torneio
> (scorecards) carrega **lazy** ao clicar, via `loadDivisions` no `CircuitShell`
> (que já suportava + cacheia — mesmo padrão do FFG/England). Os builders eager
> (`buildMajorEntries`/`buildJobEntries`/`buildFmEntries`/`buildGgJobEntries`)
> **mantêm-se** — o `loadDivisions` reusa-os por-fonte, dando-lhes só a fatia
> mínima: bjgt/eowagr → ano + irmão 2025↔2026 (evo `bjgtEvoFor`); doral → todos
> os anos ≤ seleccionado (evo multi-ano `doralEvoFor`); gg-job → [ano-1, ano]
> (evo `jobEvoFor`). O `veteranIndex` (toggle ✦ Veteranos) vem pré-calculado no
> catálogo (o shell não tem os jogadores em memória no modo lazy).
>
> ⚠ Correr `node scripts/build-major-catalog.js` sempre que um ficheiro de dados
> MAJOR muda. Automatizado em `build-major-catalog.yml` (push nos ficheiros
> de dados de todas as fontes MAJOR — brjgt/eowagr/ftm_doral/orangebowl/ftm_fm,
> as JobFile GolfGenius e GolfBox (fsga/uajt/uaworlds/mexnacional/coc/reidtrophy/
> optimist/icopa/interzonas/avtrophy/ebtc2/egtc/elg/eatc/eatc2/eym/ejo/ejt) e
> fcg/jwgc — + o próprio script). As regras de metadata do script **espelham** os
> builders da `MajorPage.tsx` — se um builder mudar name/playerCount/etc., alinhar
> o script.
>
> **`vetKey` (2026-07-24)** — o `veteranIndex` (toggle ✦ Veteranos) e a tab de
> internacionalizações usam agora `vetKey` (`src/utils/normName.ts`): `normName`
> + vírgulas removidas + **tokens ordenados alfabeticamente**, para "Apelido, Nome"
> (Doral) e "Nome Apelido" (Future Masters/GolfGenius) darem a MESMA chave — antes
> a mesma pessoa contava 2× (o Axel Monssoh saltou de 8→15 presenças). O
> `build-major-catalog.js` espelha o `vetKey`; o `CircuitShell` faz o lookup com o
> mesmo; o `normNameVet` da RFEGPage passou a reexportar o `vetKey` partilhado.
>
> **`major-veterans.json` + tab "✈️ Internacionalizações" (2026-07-24)** — o mesmo
> `build-major-catalog.js` emite um 2º ficheiro (`public/data/major-veterans.json`,
> ~1,3 MB em Set 2026, jogadores com ≥2 torneios: nome, país dominante, flags pt/usa, nº
> torneios/anos/circuitos, séries e lista de entradas). A tab (menu ⓘ Info da
> /major, `src/pages/major/MajorVeteransView.tsx`) carrega-o **lazy** e mostra um
> ranking ordenável com filtros (procura, circuito, mín. torneios, 🇵🇹 Só PT,
> 🚫🇺🇸 Esconder EUA); cada linha expande para os torneios do jogador com link
> para `/major`. O `build-major-catalog.yml` committa ambos os ficheiros.

Fonte única `/major` cresceu com campeonatos juvenis mundiais/nacionais. Dois
formatos de output e dois caminhos de scrape:

| Torneio | Plataforma | URL | Scraper | Output | Estado |
|---|---|---|---|---|---|
| **FSGA — 72nd Boys' Junior Championship** | GolfGenius (v2tid) | `v2tournaments/4708880` + `4739657` | `scrape-fsga.js` | `fsga_2026.json` (JobFile, 2 divisões) | ✅ ligado a `/major` (source `fsga`) |
| **Under Armour — Summer National Championship** | GolfGenius (pages) | `pages/12770450567004716088` | **`scrape-golfgenius-node.js`** (Node-puro) | `uajt_2026.json` (JobFile, 10 divisões) | ✅ ligado (source `uajt`) |
| **México — Campeonato Nacional Infantil Juvenil (LXXV)** | GolfGenius (multi-liga) | `pages/5989156` (hub JS) | **`scrape-golfgenius-node.js --v2tids`** | `mexnacional_2026.json` (JobFile, 12 divisões) | ✅ ligado (source `mexnacional`) |
| **México — Copa Bobby Díaz (7-15)** | GolfGenius | `pages/5666137` (liga 502696) | `scrape-golfgenius-node.js --v2tids` | `icopa_2025.json` (4 divisões c/ jogadores) | ✅ ligado (source `icopa`) |
| **México — Nacional Interzonas Lorena Ochoa (LXV)** | GolfGenius | `pages/5897587` + v2tid `4619271` INDIVIDUAL GENERAL | `scrape-golfgenius-node.js --v2tids "Individual General=4619271"` | `interzonas_2026.json` | ✅ ligado (source `interzonas`) — tem o Andres Marcos Cantu |
| **'Champion of Champions' World Championship** | GolfGenius (pages) | `pages/12114827382448210411` (2026) | **`scrape-golfgenius-node.js --scope`** | `coc_{2023,2024,2025,2026}.json` (JobFile, 8-10 divisões) | ✅ ligado (source `coc`) — cron `update-golfgenius.yml` |
| **Optimist International Junior Championships** (600+/ano, 25+ países; PGA National→Trump Doral) | GolfGenius (microsites `tndm-*`) | 3 FASES/ano por escalões (P1 = Boys 10-11/12-13 + Girls 10-12 ⭐ universo do Manuel; P2 = 14-15/13-14; P3 = 16-18/15-18) — URLs por fase em `golfgenius-scope.json` | **`scrape-golfgenius-node.js --scope`** (país+gradYear do roster "Players"; `stop` = nº da fase) | `optimist{1..3}_{2023..2026}.json` (JobFile; ids `optimist:{ano}:{fase}` como o ejt) | ✅ ligado (source `optimist`, 2026-08-06) — cron `update-golfgenius.yml`. ⚠ `optimist3_2023` é vista agregada sem divisões (o GG de 2023 não tem select — fica 1 flight). ⚠ o site ShotStat (optimist.shotstat.com) só tem o Tournament of Champions, NÃO o International |
| **The Amundi Evian Juniors Cup** (Evian Resort, França; Sub-14 M+F por seleções) | GolfGenius (microsite francês) | `pages/13066045314769662975` (Classement) + `pages/13066045313830138878` (Départs) | **`scrape-golfgenius-node.js --scope`** (slug `evianjc`) | `evianjc_{2022..2026}.json` (JobFile, Boys/Girls, HCP) | ✅ ligado (source `evianjc`, `preField`, 2026-09-21) — ver secção abaixo |
| **Belgian International U14 — Albert Vermeiren Trophy** | GolfBox | `scores.golfbox.dk` comp `5388972` | `scrape-golfbox.js` | `avtrophy_2026.json` (JobFile, CR/Slope+HCP) | ✅ ligado (source `avtrophy`) |
| **Estonian Junior Open** (Estonian Golf Association; o campeonato nacional EMV corre DENTRO do Open) | GolfBox | comp 2026 `5417057` (2025 `4931278`, 2024 `4393974`, … até 2013 — ver golf.ee/voistlused/estonian-junior-open) | `scrape-golfbox.js` (`classRe` no scope filtra as classes sobrepostas EMV/combinadas) | `ejo_{2019..2026}.json` (JobFile, 10 divisões Boys/Girls U12-U21 — 9 em 2019, CR/Slope+HCP+birthYear 100%) | ✅ ligado (source `ejo`, `showAges: true` → coluna IDADE) — 2026 no scope do cron |
| **Estonian Junior Tour** (circuito EGA estónio, 5-7 etapas/ano U9-U21 + o EJO como major do circuito) | GolfBox | comps 2026: `5417113` (EGCC, 1 Jun) · `5417123` (White Beach, 29 Jun) · `5417127` (Rae, 21 Jul) · `5417128` (Saaremaa, 11 Ago) · `5417129` (Otepää, 19 Ago) · `5417080` (FINAL Pärnu Bay, 24-25 Ago). **Histórico 2021-2025 (34 provas)**: IDs descobertos via `OrderOfMeritsHandler/GetOrderOfMerit/OrderOfMeritId/{id}` (os OoMs por categoria listam as provas da época; IDs dos OoMs na página golf.ee/voistlused/estonian-junior-tour) | `scrape-golfbox.js` — **1º circuito MULTI-EVENTO/ano**: 1 ficheiro por etapa, `stop` no scope → id `ejt:{ano}:{n}` (catálogo + MajorPage, range 1-8); `classRe` filtra as vistas HCP-Stroke/Scratch (e as LAT de 2023 — jogadores letões confirmados presentes nas classes por escalão) | `ejt{1..7}_{2021..2026}.json` (JobFile, 8 divisões Boys/Girls U9-U21) | ✅ ligado (source `ejt`, showAges) — 6 etapas 2026 no scope do cron (futuras dormentes até terem scores); histórico scrapeado ad-hoc (não está no scope — nunca muda); tab "Época" (`seasonKey`) junta as etapas do ano, "Edições anteriores" compara a MESMA etapa entre anos |
| **EGA — European Boys' Team Championship, Div. 2** | GolfBox | `ega-golf.ch/…#/competition/5731554/leaderboard` | `scrape-golfbox.js` | `ebtc2_2026.json` (JobFile) | ✅ ligado (source `ebtc2`) — começa 7 Jul 2026 |
| **EGA — European Girls' Team Championship (U18)** | GolfBox | `ega-golf.ch/…#/competition/5478100/` | `scrape-golfbox.js` | `egtc_2026.json` (JobFile) | ✅ ligado (source `egtc`) — U18, GCC Zürich; começa 7 Jul 2026 |
| **FCG Callaway World Championship** | — | — | scraper antigo (⛔ não correr) | `fcg251_*` (2025) + `fcg268_{cat}.json` (2026; formato BJGT) | ⛔ histórico — não é actualizado desde 2026-07-09 |
| **Uswing Mojing Junior World (JWGC)** | — | — | scraper antigo (⛔ não correr) | `jwgc261_{cat}.json` (formato BJGT) | ⛔ idem |

### GolfBox (`scores.golfbox.dk`) — EGA European Team Championships + avtrophy

Sites tipo `ega-golf.ch` (Drupal) embutem o leaderboard GolfBox
(`scores.golfbox.dk/api/js/leaderboard/competitionid/{id}/template/ega`). O
`scrape-golfbox.js` (Node-puro, JSONP público, **sem cookies**) lê a competição
pelo `competitionId` e escreve um JobFile `{slug}_{ano}.json` — mesmo formato dos
GolfGenius, com CR/Slope + HCP + ano de nascimento (`showRatings: true` na
`MajorPage`). Usa a `PlayerClass` "Individual" (ignora a `TeamClass`) → leaderboard
individual, com o `team` de cada jogador guardado.

**Inscritos + DOB completa (`entries: true` no scope / `--entries`, 2026-08-05):**
`PlayersHandler/GetPlayers/CompetitionId/{id}` responde para provas passadas E
futuras (medido 2021→2026) e traz o que o leaderboard não tem: **DOB completa**
(o leaderboard só dá o ano), clube e HCP (formato ×10000; `EntryStatus` 0 =
inscrito, 1 = jogou — muda quando a prova acontece; `Entries` vive DENTRO de
`Classes.C{id}`, não no top-level). O scraper usa-o para (1) enriquecer os
jogadores do leaderboard com `dob`/clube → matching FORTE nome+DOB no agregador
(ejo/ejt, como o fcg), e (2) em provas FUTURAS (leaderboard vazio) semear a
divisão com o ROSTER de inscritos (0 voltas) — o `util/jobfile.js` tem uma
guarda que NÃO os transforma em participações, e o catálogo MAJOR ignora-os
(sem scores). O kids2 `/next-t` consome esses rosters via `JOBFILE_INTL`
(FieldRivaisDashboard) — etapas EJT futuras aparecem com o field inscrito.

**Automação:** as competições vivem em `scripts/golfbox-scope.json`; o
`update-golfbox.yml` (cron diário 21:00 UTC + `workflow_dispatch`) scrapa TODO o
scope, regenera juniores + **`major-catalog.json`** e committa. Adicionar um evento
= 1 entrada no scope (`competitionId`/`slug`/`name`) + ligar a fonte na `MajorPage`
(`sourceColors`/`sourceLabels`/`GG_JOB_LOADERS`), no `build-major-catalog.js`
(`GG_SOURCES`) e nos paths do `build-major-catalog.yml`. Eventos futuros (sem campo/
scores ainda) são **saltados** pelo catálogo até terem jogadores — aparecem sozinhos
quando o cron os apanha.

⚠ **O GolfGenius devolve 403 a browsers automatizados** (Playwright headless *e*
o Chrome do utilizador em modo automação) **mas responde a `fetch` puro.** Por
isso o `scrape-junior-orange-bowl.js` (Playwright) parte-se nestes eventos (UA
deu "browser closed"; a hub JS do México deu "0 tids"). **A via correcta é
Node-puro** via `scrape-golfgenius-node.js` (descoberta pela API v2tournaments) —
corre em qualquer lado, sem browser.

### scrape-fsga.js — GolfGenius Node-puro (v2tid, sem Playwright)
Já ligado. Deriva o **par por buraco dos marcadores** (birdie=círculo,
bogey=quadrado…) porque a FSGA não expõe `leagueId` no domínio público (portal
SPA + fsga.org atrás de Cloudflare) → sem `course_analytics` (metros/SI ficam
`null`). Multi-campo: **R1 Roost, R2/R3 Karoo** (par hole-by-hole diferente,
ambos 72) → cada ronda leva o seu `pars[18]` (consenso por campo). Divisões via
`EDITIONS[].divisions[{label,v2tid}]` (Overall 4708880 + 13-15 4739657); um
jogador pode aparecer nas duas (cross-divisão, como no England Golf).
```bash
node scripts/scrape-fsga.js                 # EDITIONS (72nd Boys' Junior)
node scripts/scrape-fsga.js 4708880 4739657 # v2tids ad-hoc (uma edição, várias divisões)
```
Wiring: entrada `fsga` em `GG_JOB_LOADERS` (`MajorPage.tsx`), construída por
`buildGgJobEntries`; os anos vêm do `major-catalog.json`. `jobDivisionToTournament` ganhou suporte a `pars` por
ronda (retrocompatível — FM/JOB sem `pars` usam o par da divisão).

### scrape-golfgenius-node.js — GolfGenius genérico Node-puro (pages/v2tids) ⭐
**A via preferida para eventos GolfGenius multi-divisão** (UA, México). Sem
Playwright — usa a API v2tournaments (mesmo motor que o `scrape-fsga.js`, que
reexporta `scrapeEdition`/`ggGet`/`courseNamesLabel`). Descoberta:
`/pages/{id}` → `leagueId` → `/leagues/{lid}/widgets/tournament_results?page_id={id}`
(o `<select name="round">` lista `(divisão × ronda)`) → escolhe a vista agregada
("Final Round" = todas as rondas) de cada divisão → `&round={optVal}` devolve o
**v2tid dessa divisão** (leaderboard multi-ronda). Depois: leaderboard +
scorecards + par por buraco dos marcadores (como FSGA).
```bash
node scripts/scrape-golfgenius-node.js "https://www.golfgenius.com/pages/12770450567004716088"  # UA → uajt_2026.json (10 divisões auto)
node scripts/scrape-golfgenius-node.js <url> --league 528939       # página 100% JS sem leagueId no HTML
node scripts/scrape-golfgenius-node.js <url> --skip-scorecards     # só leaderboards (rápido)
```
**Slug/nome**: `SLUG_OVERRIDES` (UA→`uajt`, "infantil juvenil"→`mexnacional`,
"champion of champions"→`coc`) ou `--slug/--name/--year`. Output
`{slug}_{ano}.json` (JobFile).

**Modo `--scope` (cron, 2026-07-23):** `--scope scripts/golfgenius-scope.json`
corre uma lista de eventos (`{url|v2tids, slug, name, year, league, country,
skipScorecards, profiles, disabled, rosterPage, stop}`); `--slug X` filtra a um.
`stop` (2026-08-06) = nº de etapa/fase para eventos multi-ficheiro por ano
(Optimist Phase 1-3) — vai para o JobFile e dá ids `{source}:{ano}:{stop}`
como o ejt. O `fetchRoster` aceita tanto "Handle|Home Club|Country" (England)
como "Last Name|First Name|Graduation Year|Country" (Optimist — junta
First+Last e guarda `gradYear`, que o agregador converte em dobRange de 2 anos
via `dobRangeFromGrad`); a página de roster é auto-descoberta pelo link de nav
"List of Players" OU "Players". ⚠ inferCountry é case-insensitive (o roster
Optimist escreve "UNITED STATES OF AMERICA" em caixa alta). O ficheiro só é
reescrito quando o conteúdo muda (comparação ignorando o `scrapedAt`) → **exit
0** = houve novidades, **2** = nada novo (não é erro), **1** = tudo falhou.
Workflow: `update-golfgenius.yml` (diário 22:00 UTC), que a seguir regenera o
agregador de juniores + o `major-catalog.json` e committa. `--country none`
desliga o país por defeito "US" (ver CoC abaixo).

**Tee sheets = draws REAIS (2026-07-23).** ⚠ O widget dos tee sheets chama-se
**`next_round`** — `tee_times`, `pairings`, `tee_sheet` e `tee_sheets` dão todos
404. A página é descoberta sozinha: o HTML da página de resultados anuncia-a num
input escondido `tee_sheet_button` (⚠ que em edições antigas vem VAZIO apesar de
a página existir — CoC 2024 — daí o fallback pelo link "Tee Sheets" da nav). O `<select>` do widget lista as rondas
(`&round_id=…`) e cada uma traz a tabela `by_tee_times_table` com pares
(hora, jogadores); cada jogador leva a afiliação **e a divisão**, que é o que
permite dar a cada escalão o seu draw (um flight pode juntar escalões — o grupo
entra no draw de todos os que estão nele). Vai para `divisions[].draws` do
JobFile, que a `MajorPage` já converte para as abas Draw R1/R2/R3.
Sem isto o `TournamentDetail` só mostrava draws **estimados** do acumulado
(`synthesizeDrawFromCumulative`) — e nunca para a R1, que não tem ronda anterior
de onde inferir. `--skip-tee-sheets` desliga.

**Merge ADITIVO (default, `--no-merge` desliga):** re-scrapar uma prova a
decorrer apanha jogadores a meio da volta e devolveria MENOS buracos do que já
temos guardado. Antes de escrever, cada volta é casada com a de disco **pela
DATA** (não pelo índice — quem falta a uma ronda desalinha os dias) e fica a que
tem **mais buracos**; voltas que só existem em disco são mantidas. Posição,
total e ±par vêm sempre do scrape novo (autoritativo). Assim pode-se correr o
scraper as vezes que se quiser durante a prova sem perder nada.

⚠ **México é multi-LIGA** (uma liga por categoria de idade, cada uma com Varonil
+ Femenil; a hub `pages/5989156` é 100% JS sem leagueId). Não dá para descobrir
por 1 página → passa-se a lista curada de v2tids com labels (2026, ligas
528936-528949, excluir Scramble/Nassau/Prueba):
```bash
node scripts/scrape-golfgenius-node.js --slug mexnacional --year 2026 --country MX \
  --name "Campeonato Nacional Infantil Juvenil (México)" \
  --v2tids "Varonil 18=4582829,Femenil 18=4582833,Varonil 15=4582863,Femenil 15=4582876,Varonil 12-13=4582867,Femenil 12-13=4582880,Varonil 10-11=4582871,Femenil 10-11=4582884,Varonil 8-9=4582898,Femenil 8-9=4582906,Varonil 7=4582894,Femenil 7=4582902"
```
`--country MX` corrige o país: o `inferCountry` do motor cai em "US" quando a
afiliação é só um clube (sem país) → força "MX" nesses. Para reencontrar as
ligas/v2tids doutro ano: varrer o range de `leagueId` à volta da liga "18 y
menores" e ficar com os v2 cujo `event.name` bate `/VARONIL|FEMENIL/` (excluir
Scramble/Nassau/Prueba). O `discoverDivisions` (modo pages, ex: UA) já **exclui
side events** (`isSideEvent`: Adult/Par 3/Scramble/Nassau/Prueba) e **ordena** as
divisões Boys→Girls, idade crescente.

### scrape-junior-orange-bowl.js — GolfGenius genérico (pages, Playwright, LEGADO p/ multi-divisão)
Serve o JOB/World Junior Girls (páginas simples). Tem UA + México no `EDITIONS` +
`SLUG_OVERRIDES` (incl. `romanToInt` para "LXXV"=75 → 2026) **mas parte-se em
eventos multi-divisão** (GG 403 ao browser / hub JS) — usar o
`scrape-golfgenius-node.js` para esses. Mantido para o JOB clássico:
```bash
node scripts/scrape-junior-orange-bowl.js   # EDITIONS (JOB + World Junior Girls)
```

### Ficheiros FCG / JWGC (históricos, sem scraper)

1 JSON por escalão (`{evSlug}_{cat}.json`, ex: `fcg268_boys_10-11.json`), no
formato dos BJGT (`{tournament,category,course,year,par,si,yards,parTotal,
players:[{name,country,pos,result,total,rounds:[{day,scores,f9,b9,gross}]}]}`) —
o mesmo dos `wjgc_*`/`brjgt*_*`. Ligar ao `/major` = registar no array `URLS`
(`BJGTPage.tsx`) com série/escalão/ano, como os BJGT/EOWAGR. Registados:
`fcg251_*` (2025), `fcg268_*` (2026, 10 escalões, 13-15 Jul) e `jwgc261_*`.

⚠ **Localidade FCG/JWGC é preenchida pelo inscrito e vem suja** — resolvida pelo
`splitGradYearCountry` (`scripts/lib/*-location.js`). O campo "país" do perfil é `"CLASSE, LOCAL"` e o
LOCAL trazia (1) cidade estrangeira + sigla de estado dos EUA — "Bangkok, CA",
"Hong Kong, FL", "Mexico City, NM" → bandeira americana errada; (2) só a cidade
— "Auckland", "Tokyo", "宇都宮" → sem bandeira. Resolução por confiança:
**(a)** um segmento é um país (também colado no fim: "Cap Cana Dominican
Republic") → **(b)** dicionário de cidades, onde as inequívocas (`strong`)
GANHAM à sigla de estado e as ambíguas (London, Melbourne, Panama City,
Ontario, La Canada — todas com gémea nos EUA) só valem sem sigla → **(c)** sigla
→ EUA/Canadá (territórios GU/MP/PR/VI/AS com bandeira própria). Quando o país
resolvido não é EUA/Canadá a sigla é lixo e sai do `hometown` mostrado.
Tem testes ao lado (`*-location.test.js`).

O script de backfill de localidades (`scripts/backfill-*-location.js [--dry-run]`)
aplica a resolução aos `fcg*`/`jwgc*` já guardados (não há re-scrape possível;
a string original é reconstruída do `hometown`/`country` guardados). É
idempotente por uma guarda que salta jogadores cujo país já está resolvido — sem
ela a 2ª passagem re-derivava de um `hometown` já limpo ("Tamuning" sem ", GU")
e perdia o país. Passagem 2026-07-19: 552 jogadores corrigidos; ficam ~28
localidades genuinamente ambíguas (Santiago, San Jose, Victoria, Milton…) sem
país — de propósito, mostram só o texto da cidade.

### Tab "Edições anteriores" na `/major` (2026-07-23)

Última tab da barra de cada escalão (a seguir a Resumo/📋 Scorecards/Match
Play): uma coluna por EDIÇÃO do mesmo torneio+escalão, linhas = posição,
células = nome · total · ±par · pancadas de cada ronda. É o equivalente à tab
`scores` do `/kids2/next-t` (`HistoricTopNTable`), que só serve o mundo USKids
(lê `uskids-member-history-slim.json` + `autoRivals`) — daí um componente
próprio, `src/ui/circuit/PastEditionsTable.tsx`. Responde a "que score foi
preciso para ganhar / entrar no top-10 neste escalão ao longo dos anos".

Funciona em **TODAS** as fontes do MAJOR porque o `CircuitShell` monta o
`CircuitPastEditionsTab` (`src/ui/circuit/pastEditions.tsx`) a partir do
`editionKey` do config e carrega cada edição por `entry.loadDivisions` — na
MAJOR, o **`loadDivisionsFor`**, o mesmo loader que abre um torneio — em vez de
ler os JobFiles directamente. Anos vêm do `major-catalog.json`; tudo lazy (só ao
abrir a tab) e cacheado. O `isFullRound` vive em `pastEditions.tsx`.

Duas vias de injecção, conforme a divisão:
- **`renderFull`** (JOB, FM e as JobFile GolfGenius/GolfBox) → `extraTabs` do
  `TournamentDetail`;
- **render por secções do shell** (BJGT/EOWAGR/FCG/JWGC, Doral) → o
  `CircuitShell` acrescenta a tab aos `trailingTabs` quando o config define
  `editionKey` (o `pastEditionsTab` do `CircuitConfig` ficou como fallback legado).

⚠ **Ordenar por total põe quem NÃO acabou em 1º** — 2 voltas somam menos que 3
(168 < 205) e um WD aparecia como campeão; num caso real o vencedor (205, −11)
caía para 89º atrás de 88 desistências. A chave é **voltas completas** desc,
depois voltas com gross, e só então o total. "Volta completa" distingue os dois
motivos para um cartão ter buracos em branco: se o gross é MAIOR que a soma dos
buracos visíveis, o cartão é que está truncado na fonte (conta como completa);
se é IGUAL, a volta está a decorrer (não conta) — ver `isFullRound`. Os totais
de quem não acabou aparecem em itálico esbatido.

⚠ **O match de escalão entre edições exige o mesmo FORMATO de nome.** Só idade
±1 não chega: no Future Masters casava "10 and Under" com "11 & 12". A regra é
sexo igual + o nome sem dígitos igual ("Under 15 Girls"→"under girls" bate com
"Under 14 Girls"; "10 and Under"→"and under" não bate com "11 & 12").

⚠ **Destaque Manuel/PT é por CÉLULA** (`td.cell-manuel` / `td.cell-portuguese`
no `App.css`, mesmas cores das regras `.row-*`): cada coluna é um torneio
diferente, logo a linha tem jogadores distintos e `.row-manuel` pintaria a linha
toda. Nunca inventar tokens novos aqui — a 1ª versão usava
`var(--bg-manuel, …)`, token inexistente, e ficava com o fallback hardcoded
(cores diferentes do resto da app).

### Deep-link de abas (`?tab=…`) unificado — 2026-07-23

O `TournamentDetail` já sincronizava a aba com o URL; o `IntlTournView` (a barra
das páginas assentes no `CircuitShell` — MAJOR BJGT/Doral, RFEG, FFG, England,
GJGL, Drive) tinha a aba só em estado local, por isso `?tab=…` não abria nada
lá. Agora cada aba do `IntlTournView` tem uma `key` com o MESMO vocabulário
(`admissions` · `draw:N` · `round:I` · `precut` · `resumo` · `scorecards` +
a chave das leading/trailing tabs) e o `CircuitShell` liga-a ao `?tab=` via
`useSearchParams` (escrita com `replace` para não encher o histórico). O URL
manda enquanto apontar para uma aba existente; caso contrário mantém-se a
escolha automática (Resumo).

### ⚠ Campo hardcoded na família BJGT (corrigido 2026-07-23)

O `tDataToTournament` (`BJGTPage.tsx`) fixava o campo em "Villa Padierna —
Flamingos"/"— Alferini", com uma excepção para o EOWAGR. Quando o **FCG** e o
**JWGC** entraram nesta família (mesmo formato de ficheiro) herdaram o hardcode: o FCG
Callaway World Championship aparecia a jogar-se em Villa Padierna em vez de
Desert Willow. Os ficheiros BJGT/WJGC trazem `course: "Villa Padierna"` sem o
percurso e o EOWAGR vem vazio — daí os hardcodes serem úteis — mas fcg/jwgc
trazem o campo certo, por isso agora só bjgt/eowagr usam o valor fixo e as
restantes séries usam `data.course`.

### 'Champion of Champions' World Championship (`coc`) — 2026-07-23

Convite mundial de campeões nacionais juvenis no **Lough Erne Resort** (Irlanda
do Norte), 3 voltas nos campos **Faldo (par 72)** e **Castle Hume (par 71)**;
~250 miúdos de 40+ países, escalões **Under 7/9/12/14/15/19 Boys+Girls** (o
Under 9 e o Under 7 jogam **27 buracos = 3×9**). Ficheiros
`coc_{2023,2024,2025,2026}.json`, source `coc` na `/major`.

⚠ **Os subdomínios `coc20…coc26.golfgenius.com` NÃO são um por ano** — só o
`coc26` existe (os outros caem em `golfgenius.com`), e qualquer um deles serve a
mesma página se lhe dermos o id. As edições anteriores vivem noutras ligas, com
o prefixo **`mpg-coc{YY}`** (MG Pro Golf, o organizador) — descobertas pelo CDX
do Wayback Machine, porque o site oficial (`championofchampions.co`) só linka a
edição em curso e, das passadas, publica apenas o campeão de cada escalão:

| Ano | Página de resultados | Como se chega lá |
|---|---|---|
| 2026 | `pages/12114827382448210411` | `coc26.golfgenius.com` |
| 2025 | `pages/10999123520230801498` | `mpg-coc25.golfgenius.com` |
| 2024 | `pages/10007590223342485762` | `mpg-coc24.golfgenius.com` ou `ggid/coc24` |
| 2023 | `pages/8989257390612300246`  | `ggid/cocwc23` |

2020-2022 **não estão no GolfGenius** (o torneio nasceu em 2020 em Powerscourt).

Quatro armadilhas resolvidas neste evento — todas no motor partilhado
(`scrape-fsga.js`), por isso valem para qualquer fonte GolfGenius:
1. **Uma vista, várias divisões.** O `<select name="round">` só muda de RONDA e
   o widget traz os 8-10 escalões empilhados. O agrupamento por label descobria
   "Round 1/2/3" em vez de divisões → `discoverDivisions` detecta labels que só
   nomeiam a ronda e passa a tratar **cada v2tid do widget** como uma divisão,
   com o label vindo do `event.name` ("54 Hole World Championship - Under 12
   Boys" → "Under 12 Boys").
2. **Rondas fora de ordem.** Com o evento a decorrer o GG devolve a ronda em
   curso PRIMEIRO (medido: R3, R1, R2) → a R1 ficava com o gross da ronda por
   jogar e o dia 1 saía a zero. `sortRounds()` reordena pela data de `ev.rounds`.
3. **Outro vocabulário de marcadores.** As células são `par-hole` /
   `birdie-hole` / `eagle-hole` / `plusN-hole` (não os `circle`/`square` do
   FSGA) → sem isso TODA a célula contava como par e o par derivado saía igual
   ao score ("Under 12 Girls par 82"). Ver `parAdjust`.
4. **Chave de campo colidia.** `courseKey` ficava-se pelo último segmento depois
   do "-": "Faldo - World Championship" e "Castle Hume - World Championship"
   davam ambos `world championship` e misturavam os pares dos dois campos. Passa
   a usar o nome completo (sem o tee entre parênteses).

Mais: `parseScorecard` passou a ler **cada nine em separado** (cartões de 9
buracos usam a mesma tabela de 18 com metade em branco) e a ronda leva
`startingHole`; o consenso de par aceita 9 ou 18 e a chave inclui `|f9`/`|b9`
(front e back do mesmo campo têm pares diferentes).

⚠ **Tecto por buraco = 30, não 15.** O Maximilian Oberlin fez **17** no buraco 8
da R2 de 2026: com o tecto antigo o `readNine` rejeitava o nine inteiro e a
volta de 100 entrava na UI como uma volta de **9 buracos** (só o back). O tecto
serve só para rejeitar lixo — a célula vazia (buraco por jogar) já é rejeitada
por não ser numérica.

⚠ **Nacionalidade:** a afiliação do GG é o PRÓPRIO PAÍS (~50 valores, incl.
"Great Britain and Ireland", "Golf Ireland", "Hong Kong, China", "Türkiye"),
mas **a edição de 2023 não publica afiliação nenhuma**. O default `US` do
`inferCountry` (correcto para FSGA/UA, cujas afiliações são cidades
americanas) carimbava 243 miúdos de 40 países como americanos → `inferCountry`
ganhou um `fallback` e o `--country none` passa `null`. Todas as entradas CoC
do scope usam `country: "none"`.

### The Amundi Evian Juniors Cup (`evianjc`) — 2026-09-21

Sub-14 de seleções nacionais no Evian Resort (22-24 Set 2026, 83 jogadores, 21
países; PT: Santiago Dias, Nuno Palmares, Laura Santos, Margarida Silva Pinto).
Entrou na véspera da R1, por isso o motor ganhou um **modo pré-torneio**:
- o widget `tournament_results` ainda não tem `<select>` nem v2tid → em vez de
  falhar, o `discoverDivisions` devolve `preField` se houver página de tee
  sheets, e o `runOne` semeia **uma divisão** com o campo tirado dos grupos
  (nome, país, HCP) + os draws. O label é o título da página, o mesmo que o
  modo normal dá a um evento de divisão única quando o leaderboard abrir;
- a página de tee sheets deste microsite chama-se **"Départs"** (o input
  `tee_sheet_button` vem vazio) — o fallback da nav aceita `Tee Sheets`,
  `Tee Times` e `Départs`;
- os nomes vêm **"APELIDO Nome (+1.3)"** → `cleanTeeName` tira o HCP (plus →
  negativo, como no GolfBox) e passa para "Nome Apelido". Aplica-se a todos os
  tee sheets, mas só mexe quando há tokens em maiúsculas à frente;
- o HCP do tee sheet passa para os jogadores do leaderboard e aparece na coluna
  HCP do draw (`drawHideCols` só a mostra quando a divisão tem HCP).
- **Sexo pelo tee de saída:** o GG não diz quem é rapaz ou rapariga e o
  `tee_abbr` dos grupos vem vazio, mas a mesma página tem uma tabela "por
  jogador" (`player_row`: Jogador | Tee Time | **Tee** | Other Players) —
  White = rapazes, Blue = raparigas (42/41 em 2026; confirmado com os 4 PT).
  `parsePlayerTees` lê-a e o `splitByTee` parte a divisão única nos escalões
  do `teeDivisions` do scope (`{"White":"Boys U14","Blue":"Girls U14"}`; CLI
  `--tee-divisions "White=Boys U14,Blue=Girls U14"`): cada jogador leva `tee`
  e `sex`, as posições do leaderboard misto são renumeradas dentro do escalão
  e os grupos do draw vão para o escalão de quem lá joga. Quem não tiver tee
  fica no label original, sem sexo. Testes: `scrape-golfgenius-tee-split.test.js`.
- **Labels:** o leaderboard GG (2025) vem em **Boys / Girls / Nations Cup** →
  o `teeDivisions` de 2026 usa os mesmos labels (a tab "Edições anteriores" só
  casa escalões com o mesmo nome sem dígitos). A **Nations Cup** é a
  classificação por PAÍS (sem jogadores nem cartões) → `isSideEvent`. Os nomes
  do leaderboard também vêm "APELIDO Nome" → `cleanTeeName` aplicado a todos.
  O microsite de 2025 escreve a afiliação em **francês** ("Espagne",
  "États-Unis") → nomes franceses no `COUNTRY_MAP` do `scrape-fsga.js`.

**Edições anteriores (2026-09-22):**

| Ano | Onde está | Como se importou |
|---|---|---|
| 2025 | GG `pages/11993002524782146538` (website `11993002505119249336`, subdomínio `ffg-theamundievianjuniorscup`) | `scrape-golfgenius-node.js <url> --slug evianjc --year 2025 --country none` |
| 2024 | portal FFG `trnId 2401276441` | `import-ffgolf-jobfile.js` |
| 2023 | portal FFG `trnId 2301099390` | idem |
| 2022 | portal FFG `trnId 2200909351` | idem |

Todas com `--part-key 572da5febaee10b7e85bab9c6205c587` (tipo 01, liga 01 —
a Evian aparece em qualquer liga). O `ffgtid` do iframe RMS de 2024 (2401267416)
NÃO é o `trnId` do portal; o `trnId` sai da listagem
(`R.listCompetitions(ctx, {typeCompetition:'01', ligue:'01', annee})`, procurar
"Evian"). Os servidores RMS (`rms-scorer`/`rms-sport.ffgolf.org`, live scoring de
2023/2024) não respondem daqui (timeout em 80 e 443). 2022 na ffgolf.org só tem
PDFs — o portal tem-no completo.

`scripts/import-ffgolf-jobfile.js` (genérico — serve para outro torneio FFG que
precise de ir para a /major): séries → Boys/Girls; o `classement` FFG é da
classificação CONJUNTA → posições renumeradas por escalão; volta com estado ≠
"00" (10 = não jogou, 30 = sem cartão) não entra e quem não tem as voltas todas
fica sem total; 2023 veio com acentos trocados por espaço ("Am lia") e ~2/3 sem
nacionalidade → reparação por cruzamento com as outras edições do slug + o
canónico de juniores, só com candidato ÚNICO. Ficaram 40 sem país em 2023 e 2
nomes por reparar (Krist Na Kvetonova, Ol Via Grachov). Guarda anti-encolhimento
(< 80% → `--force`). Testes: `import-ffgolf-jobfile.test.js`.
O `GG_SOURCES` tem `preField: true` (aparece na lista logo com o draw).
⏳ Depois de 24/09: `disabled: true` no scope.

### Enriquecimento por DOB (ficha GG `/profiles`) — México
O `scrape-fsga.js` ganhou `fetchProfile(id)`: o scorecard detail page linka
`/profiles/{id}` (ficha do jogador), que a FMG-México expõe com **DATE OF BIRTH
+ CLUB + AÑO DE GRADUACIÓN**. `fetchScorecard` devolve `{rounds, profileId}` e,
com `opts.profiles`, faz um fetch por jogador → grava `dob`/`club`/`gradYear`.
Auto-ligado quando se passa `--country` no `scrape-golfgenius-node.js`. México
2026: **136/238 DOBs** (as divisões novas 8-9/7 não têm scorecards→sem perfil).
Ex: Mauricio Mijares Lugo → `dob 2014-10-07`, Campestre Torreón.

### MAJOR → kids2 (agregador) — 2026-07-03
Directiva "todos os dados de MAJORpage enriquecem KIDS2". Os ficheiros JobFile
(FSGA/UA/México) são lidos por 3 adapters novos em `scripts/aggregator/sources/`
(`fsga.js`, `uajt.js`, `mexnacional.js`) que partilham
`scripts/aggregator/util/jobfile.js` (`buildJobfileSource` + `parseSexAge`).
Registados no `SOURCES` do `index.js`. O **México passa `dob`** → matching FORTE
por nome+DOB (como o fcg catalão); UA/FSGA são fracas (nome+país US). UI kids2
registada (checklist completo): `Kids2SourceKey`/`SOURCE_PILLS`
(`KIDS2Page.tsx`), `SourceKey` (`kids2/Sidebar.tsx`), `--source-{fsga,uajt,
mexnacional}` (`tokens.css`) + `SOURCE_COLORS`/`SOURCE_LABELS`
(`EvolutionChart.tsx`), paths de trigger no `build-juniors.yml`. Build validado:
**15878 juniores** (+~1.6k), 9/9 sanity checks (Manuel×Dmitrii=6 mantido) —
números de 2026-07-03; hoje ~30.4k juniores e Manuel×Dmitrii = 7.
⚠ O matcher é conservador: "Mauricio Mijares" (uskids, sem DOB) **não** funde
automaticamente com "Mauricio Mijares Lugo" (mexnacional, com DOB) — nomes
diferentes + sem chave forte partilhada. Resolvido por `forceMerge` em
`juniors-overrides.json` (`uskids:564372` + `fm:fm-…` + `mexnacional:mexnacional-…`)
→ 1 entidade com 34 torneios. Padrão a repetir para outros casos MX↔US.

**Card México na ficha kids2** (`HeroIdentity.tsx`): jogadores com
`nationality/country === "MX"` mostram um `FedCard` "México" (clube + `FMG · N
torneios`) **em vez do FFG** (a FMG não expõe fed code/licença; só a ficha GG
com DOB/clube). Flag em `SOURCE_FLAGS.México = flagOf("Mexico")`.

> **Nota México — handicaps:** a FMG (`fmg.org.mx/ghin`) publica índices dos
> jovens mas o GHIN bloqueia consultas fora do México. Não incorporado.
