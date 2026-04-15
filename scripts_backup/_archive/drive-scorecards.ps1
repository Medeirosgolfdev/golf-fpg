# drive-scorecards.ps1
# Busca scorecards para todos os jogadores do drive-classif.json
# Uso: .\drive-scorecards.ps1

$ErrorActionPreference = "Continue"
$baseUrl = "https://scoring.datagolf.pt/pt/classif.aspx/ScoreCard"
$inputFile = "$PSScriptRoot\drive-classif.json"
$outputFile = "$PSScriptRoot\drive-data.json"
$delay = 300  # ms entre pedidos

# Headers
$headers = @{
    "Content-Type"     = "application/json; charset=utf-8"
    "X-Requested-With" = "XMLHttpRequest"
    "Accept"           = "application/json"
    "User-Agent"       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0"
    "Origin"           = "https://scoring.datagolf.pt"
    "Referer"          = "https://scoring.datagolf.pt/pt/classif.aspx"
    "Cookie"           = "jtable%23504999716page-size=50"
}

$body = '{"jtStartIndex":0,"jtPageSize":10,"jtSorting":""}'

# Ler dados
if (-not (Test-Path $inputFile)) {
    Write-Host "ERRO: Ficheiro $inputFile nao encontrado!" -ForegroundColor Red
    Write-Host "Coloca o drive-classif.json na mesma pasta deste script." -ForegroundColor Yellow
    exit 1
}

$data = Get-Content $inputFile -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "=== DRIVE Scorecard Fetcher ===" -ForegroundColor Green
Write-Host "Torneios: $($data.tournaments.Count) | Jogadores: $($data.totalPlayers)" -ForegroundColor Cyan

$totalSC = 0
$totalFail = 0
$tIdx = 0

foreach ($tourn in $data.tournaments) {
    $tIdx++
    Write-Host "`n[$tIdx/$($data.tournaments.Count)] $($tourn.name)" -ForegroundColor Yellow
    Write-Host "  Jogadores: $($tourn.playerCount)" -ForegroundColor DarkGray

    $pIdx = 0
    foreach ($player in $tourn.players) {
        $pIdx++
        $scoreId = $player.scoreId
        $ccode = $tourn.ccode
        $tcode = $tourn.tcode

        $url = "${baseUrl}?score_id=${scoreId}&tclub=${ccode}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=1"

        try {
            $resp = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 15
            $json = $resp.Content | ConvertFrom-Json

            $d = $json.d
            if ($null -eq $d) { $d = $json }

            if ($d.Result -eq "OK" -and $d.Records -and $d.Records.Count -gt 0) {
                $r = $d.Records[0]
                $nh = if ($r.nholes) { $r.nholes } else { 18 }

                $scores = @()
                $par = @()
                $si = @()
                $meters = @()
                for ($h = 1; $h -le $nh; $h++) {
                    $scores += if ($r."gross_$h") { $r."gross_$h" } else { 0 }
                    $par    += if ($r."par_$h")   { $r."par_$h" }   else { 0 }
                    $si     += if ($r."stroke_index_$h") { $r."stroke_index_$h" } else { 0 }
                    $meters += if ($r."meters_$h") { $r."meters_$h" } else { 0 }
                }

                # Enriquecer o player
                $player | Add-Member -NotePropertyName "fed" -NotePropertyValue ($r.federated_code) -Force
                $player | Add-Member -NotePropertyName "clubCode" -NotePropertyValue ($r.player_club_code) -Force
                $player | Add-Member -NotePropertyName "clubAcronym" -NotePropertyValue ($r.player_acronym) -Force
                $player | Add-Member -NotePropertyName "hcpExact" -NotePropertyValue ($r.exact_hcp) -Force
                $player | Add-Member -NotePropertyName "hcpPlay" -NotePropertyValue ($r.play_hcp) -Force
                $player | Add-Member -NotePropertyName "course" -NotePropertyValue ($r.course_description) -Force
                $player | Add-Member -NotePropertyName "courseRating" -NotePropertyValue ($r.course_rating) -Force
                $player | Add-Member -NotePropertyName "slope" -NotePropertyValue ($r.slope) -Force
                $player | Add-Member -NotePropertyName "teeName" -NotePropertyValue ($r.tee_name) -Force
                $player | Add-Member -NotePropertyName "teeColorId" -NotePropertyValue ($r.tee_color_id) -Force
                $player | Add-Member -NotePropertyName "nholes" -NotePropertyValue ($nh) -Force
                $player | Add-Member -NotePropertyName "parTotal" -NotePropertyValue ($r.par_total) -Force
                $player | Add-Member -NotePropertyName "scores" -NotePropertyValue ($scores) -Force
                $player | Add-Member -NotePropertyName "par" -NotePropertyValue ($par) -Force
                $player | Add-Member -NotePropertyName "si" -NotePropertyValue ($si) -Force
                $player | Add-Member -NotePropertyName "meters" -NotePropertyValue ($meters) -Force

                $totalSC++
                $label = if ($player.name.Length -gt 22) { $player.name.Substring(0,22) + ".." } else { $player.name }
                Write-Host "  [$pIdx/$($tourn.playerCount)] OK $label" -ForegroundColor Green
            } else {
                $totalFail++
                Write-Host "  [$pIdx/$($tourn.playerCount)] -- $($player.name) (sem dados)" -ForegroundColor DarkGray
            }
        } catch {
            $totalFail++
            $status = $_.Exception.Response.StatusCode.value__
            Write-Host "  [$pIdx/$($tourn.playerCount)] ERRO $status $($player.name)" -ForegroundColor Red
        }

        Start-Sleep -Milliseconds $delay
    }
}

# Actualizar metadata
$data | Add-Member -NotePropertyName "totalScorecards" -NotePropertyValue ($totalSC) -Force
$data | Add-Member -NotePropertyName "lastUpdated" -NotePropertyValue ((Get-Date).ToString("yyyy-MM-dd")) -Force

# Guardar
$data | ConvertTo-Json -Depth 10 -Compress:$false | Out-File $outputFile -Encoding UTF8
Write-Host "`n=== CONCLUIDO ===" -ForegroundColor Green
Write-Host "Scorecards OK: $totalSC" -ForegroundColor Green
Write-Host "Falhados: $totalFail" -ForegroundColor Yellow
Write-Host "Ficheiro: $outputFile" -ForegroundColor Cyan
