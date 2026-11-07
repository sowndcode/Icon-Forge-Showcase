@echo off
rem Double-click to start Icon Forge Showcase (a local desktop app - no browser, no internet needed).
title Icon Forge Showcase
cd /d "%~dp0"

if exist "release\IconForgeShowcase-win32-x64\IconForgeShowcase.exe" (
    start "" "release\IconForgeShowcase-win32-x64\IconForgeShowcase.exe"
    exit /b 0
)

where node >nul 2>nul || goto :nonode
if not exist "node_modules\electron" (
    echo First launch: installing, this takes a minute...
    call npm ci || goto :error
)
rem newer npm versions skip Electron's download step during install: fetch the app runtime if it's missing
if not exist "node_modules\electron\dist\electron.exe" (
    echo Downloading the Electron runtime, this takes a minute...
    call node node_modules\electron\install.js || goto :error
)
call node scripts\ensure-build.mjs || goto :error
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:nonode
echo.
echo Node.js was not found. Install the LTS version from https://nodejs.org/
echo then double-click this file again.
pause
exit /b 1

:error
echo.
echo Something went wrong starting Icon Forge Showcase. See the messages above.
pause
exit /b 1
