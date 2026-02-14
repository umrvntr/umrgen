@echo off
title UMRGEN v0.9.0 - Startup
color 0A

echo.
echo ========================================
echo   UMRGEN v0.9.0 - STARTUP SEQUENCE
echo ========================================
echo.

echo [*] Killing processes on port 3088...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3088 2^>nul') do (
    echo     Terminating PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo [*] Killing processes on port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3100 2^>nul') do (
    echo     Terminating PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo [*] Killing processes on port 5174...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174 2^>nul') do (
    echo     Terminating PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo [OK] Ports cleared.
echo.
timeout /t 1 /nobreak >nul

echo [*] Starting UMRGEN development server...
echo.
echo ========================================
echo   Server: http://localhost:3088
echo   UI:     http://localhost:5174
echo ========================================
echo.

npm run dev
