@echo off
title PyriteLab
cd /d "%~dp0"

:: Check node_modules
if not exist "node_modules\" (
    echo [PyriteLab] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [PyriteLab] Starting dev server + Electron...
echo.

:: concurrently runs vite + electron in parallel, -k kills both on exit
call npx concurrently -k "npm run dev" "cross-env ELECTRON_START_URL=http://localhost:37123 electron ."
