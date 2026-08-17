@echo off
title Grafinorte - Sistema de Tarefas
cd /d "%~dp0"

echo Verificando se o sistema ja esta rodando...
set "JA_RODANDO="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do set "JA_RODANDO=%%a"

if defined JA_RODANDO (
    echo.
    echo O sistema ja esta rodando neste computador.
    echo Abrindo no navegador...
    start "" "http://localhost:4000"
    timeout /t 3 >nul
    exit /b 0
)

if not exist "server\dist\index.js" (
    echo.
    echo ============================================================
    echo  O sistema ainda nao foi preparado neste computador.
    echo  De um duplo-clique em "preparar-grafinorte.bat" primeiro,
    echo  e depois tente iniciar de novo.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

if not exist "server\data\grafinorte.db" (
    echo.
    echo ============================================================
    echo  O banco de dados ainda nao foi criado neste computador.
    echo  De um duplo-clique em "preparar-grafinorte.bat" primeiro,
    echo  e depois tente iniciar de novo.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo.
echo Iniciando o sistema de tarefas da Grafinorte...
echo NAO FECHE esta janela enquanto a equipe estiver usando o sistema.
echo Para parar o sistema, de um duplo-clique em "parar-grafinorte.bat".
echo.

start "" /min cmd /c "timeout /t 3 >nul && start "" "http://localhost:4000""

call npm start

echo.
echo O sistema foi encerrado.
pause
