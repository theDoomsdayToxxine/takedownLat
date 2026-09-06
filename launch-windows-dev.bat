@echo off
setlocal
where node >nul 2>nul || (echo Node.js no esta instalado. Descargalo desde https://nodejs.org/ && pause && exit /b 1)
if not exist node_modules (npm install)
npm run start
