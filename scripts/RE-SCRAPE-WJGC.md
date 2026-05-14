# Re-scrape Daily Mail WJGC (2025 + 2026)

## Contexto

Os ficheiros `wjgc_2025_contest34.json` (Boys 10-11 2025) e `wjgc_2026_contest33.json`
(Boys 12-13 2026) foram scrapados pelo `scripts/scrape-bluegolf.js` numa versão
**antiga** que gravava `category: ""` e `course: ""`. O adapter `wjgc.js` caía no
fallback `"Geral"` e perdia ageMin/ageMax/sex — daí os jogadores apareciam mal
processados.

**Já corrigido (2026-05-14):**

1. **`scripts/aggregator/sources/wjgc.js`** — quando `data.category` é vazio,
   extrai a categoria do título do torneio (`extractCategoryFromName`). Resolve
   já os ficheiros existentes sem precisar de re-scrape — basta correr o
   aggregator.

2. **`scripts/scrape-bluegolf.js`** — passa a extrair `category` e `course` da
   página BlueGolf no momento do scrape. Os novos ficheiros vão ter os campos
   preenchidos correctamente.

## Passo 1 — Re-correr o aggregator (rápido, sem scrape)

Antes de scrapar nada, testa se o fix do adapter já resolve:

```powershell
cd C:\golf-fpg
node scripts/aggregator/index.js
npm run dev
```

Abrir `/kids2/u630106` (ficha do Manuel) e procurar os torneios "Daily Mail
WJGC 2025 - Boys 10-11" e "Daily Mail WJGC 2026 - Boys 12-13". O escalão deve
agora aparecer correctamente. Se aparecer, podes parar aqui e seguir para o
passo 2 só se quiseres trazer mais escalões.

## Passo 2 — Re-scrape com `scripts/scrape-bluegolf.js`

Pré-requisitos:

- Playwright instalado: `npm i -D playwright` + `npx playwright install chromium`
- Browser **visível** (não headless) — pode haver CAPTCHA que tens de resolver
  manualmente. O script espera tu resolveres antes de continuar.
- ~3-5 minutos por escalão (depende do nº de jogadores e velocidade do BlueGolf).

### Daily Mail WJGC 2025 (`brjgt251`, Villa Padierna, Fev 2025)

Event index para inspeccionar / encontrar escalões adicionais:
`https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/index.htm`

Contests conhecidos:

```powershell
# Boys 7 & Under
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/20/leaderboard.htm" public/data/wjgc_2025_b7u.json

# Boys 8-9 (se ainda não tens — confirma se wjgc_2025_b89.json está bem)
# (URL não confirmada — usar event index para descobrir contest ID)

# Boys 10-11 (recurar — corrige o ficheiro mau)
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" public/data/wjgc_2025_b1011.json

# Girls 12-13
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/43/leaderboard.htm" public/data/wjgc_2025_g1213.json

# Boys WAGR (combined 14+)
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/101/leaderboard.htm" public/data/wjgc_2025_bwagr.json
```

### Daily Mail WJGC 2026 (`brjgt2537`, Villa Padierna, 25-27 Fev 2026)

Event index: `https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/index.htm`

Contests conhecidos:

```powershell
# Boys 8-9
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/25/leaderboard.htm" public/data/wjgc_2026_b89.json

# Boys 10-11 (recurar — corrige o ficheiro mau)
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm" public/data/wjgc_2026_b1011.json

# Boys 12-13 (recurar)
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm" public/data/wjgc_2026_b1213.json

# Boys WAGR (combined 14-18)
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/5/leaderboard.htm" public/data/wjgc_2026_bwagr.json

# Girls WAGR (combined)
node scripts/scrape-bluegolf.js "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/69/leaderboard.htm" public/data/wjgc_2026_gwagr.json
```

## Passo 3 — Remover ficheiros antigos com nome `contest{N}`

Depois de os novos ficheiros existirem, apagar os antigos para evitar duplicados
no aggregator:

```powershell
Remove-Item public/data/wjgc_2025_contest34.json
Remove-Item public/data/wjgc_2026_contest33.json
Remove-Item public/data/wjgc_2026_b1011_3r.json  # substituído por wjgc_2026_b1011.json
```

## Passo 4 — Regerar canónicos

```powershell
node scripts/aggregator/index.js
npm test
npm run build
```

Confirmar no output do aggregator:

- "Adapter: wjgc" deve listar mais torneios que antes
- "Sanity checks": Manuel + Dmitrii confrontos podem variar

## Notas

- **Boys 14-15 e 16-18** parecem estar combinados na WAGR contest (5 em 2026, 101
  em 2025). Não há contests separados — é a forma como o organizador agrupou
  para WAGR ranking.
- O event `brjgt2431` no URL `https://brjgt.bluegolf.com/bluegolf/brjgt24/event/brjgt2431/`
  é a edição **2024** (Boys 12-18 + Girls 14-18) — incluí-la se quiseres histórico
  mais alargado.
- Para descobrir outros contests do event, abrir o `index.htm` no browser —
  costuma ter um menu com todos os escalões.
