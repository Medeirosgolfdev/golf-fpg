# ═══════════════════════════════════════════════════════════════════════
# send-email.ps1
# --------------
# Envia email via Gmail SMTP (ou qualquer outro SMTP compativel).
#
# USO:
#   .\scripts\send-email.ps1 -Subject "Teste" -Body "Corpo da mensagem"
#
# CONFIGURACAO (one-time):
#   1. Activar 2-Factor Auth na conta Google:
#        https://myaccount.google.com/security
#   2. Criar uma App Password (Google exige para SMTP):
#        https://myaccount.google.com/apppasswords
#      Escolher "Mail" + "Windows Computer" -> copiar a pass de 16 caracteres
#   3. Copiar api\.email-config.example.json para api\.email-config.json
#      e preencher com os teus valores.
#
# EXIT CODES:
#   0 = enviado com sucesso
#   1 = config nao encontrada ou invalida
#   2 = falhou (autenticacao, rede, etc.)
# ═══════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Subject,
    [Parameter(Mandatory = $true)]
    [string]$Body,
    [string]$ConfigPath = (Join-Path $PSScriptRoot "..\api\.email-config.json"),
    [switch]$Html
)

$ErrorActionPreference = "Stop"

# ── Ler config ──────────────────────────────────────────────────────
if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config nao encontrada: $ConfigPath. Ver api\.email-config.example.json"
    exit 1
}

try {
    $config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Error "Config invalida (nao e JSON): $ConfigPath"
    exit 1
}

$requiredFields = @("smtp_server", "smtp_port", "username", "password", "from_email", "to_email")
foreach ($f in $requiredFields) {
    if (-not $config.$f) {
        Write-Error "Config em falta: campo '$f' ausente em $ConfigPath"
        exit 1
    }
}

# ── Preparar SMTP ───────────────────────────────────────────────────
$smtp = New-Object System.Net.Mail.SmtpClient($config.smtp_server, [int]$config.smtp_port)
$smtp.EnableSsl = $true   # STARTTLS (gmail:587)
$smtp.Credentials = New-Object System.Net.NetworkCredential($config.username, $config.password)
$smtp.Timeout = 30000     # 30s

$msg = New-Object System.Net.Mail.MailMessage
$msg.From = New-Object System.Net.Mail.MailAddress($config.from_email, $(if ($config.from_name) { $config.from_name } else { "Golf FPG Bot" }))
# to_email pode ser string ou array
if ($config.to_email -is [array]) {
    foreach ($addr in $config.to_email) { $msg.To.Add($addr) }
} else {
    $msg.To.Add($config.to_email)
}
$msg.Subject = $Subject
$msg.Body = $Body
$msg.IsBodyHtml = [bool]$Html
$msg.SubjectEncoding = [System.Text.Encoding]::UTF8
$msg.BodyEncoding = [System.Text.Encoding]::UTF8

Write-Host "A enviar email via $($config.smtp_server):$($config.smtp_port) para $($config.to_email)..."

try {
    $smtp.Send($msg)
    Write-Host "OK - email enviado"
    exit 0
} catch [System.Net.Mail.SmtpException] {
    Write-Host "Falha SMTP: $($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Host "  Inner: $($_.Exception.InnerException.Message)"
    }
    exit 2
} catch {
    Write-Host "Erro: $($_.Exception.Message)"
    exit 2
} finally {
    if ($msg) { $msg.Dispose() }
    if ($smtp) { $smtp.Dispose() }
}
