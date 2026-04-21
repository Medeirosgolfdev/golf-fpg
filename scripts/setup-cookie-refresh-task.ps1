#Requires -RunAsAdministrator

# ═══════════════════════════════════════════════════════════════════════
#  setup-cookie-refresh-task.ps1
#  -----------------------------
#  Regista uma Windows Scheduled Task "GolfFPG-CookieRefresh" que corre
#  scripts\run-cookie-refresh.bat todos os dias às 10:00.
#
#  USO (PowerShell como Administrador, em C:\golf-fpg):
#      .\scripts\setup-cookie-refresh-task.ps1
#
#  REMOVER:
#      Unregister-ScheduledTask -TaskName "GolfFPG-CookieRefresh" -Confirm:$false
#
#  O que a task faz, resumidamente:
#    1. Lança Chrome 90 headless com o perfil dedicado (onde fizeste login)
#    2. Navega a my.fpg.pt, scoring.datagolf.pt e scoring.fpg.pt
#    3. Extrai cookies frescos e grava em api\.*-cookies.json
#    4. Valida cookies com POSTs reais aos endpoints
#    5. Se gh CLI estiver autenticado, actualiza GitHub Secrets
#    6. Log em logs\cookie-refresh.log
# ═══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$TaskName = "GolfFPG-CookieRefresh"
$RepoPath = Split-Path -Parent $PSScriptRoot
$BatFile  = Join-Path $RepoPath "scripts\run-cookie-refresh.bat"
$LogDir   = Join-Path $RepoPath "logs"
$LogFile  = Join-Path $LogDir "cookie-refresh.log"
$ProfileDir = Join-Path $RepoPath "chrome-profile-automation"

if (-not (Test-Path $BatFile)) {
    Write-Error "Nao encontrei $BatFile. Corre primeiro a criacao dos scripts."
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "OK Criado directorio $LogDir" -ForegroundColor Green
}

if (-not (Test-Path $ProfileDir)) {
    Write-Host ""
    Write-Host "AVISO: o perfil Chrome 90 ainda nao existe em:" -ForegroundColor Yellow
    Write-Host "  $ProfileDir" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Antes de correr a task pela primeira vez, tens de:" -ForegroundColor Yellow
    Write-Host "  1. Abrir Chrome 90 com este perfil dedicado:" -ForegroundColor Yellow
    Write-Host "       & 'C:\Users\Mariana\AppData\Local\Google\Chrome\Application\chrome.exe' --user-data-dir='$ProfileDir'" -ForegroundColor Cyan
    Write-Host "  2. Verificar chrome://flags -> SameSite by default cookies = Disabled" -ForegroundColor Yellow
    Write-Host "  3. Fazer login em https://area.my.fpg.pt/login/" -ForegroundColor Yellow
    Write-Host "  4. Visitar uma vez: my.fpg.pt/Home/PlayerWHS.aspx?no=52884" -ForegroundColor Yellow
    Write-Host "  5. Visitar uma vez: scoring.datagolf.pt/pt/tournaments.aspx" -ForegroundColor Yellow
    Write-Host "  6. Fechar o browser" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Depois podes voltar a correr este setup." -ForegroundColor Yellow
    Write-Host ""
    $ans = Read-Host "Continuar mesmo assim? (a task sera criada mas falhara ate teres o perfil) [y/N]"
    if ($ans -ne "y" -and $ans -ne "Y") {
        Write-Host "Cancelado." -ForegroundColor Red
        exit 1
    }
}

# Remover tarefa existente
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "OK Tarefa antiga removida" -ForegroundColor Yellow
}

# Criar tarefa
# IMPORTANTE: invocar o .bat via cmd.exe /c — invocar o .bat directamente
# falha em alguns ambientes de Task Scheduler (exit code 255 sem log).
$Action   = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$BatFile`"" `
    -WorkingDirectory $RepoPath

$Trigger  = New-ScheduledTaskTrigger -Daily -At 10:00AM

# -WakeToRun faz o Windows acordar do SLEEP para correr a task.
# Nota: se o PC estiver COMPLETAMENTE DESLIGADO (power off, nao sleep), isto nao
# chega — precisa-se de BIOS/UEFI a fazer wake-on-RTC alarm (ver docs abaixo).
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -Priority 4

# Interactive: corre com sessao UI activa (necessario para Chrome 90 ir buscar
# o perfil persistente e arrancar correctamente). Implica que a utilizadora
# esteja logada as 10:00 — o que tipicamente e o caso.
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Captura cookies frescos de my.fpg.pt, scoring.datagolf.pt e scoring.fpg.pt via Chrome 90 + Playwright. Corre diariamente as 10:00."

Write-Host ""
Write-Host "=== TAREFA CRIADA COM SUCESSO ===" -ForegroundColor Cyan
Write-Host "  Nome:    $TaskName"
Write-Host "  Hora:    Todos os dias as 10:00"
Write-Host "  Script:  $BatFile"
Write-Host "  Logs:    $LogFile"
Write-Host ""
Write-Host "Variaveis de ambiente opcionais (para tunar):" -ForegroundColor Cyan
Write-Host "  CHROME90_PATH     caminho do chrome.exe (default: C:\Users\Mariana\AppData\Local\Google\Chrome\Application\chrome.exe)"
Write-Host "  CHROME90_PROFILE  perfil dedicado (default: $ProfileDir)"
Write-Host "  HEADFUL=1         browser visivel (para debug, nao em producao)"
Write-Host "  SKIP_VALIDATION=1 saltar testes POST de validacao"
Write-Host ""
Write-Host "Comandos uteis:" -ForegroundColor Cyan
Write-Host "  Correr agora:   Start-ScheduledTask -TaskName $TaskName"
Write-Host "  Ver estado:     Get-ScheduledTask -TaskName $TaskName | Format-List"
Write-Host "  Desactivar:     Disable-ScheduledTask -TaskName $TaskName"
Write-Host "  Reactivar:      Enable-ScheduledTask -TaskName $TaskName"
Write-Host "  Remover:        Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
Write-Host "  Ver log:        Get-Content -Tail 80 '$LogFile'"
Write-Host ""
Write-Host "Para testar agora:" -ForegroundColor Green
Write-Host "  Start-ScheduledTask -TaskName $TaskName" -ForegroundColor White
Write-Host "  Start-Sleep -Seconds 60"
Write-Host "  Get-Content -Tail 40 -Encoding UTF8 '$LogFile'"
Write-Host ""
Write-Host "--- ACORDAR PC AUTOMATICAMENTE ---" -ForegroundColor Yellow
Write-Host "A task ja tem -WakeToRun, mas o PC tem de aceitar acordar. Verificar:" -ForegroundColor Yellow
Write-Host "  powercfg /requests                               # ver quem esta a pedir sleep"
Write-Host "  powercfg /deviceenablewake '<device>'            # permitir wake por teclado/rato"
Write-Host "  powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1"
Write-Host "  powercfg -setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1"
Write-Host "  powercfg -S SCHEME_CURRENT                       # aplicar"
Write-Host ""
Write-Host "NOTA: -WakeToRun so acorda de SLEEP. Se o PC estiver DESLIGADO" -ForegroundColor Yellow
Write-Host "(shut down), precisas de configurar 'RTC alarm' na BIOS/UEFI:" -ForegroundColor Yellow
Write-Host "  - Entrar no setup BIOS/UEFI (tipicamente F2/Del no boot)"
Write-Host "  - Procurar 'Power Management' > 'Wake on RTC' ou 'RTC Alarm'"
Write-Host "  - Definir hora (ex: 09:55) para o PC ligar 5 min antes da task"
Write-Host "  - Guardar e reiniciar"
Write-Host ""
Write-Host "Alternativa mais simples: configurar o plano de energia para o PC" -ForegroundColor Green
Write-Host "entrar em SLEEP em vez de SHUT DOWN - assim o -WakeToRun chega." -ForegroundColor Green
