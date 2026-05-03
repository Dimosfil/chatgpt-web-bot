@echo off
echo Stopping chatgpt-web-bot server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3999"') do (
    taskkill /PID %%a /F 2>nul
)
echo Server stopped (if it was running).
pause
