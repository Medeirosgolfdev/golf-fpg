# 🗺️ Mapa Definitivo de Scripts
> Análise completa — Março 2026

---

## ✅ MANTER — Workflow manual activo (WORKFLOW.md)

| Script | Para quê |
|--------|----------|
| `login.js` | Login manual → guarda `session.json` |
| `update-torneios.js` | Fase 1: servidor bridge para torneios (scoring.datagolf.pt) |
| `update-jogadores.js` | Fase 2: servidor bridge para perfis (scoring.fpg.pt) |
| `build-drive-sd-lookup.js` | Cruzar scoreIds DRIVE com SD oficial |
| `golf-all.js` | Pipeline de scorecards por jogador |
| `make-scorecards-ui.js` | Gerar `data.json` para o React |
| `pipeline.js` | Orquestrador: liga listas WHS → scorecards em falta |

---

## ✅ MANTER — Workflow GitHub Actions (planeado)

| Script | Para quê |
|--------|----------|
| `fpg-drive-playwright.js` | **Versão mais recente** da Fase 1 automática (referenciada em `update-drive.yml`) |
| `scraper-headless.js` | Substituto headless do bridge (planeado para GH Actions) |

---

## ✅ MANTER — US Kids (workflows próprios)

| Script | Para quê |
|--------|----------|
| `fetch-uskids-discovery.js` | Varrer novos torneios US Kids |
| `fetch-uskids-field.js` | Inscritos e vagas por escalão |
| `fetch-uskids-results.js` | Scorecards completos + leaderboard |

---

## ✅ MANTER — Utilitários partilhados

Usados internamente por `golf-all.js`, `make-scorecards-ui.js`, `process-data.js`:

`process-data.js` · `helpers.js` · `tee-colors.js` · `scorecard-fragment.js` ·
`cross-stats.js` · `eclectic.js` · `hole-stats.js` · `melhorias.js` · `players.js` ·
`enrich-players.js` · `extract-courses.js` · `validate-encoding.js`

---

## 🟡 AVALIAR — Uso pontual, não semanal

| Script | Situação |
|--------|----------|
| `scrape-bluegolf.js` | Scraper para BlueGolf (BJGT/WJGC). Usado para gerar os `wjgc_*.json`. Manter se ainda vais scrape torneios BlueGolf. |
| `update-data.yml` | Workflow GH Actions antigo que usa `golf-all.js`. Verifica se ainda é útil. |

---

## 📦 MOVER PARA ARCHIVE

### Scripts browser-console obsoletos

| Script | Substituído por |
|--------|----------------|
| `scrape-drive-aquapor-v2.js` | `update-torneios.js` |
| `scrape-drive-aquapor-v3.js` | `update-torneios.js` |
| `scrape-drive-aquapor-v4.js` | `update-torneios.js` |
| `scrape-drive-aquapor-v6.js` | `update-torneios.js` |
| `discover-tournaments.js` | `fpg-drive-playwright.js` |
| `discover-tournaments-v2.js` | `fpg-drive-playwright.js` |
| `fpg-update-fase1.js` | `pipeline.js` + `update-jogadores.js` |
| `fpg-update-fase2.js` | `pipeline.js` + `update-jogadores.js` |
| `fpg-download-batch.js` | `update-jogadores.js` |

### Bridges legados

| Script | Substituído por |
|--------|----------------|
| `fpg-bridge.js` | `update-jogadores.js` |
| `fpg-bridge-drive.js` | `fpg-drive-playwright.js` + `scraper-headless.js` |
| `fpg-drive-auto.js` | `fpg-drive-playwright.js` |

### Scripts de diagnóstico e teste

| Script | Motivo |
|--------|--------|
| `diag-endpoints.js` | Browser console, uso único durante investigação |
| `diag-tournaments.js` | Browser console, uso único durante investigação |
| `map-site.js` | Browser console, uso único durante investigação |
| `test-jquery-scorecard.js` | Teste jQuery, browser console |
| `test-login-auto.js` | Teste login, não integrado em nenhum workflow |
| `test-myfpg-scorecard.js` | Teste scorecard, browser console |
| `test-playwright-fpg.js` | Teste Playwright, não integrado em nenhum workflow |
| `test-schema-endpoints.js` | Teste schema, browser console |
| `instalar.js` | Apenas escreve `fpg-drive-playwright.js` em disco |

### Ficheiros de dados temporários

| Ficheiro | Motivo |
|----------|--------|
| `scoring-session.json` | Sessão ASP.NET hardcoded e expirada |
| `session-datagolf.txt` | Sessão em texto simples, expirada |
| `players_json.bak` | Backup manual — usar git em vez disso |
| `missing-feds-list.txt` | Tracking manual temporário |
| `missingdriveplayers.csv` | Tracking manual temporário |
| `drive-classif.json` | Ficheiro intermédio — dados já em `drive-data.json` |

---

## 📋 Comandos para mover para archive

```bash
# Criar pasta archive
mkdir -p archive/browser-console
mkdir -p archive/bridges-legados
mkdir -p archive/testes-diagnostico
mkdir -p archive/dados-temporarios

# Scripts browser-console obsoletos:
mv scrape-drive-aquapor-v2.js archive/browser-console/
mv scrape-drive-aquapor-v3.js archive/browser-console/
mv scrape-drive-aquapor-v4.js archive/browser-console/
mv scrape-drive-aquapor-v6.js archive/browser-console/
mv discover-tournaments.js    archive/browser-console/
mv discover-tournaments-v2.js archive/browser-console/
mv fpg-update-fase1.js        archive/browser-console/
mv fpg-update-fase2.js        archive/browser-console/
mv fpg-download-batch.js      archive/browser-console/

# Bridges legados:
mv fpg-bridge.js       archive/bridges-legados/
mv fpg-bridge-drive.js archive/bridges-legados/
mv fpg-drive-auto.js   archive/bridges-legados/

# Testes e diagnósticos:
mv diag-endpoints.js       archive/testes-diagnostico/
mv diag-tournaments.js     archive/testes-diagnostico/
mv map-site.js             archive/testes-diagnostico/
mv test-jquery-scorecard.js archive/testes-diagnostico/
mv test-login-auto.js      archive/testes-diagnostico/
mv test-myfpg-scorecard.js archive/testes-diagnostico/
mv test-playwright-fpg.js  archive/testes-diagnostico/
mv test-schema-endpoints.js archive/testes-diagnostico/
mv instalar.js             archive/testes-diagnostico/

# Ficheiros de dados temporários:
mv scoring-session.json    archive/dados-temporarios/
mv session-datagolf.txt    archive/dados-temporarios/
mv players_json.bak        archive/dados-temporarios/
mv missing-feds-list.txt   archive/dados-temporarios/
mv missingdriveplayers.csv archive/dados-temporarios/
mv drive-classif.json      archive/dados-temporarios/
```

---

## 🏗️ Arquitectura final (o que fica na raiz)

```
WORKFLOW MANUAL (hoje):
  login.js
    → session.json
  update-torneios.js + [paste browser datagolf]
    → public/data/drive-data.json
  update-jogadores.js + [paste browser fpg]
    → output/{fed}/
    → build-drive-sd-lookup.js → drive-sd-lookup.json
    → golf-all.js → make-scorecards-ui.js → data.json por jogador

GITHUB ACTIONS (planeado):
  fpg-drive-playwright.js  → drive-data.json   (Fase 1 sem browser)
  scraper-headless.js      → output/{fed}/      (Fase 2 sem browser)

US KIDS (workflows próprios, GH Actions):
  fetch-uskids-field.js    → uskids-field.json
  fetch-uskids-results.js  → uskids-results.json

BLUEGOLF/BJGT (uso pontual, quando há torneio novo):
  scrape-bluegolf.js       → wjgc_*.json

UTILITÁRIOS PARTILHADOS (não correr directamente):
  process-data.js, helpers.js, tee-colors.js, scorecard-fragment.js,
  cross-stats.js, eclectic.js, hole-stats.js, melhorias.js, players.js,
  enrich-players.js, extract-courses.js, validate-encoding.js, pipeline.js
```
