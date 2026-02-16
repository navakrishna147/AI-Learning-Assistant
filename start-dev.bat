@echo off
REM ============================================================================
REM  AI LEARNING ASSISTANT - ONE-CLICK DEV STARTUP
REM ============================================================================
REM  Usage: Double-click this file or run from terminal
REM  Starts backend + frontend together using concurrently
REM ============================================================================

setlocal

echo.
echo ============================================================================
echo   AI Learning Assistant - Development Startup
echo ============================================================================
echo.

REM Navigate to project root (where this script lives)
cd /d "%~dp0"

REM --------------------------------------------------------------------------
REM  Step 1: Verify MongoDB is running (Windows Service)
REM --------------------------------------------------------------------------
echo [1/3] Checking MongoDB Windows Service...
sc query MongoDB >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    sc query MongoDB | find "RUNNING" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   OK - MongoDB service is RUNNING
    ) else (
        echo   WARNING - MongoDB service exists but NOT running
        echo   Attempting to start MongoDB service...
        net start MongoDB >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
            echo   OK - MongoDB service started successfully
            timeout /t 3 /nobreak >nul
        ) else (
            echo   Could not auto-start MongoDB. Trying mongod directly...
            tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I "mongod.exe" >NUL
            if %ERRORLEVEL% NEQ 0 (
                echo   NOTE: MongoDB not detected. Backend will retry connection automatically.
            ) else (
                echo   OK - mongod.exe is already running
            )
        )
    )
) else (
    REM Service doesn't exist, check for running process
    tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I "mongod.exe" >NUL
    if %ERRORLEVEL% EQU 0 (
        echo   OK - mongod.exe is running
    ) else (
        echo   NOTE: MongoDB service not found. Backend will retry connection automatically.
    )
)

REM --------------------------------------------------------------------------
REM  Step 2: Verify .env files exist
REM --------------------------------------------------------------------------
echo.
echo [2/3] Checking configuration...
if not exist "backend\.env" (
    echo   ERROR: backend\.env not found!  Copy backend\.env.example to backend\.env
    pause
    exit /b 1
)
echo   OK - backend\.env found

REM --------------------------------------------------------------------------
REM  Step 3: Start backend + frontend with concurrently
REM --------------------------------------------------------------------------
echo.
echo [3/3] Starting backend and frontend...
echo.
echo   Backend  = http://127.0.0.1:5000
echo   Frontend = http://localhost:5173
echo.
echo   Press Ctrl+C to stop both servers.
echo ============================================================================
echo.

npm run dev
