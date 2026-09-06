@echo off
setlocal
where node >nul 2>nul || (echo Node.js 22+ es necesario. Instala Node.js y vuelve a ejecutar este archivo.&&pause&&exit /b 1)
npm install
npm run dist:win
start "" "%~dp0dist"
