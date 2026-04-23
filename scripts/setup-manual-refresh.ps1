# ═══════════════════════════════════════════════════════════════════════
# setup-manual-refresh.ps1
# -------------------------
# Setup one-time do fluxo manual:
#   1. Desktop shortcut "Refresh Cookies FPG"
#   2. Funcao PowerShell 'refresh-cookies' adicionada ao $PROFILE
#   3. (Opcional) limpa CookieBot user + chrome-profile-cookiebot
#
# USO (PowerShell normal, nao precisa de admin para 1 e 2;
#      PRECISA de admin para 3):
#   .\scripts\setup-manual-refresh.ps1
#   .\scripts\setup-manual-refresh.ps1 -CleanupCookieBot   # tambem limpa
# ═══════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [switch]$CleanupCookieBot
)

$ErrorActionPreference = "Stop"
$RepoPath = Split-Path -Parent $PSScriptRoot
$BatPath  = Join-Path $RepoPath "scripts\refresh-cookies-manual.bat"

if (-not (Test-Path $BatPath)) {
    Write-Error "Nao encontrei $BatPath. Corre primeiro a criacao do wrapper."
}

Write-Host ""
Write-Host "=== Setup Manual Refresh ===" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Desktop shortcut ───────────────────────────────────────────
$desktop  = [Environment]::GetFolderPath("Desktop")
$lnkPath  = Join-Path $desktop "Refresh Cookies FPG.lnk"

Write-Host "[1/3] A criar desktop shortcut: $lnkPath" -ForegroundColor Yellow

try {
    $shell = New-Object -ComObject WScript.Shell
    $lnk   = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath       = $BatPath
    $lnk.WorkingDirectory = $RepoPath
    $lnk.IconLocation     = "$env:SystemRoot\System32\shell32.dll,43"
    $lnk.Description      = "Renovar cookies FPG manualmente (my.fpg.pt + scoring.datagolf.pt + scoring.fpg.pt) com notificacao email+WhatsApp"
    $lnk.WindowStyle      = 7   # Minimized (nao abre janela em primeiro plano)
    $lnk.Save()
    Write-Host "      OK - shortcut criado no Ambiente de Trabalho" -ForegroundColor Green
} catch {
    Write-Host "      ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# ─── 2. Funcao PowerShell 'refresh-cookies' ───────────────────────
Write-Host "[2/3] A adicionar funcao 'refresh-cookies' ao PowerShell profile" -ForegroundColor Yellow

# Garantir que o profile existe
if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
    Write-Host "      Criei o ficheiro $PROFILE (nao existia)" -ForegroundColor Gray
}

$funcBlock = @"

# === refresh-cookies (Golf FPG) ===
# Renova cookies FPG de my.fpg.pt + scoring.datagolf.pt + scoring.fpg.pt,
# actualiza GitHub Secrets, envia email+WhatsApp de confirmacao.
# Corre sempre em modo forcado (FORCE=1), bypassa o dedup de 4h.
function refresh-cookies {
    Push-Location '$RepoPath'
    try {
        `$env:FORCE = "1"
        & cmd.exe /c 'scripts\refresh-cookies-manual.bat'
        Remove-Item Env:FORCE -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "--- Ultimas linhas do log ---" -ForegroundColor Cyan
        Get-Content -Tail 10 -Encoding UTF8 'logs\cookie-refresh.log'
    } finally {
        Pop-Location
    }
}
# === end refresh-cookies ===
"@

$existingContent = if (Test-Path $PROFILE) { Get-Content $PROFILE -Raw } else { "" }
if ($existingContent -match "=== refresh-cookies \(Golf FPG\) ===") {
    # Substituir o bloco existente
    $pattern = "(?s)\r?\n?# === refresh-cookies \(Golf FPG\) ===.*?# === end refresh-cookies ===\r?\n?"
    $newContent = [regex]::Replace($existingContent, $pattern, $funcBlock + "`r`n")
    Set-Content -Path $PROFILE -Value $newContent -Encoding UTF8
    Write-Host "      OK - funcao actualizada (substituido bloco anterior)" -ForegroundColor Green
} else {
    Add-Content -Path $PROFILE -Value $funcBlock -Encoding UTF8
    Write-Host "      OK - funcao adicionada ao profile" -ForegroundColor Green
}

Write-Host "      Profile: $PROFILE" -ForegroundColor Gray
Write-Host "      Para usar numa sessao nova: abrir PowerShell e escrever 'refresh-cookies'" -ForegroundColor Gray
Write-Host "      Para carregar na sessao ACTUAL: correr '. `$PROFILE'" -ForegroundColor Gray

Write-Host ""

# ─── 3. Cleanup (opcional) ─────────────────────────────────────────
Write-Host "[3/3] Cleanup do CookieBot" -ForegroundColor Yellow

if (-not $CleanupCookieBot) {
    Write-Host "      Skip (adiciona -CleanupCookieBot para limpar)" -ForegroundColor Gray
} else {
    # Precisa de admin para Remove-LocalUser
    $principal = New-Object System.Security.Principal.WindowsPrincipal([System.Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "      ERRO: Cleanup requer PowerShell como Administrator. Skip." -ForegroundColor Red
    } else {
        # Remover user local
        try {
            Remove-LocalUser -Name "CookieBot" -ErrorAction Stop
            Write-Host "      OK - user CookieBot removido" -ForegroundColor Green
        } catch [Microsoft.PowerShell.Commands.UserNotFoundException] {
            Write-Host "      CookieBot nao existe - skip" -ForegroundColor Gray
        } catch {
            Write-Host "      ERRO ao remover user: $($_.Exception.Message)" -ForegroundColor Red
        }

        # Remover perfil de utilizador (se criado)
        $userProfile = "C:\Users\CookieBot"
        if (Test-Path $userProfile) {
            try {
                Remove-Item -Recurse -Force $userProfile -ErrorAction Stop
                Write-Host "      OK - pasta $userProfile removida" -ForegroundColor Green
            } catch {
                Write-Host "      ERRO ao remover pasta: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        # Remover perfil Chrome dedicado
        $chromeProfile = Join-Path $RepoPath "chrome-profile-cookiebot"
        if (Test-Path $chromeProfile) {
            try {
                Remove-Item -Recurse -Force $chromeProfile -ErrorAction Stop
                Write-Host "      OK - pasta chrome-profile-cookiebot removida" -ForegroundColor Green
            } catch {
                Write-Host "      ERRO ao remover chrome-profile-cookiebot: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host ""
Write-Host "=== SETUP CONCLUIDO ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Como usar:" -ForegroundColor Cyan
Write-Host "  1. Desktop: duplo-clique em 'Refresh Cookies FPG' no Ambiente de Trabalho"
Write-Host "  2. PowerShell: abre PowerShell e escreve 'refresh-cookies' (apos abrir janela nova)"
Write-Host ""
Write-Host "Ambos correm exactamente o mesmo fluxo:"
Write-Host "  - Chrome 90 (invisivel) captura cookies frescos de 3 hosts"
Write-Host "  - Valida cookies com POSTs reais"
Write-Host "  - Actualiza GitHub Secrets"
Write-Host "  - Envia email + WhatsApp com resultado"
Write-Host "  - Demora ~30s"
Write-Host ""
Write-Host "A scheduled task GolfFPG-CookieRefresh continua registada e vai" -ForegroundColor Gray
Write-Host "tentar correr as 10:00 + 3 min apos cada logon. Se estiveres" -ForegroundColor Gray
Write-Host "logada, corre com sucesso. Se nao, falha silenciosamente." -ForegroundColor Gray
