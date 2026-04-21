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

REM ── PASSO 4: notificacao email via Gmail SMTP ────────────────────
REM Envia sempre (sucesso ou falha). Config em api\.email-config.json.
if not exist api\.email-config.json goto :skip_email

if "!REFRESH_EXIT!" == "0" (
    if "!FPG_EXIT!" == "0" (
        if "!DG_EXIT!" == "0" (
            set "SUBJECT=[OK] Golf FPG cookies refreshed - 3/3 hosts valid"
            set "BODY=Task GolfFPG-CookieRefresh terminou com sucesso em %date% %time%.^

Refresh:      OK (3/3 hosts)^
my.fpg.pt:    OK^
scoring DG:   OK^
GitHub Secrets actualizados.^

Ver log completo em logs\cookie-refresh.log"
        ) else (
            set "SUBJECT=[PARCIAL] Golf FPG cookies - scoring.datagolf.pt falhou"
            set "BODY=Task GolfFPG-CookieRefresh em %date% %time% - scoring.datagolf.pt validacao falhou (exit !DG_EXIT!). Ver logs\cookie-refresh.log"
        )
    ) else (
        set "SUBJECT=[PARCIAL] Golf FPG cookies - my.fpg.pt falhou"
        set "BODY=Task GolfFPG-CookieRefresh em %date% %time% - my.fpg.pt validacao falhou (exit !FPG_EXIT!). Ver logs\cookie-refresh.log"
    )
) else if "!REFRESH_EXIT!" == "2" (
    set "SUBJECT=[ERRO] Golf FPG - sessao SSO expirou"
    set "BODY=Task GolfFPG-CookieRefresh em %date% %time% falhou porque a sessao SSO expirou.^

ACCAO NECESSARIA:^
1. Abrir Chrome 90 com: ^"C:\Users\Mariana\AppData\Local\Google\Chrome\Application\chrome.exe^" --user-data-dir=^"C:\golf-fpg\chrome-profile-automation^"^
2. Fazer login em https://area.my.fpg.pt/login/^
3. Fechar o Chrome^
4. A proxima execucao as 10h voltara a funcionar"
) else if "!REFRESH_EXIT!" == "3" (
    set "SUBJECT=[PARCIAL] Golf FPG cookies - alguns hosts falharam"
    set "BODY=Task GolfFPG-CookieRefresh em %date% %time% - REFRESH_EXIT=!REFRESH_EXIT! (parcial). Alguns hosts nao deram cookies validos. Ver logs\cookie-refresh.log"
) else (
    set "SUBJECT=[ERRO] Golf FPG cookies - refresh falhou"
    set "BODY=Task GolfFPG-CookieRefresh em %date% %time% falhou (REFRESH_EXIT=!REFRESH_EXIT!, FPG=!FPG_EXIT!, DG=!DG_EXIT!). Ver logs\cookie-refresh.log"
)

echo [%date% %time%] A enviar email: !SUBJECT! >> "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\send-email.ps1 -Subject "!SUBJECT!" -Body "!BODY!" >> "%LOGFILE%" 2>&1
echo      send-email.ps1 exit=!errorlevel! >> "%LOGFILE%"
goto :notification_done

:skip_email
echo [%date% %time%] Email nao configurado (api\.email-config.json em falta) - skip >> "%LOGFILE%"

:notification_done
echo ============================================================ >> "%LOGFILE%"
exit /b !REFRESH_EXIT!
