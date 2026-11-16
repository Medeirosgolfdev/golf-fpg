# =====================================================================
#  registar-uskids-consola.ps1 - regista no Agendador as duas tarefas da
#  recolha USKids pela consola do browser (16/11/2026, pedido da Mariana:
#  «quero que semanalmente se veja os inscritos» → «Sim, à segunda 9h»).
#
#      .\scripts\agendador\registar-uskids-consola.ps1            # mostra o que faz
#      .\scripts\agendador\registar-uskids-consola.ps1 -Aplicar   # regista
#
#  "USKids - lembrete da consola"         segunda 9:00
#      uskids-lembrete-consola.ps1: abre a página no Firefox, põe o script na
#      área de transferência e mostra o que fazer (colar e Enter são dela).
#  "USKids - aplicar ficheiro da consola" de 10 em 10 minutos, todos os dias
#      uskids-aplicar-consola.ps1: se houver um uskids-*.json nas Transferências,
#      aplica, testa, publica e avisa; sem ficheiro, sai logo.
#
#  Como o utilizador actual, só com sessão iniciada (precisa do ecrã para os
#  avisos e do git/npm dela). StartWhenAvailable: se o PC estiver desligado à
#  hora, corre ao ligar.
#
#  REMOVER:
#    Unregister-ScheduledTask -TaskName "USKids - lembrete da consola" -Confirm:$false
#    Unregister-ScheduledTask -TaskName "USKids - aplicar ficheiro da consola" -Confirm:$false
# =====================================================================
param([switch]$Aplicar)
$ErrorActionPreference = 'Stop'

$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe' }
if (-not (Test-Path $pwsh)) { throw "Não encontrei o pwsh (PowerShell 7)." }

function Accao([string]$ficheiro) {
    $s = Join-Path $PSScriptRoot $ficheiro
    if (-not (Test-Path $s)) { throw "Não encontrei $s" }
    New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$s`""
}

$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
    -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)

$tarefas = @(
    @{ Nome = 'USKids - lembrete da consola'; Ficheiro = 'uskids-lembrete-consola.ps1'; Horario = 'segunda 9:00'
       Trigger = (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '09:00'); Limite = 60
       Desc = 'Abre a página da USKids no Firefox e põe o script da consola na área de transferência (colar e Enter são da Mariana). Ver docs/claude/uskids.md.' },
    @{ Nome = 'USKids - aplicar ficheiro da consola'; Ficheiro = 'uskids-aplicar-consola.ps1'; Horario = 'de 10 em 10 minutos'
       Trigger = $cada10; Limite = 60
       Desc = 'Se houver um uskids-*.json nas Transferências: aplica (inscritos e resultados), testa, publica e avisa. Ver docs/claude/uskids.md.' }
)

foreach ($t in $tarefas) {
    Write-Host ("{0}  ->  {1}  ({2})" -f $t.Nome, $t.Ficheiro, $t.Horario) -ForegroundColor Cyan
    if ($Aplicar) {
        $def = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -ExecutionTimeLimit (New-TimeSpan -Minutes $t.Limite) -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName $t.Nome -Description $t.Desc -Action (Accao $t.Ficheiro) `
            -Trigger $t.Trigger -Settings $def -Force | Out-Null
        Write-Host '   registada.' -ForegroundColor Green
    }
}
if (-not $Aplicar) { Write-Host "`nNada registado. Correr com -Aplicar para registar." -ForegroundColor Yellow }
