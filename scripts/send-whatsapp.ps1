# ═══════════════════════════════════════════════════════════════════════
# send-whatsapp.ps1
# -----------------
# Envia uma mensagem WhatsApp via CallMeBot (servico gratuito nao-oficial).
#
# USO:
#   .\scripts\send-whatsapp.ps1 -Message "Ola do script"
#
# CONFIGURACAO (one-time):
#   Ver scripts\CALLMEBOT-SETUP.md para o passo-a-passo.
#   Depois criar api\.callmebot-config.json com:
#     {
#       "phone":  "351912345678",
#       "apikey": "1234567"
#     }
#   (phone: formato internacional sem + nem espacos)
#
# EXIT CODES:
#   0 = enviado com sucesso
#   1 = config nao encontrada ou invalida
#   2 = HTTP falhou (CallMeBot offline, apikey invalida, etc.)
# ═══════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [string]$ConfigPath
)

$ErrorActionPreference = "Stop"

# Resolver path do script (robusto contra -File com caminho relativo)
if (-not $ConfigPath) {
    $scriptDir = if ($PSCommandPath) { Split-Path -Parent $PSCommandPath }
                 elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path }
                 else { Get-Location }
    $ConfigPath = Join-Path $scriptDir "..\api\.callmebot-config.json"
}

# ── Ler config ──────────────────────────────────────────────────────
if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config nao encontrada: $ConfigPath. Ver scripts\CALLMEBOT-SETUP.md"
    exit 1
}

try {
    $config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Error "Config invalida (nao e JSON): $ConfigPath"
    exit 1
}

if (-not $config.phone -or -not $config.apikey) {
    Write-Error "Config em falta: precisa de 'phone' e 'apikey' em $ConfigPath"
    exit 1
}

# ── Truncar mensagem se muito longa ─────────────────────────────────
# CallMeBot tem limite ~1000 chars mas ~500 e mais seguro.
if ($Message.Length -gt 500) {
    $Message = $Message.Substring(0, 497) + "..."
}

# ── URL-encode da mensagem ──────────────────────────────────────────
Add-Type -AssemblyName System.Web
$encoded = [System.Web.HttpUtility]::UrlEncode($Message)

$url = "https://api.callmebot.com/whatsapp.php?phone=$($config.phone)&text=$encoded&apikey=$($config.apikey)"

Write-Host "Sending WhatsApp to +$($config.phone) via CallMeBot..."

# ── HTTP GET ────────────────────────────────────────────────────────
try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        # CallMeBot devolve HTML/texto com info do envio.
        # Procuramos por 'Message queued' ou similar na resposta.
        if ($resp.Content -match "Message queued|Message Sent|Message processed") {
            Write-Host "OK - $($resp.StatusCode) $($resp.StatusDescription)"
            exit 0
        } else {
            Write-Host "HTTP 200 mas resposta estranha: $($resp.Content.Substring(0, [Math]::Min(200, $resp.Content.Length)))"
            exit 2
        }
    } else {
        Write-Host "HTTP $($resp.StatusCode) $($resp.StatusDescription)"
        exit 2
    }
} catch {
    Write-Host "Falha HTTP: $($_.Exception.Message)"
    exit 2
}
