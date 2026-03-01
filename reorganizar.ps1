<#
.SYNOPSIS
    reorganizar.ps1 — Reorganizar scripts do GOLF-FPG

.DESCRIPTION
    1. Cria pastas: scripts/, scripts/browser/, scripts/_archive/
    2. Move scripts de pipeline para scripts/
    3. Move scripts de browser para scripts/browser/
    4. Move scripts de diagnóstico para scripts/_archive/
    5. Aplica correcções de require/path nos ficheiros movidos
    6. Actualiza package.json

.NOTES
    Correr na raiz do projecto: cd C:\GOLF-FPG; .\reorganizar.ps1
    Fazer git commit ANTES de correr, por segurança.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  GOLF-FPG - Reorganizar Scripts" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verificar que estamos na raiz do projecto
if (-not (Test-Path "package.json") -or -not (Test-Path "golf-all.js")) {
    Write-Host "ERRO: Corre este script na raiz do projecto (C:\GOLF-FPG)" -ForegroundColor Red
    Write-Host "      Certifica-te que golf-all.js existe antes de correr." -ForegroundColor Red
    exit 1
}

# ──────────────────────────────────────────────
# PASSO 1: Criar pastas
# ──────────────────────────────────────────────
Write-Host "[1/7] Criar pastas..." -ForegroundColor Yellow

New-Item -ItemType Directory -Path "scripts" -Force | Out-Null
New-Item -ItemType Directory -Path "scripts\browser" -Force | Out-Null
New-Item -ItemType Directory -Path "scripts\_archive" -Force | Out-Null

Write-Host "  OK: scripts/, scripts/browser/, scripts/_archive/`n" -ForegroundColor Green

# ──────────────────────────────────────────────
# PASSO 2: Mover scripts de PIPELINE para scripts/
# ──────────────────────────────────────────────
Write-Host "[2/7] Mover scripts de pipeline..." -ForegroundColor Yellow

$pipeline = @(
    "golf-all.js",
    "login.js",
    "make-scorecards-ui.js",
    "fpg-bridge.js",
    "enrich-players.js",
    "extract-courses.js",
    "scrape-bluegolf.js",
    "validate-encoding.js"
)

foreach ($f in $pipeline) {
    if (Test-Path $f) {
        Move-Item $f "scripts\$f" -Force
        Write-Host "  $f -> scripts\$f" -ForegroundColor Green
    } else {
        Write-Host "  $f nao encontrado (ignorado)" -ForegroundColor DarkGray
    }
}

# ──────────────────────────────────────────────
# PASSO 3: Mover scripts de BROWSER para scripts/browser/
# ──────────────────────────────────────────────
Write-Host "`n[3/7] Mover scripts de browser..." -ForegroundColor Yellow

$browser = @(
    "fpg-browser-download.js",
    "fpg-download-myfpg.js",
    "fpg-import.js"
)

foreach ($f in $browser) {
    if (Test-Path $f) {
        Move-Item $f "scripts\browser\$f" -Force
        Write-Host "  $f -> scripts\browser\$f" -ForegroundColor Green
    } else {
        Write-Host "  $f nao encontrado (ignorado)" -ForegroundColor DarkGray
    }
}

# ──────────────────────────────────────────────
# PASSO 4: Mover scripts de DIAGNOSTICO para _archive
# ──────────────────────────────────────────────
Write-Host "`n[4/7] Arquivar scripts de diagnostico..." -ForegroundColor Yellow

$archive = @(
    "check-data.js",
    "diagnose-fields.js",
    "diagnose-hcp.js",
    "diagnose-hcp2.js",
    "diagnose-hcp3.js",
    "diagnose-hcp4.js",
    "test-dual-schema.js",
    "test-fpg.js",
    "test-fpg2.js",
    "test-schema2-hcp.js",
    "debug_leaderboard.html"
)

foreach ($f in $archive) {
    if (Test-Path $f) {
        Move-Item $f "scripts\_archive\$f" -Force
        Write-Host "  $f -> scripts\_archive\$f" -ForegroundColor DarkYellow
    } else {
        Write-Host "  $f nao encontrado (ignorado)" -ForegroundColor DarkGray
    }
}

# ──────────────────────────────────────────────
# PASSO 5: Corrigir require() e paths nos ficheiros movidos
# ──────────────────────────────────────────────
Write-Host "`n[5/7] Corrigir paths nos ficheiros movidos..." -ForegroundColor Yellow

# Helper: ler e escrever ficheiro preservando encoding
function Patch-File {
    param([string]$Path, [string]$Label)
    Write-Host "  ${Path}: $Label" -ForegroundColor Green
}

# ─── make-scorecards-ui.js ───
# require("./lib/...") -> require("../lib/...")
$file = "scripts\make-scorecards-ui.js"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))
    $content = $content.Replace('require("./lib/', 'require("../lib/')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Patch-File $file 'require("./lib/") -> require("../lib/")'
}

# ─── enrich-players.js ───
# require("./lib/...") + __dirname paths
$file = "scripts\enrich-players.js"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))
    $content = $content.Replace('require("./lib/', 'require("../lib/')
    $content = $content.Replace('path.join(__dirname, "players.json")',              'path.join(__dirname, "..", "players.json")')
    $content = $content.Replace('path.join(__dirname, "output")',                    'path.join(__dirname, "..", "output")')
    $content = $content.Replace('path.join(__dirname, "public", "player-stats.json")', 'path.join(__dirname, "..", "public", "player-stats.json")')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Patch-File $file 'require + __dirname corrigidos'
}

# ─── golf-all.js ───
# Refs a outros scripts que tambem foram movidos para scripts/
$file = "scripts\golf-all.js"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))
    $content = $content.Replace('path.join(process.cwd(), "make-scorecards-ui.js")', 'path.join(process.cwd(), "scripts", "make-scorecards-ui.js")')
    $content = $content.Replace('path.join(process.cwd(), "enrich-players.js")',     'path.join(process.cwd(), "scripts", "enrich-players.js")')
    $content = $content.Replace('path.join(process.cwd(), "extract-courses.js")',    'path.join(process.cwd(), "scripts", "extract-courses.js")')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Patch-File $file 'refs a make-scorecards-ui/enrich/extract corrigidas'
}

# ─── fpg-bridge.js ───
# Chama golf-all.js via execSync
$file = "scripts\fpg-bridge.js"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))
    $content = $content.Replace('node golf-all.js --skip-download', 'node scripts/golf-all.js --skip-download')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Patch-File $file 'execSync ref a golf-all.js corrigida'
}

# ─── validate-encoding.js ───
# Usa __dirname para encontrar ficheiros na raiz do projecto.
# Agora que esta em scripts/, precisa de subir um nivel.
# Solucao: const ROOT = path.join(__dirname, "..")
$file = "scripts\validate-encoding.js"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))

    # Inserir constante ROOT logo apos require("path")
    $anchor = 'const path = require("path");'
    $insert = 'const path = require("path");' + "`n" + 'const ROOT = path.join(__dirname, "..");'
    $content = $content.Replace($anchor, $insert)

    # Substituir __dirname por ROOT nos paths do projecto
    $content = $content.Replace('path.join(__dirname, "players.json")',                     'path.join(ROOT, "players.json")')
    $content = $content.Replace('path.join(__dirname, "public", "data", "players.json")',   'path.join(ROOT, "public", "data", "players.json")')
    $content = $content.Replace('path.join(__dirname, "output")',                           'path.join(ROOT, "output")')
    $content = $content.Replace('path.join(__dirname, "src")',                              'path.join(ROOT, "src")')
    $content = $content.Replace('path.relative(__dirname,',                                 'path.relative(ROOT,')
    $content = $content.Replace('path.join(__dirname, "lib")',                              'path.join(ROOT, "lib")')
    # Pipeline files: scripts locais usam __dirname, lib/ usa ROOT
    $content = $content.Replace('path.join(__dirname, rel)',                                'path.join(rel.startsWith("lib") ? ROOT : __dirname, rel)')

    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Patch-File $file '__dirname -> ROOT (raiz do projecto)'
}

# ─── fpg-import.js (em scripts/browser/) ───
# Chama golf-all.js
$file = "scripts\browser\fpg-import.js"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))
    $content = $content.Replace('path.join(process.cwd(), "golf-all.js")', 'path.join(process.cwd(), "scripts", "golf-all.js")')
    $content = $content.Replace('node golf-all.js --skip-download', 'node scripts/golf-all.js --skip-download')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Patch-File $file 'ref a golf-all.js corrigida'
}

# ──────────────────────────────────────────────
# PASSO 6: Actualizar package.json
# ──────────────────────────────────────────────
Write-Host "`n[6/7] Actualizar package.json..." -ForegroundColor Yellow

$file = "package.json"
$content = [System.IO.File]::ReadAllText((Resolve-Path $file))
$content = $content.Replace('"login": "node login.js"',                    '"login": "node scripts/login.js"')
$content = $content.Replace('"scrape": "node golf-all.js"',                '"scrape": "node scripts/golf-all.js"')
$content = $content.Replace('"scorecards": "node make-scorecards-ui.js"',  '"scorecards": "node scripts/make-scorecards-ui.js"')
[System.IO.File]::WriteAllText((Resolve-Path $file), $content)
Write-Host "  package.json : npm scripts actualizados" -ForegroundColor Green

# ──────────────────────────────────────────────
# PASSO 7: Actualizar GitHub Actions workflow
# ──────────────────────────────────────────────
Write-Host "`n[7/7] Actualizar GitHub Actions workflow..." -ForegroundColor Yellow

$file = ".github\workflows\update-data.yml"
if (Test-Path $file) {
    $content = [System.IO.File]::ReadAllText((Resolve-Path $file))
    $content = $content.Replace('node golf-all.js $MODE $FEDS', 'node scripts/golf-all.js $MODE $FEDS')
    # generate-index.js nao existe no projecto - comentar essa linha
    $content = $content.Replace('run: node generate-index.js', '# run: node generate-index.js  # TODO: script nao existe, remover este step se nao for necessario')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content)
    Write-Host "  $file : golf-all.js path corrigido + generate-index.js comentado" -ForegroundColor Green
} else {
    Write-Host "  $file nao encontrado (ignorado)" -ForegroundColor DarkGray
}

# ──────────────────────────────────────────────
# VERIFICACAO
# ──────────────────────────────────────────────
Write-Host "`n──────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  VERIFICACAO" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────" -ForegroundColor Cyan

$allOk = $true

# Verificar ficheiros existem nos novos locais
foreach ($f in $pipeline) {
    if (-not (Test-Path "scripts\$f")) {
        Write-Host "  FALTA: scripts\$f" -ForegroundColor Red
        $allOk = $false
    }
}
foreach ($f in $browser) {
    if (-not (Test-Path "scripts\browser\$f")) {
        Write-Host "  FALTA: scripts\browser\$f" -ForegroundColor Red
        $allOk = $false
    }
}

# Verificar package.json
$pkg = [System.IO.File]::ReadAllText((Resolve-Path "package.json"))
if ($pkg.Contains("scripts/login.js") -and $pkg.Contains("scripts/golf-all.js") -and $pkg.Contains("scripts/make-scorecards-ui.js")) {
    Write-Host "  package.json: OK" -ForegroundColor Green
} else {
    Write-Host "  package.json: paths NAO actualizados!" -ForegroundColor Red
    $allOk = $false
}

# Verificar require paths
$msu = [System.IO.File]::ReadAllText((Resolve-Path "scripts\make-scorecards-ui.js"))
if ($msu.Contains('require("../lib/')) {
    Write-Host "  make-scorecards-ui.js require: OK" -ForegroundColor Green
} else {
    Write-Host "  make-scorecards-ui.js require: NAO corrigido!" -ForegroundColor Red
    $allOk = $false
}

$ep = [System.IO.File]::ReadAllText((Resolve-Path "scripts\enrich-players.js"))
if ($ep.Contains('require("../lib/') -and $ep.Contains('"..", "players.json"')) {
    Write-Host "  enrich-players.js require + paths: OK" -ForegroundColor Green
} else {
    Write-Host "  enrich-players.js: NAO corrigido!" -ForegroundColor Red
    $allOk = $false
}

$ga = [System.IO.File]::ReadAllText((Resolve-Path "scripts\golf-all.js"))
if ($ga.Contains('"scripts", "make-scorecards-ui.js"') -and $ga.Contains('"scripts", "enrich-players.js"')) {
    Write-Host "  golf-all.js refs internas: OK" -ForegroundColor Green
} else {
    Write-Host "  golf-all.js: refs NAO corrigidas!" -ForegroundColor Red
    $allOk = $false
}

$ve = [System.IO.File]::ReadAllText((Resolve-Path "scripts\validate-encoding.js"))
if ($ve.Contains('const ROOT = path.join(__dirname, "..")')) {
    Write-Host "  validate-encoding.js ROOT: OK" -ForegroundColor Green
} else {
    Write-Host "  validate-encoding.js: ROOT NAO inserido!" -ForegroundColor Red
    $allOk = $false
}

# Verificar workflow
if (Test-Path ".github\workflows\update-data.yml") {
    $wf = [System.IO.File]::ReadAllText((Resolve-Path ".github\workflows\update-data.yml"))
    if ($wf.Contains('node scripts/golf-all.js')) {
        Write-Host "  update-data.yml: OK" -ForegroundColor Green
    } else {
        Write-Host "  update-data.yml: path NAO actualizado!" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host "`n  TUDO OK!" -ForegroundColor Green
} else {
    Write-Host "`n  Existem problemas - verifica manualmente." -ForegroundColor Red
}

# ──────────────────────────────────────────────
# RESUMO
# ──────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CONCLUIDO!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host @"

  Estrutura final:
    scripts/              <- 8 scripts de pipeline
    scripts/browser/      <- 3 scripts de browser + import
    scripts/_archive/     <- 11 ficheiros de diagnostico

  Testa com:
    npm run login
    npm run scrape -- 52884
    npm run scorecards -- --all

  Tambem podes correr directamente:
    node scripts/golf-all.js --refresh --all
    node scripts/fpg-bridge.js --all --refresh
    node scripts/enrich-players.js
    node scripts/validate-encoding.js

  Se algo falhar, reverte com: git checkout -- .

"@
