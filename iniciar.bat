@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call npm install
)
call npm start
