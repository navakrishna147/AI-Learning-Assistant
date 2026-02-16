@echo off
REM ============================================================================
REM  AI LEARNING ASSISTANT — AUTO-START (WINDOWS)
REM ============================================================================
REM
REM  PURPOSE: Starts backend + frontend after system restart / sleep / wake.
REM  USAGE:
REM    Option A: Double-click this file manually
REM    Option B: Add to Windows Task Scheduler (recommended):
REM
REM      1. Open "Task Scheduler" (Win + R → taskschd.msc)
REM      2. Click "Create Basic Task..."
REM      3. Name: "AI Learning Assistant"
REM      4. Trigger: "When I log on"
REM      5. Action: "Start a program"
REM         Program: "%~dp0auto-start.vbs"       (the silent launcher)
REM      6. Finish → right-click task → Properties:
REM         - Check "Run with highest privileges"
REM         - Conditions tab → UNCHECK "Start only if on AC power"
REM      7. Done! Backend + frontend start automatically after login.
REM
REM ============================================================================

setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo ============================================================================
echo   AI Learning Assistant — Auto-Start
echo   %date% %time%
echo ============================================================================
echo.

REM --------------------------------------------------------------------------
REM  Wait for network (Atlas needs DNS)
REM --------------------------------------------------------------------------
echo [1/3] Waiting for network connectivity...
set RETRIES=0
:NETWORK_CHECK
ping -n 1 -w 2000 8.8.8.8 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    set /a RETRIES+=1
    if !RETRIES! GEQ 15 (
        echo   WARNING: Network not available after 30s. Starting anyway...
        goto NETWORK_OK
    )
    echo   Waiting for network... (!RETRIES!/15)
    timeout /t 2 /nobreak >nul
    goto NETWORK_CHECK
)
:NETWORK_OK
echo   OK — Network is available

REM --------------------------------------------------------------------------
REM  Kill any stale processes on ports 5000 / 5173
REM --------------------------------------------------------------------------
echo.
echo [2/3] Cleaning stale processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    echo   Killing stale process on port 5000 (PID %%a)
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo   Killing stale process on port 5173 (PID %%a)
    taskkill /f /pid %%a >nul 2>&1
)
echo   OK — Ports cleared

REM --------------------------------------------------------------------------
REM  Start the dev servers
REM --------------------------------------------------------------------------
echo.
echo [3/3] Starting backend + frontend...
echo   Backend  → http://localhost:5000
echo   Frontend → http://localhost:5173
echo.
echo   Close this window to stop both servers.
echo ============================================================================

npm run dev
