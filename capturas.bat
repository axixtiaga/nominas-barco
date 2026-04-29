@echo off
REM ==========================================================================
REM  Capturas · Itsas Lagunak — lanzador todo-en-uno
REM  Abre la web (npm run dev), el watcher de Dropbox (npm run watch) y
REM  el navegador en http://localhost:3000
REM ==========================================================================

cd /d "C:\Users\User\Documents\Claude\Projects\Capturas"

REM Lanza la web con su propio título de ventana (para identificarla fácil)
start "Capturas · Web" cmd /k "title Capturas · Web  &&  npm run dev"

REM Espera 3 segundos para que Next.js arranque
timeout /t 3 /nobreak >nul

REM Lanza el watcher con su propio título
start "Capturas · Watcher" cmd /k "title Capturas · Watcher  &&  npm run watch"

REM Espera otros 5 segundos a que la web esté compilada
timeout /t 5 /nobreak >nul

REM Abre el navegador
start "" "http://localhost:3000"

REM Cierra esta ventana — las dos de servicio siguen corriendo
exit
