@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  run-cookie-refresh.bat
REM  ----------------------
REM  Wrapper que corre o refresh-all-cookies.js + validacoes + (opcional)
REM  push para GitHub Secrets. Chamado pela Scheduled Task das 12:00.
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

REM ── BOM UTF-8 no log ──────────────────────────────────────
REM O chcp 65001 acima garante que se ESCREVE UTF-8, mas nao que se LEIA:
REM sem BOM, o Get-Content do Windows PowerShell 5.1 e o Notepad assumem ANSI
REM e os `·` e `—` que o Node escreve saem como `Â·` (28/08/2026).
REM So corre quando o log ainda nao existe - zero custo nas corridas normais.
REM Uma linha so, sem bloco: o parser do cmd tropeca em parenteses dentro de
REM aspas quando estao dentro de um bloco if(...) - ver a nota do PASSO 4.
if not exist "%LOGFILE%" powershell -NoProfile -Command "[IO.File]::WriteAllBytes((Join-Path $PWD '%LOGFILE%'), [byte[]](0xEF,0xBB,0xBF))"

echo ============================================================ >> "%LOGFILE%"
echo [%date% %time%] Cookie refresh starting >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

REM ── Dedup: se cookies foram refrescados nas ultimas 4 horas, saltar ──
REM Protege contra double-run (Daily 12:00 + AtStartup) quando o PC
REM reinicia logo apos uma execucao.
REM Bypass com variavel de ambiente FORCE=1 (util para testes manuais):
REM   set FORCE=1 && .\scripts\run-cookie-refresh.bat
if "%FORCE%" == "1" goto :skip_dedup
if exist api\.datagolf-cookies.json (
    for /f %%i in ('powershell -NoProfile -Command "(Get-Date) - (Get-Item 'api\.datagolf-cookies.json').LastWriteTime | ForEach-Object {[int]$_.TotalHours}"') do set COOKIE_AGE_H=%%i
    if defined COOKIE_AGE_H (
        if !COOKIE_AGE_H! LSS 4 (
            echo [%date% %time%] Cookies tem !COOKIE_AGE_H!h - ja foi refrescado recentemente, a saltar ^(use FORCE=1 para bypass^). >> "%LOGFILE%"
            echo ============================================================ >> "%LOGFILE%"
            exit /b 0
        )
    )
)
:skip_dedup

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

REM ── Actualizar DATAGOLF_COOKIES e DATAGOLF_SCORING_COOKIES ──
REM Ambos os secrets guardam as MESMAS cookies (scoring.datagolf.pt) mas sao
REM consumidos por workflows diferentes:
REM   - DATAGOLF_COOKIES         ← update-drive.yml (scrape-drive-node.js)
REM   - DATAGOLF_SCORING_COOKIES ← update-jovens.yml + update-classif.yml
REM Naming historico inconsistente; mantem-se os dois para nao partir workflows.
echo    - DATAGOLF_COOKIES e DATAGOLF_SCORING_COOKIES (scoring.datagolf.pt)... >> "%LOGFILE%"
powershell -NoProfile -Command "(Get-Content api\.scoring-datagolf-cookies.json -Raw | ConvertFrom-Json).cookieHeader | Set-Content -NoNewline -Encoding ascii '%TMPFILE%'"
if exist "%TMPFILE%" (
    type "%TMPFILE%" | gh secret set DATAGOLF_COOKIES >> "%LOGFILE%" 2>&1
    echo      gh secret set DATAGOLF_COOKIES exit=!errorlevel! >> "%LOGFILE%"
    type "%TMPFILE%" | gh secret set DATAGOLF_SCORING_COOKIES >> "%LOGFILE%" 2>&1
    echo      gh secret set DATAGOLF_SCORING_COOKIES exit=!errorlevel! >> "%LOGFILE%"
    del /q "%TMPFILE%" >nul 2>nul
) else (
    echo      nao consegui ler api\.scoring-datagolf-cookies.json - skip >> "%LOGFILE%"
)

REM ── Actualizar FPG_ADMISSIONS_COOKIES (scoring.fpg.pt) ──
REM Usado por update-fpg-admissions-draws.yml (scrape-fpg-admissions-draws-node.js).
echo    - FPG_ADMISSIONS_COOKIES (scoring.fpg.pt)... >> "%LOGFILE%"
powershell -NoProfile -Command "(Get-Content api\.fpg-admissions-cookies.json -Raw | ConvertFrom-Json).cookieHeader | Set-Content -NoNewline -Encoding ascii '%TMPFILE%'"
if exist "%TMPFILE%" (
    type "%TMPFILE%" | gh secret set FPG_ADMISSIONS_COOKIES >> "%LOGFILE%" 2>&1
    echo      gh secret set FPG_ADMISSIONS_COOKIES exit=!errorlevel! >> "%LOGFILE%"
    del /q "%TMPFILE%" >nul 2>nul
) else (
    echo      nao consegui ler api\.fpg-admissions-cookies.json - skip >> "%LOGFILE%"
)

REM ── PASSO 3b: CASCATA — disparar update-federados as Quartas, com cookies frescos ──
REM Em vez de um cron fixo (que corria ANTES do refresh diario e falhava com
REM cookies de ~46h), disparamos a Action AQUI, logo apos os Secrets terem
REM sido actualizados e validados. Garante que a Action corre sempre com
REM cookies de segundos. So a Quarta (DayOfWeek=3) para manter a cadencia
REM semanal documentada; o cron tardio em update-federados.yml e so fallback.
echo    - cascata: update-federados ^(so Quarta, com cookies validos^)... >> "%LOGFILE%"
if not "!DG_EXIT!" == "0" (
    echo      scoring.datagolf.pt invalido ^(DG_EXIT=!DG_EXIT!^) - skip trigger federados >> "%LOGFILE%"
    goto :skip_federados
)
for /f %%d in ('powershell -NoProfile -Command "[int](Get-Date).DayOfWeek"') do set DOW=%%d
if not "!DOW!" == "3" (
    echo      hoje nao e Quarta ^(DayOfWeek=!DOW!^) - skip trigger federados >> "%LOGFILE%"
    goto :skip_federados
)
gh workflow run update-federados.yml >> "%LOGFILE%" 2>&1
echo      gh workflow run update-federados exit=!errorlevel! >> "%LOGFILE%"
:skip_federados

:end
echo [%date% %time%] Fim. REFRESH_EXIT=!REFRESH_EXIT! FPG_EXIT=!FPG_EXIT! DG_EXIT=!DG_EXIT! >> "%LOGFILE%"

REM ── PASSO 4: construir sumario de status (comum a email + WhatsApp) ─
REM Uso goto/labels em vez de if/else aninhado para evitar problemas
REM do parser batch com parens e aspas dentro de blocos.

if "!REFRESH_EXIT!" == "2" goto :status_sso_expired
if "!REFRESH_EXIT!" == "3" goto :status_partial
if not "!REFRESH_EXIT!" == "0" goto :status_error

REM REFRESH=0 → avaliar validacoes
if not "!FPG_EXIT!" == "0" goto :status_fpg_failed
if not "!DG_EXIT!" == "0" goto :status_dg_failed
goto :status_ok

:status_ok
set "SUBJECT=[OK] Golf FPG cookies refreshed - 3 de 3 hosts validos"
set "BODY=Task terminou com sucesso em %date% %time%. Refresh 3 de 3 hosts OK, my.fpg.pt OK, scoring.datagolf.pt OK, GitHub Secrets actualizados. Ver log em logs\cookie-refresh.log"
goto :status_done

:status_fpg_failed
set "SUBJECT=[PARCIAL] Golf FPG cookies - my.fpg.pt falhou"
set "BODY=Task em %date% %time% - my.fpg.pt validacao falhou exit=!FPG_EXIT!. Ver log em logs\cookie-refresh.log"
goto :status_done

:status_dg_failed
set "SUBJECT=[PARCIAL] Golf FPG cookies - scoring.datagolf.pt falhou"
set "BODY=Task em %date% %time% - scoring.datagolf.pt validacao falhou exit=!DG_EXIT!. Ver log em logs\cookie-refresh.log"
goto :status_done

:status_sso_expired
set "SUBJECT=[ERRO] Golf FPG - sessao SSO expirou"
set "BODY=Task em %date% %time% falhou - sessao SSO expirou. Accao: abrir Chrome 90 com --user-data-dir=C:\golf-fpg\chrome-profile-automation e fazer login em area.my.fpg.pt/login/"
goto :status_done

:status_partial
set "SUBJECT=[PARCIAL] Golf FPG cookies - alguns hosts falharam"
set "BODY=Task em %date% %time% - REFRESH_EXIT=!REFRESH_EXIT! parcial. Ver log em logs\cookie-refresh.log"
goto :status_done

:status_error
set "SUBJECT=[ERRO] Golf FPG cookies - refresh falhou"
set "BODY=Task em %date% %time% falhou REFRESH=!REFRESH_EXIT! FPG=!FPG_EXIT! DG=!DG_EXIT!. Ver log em logs\cookie-refresh.log"
goto :status_done

:status_done

REM ── Email via Gmail SMTP ─────────────────────────────────────────
if not exist api\.email-config.json goto :email_skipped
echo [%date% %time%] A enviar email: !SUBJECT! >> "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\send-email.ps1 -Subject "!SUBJECT!" -Body "!BODY!" >> "%LOGFILE%" 2>&1
echo      send-email.ps1 exit=!errorlevel! >> "%LOGFILE%"
goto :email_done
:email_skipped
echo [%date% %time%] Email nao configurado api\.email-config.json em falta - skip >> "%LOGFILE%"
:email_done

REM ── WhatsApp via CallMeBot ───────────────────────────────────────
if not exist api\.callmebot-config.json goto :whatsapp_skipped
set "WAMSG=!SUBJECT! - %date% %time%"
echo [%date% %time%] A enviar WhatsApp: !WAMSG! >> "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\send-whatsapp.ps1 -Message "!WAMSG!" >> "%LOGFILE%" 2>&1
echo      send-whatsapp.ps1 exit=!errorlevel! >> "%LOGFILE%"
goto :whatsapp_done
:whatsapp_skipped
echo [%date% %time%] CallMeBot nao configurado api\.callmebot-config.json em falta - skip WhatsApp >> "%LOGFILE%"
:whatsapp_done

echo ============================================================ >> "%LOGFILE%"
exit /b !REFRESH_EXIT!
