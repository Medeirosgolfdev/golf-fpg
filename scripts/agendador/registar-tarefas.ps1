# =====================================================================
#  registar-tarefas.ps1 - regista no Agendador do Windows as tarefas que
#  disparam os workflows de dia de torneio (disparar-workflows.ps1).
#
#  NAO corre sozinho: e a Mariana que o corre, uma vez, no PC que fica
#  ligado (PowerShell normal, nao precisa de Administrador):
#      .\scripts\agendador\registar-tarefas.ps1            # mostra o que faz
#      .\scripts\agendador\registar-tarefas.ps1 -Aplicar   # regista
#
#  Tarefas (horas LOCAIS do PC - Lisboa/Madeira):
#    "Golf FPG - resultados draw-only"  -> update-cgss-draw.yml
#        Sex/Sab/Dom 13:10, de hora a hora ate as 19:10
#        Seg a Qui   14:10 (uma passagem de recuperacao)
#    "Golf FPG - inscricoes e draws"    -> update-fpg-admissions-draws.yml
#        Sex/Sab/Dom 21:00
#  (os mesmos horarios dos crons do GitHub, que ficam como rede).
#
#  Correm como o utilizador actual, so com sessao iniciada (o gh guarda a
#  autenticacao por utilizador; assim nao se guarda password nenhuma).
#  "StartWhenAvailable": se o PC estiver desligado a hora, corre ao ligar.
#
#  REMOVER:
#    Unregister-ScheduledTask -TaskName "Golf FPG - resultados draw-only" -Confirm:$false
#    Unregister-ScheduledTask -TaskName "Golf FPG - inscricoes e draws" -Confirm:$false
# =====================================================================
param([switch]$Aplicar)

$ErrorActionPreference = 'Stop'
$Script = Join-Path $PSScriptRoot 'disparar-workflows.ps1'
if (-not (Test-Path $Script)) { throw "Nao encontrei $Script" }

function Accao([string]$wf) {
    New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`" -Workflow $wf"
}

function DeHoraAHora([string[]]$dias, [string]$hora, [int]$horas) {
    $t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dias -At $hora
    $rep = New-ScheduledTaskTrigger -Once -At $hora `
        -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours $horas)
    $t.Repetition = $rep.Repetition
    return $t
}

$definicoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew

$tarefas = @(
    @{
        Nome     = 'Golf FPG - resultados draw-only'
        Workflow = 'update-cgss-draw.yml'
        Horario  = 'Sex/Sab/Dom 13:10, de hora a hora ate 19:10; Seg-Qui 14:10'
        Triggers = @(
            (DeHoraAHora @('Friday', 'Saturday', 'Sunday') '13:10' 6),
            (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday -At '14:10')
        )
        Desc     = 'Dispara o update-cgss-draw.yml no GitHub (resultados dos torneios draw-only CGSS/PJA). Ver docs/claude/workflows.md.'
    },
    @{
        Nome     = 'Golf FPG - inscricoes e draws'
        Workflow = 'update-fpg-admissions-draws.yml'
        Horario  = 'Sex/Sab/Dom 21:00'
        Triggers = @((New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday, Saturday, Sunday -At '21:00'))
        Desc     = 'Dispara o update-fpg-admissions-draws.yml no GitHub (inscricoes + draws FPG). Ver docs/claude/workflows.md.'
    }
)

foreach ($t in $tarefas) {
    Write-Host ("{0}  ->  {1}" -f $t.Nome, $t.Workflow) -ForegroundColor Cyan
    Write-Host ("   {0}" -f $t.Horario)
    if ($Aplicar) {
        Register-ScheduledTask -TaskName $t.Nome -Description $t.Desc -Action (Accao $t.Workflow) `
            -Trigger $t.Triggers -Settings $definicoes -Force | Out-Null
        Write-Host '   registada.' -ForegroundColor Green
    }
}
if (-not $Aplicar) { Write-Host "`nNada registado. Correr com -Aplicar para registar." -ForegroundColor Yellow }
