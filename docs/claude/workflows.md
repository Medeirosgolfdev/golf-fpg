# GitHub Actions e resumo diário por email

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

### GitHub Actions — estado (crons conferidos nos `.yml` a 2026-09-15)

⚠ Os scrapers FPG entram pela **sessão pública**; onde a tabela diz "Secret" é
só o fallback (ver "Quem já corre sem cookies"). As admissions são a excepção:
continuam autenticadas.

| Workflow | Estado | Script | Cron | Notas |
|---|---|---|---|---|
| `uskids-field.yml` | ✅ | `scripts/fetch-uskids-field.js` + `uskids-canary.js` | Diário 07:00 UTC | Site público signupanytime.com — ver "Procura só para a frente" |
| `uskids-results.yml` | ✅ | `scripts/fetch-uskids-results.js` + `fetch-uskids-draws.js` + `validate-data.js` | Diário 16:00 UTC | idem |
| `uskids-member-history.yml` | ✅ | `scripts/fetch-uskids-member-history.js` → `split-member-history.js --from-chunks --target-mb=70` → `build-member-history-slim.js` | Diário 16:30 UTC | idem |
| **`update-drive.yml`** | ✅ Node puro desde 2026-04-15 | `scripts/scrape-drive-node.js` | Sex/Sáb/Dom 21:00 UTC | Default: mês corrente + mês anterior (`--months-back 1`). Secret `DATAGOLF_SCORING_COOKIES` só de fallback. Ao Domingo: `scrape-drive-rankings.js --details` (Secret `FPG_ADMISSIONS_COOKIES`) + `verify-drive-rankings.js`; corre também `build-simulador-players.js`. |
| **`update-data.yml`** | ✅ Node puro desde 2026-04-15 | `scripts/fpg-scrape-node.js` | Dom/Seg 00:05 UTC (depois do cut SD) | Default: incremental (só rondas novas). Override `full_rebuild=true`. **Público primeiro desde 2026-09-15** (gate `fedhcp`, sem cookies); o Secret `FPG_COOKIES` fica de fallback. **Timing tardio intencional: o SD e WHS Index são atribuídos pela FPG depois da meia-noite Lisboa.** Corre também `backfill-pcc.js --apply` — ver "PCC — o ajuste que chega SEMPRE depois do scrape" — e `backfill-sd.js` — ver "SD oficial nas voltas dos torneios". |
| **`update-jovens.yml`** | ✅ Node puro desde 2026-04-17 | `scripts/scrape-jovens-node.js` | Sex/Sáb/Dom 21:20 UTC | Classificações + scorecards dos torneios "Jovens"/"PJA" do ano → `jovens_YYYY.json` (merge incremental). Secret `DATAGOLF_SCORING_COOKIES` só de fallback. |
| **`update-fpg-admissions-draws.yml`** | ✅ Novo 2026-04-22 | `scripts/scrape-fpg-admissions-draws-node.js` | Sex/Sáb/Dom 20:00 UTC | **Cron aplica `--auto-extend --since 4d`**: scope manual (~390, cresce com o `--auto-extend`) + Fonte 2 (JSONs locais: drive-data, jovens, pull-torneios, SdS) + Fonte 3 (TournamentsLST com warmup entry-gate, filtros INCLUDE=junior/PJA/jovens/sub-XX/ccode=007, EXCLUDE=Flintstones/Quarta Feira Europeia). Janela: futuros + em curso + torneios ≤3 rondas até dia seguinte ao fim. Para scope histórico completo: workflow_dispatch sem filtros. Secrets: `FPG_ADMISSIONS_COOKIES` + `DATAGOLF_SCORING_COOKIES`. |
| **`update-classif.yml`** | ✅ Novo 2026-04-22 | `scripts/scrape-classif-node.js` | Dom/Seg 01:00 UTC | Scope dinâmico via `--auto-from-tracking` (lê `fpg-tournaments-tracking.json`, filtra `status in [missing_classif, missing_scorecards]`). Fallback manual via `--scope` ou `--tclub/--tcode`. Saída por defeito `pull-torneios002.json`; um 2.º passo scrapa o `recent-tournaments-scrape-scope.json` (`--limit 80`, `--out` dado por `pull-torneios-tail.cjs`), e no fim corre `build-tournaments-tracking.js`. Secret `DATAGOLF_SCORING_COOKIES` só de fallback. Corre também `backfill-pcc.js --apply` (o WHS das 00:05 já traz o `cba` do próprio fim-de-semana) e, desde 23/10/2026, `scrape-fpg-matchplay.js` (quadros da Taça FPG, HTML público, sem cookies → `fpg-matchplay.json`; edição nova = uma linha em `SOURCES`). |
| **`build-tournaments-tracking.js`** | ✅ Novo 2026-04-22 | helper (corre dentro do admissions-draws + classif workflows) | — | Cruza fpg-admissions-draws + pull-torneios* + drive-data-* + jovens_* e gera `public/data/fpg-tournaments-tracking.json` com status por torneio (complete/missing_classif/missing_scorecards/future/in_progress). Alimenta o scope dinâmico do `update-classif`. |
| **`update-ffgolf-resultats.yml`** | ✅ Novo 2026-05-08 | `scripts/scrape-ffgolf-all-jeunes.js` + `build-ffgolf-resultats-index.js` + `build-ffgolf-juniors-slim.js` + `scrape-ffgolf-calendar-jeunes.js` + `build-france-players.js` | Seg 02:00 UTC (1×/semana, madrugada Lisboa) | **Sem secrets** — portal `pages.ffgolf.org/resultats/` é público (bootstrap GET apanha PHPSESSID). Default do cron: `--types 01,03 --since 2025 --skip-existing` (Compétitions Fédérales filtradas por keyword juvenil + GP Jeunes regionais nas 22 ligas, anos 2025-2026, só novos). Output: `public/data/ffgolf-resultats/{type}-{ligue}-{trnId}.json` + `ffgolf-resultats-index.json` + `ffgolf-juniors-slim.json`. workflow_dispatch tem inputs `types`/`since`/`ligues`/`force_rebuild`. |
| **`update-ffgolf-golfgenius.yml`** | ✅ Novo 2026-05-08 | `scripts/discover-ffgolf-catalog.js --headless` + `scripts/scrape-ffgolf.js` + `scrape-ffgolf-gg-fetch.js` (torneios sem leaderboard no iframe) | Seg 03:00 UTC (1×/semana, 1h depois do anterior) | **Playwright headless** — torneios juvenis FFG hospedados em GolfGenius (Championnats de France, Internationaux U14/U18). Default do cron: `--year <ano corrente>` (varre `public/data/ffgolf-catalog.json` filtrado por ano). Output: `public/data/ffgolf/{year}_{slug}.json`. Depois do scrape corre `build-france-players.js`: os torneios GG contam para o roster via **matching de nome** (`scripts/lib/ffgolf-gg.js` — o GG não publica licenças) com **dedup de gémeos** do portal resultats por overlap de licenças (`ffgolf-gg-twins.json`; 18/21 eventos GG são o MESMO evento publicado nos 2 sítios). workflow_dispatch tem inputs `year`/`slug`/`gg_page` (ad-hoc). Sem secrets. |
| **`update-spain.yml`** | ✅ Novo 2026-05-17 | `scripts/discover-fcg-scope.js` + `scrape-rfegolf-node.js` + `scrape-livegolfscoring.js` + `scrape-nextcaddy.js` (+ horarios) + `scrape-fcg.js` + 11 builds (enrich-lgs-dates, enrich-lgs-stats, infer-nextcaddy-par, build-rfegolf-index, build-licencia-{dob,hcp}-lookup, build-lgs-twins, build-fcg-rivals, build-spain-player-tournaments, build-spain-players-export, build-rfegolf-rivals); descoberta também via `discover-rfegolf-comps.js` e `scrape-nextcaddy.js --discover`, e `build-nextcaddy-scorecard-scope.js` + `scrape-nextcaddy.js --patch-scorecards` | Seg 04:00 UTC (1×/semana, 1h depois do GolfGenius) | **Node puro, sem secrets** — pipeline única que cobre RFEG (microsite + livegolfscoring), NextCaddy (RFGA Andaluzia + FGM Madrid) e FCG (Federació Catalana via golfdirecto.com). Default do cron: discovery + `--skip-existing` em todos os scrapers + builds. workflow_dispatch tem inputs `force_rebuild`/`skip_discovery`/`lgs_range`/`rfegolf_range`/`fcg_years`. **`timeout-minutes` em cada passo** (2026-10-21; job 300 min) — um portal pendurado expira sozinho, o commit acontece e a verificação final põe o job vermelho. Outputs em `public/data/{rfegolf-resultats,rfegolf-livegolfscoring,nextcaddy,fcg}/` + agregados. |
| **`update-federados.yml`** | ✅ Novo 2026-06-14 (email 2026-08-23) | `scripts/scrape-federados-node.js` (+ `build-run-digest` → email do cadastro; `build-simulador-players.js`) | Quarta 17:00 UTC (1×/semana) | Refresh completo de `public/data/federados.json` (~17,9k activos). Exit code 2 = sem alterações. workflow_dispatch tem inputs `check_only`/`force_commit`. Sessão pública; Secret `DATAGOLF_SCORING_COOKIES` só de fallback. |
| **`update-golfgenius.yml`** | ✅ Novo 2026-07-23 | `scripts/scrape-golfgenius-node.js --scope scripts/golfgenius-scope.json` | Diário 22:00 UTC | Eventos GolfGenius do scope (hoje: as 4 edições do Champion of Champions). Sem secrets (GG público a `fetch`). Exit 2 = sem alterações. Quando há novidades regenera o agregador + `major-catalog.json` e committa. `workflow_dispatch` aceita `slug` (só um evento do scope) ou `page_url` ad-hoc. |
| **`update-england.yml`** | ✅ Novo 2026-08-30 | `scripts/discover-england-golf-events.js` + `scripts/scrape-england-golf.js` | Segunda 05:00 UTC | Torneios juvenis England Golf (GolfGenius) do catálogo, ano corrente. **Playwright** (o GG depende de JS para os dropdowns e scorecards); sem secrets (público). Os campeonatos ingleses jogam-se de Terça a Sexta, por isso à Segunda a semana anterior já fechou. A descoberta corre antes e AVISA (no `$GITHUB_STEP_SUMMARY`) que provas estão fora do catálogo, mas nunca o edita. Exit 2 = sem alterações. Com novidades regenera o agregador de juniores e committa. `workflow_dispatch` aceita `year`/`slug`/`gg_page`/`skip_existing`. |
| **`build-juniors.yml`** | ✅ | `scripts/aggregator/index.js` | push nos ficheiros de input do agregador + workflow_dispatch | Build do agregador canónico de juniores (orquestra adapters em `scripts/aggregator/sources/` + identity-matcher + sanity checks). Alimenta a vista global de juniores. |
| **`uskids-refresh-all.yml`** | ✅ | `fetch-uskids-member-history.js --refresh-all` → `split-member-history.js` → `build-member-history-slim.js` | Segunda 09:00 UTC | Refresh semanal completo (era mensal) do member-history USKids: re-scrape de toda a carreira, split em chunks ≤70 MB e rebuild do slim servido ao browser. |
| **`update-uskids-edicoes.yml`** | ✅ | `fetch-uskids-edicoes-anteriores.js` (lote) → `build-uskids-edicoes-anteriores.js` | Diário 03:30 UTC | Edições anteriores 2021–2026 das provas USKids (abas «Edições anteriores»/«Quem repete»): busca os escalões que faltam na `uskids-rich-flight-cache`, um pedido de cada vez, pára à primeira recusa, ≤1500 pedidos por noite. Fila `uskids-rich-flight-cache` partilhada com o `update-uskids-rich-players`. |
| **`future-masters-scrape.yml`** | ✅ | `scripts/scrape-future-masters-all.js` | Diário 05:00 UTC, só em Junho | Scrape do Future Masters (torneio juvenil UK). `workflow_dispatch` com `all_years=true` refaz todos os anos. |
| **`daily-digest.yml`** | ✅ Novo 2026-08-17 | `scripts/build-run-digest.js` + `send-digest-issue.js` | Diário 07:30 UTC | **Resumo por email** do que os scrapers trouxeram nas últimas 24h. Sem secrets. Ver secção própria abaixo. |
| **`analytics-snapshot.yml`** | ✅ Novo 2026-08-28 | `scripts/snapshot-web-analytics.js` | Diário 03:15 UTC (+ mensal no dia 1) | **Retrato do Vercel Web Analytics** para `data-archive/analytics/`. O plano Hobby só guarda 30 dias — isto copia-os para o repo antes de desaparecerem. Secret: `VERCEL_TOKEN`. Exit 2 = sem novidades. |
| **`update-cgss-draw.yml`** | ✅ | `scripts/update-cgss-draw-results.js` | Sex/Sáb/Dom 12:10-18:10 UTC (horário) + Seg-Qui 13:10 UTC | Draws/resultados dos torneios CGSS. Sessão pública; secrets `DATAGOLF_SCORING_COOKIES` + `FPG_ADMISSIONS_COOKIES` só de fallback. Regenera `manuel-pairings.json` (`pairings-build.js`). |
| **`update-golfbox.yml`** | ✅ | `scripts/scrape-golfbox.js` | Diário 21:00 UTC | Scope em `scripts/golfbox-scope.json` — ver "GolfBox". |
| **`update-dgv.yml`** | ✅ | `scripts/scrape-dgv.js` | Sex/Sáb/Dom 19:30 UTC + Seg 06:00 UTC | Provas juvenis do DGV (Alemanha) → `public/data/dgv_{n}.json` + agregador. A pedido: `ids` ou `from_days` (-1800 = desde 2022). Ver `docs/claude/kids2-agregador.md` → "Fonte DGV". |
| **`update-wagr.yml`** | ✅ | `scripts/scrape-wagr.js` | Quarta 07:00 UTC | Ver "Fonte WAGR". |
| **`update-egr.yml`** | ✅ | scrapers EGR | Segunda 06:00 UTC | European Golf Rankings. |
| **`update-gjgl.yml`** | ✅ | scrapers GJGL | Segunda 05:30 UTC | Global Junior Golf Live. |
| **`update-uskids-rich-players.yml`** | ✅ | `scripts/fetch-uskids-rich-players-node.js` | Segunda 02:00 UTC | Ver "fetch-uskids-rich-players-node.js". |
| **`update-ffgolf-calendar-jeunes.yml`** | ✅ | calendário FFG jovens | Segunda 01:30 UTC | |
| **`update-ffgolf-teesheet.yml`** | ✅ | tee sheets FFG | Diário 20:00 UTC | Ver "FFG tee sheet". |
| **`update-om-cgss-junior.yml`** | ✅ | `scripts/build-om-cgss-junior.js` | Domingo 22:30 UTC | OM CGSS Júnior. Secret `DATAGOLF_SCORING_COOKIES` só de fallback. |
| **`cookie-health.yml`** | ✅ | `test-fpg-auth.js` + `test-datagolf-node.js` + `test-fpg-admissions-auth.js` | Quinta 09:00 UTC | Ver "Cookie health". |
| **`prune-vercel-deployments.yml`** | ✅ | `scripts/prune-vercel-deployments.js` | Segunda 04:00 UTC | Ver "Deployment Storage do Vercel". Secret: `VERCEL_TOKEN`. |
| **`draw-inbox-email.yml`** | ⚠ secrets por criar | `scripts/draw-mail-inbox.js` | De hora a hora (:23) | Secrets: `DRAW_MAIL_USER` + `DRAW_MAIL_PASS` — **não existem** (21/10/2026): sem eles fica vermelho no run das 07 UTC e em runs manuais, aviso nos outros. |
| **`ci.yml`** | ✅ Novo 2026-10-21 | `npm ci && npm test && npm run build` | push/PR que mexa em código | Ver «CI» abaixo. |
| **`build-major-catalog.yml`** | ✅ | `scripts/build-major-catalog.js` | push nos ficheiros MAJOR | Ver "Catálogo + lazy load". |
| **`scrape-miramar.yml`** | ✅ | `scripts/scrape-classif-node.js` (+ `enrich-intl-players.js`, `validate-data.js`) | só manual | Secret `DATAGOLF_SCORING_COOKIES` só de fallback. |

### ⚠ FCG (catgolf.com) — guarda anti-overwrite do scope (2026-08-17)

O `catgolf.com` serve **intermitentemente** um edge node com certificado
self-signed. O `discover-fcg-scope.js` já degradava para uma tentativa sem
verificação TLS (melhor do que derrubar o workflow), mas essa resposta vem por
vezes **HTTP 200 com uma página SEM a lista de torneios** → `0 tournaments
listed` → gravava um `scripts/fcg-scope.json` VAZIO por cima do bom, committava-o,
e o `scrape-fcg.js` a seguir ficava sem jogos e falhava o `update-spain.yml`
inteiro. Aconteceu a **2026-07-20, 2026-07-27 e 2026-08-17** — o run de 17-08
apagou um scope de 27 torneios / 25 games / 43 inscritos.

Resolvido com a mesma política do `scrape-federados-node.js` (recusar gravar
zero registos):

- `discover-fcg-scope.js` **recusa** gravar se a descoberta der 0 torneios com
  um scope não-vazio em disco, ou se perder **>50%** dos torneios. Preserva o
  ficheiro anterior e sai com **exit 2** (= sem novidades utilizáveis, não é
  erro). `--force` ignora a guarda (para quebras legítimas, ex: mudar `--years`).
- `scrape-fcg.js` com um scope existente mas vazio imprime "nada para scrapar"
  e sai 2, em vez do texto de *usage* — que nos logs do workflow mandava uma
  pista errada (parecia erro de invocação).
- Os dois passos do `update-spain.yml` traduzem **exit 2 → sucesso**. Resultado
  prático: quando o catgolf está degradado, o scrape usa o scope bom que já lá
  estava e o workflow fica **verde**, em vez de vermelho com dados destruídos.

---

## Push dos dados — `scripts/ci/push-generated.sh` (2026-10-21)

Todos os workflows que fazem commit de dados (32 passos) publicam pelo mesmo
script. **Workflow novo que committe dados: usar este script, nunca
`git pull --rebase`.**

```bash
bash scripts/ci/push-generated.sh -m "data: … $(date -u +'%Y-%m-%d %H:%M UTC')" \
  -f agregador \                      # famílias de agregados a regenerar (0 ou mais)
  -o public/data/ficheiro-so-meu.json \  # «a versão deste run ganha» (0 ou mais)
  -- public/data/pasta/ 'public/data/glob_*.json'   # o que entra no commit
```

**Porquê:** o `git pull --rebase` partia ~4×/semana. O checkout é raso
(depth 1) — se o main avançava durante o scrape o git ficava sem base comum e
dava ficheiros inteiros como conflito — e os agregados (`juniors*.json`,
catálogos…) mudam em quase todos os runs, por isso conflitavam mesmo com
histórico.

**O que faz** (o padrão do `update-federados.yml` de 19/10, generalizado):
1. `git add -A` pathspec a pathspec (globs entre aspas apanham as deletions).
2. Guarda a versão do run e a da base (o commit do checkout) de cada ficheiro.
3. Em cada tentativa (até 5): `git fetch --depth=1` + `git reset --hard
   FETCH_HEAD` e repõe por cima:
   - ficheiro em que o main não mexeu → fica a versão do run;
   - o main também mexeu → **fusão a 3** (`git merge-file`; um `.json` fundido
     tem de continuar válido). Se não der: **falha vermelha** e não publica
     nada — nunca apaga os dados que outro workflow publicou entretanto;
   - `-o` → a versão do run ganha sempre (caches, ficheiros só deste workflow;
     é o antigo `merge -X ours` dos USKids);
   - gerados (`-f`/`-g`) → **não se repõem: regeneram-se** por cima do main +
     as fontes do run (regra «Conflitos de git nos ficheiros GERADOS» do
     CLAUDE.md). Se o main não avançou, ficam como o run os deixou.
4. commit + `git push origin HEAD:main`; push recusado → volta ao 3.

Escreve `pushed=true|false` em `$GITHUB_OUTPUT`. ⚠ O `reset --hard` deita fora
alterações tracked FORA dos pathspecs — por isso o `update-uskids-rich-players`
guarda a cache antes do 1.º push e repõe-na para o 2.º.

| Família (`-f`) | Ficheiros | Regenera com | Usada em |
|---|---|---|---|
| `agregador` | `juniors.json`, `juniors-tournaments*.json`, `tournament-catalog.json`, `hcp-listas-ligacoes.json`, `juniors-scout.json`, `juniors-links.json` | `scripts/aggregator/index.js` | build-juniors, dgv, egr, gjgl, golfbox, golfgenius, england |
| `major` | `major-catalog.json`, `major-veterans.json` | `build-major-catalog.js` | build-major-catalog, golfbox, golfgenius |
| `tracking` | `fpg-tournaments-tracking.json` | `build-tournaments-tracking.js` | classif, admissions-draws |
| `ffgolf` | `ffgolf-resultats-index.json`, `ffgolf-juniors-slim.json`, `france-players.json`, `ffgolf-gg-twins.json`, `ffgolf-player-tournaments.json` | os 3 builders FFG | as 4 FFG |
| `pairings` | `manuel-pairings.json` | `pairings-build.js` (se falhar fica a do main) | admissions-draws, cgss-draw |
| `simulador` | `simulador-players.json` | `build-simulador-players.js` | drive, federados |
| (`-g`/`-r`) | `analise-percurso-juniores.html` | `build-analise-percurso.js` + `build-percurso-path.js` | update-data |

Exit 2 de um regenerador = «nada a mudar» → fica a versão do main, com
`::warning::`. Exit 1 (o agregador sai 1 quando a sanidade falha) → o push
falha vermelho e não publica agregados maus.

Teste: `scripts/ci/test-push-generated.sh` (7 cenários contra um origin bare
local: fusão, regeneração, conflito real, `-o`, no-op, JSON inválido, push
perdido + retry), corrido pelo `npm test` (`push-generated.test.js`).

### Concorrência (`concurrency`)

Cada workflow tem a sua fila (`group: ${{ github.workflow }}`, sem cancelar):
duas corridas do MESMO workflow nunca se sobrepõem. Os que partilham ficheiros
com escrita incremental têm fila comum: `uskids-member-history` (member-history
+ refresh-all) e `uskids-rich-flight-cache` (rich-players + edições).

⚠ **Não há fila comum por família** (agregador, major, FFG…) de propósito: o
GitHub só guarda UM run pendente por grupo e **cancela o pendente anterior**
quando chega outro. Com as 7 do agregador num grupo, a cadeia de segunda de
manhã (England 05:00, GJGL 05:30, EGR e DGV 06:00, todas com atraso do cron)
cancelava scrapes semanais em silêncio. Entre workflows diferentes quem
garante a coerência é o push-generated (regenera os agregados sobre o main
mais recente). Os builders puros (`build-juniors`, `build-major-catalog`) têm
fila própria — aí cancelar o pendente não perde nada.

### Falhas que ficam vermelhas (2026-10-21)

Regra: um passo que falha a sério não pode travar o commit do que correu bem,
mas **o job tem de acabar vermelho** (é o que faz o GitHub mandar email).
Padrão: o passo regista a falha (`::error::` + output `failed`), segue com
`exit 0`, e um passo final `if: always()` depois do commit sai 1. Exit 2
continua a ser «nada de novo», nunca erro.

| Workflow | O que passou a ficar vermelho |
|---|---|
| `update-data` | os 7 builders de índices (eram `\|\| echo`) e o backfill PCC/SD |
| `update-classif` | scrape de torneios recentes e backfill-pcc |
| `update-drive` | scrape dos rankings oficiais; verify **só quando as divergências pioram** face ao relatório anterior (há 6 crónicas, 18/10) |
| `update-spain` | também NextCaddy-scorecards e enrich-LGS-stats (estavam fora da verificação final) |
| `update-egr` | qualquer dos 7 passos do scrape |
| `update-cgss-draw` | releitura de voltas em falta (scrape-classif) e pairings |
| `draw-inbox-email` | sem `DRAW_MAIL_USER/PASS`: vermelho no run das 07 UTC e em runs manuais |

`update-drive`: o dia de rankings passou a aceitar segunda até às 08:00 UTC —
o cron de domingo às 21:00 chegou a correr às 00:02 de segunda e saltava-os.

### Disparo pelo Agendador do Windows (2026-10-21)

Os crons do GitHub atrasam 2–6 h (o `daily-digest` das 07:30 correu às 12:52).
Em dia de torneio é tarde: `scripts/agendador/disparar-workflows.ps1` dispara
os workflows com `gh workflow run`, à hora certa, a partir do PC. Os crons
ficam como rede (um run a mais sai logo sem fazer nada).

```powershell
.\scripts\agendador\disparar-workflows.ps1 -Workflow update-cgss-draw.yml
.\scripts\agendador\disparar-workflows.ps1 -Conjunto torneio        # admissions-draws + cgss-draw
.\scripts\agendador\disparar-workflows.ps1 -Conjunto torneio -WhatIf # só mostra
```

Não dispara se já houver um run do mesmo workflow em fila/a correr criado há
menos de 45 min. Log em `logs\disparar-workflows.log`. Precisa do `gh`
autenticado (`gh auth login`) na conta do repo — não mexe em secrets.

**Registar as tarefas (uma vez, no PC que fica ligado — por fazer):**

```powershell
.\scripts\agendador\registar-tarefas.ps1           # mostra o que vai registar
.\scripts\agendador\registar-tarefas.ps1 -Aplicar  # regista
```

| Tarefa | Workflow | Quando (hora local) |
|---|---|---|
| «Golf FPG - resultados draw-only» | `update-cgss-draw.yml` | Sex/Sáb/Dom 13:10, de hora a hora até 19:10 · Seg–Qui 14:10 |
| «Golf FPG - inscricoes e draws» | `update-fpg-admissions-draws.yml` | Sex/Sáb/Dom 21:00 |

Correm como o utilizador, só com sessão iniciada (o `gh` guarda a autenticação
por utilizador; não fica password nenhuma no Agendador); `StartWhenAvailable`
apanha a hora perdida se o PC estiver desligado. Remover:
`Unregister-ScheduledTask -TaskName "<nome>" -Confirm:$false`.

### CI — `ci.yml` (2026-10-21)

`npm ci && npm test && npm run build` em push para `main` e em PR, só quando
mudam `src/`, `api/`, `lib/`, `scripts/` (sem os `*.json` de scope),
`shared/`, `ranking-pja/`, `package*.json` ou configs. Os commits de dados
dos workflows não o disparam (são do `GITHUB_TOKEN` e mexem só em dados).

### Outros acertos (2026-10-21)

- `fetch-depth: 0` → `1` em 12 workflows (nenhum usa histórico; o checkout
  completo do `update-spain` levava 7,5 min). Só o `daily-digest` precisa
  (`rev-list --before`) e mantém.
- `actions/setup-python@v6`; `timeout-minutes` em todos (faltava no
  build-juniors, build-major-catalog e daily-digest).
- Os 6 com Playwright (`update-england`, `update-ffgolf-golfgenius`,
  `uskids-field`, `uskids-results`, `uskids-member-history`,
  `uskids-refresh-all`) correm em **`ubuntu-24.04` fixo**: o
  `playwright install --with-deps` só conhece as versões de Ubuntu que a
  release do Playwright suporta, e o `ubuntu-latest` muda de versão sem aviso.
  Ao actualizar o Playwright, rever se já suporta a imagem nova.

---

## Resumo por email das actualizações — `daily-digest.yml` (2026-08-17)

Um email por dia com o que os scrapers trouxeram:

```
Novo torneio Grand Prix Jeunes em França — 2 escalões:
  escalão POUSSINS, vencedor Victor Canot Januel
Novo torneio Campeonato de España Sub 16 em Espanha, escalão Cadete M, vencedor …
Manuel Goulartt Medeiros tem 2 scorecards novos; participou em Campeonato Nacional Sub-12
Joana Sousa tem 4 scorecards novos; por via de EDS
```

**Sem secrets nenhuns:** o email sai como **issue** (o GitHub notifica o dono do
repo — o corpo menciona `@Medeirosgolfdev` para garantir a notificação mesmo com
subscrição "Participating and @mentions") e a issue é **fechada logo a seguir**,
porque a notificação sai na criação e assim a lista de issues fica limpa. Basta
o `GITHUB_TOKEN` do próprio workflow (`permissions: issues: write`).

### ⚠ O resumo sai do HISTÓRICO DO GIT, não de passos nos workflows de dados

`build-run-digest.js --since "24 hours ago"` resolve a base da janela
(`git rev-list -1 --before`) e faz **um diff** entre esse commit e o `HEAD`.
Consequências deliberadas:

- **Nenhum dos ~20 workflows de dados foi tocado** (excepto o `update-data.yml`
  e o `update-federados.yml`, e só para o aviso imediato) — zero risco de partir
  os pipelines que trazem os dados, que é o que interessa.
- Se um workflow falhar a meio, a janela do dia seguinte apanha na mesma o que
  ficou commitado.
- O `daily-digest.yml` precisa de `fetch-depth: 0` no checkout — com o clone
  raso o `rev-list --before` não encontra a base.

O outro modo (default, sem `--since`) lê a **árvore de trabalho** contra o HEAD
e serve o aviso imediato: corre ANTES do commit, porque o push (reset ao main
mais recente) traz commits de outros workflows e o diff deixaria de ser só
daquele run.

### Avisos imediatos — um email por RUN (2026-08-23)

Dois workflows mandam email no próprio run, sem esperar pelo resumo das 07:30
(que os repete de manhã, de propósito):

| Workflow | Passo | O que vai no email |
|---|---|---|
| `update-data.yml` (scorecards dos nossos) | "Aviso imediato de scorecards novos" | quem tem voltas novas e em que prova (`--source federados --only-players`) |
| `update-federados.yml` (cadastro FPG) | "Resumo por email (quem entrou/saiu do cadastro)" | juniores novos um a um + adultos contados por escalão + quem saiu (`--source cadastro --only-players`) |

Ambos correm ANTES do commit (modo árvore de trabalho), com
`continue-on-error: true` e `permissions: issues: write`.

⚠ **Um resumo só de cadastro tem `tournaments = 0` e `players = 0`.** O filtro do
`send-digest-issue.js` era `counts.tournaments || counts.players`, por isso o
email do `update-federados.yml` era descartado em silêncio — nunca chegava nada.
O filtro (`hasNews`), o título e o cabeçalho contam agora também
`federadosEntrou`/`federadosSaiu`. O rodapé também distingue os dois casos: só
os resumos com `window` é que dizem "últimas 24h".

### Como sabe o que é novo

| O quê | Como |
|---|---|
| Torneios | `scripts/lib/digest-extract.js` — routing por **FORMA** do JSON (`detectFormat`), não por caminho: lgs · rfegMicrosite · nextcaddy · fcg · ffgResultats · jobfile · wagr · flatPlayers · fpgPull · uskidsResults. Uma fonte nova entra sozinha; só o rótulo país/circuito vem do caminho (`SOURCES`). |
| Vencedor | `winnerOf` — o `pos 1` (aceita `"T1"`, `classement`, `rankingPosition`); sentinelas &gt;900 fora. Sem 1º classificado a prova ainda não entra. |
| Escalão | O rótulo REAL da fonte ("Handicap Alevin Femenino", "1ère Série Messieurs", "Under 12 Boys"); só sem rótulo é que se infere do nome (`inferEscalao`). |
| Federados | `diffWhs` por **`score_id`** (não `id` — ver "score_id ≠ id"); a frase distingue `Torn`/`Intern` (→ "participou em X") de `EDS`/`Indiv`/`Import` (→ "por via de &lt;origem&gt;": EDS, volta individual, importada). ⚠ **Actos administrativos fora** — ver abaixo. |
| Cadastro FPG | `diffFederados` sobre o `federados.json` (FedStat=9): quem entrou e quem saiu da lista de activos. Tratado ANTES do filtro de fontes conhecidas — não é um ficheiro de resultados. |

### Cadastro FPG — novos federados e saídas

O `federados.json` (~17,7k activos, refrescado pelo `update-federados.yml`) é
comparado entre os dois extremos da janela. Medido no diff real 05→14 Ago:
**113 entraram, 2 saíram**.

- **Juniores um a um, adultos só contados.** Dos 113, só 16 eram SUB*; listar os
  outros 97 despejava linhas de MidAmateur/Senior que ninguém lê. Os adultos
  saem numa linha de contagem por escalão. Juniores ordenados do escalão mais
  novo para o mais velho.
- **REENTRADA ≠ novo federado.** Quem aparece na lista nova com uma
  `admission_date` ANTERIOR ao snapshot passado não é novo — estava inactivo e
  voltou (caso real: "Antonio Ferreira", inscrito em 2023-08-28, reapareceu em
  Agosto/26). São 3 dos 16 juniores dessa janela.
- **As saídas aparecem sempre todas** (são raras) e mostram a data de admissão
  ("era federado desde 2008-04-03"), que diz há quanto tempo lá estavam.
- **HCP:** `fedHcp` espelha o `HCP_UNESTABLISHED_THRESHOLD = 54` do
  `src/pages/jogadores/filterPlayers.ts` (`isCountableHcp`: h < 54) e trata
  também `hcp_status_id === 99`. A FPG guarda **99 / "Sem HCP"** em quem ainda
  não tem índice — 12 dos 16 juniores da janela 05→14 Ago — logo mostrar "99"
  seria mentira. Nesses casos a linha diz **"sem HCP"** em vez de calar: num
  federado novo isso é informação, o silêncio pareceria falha de leitura.
- ⚠ **Guarda:** se qualquer dos lados vier vazio, `diffFederados` devolve
  `{entrou:[],saiu:[]}`. Sem isto um scrape falhado (o `federados.json` já veio
  com 0 registos a 2026-08-12) anunciava o país inteiro a deixar de ser federado.

### ⚠ Nem toda a linha do WHS é uma volta jogada (2026-08-17)

A FPG regista no histórico WHS **actos administrativos** com
`score_origin: "Torn"` — "Atribuição Inicial WHS", "Transferencia de Clube",
"Atribuição Inicial de Handicap", "Alteração Tipo de Jogador"… São **1105
linhas** no repo. Sem os filtrar, o resumo anunciava *"Fulano tem 1 scorecard
novo; participou em Transferencia de Clube"*. O `isAdminAct` do
`digest-extract.js` deita-os fora (mesma armadilha que o
`build-recent-tournaments.js` já tratava com o tcode `000000000`).

⚠ **`score_id` vem a 0 nesses registos** — 639 dos 640 que têm valor. É
sentinela, não um ID: usá-lo como chave de dedup fazia 639 registos diferentes
colidirem no mesmo `"0"` e só o primeiro passava. O `roundKey` só aceita
`score_id > 0`; sem ID real, a chave é `data|evento|campo`.

Descoberto a investigar um caso concreto: o federado 60382 entrou com índice
**4.7** e a única coisa no WHS dele era a "Atribuição Inicial WHS" (o índice foi
**atribuído**, não jogado) mais uma volta de treino.

### Quatro filtros que evitam um email ilegível

1. **Só fontes conhecidas** — ficheiros que não batem em `SOURCES` (agregados e
   derivados: `recent-tournaments`, `juniors-tournaments*`, `*-rivals`, `*-slim`,
   catálogos) são saltados. Sem isto cada torneio saía 2-3× com rótulos
   diferentes, porque os derivados republicam o que a fonte primária já trouxe.
2. **Dedup global** por `torneio|escalão|vencedor` — a mesma prova chega por mais
   do que um caminho (ex: microsite RFEG + LiveGolfScoring).
3. **Só golfe de jovens** (`isJuniorish`, desligável com `--all`) — as mesmas
   fontes trazem agarradas as competições sociais de clube ("MENS DAY 11/8",
   "Competição Mensal", "Mid-Amateur"). Medido no histórico real: 39 derivados
   + 8 provas de adultos ignorados numa janela de 24h.
4. **WAGR: só provas com PORTUGUESES** (`fromWagr`, 2026-09-09) — é um quarto
   filtro, e só para esta fonte. O WAGR são **~4.000 eventos por ANO do mundo
   inteiro**; sem o corte, o resumo enchia-se de provas sem relação com o
   percurso dos nossos (um júnior na Malásia entrava). Medido sobre 2025+2026:
   **101 provas** com portugueses e vencedor, das quais **28 passam** o filtro
   de jovens — ~14 por ano, uma linha cada 3-4 semanas. As 73 cortadas são
   sobretudo **Collegiate** (52), o golfe universitário americano onde jogam
   portugueses já adultos.

⚠ **O `winner` do WAGR pode trazer VÁRIOS nomes separados por vírgula** (provas
por equipas — 103 dos 8.084 eventos). Passá-lo ao `displayName` dava asneira: ele
lê a vírgula como "APELIDO, Nome" e trocava a ordem, colando os dois num nome
inventado ("Tomas Afonso Araujo,Joao Alves" → "Joao Alves Tomas Afonso Araujo",
uma pessoa que não existe). O `wagrWinners()` separa ANTES de formatar.

### Armadilhas resolvidas (todas com caso real)

- **`\b` não fecha depois de vogal acentuada** (o `\w` do JS é só `[A-Za-z0-9_]`):
  o catalão escreve **BENJAMÍ**/**ALEVÍ** sem `-n` e os padrões falhavam. Idem
  `(?!\d)` em vez de `\b` depois do número, porque a FFG cola o sexo ao escalão
  ("u12G", "u12F").
- **FCG: `game.name` é a JORNADA**, a prova está em `game.tournament.name` —
  senão o email anunciava dezenas de torneios chamados "Jornada 1".
- **FFG: o nome junto vem "APELIDO Nome"** sem vírgula (impossível de desfazer
  depois) → usar `namePrenom`/`nameNom` quando existem.
- **Alguns scrapers guardam o SLUG no campo do nome** (`ffgolf/2026_*.json` traz
  "championnat-de-france-des-jeunes-benjamines") → `prettyTournamentName`.
- **RFEG microsite:** preferir o bloco "Clasificación final" a uma jornada
  isolada — o vencedor de uma jornada não é o vencedor da prova.

### Comandos

```bash
node scripts/build-run-digest.js --since "24 hours ago" --source diario --print
node scripts/build-run-digest.js --since "7 days ago" --print --all   # inclui adultos
node scripts/build-run-digest.js --source federados --only-players --out /tmp/d.json
node scripts/build-run-digest.js --base <sha-do-run-anterior> --source cadastro --only-players --print
node scripts/send-digest-issue.js --file /tmp/d.json --dry-run        # ver o email
```

`workflow_dispatch` do `daily-digest.yml` aceita `since`, `dry_run` e
`include_all`. Testes: `scripts/lib/digest-extract.test.js` (58).
Ambos os scripts engolem os próprios erros — **o resumo nunca pode falhar um
workflow de dados**.
