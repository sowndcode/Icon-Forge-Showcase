@echo off
rem Builds a standalone app: release\IconForgeShowcase-win32-x64\IconForgeShowcase.exe (copy that whole folder to share it).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required to build. & pause & exit /b 1)
if not exist "node_modules\electron" call npm ci
call npm run package || (echo Build failed. & pause & exit /b 1)
echo.
echo Done: release\IconForgeShowcase-win32-x64\IconForgeShowcase.exe
pause
