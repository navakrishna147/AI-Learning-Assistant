@echo off
REM ============================================================================
REM  RESILIENT BACKEND SERVER — Auto-restarts on crash
REM ============================================================================
REM  Use this instead of "nodemon server.js" if you experience repeated crashes
REM  after sleep/wake. This script wraps the server in a restart loop.
REM
REM  Usage: cd backend && dev-resilient.bat
REM ============================================================================

setlocal

echo.
echo  Backend Server (resilient mode) — auto-restart on crash
echo  Press Ctrl+C twice to stop permanently.
echo ========================================================
echo.

:RESTART
echo [%date% %time%] Starting server...
node server.js

echo.
echo [%date% %time%] Server exited with code %ERRORLEVEL%.
echo Restarting in 5 seconds... (Ctrl+C to cancel)
timeout /t 5 /nobreak >nul
echo.
goto RESTART
