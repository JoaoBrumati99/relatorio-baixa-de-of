@echo off
cd /d "%~dp0"
node --version >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 22.13 ou superior.
  pause
  exit /b 1
)
node preview-server.js
pause
