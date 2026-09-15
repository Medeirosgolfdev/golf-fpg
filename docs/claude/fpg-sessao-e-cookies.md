# FPG — lib partilhada, sessão pública e cookies (estado actual)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Scripts — lib partilhada (`scripts/lib/`)

Criada 2026-06-12 para eliminar duplicação entre scrapers. **Scripts novos devem usar a lib em vez de copiar funções.**

| Módulo | Exporta | Substitui |
|---|---|---|
| `lib/cookies.js` | `loadCookieHeader({envVars, file, label})` | as cópias de `loadCookies()` (env primeiro, ficheiro local depois) |
| `lib/fpg-http.js` | `makeFpgPost({baseUrl, cookie, ua, origin, referer, extraHeaders, retries})`, `FpgHttpError`, `sleep` | as cópias de `dgPost()`/`fpgPost()` — retry em HTTP 500 + detecção `Result:"ERROR"` |
| `lib/atomic-write.js` | `writeJsonAtomic(filePath, data)`, `writeAtomic`, `writeJsonAtomicVerified`, `verifyJsonFile` | escritas directas com `writeFileSync` (tmp+rename, nunca deixa JSON truncado) |
| `lib/uskids-rate-guard.js` | `ehRateLimit`, `erroRateLimit`, `perdaNosComuns`, `deveRecusarEscrita`, `avaliarCanario`, `inscritosPorTorneio` + as constantes `PERDA_MAXIMA`, `DIAS_SEM_DESCOBERTA`, `DIAS_SEM_AVANCO` | as defesas do monitor USKids contra uma fonte que recusa |
| `lib/uskids-frontier.js` | `criarFronteira`, `aplicarResultado`, `proximoNumero`, `buracosARever`, `planoBackfill`, `planearFase2`, `ordemFase2` | a procura de torneios USKids só para a frente + quem se pede por dia (2026-09-14) |
| `lib/fpg-session.js` | `Sessao`, `criarSessaoLista`, `criarSessaoWhs`, `criarRoteador`, `normalizarRegistosWhs`, `parseMetaClassif`, … | a sessão pública da FPG sem cookies (ver abaixo) |
| `lib/fpg-liveness.js` | `sondar`, `sondarFpg`, `diagnosticar`, `explicar`, `EXIT`, `CONTROL_REACH` | o diagnóstico "FPG em baixo" vs "cookies" (ver abaixo) |

Migrados na criação (2026-06-12): scrape-drive-node, scrape-jovens-node, scrape-classif-node, scrape-fpg-admissions-draws-node, fpg-scrape-node, scrape-nacionais-feds-node. Desde então os scripts novos usam a lib (44 em Set 2026).

**Validação de dados:** `scripts/validate-data.js` valida estrutura mínima dos JSON (contagens, campos obrigatórios) — corre nos workflows antes do commit. `node scripts/validate-data.js <ficheiro...>` ou `--glob "public/data/drive-data-*.json"`.

**Cookie health:** workflow `cookie-health.yml` (Quinta 09:00 UTC) valida os 3 secrets de cookies via test-fpg-auth.js + test-datagolf-node.js + test-fpg-admissions-auth.js — falha (= email) se expirados, antes da janela de scrapes do fim-de-semana.

### ⚠ As cookies duram ~9 HORAS, não uma semana (2026-08-30)

Sempre se assumiu "validade típica ~1 semana" (ver "Cenário 1" mais abaixo).
Medido num dia inteiro, com o log do `run-cookie-refresh.bat` a datar a
captura:

| Hora UTC | Estado das MESMAS cookies |
|---|---|
| 09:33 | capturadas e validadas nos 3 hosts (`TotalRecordCount=84986`) |
| 18:14 | ✅ ainda autenticam |
| 19:14 | ❌ mortas (o `cookie-health` testou o próprio Secret) |
| 22:07 | ❌ mortas (ficheiro do repo, mesmo valor) |

⚠ **E o refresh não cobria os scrapes.** A Scheduled Task corria só ao
meio-dia; a janela de scrapes do fim-de-semana começa 9h depois:

| | Local | UTC | Após o refresh |
|---|---|---|---|
| refresh | 12:00 | 11:00 | — |
| `update-fpg-admissions-draws` | 21:00 | 20:00 | **+9h** |
| `update-drive` | 22:00 | 21:00 | **+10h** |
| `update-jovens` | 22:20 | 21:20 | **+10h20** |
| `update-classif` | 02:00 | 01:00 | **+14h** |

Era isto que estava por trás dos "cookies expiraram" recorrentes ao
fim-de-semana — não eram cookies frágeis nem Secrets por actualizar (o log
prova `gh secret set … exit=0` nos quatro), era o refresh a acabar antes de
os scrapes começarem. O `setup-cookie-refresh-task.ps1` passou a registar um
**segundo refresh diário às 19:30 local**, ~1h30 antes do primeiro scrape. A
guarda de dedup do `.bat` é de 4h e o intervalo é de 7h30, por isso corre.

⚠ Só tem efeito depois de **re-correr o `setup-cookie-refresh-task.ps1` como
administrador** — editar o script não mexe na tarefa já registada.

⚠ **A Scheduled Task vive NOUTRO computador** (2026-08-30) — o refresh
automático não corre no PC de trabalho. Consequências: (1) re-correr o
`setup-cookie-refresh-task.ps1` só tem efeito na máquina onde a tarefa está
registada, e essa precisa de `git pull` primeiro (o gatilho das 19:30 entrou em
`71e6f2a33`); (2) com mais do que um PC a refrescar, o push para os Secrets
passou a ser **condicionado à validação de cada host** — antes o
`run-cookie-refresh.bat` escrevia os 4 Secrets desde que o `gh` estivesse
autenticado, sem olhar aos `FPG_EXIT`/`DG_EXIT` (que só serviam para a
notificação e para a cascata dos federados). Um refresh falhado num PC
secundário apagava assim as cookies boas que o principal tinha acabado de pôr,
e o log dizia `exit=0` na mesma — porque esse `exit` é do `gh`, não da
validação. Agora: `FPG_COOKIES` exige `FPG_EXIT=0`, os dois `DATAGOLF_*` exigem
`DG_EXIT=0`, e o `FPG_ADMISSIONS_COOKIES` (que não tem teste local próprio)
exige `REFRESH_EXIT=0`, para um refresh parcial não o carimbar.

### ⚠ HTTP 500 da FPG NÃO é prova de cookie expirado (2026-08-30)

O ASP.NET da FPG explode em vez de devolver 401, por isso sempre lemos 500 como
"cookies mortos" (está assim no `lib/fpg-http.js` e em várias secções abaixo).
Na maioria das vezes acerta — mas a 30-08-2026 mediu-se o contrário e a
heurística mandou fazer trabalho inútil:

| Hora (UTC) | Facto |
|---|---|
| 10:40 | cookies dos 3 sites refrescados (commit `1831dd0bc`) |
| 17:21 | `update-drive` morre com HTTP 500 na `TournamentsLST` |
| 17:26 | `cookie-health` dá 2 dos 3 secrets por **expirados** |
| 17:5x | os **mesmos** cookies, à mão, dão o mesmo 500 — e o `1PreparePage.aspx`, um entry gate **sem credencial nenhuma**, dá 500 também |

Não eram os cookies: as aplicações ASP.NET `scoring.datagolf.pt/pt` e
`scoring.fpg.pt/lists` estavam a arder. O `my.fpg.pt` (outro backend) estava de
pé, e o ASP clássico (`scoring-pt.datagolf.pt/scripts/draw.asp`) também.

**A avaria acabou por si**, às ~18:10 UTC, sem ninguém mexer em nada: às 18:14
o `scoring.datagolf.pt` voltou a responder com os mesmos cookies. Foram ~9h.

⚠ **Não há forma fiável de distinguir as duas causas de fora.** A primeira
versão do `fpg-liveness.js` usava o `linkpage.aspx?page=admissions` **sem
cookies** como controlo, a assumir que respondia 200 com o serviço de pé. Não
responde: às 18:15, com a FPG recuperada e o scrape do Drive a correr bem, esse
controlo continuava a dar 500. Como controlo era pior do que nenhum —
mascararia cookies mesmo mortos como "não é connosco".

O que ficou (`scripts/lib/fpg-liveness.js`, 9 testes) é modesto de propósito:
uma sonda de **alcançabilidade** (`linkpage.aspx?page=draw`, a única rota
medida de pé com e sem avaria; não apodrece, um torneio inexistente devolve 200
na mesma) e um veredicto de três estados:

| veredicto | quando | exit | efeito |
|---|---|---|---|
| `fonte-em-baixo` | a FPG nem responde na rota pública | **3** | `cookie-health` regista e não falha; `update-drive` não pinta o cron de vermelho |
| `indeterminado` | a FPG responde mas o nosso 500 não se explica | **2** | o alarme TOCA à mesma — calá-lo por dúvida esconderia cookies mortos |
| `ok` | autenticou | 0 | — |

A mensagem do `indeterminado` manda **confirmar no browser antes de
refrescar** — foi o que resolveu este caso: a utilizadora abriu o linkpage e
funcionava, o que provou que o problema não eram os cookies.

### ✅ As cookies NÃO são precisas para os resultados — `scripts/lib/fpg-session.js`

**Confirmado 2026-08-30, com o serviço estável** (a 1ª medição, às 18:09,
apanhou a janela de recuperação e não provava nada; esta isolou o mecanismo).
O gateway `scoring.fpg.pt/lists/linkpage.aspx` (ack universal) **emite ele
próprio** `ASP.NET_SessionId` + `DG_Lists_URL` a quem chega sem credenciais.
Medido no mesmo minuto, mesmo URL:

| | resultado |
|---|---|
| **com** cookie jar (aceita a sessão) | **4/4 OK** — página 200, ClassifLST OK (18), ScoreCard OK |
| **sem** jar | **3/3 → HTTP 500** Runtime Error |
| POST directo sem sessão | `Result:ERROR — Object reference not set to an instance of an object` |

Aquele *"Object reference..."* é a cara do 500 que se lia como "cookies
expiraram". O que faltava era **aceitar** a sessão, não guardá-la.

⚠ **`fetch` com `redirect:"follow"` não chega.** O linkpage responde 302 e a
sessão é emitida NO CAMINHO; o fetch nativo não reenvia o `Set-Cookie` de um
hop para o seguinte, por isso o pedido final chega sem sessão. O `Sessao.get`
segue os redirects à mão, acumulando cookies.

**Cobertura: o pipeline INTEIRO, descoberta incluída.**

| Passo | Entrada pública (sem cookies) | PageMethod |
|---|---|---|
| Resultados de um torneio (leaderboard + scorecards) | `scoring.fpg.pt/lists/linkpage.aspx?page=classif&…&ack=8428ACK987` | `classif.aspx/ClassifLST` · `classifAgregate.aspx/ScoreCard` |
| **Descoberta** de torneios | `scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T` → `1PreparePage.aspx` | `tournaments.aspx/TournamentsLST` |

⚠ **A entrada da lista tem um hop em JavaScript.** O `tournaments.asp` responde
com o `datalinkpt.html`, que NÃO faz redirect HTTP: é o `DataGolfeRedirect` da
página que constrói a URL do `1PreparePage.aspx` e navega. Como não corremos
JS, reconstruímos essa URL (`criarSessaoLista`), incluindo o detalhe de o
`club=ALL` virar `ccode=All`. É o `1PreparePage.aspx` que emite a sessão.

⚠ **Chegou a dar-se a descoberta por impossível sem cookies — era erro de
método:** testou-se o `linkpage.aspx?page=tournlist` no host errado
(`scoring.fpg.pt/lists`, onde falha com os 3 acks) e o `1PreparePage.aspx`
*durante* a avaria da FPG, sem voltar a testar depois. Pelo caminho certo e com
a FPG de pé: `Result:OK`, **84 993 torneios**, com filtro por clube/data/nome.

⚠ **Duas sessões separadas, não uma.** O `DG_Lists_URL` guarda o CONTEXTO da
página; um POST ao `tournaments.aspx` reescreve-o e o `classif` a seguir perde
o seu (devolve `Result:ERROR` logo depois de um warmup bem sucedido). O
`scrape-classif-node.js` mantém `SESSAO` (classif) e `SESSAO_LISTA`
(descoberta) independentes.

### Quem já corre sem cookies (2026-08-30)

O gate `datalinkpt.html` lista as páginas públicas do portal — é o mapa do que
é alcançável. Medido uma a uma, e **só se portou o que passou**:

| Script | Workflow | Endpoint | Sem cookies |
|---|---|---|---|
| `scrape-classif-node.js` | update-classif | ClassifLST + ScoreCard | ✅ |
| `scrape-drive-node.js` | update-drive | TournamentsLST + ClassifLST + ScoreCard | ✅ |
| `scrape-jovens-node.js` | update-jovens | idem | ✅ |
| `scrape-federados-node.js` | update-federados | HandicapsLST (gate `fedlist_v2`) | ✅ 17 840 federados |
| `scrape-drive-rankings.js` | update-drive (Dom) | RankingsClassifLST (gate `rankingresult`) | ✅ 62 jog. no RDTN26 |
| `update-cgss-draw-results.js` | update-cgss-draw | ClassifLST + ScoreCard + TournamentsLST | ✅ **60 jog. / 54 scorecards** no 192/10023 |
| `scrape-fpg-admissions-draws-node.js` | update-fpg-admissions-draws | admissions | ❌ **fica com cookies** |
| `fpg-scrape-node.js` | update-data | `PlayerWHS.aspx/HCPWhsFederLST` + `fed_hcp.aspx/ScoreCard` (gate `fedhcp`) | ✅ desde 2026-09-15 — 172/172 voltas do Manuel byte a byte; cookies do my.fpg.pt ficam de fallback |

⚠ **As admissions NÃO são fiavelmente públicas.** O mesmo gate serve
`000/10941` (página real de inscritos) e devolve `Param Error — Link address
inválido` (Err=400) em `987/10245`. Enquanto não se souber a regra, esse
scraper mantém-se autenticado — o `draw` continua público como sempre foi.

⚠ **A ordem foi INVERTIDA a 2026-08-30: público primeiro, cookies como
fallback.** A regra era "cookies primeiro, público quando falham" — o caminho
autenticado era o primário por ser o testado. Medido o dia inteiro, isso é o
avesso do que interessa: **a sessão pública não expira** (é emitida pelo ack a
cada pedido) e as cookies duram ~9h, morrendo sempre a meio da janela de
scrapes do fim-de-semana. Pôr o caminho perecível à frente do perene fazia com
que cada fim-de-semana dependesse de um refresh manual ter corrido nas horas
certas.

O fallback é **bidireccional**: se o gate público falhar (FPG em baixo, gate
mudado), ainda se tenta com cookies antes de desistir. Comuta no `criarRoteador`
de `fpg-session.js` e no `warmupLinkpage` do `scrape-classif-node.js`, os dois
com o mesmo interruptor de emergência:

| `FPG_AUTH_MODE` | Efeito |
|---|---|
| (não definido) / `auto` | **público primeiro**, cookies como fallback |
| `cookies` | ordem antiga (cookies primeiro) — sem mexer em código |
| `publico` | só público, nunca toca nas cookies |

Validado com o 987/10207 nos dois caminhos: **18 jogadores, 14 scorecards**,
ficheiros byte a byte idênticos. Testes: `scripts/lib/fpg-session-modo.test.js`
(6). O log diz sempre por onde foi (`[classif] sessão pública (ack, sem
credenciais)`).

⚠ **As admissions ficam de fora — e agora sabe-se porquê.** Medido a
2026-08-30 sobre os torneios que JÁ têm inscritos guardados no
`fpg-admissions-draws.json`: o gate público serve o `000/10941` (Nacional
Sub-12, 21 linhas) mas recusa **6 em 6** torneios de CLUBE que têm inscritos
(988/10306, 985/10236, 987/10245-48). Não é ausência de dados — esses têm
inscritos e a via autenticada trá-los. Cobertura nos nossos dados: FPG
(ccode 000) 84% com inscrições, clubes 43% (o resto são provas cujas
inscrições os clubes fazem por email e nunca chegam a publicar). Logo as
cookies compram mesmo alguma coisa aqui, e o `scrape-fpg-admissions-draws-node.js`
mantém-se autenticado.

⚠ **`redirect:"follow"` do fetch nativo perde a sessão** e mordeu em TRÊS
sítios (o `Sessao.get` segue os redirects à mão e é a correcção):
- o `scrape-federados-node.js` aquecia com `redirect:"follow"` e só lia o
  `Set-Cookie` da resposta FINAL — a sessão emitida no 302 do
  `1PreparePage.aspx` evaporava-se e o `HandicapsLST` vinha sem contexto
  (0 registos, salvos pela guarda anti-overwrite);
- o `scrape-drive-rankings.js` tinha o mesmo padrão no seu warmup;
- e foi por isto que, à primeira, se concluiu que a descoberta precisava de
  cookies.

⚠ Ao encaminhar chamadas por um wrapper, cuidado com o *find-and-replace*: a
substituição em massa de `dgPost(` apanhou também a chamada DENTRO do próprio
`dgPostSmart` e criou recursão infinita. O router tem de chamar o original.

Medido com o 987/10207 (Drive Tour Norte – Amarante) nos três cenários —
cookies boas, **sem cookies** e **cookies mortas**: os `drive-data-2026-08.json`
saem **byte a byte idênticos** (metadata, leaderboard, scorecards, par, metros,
CR/slope, tee e PCC). Verificado com os ficheiros de cookies
escondidos e as env vars limpas: **18 jogadores e 14 scorecards idênticos linha
a linha** aos da via autenticada, com metadata completa (nome, campo, data,
rondas, circuito).

⚠ **Três armadilhas neste caminho, todas com caso real:**
1. **HTTP 200 não é prova de sessão útil.** Sem cookies o linkpage do
   `scoring.datagolf.pt` devolve 200 na mesma e só o PageMethod a seguir
   rebenta — o warmup dava-se por bom e o fallback nunca corria. O teste é o
   CONTEÚDO (`parseMetaClassif(html).name`), não o `res.ok`.
2. **Os params extra vão na query string E no body** — o `ScoreCard` devolve
   500 se só forem num dos sítios (mesma armadilha do `my.fpg.pt`).
3. Uma variável de cor inexistente (`${C}`) num `console.log` **dentro do
   try** do fallback fazia o `catch` engolir tudo: a metadata já estava
   preenchida (o nome aparecia no log!) mas `SESSAO` ficava a null e o scrape
   caía no caminho autenticado sem cookies. Um throw cosmético a fingir-se de
   falha de rede.

⚠ O gémeo `scoring.datagolf.pt/pt` **não** emite sessão pelo `linkpage` (500
mesmo com jar). Nesse host a entrada pública é o `1PreparePage.aspx` (lista de
torneios via `criarSessaoLista`; WHS via gate `fedhcp` — ver "O WHS também é
público"); o `1EntryPage.aspx` com hash só serve o caminho autenticado.
