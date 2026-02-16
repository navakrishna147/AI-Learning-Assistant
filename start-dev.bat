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
echo [1/4] Checking MongoDB Windows Service...
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
        echo   NOTE: MongoDB service not found. Using Atlas cloud DB if configured.
    )
)

REM --------------------------------------------------------------------------
REM  Step 2: Kill zombie Node processes on backend+frontend ports
REM          (prevents EADDRINUSE after unclean shutdown / laptop reboot)
REM --------------------------------------------------------------------------
echo.
echo [2/5] Checking for stale processes on ports 5000 and 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do (
    echo   Found process %%a on port 5000 - killing...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    echo   Found process %%a on port 5173 - killing...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
)
echo   OK - Ports 5000 and 5173 are clear

REM --------------------------------------------------------------------------
REM  Step 3: Verify .env files exist
REM --------------------------------------------------------------------------
echo.
echo [3/5] Checking configuration...
if not exist "backend\.env" (
    echo   ERROR: backend\.env not found!  Copy backend\.env.example to backend\.env
    pause
    exit /b 1
)
echo   OK - backend\.env found

REM --------------------------------------------------------------------------
REM  Step 4: Verify node_modules and concurrently installed
REM --------------------------------------------------------------------------
echo.
echo [4/5] Checking dependencies...
if not exist "node_modules" (
    echo   Installing root dependencies ^(concurrently^)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo   ERROR: npm install failed at project root!
        pause
        exit /b 1
    )
)
if not exist "backend\node_modules" (
    echo   Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    if %ERRORLEVEL% NEQ 0 (
        echo   ERROR: npm install failed in backend!
        pause
        exit /b 1
    )
)
if not exist "frontend\node_modules" (
    echo   Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    if %ERRORLEVEL% NEQ 0 (
        echo   ERROR: npm install failed in frontend!
        pause
        exit /b 1
    )
)
echo   OK - All dependencies installed

REM --------------------------------------------------------------------------
REM  Step 5: Start backend + frontend with concurrently
REM --------------------------------------------------------------------------
echo.
echo [5/5] Starting backend and frontend...
echo.
echo   Backend  = http://127.0.0.1:5000
echo   Frontend = http://localhost:5173
echo.
echo   Press Ctrl+C to stop both servers.
echo ============================================================================
echo.

npm run dev
