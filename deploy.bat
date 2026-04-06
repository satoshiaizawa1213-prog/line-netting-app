@echo off
chcp 65001 > nul
title LINE Netting App - Deploy to Vercel

echo ============================================
echo   LINE Netting App  [Deploy to Vercel]
echo ============================================
echo.

cd /d %~dp0

:: コミットメッセージを入力
set /p MSG="Commit message (Enter to skip git commit): "

if not "%MSG%"=="" (
  echo.
  echo [1/2] Pushing to GitHub...
  git add .
  git commit -m "%MSG%"
  git push
  if errorlevel 1 (
    echo ERROR: git push failed.
    pause
    exit /b 1
  )
  echo Done.
  echo.
) else (
  echo Skipping git commit.
  echo.
)

echo [2/2] Deploying to Vercel...
vercel --prod

echo.
echo ============================================
echo   Deploy complete!
echo   https://line-netting-app.vercel.app
echo ============================================
echo.
pause
