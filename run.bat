@echo off
setlocal

set "ROOT=%~dp0"

echo Starting Sports Bot backend and frontend...

start "Sports Bot Backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"
start "Sports Bot Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo Done. Two terminals were opened.
exit /b 0
