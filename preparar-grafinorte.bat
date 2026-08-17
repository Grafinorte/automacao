@echo off
title Grafinorte - Preparando o sistema
cd /d "%~dp0"

echo ============================================================
echo  Preparando o sistema de tarefas da Grafinorte
echo  Isso so precisa ser feito uma vez neste computador.
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo ERRO: o Node.js nao esta instalado neste computador.
    echo Baixe e instale em: https://nodejs.org/
    echo Depois, rode este arquivo de novo.
    echo.
    pause
    exit /b 1
)

echo [1/5] Instalando dependencias ^(isso pode levar alguns minutos^)...
call npm install
if errorlevel 1 (
    echo.
    echo ERRO ao instalar as dependencias. Veja a mensagem acima.
    pause
    exit /b 1
)

if not exist "server\.env" (
    echo [2/5] Criando configuracao inicial do servidor...
    copy "server\.env.example" "server\.env" >nul
    powershell -NoProfile -Command "$s=-join((48..57)+(97..102)|Get-Random -Count 64|ForEach-Object{[char]$_});(Get-Content 'server\.env')-replace 'JWT_SECRET=.*',('JWT_SECRET=\"'+$s+'\"')|Set-Content 'server\.env'"
) else (
    echo [2/5] Configuracao do servidor ja existe, mantendo como esta.
)

echo [3/5] Criando/atualizando o banco de dados...
pushd server
call npx prisma migrate deploy
set MIGRATE_ERR=%errorlevel%
popd
if not "%MIGRATE_ERR%"=="0" (
    echo.
    echo ERRO ao preparar o banco de dados. Veja a mensagem acima.
    pause
    exit /b 1
)

echo [4/5] Criando o usuario administrador e os dados iniciais...
call npm run db:seed

echo [5/5] Gerando a versao final do sistema...
call npm run build
if errorlevel 1 (
    echo.
    echo ERRO ao gerar a versao final. Veja a mensagem acima.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Tudo pronto!
echo  Agora de um duplo-clique em "iniciar-grafinorte.bat" para
echo  ligar o sistema.
echo ============================================================
echo.
pause
