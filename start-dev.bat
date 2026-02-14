@echo off
title UMRGEN Development Server
color 0A

echo.
echo ========================================
echo  UMRGEN v0.8.3.1 - Development Mode
echo  Retro Terminal AI Image Generator
echo ========================================
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo [!] Dependencies not found. Installing...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully.
    echo.
)

REM Kill existing processes on port 3100
echo [*] Checking port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" 2^>nul') do (
    echo [*] Killing process on port 3100 (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill all Node.js processes to ensure clean start
echo [*] Stopping all Node.js processes...
taskkill /IM node.exe /F >nul 2>&1

REM Wait a moment for processes to fully terminate
timeout /t 2 /nobreak >nul

REM Double-check port 3088 is clear
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3088" 2^>nul') do (
    echo [*] Force killing remaining process on port 3088 (PID: %%a)
    taskkill /PID %%a /F /T >nul 2>&1
)

echo [OK] Ports cleared.
echo.

echo ========================================
echo  Starting Both Servers
echo ========================================
echo [*] Backend: http://localhost:3088
echo [*] Frontend: http://localhost:3100
echo.
echo [!] Press Ctrl+C to stop both servers
echo.
echo ========================================
echo.

REM Set environment variable to disable Turbopack (use webpack instead)
set NEXT_PRIVATE_DEV_TURBOPACK=0

REM Start both backend and frontend in background, then tail logs
start /B node --watch server.mjs
timeout /t 3 /nobreak >nul
npm run dev
