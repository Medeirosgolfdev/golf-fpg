# =====================================================================
#  uskids-lembrete-consola.ps1 - lembrete semanal da recolha USKids
#  (Agendador: "USKids - lembrete da consola", segunda às 9h00). Corre em pwsh (UTF-8).
#
#  A USKids recusa (HTTP 403) os pedidos que não vêm de uma pessoa no browser,
#  por isso a recolha é feita pela Mariana, na consola do Firefox
#  (scripts/uskids-consola.js). Isto só prepara: abre a página no Firefox,
#  põe o script na área de transferência e mostra o que fazer. NÃO carrega
#  em nada na página - colar e Enter são dela (Mariana, 16/11/2026: o Chrome
#  a correr sozinho seria contornar a protecção da USKids; ficou de fora).
#
#  O resto é automático: "USKids - aplicar ficheiro da consola"
#  (uskids-aplicar-consola.ps1) apanha o ficheiro nas Transferências.
#  Log: C:\golf-fpg\logs\uskids-consola.log
# =====================================================================
$ErrorActionPreference = 'Stop'
$Repo   = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Script = Join-Path $Repo 'scripts\uskids-consola.js'
$Log    = Join-Path $Repo 'logs\uskids-consola.log'
$Url    = 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=23132'

function Log($m) { Add-Content -Path $Log -Value ("{0}  [lembrete] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8 }

try {
    Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 $Script)
    $ff = @("$env:ProgramFiles\Mozilla Firefox\firefox.exe", "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe") |
        Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($ff) { Start-Process $ff -ArgumentList $Url } else { Start-Process $Url }
    Log 'página aberta e script na área de transferência.'

    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "Recolha semanal USKids (inscritos e resultados).`n`n" +
        "No Firefox, na página que abriu:`n" +
        "   1. F12  ->  Consola`n" +
        "   2. Ctrl+V  (o script já está copiado)`n" +
        "   3. Enter`n`n" +
        "Demora 15 a 30 minutos. Não feches o separador.`n" +
        "Quando aparecer 'Gravado', o resto é automático: o site actualiza-se sozinho.",
        'USKids - recolha semanal', 'OK', 'Information') | Out-Null
} catch {
    Log ("ERRO: " + $_.Exception.Message)
    exit 1
}
