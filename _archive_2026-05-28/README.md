# Arquivo 2026-05-28 — limpeza conservadora

50 ficheiros movidos numa única sessão. **Nenhum deles é referenciado por código activo** (src/, scripts/, .github/workflows/, package.json, vite.config.ts) — confirmado por `grep -r`.

Para reverter qualquer secção, basta um `mv` na direcção contrária.

## Sub-pastas

### `backups-players/` (5 ficheiros)
Backups antigos do `players.json` (Abril 2026). O `players.json` actual continua na raiz.

- `players.json.backup-2026-04-15T15-06-53`
- `players.json.backup-2026-04-15T23-01-27`
- `players.json.backup-2026-04-30T08-11-09`
- `players.json.backup-2026-04-30T09-47-45`
- `players.json.restored`

### `backups-publicdata/` (5 ficheiros)
Backups antigos em `public/data/`. Originais activos continuam em `public/data/`.

- `away-courses.backup-20260521.json`
- `master-courses.backup-20260521.json`
- `licencia-dob-lookup.json.bak-2026-05-09T23-15-43`
- `licencia-dob-lookup.json.bak-2026-05-09T23-36-10`
- `uskids-member-history-slim.json.bak-1779968072637`

Nota: `fpg-admissions-draws.backup.json` ficou em `public/data/` porque é escrito activamente pelos scripts `merge-fpg-admissions-draws.js` e `scrape-fpg-admissions-draws-node.js`.

### `logs-debug/` (7 ficheiros)
Logs e ficheiros de scratch da raiz.

- `.build.log`, `build.log`, `build-eg.log` — outputs de builds anteriores
- `agg-log.txt` — log do aggregator
- `__synctest.txt` — teste de sync (21 bytes)
- `_run-rivals.mjs` — teste (21 bytes)
- `removidos-preview.txt` — preview de limpeza anterior

### `debug-html/` (4 ficheiros)
HTMLs gerados para debug, não servidos pela app.

- `debug_contest13.html`, `debug_contest77.html`, `debug_contest121.html` (128 bytes cada, placeholders vazios)
- `european_2026_b12_analise.html` — análise standalone

### `eowagr-duplicados-raiz/` (13 ficheiros)
Cópias IDÊNTICAS (byte-a-byte) aos JSON em `public/data/eowagr25_contest{id}.json`. O Vite serve a versão de `public/data/` — estas eram só ruído.

`eowagr25_contest{5,13,17,21,73,77,109,121,132,151,155,159,162}.json`

### `eowagr-orfaos-raiz/` (12 ficheiros)
Outputs órfãos de uma sessão de testes. Zero refs em src/, scripts/ ou public/data/.

`eowagr25_contest{1,25,53,57,69,85,89,113,125,174,178,182}.json`

### `scripts-duplicados/` (3 ficheiros)

- `login.js` — versão da raiz, funcionalmente idêntica a `scripts/login.js`. `package.json` usa a de scripts/.
- `fetch-uskids-member-history.js.raiz-antigo-2026-04-02` — versão de Abril (23 KB); `scripts/fetch-uskids-member-history.js` tem a versão de Maio (45 KB) que é a usada pelo workflow `uskids-member-history.yml`.
- `vit-config(versão que ia buscar directo sempre a federacao).ts` — cópia antiga do `vite.config.ts`.

### `outputs-orfaos/` (1 ficheiro)

- `tUpdated` — ficheiro sem extensão na raiz, output antigo.

## Critérios de selecção

Para cada candidato a mover, validei:

1. **Zero `grep` em `src/`, `scripts/`, `.github/workflows/`, `package.json`, `vite.config.ts`** (excluindo `_archive*`, `_chunks*` e o próprio arquivo).
2. Para duplicados: confirmação que o ficheiro activo continua a existir no destino correcto.
3. Para backups: confirmação que o ficheiro original "vivo" continua presente na sua localização.

## NÃO movido (armadilhas detectadas)

- `melhorias.json` — importado via `import("../melhorias.json")` em `src/App.tsx`.
- `course-aliases.json` — input de `scripts/extract-courses.js` via `process.cwd()`.
- `session.json` — gerado por `login.js`, lido por scripts.
- Todos os scripts da raiz documentados como activos em `CLAUDE.md`: `golf-all.js`, `pipeline.js`, `scraper-headless.js`, `update-jogadores.js`, `update-torneios.js`, `pull-clubes.js`, `pull-jovens.js`, `pull-torneios.js`, `scrape-drive-aquapor-v7/v8/v9-so-mes-actual.js`, `fpg-download-whs-only.js`, `find-tcodes.js`, `fetch-player-results-all.js`, `fetch-playerresults-browser.js`, `fetch-playerresults-full.js`, `scrape-santo-da-serra-v2.js`, `scrape-consola-inscritos-campeonato-nacional.js`, `uskids_scrape_courses - PERFEITO COM DISTANCIAS.js`.
- Pastas activas: `lib/`, `shared/`, `data-archive/`, `chrome-profile-automation/`, `output/`, `node_modules/`.

## Bug latente detectado mas não corrigido

`package.json` declara `"scrape": "node scripts/golf-all.js"`, mas `scripts/golf-all.js` não existe — só existe em `golf-all.js` (raiz). Quem correr `npm run scrape` falha. Resolver no futuro: mover `golf-all.js` → `scripts/` e actualizar as referências no `CLAUDE.md`.
