@echo off
echo Checking port 3088...

:: Ищем PID процесса, который занимает порт 3088
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3088') do (
    echo Port 3088 is used by PID %%a
    echo Killing PID %%a...
    taskkill /PID %%a /F
)

echo Starting npm...
npm start

pause
