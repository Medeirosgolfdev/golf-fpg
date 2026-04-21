@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  run-cookie-refresh.bat
REM  ----------------------
REM  Wrapper que corre o refresh-all-cookies.js + validacoes + (opcional)
REM  push para GitHub Secrets. Chamado pela Scheduled Task das 10:00.
REM
REM  Logs em: logs\cookie-refresh.log (UTF-8)
REM
REM  Exit codes propagados:
REM    0 = tudo OK
REM    1 = erro do Playwright / browser
REM    2 = cookies capturados mas invalidos (sessao SSO expirou)
REM    3 = parcial (alguns hosts falharam)
REM ═══════════════════════════════════════════════════════════════════════

setlocal enabledelayedexpansion

REM UTF-8 para que os emojis e acentuacao no log aparecam bem em Get-Content
chcp 65001 >nul 2>nul

cd /d "%~dp0\.."
set LOGFILE=logs\cookie-refresh.log
set TMPFILE=logs\.cookie-header.tmp

if not exist logs mkdir logs

echo ============================================================ >> "%LOGFILE%"
echo [%date% %time%] Cookie refresh starting >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

REM ── PASSO 1: refresh Playwright ────────────────────────────────────
echo [%date% %time%] 1/3 Playwright refresh (Chrome 90)... >> "%LOGFILE%"
node scripts\refresh-all-cookies.js >> "%LOGFILE%" 2>&1
set REFRESH_EXIT=!ERRORLEVEL!
echo [%date% %time%] refresh-all-cookies exit=!REFRESH_EXIT! >> "%LOGFILE%"

if "!REFRESH_EXIT!" == "1" goto :end
if "!REFRESH_EXIT!" == "2" goto :end

REM ── PASSO 2: validacao extra via scripts Node ──────────────────────
echo [%date% %time%] 2/3 Validacao Node... >> "%LOGFILE%"

echo    - test-fpg-auth.js (my.fpg.pt)... >> "%LOGFILE%"
node scripts\test-fpg-auth.js >> "%LOGFILE%" 2>&1
set FPG_EXIT=!ERRORLEVEL!
echo    test-fpg-auth.js exit=!FPG_EXIT! >> "%LOGFILE%"

echo    - test-datagolf-node.js (scoring.datagolf.pt)... >> "%LOGFILE%"
node scripts\test-datagolf-node.js >> "%LOGFILE%" 2>&1
set DG_EXIT=!ERRORLEVEL!
echo    test-datagolf-node.js exit=!DG_EXIT! >> "%LOGFILE%"

REM ── PASSO 3: push para GitHub Secrets (se gh disponivel) ───────────
echo [%date% %time%] 3/3 GitHub Secrets push... >> "%LOGFILE%"

where gh >nul 2>nul
if errorlevel 1 (
    echo    gh CLI nao instalado - a saltar push para GitHub Secrets. >> "%LOGFILE%"
    goto :end
)

gh auth status >nul 2>nul
if errorlevel 1 (
    echo    gh instalado mas nao autenticado - corre 'gh auth login'. A saltar. >> "%LOGFILE%"
    goto :end
)

REM ── Actualizar FPG_COOKIES ──
REM gh secret set le de stdin quando -b nao e passado.
REM Usamos type + pipe em vez de --body-file (nao existe na v2.90 do gh).
echo    - FPG_COOKIES (my.fpg.pt)... >> "%LOGFILE%"
powershell -NoProfile -Command "(Get-Content api\.datagolf-cookies.json -Raw | ConvertFrom-Json).cookieHeader | Set-Content -NoNewline -Encoding ascii '%TMPFILE%'"
if exist "%TMPFILE%" (
    type "%TMPFILE%" | gh secret set FPG_COOKIES >> "%LOGFILE%" 2>&1
    echo      gh secret set FPG_COOKIES exit=!errorlevel! >> "%LOGFILE%"
    del /q "%TMPFILE%" >nul 2>nul
) else (
    echo      nao consegui ler api\.datagolf-cookies.json - skip >> "%LOGFILE%"
)

REM ── Actualizar DATAGOLF_COOKIES ──
echo    - DATAGOLF_COOKIES (scoring.datagolf.pt)... >> "%LOGFILE%"
powershell -NoProfile -Command "(Get-Content api\.scoring-datagolf-cookies.json -Raw | ConvertFrom-Json).cookieHeader | Set-Content -NoNewline -Encoding ascii '%TMPFILE%'"
if exist "%TMPFILE%" (
    type "%TMPFILE%" | gh secret set DATAGOLF_COOKIES >> "%LOGFILE%" 2>&1
    echo      gh secret set DATAGOLF_COOKIES exit=!errorlevel! >> "%LOGFILE%"
    del /q "%TMPFILE%" >nul 2>nul
) else (
    echo      nao consegui ler api\.scoring-datagolf-cookies.json - skip >> "%LOGFILE%"
)

:end
echo [%date% %time%] Fim. REFRESH_EXIT=!REFRESH_EXIT! FPG_EXIT=!FPG_EXIT! DG_EXIT=!DG_EXIT! >> "%LOGFILE%"

REM ── PASSO 4: notificacao WhatsApp via CallMeBot ──────────────────
REM Envia sempre (sucesso ou falha). Config em api\.callmebot-config.json.
if not exist api\.callmebot-config.json goto :skip_whatsapp

if "!REFRESH_EXIT!" == "0" (
    if "!FPG_EXIT!" == "0" (
        if "!DG_EXIT!" == "0" (
            set "MSG=[OK] Golf FPG cookies refreshed %date% %time% - 3/3 hosts valid, GitHub Secrets updated"
        ) else (
            set "MSG=[PARCIAL] Golf FPG cookies refreshed %date% %time% - scoring.datagolf.pt falhou (exit !DG_EXIT!)"
        )
    ) else (
        set "MSG=[PARCIAL] Golf FPG cookies refreshed %date% %time% - my.fpg.pt validacao falhou (exit !FPG_EXIT!)"
    )
) else if "!REFRESH_EXIT!" == "2" (
    set "MSG=[ERRO] Golf FPG cookies %date% %time% - sessao SSO expirou. Abrir Chrome 90 e fazer login em area.my.fpg.pt"
) else if "!REFRESH_EXIT!" == "3" (
    set "MSG=[PARCIAL] Golf FPG cookies %date% %time% - alguns hosts falharam. Ver logs\cookie-refresh.log"
) else (
    set "MSG=[ERRO] Golf FPG cookies %date% %time% - refresh falhou (exit !REFRESH_EXIT!). Ver logs\cookie-refresh.log"
)

echo [%date% %time%] A enviar WhatsApp: !MSG! >> "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\send-whatsapp.ps1 -Message "!MSG!" >> "%LOGFILE%" 2>&1
echo      send-whatsapp.ps1 exit=!errorlevel! >> "%LOGFILE%"
goto :notification_done

:skip_whatsapp
echo [%date% %time%] CallMeBot nao configurado (api\.callmebot-config.json em falta) - skip WhatsApp >> "%LOGFILE%"

:notification_done
echo ============================================================ >> "%LOGFILE%"
exit /b !REFRESH_EXIT!
