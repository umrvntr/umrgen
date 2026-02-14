@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   UMRGEN - ZROK Setup (Target: 3088)
echo ========================================
echo.

set ZROK_EXE=zrok.exe
set SHARE_TOKEN=umrgen
set PROD_PORT=3088

REM --- Check if zrok.exe exists ---
if not exist "%ZROK_EXE%" (
  echo ERROR: %ZROK_EXE% not found in current directory!
  echo Please ensure zrok.exe v1.1.10 is available.
  pause
  exit /b 1
)

REM --- Stop EXISTING umrgen zrok processes (duplicates only) ---
echo Checking for existing umrgen zrok processes...
powershell -Command "$processes = Get-CimInstance Win32_Process -Filter \"Name='zrok.exe'\" | Where-Object { $_.CommandLine -like '*share reserved*%SHARE_TOKEN%*' }; if ($processes) { foreach ($p in $processes) { Write-Host \"  Killing PID: $($p.ProcessId) - $($p.CommandLine)\"; Stop-Process -Id $p.ProcessId -Force } } else { Write-Host \"  No umrgen zrok processes found.\" }"

timeout /t 2 >nul

REM --- Start zrok for umrgen ---
echo.
echo Starting zrok share reserved %SHARE_TOKEN% with target http://localhost:%PROD_PORT%...
echo Target: http://localhost:%PROD_PORT%
echo Public URL: https://umrgen.share.zrok.io
echo.
start "UMRGEN ZROK" cmd /k "%ZROK_EXE% share reserved %SHARE_TOKEN% --override-endpoint http://localhost:%PROD_PORT%"

echo.
echo Waiting for zrok to initialize...
timeout /t 3 >nul

REM --- Verify zrok is running ---
tasklist | findstr /i "%ZROK_EXE%" >nul
if %errorlevel%==0 (
  echo SUCCESS: zrok is running for umrgen
) else (
  echo WARNING: zrok may not have started properly.
)

echo.
echo Done! Check the new window for zrok status.
pause
