# setup-draw-inbox-task.ps1 — regista a Scheduled Task "GolfFPG-DrawInbox"
# que corre scripts/process-draw-inbox.js de 15 em 15 minutos (o "percurso"
# dos draws CGSS: largar o PDF em C:\golf-fpg\draws-inbox e não fazer mais
# nada). Re-correr este script actualiza a tarefa (remove e recria).
#
# Correr:  powershell -ExecutionPolicy Bypass -File scripts\setup-draw-inbox-task.ps1
# (não precisa de administrador — tarefa ao nível do utilizador, só corre com
#  sessão iniciada, que é quando os PDFs podem aparecer na pasta)

$TaskName = "GolfFPG-DrawInbox"
$Node = (Get-Command node).Source
$Script = "C:\golf-fpg\scripts\process-draw-inbox.js"

if (-not (Test-Path $Script)) { Write-Error "não encontro $Script"; exit 1 }

# remover versão anterior, se existir
schtasks /Query /TN $TaskName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { schtasks /Delete /TN $TaskName /F | Out-Null }

$Action = New-ScheduledTaskAction -Execute $Node -Argument "`"$Script`"" -WorkingDirectory "C:\golf-fpg"
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
  -Settings $Settings -Description "golf-fpg: processa PDFs de draws CGSS largados em C:\golf-fpg\draws-inbox (add-cgss-draw + commit + push)." | Out-Null

Write-Host "✓ Tarefa '$TaskName' registada — corre de 15 em 15 min."
Write-Host "  Largar PDFs de draws em C:\golf-fpg\draws-inbox\ ; log em draws-inbox\inbox-log.txt"
