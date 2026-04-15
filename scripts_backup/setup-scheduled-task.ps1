#Requires -RunAsAdministrator

# setup-scheduled-task.ps1
# Cria uma Windows Scheduled Task que corre o scraper FPG todos os dias as 8h.
#
# Uso (PowerShell como Administrador, em C:\golf-fpg):
#   .\scripts\setup-scheduled-task.ps1
#
# Remover:
#   Unregister-ScheduledTask -TaskName "GolfFPG-DailyScrape" -Confirm:$false

$ErrorActionPreference = "Stop"

$TaskName = "GolfFPG-DailyScrape"
$RepoPath = Split-Path -Parent $PSScriptRoot
$LogDir   = Join-Path $RepoPath "logs"
$LogFile  = Join-Path $LogDir "scheduled-task.log"
$BatFile  = Join-Path $RepoPath "scripts\run-scheduled-scrape.bat"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Escrever o .bat wrapper linha a linha (evita problemas com here-strings)
$batLines = @(
    "@echo off",
    "cd /d `"$RepoPath`"",
    "echo ============================================================ >> `"$LogFile`"",
    "echo [%date% %time%] Scheduled scrape starting >> `"$LogFile`"",
    "echo ============================================================ >> `"$LogFile`"",
    "node scripts\fpg-scrape-node.js --all --new-only --concurrency 3 >> `"$LogFile`" 2>&1",
    "set EXIT=%ERRORLEVEL%",
    "echo [%date% %time%] Exit code: %EXIT% >> `"$LogFile`"",
    "if %EXIT% == 0 echo [%date% %time%] Ha novidades >> `"$LogFile`"",
    "if %EXIT% == 2 echo [%date% %time%] Sem novidades >> `"$LogFile`"",
    "if %EXIT% == 1 echo [%date% %time%] ERRO - investigar logs >> `"$LogFile`""
)
$batLines | Out-File -FilePath $BatFile -Encoding ASCII

Write-Host "OK Criado wrapper $BatFile" -ForegroundColor Green

# Remover tarefa existente
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "OK Tarefa antiga removida" -ForegroundColor Yellow
}

# Criar tarefa
$Action   = New-ScheduledTaskAction -Execute $BatFile
$Trigger  = New-ScheduledTaskTrigger -Daily -At 1:00PM
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Descarrega scorecards novos dos federados FPG todos os dias as 8h."

Write-Host ""
Write-Host "=== TAREFA CRIADA COM SUCESSO ===" -ForegroundColor Cyan
Write-Host "  Nome:    $TaskName"
Write-Host "  Hora:    Todos os dias as 13:00"
Write-Host "  Script:  $BatFile"
Write-Host "  Logs:    $LogFile"
Write-Host ""
Write-Host "Comandos uteis:" -ForegroundColor Cyan
Write-Host "  Correr agora:   Start-ScheduledTask -TaskName $TaskName"
Write-Host "  Ver estado:     Get-ScheduledTask -TaskName $TaskName | Format-List"
Write-Host "  Desactivar:     Disable-ScheduledTask -TaskName $TaskName"
Write-Host "  Remover:        Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
Write-Host "  Ver log:        Get-Content -Tail 50 '$LogFile'"
