# Deploy, `output/` e o Deployment Storage do Vercel

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

> **Pastas retiradas do Git em 2026-06-23 (arrumação)** — `scripts_backup/`, `_archive_2026-*/`, `_probe-tmp/`, `diag-out/`, `outputs/` foram removidas do versionamento (`git rm --cached`, continuam em disco) e adicionadas ao `.gitignore`. Eram backups/temporários sem referência no código. `output/{fed}/*` continua tracked de propósito (output do scraper FPG que alimenta as páginas). Os dois scripts browser-console legados da raiz (`pull-torneios.js`, `scrape-drive-aquapor-v7.js`) foram movidos para `scripts/_archive/browser-console/`.

> **⚠ `output/` é PARTILHADO entre o build e o scraper (arrumado 2026-08-20)** —
> o `outDir` do Vite é `output/` (`vite.config.ts`), a MESMA pasta onde o
> scraper FPG escreve `output/{nfed}/…`. Cada `npm run build` copia lá para
> dentro TODO o `public/`: `index.html`, `assets/`, `data/` (~1 GB em Set 2026) e, à raiz,
> os mesmos ficheiros e pastas que existem em `public/` (`Logos/`, `docs/`,
> `reports/`, `logos para outras nupcias/`, `player-stats.json`,
> `analise-percurso-juniores.html`, …). Essas cópias estavam **tracked** — 423
> ficheiros / ~144 MB duplicados de `public/` — por isso correr o build em local
> sujava o `git status` e arriscava entrar lixo nos commits de dados (aconteceu
> a 2026-08-20). Foram retiradas do versionamento (`git rm --cached`, continuam
> em disco) e o `.gitignore` passou a ignorar **tudo à raiz de `output/`**,
> re-incluindo só o que é do scraper: `!/output/[0-9]*/` (os directórios por
> federado, incluindo os que ainda não existem) e
> `!/output/extract-courses-cache.json`. **A fonte de verdade destes ficheiros é
> sempre `public/`** — é lá que os geradores escrevem (`enrich-players.js` →
> `public/player-stats.json`); o que está em `output/` é resíduo do build.
> ⚠ Não mover o `outDir` para `dist/` sem confirmar a *Output Directory* do
> projecto Vercel `golf-fpg` — o deploy de produção depende dela.

## ⚠ Deployment Storage do Vercel — o que entra no deploy (2026-09-06)

A Vercel avisou por email que o plano gratuito tinha chegado a **100% dos 10 GB
de Deployment Storage**. A causa não era tráfego: **cada deployment pesava
~9,1 GB**, por isso um único deployment enchia a conta — e os workflows de dados
fazem ~11 commits/dia, cada um a gerar outro.

Porquê: `output/` é ao mesmo tempo o `outDir` do Vite e a pasta onde o scraper
escreve. O Vercel clona o repo, o Vite copia `public/` (~1 GB) para lá, e o
Output Directory publicado passa a incluir **também as 697 pastas por federado
que estão em git** (8,1 GB). Estava tudo a ser servido publicamente — medido em
produção, `golf-fpg.vercel.app/52884/scorecards.json` devolvia 3,9 MB a quem o
pedisse, e a ficha de cada jogador obrigava o browser a descarregar **10 MB**.

Três correcções, por ordem de retorno:

| # | O quê | Ganho |
|---|---|---|
| 1 | `CROSS_DATA` extraído para `/data/cross-data.json` | −6,4 GB |
| 2 | Universo de jogadores reduzido de 673 para 179 | −5,6 GB |
| 3 | Intermédios do scraper fora do deployment | −0,8 GB |

Resultado medido: **9,1 GB → 1,10 GB por deployment**, e a ficha de um jogador
de 10,2 MB → ~1 MB.

### 1. `CROSS_DATA` vive agora em `/data/cross-data.json`

O `CROSS_DATA` é uma tabela indexada por federado — a MESMA para toda a gente —
e vinha embutida em cada `output/{fed}/analysis/data.json`: 9,4 MB × 678
ficheiros = 6,4 GB, com cada cópia parada num instante diferente (554 de 673
entradas iguais entre dois ficheiros; as outras eram só staleness).

- **Escrita:** `scripts/make-scorecards-ui.js` → `writeCrossData()`, uma vez por
  run (o `crossStats` é sempre calculado sobre TODOS os jogadores descobertos em
  `output/`, mesmo em runs incrementais).
- **Leitura:** `src/data/playerDataLoader.ts` → `loadCrossData()`, um `fetch`
  partilhado e cacheado; pedido em paralelo com o `data.json`, por isso só a
  primeira ficha aberta é que o paga.
- **Retrocompatível:** um `data.json` que ainda traga `CROSS_DATA` embutido
  ganha prioridade sobre o ficheiro partilhado.

⚠ Não voltar a pôr `CROSS_DATA` dentro do `data.json` — é a duplicação O(n²) que
encheu o Deployment Storage.

### 2. `scripts/prune-player-scope.js` — o universo seguido

Reduz `players.json` + as pastas `output/{fed}/` a quem é relevante para o
percurso do Manuel. Regra decidida em 2026-09-06 (constantes no topo do script):

| | Tecto de índice |
|---|---|
| Sub-10 | ≤ 36 |
| Sub-12 | ≤ 25 |
| Sub-14 | ≤ 15 |
| Sub-16 | ≤ 10 |
| Sub-18 | ≤ 5 |

Mais, sempre e independentemente do índice: o Manuel, a **coorte dos 18** de
`build-percurso-path.js` (sem ela a `/analise-percurso-juniores` fica sem
dados) e quem tem tag `PJA`, `inscrito-nacional` ou `simulador` (`TAGS_FIXAS`). Sai quem for adulto sem
essas tags, quem não jogou no ano corrente, e quem está acima do tecto ou sem
índice estabelecido (≥54).

Primeira passagem: 673 → **179 jogadores**, 518 pastas apagadas (24 delas órfãs,
sem entrada em `players.json`). Lista dos removidos em
`data-archive/players-removidos-2026-09-06.json` (fora de `public/`, não vai
para o deploy).

⚠ **Não é perda de dados** — vêm todos da FPG. Repor um jogador é voltar a
pô-lo no `players.json` e correr `node scripts/fpg-scrape-node.js <fed> --full`.
⚠ **Custo real:** as páginas derivadas das voltas dos nossos (`/campos` →
"quem jogou este campo", `/torneios-recentes`, comparação entre jogadores)
passam a cobrir só os jogadores seguidos (179 no corte; 207 a 2026-09-15, com
a tag `simulador`) em vez de 673.

⚠ Quem sai do `players.json` **não desaparece do site**: passa a `_source:
"feds"` no `federadosLoader` e é servido pelo `FederadoOnlyDetail` (cadastro +
WHS ao vivo). O `player-stats.json` e o `hcp-history.json` são MERGE (não
substituição), por isso mantêm as entradas dos removidos — congeladas na data
do corte, já que não há `output/{fed}/` para as recalcular. São ~2,2 MB no
total (`public/player-stats.json` + `public/data/hcp-history.json`); ficam de propósito, porque alimentam métricas de listas que abrangem
todos os federados.

### 3. `scripts/prune-deploy-output.js` — o que NÃO vai para o deploy

Corre a seguir ao `vite build` (está no `npm run build`) e **só quando `VERCEL`
está definido** — em local apagaria ficheiros de que o `pipeline.js` precisa e
que estão em git. Remove do Output Directory o que a app nunca pede:
`output/*/{whs.json,whs-list.json,scorecards.json,summary.json,scorecards/}` e
as caches à raiz. A app só lê `/{fed}/analysis/data.json`.

⚠ Se um dia a app passar a ler outro ficheiro por federado, **acrescentá-lo à
excepção** — senão passa a dar 404 em produção e funciona em local.

### Seguranças — como é que a informação NÃO se perde

O corte do scope não pode custar informação já recolhida. Quatro camadas,
todas verificadas com dados reais a 2026-09-06:

**1. Os derivados PRESERVAM o histórico.** `build-course-players.js` e
`build-recent-tournaments.js` liam `output/` e reescreviam o ficheiro DO ZERO
— com 179 jogadores em vez de 673 isso levaria **61% das voltas** do
`/campos` (42 975) e **48% das participações** do `/torneios-recentes`
(1219 dos 3004 torneios ficavam vazios). Passaram a **fundir** com o
ficheiro em disco: quem já não é seguido continua lá, congelado (um miúdo
que jogou aquele campo naquele dia jogou-o na mesma). Medido depois da
mudança: 110 campos · 9528 ligações · 70 335 voltas e 3004 torneios — **zero
perdas** com 179 jogadores em `output/`. `--rebuild` força reconstrução limpa.

**2. Guarda anti-encolhimento** nos dois builders: recusam escrever (exit 2,
ficheiro anterior intacto) se o build novo perder **>30%** face ao que está em
disco, salvo `--force`. É a guarda que já existia no `scrape-federados-node.js`
e no `discover-fcg-scope.js` — e que salvou o FCG em Julho/Agosto. Testada:
`--rebuild` sem `--force` é recusado com "perda de 60%" / "perda de 41%" e o
ficheiro fica byte a byte igual. O `update-data.yml` já corre estes builders
com `|| echo aviso`, por isso o exit 2 não parte o workflow.

**3. O scrape BRUTO fica arquivado, fora do deploy** —
`scripts/archive-player-raw.js`. Copia `whs.json`, `whs-list.json` e
`scorecards.json` dos jogadores cortados para `data-archive/players/{fed}/`,
que está fora de `public/` e do `outDir`, logo **não entra no deployment**.
São 531 MB de 518 jogadores, e o repositório quase não cresce: os ficheiros
vêm do commit anterior ao corte, por isso são os **mesmos blobs git** que já
estavam no histórico (verificado: mesmo SHA em `data-archive/players/36864/
whs.json` e em `676bf4bea~1:output/36864/whs.json`) — só muda a árvore.
Isto é o que permite **RECONSTRUIR** e não apenas congelar.

```bash
node scripts/archive-player-raw.js --from <sha-antes-do-corte>            # dry-run
node scripts/archive-player-raw.js --from <sha> --apply --scorecards      # aplica
```

**4. Restauro num comando** — `prune-player-scope.js --restore <fed>`: repõe a
ficha no `players.json` (lida das auditorias em `data-archive/`) e o bruto em
`output/{fed}/` (do arquivo, ou diz o `git checkout` a fazer se não estiver
arquivado). Circuito testado de ponta a ponta **sem tocar na FPG**: o fed 2195
foi reposto e o `make-scorecards-ui.js` regenerou-lhe o `data.json` com as
111 voltas e o índice 7,2 a partir do arquivo.

⚠ **A auditoria nunca é substituída.** Duas passagens no mesmo dia caem no
mesmo `players-removidos-YYYY-MM-DD.json`; sem o merge, a segunda (1 jogador)
apagava a primeira (494) e o `--restore` ficava sem as fichas. Apanhado a
testar o restauro — está corrigido, mas é o tipo de erro que só aparece na
segunda corrida.

### O que continua por fazer

- **Apagar deployments antigos no Vercel** — nada disto encolhe os que já
  existem; a conta só desce quando forem apagados. Automatizado em
  `scripts/prune-vercel-deployments.js` + workflow **`prune-vercel-deployments.yml`**
  (Segunda 04:00 UTC, e `workflow_dispatch` com `apply=false` para ver primeiro).
  Usa o secret `VERCEL_TOKEN` que o `analytics-snapshot.yml` já tinha.
  Poupa sempre: o deployment que está EM produção, os que estão a construir/em
  fila, os `--keep N` mais recentes (default 5, margem de rollback) e tudo com
  menos de `--min-age-days` (default 1). A selecção é a função pura `escolher()`,
  testada em `prune-vercel-deployments.test.js` (11 testes) — chamar a API a
  sério num teste apagaria deployments a sério.
  ⚠ O team tem **6 projectos** (`golf-fpg`, `ranking-pja`, `golf`, `golf1`,
  `medeirosgolf`, `uskids-golf`) e TODOS contam para os mesmos 10 GB; sem
  `--project` a limpeza cobre-os a todos.
- `public/data/` são ~1 GB e é agora quase todo o deployment. Os pesos: 
  `ffgolf-resultats` 168 MB, `nextcaddy` ~98 MB, `juniors-tournaments-0{0,1}` 94 MB,
  `uskids-member-history-slim` 40 MB, `juniors.json` 40 MB. ⚠ O `nextcaddy` e o
  `rfegolf-livegolfscoring` (38 MB) **são pedidos pela /rfeg**, torneio a
  torneio, pelos `filePath` do `rfegolf-resultats-index.json`
  (`RFEGPage.tsx`, `cachedFetchJson`) — não podem ir para o `data-archive/`
  sem mudar a RFEGPage.
