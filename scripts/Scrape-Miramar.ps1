<#
.SYNOPSIS
  Recolhe a classificacao de um torneio do scoring.datagolf.pt (/pt) sem browser.

.DESCRIPTION
  Reproduz o que o scripts/scrape-classif-node.js faz, em PowerShell puro.
  O truque esta na ORDEM: a aplicacao ASP.NET guarda o contexto do torneio NA
  SESSAO. Ir direto ao Classifications.aspx (ou ao PageMethod) da sempre
  HTTP 500 "Runtime Error" — nao e falta de cookies, e falta de sessao.

    1. GET  /pt/linkpage.aspx?page=classif&club=..&tourn=..&ack=..   <- cria a sessao
    2. POST /pt/classif.aspx/ClassifLST                              <- os dados
    3. POST /pt/classif.aspx/ScoreCard        (opcional, -Scorecards) <- buraco a buraco

  A -WebSession do PowerShell guarda os cookies entre os passos, que e
  exactamente o que faltava ao curl.

.EXAMPLE
  .\Scrape-Miramar.ps1 -TCode 10652 -Round 1
  .\Scrape-Miramar.ps1 -TCode 10652 -Round 1 -Scorecards -Out d1.json
  .\Scrape-Miramar.ps1 -TCode 10653 -Round 1        # o outro torneio (Sub-10?)
#>
[CmdletBinding()]
param(
  [string]$CCode = "003",          # clube: 003 = Miramar
  [Parameter(Mandatory)][string]$TCode,
  [int]$Round = 1,
  [switch]$Scorecards,             # tambem puxa o cartao buraco a buraco
  [string]$Out,                    # grava JSON; sem isto so mostra no ecra
  [int]$PageSize = 150
)

$ErrorActionPreference = "Stop"
$BASE = "https://scoring.datagolf.pt/pt"
$ACK  = "8428ACK987"
$UA   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# ── 1. Warmup: cria a sessao ASP.NET ────────────────────────────────────────
Write-Host "[1/3] Sessao..." -NoNewline
$warm = "$BASE/linkpage.aspx?page=classif&club=$CCode&tourn=$TCode&ack=$ACK"
try {
  Invoke-WebRequest -Uri $warm -SessionVariable sess -UserAgent $UA `
    -Headers @{ "Accept-Language" = "pt-PT,pt;q=0.9"; "Referer" = "$BASE/" } `
    -TimeoutSec 60 -UseBasicParsing | Out-Null
  Write-Host " ok" -ForegroundColor Green
} catch {
  Write-Host " FALHOU" -ForegroundColor Red
  Write-Host "  $($_.Exception.Message)"
  Write-Host "  Sem esta sessao os passos seguintes dao 500. Abre o mesmo URL no browser para confirmar que o torneio existe:"
  Write-Host "  $warm"
  exit 1
}

# ── 2. Classificacao (paginada) ─────────────────────────────────────────────
function Invoke-PageMethod {
  param([string]$Path, [string]$Query, [hashtable]$Body)
  $uri = "$BASE/$Path" + $(if ($Query) { "?$Query" } else { "" })
  $r = Invoke-WebRequest -Uri $uri -Method POST -WebSession $sess -UserAgent $UA -TimeoutSec 90 -UseBasicParsing `
       -ContentType "application/json; charset=utf-8" `
       -Headers @{
         "X-Requested-With" = "XMLHttpRequest"
         "Accept"           = "application/json, text/javascript, */*; q=0.01"
         "Origin"           = "https://scoring.datagolf.pt"
         "Referer"          = "$BASE/Classifications.aspx"
       } `
       -Body ($Body | ConvertTo-Json -Compress -Depth 5)
  $j = $r.Content | ConvertFrom-Json
  if ($j.PSObject.Properties.Name -contains "d") { return $j.d } else { return $j }
}

Write-Host "[2/3] Classificacao..." -NoNewline
$todos = @(); $inicio = 0
while ($true) {
  $body = @{
    Classi = "1"; tclub = $CCode; tcode = $TCode
    classiforder = "1"; classiftype = "I"; classifroundtype = "D"
    scoringtype = "1"; round = "$Round"
    members = "0"; playertypes = "0"; gender = "0"
    minagemen = "0"; maxagemen = "999"; minageladies = "0"; maxageladies = "999"
    minhcp = "-8"; maxhcp = "99"; idfilter = "-1"
    jtStartIndex = "$inicio"; jtPageSize = "$PageSize"; jtSorting = "score_id DESC"
  }
  $qs = "jtStartIndex=$inicio&jtPageSize=$PageSize&jtSorting=" + [uri]::EscapeDataString("score_id DESC")
  $d = Invoke-PageMethod -Path "classif.aspx/ClassifLST" -Query $qs -Body $body
  if ($d.Result -ne "OK") { Write-Host " Result=$($d.Result)" -ForegroundColor Yellow; break }
  $todos += $d.Records
  if ($d.Records.Count -lt $PageSize) { break }
  $inicio += $PageSize
  Start-Sleep -Milliseconds 150
}
Write-Host " $($todos.Count) jogadores" -ForegroundColor Green
if ($todos.Count -eq 0) {
  Write-Host "  Zero registos: ou a ronda $Round ainda nao fechou, ou o tcode nao e este." -ForegroundColor Yellow
}

# ── 3. Scorecards (opcional) ────────────────────────────────────────────────
$cartoes = @{}
if ($Scorecards -and $todos.Count -gt 0) {
  Write-Host "[3/3] Cartoes..." -NoNewline
  $n = 0
  foreach ($p in $todos) {
    if (-not $p.score_id) { continue }
    $qs = "score_id=$($p.score_id)&tclub=$CCode&tcode=$TCode&scoringtype=1&classiftype=I&classifround=$Round"
    $b  = @{ score_id = "$($p.score_id)"; tclub = $CCode; tcode = $TCode
             scoringtype = "1"; classiftype = "I"; classifround = "$Round" }
    try {
      $d = Invoke-PageMethod -Path "classif.aspx/ScoreCard" -Query $qs -Body $b
      if ($d.Result -eq "OK" -and $d.Records.Count -gt 0) { $cartoes[[string]$p.score_id] = $d.Records[0]; $n++ }
    } catch { }
    Start-Sleep -Milliseconds 150
  }
  Write-Host " $n cartoes" -ForegroundColor Green
} else { Write-Host "[3/3] Cartoes: saltado (usa -Scorecards)" }

# ── Saida ───────────────────────────────────────────────────────────────────
$tabela = $todos | ForEach-Object {
  [pscustomobject]@{
    Pos     = $_.pos
    Jogador = $_.player_name
    Clube   = $_.club_name
    Gross   = $_.gross
    ToPar   = $_.topar
    Hcp     = $_.playing_hcp
    ScoreId = $_.score_id
  }
}
$tabela | Sort-Object { [int]($_.Pos -replace '\D','') } | Format-Table -AutoSize

if ($Out) {
  [pscustomobject]@{
    scrapedAt = (Get-Date).ToString("o")
    ccode = $CCode; tcode = $TCode; round = $Round
    playerCount = $todos.Count
    players = $todos
    scorecards = $cartoes
  } | ConvertTo-Json -Depth 10 | Set-Content -Path $Out -Encoding UTF8
  Write-Host "Gravado: $Out" -ForegroundColor Cyan
  Write-Host "Podes commitar em public/data/ ou mandar-me o ficheiro."
}
