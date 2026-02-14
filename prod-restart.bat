@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   UMRGEN - PROD Restart (3088)
echo ========================================
echo.

set PROD_PORT=3088

REM --- Check if PROD is already running ---
netstat -ano | findstr ":%PROD_PORT% " | findstr LISTENING >nul
if %errorlevel%==0 (
  echo PROD is already running on %PROD_PORT%. Nothing to do.
  echo.
  echo Current processes on %PROD_PORT%:
  netstat -ano | findstr ":%PROD_PORT% " | findstr LISTENING
  pause
  exit /b 0
)

REM --- PROD is NOT running, start it ---
echo PROD is NOT running on %PROD_PORT%. Starting...
start "UMRGEN PROD" cmd /k "npm run start"

echo.
echo Waiting for PROD to start...
timeout /t 3 >nul

REM --- Verify PROD is now running ---
netstat -ano | findstr ":%PROD_PORT% " | findstr LISTENING >nul
if %errorlevel%==0 (
  echo SUCCESS: PROD is now running on %PROD_PORT%
) else (
  echo WARNING: PROD may not have started properly.
)

echo.
echo Done!
pause
