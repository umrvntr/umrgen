@echo off
title UMRGEN Port Cleanup
color 0E

echo.
echo ========================================
echo  UMRGEN - Port Cleanup Utility
echo ========================================
echo.

echo [*] Killing all processes on port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" 2^>nul') do (
    echo     Killing PID: %%a
    taskkill /PID %%a /F /T >nul 2>&1
)

echo [*] Killing all processes on port 3088...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3088" 2^>nul') do (
    echo     Killing PID: %%a
    taskkill /PID %%a /F /T >nul 2>&1
)

echo.
echo [OK] Cleanup complete!
echo.
echo Ports 3088 and 3100 are now free.
echo You can now run start-dev.bat
echo.

pause
