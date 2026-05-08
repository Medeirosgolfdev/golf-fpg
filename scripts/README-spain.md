# Scrapers Espanha — RFEGolf + NextCaddy

Pipeline para descobrir e scrapar torneios juvenis (Sub-10 a Sub-18) das duas
plataformas espanholas:

- **rfegolf.es** (Real Federación Española de Golf — torneios nacionais)
- **nextcaddy.com** (Real Federación Andaluza de Golf + Federación Madrid)

Output: `public/data/rfegolf-resultats/{compId}.json` e
`public/data/nextcaddy/{tourId}.json`.

## Conteúdos extraídos

### RFEGolf (`scrape-rfegolf-node.js`)

Para cada CompId apanha:

- **Metadata**: nome, dateStart/dateEnd, course, courseClubId, players, hcpLimitMen/Women,
  mode (Individual/Por Equipos), style (Stroke Play, Match Play, etc.), category, sex,
  federation organising committee.
- **Inscritos** (5 listas separadas):
  - `admitidos` — confirmados
  - `reservas` — em lista de espera
  - `bajas` — desistências
  - `invitados` — convidados
  - `noAdmitidos` — recusados
  - `provisional` — pré-fecho da inscrição
- Cada jogador: `pos`, `name`, `licencia` (federation code), `pais`, `hcp`, `catEdad`
  (Alevín/Benjamín/Infantil/Cadete/Sub-18), `sexo`, `club`, `dob` (data de nascimento!),
  `estado`.

**Nota de limitação**: scorecards ronda-a-ronda não vêm via fetch directo — o portal
exige simulação de postback ASP.NET com ViewState. A tab de Resultados está vazia em
muitos torneios passados (purgada). O valor do feed está nos *inscritos* — DOB +
categoria + clube por 100+ jogadores por torneio é gold para tracking de rivais.

### NextCaddy (`scrape-nextcaddy.js`)

Para cada tour ID:

- **Metadata**: competitionName, organizer (federación), URL, view.
- **Tabs**: snapshot de TODAS as tabelas renderizadas em cada tab
  (inscritos/horarios/clasificaciones/estadisticas) — array de `{id, className, rows}`
  onde rows é `string[][]` (matriz de células).
- Como cada plataforma renderiza as tabelas com layout diferente, o output é
  semi-estruturado (cabe ao parser pós-scrape mapear para schema final).

## Comandos para correr no PC

### 1. RFEGolf — Discovery dos últimos 5 anos (~10-15 min)

```powershell
cd C:\golf-fpg
node scripts/discover-rfegolf-comps.js --range 12700-16250 --concurrency 10 --out scripts/rfegolf-scope.json
```

Cobre 2021-2026 inclusive (CompId 12700 ≈ 2020 fim, CompId 16250 ≈ 2026 fim).
O ficheiro `scripts/rfegolf-scope.json.partial` é actualizado a cada 100 IDs
processados — útil se interromperes a meio.

Range mais agressivo ou conservador:

```powershell
# Só 2024-2026 (~5 min)
node scripts/discover-rfegolf-comps.js --range 15300-16250 --concurrency 10

# Só 2026 (~2 min)
node scripts/discover-rfegolf-comps.js --range 15870-16250 --concurrency 10
```

Output esperado: ~80-150 torneios juvenis por ano × 6 anos = ~600-900 torneios.

### 2. RFEGolf — Scrape em massa

```powershell
node scripts/scrape-rfegolf-node.js --scope scripts/rfegolf-scope.json --concurrency 5 --skip-existing --pretty
```

Tempo estimado: ~600 torneios × ~2s/torneio ÷ 5 paralelo = ~5 min.

Cada CompId gera `public/data/rfegolf-resultats/{compId}.json`. Já existem 6 POC
JSONs lá (CompId 14500/15956/16179/16180/16187/16192).

### 3. NextCaddy — Discovery por ano

```powershell
# 1 = Comité Infantil y Juvenil
node scripts/scrape-nextcaddy.js --discover --year 2026 --comite 1
node scripts/scrape-nextcaddy.js --discover --year 2025 --comite 1
node scripts/scrape-nextcaddy.js --discover --year 2024 --comite 1
node scripts/scrape-nextcaddy.js --discover --year 2023 --comite 1
node scripts/scrape-nextcaddy.js --discover --year 2022 --comite 1
node scripts/scrape-nextcaddy.js --discover --year 2021 --comite 1
```

Cada um gera `scripts/nextcaddy-scope-{year}-c1.json`. **Atenção**: o filtro
`form_anio` não é fiável — devolve 1281 tours independentemente do ano. Vais
provavelmente querer filtrar manualmente para os "Circuitos Juvenis Zona X",
"Circuito Benjamín Zona X", "Final Circuito Juvenil", "Match Play Invierno",
"Copa Andalucía Juvenil", excluindo torneios privados/escolas/etc.

Sugestão rápida de filtro (PowerShell):

```powershell
node -e "
const fs=require('fs');
const sc=JSON.parse(fs.readFileSync('scripts/nextcaddy-scope-2026-c1.json'));
const KEEP=/Circuito (Juvenil|Benjamin|Benjam[ií]n)|Match Play|Pequecircuito|Copa Andaluc[ií]a|Final Circuito|Sub[\s-]?\d+|Internacional/i;
const out=sc.tours.filter(t=>KEEP.test(t.name));
fs.writeFileSync('scripts/nextcaddy-scope-2026-filtered.json', JSON.stringify({...sc, tours: out, total: out.length}, null, 2));
console.log('filtered:', out.length);
"
```

### 4. NextCaddy — Scrape em massa

```powershell
# Pré-req: Playwright + Chromium
npm i playwright
npx playwright install chromium

# Run (headless por default; usa --headed para debug visual)
node scripts/scrape-nextcaddy.js --scope scripts/nextcaddy-scope-2026-filtered.json
```

Tempo estimado: ~50 tours × ~30s/tour = ~25 min por ano (mais lento que
RFEGolf por causa do browser). Se for demais, scrapa apenas os "Circuito Juvenil
Zona W/E/C" + "Final Circuito" + "Copa Andalucía" — ~10-20 tours por ano.

## Próximos passos (para sessão futura)

- [ ] Construir página `/torneios-espana` no app que lê estes JSON (similar ao
      `NacionaisJovensPage` mas para Espanha).
- [ ] Integrar dataRegistry: `rfegolf-resultats-index.json` (gerado a partir dos
      JSON individuais) e cross-link para o tracker de rivais (KIDSdataLoader).
- [ ] Workflow GitHub Actions semanal (corre Seg 04:00 UTC, similar ao
      `update-ffgolf-resultats.yml`). Pré-req: garantir que o IP do GH Actions
      não está bloqueado pelo rfegolf.es.
- [ ] Match cross-source: muitos jogadores aparecem em RFEGolf E NextCaddy. Usar
      `licencia` (AM* / CM*) como join key.

## Estado actual

✅ `scripts/scrape-rfegolf-node.js` — validado em 5 CompIds (2022-2026), 380+
inscritos extraídos com DOB completo. POC já em `public/data/rfegolf-resultats/`.

✅ `scripts/discover-rfegolf-comps.js` — validado num range pequeno (4 Sub-18
Masculino 2022 encontrados em 14495-14510).

✅ `scripts/scrape-nextcaddy.js` — escrito mas não testado (precisa Playwright
local; o sandbox onde estive não tem browser).

⏳ Discovery completo + scrape em massa — para correr no PC.
