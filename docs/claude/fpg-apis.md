# FPG — sites, endpoints, gémeos, proxy e história da descoberta

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Sites e links de dados

> **Mapa completo de links (2026-09-15):** `docs/links-conhecidos.html` — todos
> os endereços conhecidos (FPG, USKids, GolfGenius, GolfBox, Espanha, França,
> WAGR/EGR, outros), com o tipo de acesso (público / sessão pública / só browser /
> login / limite / efémero / parado), exemplos reais e o script que usa cada um.
> Publicado também como artifact. **Quando se descobrir um link novo, acrescentá-lo lá.**
> Tem uma secção **por clube** (~120 códigos, com o `ack` de cada clube, federados
> activos/juniores/seguidos e os links já montados). ⚠ **O código do CAMPO não é o
> do clube**: `course.asp?ncourse=055` é o Santo da Serra (o clube 055 é Évora);
> 025 é o Estoril. O `course.asp` leva só o número; o `show_strokeindex.asp` leva
> campo-percurso (`025-1`).
> **Ordens de Mérito de clube decifradas (2026-09-15)** — lista e classificação
> saem sem login pelo portão (`ranklist`/`rankclassif` → `RankingsLST` /
> `RankingsClassifLST`), ver `docs/api-fpg-endpoints.md` §15.2. ⚠ A OM Juniores
> do CGSS **é** publicada (`OMCGSSJr24`/`Jr25` com classificação); a `OMCGSSJr26`
> existe mas sem dados — só por isso o `build-om-cgss-junior.js` ainda faz falta.
> **Cartões e campos por GET simples (2026-09-15, §15.3):** `scorecard.asp?id={score_id}`
> dá o cartão completo de qualquer volta sem portão; `show_card.asp?ncourse={campo}-{n}`
> dá todos os tees de um percurso (metros, par, SI, CR/Slope H/S); `all_courses.asp`
> lista os 81 campos / 108 percursos com o código. Ainda não ligados a scripts.

| Site | URL | Para quê | Auth |
|------|-----|----------|------|
| scoring.datagolf.pt | `scoring.datagolf.pt/pt/tournaments.aspx` | Torneios DRIVE+AQUAPOR+pull; WHS (gate `fedhcp`) | Público com entry-gate (sessão pública via `1PreparePage.aspx`) |
| scoring.fpg.pt | `scoring.fpg.pt/lists/linkpage.aspx` | Inscrições, draw, classificação | Público (sessão emitida pelo `linkpage`) |
| area.my.fpg.pt | `area.my.fpg.pt/login/` | Login FPG (SSO) | SSO |
| my.fpg.pt | `my.fpg.pt/Home/PlayerWHS.aspx?no=52884` | WHS — **gémeo de scoring.datagolf.pt**; fallback do `fpg-scrape-node.js` | Login |
| golf-portugal.pt | `golf-portugal.pt/api/*` | Proxy público FPG (REST) | Público |
| signupanytime.com | `www.signupanytime.com` | Torneios USKids | Público |
| tournaments.uskidsgolf.com | `tournaments.uskidsgolf.com/tournaments/international` | Calendário torneios | Público |
| GolfGenius (Doral) | `firstteemiamidoraljrclassic.golfgenius.com` | Doral Jr. Classic | Público |

### scoring.fpg.pt — URLs públicas (linkpage.aspx)

O `scoring.fpg.pt` expõe publicamente (sem auth) páginas de inscrições, draw, live scoring e resultados de **todos os torneios FPG**. Padrão:

```
https://scoring.fpg.pt/lists/linkpage.aspx?page={page}&club={ccode}&tourn={tcode}[&round={n}]&ack={ack}
```

**⚠ Os `ack` tokens são UNIVERSAIS — não são específicos por torneio.** Os mesmos dois valores funcionam para qualquer `tcode`:

| Página | `page=` | `ack=` universal | Params extra |
|---|---|---|---|
| Inscrições | `admissions` | `XH256YF450` | — |
| Draw (pairings) | `draw` | `8428ACK987` | `&round={1|2|3}` |
| Resultados (classificação) | `classif` | `8428ACK987` | — |
| Live Scoring | — (app própria, ver secção abaixo) | — | `/live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r=0` |

`club` é normalmente `000` (três dígitos, com zeros à esquerda) para Campeonatos Nacionais; outros ccodes aplicam-se a torneios organizados por clubes. `tcode` é o identificador numérico do torneio (ex: `10941` para Sub-12 Masculino Jovens 2026 Aroeira, `10935-10944` para o conjunto Sub 10/12/14/16/18 M+F).

Estas URLs são úteis para scrapar dados **pré-jogo** (quem está inscrito, tee times) que não vêm nos endpoints de classificação usados pelo `scrape-classif-node.js`.

#### ⚠ `linkpage.aspx` é o gateway canónico — NÃO ir directo às páginas alvo

**Descoberta 2026-04-22 via `scripts/_archive/testes-diagnostico/probe-admissions-sources.js`.** Ir directamente às páginas alvo (`tournAdmissions.aspx`, `classifications.aspx`, etc.) com os cookies certos funciona *às vezes*, mas é frágil — devolve `Param Error` (HTTP 200 com título "Param Error") se a sessão do servidor não estiver "aquecida" pelo `linkpage.aspx` logo antes. Depois do `linkpage.aspx` rodar, o directo passa a funcionar na mesma sessão (estado server-side).

**Consequência prática:** sempre usar `linkpage.aspx?page=...` como ponto de entrada. O servidor FPG faz automaticamente o redirect 302 para a página alvo (`tournAdmissions.aspx`, etc.). ⚠ Sem cookies, o `fetch` com `redirect: 'follow'` perde a sessão emitida no caminho — seguir os redirects à mão (`Sessao.get` de `scripts/lib/fpg-session.js`). Nunca saltar o linkpage em clientes server-side em que o warmup não está garantido.

**Sintoma de bug escondido se ignorares isto:** o middleware em `vite.config.ts` apontava para `tournAdmissions.aspx` directamente e funcionava em 99% dos casos (porque corridas anteriores aqueciam a sessão). Após restart do Vite, a primeira chamada podia devolver "Param Error" silenciosamente — o parser parsearia 0 linhas e a UI ficaria vazia. Mudar para `linkpage.aspx` eliminou essa fragilidade.

#### ⚡ `linkpage.aspx` cobre admissions, draw e classif — cross-domain

**Descoberta alargada 2026-04-22 via probe:** o padrão `linkpage.aspx?page=...` funciona nos dois domínios gémeos (`scoring.fpg.pt/lists/` e `scoring.datagolf.pt/pt/`) para as **três páginas** principais de um torneio:

| Página | `page=` | `ack=` universal | Forma de obter dados | Scraper Node puro |
|---|---|---|---|---|
| **admissions** | `admissions` | `XH256YF450` | GET (HTML com tabela) | ✓ linkpage GET basta |
| **draw** (pairings) | `draw` + `&round=1/2/3` | `8428ACK987` | GET (HTML com tabela) | ✓ linkpage GET basta |
| **classif** (resultados) | `classif` | `8428ACK987` | GET linkpage (warmup) + POST `classif.aspx/ClassifLST` | ✓ dois passos |

**Testado e confirmado em 3 casos reais** (futuro, passado 1 ronda, passado 3 rondas), ambos domínios, 17 pares comparados, 0 divergências entre `scoring.fpg.pt` e `scoring.datagolf.pt`.

#### 4ª página: LIVE SCORING — `/live-scoring/` (app separada, com scorecards)

**URL a guardar** (o "género que já conhecemos", mas noutra app):

```
https://scoring.fpg.pt/live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r=0
```

Não é `linkpage.aspx` nem usa `ack`: é uma aplicação ASP.NET à parte, com
**entry gate próprio** (`1.aspx`) que guarda o torneio NA SESSÃO e faz 302 para
`/live-scoring/Home/ls_classif.aspx`. Ir directo a `ls_classif.aspx` dá sempre
HTTP 500 — falta contexto, não cookies. **Não precisa dos cookies do Chrome 90**
(emite sessão própria, como o `linkpage.aspx` e o `1PreparePage.aspx`).

**Porque interessa:** é a ÚNICA fonte com o jogo a decorrer — posição, buraco
em que cada um vai (ou tee time se ainda não saiu), to-par do dia — **e tem
scorecards buraco-a-buraco** (na UI abre-se um por um, clicando no nome).
A `classif.aspx/ClassifLST` só publica depois de fechada, e a `TournamentsLST`
nem sequer lista o torneio enquanto decorre (confirmado 2026-07-18: o 4º
Aquapor de nesse dia não aparecia em nenhuma das duas).

⚠ **EFÉMERO** — só existe enquanto a prova decorre. Não há backfill: o que não
for capturado durante o jogo perde-se.

| Recurso | Chamada |
|---|---|
| Gate (obrigatório 1º) | `GET /live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r={ronda}` |
| Leaderboard | `POST /live-scoring/Home/ls_classif.aspx/lsClassifLST?jtSorting=Topar_cl ASC` · body **só** `{jtSorting}` |
| **Scorecard de 1 jogador** | `POST /live-scoring/Home/ls_classif.aspx/ScoreCard?score_id={Score_id}&Classi={n}` → `Records[].scdisplay` (HTML) |

Campos do record: `Player_name`, `Score_id`, `Team_description`, `Nholes`,
`Tee_Time`, `ScoreStatusId`, `Topar`, `Topar_day`, `Tot_R1..R3`.
`Nholes=0` → ainda não saiu (mostrar `Tee_Time`); `Topar_cl>900` → sem posição
(`ScoreStatusId` 20/30=DQ, 40=NR, 99=NS). `Classi` = tipo de classificação do
dropdown `DpClassif` (1=Gross, 2=Medal Net, 3=Stableford Gross, 4=Stableford
Net, 5=Bogey par).

⚠ **Os PageMethods só respondem à chamada disparada pela NAVEGAÇÃO que
renderiza a página.** Medido em 2026-07-18 na mesma prova e sessão: navegação
real do browser → 200; `fetch()` na própria página → 500; `jQuery.ajax` na
própria página → 500; `$(…).jtable('load')` na própria página → 500; Node → 500.
Eliminadas por medição as hipóteses de cookies/sessão, IP/rate-limit,
fingerprint TLS e headers/body (interceptados no XHR e replicados à letra).
⇒ **Para automatizar, é preciso navegar mesmo a página num browser** e ler o
DOM. Detalhe completo no cabeçalho de `scripts/scrape-fpg-livescoring.js`.

**O `ack` é universal cross-domain** (mesma infra ASP.NET partilhada) — `XH256YF450` para admissions, `8428ACK987` para draw/classif, iguais em ambos os domínios.

Implicação para o middleware: as duas fontes (`FPG_URL_1` e `FPG_URL_2`) passam a ser ambas linkpage — redundância real, não mais "scoring.datagolf.pt só por esperança". Em cada pedido esperamos os mesmos inscritos dos dois domínios; se divergirem, o log marca como "novos" os de cada fonte e sabes que uma está desincronizada.

```
FPG_URL_1 = scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=X&ack=XH256YF450
FPG_URL_2 = scoring.datagolf.pt/pt/linkpage.aspx?page=admissions&club=000&tourn=X&ack=XH256YF450
```

Cada um usa os seus próprios cookies (`.fpg-admissions-cookies.json` e `.scoring-datagolf-cookies.json` respectivamente).

#### ✅ `scripts/admissions.asp` + `scripts/draw.asp` são PÚBLICOS (sem cookies) — 2026-08-20

Correcção ao "dead end" abaixo: com o **`ack` na query string**, as duas páginas
ASP clássicas do `scoring-pt.datagolf.pt` respondem a `fetch` puro, **sem
cookies nenhuns** (o redirect para `datalinkpt.html` só acontece sem `ack`).
Qualquer um dos acks universais serve — medidos os 4 conhecidos
(`XH256YF450`, `8428ACK987`, `XH256YF45T`, `MN0JF0I697`) no mesmo torneio, todos
com resposta idêntica.

```
https://scoring-pt.datagolf.pt/scripts/admissions.asp?club={ccode}&tourn={tcode}&LANG_TXT=PT&ack=XH256YF450
https://scoring-pt.datagolf.pt/scripts/draw.asp?club={ccode}&tourn={tcode}&round_number={n}&ack=XH256YF450
```

Traz **menos** que a `tournAdmissions.aspx` autenticada (sem posição de
inscrição, data de registo, VAC nem reservas — a lista vem por ordem alfabética),
por isso é **fallback, nunca primeira escolha**: o `scrapeAdmissions` do
`scrape-fpg-admissions-draws-node.js` só lá vai quando o linkpage falha ou
devolve lista vazia (`parseAdmissionsPt`, log `fallback admissions.asp
(público)`). Vale ouro porque é exactamente o que salva o scrape quando as
cookies de `scoring.fpg.pt` estão expiradas (duram ~9h — ver "As cookies duram
~9 HORAS").

**Dead ends confirmados no mesmo probe (não voltar a testar):**
- ~~`scoring-pt.datagolf.pt/scripts/admissions.asp`~~ — **RESOLVIDO 2026-08-20**, ver acima (faltava o `ack`).
- `scoring-pt.datagolf.pt/scripts/tournAdmissions.asp` — HTTP 404 (path não existe).
- `golf-portugal.pt/api/tournaments/{tcode}/admissions` e variantes — HTTP 404. O proxy não expõe admissions, só WHS/scorecards por jogador.

---

#### 📊 Estatísticas de Clubes — `scripts/stat_*.asp` (público) — 2026-09-07

O ASP clássico do `scoring-pt.datagolf.pt` serve **30 vistas de estatísticas
agregadas** de toda a federação. É público (fetch puro, sem cookies), e não
estava mapeado em lado nenhum até agora. Detalhe completo, com as colunas de
cada vista, em `docs/api-fpg-endpoints.md` §14.

```
https://scoring-pt.datagolf.pt/scripts/stat_all.asp?club={ccode|ALL}&ack={ack}
```
É um frameset: `stat_all_options.asp` (barra de opções) + `stat_nfed.asp`
(vista corrente). Cada vista abre também sozinha.

⚠ **O `ack` decide o ÂMBITO.** Os links que os clubes publicam trazem um ack
**de clube** (ex. `64K06NJFI7` = Palheiro/059), que prende o painel àquele
clube — 26 opções no `<select>`. Com o ack **master `XH256YF45T`** (o mesmo do
`tournlist`/`draw.asp`) o selector abre nos **312** e aceita `club=ALL`: 286
clubes em 36 páginas. Os acks de admissions/classif (`XH256YF450`,
`MN0JF0I697`, `OT342GH16T`) são recusados aqui.

⚠ Um ack errado devolve **HTTP 200 com 106 bytes** e o texto `Key not
authorized` — testar pelo conteúdo, nunca por `res.ok`.

Params: `club` · `ack` · `data1`/`data2` (YYYY-MM-DD) · `selyear1`/`selyear2` ·
`course` · `counttype` (`hcp`|`all`) · `order`/`ordertype` · `pagesize`/`npage`
· **`origin=1` obrigatório** no grupo TORNEIOS (`stat_scores_*`).

O que vale a pena (medido a 2026-09-07):

| Vista | Dá |
|---|---|
| `numresults` | **ranking nacional de actividade** — nome, nº de voltas, **fed**, clube+ccode, HCP, estado. ⚠ tecto de **2000 registos** (paginar por clube) |
| `stat_ages` | **demografia júnior por clube** — escalões 0-10 · 11-12 · 13-14 · 15-16 · 17-18, por ano desde 2006 |
| `stat_tourns_players` | nº de torneios por federado, cruzando clube ORGANIZADOR × anos × clube dos jogadores |
| `stat_rounds` | voltas/torneios/EDS por clube |
| `<select name="club">` | **tabela clube→ccode dos 286 clubes** (`Palheiro-059`, `Santo da Serra-007`, `FPG_DRIVE-988`) — o repo casa clubes por NOME, isto é o mapa oficial |

⚠ **`stat_cba`/`stat_cba_course` NÃO são o PCC.** É o CBA antigo (CONGU/EGA),
buckets −2(D)/−2/−1/0/+1, **agregado em %** por clube ou campo — sem valor por
dia/torneio. Não substitui o `backfill-pcc.js`.

⚠ Tudo o que sai daqui é **agregado**; as vistas por jogador (`numresults`,
`stat_tourns_*`, `stat_highscores_players`) dão contagens, nunca resultados.

---

#### 👥 Lista de Sócios — `scripts/members.asp` (público) — 2026-09-15

```
https://scoring-pt.datagolf.pt/scripts/members.asp?club={ccode}&ack=XH256YF45T&order=name
```
Um clube inteiro numa página: **nº de sócio · nome · fed · clube de FEDERAÇÃO
· HCP · estado**. `order` ∈ memberno/name/nfed/club/hcp/hcpstatus. Detalhe em
`docs/api-fpg-endpoints.md` §15.

- **Sócio ≠ federado pelo clube.** ACP Golfe (103): 2680 sócios, só 1922
  federados pelo 103. Santo da Serra (007): 451, 380 pelo 007 e 18 pelo
  Palheiro. O `federados.json` só sabe o clube de federação — isto dá a
  pertença a vários clubes.
- Traz **sócios não federados** (sem fed, clube `-`): 305 no ACP.
- ⚠ Como no `stat_*`, o `ack` de clube (o do link publicado, `GG2TRU5VQ1` =
  103) prende a página a esse clube (`Club not authorized`, 106 B noutro); o
  master `XH256YF45T` e o `8428ACK987` abrem qualquer um. **Não há
  `club=ALL`** (tabela vazia) — é um pedido por clube.

#### ✅ O WHS também é público — gate `page=fedhcp` (2026-09-15)

O nome de cada sócio linka para a ficha do federado, e o gate dessa ficha
(`datalinkpt.html?page=…&fedno=…` → `1PreparePage.aspx`) tem uma variante que
**serve o histórico WHS inteiro sem login**:

```
GET  scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T       (aquecer)
GET  scoring.datagolf.pt/pt/1PreparePage.aspx?user=fpguser&page=fedhcp&fedno={fed}&pagelang=PT
POST scoring.datagolf.pt/pt/PlayerWHS.aspx/HCPWhsFederLST   {fed_code, jtStartIndex, jtPageSize:"100"}
POST scoring.datagolf.pt/pt/fed_hcp.aspx/ScoreCard          {score_id, scoringtype, competitiontype}
```

Medido contra o que o `fpg-scrape-node.js` traz com login do my.fpg.pt:
**172 de 172 voltas do Manuel iguais por `id`** (`score_id`, `sgd`, `cba`,
datas, campo, tipos — só aparece a mais `confirm_status`) e o cartão de
12-09 igual buraco a buraco, com CR/Slope/tee. Funciona com qualquer
federado (2871, que não é dos nossos: 478 voltas, a paginar).

⚠ O gate irmão **`page=federated`** (`Federated.aspx`) NÃO serve para isto:
lá o `HCPWhsFederLST`/`ResultsLST` respondem *"Acesso negado. Por favor faça
login"*; só o `ViewFedDET` (= o cadastro que já temos) e o `ScoreCard` são
públicos.

⚠ Testar com o `Sessao` (`scripts/lib/fpg-session.js`), nunca com `curl -L`:
o curl dá 500 no `1PreparePage` no mesmo minuto em que o `Sessao` passa.

**Ligado ao `fpg-scrape-node.js` a 2026-09-15** — público primeiro, cookies
como fallback, pelo mesmo `criarRoteador` do `fpg-session.js` (entrada
`PlayerWHS.aspx/*` → `criarSessaoWhs`; o `ScoreCard` é reencaminhado para
`fed_hcp.aspx/ScoreCard`). Corre sem cookies nenhumas; `FPG_AUTH_MODE` força um
lado. Verificado com `FPG_AUTH_MODE=publico --full` no 52884 e no 60382: os
`whs.json` saem **byte a byte iguais** aos do login.

- `normalizarRegistosWhs` tira o `confirm_status` das voltas e repõe o HTML do
  `scdisplay` como o my.fpg.pt o dá (cabeçalho `Tee`, `/Content/Images/`). Sem
  isto, cada troca entre os dois caminhos reescrevia os ~200 `whs.json` — o
  scraper compara por `JSON.stringify`.
- ⚠ Um `--full` mostra 158 de 292 cartões do Manuel "diferentes" — é só o
  `scdisplay` dos cartões antigos, que a FPG passou entretanto a gerar com
  `Volta : 1` em vez de `Round : 1` (e a imagem sem foto noutra pasta). Não é
  do caminho público: o login devolve hoje o mesmo. Nenhum consumidor lê o
  `scdisplay`, e o modo normal nunca volta a pedir cartões que já temos.
- Uma sessão pública serve todos os federados (o `fedno` do gate só escolhe a
  página de entrada) — abre-se uma por corrida e reabre-se se um pedido falhar.
- Todos os jogadores a falhar passou a ser **exit 1** (antes era 2, "nada de
  novo", e o cron ficava verde sem ter descarregado nada).

---

## FPG — APIs em tempo real (descobertas 2026-04-14)

Documentação completa em `docs/api-fpg-endpoints.md`. Resumo crítico:

### ⚡ DUPLO BREAKTHROUGH (2026-04-14, tarde) — automação server-side TOTAL

Depois de dezenas de tentativas falhadas em sessões anteriores, descobriu-se
num único dia a solução para **ambos os backends da FPG**: `my.fpg.pt`
(autenticado) e `scoring.datagolf.pt` (público mas com proteção). Os dois
funcionam agora em Node puro com `fetch`, sem Playwright, sem
`golf-portugal.pt`, sem browser automation.

**Impacto:** toda a pipeline FPG (federados, WHS, scorecards, torneios, drive,
aquapor) pode correr em GitHub Actions ou Node.js local. Playwright deixa de
ser necessário para estes domínios.

---

#### Backend 1: `my.fpg.pt` (autenticado — WHS, scorecards, federados)

**Cookie em falta:** `.AspNet.ApplicationCookie` (ASP.NET Identity auth token).

**Por que nunca o tínhamos visto antes:** o servidor FPG não seta `SameSite`
nos cookies. O Chrome moderno aplica `SameSite=Lax` por default →
**rejeita o cookie silenciosamente antes de o persistir** → nenhuma ferramenta
(DevTools UI, `document.cookie`, `cookieStore`, Playwright `context.cookies()`)
o mostra, porque nunca chegou a existir na sessão do browser.

A conclusão histórica "há um cookie httpOnly invisível" estava errada. **O
cookie não era invisível — era ausente**, bloqueado na fase de setting pelo
próprio browser.

**Solução:** instalar **Chrome 90** (última versão com flags SameSite
toggleáveis em `chrome://flags`), desactivar:
- `SameSite by default cookies` → **Disabled**
- `Cookies without SameSite must be secure` → **Disabled**
- `Schemeful Same-Site` → **Disabled** (opcional)

Depois fazer login em `area.my.fpg.pt/login/` → navegar para
`my.fpg.pt/Home/PlayerWHS.aspx?no=52884` → F12 → Application → Cookies →
copiar os 6 cookies que aparecem (incluindo `.AspNet.ApplicationCookie`).

Qualquer script Node com `fetch` + esse `Cookie:` header autentica
imediatamente. Teste confirmado 2026-04-14: `POST /Home/PlayerWHS.aspx/HCPWhsFederLST`
devolveu `Result:"OK"` com 138 rondas do Manuel.

**IP-binding:** **CONFIRMADO NÃO IP-BOUND** (teste 2026-04-15 — cookies do
Firefox capturados num IP continuaram a funcionar noutro IP diferente).
GitHub Actions pode usar estes cookies via GitHub Secret `FPG_COOKIES` (os
scripts também aceitam a env var `DATAGOLF_COOKIES`, mas nenhum workflow a define).

**Armadilha encontrada (para não repetir):** o `scripts/test-fpg-auth.js`
tinha inicialmente o cookie header **hardcoded** numa constante, em vez
de ler de `api/.datagolf-cookies.json`. Resultado: actualizar o ficheiro
de cookies não mudava nada no teste, e durante horas debitei "cookies
inválidos" quando na realidade estava a testar sempre com os cookies
expirados originais. **Lição:** scripts de teste devem SEMPRE ler cookies
de ficheiro/env var — nunca hardcoded. Actualmente corrigido.

---

#### Backend 2: `scoring.datagolf.pt` (público — torneios, drive, aquapor)

> ⚠ **Histórico (2026-04).** Desde 2026-08-30 os scrapers entram neste host
> pela **sessão pública** (`1PreparePage.aspx` / `linkpage.aspx`, sem cookies —
> ver "As cookies NÃO são precisas para os resultados"); o que se segue sobre o
> hash do `1EntryPage.aspx` só vale para o caminho autenticado, que ficou de
> fallback.

**Cookies necessários:** dois, **ambos obrigatórios**:
- `ASP.NET_SessionId` — sessão ASP.NET (HttpOnly, SameSite=None)
- `DG_Lists_URL` — cookie de "entry context" que prova que o browser passou
  pela `1EntryPage.aspx` com hash válido

**Gotcha crítico:** `GET /pt/tournaments.aspx` **direto devolve HTTP 500 ou
302 → Param_Errors.aspx?Err=999**. A página não é acessível sem passar
primeiro por `1EntryPage.aspx?user=fpguser&dt=X&page=Y&hash=Z&...` — esse
entry page seta o `DG_Lists_URL` e valida o hash server-side.

**O hash NÃO é replicável de fora do browser.** Tentámos chamar
`1EntryPage.aspx` com o hash copiado do browser a partir de Node → 500.
O servidor valida o hash contra estado só conhecido pela sessão do browser
que o pediu originalmente (provavelmente timestamp + user-agent + alguma
entropy server-side).

**Solução:** capturar cookies uma vez do Chrome 90 (depois de navegar
normalmente para `scoring.datagolf.pt/pt/tournaments.aspx`), guardar em
ficheiro/secret, e usar via `fetch` Node.

**IP-binding:** **CONFIRMADO NÃO IP-BOUND** (teste 2026-04-14 via hotspot 4G
com IP completamente diferente do login original — os cookies continuaram a
funcionar). Isto valida **GitHub Actions** como alvo viável.

Teste confirmado: `POST /pt/tournaments.aspx/TournamentsLST` devolveu
`Result:"OK"` com 25 torneios, `TotalRecordCount=83131`.

---

#### Fluxo prático de captura de cookies (Chrome 90)

Para **qualquer** dos dois backends, o fluxo é o mesmo:

1. Abrir Chrome 90 com SameSite flags desactivadas
2. Fazer login (para `my.fpg.pt`) ou apenas navegar (para `scoring.datagolf.pt`)
3. F12 → **Network** → reload da página
4. Encontrar qualquer pedido XHR/Fetch → botão direito → **Copy as cURL (bash)**
5. Extrair o header `cookie:` do cURL — isso dá os cookies completos
6. Guardar em `api/.datagolf-cookies.json` (listado no `.gitignore` mas versionado — é committado com os refrescos) ou em GitHub Secret

Alternativa sem cURL: F12 → **Application** → **Cookies** → clicar no
domínio → copiar cada linha (nome=valor). Ambos os métodos dão os mesmos
cookies.

Validade dos cookies: **medida a 2026-08-30 — ~9 horas** (ver "As cookies
duram ~9 HORAS, não uma semana"). As estimativas antigas desta secção ("dias a
semanas", "assumir 1 semana") estavam erradas.

---

#### Scripts de prova de conceito

- `scripts/test-fpg-auth.js` — valida cookies `my.fpg.pt` com POST a
  `HCPWhsFederLST`. Devolve `Result:"OK"` se cookies válidos.
- `scripts/test-datagolf-node.js` — valida cookies `scoring.datagolf.pt`
  sondando `TournamentsLST` e `HandicapsLST`; exit 0 = ok · 1 = sem cookies/erro ·
  2 = indeterminado (a FPG responde mas os endpoints falham — confirmar no
  browser antes de refrescar) · 3 = FPG em baixo (diagnóstico via `lib/fpg-liveness.js`).

### Chrome 90 — setup detalhado (INSTRUÇÕES PARA NÃO REDESCOBRIR)

Chrome 90 é **a última versão** com as flags SameSite toggleáveis em
`chrome://flags`. Chrome 91+ removeu as flags da UI; Chrome 94+ removeu a
flag CLI `--disable-features=SameSiteByDefaultCookies`. Playwright/Chromium
bundled nunca vai conseguir — as features estão hard-coded desde v100+.

**Passos exactos (testados 2026-04-14):**
1. Download Chrome 90 offline installer (arquivos históricos — pesquisar
   "Chrome 90.0.4430.93 offline installer" em sites como slimjet.com)
2. Instalar numa pasta dedicada ou como perfil portátil (evitar substituir
   Chrome principal)
3. Abrir, ir a `chrome://flags`, procurar "SameSite"
4. Desactivar:
   - `SameSite by default cookies` (ID `#same-site-by-default-cookies`)
   - `Cookies without SameSite must be secure` (ID `#cookies-without-same-site-must-be-secure`)
   - `Schemeful Same-Site` (ID `#schemeful-same-site`) — opcional
5. Clicar "Relaunch" em baixo
6. Usar **exclusivamente para FPG** — não para navegação geral (Chrome 90
   tem 5+ anos de vulnerabilidades não patchadas)

⚠ Se as flags não aparecerem: estás a ver Chrome moderno, não o 90. Confirmar
versão em `chrome://version` — deve dizer exactamente `Chrome/90.0.4430.93`
ou similar.

### Endpoints descobertos — referência completa

#### `my.fpg.pt/Home/*` (autenticado)

| Endpoint | Método | Body/Params | Devolve |
|---|---|---|---|
| `/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X&pp=N&jtStartIndex=0&jtPageSize=100` | POST | `{fed_code, pp:"N", jtStartIndex, jtPageSize}` **sem jtSorting** | Lista rondas WHS (~38 campos/ronda) |
| `/Home/PlayerWHS.aspx/ScoreCard?score_id=X&scoringtype=Y&competitiontype=Z&pp=N` | POST | `{score_id, scoringtype, competitiontype, pp:"N"}` | Scorecard hole-by-hole (par_1..18, gross_1..18, meters_1..18, stroke_index_1..18, stbgross_1..18, stbnet_1..18, bogey_1..18). **Atenção:** `scoringtype` e `competitiontype` TÊM de estar na URL E no body (descoberto 2026-04-15). Valores vêm do record da lista WHS (`scoring_type_id` e `competition_type_id`). Hardcodar valores fixos (1/10 para tudo) falha com "An error occurred while processing this request". |
| `/Home/PlayerWHS.aspx/View20Scores?fed_code=X` | POST | `{fed_code}` | 20 rondas do cálculo WHS |
| `/Home/PlayerWHS.aspx/ViewWHSCalc?fed_code=X` | POST | `{fed_code}` | Cálculo WHS detalhado (soft/hard cap) |
| `/Home/FederatedsList_V2.aspx/HandicapsLST` | POST | ver `scripts/scrape-federados-node.js` | Lista de federados (32 campos, incl. `encryptedfedcode`) |

Headers obrigatórios: `Cookie:` (6 cookies), `Content-Type: application/json`,
`X-Requested-With: XMLHttpRequest`, `Referer: https://my.fpg.pt/Home/PlayerWHS.aspx?no=X`.

#### `scoring.datagolf.pt/pt/*` (público com entry-gate)

| Endpoint | Método | Body | Devolve |
|---|---|---|---|
| `/pt/tournaments.aspx/TournamentsLST?jtStartIndex=0&jtPageSize=25&jtSorting=started_at%20DESC` | POST | `{ClubCode, dtIni, dtFim, CourseName, TournCode, TournName, jtStartIndex, jtPageSize, jtSorting}` | Lista de torneios (name, ccode, tcode, started_at, etc.) |
| `/pt/Classifications.aspx/ScoreCard?...` | POST | `{score_id, classifround:1}` | Scorecard de torneio (1 ronda) |
| `/pt/classifAgregate.aspx/ScoreCard` | POST | `{score_id, classifround:""}` | Scorecards de torneio agregado (array, 1 record por ronda) — USAR para torneios >1 ronda |
| `/pt/classif.aspx/ClassifLST?jt*` | POST | ver "Body ClassifLST" abaixo | Classificação geral de torneio (paginada, todos os inscritos) |

**⚠ Não confundir `Classifications.aspx` (maiúsculo, é a página jTable shell) com `classif.aspx` (minúsculo, é o PageMethod que devolve os dados).** O CLAUDE.md histórico tinha `Classifications.aspx/GetClassifications` mas esse endpoint devolve sempre HTTP 500 — não existe. Confirmado 2026-04-22 via probe.

**Body ClassifLST** (todos os campos são strings, filtros em default abertos):
```json
{
  "Classi": "1",
  "tclub": "{ccode}",    "tcode": "{tcode}",
  "classiforder": "1",   "classiftype": "I",
  "classifroundtype": "D","scoringtype": "1",
  "round": "1",          "members": "0",
  "playertypes": "0",    "gender": "0",
  "minagemen": "0",      "maxagemen": "999",
  "minageladies": "0",   "maxageladies": "999",
  "minhcp": "-8",        "maxhcp": "99",
  "idfilter": "-1",
  "jtStartIndex": "0",   "jtPageSize": "100",
  "jtSorting": "score_id DESC"
}
```
Os params `jt*` vão também na query string além do body. Headers: `Content-Type: application/json; charset=utf-8`, `X-Requested-With: XMLHttpRequest`. Cross-domain: mesmo endpoint em `scoring.fpg.pt/lists/classif.aspx/ClassifLST`.

⚠ **`classifroundtype` decide se a classificação é POR VOLTA ou AGREGADA**
(medido 2026-09-06 no PJA Torre 2026, 192/10024):

| valor | `round` | devolve |
|---|---|---|
| `"D"` | `"1"`, `"2"`… | a classificação **daquela volta** |
| `"A"` | `""` | a classificação **agregada** (soma das voltas) |

Com `"D"` os campos `classif_pos`/`gross_total`/`to_par_total` são os da volta
pedida — num torneio a 2 voltas, ficar-se pela R1 põe o 5.º classificado (148)
à frente do 4.º (155). Provas com mais de uma volta têm de fazer **uma segunda
passagem em `"A"`** e sobrepor `pos`/`grossTotal`/`toPar` casando por
`score_id`; os scorecards continuam a vir volta a volta. É o que o
`update-cgss-draw-results.js` faz.

Headers obrigatórios: `Cookie:` (2 cookies), `Content-Type: application/json`,
`X-Requested-With: XMLHttpRequest`, `Origin: https://scoring.datagolf.pt`,
`Referer: https://scoring.datagolf.pt/pt/tournaments.aspx`.

**Body mínimo do `TournamentsLST` (testado)**:
```json
{"ClubCode":"0","dtIni":"","dtFim":"","CourseName":"","TournCode":"","TournName":"","jtStartIndex":"0","jtPageSize":"25","jtSorting":"started_at DESC"}
```
`ClubCode:"0"` = todos os clubes. Paginar via `jtStartIndex` (múltiplos de 25).

### Estrutura dos cookies

#### `my.fpg.pt` — 6 cookies

```
.AspNet.ApplicationCookie=<~600 chars base64>    ← auth token (crítico)
ASP.NET_SessionId=<24 chars>                     ← sessão
PlayerArea=photo=&fedStatId=9                    ← estado player
playerIsLogin=<N>                                ← user-id interno
_ga=GA1.1.X.Y                                    ← GA
_ga_LLMN8JTFJ6=GS2.1.sX$o1$g0$tY$j56$l0$h0       ← GA
_ga_SBKT3JPZ7V=GS2.1.sX$o1$g1$tY$j56$l0$h0       ← GA
```

#### `scoring.datagolf.pt` — 2 cookies

```
ASP.NET_SessionId=<24 chars>                     ← sessão
DG_Lists_URL=OriginalUrl=https%3a%2f%2fscoring.datagolf.pt%3a443%2fpt%2f1EntryPage.aspx%3fuser%3dfpguser%26dt%3dXXXX%26page%3dtournlist%26hash%3d<40-char hash SHA-1>%26ccode%3dAll%26pagelang%3dPT%26callcontext%3ddirect
```

O `DG_Lists_URL` é URL-encoded. Descodificado: `1EntryPage.aspx?user=fpguser&dt=XXXX&page=tournlist&hash=<SHA-1>&ccode=All&pagelang=PT&callcontext=direct`.
O `hash` (40 chars hex) é gerado pelo browser ao entrar pela primeira vez e
validado server-side. **Não replicável de Node puro.**

---

**IP-binding em Actions:** `scoring.datagolf.pt` CONFIRMADO não IP-bound
(teste via hotspot 4G). `my.fpg.pt` CONFIRMADO não IP-bound (teste cross-IP
2026-04-15). Os mesmos cookies do user funcionam em qualquer IP — Actions
OK.

**Quando os cookies expiram:** user refresca no browser (Firefox com
SameSite=off em about:config, ou Chrome 90) → copia via DevTools → actualiza
GitHub Secret no repo + `api/.datagolf-cookies.json` local. Validade medida:
~9 horas (ver "As cookies duram ~9 HORAS") — e desde 2026-08-30 só são
precisas como fallback (e para as admissions).

---

### Websites gémeos da FPG (CRÍTICO — diferenças subtis)

`scoring.datagolf.pt/pt/*` e `my.fpg.pt/Home/*` são **quase o mesmo backend** —
mesma estrutura jTable + ASP.NET PageMethods, mesmos dados de origem, mesmos
nomes de método. **MAS** têm diferenças no formato exacto do POST body que
fazem código hardcoded falhar com **HTTP 500** ao chamar o endpoint do gémeo
errado.

| Diferença | `scoring.datagolf.pt/pt/` | `my.fpg.pt/Home/` |
|---|---|---|
| Path base | `/pt/` | `/Home/` |
| Auth | Sessão pública (gate `fedhcp` / `1PreparePage.aspx`, sem login — desde 2026-09-15) | **Login SSO obrigatório** (area.my.fpg.pt) |
| listAction da `PlayerWHS.aspx` | `/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X` | `/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X&pp=N` |
| Body do POST WHS | `{ fed_code, jtStartIndex, jtPageSize }` (o `fpg-scrape-node.js` manda o mesmo body nos dois, com `pp:"N"`, e ambos respondem) | `{ fed_code, pp:"N", jtStartIndex, jtPageSize }` (**sem `jtSorting`!**) |
| `jtSorting` no body | aceite, não obrigatório (medido 2026-04 como obrigatório; o caminho público de 2026-09-15 funciona sem ele) | rejeitado (devolve HTTP 500) |
| Param `pp:"N"` | inexistente | obrigatório (na URL E no body) |

**Lição aprendida:** nunca hardcodar o path nem o body do POST. Sempre fazer
auto-descoberta via `jt.options.actions.listAction` (string com URL completo
incluindo query params extra como `pp=N`). Os params extra (excepto `jt*`)
têm de ser **espelhados no body**.

Padrão recomendado em scripts/clientes:
```js
const u = new URL(jt.options.actions.listAction, location.href);
const extraParams = {};
for (const [k, v] of u.searchParams) if (!k.startsWith("jt")) extraParams[k] = v;
const body = { ...extraParams, fed_code: fed, jtStartIndex: "0", jtPageSize: "100" };
```

Implementação de referência: `scripts/console-fpg-whs-scrape.js`.

### PageMethods descobertos em `PlayerWHS.aspx`

POST JSON com `Cookie: ASP.NET_SessionId=X` + Referer da própria página.

| Endpoint | Body | Devolve |
|---|---|---|
| `PlayerWHS.aspx/HCPWhsFederLST?fed_code=X` | `{ fed_code, jtStartIndex, jtPageSize, jtSorting }` | Lista de rondas WHS (~38 campos/ronda) |
| `PlayerWHS.aspx/ScoreCard?score_id=X` | `{ score_id, scoringtype, competitiontype }` | Scorecard hole-by-hole (`par_1..18`, `gross_1..18`, `meters_1..18`, `stroke_index_1..18`, `stbgross_1..18`, `stbnet_1..18`, `bogey_1..18`) |
| `PlayerWHS.aspx/View20Scores?fed_code=X` | `{ fed_code }` | 20 rondas do cálculo WHS |
| `PlayerWHS.aspx/ViewWHSCalc?fed_code=X` | `{ fed_code }` | Cálculo WHS detalhado (soft/hard cap, etc.) |
| `FederatedsList_V2.aspx/HandicapsLST` | Ver `scripts/scrape-federados-node.js` | Lista de federados (32 campos — o `encryptedfedcode` é token único por jogador) |

### Autenticação — cookies necessários

São 6 cookies. **O crítico é o `.AspNet.ApplicationCookie`** (ASP.NET Identity
token de autenticação). Sem ele o servidor devolve `Param_Errors.aspx`;
com ele devolve `Result:"OK"`. Os outros 5 são necessários em conjunto
mas nenhum isolado chega.

| Cookie | Papel | Obtenção |
|---|---|---|
| `.AspNet.ApplicationCookie` | **Token de autenticação (crítico)** | Setado por SSO em `area.my.fpg.pt/login/` após submit de credenciais |
| `ASP.NET_SessionId` | Sessão ASP.NET | Setado pelo GET inicial a qualquer página `my.fpg.pt` |
| `PlayerArea` | Estado da área do jogador (`photo=&fedStatId=9`) | Setado pelo server após login |
| `playerIsLogin` | Flag de login (valor numérico, aparenta ser user-id interno) | Setado após login |
| `_ga`, `_ga_LLMN8JTFJ6`, `_ga_SBKT3JPZ7V` | Google Analytics | Benignos, mantêm-se por consistência |

Validade: não testada, mas `.AspNet.ApplicationCookie` de ASP.NET Identity
tipicamente dura dias a semanas (configurável no servidor). Refresh feito
re-fazendo login manual em `area.my.fpg.pt`.

### Gotcha crítico: Chrome SameSite enforcement bloqueia a captura do cookie

O servidor FPG **não seta `SameSite` nos cookies**. O Chrome moderno
aplica por default `SameSite=Lax` → **cookies de autenticação rejeitados
silenciosamente antes de serem persistidos** → sessão inválida → FPG
devolve "Erro 999" a pedir que desactives as flags SameSite.

**O user comum faz isto no Chrome dele e tudo funciona.** As flags a
desactivar (até estarem disponíveis):
- `SameSite by default cookies` → **Disabled**
- `Cookies without SameSite must be secure` → **Disabled**

**Problema:** essas flags **foram REMOVIDAS do `chrome://flags` no Chrome 91**
(Mai 2021) e a flag de linha de comandos `--disable-features=SameSiteByDefaultCookies`
foi removida no Chrome 94. Em Chrome 94+, tentar desactivar não é possível
nem via flags nem via args.

**✅ SOLUÇÃO QUE FUNCIONA:** instalar **Chrome 90** (última versão com as
flags ainda na UI), configurar `chrome://flags` → fazer login em
`area.my.fpg.pt` → copiar cookies do DevTools (Application → Cookies →
my.fpg.pt). O `.AspNet.ApplicationCookie` fica visível e copiável.

⚠ Segurança: Chrome 90 tem 5+ anos de vulnerabilidades não patchadas. Usar
**apenas para FPG**, não para navegação geral. Idealmente numa instalação
portátil isolada, ou num perfil dedicado.

**Tentativas falhadas anteriormente:**
- Playwright Chromium bundled + `--disable-features=SameSiteByDefaultCookies`
  → Chromium v100+ ignora (hard-coded)
- Playwright `channel: "chrome"` → abre Chrome do user com perfil limpo,
  sem as flags configuradas
- `channel: "chromium"` + warmup multi-step → falha no passo 3 com 500

Alternativa futura sem Chrome 90: Playwright conectado via CDP a Chrome
do user já aberto e logado (`--remote-debugging-port=9222`). Permite
extrair cookies incluindo httpOnly via `Network.getAllCookies`. Não testado
mas tecnicamente viável.

### Histórico de tentativas server-side (ambos os backends)

#### `my.fpg.pt`

| Tentativa | Resultado |
|---|---|
| `fetch` Node com só `ASP.NET_SessionId` | ❌ Param_Errors |
| `fetch` Node com 5 cookies visíveis (sem `.AspNet.ApplicationCookie`) | ❌ Param_Errors — conclusão errada: "há cookie invisível" |
| Adicionar Sec-Fetch-*, Sec-Ch-Ua-*, Origin, Priority, etc. | ❌ Nenhum desbloqueia |
| Playwright Chromium bundled + `--disable-features` | ❌ Chromium v100+ ignora flags SameSite (hard-coded) |
| Playwright `channel: "chrome"` com perfil limpo | ❌ Sem as flags chrome://flags configuradas |
| Copiar `ASP.NET_SessionId` do header `x-cookie-session-id` do golf-portugal | ❌ Sessão IP-bound a Google Cloud IPs |
| **`fetch` Node com 6 cookies (incluindo `.AspNet.ApplicationCookie`), capturados em Chrome 90** | **✅ FUNCIONA — Result:"OK", 138 rondas Manuel** |

#### `scoring.datagolf.pt`

| Tentativa | Resultado |
|---|---|
| GET direto a `/pt/tournaments.aspx` | ❌ HTTP 500 ou 302 → Param_Errors?Err=999 |
| GET a `/pt/` ou `/pt/Default.aspx` | ❌ HTTP 500 (bug ASP.NET sem sessão) |
| GET a `/pt/FederatedsList_V2.aspx` | ⚠ Outrora setava `ASP.NET_SessionId` mas agora também devolve 500 |
| Chamar `1EntryPage.aspx` de Node com hash copiado do browser | ❌ HTTP 500 (hash validado contra estado server-side da sessão que o pediu) |
| POST a `tournaments.aspx/GetTournamentList` (nome inventado) | ❌ HTTP 500 Runtime Error (endpoint não existe) |
| **POST a `tournaments.aspx/TournamentsLST` com 2 cookies do Chrome 90 (`ASP.NET_SessionId` + `DG_Lists_URL`)** | **✅ FUNCIONA — Result:"OK", 25 torneios, TotalRecordCount=83131** |
| Teste IP-binding: mesmos cookies via hotspot 4G (IP completamente diferente) | ✅ **Continuam a funcionar** → NÃO IP-bound |

**Insight chave:** durante meses pensámos que havia um cookie httpOnly
"invisível" que faltava. Na verdade o cookie `.AspNet.ApplicationCookie`
é visível na Application tab do DevTools — mas só quando o browser
consegue persisti-lo, o que requer SameSite desactivado. Em Chrome
moderno o cookie era rejeitado silenciosamente no momento de setting,
logo nunca aparecia em lado nenhum — nem no DevTools, nem em `document.cookie`,
nem em `cookieStore`, nem em Playwright. A ilusão de "cookie invisível"
era na verdade "cookie ausente".

### Estratégias disponíveis (em ordem de preferência, 2026-04-14 tarde)

> ⚠ **Histórico.** Desde 2026-08-30/09-15 a primeira escolha é a **sessão
> pública** (`scripts/lib/fpg-session.js`, gates `linkpage`/`1PreparePage`/
> `fedhcp`); as cookies ficaram de fallback e duram ~9h, não uma semana.

1. **⭐ Primário — server-side direto com `.AspNet.ApplicationCookie`**
   - Login manual em Chrome 90 → copiar cookies do DevTools → guardar em
     `api/.datagolf-cookies.json` (listado no `.gitignore` mas versionado) → proxy/scripts lêem o ficheiro
     e usam como `Cookie:` header
   - Endpoints diretos em `my.fpg.pt/Home/*` (ou `scoring.datagolf.pt/pt/*`)
   - Refresh ~1×/semana via novo login manual (validade do token ASP.NET Identity)
   - **Sem dependência de golf-portugal.pt, sem Playwright, sem Cloud Run**
   - Prova de conceito: `scripts/test-fpg-auth.js`
   - Implementado: `scripts/fpg-scrape-node.js` (bulk scrape) e o proxy
     `api/datagolf.js` refeito (ver abaixo)

2. **Fallback — `golf-portugal.pt/api/*` via proxy `api/datagolf.js`**
   - Se os nossos cookies expirarem e o user não puder refrescar logo
   - Hospedado em Google Cloud Run; mantém pool de cookies FPG vivos
   - Headers: `x-cookie-provider: FPG`, `x-cookie-session-id`, `x-cookie-timestamp`
   - CORS `MISSING` → precisa do nosso proxy server-side
   - Endpoints:
     - `/api/clubs/{anyCode}/players/{fed}/results?startIndex=0&limit=N`
     - `/api/clubs/{anyCode}/players/{fed}` (perfil)
     - `/api/clubs/{anyCode}/players/{fed}/handicaps`
     - `/api/scorecards/{score_id}` (hole-by-hole)

3. **Alternativa manual — console browser script**
   - `scripts/console-fpg-whs-scrape.js` — colar na consola de `my.fpg.pt`
     ou `scoring.datagolf.pt` (gémeos)
   - Scrape bulk dos feds colados (ex.: os do `players.json`); descarrega
     `fpg-whs-YYYY-MM-DD.json`, a renomear à mão para `public/data/fpg-whs.json`
   - Ainda útil quando queres snapshot datado sem configurar pipeline
   - App usa como cache local (datagolfClient.ts lê primeiro este ficheiro
     antes de ir ao proxy live)

### Proxy `api/datagolf.js` — arquitectura actualizada 2026-04-14/15

Depois dos breakthroughs do `.AspNet.ApplicationCookie` e dos cookies do
`scoring.datagolf.pt`, o proxy `api/datagolf.js` foi refactorizado.
Comportamento actual:

**Fluxo de autenticação (`dgGetSession`) — por ordem de preferência:**

1. **Env var `DATAGOLF_COOKIES`** (produção Vercel) — ler cookieHeader directo.
   Opcional: `DATAGOLF_HOST` (default "my.fpg.pt").
2. **Ficheiro `api/.datagolf-cookies.json`** (dev local; listado no `.gitignore` mas versionado) com
   formato `{host, cookieHeader, ...}`. Quando `host` é `"my.fpg.pt"`, o
   proxy seta `DG_BASE = https://my.fpg.pt/Home` e `DG_PP = "N"`.
3. **Fallback: `golf-portugal.pt` + `x-cookie-session-id`** — só usado se
   response foi `r.ok` (bug corrigido: antes usava mesmo em HTTP 500, e o
   session ID vinha mas era inválido para outros fed codes → Param_Errors).
4. **Último recurso: GET simples** a páginas que setavam `ASP.NET_SessionId`.
   Hoje quase todas devolvem 500 sem contexto do browser.

**Fluxo de scraping (`tryBoth`) — por ordem de preferência:**

Se há cookies locais (`hasLocalDgCookies()` retorna true):
1. Tentar **datagolf PRIMEIRO** (com os nossos cookies, ~2-6 segundos)
2. Fallback ao **golf-portugal.pt** só se o datagolf falhar

Se NÃO há cookies locais:
1. Tentar **golf-portugal.pt PRIMEIRO** (comportamento histórico)
2. Fallback ao datagolf

**Razão da inversão:** antes, o código tentava sempre GP primeiro — e como
o GP tenta 5 clubs × 3 retries com backoff (~10-15s de esperas), a latência
total era ~30s para jogadores que o GP não suporta. Com os nossos cookies a
funcionar directamente no `my.fpg.pt`, ir lá primeiro corta latência de 30s
→ 3-6s.

**Paginação obrigatória (confirmado 2026-04-14):**
- `my.fpg.pt/Home/PlayerWHS.aspx/HCPWhsFederLST` **rejeita `jtPageSize > 100`
  com HTTP 500** ("There was an error processing the request")
- Proxy pagina em batches de 100 (`jtStartIndex` 0, 100, 200, …) até
  atingir `TotalRecordCount` ou o `limit` pedido
- O 1.º pedido lê o `TotalRecordCount`; as páginas em falta são pedidas em
  paralelo (`Promise.all`)

**Normalização FPG → WhsRound (`normalizeFpgWhsRecord`):**

`my.fpg.pt/HCPWhsFederLST` e `golf-portugal.pt/api/.../results` devolvem os
mesmos dados mas com nomes diferentes. A UI em `datagolfClient.ts` (tipo
`WhsRound`) espera o formato do golf-portugal. O proxy converte os records
do `my.fpg.pt` antes de devolver à UI:

| Campo WhsRound (UI) | Campo my.fpg.pt |
|---|---|
| `id` | `score_id` (ou `id` se faltar) |
| `federation_code` | `federated_code` |
| `tournament_description` | `tourn_name` |
| `course_description` | `course_description` ✓ |
| `score_dateStr` | `hcp_dateStr` ou `mov_dateStr` |
| `hole_count` | `holes` |
| `par_total` | `par` |
| `exact_hcp` | `exact_handicap` |
| `calc_hcp_index` | `exact_handicap` (aproximação — FPG não expõe index separado) |
| `calculated_stablnet_total` | `stableford` |
| `score_differential` | `sgd` |
| `score_origin` | `score_origin` ✓ ("Torn", "Indiv", etc.) |
| `cba_value` | `cba` |
| `status_name` | `score_status` |
| `gross_total` | **não devolvido** pelo `HCPWhsFederLST` — disponível via `ScoreCard` endpoint |

Campos originais são preservados via `...r` spread, para não quebrar código
que possa vir a inspeccionar campos não-canónicos.

---


### Pitfall histórico: não copiar o cookie do `x-cookie-session-id`

Parece tentador porque o header do golf-portugal expõe literalmente
`ASP.NET_SessionId=gmjub...` — mas é uma sessão IP-bound a Google Cloud IPs,
logo usá-la a partir de outro IP falha. **Isto continua verdade** — mas
agora é irrelevante porque com o `.AspNet.ApplicationCookie` (e o teu
`ASP.NET_SessionId` local do próprio login) a autenticação funciona sem
dependências externas.

### Padrão recomendado para chamar PageMethods FPG

**Nunca hardcodar paths/bodies.** Sempre auto-descobrir o endpoint via DOM:

```js
// Em qualquer página com jTable carregado (PlayerWHS.aspx etc.)
const parent = document.querySelector(".jtable-main-container").parentElement;
const jt = jQuery.data(parent, "hik-jtable");
const u = new URL(jt.options.actions.listAction, location.href);

// Extrair params extra (todos excepto jt*) → têm de ir no body também
const extraParams = {};
for (const [k, v] of u.searchParams) {
  if (!k.startsWith("jt")) extraParams[k] = v;   // fed_code, pp:"N", etc.
}

const body = {
  ...extraParams,                 // OBRIGATÓRIO espelhar params extra
  jtStartIndex: "0",
  jtPageSize: "100",              // máximo aceite (200+ → HTTP 500)
  // jtSorting: NÃO incluir incondicionalmente (my.fpg.pt rejeita)
};

const response = await fetch(u.pathname + u.search.replace(/fed_code=\d+/, `fed_code=${targetFed}`), {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
  body: JSON.stringify(body),
});
```

Implementação canónica: `scripts/console-fpg-whs-scrape.js`.

### Códigos de resposta e erros conhecidos

| Cenário | Status | Body / Mensagem |
|---|---|---|
| GET `/pt/` puro | 500 | "Server Error in '/pt' Application" |
| GET `/pt/PlayerWHS.aspx?no=X` (sem sessão prévia) | 500 | "Runtime Error" |
| GET `/pt/FederatedsList_V2.aspx` (sem sessão) | 500 (antes: 200 com "Erro 999" e `Set-Cookie: ASP.NET_SessionId`) | Já não serve para obter sessão — usar o gate `fedlist_v2` / `1PreparePage.aspx` (`scripts/lib/fpg-session.js`) |
| POST PageMethod sem cookie / sem auth válida | 200 | `{"d":{"Result":"ERROR","Message":"Error executing child request for Param_Errors.aspx."}}` |
| POST PageMethod com auth + body certo | 200 | `{"d":{"Result":"OK","Records":[...],"TotalRecordCount":N}}` |
| POST PageMethod com `jtSorting` no `my.fpg.pt` | **500** | Internal Server Error |
| POST PageMethod com `pageSize > 100` | **500** | Internal Server Error |
| POST `golf-portugal.pt` transitório | 500 ocasional | `{"error":"Failed to fetch player results"}` — retry resolve |

### Lições aprendidas (ATUALIZADAS 2026-04-14)

1. **Os cookies crave de autenticação são 2, não 1.** Para `my.fpg.pt` é
   o `.AspNet.ApplicationCookie` (ASP.NET Identity token). Para
   `scoring.datagolf.pt` é o par `ASP.NET_SessionId` + `DG_Lists_URL`.
   Sem eles, nenhum PageMethod autentica. Com eles + cookies acompanhantes,
   server-side funciona em Node `fetch` puro.

2. **"Cookie invisível" era "cookie ausente".** SameSite enforcement do
   Chrome moderno rejeita cookies da FPG silenciosamente antes de persistir
   (o servidor FPG não seta `SameSite` nos Set-Cookie headers). Resultado:
   testávamos sempre sem o cookie de auth e concluíamos que havia algo
   httpOnly escondido — não havia, simplesmente não tinha sido guardado.
   **Debug heuristic:** quando um cookie parece "não existir" no browser,
   verificar F12 → Network → Response Headers → Set-Cookie e comparar com
   F12 → Application → Cookies. Se aparece no Set-Cookie mas não em
   Application, o browser rejeitou-o na chegada (SameSite, Secure, domain
   mismatch, etc.).

3. **Chrome 90 + SameSite OFF é a combinação fundadora.** Qualquer browser
   headless/moderno falha na captura. Chrome 91+ removeu as flags da UI;
   Chrome 94+ removeu a flag CLI. Playwright/Chromium bundled nunca vai
   conseguir — as features estão hard-coded desde v100+.

4. **Os cookies da FPG NÃO são IP-bound ao servidor.** Testado explicitamente
   2026-04-14 via hotspot 4G (IP completamente diferente do login original) —
   cookies continuaram a funcionar. Isto contradiz a conclusão anterior
   ("sessão ASP.NET FPG é IP-bound") que era baseada em testes com o
   `ASP.NET_SessionId` do `golf-portugal.pt` (que É IP-bound, mas por causa
   da infra deles, não do ASP.NET em geral). **Consequência prática:**
   GitHub Actions pode usar cookies capturados localmente.

5. **`scoring.datagolf.pt` exige passagem por um entry-gate.** GET
   directo a `/pt/tournaments.aspx` devolve sempre 500 ou redirect para
   Err=999. O `1EntryPage.aspx` valida um hash SHA-1 que não se replica de
   Node — ⛔ *mas desde 2026-08-30 há entrada pública pelo `1PreparePage.aspx`
   (ver "As cookies NÃO são precisas para os resultados"); o hash só importa
   ao caminho autenticado, que ficou de fallback.*

6. **Nunca hardcodar paths/bodies de PageMethods FPG.** Auto-descobrir
   sempre via `jt.options.actions.listAction`. As subtilezas `/pt/` vs
   `/Home/` (pp=N obrigatório num, ausente noutro; jtSorting obrigatório
   num, proibido noutro) quebram silenciosamente com HTTP 500.

7. **Os 2 sites são gémeos no nome, primos na implementação.** Mesma
   origem de dados, mas frontends ASP.NET separados com configurações
   diferentes. Ver tabela "Websites gémeos" para diferenças exactas.

8. **Para descobrir endpoints novos: DevTools Network + Copy as cURL.**
   O fluxo padrão:
   - Abrir página no Chrome 90 com sessão válida
   - F12 → Network → limpar (Ctrl+L)
   - Interagir com a página (reload, filtrar, paginar) para disparar XHR
   - Encontrar o pedido certo → botão direito → Copy → Copy as cURL
   - Colar numa conversa ou num script de teste — tens o endpoint exacto,
     body, headers e cookies

9. **golf-portugal.pt degradado a fallback.** Era a solução primária antes
   (proxy externo que mantinha pool de cookies FPG). Agora só serve se os
   nossos cookies expirarem e o user não puder refrescar. Evitar dependência
   externa — somos donos da pipeline agora.

10. **Browser console > Playwright para testes exploratórios.** Quando
    precisares de testar um endpoint novo, colar um script na consola do
    browser logado é mais rápido e fiável que configurar Playwright.

11. **Playwright só é necessário para (a) captura inicial de cookies — e
    nem isso, porque o Chrome 90 do user resolve — ou (b) scraping de
    sites não-FPG que tenham protecção extra.** Para FPG, **não precisamos
    mais de Playwright** — excepto o **live scoring** (`/live-scoring/`), cujos
    PageMethods só respondem à navegação real da página.

12. **Documentação completa em `docs/api-fpg-endpoints.md`** — secções §1-§15
    com tudo o que descobrimos. Consultar em caso de dúvida antes de
    redescobrir.

### Playbook — cookbook para futuras sessões

**Cenário 1: "Os cookies expiraram, preciso de os refrescar"**
1. Abrir Chrome 90
2. Navegar para `https://scoring.datagolf.pt/pt/tournaments.aspx` → F12 →
   Application → Cookies → copiar `ASP.NET_SessionId` + `DG_Lists_URL`
3. Navegar para `https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884` → login
   se pedir → F12 → Application → Cookies → copiar os 6 cookies
4. Atualizar GitHub Secrets (`DATAGOLF_SCORING_COOKIES`, `FPG_COOKIES`,
   `FPG_ADMISSIONS_COOKIES`; o `DATAGOLF_COOKIES` é só a variável do proxy na Vercel) ou
   ficheiro local `api/.datagolf-cookies.json`
5. Correr `node scripts/test-fpg-auth.js` e `node scripts/test-datagolf-node.js`
   para confirmar que ambos devolvem `Result:"OK"`

**Cenário 2: "Quero automatizar scraping novo endpoint"**
1. Identificar o que a página faz ao carregar (abrir no Chrome 90 + F12 Network)
2. Copy as cURL do pedido XHR que devolve os dados
3. Replicar em Node (`scripts/test-<endpoint>.js`) — manter os mesmos
   cookies, headers, body
4. Se funcionar, integrar no pipeline (script Node puro, não Playwright)
5. Se não funcionar, verificar:
   - Cookies completos? (especialmente `.AspNet.ApplicationCookie` e `DG_Lists_URL`)
   - Headers obrigatórios? (`X-Requested-With: XMLHttpRequest`, `Referer`)
   - Body no formato exacto? (ASP.NET é sensível a tipos — tudo como string)

**Cenário 3: "GitHub Action parou de funcionar"**
1. Ver logs do último run — procurar `HTTP 500` ou `Result:"ERROR"` ou
   `Param_Errors`, e por onde foi (`sessão pública` ou `cookies`)
2. ⚠ **HTTP 500 NÃO prova cookies expirados** — ver "HTTP 500 da FPG NÃO é
   prova de cookie expirado": correr o `fpg-liveness` / abrir o linkpage no
   browser. `fonte-em-baixo` → esperar (a avaria de 30-08 durou ~9h)
3. Se a FPG responde e a sessão pública falha → o gate mudou, seguir Cenário 2
4. Se só o caminho autenticado falha (admissions) → cookies, seguir Cenário 1
5. Se timeout → site lento ou bloqueado, dar retry manual

**Cenário 4: "Parece que um cookie não existe"**
1. F12 → Network → encontrar a response que devia setar o cookie
2. Response Headers → procurar `Set-Cookie:` — está lá?
3. Se sim mas cookie não aparece em Application → Cookies: browser rejeitou
   - Ver atributos (SameSite, Secure, domain) — algum a bloquear?
   - Chrome moderno → SameSite quase sempre a causa, usar Chrome 90
4. Se não está no Set-Cookie do servidor: servidor não o está a enviar
   - Falta algum passo no fluxo (ex: redirect intermédio, POST de login)
   - Ver o Network completo: há algum request "anterior" que deveria
     setá-lo e não foi chamado?

### Ficheiros de dados relacionados

- `public/data/federados.json` (~18 MB, ~17,9k activos em 2026-09 — `FedStat=9`)
- `data-archive/federados-inativos.json` (~42 MB, 42.636 inactivos — `FedStat=7`; fora do deploy)
- `public/data/federados-inativos-stats.json` (~25 KB, agregados)
- `public/data/federados-inativos-jovens.json` (~2.7 MB, Sub-10 a Sub-21)
- `public/data/fpg-whs.json` — cache OPCIONAL (hoje não existe em disco); o `datagolfClient.ts` usa-a se existir
- `api/.datagolf-cookies.json` (cookies capturadas no browser / pelo `run-cookie-refresh.bat`; ⚠ está no git, é committado com os refrescos)
