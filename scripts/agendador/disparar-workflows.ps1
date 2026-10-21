# =====================================================================
#  disparar-workflows.ps1 - dispara workflows do GitHub Actions a partir
#  do Agendador do Windows (gh workflow run).
#
#  PORQUE: os crons do GitHub atrasam 2 a 6 horas (o daily-digest das
#  07:30 UTC correu as 12:52; o update-drive de domingo as 00:02 de
#  segunda). Em dia de torneio isso e tarde demais para os draws e os
#  resultados. O Agendador do PC dispara a hora certa; os crons do GitHub
#  ficam como rede para quando o PC esta desligado (um run a mais nao faz
#  mal: cada workflow tem fila propria e sai logo se nao houver nada).
#
#  USO (PowerShell, em qualquer pasta):
#    .\scripts\agendador\disparar-workflows.ps1 -Workflow update-cgss-draw.yml
#    .\scripts\agendador\disparar-workflows.ps1 -Workflow update-fpg-admissions-draws.yml
#    .\scripts\agendador\disparar-workflows.ps1 -Conjunto torneio      # os dois
#    .\scripts\agendador\disparar-workflows.ps1 -Conjunto torneio -WhatIf
#
#  Requisitos: gh CLI instalado e autenticado (gh auth login) com a conta
#  do repo. Nao mexe em secrets nem pede passwords.
#
#  Log: logs\disparar-workflows.log (na pasta do repo; *.log esta no
#  .gitignore). Exit: 0 = tudo disparado (ou ja a correr), 1 = falhou algum.
#
#  Registar no Agendador: ver docs/claude/workflows.md, seccao
#  "Disparo pelo Agendador do Windows".
# =====================================================================
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Um ou mais ficheiros de workflow (ex.: update-cgss-draw.yml)
    [string[]]$Workflow = @(),
    # Conjuntos pre-definidos
    [ValidateSet('', 'torneio', 'resultados', 'inscricoes')]
    [string]$Conjunto = '',
    # Branch a usar
    [string]$Ref = 'main',
    # Nao disparar se ja houver um run deste workflow em fila/a correr
    # criado ha menos de N minutos (evita amontoar runs iguais)
    [int]$JanelaMinutos = 45
)

$ErrorActionPreference = 'Stop'

$Conjuntos = @{
    # Resultados dos torneios draw-only (CGSS + PJA): placeholder -> tcode real
    'resultados' = @('update-cgss-draw.yml')
    # Inscricoes + draws FPG (+ tracking + manuel-pairings)
    'inscricoes' = @('update-fpg-admissions-draws.yml')
    'torneio'    = @('update-fpg-admissions-draws.yml', 'update-cgss-draw.yml')
}

$RepoPath = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$LogDir   = Join-Path $RepoPath 'logs'
$LogFile  = Join-Path $LogDir 'disparar-workflows.log'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Log([string]$msg) {
    $linha = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $linha
    Add-Content -Path $LogFile -Value $linha -Encoding UTF8
}

$lista = @($Workflow)
if ($Conjunto) { $lista += $Conjuntos[$Conjunto] }
$lista = $lista | Where-Object { $_ } | Select-Object -Unique
if (-not $lista) {
    Write-Host 'Indicar -Workflow <ficheiro.yml> ou -Conjunto torneio|resultados|inscricoes'
    exit 64
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Log 'ERRO: gh CLI nao instalado.'; exit 1 }
Push-Location $RepoPath
try {
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0) { Log "ERRO: gh nao autenticado - correr 'gh auth login'."; exit 1 }

    $falhou = $false
    foreach ($wf in $lista) {
        # Ja ha um run deste workflow em fila ou a correr, criado ha pouco?
        $json = gh run list --workflow $wf --limit 5 --json status,createdAt,databaseId 2>$null
        if ($LASTEXITCODE -ne 0) { Log "ERRO: gh run list falhou para $wf"; $falhou = $true; continue }
        $limite = (Get-Date).ToUniversalTime().AddMinutes(-$JanelaMinutos)
        $activo = $json | ConvertFrom-Json | Where-Object {
            $_.status -in @('queued', 'in_progress', 'waiting', 'pending', 'requested') -and
            ([datetime]::Parse($_.createdAt).ToUniversalTime() -gt $limite)
        } | Select-Object -First 1
        if ($activo) {
            Log "$wf : ja ha um run $($activo.status) (#$($activo.databaseId)) - nao disparo outro."
            continue
        }
        if ($PSCmdlet.ShouldProcess($wf, "gh workflow run --ref $Ref")) {
            gh workflow run $wf --ref $Ref 2>&1 | ForEach-Object { Log "  gh: $_" }
            if ($LASTEXITCODE -ne 0) { Log "ERRO: falhou o disparo de $wf (exit $LASTEXITCODE)"; $falhou = $true }
            else { Log "$wf : disparado (ref $Ref)." }
        }
    }
    if ($falhou) { exit 1 } else { exit 0 }
}
finally {
    Pop-Location
}
