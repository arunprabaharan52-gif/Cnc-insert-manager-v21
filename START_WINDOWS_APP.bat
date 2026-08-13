@echo off
title CNC Insert Manager Pro V21
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not installed. Opening download page...
  start "" "https://nodejs.org/en/download"
  pause
  exit /b
)
if not exist "node_modules" call npm install
if not exist ".env" copy ".env.example" ".env" >nul
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000/login.html"
node server.js
pause
