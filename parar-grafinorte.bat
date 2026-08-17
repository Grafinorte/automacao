@echo off
title Grafinorte - Parar o sistema
cd /d "%~dp0"

set "PID_ENCONTRADO="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do set "PID_ENCONTRADO=%%a"

if not defined PID_ENCONTRADO (
    echo O sistema nao estava rodando neste computador.
    echo.
    pause
    exit /b 0
)

echo Parando o sistema ^(processo %PID_ENCONTRADO%^)...
taskkill /PID %PID_ENCONTRADO% /F >nul 2>nul

echo.
echo Sistema parado. Pode fechar esta janela.
echo.
pause
