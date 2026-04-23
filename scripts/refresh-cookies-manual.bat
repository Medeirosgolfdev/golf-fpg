@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  refresh-cookies-manual.bat
REM  --------------------------
REM  Atalho para correr run-cookie-refresh.bat em modo forcado
REM  (bypass dedup - serve para invocacoes manuais via desktop shortcut
REM  ou funcao PowerShell 'refresh-cookies').
REM
REM  Output: logs\cookie-refresh.log + email + WhatsApp (se configurados)
REM ═══════════════════════════════════════════════════════════════════════

set FORCE=1
call "%~dp0run-cookie-refresh.bat"
