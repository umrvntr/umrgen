@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   UMRGEN - DEV restart + ensure PROD 3088
echo ========================================
echo.

set DEV_PORT=5174
set PROD_PORT=3088

REM --- Ensure PROD is listening ---
echo Checking PROD port %PROD_PORT%...
netstat -ano | findstr ":%PROD_PORT% " | findstr LISTENING >nul
if %errorlevel%==0 (
  echo PROD is already running on %PROD_PORT%. Keeping it.
) else (
  echo PROD is NOT running on %PROD_PORT%. Starting it...
  REM ВАЖНО: замени команду ниже на твою реальную "prod" команду
  start "UMRGEN PROD" cmd /k "npm run preview -- --host 127.0.0.1 --port %PROD_PORT%"
)

echo.
REM --- Restart DEV ---
echo Killing DEV processes on port %DEV_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%DEV_PORT% ^| findstr LISTENING') do (
  echo   Killing PID: %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo Starting DEV on %DEV_PORT%...
start "UMRGEN DEV" cmd /k "npm run dev -- --port %DEV_PORT%"

echo Done.
