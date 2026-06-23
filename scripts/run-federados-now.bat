@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  run-federados-now.bat
REM  ---------------------
REM  Atalho MANUAL para correr o refresh dos ~16.957 federados quando quiseres
REM  (qualquer dia, nao so a Quarta). Faz duas coisas, por esta ordem:
REM    1. Refresca os cookies localmente + empurra para os GitHub Secrets
REM       (reusa run-cookie-refresh.bat com FORCE=1 para garantir cookies de
REM        segundos, mesmo que ja tenham sido refrescados hoje).
REM    2. Dispara a Action update-federados.yml na cloud (gh workflow run).
REM
REM  Uso: duplo-clique no Explorer, ou ".\scripts\run-federados-now.bat".
REM  Para SALTAR o refresh de cookies (usar os que ja estao no Secret):
REM    set SKIP_REFRESH=1 && .\scripts\run-federados-now.bat
REM ═══════════════════════════════════════════════════════════════════════

setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
cd /d "%~dp0\.."

echo.
echo === Correr federados agora (manual) ===
echo.

REM ── PASSO 1: garantir cookies frescos (a menos que SKIP_REFRESH=1) ──
if "%SKIP_REFRESH%" == "1" (
    echo [1/2] SKIP_REFRESH=1 - a saltar refresh de cookies.
) else (
    echo [1/2] A refrescar cookies + GitHub Secrets...
    set FORCE=1
    call "%~dp0run-cookie-refresh.bat"
    echo       refresh terminou exit=!errorlevel!
)

REM ── PASSO 2: confirmar gh e disparar a Action ──
echo [2/2] A disparar a Action update-federados.yml...

where gh >nul 2>nul
if errorlevel 1 (
    echo       ERRO: gh CLI nao instalado. Instala em https://cli.github.com/
    goto :fail
)
gh auth status >nul 2>nul
if errorlevel 1 (
    echo       ERRO: gh nao autenticado. Corre 'gh auth login'.
    goto :fail
)

gh workflow run update-federados.yml
if errorlevel 1 goto :fail

echo.
echo OK Action disparada. Acompanha em:
echo    https://github.com/Medeirosgolfdev/golf-fpg/actions/workflows/update-federados.yml
echo.
echo (ou no terminal: gh run watch)
goto :done

:fail
echo.
echo FALHOU - ver mensagens acima.
exit /b 1

:done
endlocal
exit /b 0
