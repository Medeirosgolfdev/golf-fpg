@echo off
cd /d "C:\golf-fpg"
echo ============================================================ >> "C:\golf-fpg\logs\scheduled-task.log"
echo [%date% %time%] Scheduled scrape starting >> "C:\golf-fpg\logs\scheduled-task.log"
echo ============================================================ >> "C:\golf-fpg\logs\scheduled-task.log"
node scripts\fpg-scrape-node.js --all --new-only --concurrency 3 >> "C:\golf-fpg\logs\scheduled-task.log" 2>&1
set EXIT=%ERRORLEVEL%
echo [%date% %time%] Exit code: %EXIT% >> "C:\golf-fpg\logs\scheduled-task.log"
if %EXIT% == 0 echo [%date% %time%] Ha novidades >> "C:\golf-fpg\logs\scheduled-task.log"
if %EXIT% == 2 echo [%date% %time%] Sem novidades >> "C:\golf-fpg\logs\scheduled-task.log"
if %EXIT% == 1 echo [%date% %time%] ERRO - investigar logs >> "C:\golf-fpg\logs\scheduled-task.log"
