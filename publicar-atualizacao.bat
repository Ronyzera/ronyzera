@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
findstr /c:"SEU_USUARIO" package.json >nul
if not errorlevel 1 (
  echo Antes, abra o package.json e troque SEU_USUARIO pelo seu usuario do GitHub.
  pause
  exit /b 1
)
if "%GH_TOKEN%"=="" (
  echo Cole o token do GitHub com permissao de escrita no repositorio:
  set /p GH_TOKEN=Token:
)
if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call npm install
)
echo Aumentando o numero da versao...
call npm version patch --no-git-tag-version
echo Gerando e publicando a atualizacao...
call npm run publish
echo.
echo Pronto! Os computadores com o app instalado vao receber a atualizacao sozinhos.
pause
