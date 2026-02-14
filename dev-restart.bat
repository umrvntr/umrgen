@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   UMRGEN - DEV Restart (5174)
echo   НЕ трогает PROD 3088!
echo ========================================
echo.

set DEV_PORT=5174
set DEV_PORT_ALT=5175

REM --- Kill ONLY DEV ports (5174, 5175) ---
echo Killing DEV on port %DEV_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%DEV_PORT% " ^| findstr LISTENING 2^>nul') do (
  echo   Killing PID: %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo Killing DEV on port %DEV_PORT_ALT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%DEV_PORT_ALT% " ^| findstr LISTENING 2^>nul') do (
  echo   Killing PID: %%a
  taskkill /F /PID %%a >nul 2>&1
)

timeout /t 1 >nul

echo.
echo Starting DEV on %DEV_PORT%...
start "UMRGEN DEV" cmd /k "npm run dev"

echo.
echo Done! DEV is running on port %DEV_PORT%
echo PROD on 3088 is UNTOUCHED.
pause
