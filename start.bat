@echo off
chcp 65001 > nul
title LINE Netting App - Local Dev

echo ============================================
echo   LINE Netting App  [Local Development]
echo ============================================
echo   API  : http://localhost:3000
echo   Web  : http://localhost:5173
echo   ngrok: http://localhost:4040
echo ============================================
echo.

set ROOT=%~dp0
set PNPM=C:\Users\satos\AppData\Roaming\npm\pnpm.cmd

echo [1/3] Starting API server...
start "API Server" /d "%ROOT%apps\api" cmd /k "%PNPM% dev"

timeout /t 2 /nobreak > nul

echo [2/3] Starting Web server...
start "Web Server" /d "%ROOT%apps\web" cmd /k "%PNPM% dev"

timeout /t 3 /nobreak > nul

echo [3/3] Starting ngrok...
start "ngrok" cmd /k ngrok http 5173

echo.
echo All servers started!
echo.
echo [Production URL]
echo   https://line-netting-app.vercel.app
echo.
cmd /k
