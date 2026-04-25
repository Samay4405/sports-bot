@echo off
setlocal

echo Stopping Sports Bot terminals...

for %%T in ("Sports Bot Backend" "Sports Bot Frontend") do (
  taskkill /FI "WINDOWTITLE eq %%~T" /T /F >nul 2>&1
)

echo Done.
exit /b 0
