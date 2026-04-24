# chatgpt-web-bot
Система для общения с чатом жпт через браузер по средством скриптов

1) Установка
mkdir chatgpt-web-bot
cd chatgpt-web-bot
npm init -y
npm i playwright
npx playwright install chromium

Настройка браузера
& "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\$env:USERNAME\AppData\Local\Google\Chrome\User Data"
& "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="D:\AI\chatgpt-web-bot\chrome-debug-profile"

taskkill /F /IM chrome.exe
& "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="D:\AI\chatgpt-web-bot\chrome-debug-profile"

Проверка, что всё ок
http://127.0.0.1:9222
PS
Invoke-WebRequest http://127.0.0.1:9222/json/version

если блокировка политики дебага 
chrome://policy/ - проверить DevToolsAvailability DeveloperToolsAvailability RemoteDebuggingAllowed
Get-ItemProperty "HKLM:\Software\Policies\Google\Chrome" -ErrorAction SilentlyContinue
Get-ItemProperty "HKCU:\Software\Policies\Google\Chrome" -ErrorAction SilentlyContinue
